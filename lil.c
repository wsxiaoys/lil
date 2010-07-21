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

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <math.h>
#include "lil.h"

/* note: static lil_xxx functions might become public later */

struct _lil_value_t
{
	size_t l;
	char* d;
};

struct _lil_var_t
{
	char* n;
	lil_value_t v;
};

struct _lil_env_t
{
	struct _lil_env_t* parent;
	lil_var_t* var;
	size_t vars;
};

struct _lil_list_t
{
	lil_value_t* v;
	size_t c;
};

struct _lil_func_t
{
	char* name;
	lil_value_t code;
	lil_list_t argnames;
	lil_func_proc_t proc;
};

struct _lil_t
{
	const char* code; /* need save on parse */
	size_t clen; /* need save on parse */
	size_t head; /* need save on parse */
	lil_func_t* cmd;
	size_t cmds;
	lil_env_t env;
	lil_env_t rootenv;
	lil_value_t empty;
	int breakrun;
	lil_value_t retval;
};

typedef struct _expreval_t
{
	const char* code;
	size_t len, head;
	int64_t ival;
	double dval;
	int type;
	int error;
} expreval_t;

static lil_value_t next_word(lil_t lil);
static void register_stdcmds(lil_t lil);

static char* strclone(const char* s)
{
	size_t len = strlen(s) + 1;
	char* ns = malloc(len);
	if (!ns) return NULL;
	memcpy(ns, s, len);
	return ns;
}

static lil_value_t alloc_value(const char* str)
{
	lil_value_t val = calloc(1, sizeof(struct _lil_value_t));
	if (!val) return NULL;
	if (str) {
		val->l = strlen(str);
		val->d = malloc(val->l + 1);
		if (!val->d) {
			free(val);
			return NULL;
		}
		memcpy(val->d, str, val->l + 1);
	} else {
		val->l = 0;
		val->d = NULL;
	}
	return val;
}

lil_value_t lil_clone_value(lil_value_t src)
{
	lil_value_t val;
	if (!src) return NULL;
	val = calloc(1, sizeof(struct _lil_value_t));
	if (!val) return NULL;
	val->l = src->l;
	if (src->l) {
		val->d = malloc(val->l + 1);
		if (!val->d) {
			free(val);
			return NULL;
		}
		memcpy(val->d, src->d, val->l + 1);
	} else val->d = NULL;
	return val;
}

int lil_append_char(lil_value_t val, char ch)
{
	char* new = realloc(val->d, val->l + 2);
	if (!new) return 0;
	new[val->l++] = ch;
	new[val->l] = 0;
	val->d = new;
	return 1;
}

int lil_append_string(lil_value_t val, const char* s)
{
    char* new;
    size_t len;
    if (!s || !s[0]) return 1;
    len = strlen(s);
    new = realloc(val->d, val->l + len + 1);
    if (!new) return 0;
    memcpy(new + val->l, s, len + 1);
    val->l += len;
    val->d = new;
    return 1;
}

int lil_append_val(lil_value_t val, lil_value_t v)
{
	char* new;
	if (!v || !v->l) return 1;
	new = realloc(val->d, val->l + v->l + 1);
	if (!new) return 0;
	memcpy(new + val->l, v->d, v->l + 1);
	val->l += v->l;
	val->d = new;
	return 1;
}

void lil_free_value(lil_value_t val)
{
	if (!val) return;
	free(val->d);
	free(val);
}

lil_list_t lil_alloc_list(void)
{
	lil_list_t list = calloc(1, sizeof(struct _lil_list_t));
	list->v = NULL;
	list->c = 0;
	return list;
}

void lil_free_list(lil_list_t list)
{
	size_t i;
	for (i=0; i<list->c; i++) lil_free_value(list->v[i]);
	free(list->v);
	free(list);
}

void lil_list_append(lil_list_t list, lil_value_t val)
{
	lil_value_t* nv = realloc(list->v, sizeof(lil_value_t)*(list->c + 1));
	if (!nv) return;
	list->v = nv;
	nv[list->c++] = val;
}

size_t lil_list_size(lil_list_t list)
{
    return list->c;
}

lil_value_t lil_list_get(lil_list_t list, size_t index)
{
    return index >= list->c ? NULL : list->v[index];
}

static int needs_escape(const char* str)
{
    size_t i;
    if (!str || !str[0]) return 1;
    for (i=0; str[i]; i++)
        if (ispunct(str[i]) || isspace(str[i])) return 1;
    return 0;
}

lil_value_t lil_list_to_value(lil_list_t list, int do_escape)
{
	lil_value_t val = alloc_value(NULL);
	size_t i;
	for (i=0; i<list->c; i++) {
	    int escape = do_escape ? needs_escape(lil_to_string(list->v[i])) : 0;
		if (i) lil_append_char(val, ' ');
		if (escape) lil_append_char(val, '{');
		lil_append_val(val, list->v[i]);
		if (escape) lil_append_char(val, '}');
	}
	return val;
}

lil_env_t lil_alloc_env(lil_env_t parent)
{
	lil_env_t env = calloc(1, sizeof(struct _lil_env_t));
	env->parent = parent;
	return env;
}

void lil_free_env(lil_env_t env)
{
	size_t i;
	for (i=0; i<env->vars; i++) {
		free(env->var[i]->n);
		lil_free_value(env->var[i]->v);
		free(env->var[i]);
	}
	free(env->var);
	free(env);
}

static lil_var_t lil_find_var(lil_t lil, lil_env_t env, const char* name)
{
	if (env->vars > 0) {
		size_t i = env->vars - 1;
		while (1) {
			if (!strcmp(env->var[i]->n, name)) return env->var[i];
			if (!i) break;
			i--;
		}
	}

    return env == lil->rootenv ? NULL : lil_find_var(lil, lil->rootenv, name);
}

static lil_func_t find_cmd(lil_t lil, const char* name)
{
	if (lil->cmds > 0) {
		size_t i = lil->cmds - 1;
		while (1) {
			if (!strcmp(lil->cmd[i]->name, name)) return lil->cmd[i];
			if (!i) break;
			i--;
		}
	}
	return NULL;
}

static lil_func_t add_func(lil_t lil, const char* name)
{
	lil_func_t cmd;
	lil_func_t* ncmd;
	cmd = find_cmd(lil, name);
	if (cmd) return cmd;
	cmd = calloc(1, sizeof(struct _lil_func_t));
	cmd->name = strclone(name);
	ncmd = realloc(lil->cmd, sizeof(lil_func_t)*(lil->cmds + 1));
	if (!ncmd) {
		free(cmd);
		return NULL;
	}
	lil->cmd = ncmd;
	ncmd[lil->cmds++] = cmd;
	return cmd;
}

