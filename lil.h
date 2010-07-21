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

#include <stdint.h>

#define LIL_SETVAR_GLOBAL 0
#define LIL_SETVAR_LOCAL 1
#define LIL_SETVAR_LOCAL_NEW 2

typedef struct _lil_value_t* lil_value_t;
typedef struct _lil_func_t* lil_func_t;
typedef struct _lil_var_t* lil_var_t;
typedef struct _lil_env_t* lil_env_t;
typedef struct _lil_list_t* lil_list_t;
typedef struct _lil_t* lil_t;
typedef lil_value_t (*lil_func_proc_t)(lil_t lil, size_t argc, lil_value_t* argv);

lil_t lil_new(void);
void lil_free(lil_t lil);

int lil_register(lil_t lil, const char* name, lil_func_proc_t proc);

lil_value_t lil_parse(lil_t lil, const char* code, size_t codelen, int funclevel);
lil_value_t lil_parse_value(lil_t lil, lil_value_t val, int funclevel);

const char* lil_to_string(lil_value_t val);
double lil_to_double(lil_value_t val);
int64_t lil_to_integer(lil_value_t val);
int lil_to_boolean(lil_value_t val);

lil_value_t lil_alloc_string(const char* str);
lil_value_t lil_alloc_double(double num);
lil_value_t lil_alloc_integer(int64_t num);
void lil_free_value(lil_value_t val);

lil_value_t lil_clone_value(lil_value_t src);
int lil_append_char(lil_value_t val, char ch);
int lil_append_string(lil_value_t val, const char* s);
int lil_append_val(lil_value_t val, lil_value_t v);

lil_list_t lil_alloc_list(void);
void lil_free_list(lil_list_t list);
void lil_list_append(lil_list_t list, lil_value_t val);
size_t lil_list_size(lil_list_t list);
lil_value_t lil_list_get(lil_list_t list, size_t index);
lil_value_t lil_list_to_value(lil_list_t list, int do_escape);

lil_list_t lil_subst_to_list(lil_t lil, lil_value_t code);
lil_value_t lil_subst_to_value(lil_t lil, lil_value_t code);

lil_env_t lil_alloc_env(lil_env_t parent);
void lil_free_env(lil_env_t env);
lil_env_t lil_push_env(lil_t lil);
void lil_pop_env(lil_t lil);

lil_var_t lil_set_var(lil_t lil, const char* name, lil_value_t val, int local);
lil_value_t lil_get_var(lil_t lil, const char* name);

lil_value_t lil_eval_expr(lil_t lil, lil_value_t code);

#endif
