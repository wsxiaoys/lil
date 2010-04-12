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

#ifndef __LIL_H_INCLUDED__
#define __LIL_H_INCLUDED__

typedef struct _lil_value_t* lil_value_t;
typedef struct _lil_command_t* lil_command_t;
typedef struct _lil_t* lil_t;
typedef lil_value_t (*lil_command_proc_t)(lil_t lil, size_t argc, lil_value_t* argv);

lil_t lil_new(void);
void lil_free(lil_t lil);

int lil_register(lil_t lil, const char* name, lil_command_proc_t proc);

lil_value_t lil_parse(lil_t lil, const char* code);

const char* lil_to_string(lil_value_t val);
void lil_release(lil_value_t val);

#endif
