/*
 * LIL - Little Interpreted Language
 * Copyright (C) 2010 Kostas Michalopoulos
 *
 * This software is provided 'as-is', without any express or implied
 * warranty.  In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 * 1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 * 2. Altered source versions must be plainly marked as such, and must not be
 *    misrepresented as being the original software.
 * 3. This notice may not be removed or altered from any source distribution.
 *
 * Kostas Michalopoulos <badsector@runtimeterror.com>
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lil.h"

static int running = 1;
static int exit_code = 0;

static void do_exit(lil_t lil, lil_value_t val)
{
    running = 0;
    exit_code = (int)lil_to_integer(val);
}

static int repl(void)
{
    char buffer[16384];
    lil_t lil = lil_new();
    printf("Little Interpreted Language Interactive Shell\n");
    lil_callback(lil, LIL_CALLBACK_EXIT, (lil_callback_proc_t)do_exit);
    while (running) {
        lil_value_t result;
        const char* strres;
        const char* err_msg;
        size_t pos;
        buffer[0] = 0;
        printf("# ");
        if (!fgets(buffer, 16384, stdin)) break;
        result = lil_parse(lil, buffer, 0, 1);
        strres = lil_to_string(result);
        if (strres[0])
            printf(" -> %s\n", strres);
        lil_free_value(result);
        if (lil_error(lil, &err_msg, &pos)) {
            printf("error at %i: %s\n", (int)pos, err_msg);
        }
    }
    lil_free(lil);
    return exit_code;
}

static int nonint(int argc, const char* argv[])
{
    lil_t lil = lil_new();
    const char* filename = argv[1];
    const char* err_msg;
    size_t pos;
    lil_list_t arglist = lil_alloc_list();
    lil_value_t args, result;
    char* tmpcode;
    int i;
    for (i=2; i<argc; i++) {
        lil_list_append(arglist, lil_alloc_string(argv[i]));
    }
    args = lil_list_to_value(arglist, 1);
    lil_free_list(arglist);
    lil_set_var(lil, "argv", args, LIL_SETVAR_GLOBAL);
    lil_free_value(args);
    tmpcode = malloc(strlen(filename) + 256);
    sprintf(tmpcode, "set __lilmain:code__ [read {%s}]\nif [streq $__lilmain:code__ ''] {print There is no code in the file or the file does not exist} {eval $__lilmain:code__}\n", filename);
    result = lil_parse(lil, tmpcode, 0, 1);
    free(tmpcode);
    lil_free_value(result);
    if (lil_error(lil, &err_msg, &pos)) {
        fprintf(stderr, "lil: error at %i: %s\n", (int)pos, err_msg);
    }
    lil_free(lil);
    return exit_code;
}

int main(int argc, const char* argv[])
{
    if (argc < 2) return repl();
    else return nonint(argc, argv);
}