int lil_register(lil_t lil, const char* name, lil_func_proc_t proc)
{
	lil_func_t cmd = add_func(lil, name);
	if (!cmd) return 0;
	cmd->proc = proc;
	return 1;
}

lil_var_t lil_set_var(lil_t lil, const char* name, lil_value_t val, int local)
{
	lil_var_t* nvar;
	lil_env_t env = local == LIL_SETVAR_GLOBAL ? lil->rootenv : lil->env;
	if (local != LIL_SETVAR_LOCAL_NEW) {
		lil_var_t var = lil_find_var(lil, lil->env, name);
		if (var) {
			lil_free_value(var->v);
			var->v = lil_clone_value(val);
			return var;
		}
	}

	nvar = realloc(env->var, sizeof(lil_var_t)*(env->vars + 1));
	if (!nvar) {
		/* TODO: report memory error */
		return NULL;
	}
	env->var = nvar;
	nvar[env->vars] = calloc(1, sizeof(struct _lil_var_t));
	nvar[env->vars]->n = strclone(name);
	nvar[env->vars]->v = lil_clone_value(val);
	return nvar[env->vars++];
}

lil_value_t lil_get_var(lil_t lil, const char* name)
{
	lil_var_t var = lil_find_var(lil, lil->env, name);
	return var ? var->v : lil->empty;
}

lil_env_t lil_push_env(lil_t lil)
{
	lil_env_t env = lil_alloc_env(lil->env);
	lil->env = env;
	return env;
}

void lil_pop_env(lil_t lil)
{
	if (lil->env->parent) {
		lil_env_t next = lil->env->parent;
		lil_free_env(lil->env);
		lil->env = next;
	}
}

lil_t lil_new(void)
{
	lil_t lil = calloc(1, sizeof(struct _lil_t));
	lil->rootenv = lil->env = lil_alloc_env(NULL);
	lil->empty = alloc_value(NULL);
	register_stdcmds(lil);
	return lil;
}

static int islilspecial(char ch)
{
	return ch == ';' || ch == '$' || ch == '[' || ch == ']' || ch == '{' || ch == '}' || ch == '"' || ch == '\'';
}

static int ateol(lil_t lil)
{
	return lil->code[lil->head] == '\n' || lil->code[lil->head] == '\r' || lil->code[lil->head] == ';';
}

static void skip_spaces(lil_t lil)
{
    while (lil->head < lil->clen && (lil->code[lil->head] == '\\' || lil->code[lil->head] == '#' || (isspace(lil->code[lil->head]) && !(lil->code[lil->head] == '\r' || lil->code[lil->head] == '\n')))) {
        if (lil->code[lil->head] == '#') {
            while (lil->head < lil->clen && !ateol(lil)) lil->head++;
        } else if (lil->code[lil->head] == '\\' && (lil->code[lil->head + 1] == '\r' || lil->code[lil->head + 1] == '\n')) {
            lil->head++;
            while (lil->head < lil->clen && ateol(lil)) lil->head++;
        } else lil->head++;
    }
}

static lil_value_t get_bracketpart(lil_t lil)
{
	size_t cnt = 1;
	lil_value_t val, cmd = alloc_value(NULL);
	lil->head++;
	while (lil->head < lil->clen) {
		if (lil->code[lil->head] == '[') {
			lil->head++;
			cnt++;
			lil_append_char(cmd, '[');
		} else if (lil->code[lil->head] == ']') {
			lil->head++;
			if (--cnt == 0) break;
			else lil_append_char(cmd, ']');
		} else {
			lil_append_char(cmd, lil->code[lil->head++]);
		}
	}
	val = lil_parse_value(lil, cmd, 0);
	lil_free_value(cmd);
	return val;
}

static lil_value_t get_dollarpart(lil_t lil)
{
	lil_value_t val, name, tmp;
	lil->head++;
	name = next_word(lil);
	tmp = alloc_value("set ");
	lil_append_val(tmp, name);
	lil_free_value(name);
	val = lil_parse_value(lil, tmp, 0);
	lil_free_value(tmp);
	return val;
}

static lil_value_t next_word(lil_t lil)
{
	lil_value_t val;
	skip_spaces(lil);
	if (lil->code[lil->head] == '$') {
		val = get_dollarpart(lil);
	} else if (lil->code[lil->head] == '{') {
		size_t cnt = 1;
		lil->head++;
		val = alloc_value(NULL);
		while (lil->head < lil->clen) {
			if (lil->code[lil->head] == '{') {
				lil->head++;
				cnt++;
				lil_append_char(val, '{');
			} else if (lil->code[lil->head] == '}') {
				lil->head++;
				if (--cnt == 0) break;
				else lil_append_char(val, '}');
			} else {
				lil_append_char(val, lil->code[lil->head++]);
			}
		}
	} else if (lil->code[lil->head] == '[') {
		val = get_bracketpart(lil);
	} else if (lil->code[lil->head] == '"' || lil->code[lil->head] == '\'') {
		char sc = lil->code[lil->head++];
		val = alloc_value(NULL);
		while (lil->head < lil->clen) {
			if (lil->code[lil->head] == '[' || lil->code[lil->head] == '$') {
				lil_value_t tmp = lil->code[lil->head] == '$' ? get_dollarpart(lil) : get_bracketpart(lil);
				lil_append_val(val, tmp);
				lil_free_value(tmp);
				lil->head--; /* avoid skipping the char below */
			} else if (lil->code[lil->head] == '\\') {
				lil->head++;
				switch (lil->code[lil->head]) {
					case 'b': lil_append_char(val, '\b'); break;
					case 't': lil_append_char(val, '\t'); break;
					case 'n': lil_append_char(val, '\n'); break;
					case 'v': lil_append_char(val, '\v'); break;
					case 'f': lil_append_char(val, '\f'); break;
					case 'r': lil_append_char(val, '\r'); break;
					case '0': lil_append_char(val, 0); break;
					case 'a': lil_append_char(val, '\a'); break;
					case 'c': lil_append_char(val, '}'); break;
					case 'o': lil_append_char(val, '{'); break;
					default: lil_append_char(val, lil->code[lil->head]);
				}
			} else if (lil->code[lil->head] == sc) {
				lil->head++;
				break;
			} else {
				lil_append_char(val, lil->code[lil->head]);
			}
			lil->head++;
		}
	} else {
		val = alloc_value(NULL);
		while (lil->head < lil->clen && !isspace(lil->code[lil->head]) && !islilspecial(lil->code[lil->head])) {
			lil_append_char(val, lil->code[lil->head++]);
		}
	}
	return val ? val : alloc_value(NULL);
}

static lil_list_t substitute(lil_t lil)
{
	lil_list_t words = lil_alloc_list();
	
	skip_spaces(lil);
	while (lil->head < lil->clen && !ateol(lil)) {
		lil_value_t w = alloc_value(NULL);
		do {
			size_t head = lil->head;
			lil_value_t wp = next_word(lil);
			if (head == lil->head) { /* something wrong, the parser can't proceed */
				lil_free_value(w);
				lil_free_value(wp);
				lil_free_list(words);
				return NULL;
			}
			lil_append_val(w, wp);
			lil_free_value(wp);
		} while (lil->head < lil->clen && !ateol(lil) && !isspace(lil->code[lil->head]));
		skip_spaces(lil);
		
		lil_list_append(words, w);
	}
	
	return words;
}

lil_list_t lil_subst_to_list(lil_t lil, lil_value_t code)
{
	const char* save_code = lil->code;
	size_t save_clen = lil->clen;
	size_t save_head = lil->head;
	lil_list_t words;
	lil->code = lil_to_string(code);
	lil->clen = code->l;
	lil->head = 0;
	words = substitute(lil);
	lil->code = save_code;
	lil->clen = save_clen;
	lil->head = save_head;
	return words;
}

lil_value_t lil_subst_to_value(lil_t lil, lil_value_t code)
{
	lil_list_t words = lil_subst_to_list(lil, code);
	lil_value_t val;
	if (!words) return lil_clone_value(code);
	val = lil_list_to_value(words, 0);
	lil_free_list(words);
	return val;
}

lil_value_t lil_parse(lil_t lil, const char* code, size_t codelen, int funclevel)
{
	const char* save_code = lil->code;
	size_t save_clen = lil->clen;
	size_t save_head = lil->head;
	lil_value_t val = NULL;
	lil_list_t words = NULL;
	lil->code = code;
	lil->clen = codelen ? codelen : strlen(code);
	lil->head = 0;
	skip_spaces(lil);
	while (lil->head < lil->clen) {
		if (words) lil_free_list(words);
		if (val) lil_free_value(val);
		val = NULL;

		words = substitute(lil);
		if (!words)	goto cleanup;
		
		if (words->c) {
			lil_func_t cmd = find_cmd(lil, lil_to_string(words->v[0]));
			if (!cmd) {
				printf("unknown function %s\n", lil_to_string(words->v[0]));
				goto cleanup;
			}
			if (cmd->proc) {
				val = cmd->proc(lil, words->c - 1, words->v + 1);
			} else {
				lil_push_env(lil);
				if (cmd->argnames->c == 1 && !strcmp(lil_to_string(cmd->argnames->v[0]), "args")) {
				    lil_value_t args = lil_list_to_value(words, 1);
				    lil_set_var(lil, "args", args, LIL_SETVAR_LOCAL_NEW);
				    lil_free_value(args);
				} else {
	                size_t i;
                    for (i=0; i<cmd->argnames->c; i++) {
                        lil_set_var(lil, lil_to_string(cmd->argnames->v[i]), i < words->c - 1 ? words->v[i + 1] : lil->empty, LIL_SETVAR_LOCAL_NEW);
                    }
				}
				val = lil_parse_value(lil, cmd->code, 1);
				lil_pop_env(lil);
			}
		}

        if (lil->breakrun) goto cleanup;
		
		skip_spaces(lil);
		while (ateol(lil)) lil->head++;
		skip_spaces(lil);
	}
cleanup:
	if (words) lil_free_list(words);
	lil->code = save_code;
	lil->clen = save_clen;
	lil->head = save_head;
	if (funclevel) {
        if (val) lil_free_value(val);
        val = lil->retval;
        lil->retval = NULL;
        lil->breakrun = 0;
	}
	return val ? val : alloc_value(NULL);
}

lil_value_t lil_parse_value(lil_t lil, lil_value_t val, int funclevel)
{
    if (!val) return alloc_value(NULL);
    return lil_parse(lil, val->d, val->l, funclevel);
}

#define EE_INT 0
#define EE_FLOAT 1
#define EERR_NO_ERROR 0
#define EERR_SYNTAX_ERROR 1
#define EERR_INVALID_TYPE 2
#define EERR_DIVISION_BY_ZERO 3
#define EERR_INVALID_EXPRESSION 4

static void ee_expr(expreval_t* ee);

static void ee_skip_spaces(expreval_t* ee)
{
	while (ee->head < ee->len && isspace(ee->code[ee->head])) ee->head++;
}

static void ee_numeric_element(expreval_t* ee)
{
    int64_t fpart = 0, fpartlen = 1;
    ee->type = EE_INT;
    ee_skip_spaces(ee);
    ee->ival = 0;
    ee->dval = 0;
    while (ee->head < ee->len) {
        if (ee->code[ee->head] == '.') {
            if (ee->type == EE_FLOAT) break;
            ee->type = EE_FLOAT;
            ee->head++;
        } else if (!isdigit(ee->code[ee->head])) break;
        if (ee->type == EE_INT)
            ee->ival = ee->ival*10 + (ee->code[ee->head] - '0');
        else {
            fpart = fpart*10 + (ee->code[ee->head] - '0');
            fpartlen *= 10;
        }
        ee->head++;
    }
    if (ee->type == EE_FLOAT)
        ee->dval = ee->ival + (double)fpart/(double)fpartlen;
}

static void ee_element(expreval_t* ee)
{
    if (isdigit(ee->code[ee->head])) {
        ee_numeric_element(ee);
        return;
    }
    /* for anything else that might creep in (usually from strings), we set the
     * value to 1 so that strings evaluate as "true" when used in conditional
     * expressions */
    ee->type = EE_INT;
    ee->ival = 1;
    ee->error = EERR_INVALID_EXPRESSION; /* special flag, will be cleared */
}

static void ee_paren(expreval_t* ee)
{
	if (ee->code[ee->head] == '(') {
		ee->head++;
		ee_expr(ee);
		if (ee->code[ee->head] == ')') ee->head++;
	} else ee_element(ee);
}
		
static void ee_unary(expreval_t* ee)
{
    ee_skip_spaces(ee);
    if (ee->head < ee->len && !ee->error && !ispunct(ee->code[ee->head + 1]) &&
        (ee->code[ee->head] == '-' ||
         ee->code[ee->head] == '+' ||
         ee->code[ee->head] == '~' ||
         ee->code[ee->head] == '!')) {
        char op = ee->code[ee->head++];
        ee_unary(ee);
        if (ee->error) return;
        switch (op) {
        case '-':
            switch (ee->type) {
            case EE_FLOAT:
                ee->dval = -ee->dval;
                break;
            case EE_INT:
                ee->ival = -ee->ival;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case '+':
            /* ignore it, doesn't change a thing */
            break;
        case '~':
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = ~((int64_t)ee->dval);
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = ~ee->ival;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case '!':
            switch (ee->type) {
            case EE_FLOAT:
                ee->dval = !ee->dval;
                break;
            case EE_INT:
                ee->ival = !ee->ival;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        }
    } else {
        ee_paren(ee);
    }
}

static void ee_muldiv(expreval_t* ee)
{
	ee_unary(ee);
	if (ee->error) return;
	ee_skip_spaces(ee);
	while (ee->head < ee->len && !ee->error && !ispunct(ee->code[ee->head + 1]) &&
        (ee->code[ee->head] == '*' ||
         ee->code[ee->head] == '/' ||
         ee->code[ee->head] == '\\' ||
         ee->code[ee->head] == '%')) {
	    double odval = ee->dval;
	    int64_t oival = ee->ival;

	    switch (ee->code[ee->head]) {
        case '*':
            switch (ee->type) {
            case EE_FLOAT:
                ee->head++;
                ee_unary(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->dval = ee->dval*odval;
                    break;
                case EE_INT:
                    ee->dval = ee->ival*odval;
                    ee->type = EE_FLOAT;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee->head++;
                ee_unary(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->dval = ee->dval*oival;
                    ee->type = EE_FLOAT;
                    break;
                case EE_INT:
                    ee->ival = ee->ival*oival;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case '%':
            switch (ee->type) {
            case EE_FLOAT:
                ee->head++;
                ee_unary(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    if (ee->dval == 0.0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->dval = fmod(odval, ee->dval);
                    }
                    break;
                case EE_INT:
                    if (ee->ival == 0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->dval = fmod(odval, ee->ival);
                    }
                    ee->type = EE_FLOAT;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee->head++;
                ee_unary(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    if (ee->dval == 0.0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->dval = fmod(oival, ee->dval);
                    }
                    break;
                case EE_INT:
                    if (ee->ival == 0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->ival = oival%ee->ival;
                    }
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            }
            break;
        case '/':
            switch (ee->type) {
            case EE_FLOAT:
                ee->head++;
                ee_unary(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    if (ee->dval == 0.0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->dval = odval/ee->dval;
                    }
                    break;
                case EE_INT:
                    if (ee->ival == 0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->dval = odval/(double)ee->ival;
                    }
                    ee->type = EE_FLOAT;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee->head++;
                ee_unary(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    if (ee->dval == 0.0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->dval = (double)oival/ee->dval;
                    }
                    break;
                case EE_INT:
                    if (ee->ival == 0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->dval = (double)oival/(double)ee->ival;
                    }
                    ee->type = EE_FLOAT;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            }
            break;
	    case '\\':
	        switch (ee->type) {
	        case EE_FLOAT:
	            ee->head++;
	            ee_unary(ee);
	            if (ee->error) return;
	            switch (ee->type) {
	            case EE_FLOAT:
	                if (ee->dval == 0.0) {
	                    ee->error = EERR_DIVISION_BY_ZERO;
	                } else {
	                    ee->ival = (int64_t)(odval/ee->dval);
	                }
                    ee->type = EE_INT;
	                break;
	            case EE_INT:
                    if (ee->ival == 0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->ival = (int64_t)(odval/(double)ee->ival);
                    }
	                break;
	            default:
                    ee->error = EERR_SYNTAX_ERROR;
	            }
	            break;
            case EE_INT:
                ee->head++;
                ee_unary(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    if (ee->dval == 0.0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->ival = (int64_t)((double)oival/ee->dval);
                    }
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    if (ee->ival == 0) {
                        ee->error = EERR_DIVISION_BY_ZERO;
                    } else {
                        ee->ival = oival/ee->ival;
                    }
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
	        }
	        break;
	    }
	}
}

static void ee_addsub(expreval_t* ee)
{
	ee_muldiv(ee);
	ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error && !ispunct(ee->code[ee->head + 1]) &&
        (ee->code[ee->head] == '+' ||
         ee->code[ee->head] == '-')) {
        double odval = ee->dval;
        int64_t oival = ee->ival;

        switch (ee->code[ee->head]) {
        case '+':
            switch (ee->type) {
            case EE_FLOAT:
                ee->head++;
                ee_muldiv(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->dval = ee->dval+odval;
                    break;
                case EE_INT:
                    ee->dval = ee->ival+odval;
                    ee->type = EE_FLOAT;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee->head++;
                ee_muldiv(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->dval = ee->dval+oival;
                    ee->type = EE_FLOAT;
                    break;
                case EE_INT:
                    ee->ival = ee->ival+oival;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case '-':
            switch (ee->type) {
            case EE_FLOAT:
                ee->head++;
                ee_muldiv(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->dval = odval-ee->dval;
                    break;
                case EE_INT:
                    ee->dval = odval-ee->ival;
                    ee->type = EE_FLOAT;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee->head++;
                ee_muldiv(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->dval = (double)oival-ee->dval;
                    ee->type = EE_FLOAT;
                    break;
                case EE_INT:
                    ee->ival = oival-ee->ival;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        }
    }
}

static void ee_shift(expreval_t* ee)
{
    ee_addsub(ee);
    ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error &&
        ((ee->code[ee->head] == '<' && ee->code[ee->head + 1] == '<') ||
         (ee->code[ee->head] == '>' && ee->code[ee->head + 1] == '>'))) {
        double odval = ee->dval;
        int64_t oival = ee->ival;
        ee->head++;

        switch (ee->code[ee->head]) {
        case '<':
            switch (ee->type) {
            case EE_FLOAT:
                ee->head++;
                ee_addsub(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (int64_t)odval << (int64_t)ee->dval;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (int64_t)odval << ee->ival;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee->head++;
                ee_addsub(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = oival << (int64_t)ee->dval;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = oival << ee->ival;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case '>':
            switch (ee->type) {
            case EE_FLOAT:
                ee->head++;
                ee_addsub(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (int64_t)odval >> (int64_t)ee->dval;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (int64_t)odval >> ee->ival;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee->head++;
                ee_addsub(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = oival >> (int64_t)ee->dval;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = oival >> ee->ival;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        }
    }
}

static void ee_compare(expreval_t* ee)
{
    ee_shift(ee);
    ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error &&
        ((ee->code[ee->head] == '<' && !ispunct(ee->code[ee->head + 1])) ||
         (ee->code[ee->head] == '>' && !ispunct(ee->code[ee->head + 1])) ||
         (ee->code[ee->head] == '<' && ee->code[ee->head + 1] == '=') ||
         (ee->code[ee->head] == '>' && ee->code[ee->head + 1] == '='))) {
        double odval = ee->dval;
        int64_t oival = ee->ival;
        int op = 4;
        if (ee->code[ee->head] == '<' && !ispunct(ee->code[ee->head + 1])) op = 1;
        else if (ee->code[ee->head] == '>' && !ispunct(ee->code[ee->head + 1])) op = 2;
        else if (ee->code[ee->head] == '<' && ee->code[ee->head + 1] == '=') op = 3;

        ee->head += op > 2 ? 2 : 1;

        switch (op) {
        case 1:
            switch (ee->type) {
            case EE_FLOAT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (odval < ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (odval < ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (oival < ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (oival < ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case 2:
            switch (ee->type) {
            case EE_FLOAT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (odval > ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (odval > ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (oival > ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (oival > ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case 3:
            switch (ee->type) {
            case EE_FLOAT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (odval <= ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (odval <= ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (oival <= ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (oival <= ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case 4:
            switch (ee->type) {
            case EE_FLOAT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (odval >= ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (odval >= ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee_shift(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (oival >= ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (oival >= ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        }
    }
}

static void ee_equals(expreval_t* ee)
{
    ee_compare(ee);
    ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error &&
        ((ee->code[ee->head] == '=' && ee->code[ee->head + 1] == '=') ||
         (ee->code[ee->head] == '!' && ee->code[ee->head + 1] == '='))) {
        double odval = ee->dval;
        int64_t oival = ee->ival;
        int op = ee->code[ee->head] == '=' ? 1 : 2;
        ee->head += 2;

        switch (op) {
        case 1:
            switch (ee->type) {
            case EE_FLOAT:
                ee_compare(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (odval == ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (odval == ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee_compare(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (oival == ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (oival == ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case 2:
            switch (ee->type) {
            case EE_FLOAT:
                ee_compare(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (odval != ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (odval != ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            case EE_INT:
                ee_compare(ee);
                if (ee->error) return;
                switch (ee->type) {
                case EE_FLOAT:
                    ee->ival = (oival != ee->dval)?1:0;
                    ee->type = EE_INT;
                    break;
                case EE_INT:
                    ee->ival = (oival != ee->ival)?1:0;
                    break;
                default:
                    ee->error = EERR_SYNTAX_ERROR;
                }
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        }
    }
}

static void ee_bitand(expreval_t* ee)
{
	ee_equals(ee);
    ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error &&
        (ee->code[ee->head] == '&' && !ispunct(ee->code[ee->head + 1]))) {
        double odval = ee->dval;
        int64_t oival = ee->ival;
        ee->head++;

        switch (ee->type) {
        case EE_FLOAT:
            ee_equals(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = (int64_t)odval & (int64_t)ee->dval;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = (int64_t)odval & ee->ival;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case EE_INT:
            ee_equals(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = oival & (int64_t)ee->dval;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = oival & ee->ival;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        default:
            ee->error = EERR_SYNTAX_ERROR;
        }
    }
}

static void ee_bitor(expreval_t* ee)
{
    ee_bitand(ee);
    ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error &&
        (ee->code[ee->head] == '|' && !ispunct(ee->code[ee->head + 1]))) {
        double odval = ee->dval;
        int64_t oival = ee->ival;
        ee->head++;

        switch (ee->type) {
        case EE_FLOAT:
            ee_bitand(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = (int64_t)odval | (int64_t)ee->dval;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = (int64_t)odval | ee->ival;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case EE_INT:
            ee_bitand(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = oival | (int64_t)ee->dval;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = oival | ee->ival;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        default:
            ee->error = EERR_SYNTAX_ERROR;
        }
    }
}

static void ee_logand(expreval_t* ee)
{
    ee_bitor(ee);
    ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error &&
        (ee->code[ee->head] == '&' && ee->code[ee->head + 1] == '&')) {
        double odval = ee->dval;
        int64_t oival = ee->ival;
        ee->head += 2;

        switch (ee->type) {
        case EE_FLOAT:
            ee_bitor(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = (odval && ee->dval)?1:0;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = (odval && ee->ival)?1:0;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case EE_INT:
            ee_bitor(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = (oival && ee->dval)?1:0;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = (oival && ee->ival)?1:0;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        default:
            ee->error = EERR_SYNTAX_ERROR;
        }
    }
}

static void ee_logor(expreval_t* ee)
{
    ee_logand(ee);
    ee_skip_spaces(ee);
    while (ee->head < ee->len && !ee->error &&
        (ee->code[ee->head] == '|' && ee->code[ee->head + 1] == '|')) {
        double odval = ee->dval;
        int64_t oival = ee->ival;
        ee->head += 2;

        switch (ee->type) {
        case EE_FLOAT:
            ee_logand(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = (odval || ee->dval)?1:0;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = (odval || ee->ival)?1:0;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        case EE_INT:
            ee_logand(ee);
            if (ee->error) return;
            switch (ee->type) {
            case EE_FLOAT:
                ee->ival = (oival || ee->dval)?1:0;
                ee->type = EE_INT;
                break;
            case EE_INT:
                ee->ival = (oival || ee->ival)?1:0;
                break;
            default:
                ee->error = EERR_SYNTAX_ERROR;
            }
            break;
        default:
            ee->error = EERR_SYNTAX_ERROR;
        }
    }
}

static void ee_expr(expreval_t* ee)
{
	ee_logor(ee);
	/* invalid expression doesn't really matter, it is only used to stop
	 * the expression parsing. */
	if (ee->error == EERR_INVALID_EXPRESSION) {
	    ee->error = EERR_NO_ERROR;
	    ee->ival = 1;
	}
}

lil_value_t lil_eval_expr(lil_t lil, lil_value_t code)
{
	expreval_t ee;
	code = lil_subst_to_value(lil, code);
	ee.code = lil_to_string(code);
	/* an empty expression equals to 0 so that it can be used as a false value
	 * in conditionals */
	if (!ee.code[0]) return lil_alloc_integer(0);
	ee.head = 0;
	ee.len = code->l;
	ee.ival = 0;
	ee.dval = 0;
	ee.type = EE_INT;
	ee.error = 0;
	ee_expr(&ee);
	lil_free_value(code);
	if (ee.error) return NULL;
	if (ee.type == EE_INT)
	    return lil_alloc_integer(ee.ival);
	else
	    return lil_alloc_double(ee.dval);
}

const char* lil_to_string(lil_value_t val)
{
	return (val && val->d) ? val->d : "";
}

double lil_to_double(lil_value_t val)
{
	return atof(lil_to_string(val));
}

int64_t lil_to_integer(lil_value_t val)
{
	return (int64_t)atoll(lil_to_string(val));
}

int lil_to_boolean(lil_value_t val)
{
    const char* s = lil_to_string(val);
    size_t i, dots = 0;
    if (!s[0]) {return 0;}
    for (i=0; s[i]; i++) {
        if (s[i] != '0' && s[i] != '.') return 1;
        if (s[i] == '.') {
            if (dots) return 1;
            dots = 1;
        }
    }
    return 0;
}

lil_value_t lil_alloc_string(const char* str)
{
	return alloc_value(str);
}

lil_value_t lil_alloc_double(double num)
{
	char buff[128];
	sprintf(buff, "%f", num);
	return alloc_value(buff);
}

lil_value_t lil_alloc_integer(int64_t num)
{
	char buff[128];
	sprintf(buff, "%lli", (long long int)num);
	return alloc_value(buff);
}

void lil_free(lil_t lil)
{
    size_t i;
	lil_free_value(lil->empty);
	if (lil->retval) lil_free_value(lil->retval);
	while (lil->env) {
		lil_env_t next = lil->env->parent;
		lil_free_env(lil->env);
		lil->env = next;
	}
	for (i=0; i<lil->cmds; i++) {
	    if (lil->cmd[i]->argnames)
	        lil_free_list(lil->cmd[i]->argnames);
	    lil_free_value(lil->cmd[i]->code);
	    free(lil->cmd[i]->name);
	    free(lil->cmd[i]);
	}
	free(lil->cmd);
	free(lil);
}

static lil_value_t fnc_reflect(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_func_t func;
    const char* type;
    size_t i;
    lil_value_t r;
    if (!argc) return NULL;
    type = lil_to_string(argv[0]);
    if (!strcmp(type, "args")) {
        if (argc < 2) return NULL;
        func = find_cmd(lil, lil_to_string(argv[1]));
        if (!func || !func->argnames) return NULL;
        return lil_list_to_value(func->argnames, 1);
    }
    if (!strcmp(type, "body")) {
        if (argc < 2) return NULL;
        func = find_cmd(lil, lil_to_string(argv[1]));
        if (!func || func->proc) return NULL;
        return lil_clone_value(func->code);
    }
    if (!strcmp(type, "func-count")) {
        return lil_alloc_integer(lil->cmds);
    }
    if (!strcmp(type, "funcs")) {
        lil_list_t funcs = lil_alloc_list();
        for (i=0; i<lil->cmds; i++)
            lil_list_append(funcs, lil_alloc_string(lil->cmd[i]->name));
        r = lil_list_to_value(funcs, 1);
        lil_free_list(funcs);
        return r;
    }
    if (!strcmp(type, "vars")) {
        lil_list_t vars = lil_alloc_list();
        lil_env_t env = lil->env;
        while (env) {
            for (i=0; i<env->vars; i++)
                lil_list_append(vars, lil_alloc_string(env->var[i]->n));
            env = env->parent;
        }
        r = lil_list_to_value(vars, 1);
        lil_free_list(vars);
        return r;
    }
    if (!strcmp(type, "globals")) {
        lil_list_t vars = lil_alloc_list();
        for (i=0; i<lil->rootenv->vars; i++)
            lil_list_append(vars, lil_alloc_string(lil->rootenv->var[i]->n));
        r = lil_list_to_value(vars, 1);
        lil_free_list(vars);
        return r;
    }
    if (!strcmp(type, "has-func")) {
        const char* target;
        if (argc == 1) return NULL;
        target = lil_to_string(argv[1]);
        for (i=0; i<lil->cmds; i++)
            if (!strcmp(target, lil->cmd[i]->name)) return lil_alloc_string("1");
        return NULL;
    }
    if (!strcmp(type, "has-var")) {
        const char* target;
        lil_env_t env = lil->env;
        if (argc == 1) return NULL;
        target = lil_to_string(argv[1]);
        while (env) {
            for (i=0; i<env->vars; i++)
                if (!strcmp(target, env->var[i]->n)) return lil_alloc_string("1");
            env = env->parent;
        }
        return NULL;
    }
    if (!strcmp(type, "has-global")) {
        const char* target;
        if (argc == 1) return NULL;
        target = lil_to_string(argv[1]);
        for (i=0; i<lil->rootenv->vars; i++)
            if (!strcmp(target, lil->rootenv->var[i]->n)) return lil_alloc_string("1");
        return NULL;
    }
    return NULL;
}

static lil_value_t fnc_func(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_func_t cmd;
	if (argc != 3) return NULL;
	cmd = add_func(lil, lil_to_string(argv[0]));
	cmd->argnames = lil_subst_to_list(lil, argv[1]);
	cmd->code = lil_clone_value(argv[2]);
	return NULL;
}

static lil_value_t fnc_quote(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t r;
    size_t i;
    if (argc < 1) return NULL;
    r = alloc_value(NULL);
    for (i=0; i<argc; i++) {
        if (i) lil_append_char(r, ' ');
        lil_append_val(r, argv[i]);
    }
    return r;
}

static lil_value_t fnc_set(lil_t lil, size_t argc, lil_value_t* argv)
{
	size_t i = 0;
	lil_var_t var;
	int access = LIL_SETVAR_LOCAL;
	if (!argc) return NULL;
	if (!strcmp(lil_to_string(argv[0]), "global")) {
	    i = 1;
	    access = LIL_SETVAR_GLOBAL;
	}
	while (i < argc) {
		if (argc == i + 1) return lil_clone_value(lil_get_var(lil, lil_to_string(argv[i])));
		var = lil_set_var(lil, lil_to_string(argv[i]), argv[i + 1], access);
		i += 2;
	}
	return lil_clone_value(var->v);
}

static lil_value_t fnc_write(lil_t lil, size_t argc, lil_value_t* argv)
{
	size_t i;
	for (i=0; i<argc; i++) {
		if (i) printf(" ");
		printf("%s", lil_to_string(argv[i]));
	}
	return NULL;
}

static lil_value_t fnc_print(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_value_t r = fnc_write(lil, argc, argv);
	printf("\n");
	return r;
}

static lil_value_t fnc_eval(lil_t lil, size_t argc, lil_value_t* argv)
{
	if (argc == 1) return lil_parse_value(lil, argv[0], 1);
	if (argc > 1) {
		lil_value_t val = alloc_value(NULL), r;
		size_t i;
		for (i=0; i<argc; i++) {
			if (i) lil_append_char(val, ' ');
			lil_append_val(val, argv[i]);
		}
		r = lil_parse_value(lil, val, 1);
		lil_free_value(val);
		return r;
	}
	return NULL;
}

static lil_value_t fnc_count(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_list_t list;
    char buff[64];
    if (!argc) return alloc_value("0");
    list = lil_subst_to_list(lil, argv[0]);
    sprintf(buff, "%u", (unsigned int)list->c);
    lil_free_list(list);
    return alloc_value(buff);
}

static lil_value_t fnc_index(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_list_t list;
	size_t index;
	lil_value_t r;
	if (argc < 2) return NULL;
	list = lil_subst_to_list(lil, argv[0]);
	index = lil_to_integer(argv[1]);
	if (index >= list->c)
	    r = NULL;
	else
	    r = lil_clone_value(list->v[index]);
	lil_free_list(list);
	return r;
}

static lil_value_t fnc_append(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_list_t list;
    lil_value_t r;
    size_t i;
    const char* varname;
    if (argc < 2) return NULL;
    varname = lil_to_string(argv[0]);
    list = lil_subst_to_list(lil, lil_get_var(lil, varname));
    for (i=1; i<argc; i++)
        lil_list_append(list, lil_clone_value(argv[i]));
    r = lil_list_to_value(list, 1);
    lil_free_list(list);
    lil_set_var(lil, varname, r, LIL_SETVAR_LOCAL);
    return r;
}

static lil_value_t fnc_list(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_list_t list = lil_alloc_list();
    lil_value_t r;
    size_t i;
    for (i=0; i<argc; i++)
        lil_list_append(list, lil_clone_value(argv[i]));
    r = lil_list_to_value(list, 1);
    lil_free_list(list);
    return r;
}

static lil_value_t fnc_subst(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc < 1) return NULL;
    return lil_subst_to_value(lil, argv[0]);
}

static lil_value_t fnc_concat(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_list_t list;
    lil_value_t r, tmp;
    size_t i;
    if (argc < 1) return NULL;
    r = lil_alloc_string("");
    for (i=0; i<argc; i++) {
        list = lil_subst_to_list(lil, argv[i]);
        tmp = lil_list_to_value(list, 1);
        lil_free_list(list);
        lil_append_val(r, tmp);
        lil_free_value(tmp);
    }
    return r;
}

static lil_value_t fnc_foreach(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_list_t list, rlist;
	lil_value_t r;
	size_t i, listidx = 0, codeidx = 1;
	const char* varname = "i";
	if (argc < 2) return NULL;
	if (argc == 3) {
	    varname = lil_to_string(argv[0]);
	    listidx = 1;
	    codeidx = 2;
	}
	rlist = lil_alloc_list();
	list = lil_subst_to_list(lil, argv[listidx]);
	for (i=0; i<list->c; i++) {
		lil_value_t rv;
		lil_set_var(lil, varname, list->v[i], LIL_SETVAR_LOCAL);
		rv = lil_parse_value(lil, argv[codeidx], 1);
		if (rv->l) lil_list_append(rlist, rv);
		else lil_free_value(rv);
	}
	r = lil_list_to_value(rlist, 1);
	lil_free_list(list);
	lil_free_list(rlist);
	return r;
}

static lil_value_t fnc_return(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil->breakrun = 1;
	lil->retval = argc < 1 ? NULL : lil_clone_value(argv[0]);
	return NULL;
}

static lil_value_t fnc_expr(lil_t lil, size_t argc, lil_value_t* argv)
{
	if (argc == 1) return lil_eval_expr(lil, argv[0]);
	if (argc > 1) {
		lil_value_t val = alloc_value(NULL), r;
		size_t i;
		for (i=0; i<argc; i++) {
			if (i) lil_append_char(val, ' ');
			lil_append_val(val, argv[i]);
		}
		r = lil_eval_expr(lil, val);
		lil_free_value(val);
		return r;
	}
	return NULL;
}

static lil_value_t real_inc(lil_t lil, const char* varname, float v)
{
    lil_value_t pv = lil_get_var(lil, varname);
    double dv = lil_to_double(pv) + v;
    if (fmod(dv, 1))
        pv = lil_alloc_double(dv);
    else
        pv = lil_alloc_integer(lil_to_integer(pv) + v);
    lil_set_var(lil, varname, pv, LIL_SETVAR_LOCAL);
    return pv;
}

static lil_value_t fnc_inc(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc < 1) return NULL;
    return real_inc(lil, lil_to_string(argv[0]), argc > 1 ? lil_to_double(argv[1]) : 1);
}

static lil_value_t fnc_dec(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc < 1) return NULL;
    return real_inc(lil, lil_to_string(argv[0]), -(argc > 1 ? lil_to_double(argv[1]) : 1));
}

static lil_value_t fnc_read(lil_t lil, size_t argc, lil_value_t* argv)
{
    FILE* f;
    size_t size;
    char* buffer;
    lil_value_t r;
    if (argc < 1) return NULL;
    f = fopen(lil_to_string(argv[0]), "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    size = ftell(f);
    fseek(f, 0, SEEK_SET);
    buffer = malloc(size + 1);
    fread(buffer, 1, size, f);
    buffer[size] = 0;
    fclose(f);
    r = lil_alloc_string(buffer);
    free(buffer);
    return r;
}

static lil_value_t fnc_store(lil_t lil, size_t argc, lil_value_t* argv)
{
    FILE* f;
    const char* buffer;
    if (argc < 2) return NULL;
    f = fopen(lil_to_string(argv[0]), "wb");
    if (!f) return NULL;
    buffer = lil_to_string(argv[1]);
    fwrite(buffer, 1, strlen(buffer), f);
    fclose(f);
    return lil_clone_value(argv[0]);
}

static lil_value_t fnc_if(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t val, r = NULL;
    int base = 0, not = 0, v;
    if (argc < 1) return NULL;
    if (!strcmp(lil_to_string(argv[0]), "not")) base = not = 1;
    if (argc < (size_t)base + 2) return NULL;
    val = lil_eval_expr(lil, argv[base]);
    if (!val) {
        printf("expression error - '%s'\n", lil_to_string(argv[base]));
        return NULL;
    }
    v = lil_to_boolean(val);
    if (not) v = !v;
    if (v) {
        r = lil_parse_value(lil, argv[base + 1], 0);
    } else if (argc > (size_t)base + 2) {
        r = lil_parse_value(lil, argv[base + 2], 0);
    }
    lil_free_value(val);
    return r;
}

static lil_value_t fnc_while(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t val, r = NULL;
    int base = 0, not = 0, v;
    if (argc < 1) return NULL;
    if (!strcmp(lil_to_string(argv[0]), "not")) base = not = 1;
    if (argc < (size_t)base + 2) return NULL;
    while (1) {
        val = lil_eval_expr(lil, argv[base]);
        if (!val) {
            printf("expression error - '%s'\n", lil_to_string(argv[base]));
            return NULL;
        }
        v = lil_to_boolean(val);
        if (not) v = !v;
        if (!v) {
            lil_free_value(val);
            break;
        }
        if (r) lil_free_value(r);
        r = lil_parse_value(lil, argv[base + 1], 0);
        lil_free_value(val);
    }
    return r;
}

static lil_value_t fnc_for(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t val, r = NULL;
    if (argc < 4) return NULL;
    lil_free_value(lil_parse_value(lil, argv[0], 0));
    while (1) {
        val = lil_eval_expr(lil, argv[1]);
        if (!val) {
            printf("expression error - '%s'\n", lil_to_string(argv[1]));
            return NULL;
        }
        if (!lil_to_boolean(val)) {
            lil_free_value(val);
            break;
        }
        if (r) lil_free_value(r);
        r = lil_parse_value(lil, argv[3], 0);
        lil_free_value(val);
        lil_free_value(lil_parse_value(lil, argv[2], 0));
    }
    return r;
}

static lil_value_t fnc_charat(lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t index;
    char chstr[2];
    const char* str;
    if (argc < 2) return NULL;
    str = lil_to_string(argv[0]);
    index = (size_t)lil_to_integer(argv[1]);
    if (index >= strlen(str)) return NULL;
    chstr[0] = str[index];
    chstr[1] = 0;
    return lil_alloc_string(chstr);
}

static lil_value_t fnc_codeat(lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t index;
    const char* str;
    if (argc < 2) return NULL;
    str = lil_to_string(argv[0]);
    index = (size_t)lil_to_integer(argv[1]);
    if (index >= strlen(str)) return NULL;
    return lil_alloc_integer(str[index]);
}

static lil_value_t fnc_substr(lil_t lil, size_t argc, lil_value_t* argv)
{
    const char* str;
    lil_value_t r;
    size_t start, end, i, slen;
    if (argc < 2) return NULL;
    str = lil_to_string(argv[0]);
    if (!str[0]) return NULL;
    slen = strlen(str);
    start = (size_t)atoll(lil_to_string(argv[1]));
    end = argc > 2 ? (size_t)atoll(lil_to_string(argv[2])) : slen;
    if (end > slen) end = slen;
    if (start >= end) return NULL;
    r = lil_alloc_string("");
    for (i=start; i<end; i++)
        lil_append_char(r, str[i]);
    return r;
}

static lil_value_t fnc_strpos(lil_t lil, size_t argc, lil_value_t* argv)
{
    const char* hay;
    const char* str;
    size_t min = 0;
    if (argc < 2) return lil_alloc_integer(-1);
    hay = lil_to_string(argv[0]);
    if (argc > 2) {
        min = (size_t)atoll(lil_to_string(argv[2]));
        if (min >= strlen(hay)) return lil_alloc_integer(-1);
    }
    str = strstr(hay + min, lil_to_string(argv[1]));
    if (!str) return lil_alloc_integer(-1);
    return lil_alloc_integer(str - hay);
}

static lil_value_t fnc_length(lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t i, total = 0;
    for (i=0; i<argc; i++) {
        if (i) total++;
        total += strlen(lil_to_string(argv[i]));
    }
    return lil_alloc_integer((int64_t)total);
}

static lil_value_t fnc_strcmp(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc < 2) return NULL;
    return lil_alloc_integer(strcmp(lil_to_string(argv[0]), lil_to_string(argv[1])));
}

static lil_value_t fnc_streq(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc < 2) return NULL;
    return lil_alloc_integer(strcmp(lil_to_string(argv[0]), lil_to_string(argv[1]))?0:1);
}

static lil_value_t fnc_split(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_list_t list;
    char sep = ' ';
    size_t i;
    lil_value_t val;
    const char* str;
    if (argc == 0) return NULL;
    if (argc > 1) {
        sep = lil_to_string(argv[1])[0];
        if (!sep) return lil_clone_value(argv[0]);
    }
    val = lil_alloc_string("");
    str = lil_to_string(argv[0]);
    list = lil_alloc_list();
    for (i=0; str[i]; i++) {
        if (str[i] == sep) {
            lil_list_append(list, val);
            val = lil_alloc_string("");
        } else {
            lil_append_char(val, str[i]);
        }
    }
    lil_list_append(list, val);
    val = lil_list_to_value(list, 1);
    lil_free_list(list);
    return val;
}

static void register_stdcmds(lil_t lil)
{
    lil_register(lil, "reflect", fnc_reflect);
	lil_register(lil, "func", fnc_func);
	lil_register(lil, "quote", fnc_quote);
	lil_register(lil, "set", fnc_set);
	lil_register(lil, "write", fnc_write);
	lil_register(lil, "print", fnc_print);
	lil_register(lil, "eval", fnc_eval);
	lil_register(lil, "count", fnc_count);
	lil_register(lil, "index", fnc_index);
    lil_register(lil, "list", fnc_list);
	lil_register(lil, "append", fnc_append);
    lil_register(lil, "subst", fnc_subst);
    lil_register(lil, "concat", fnc_concat);
	lil_register(lil, "foreach", fnc_foreach);
	lil_register(lil, "return", fnc_return);
	lil_register(lil, "expr", fnc_expr);
    lil_register(lil, "inc", fnc_inc);
    lil_register(lil, "dec", fnc_dec);
	lil_register(lil, "read", fnc_read);
	lil_register(lil, "store", fnc_store);
	lil_register(lil, "if", fnc_if);
	lil_register(lil, "while", fnc_while);
    lil_register(lil, "for", fnc_for);
	lil_register(lil, "charat", fnc_charat);
    lil_register(lil, "codeat", fnc_codeat);
	lil_register(lil, "substr", fnc_substr);
	lil_register(lil, "strpos", fnc_strpos);
    lil_register(lil, "length", fnc_length);
    lil_register(lil, "strcmp", fnc_strcmp);
    lil_register(lil, "streq", fnc_streq);
    lil_register(lil, "split", fnc_split);
}
