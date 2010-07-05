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
#include <stdint.h>
#include <string.h>
#include <ctype.h>
#include "lil.h"

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
typedef struct _lil_var_t* lil_var_t;

struct _lil_env_t
{
	struct _lil_env_t* parent;
	lil_var_t* var;
	size_t vars;
};
typedef struct _lil_env_t* lil_env_t;

struct _lil_list_t
{
	lil_value_t* v;
	size_t c;
};
typedef struct _lil_list_t* lil_list_t;

struct _lil_command_t
{
	char* name;
	lil_value_t code;
	lil_list_t argnames;
	lil_command_proc_t proc;
};

struct _lil_t
{
	const char* code; /* need save on parse */
	size_t clen; /* need save on parse */
	size_t head; /* need save on parse */
	lil_command_t* cmd;
	size_t cmds;
	lil_env_t env;
	lil_env_t rootenv;
	lil_value_t empty;
	int breakrun;
};

typedef struct _expreval_t
{
	const char* code;
	size_t len, head;
	int64_t ival;
	double dval;
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

static lil_value_t clone_value(lil_value_t src)
{
	lil_value_t val = calloc(1, sizeof(struct _lil_value_t));
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

static int append_char(lil_value_t val, char ch)
{
	char* new = realloc(val->d, val->l + 2);
	if (!new) return 0;
	new[val->l++] = ch;
	new[val->l] = 0;
	val->d = new;
	return 1;
}

static int append_val(lil_value_t val, lil_value_t v)
{
	char* new = realloc(val->d, val->l + v->l + 1);
	if (!new) return 0;
	if (!v->l) return 1;
	memcpy(new + val->l, v->d, v->l + 1);
	val->l += v->l;
	val->d = new;
	return 1;
}

static void free_value(lil_value_t val)
{
	if (!val) return;
	free(val->d);
	free(val);
}


static lil_list_t lil_alloc_list(void)
{
	lil_list_t list = calloc(1, sizeof(struct _lil_list_t));
	list->v = NULL;
	list->c = 0;
	return list;
}

static void lil_free_list(lil_list_t list)
{
	size_t i;
	for (i=0; i<list->c; i++) free_value(list->v[i]);
	free(list->v);
	free(list);
}

static void lil_list_append(lil_list_t list, lil_value_t val)
{
	lil_value_t* nv = realloc(list->v, sizeof(lil_value_t)*(list->c + 1));
	if (!nv) return;
	list->v = nv;
	nv[list->c++] = val;
}

static lil_list_t lil_list_from_value(lil_value_t val)
{
	lil_value_t v;
	lil_list_t list = lil_alloc_list();
	const char* str = lil_to_string(val);
	size_t head = 0, len = strlen(str);
	while (head < len) {
		while (head < len && isspace(str[head])) head++;
		if (head >= len) break;
		
		v = alloc_value(NULL);
		while (head < len && !isspace(str[head])) {
			append_char(v, str[head++]);
		}
		lil_list_append(list, v);
	}
	return list;
}

static lil_value_t lil_list_to_value(lil_list_t list)
{
	lil_value_t val = alloc_value(NULL);
	size_t i;
	for (i=0; i<list->c; i++) {
		if (i) append_char(val, ' ');
		append_val(val, list->v[i]);
	}
	return val;
}

static lil_env_t lil_alloc_env(lil_env_t parent)
{
	lil_env_t env = calloc(1, sizeof(struct _lil_env_t));
	env->parent = parent;
	return env;
}

static void lil_free_env(lil_env_t env)
{
	size_t i;
	for (i=0; i<env->vars; i++) {
		free(env->var[i]->n);
		free_value(env->var[i]->v);
	}
	free(env);
}

static lil_var_t lil_find_var(lil_env_t env, const char* name, int check_parent)
{
	if (env->vars > 0) {
		size_t i = env->vars - 1;
		while (1) {
			if (!strcmp(env->var[i]->n, name)) return env->var[i];
			if (!i) break;
			i--;
		}
	}
	return (check_parent && env->parent) ? lil_find_var(env->parent, name, 1) : NULL;
}

static lil_command_t find_cmd(lil_t lil, const char* name)
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

static lil_command_t add_command(lil_t lil, const char* name)
{
	lil_command_t cmd;
	lil_command_t* ncmd;
	cmd = find_cmd(lil, name);
	if (cmd) return cmd;
	cmd = calloc(1, sizeof(struct _lil_command_t));
	cmd->name = strclone(name);
	ncmd = realloc(lil->cmd, sizeof(lil_command_t)*(lil->cmds + 1));
	if (!ncmd) {
		free(cmd);
		return NULL;
	}
	lil->cmd = ncmd;
	ncmd[lil->cmds++] = cmd;
	return cmd;
}

int lil_register(lil_t lil, const char* name, lil_command_proc_t proc)
{
	lil_command_t cmd = add_command(lil, name);
	if (!cmd) return 0;
	cmd->proc = proc;
	return 1;
}

static lil_var_t set_var(lil_t lil, const char* name, lil_value_t val, int local)
{
	lil_var_t* nvar;
	if (local != 2) {
		lil_var_t var = lil_find_var(lil->env, name, !local);
		if (var) {
			free_value(var->v);
			var->v = clone_value(val);
			return var;
		}
	}

	nvar = realloc(lil->env->var, sizeof(lil_var_t)*(lil->env->vars + 1));
	if (!nvar) {
		/* TODO: report memory error */
		return NULL;
	}
	lil->env->var = nvar;
	nvar[lil->env->vars] = calloc(1, sizeof(struct _lil_var_t));
	nvar[lil->env->vars]->n = strclone(name);
	nvar[lil->env->vars]->v = clone_value(val);
	return nvar[lil->env->vars++];
}

static lil_value_t get_var(lil_t lil, const char* name)
{
	lil_var_t var = lil_find_var(lil->env, name, 1);
	return var ? var->v : lil->empty;
}

static lil_env_t push_env(lil_t lil)
{
	lil_env_t env = lil_alloc_env(lil->env);
	lil->env = env;
	return env;
}

static void pop_env(lil_t lil)
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

static void skip_spaces(lil_t lil)
{
	while (lil->head < lil->clen && isspace(lil->code[lil->head]) && !(lil->code[lil->head] == '\r' || lil->code[lil->head] == '\n')) lil->head++;
}

static int islilspecial(char ch)
{
	return ch == ';' || ch == '$' || ch == '[' || ch == ']' || ch == '{' || ch == '}' || ch == '"' || ch == '\'';
}

static int ateol(lil_t lil)
{
	return lil->code[lil->head] == '\n' || lil->code[lil->head] == '\r' || lil->code[lil->head] == ';';
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
			append_char(cmd, '[');
		} else if (lil->code[lil->head] == ']') {
			lil->head++;
			if (--cnt == 0) break;
			else append_char(cmd, ']');
		} else {
			append_char(cmd, lil->code[lil->head++]);
		}
	}
	val = lil_parse(lil, lil_to_string(cmd));
	free_value(cmd);
	return val;
}

static lil_value_t get_dollarpart(lil_t lil)
{
	lil_value_t val, name, tmp;
	lil->head++;
	name = next_word(lil);
	tmp = alloc_value("set ");
	append_val(tmp, name);
	free_value(name);
	val = lil_parse(lil, lil_to_string(tmp));
	free_value(tmp);
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
				append_char(val, '{');
			} else if (lil->code[lil->head] == '}') {
				lil->head++;
				if (--cnt == 0) break;
				else append_char(val, '}');
			} else {
				append_char(val, lil->code[lil->head++]);
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
				append_val(val, tmp);
				free_value(tmp);
				lil->head--; /* avoid skipping the char below */
			} else if (lil->code[lil->head] == '\\') {
				lil->head++;
				switch (lil->code[lil->head]) {
					case 'b': append_char(val, '\b'); break;
					case 't': append_char(val, '\t'); break;
					case 'n': append_char(val, '\n'); break;
					case 'v': append_char(val, '\v'); break;
					case 'f': append_char(val, '\f'); break;
					case 'r': append_char(val, '\r'); break;
					case '0': append_char(val, 0); break;
					case 'a': append_char(val, '\a'); break;
					default: append_char(val, lil->code[lil->head]);
				}
			} else if (lil->code[lil->head] == sc) {
				lil->head++;
				break;
			} else {
				append_char(val, lil->code[lil->head]);
			}
			lil->head++;
		}
	} else {
		val = alloc_value(NULL);
		while (lil->head < lil->clen && !isspace(lil->code[lil->head]) && !islilspecial(lil->code[lil->head])) {
			append_char(val, lil->code[lil->head++]);
		}
	}
	return val;
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
				free_value(w);
				free_value(wp);
				lil_free_list(words);
				return NULL;
			}
			append_val(w, wp);
			free_value(wp);
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
	if (!words) return clone_value(code);
	val = lil_list_to_value(words);
	lil_free_list(words);
	return val;
}

lil_value_t lil_parse(lil_t lil, const char* code)
{
	const char* save_code = lil->code;
	size_t save_clen = lil->clen;
	size_t save_head = lil->head;
	lil_value_t val = NULL;
	lil_list_t words = NULL;
	lil->code = code;
	lil->clen = strlen(code);
	lil->head = 0;
	skip_spaces(lil);
	while (lil->head < lil->clen) {
		if (words) lil_free_list(words);
		if (val) free_value(val);
		val = NULL;
		
		words = substitute(lil);
		if (!words)	goto cleanup;
		
		if (words->c) {
			lil_command_t cmd = find_cmd(lil, lil_to_string(words->v[0]));
			if (!cmd) {
				printf("unknown command %s\n", lil_to_string(words->v[0]));
				goto cleanup;
			}
			if (cmd->proc) {
				val = cmd->proc(lil, words->c - 1, words->v + 1);
			} else {
				size_t i;
				push_env(lil);
				for (i=0; i<cmd->argnames->c; i++) {
					set_var(lil, lil_to_string(cmd->argnames->v[i]), i < words->c - 1 ? words->v[i + 1] : lil->empty, 2);
				}
				val = lil_parse(lil, lil_to_string(cmd->code));
				pop_env(lil);
			}
		}
		
		skip_spaces(lil);
		while (ateol(lil)) lil->head++;
		skip_spaces(lil);
	}
cleanup:
	if (words) lil_free_list(words);
	lil->code = save_code;
	lil->clen = save_clen;
	lil->head = save_head;
	return val ? val : alloc_value(NULL);
}

#define EE_INT 0
#define EE_FLOAT 1

static void ee_expr(expreval_t* ee);

static void ee_skip_spaces(expreval_t* ee)
{
	while (ee->head < ee->len && isspace(ee->code[ee->head])) ee->head++;
}

static void ee_element(expreval_t* ee)
{
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
	ee_paren(ee);
}

static void ee_muldiv(expreval_t* ee)
{
	ee_unary(ee);
}

static void ee_addsub(expreval_t* ee)
{
	ee_muldiv(ee);
}

static void ee_shift(expreval_t* ee)
{
	ee_addsub(ee);
}

static void ee_compare(expreval_t* ee)
{
	ee_shift(ee);
}

static void ee_equals(expreval_t* ee)
{
	ee_compare(ee);
}

static void ee_bitand(expreval_t* ee)
{
	ee_equals(ee);
}

static void ee_bitor(expreval_t* ee)
{
	ee_bitand(ee);
}

static void ee_logand(expreval_t* ee)
{
	ee_bitor(ee);
}

static void ee_logor(expreval_t* ee)
{
	ee_logand(ee);
}

static void ee_expr(expreval_t* ee)
{
	ee_logor(ee);
}

lil_value_t lil_eval_expr(lil_t lil, lil_value_t code)
{
	lil_value_t val = NULL;
	expreval_t ee;
	int et;
	double r = 0;
	code = lil_subst_to_value(lil, code);
	ee.code = lil_to_string(code);
	ee.head = 0;
	ee.len = code->l;
	ee_expr(&ee);
	free_value(code);
	return lil_alloc_double(r);
}

const char* lil_to_string(lil_value_t val)
{
	return val->d ? val->d : "";
}

double lil_to_double(lil_value_t val)
{
	return atof(lil_to_string(val));
}

int lil_to_integer(lil_value_t val)
{
	return atoi(lil_to_string(val));
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

lil_value_t lil_alloc_integer(int num)
{
	char buff[64];
	sprintf(buff, "%i", num);
	return alloc_value(buff);
}

void lil_release(lil_value_t val)
{
	if (val) free_value(val);
}
			
void lil_free(lil_t lil)
{
	free_value(lil->empty);
	while (lil->env) {
		lil_env_t next = lil->env->parent;
		lil_free_env(lil->env);
		lil->env = next;
	}
	free(lil);
}

static lil_value_t cmd_command(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_command_t cmd;
	if (argc != 3) return NULL;
	cmd = add_command(lil, lil_to_string(argv[0]));
	cmd->argnames = lil_list_from_value(argv[1]);
	cmd->code = clone_value(argv[2]);
	return NULL;
}

static lil_value_t cmd_set(lil_t lil, size_t argc, lil_value_t* argv)
{
	size_t i = 0;
	lil_var_t var;
	if (!argc) return NULL;
	while (i < argc) {
		if (argc == i + 1) return clone_value(get_var(lil, lil_to_string(argv[i])));
		var = set_var(lil, lil_to_string(argv[i]), argv[i + 1], 0);
		i += 2;
	}
	return clone_value(var->v);
}

static lil_value_t cmd_write(lil_t lil, size_t argc, lil_value_t* argv)
{
	size_t i;
	for (i=0; i<argc; i++) {
		if (i) printf(" ");
		printf("%s", lil_to_string(argv[i]));
	}
	return NULL;
}

static lil_value_t cmd_print(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_value_t r = cmd_write(lil, argc, argv);
	printf("\n");
	return r;
}

static lil_value_t cmd_eval(lil_t lil, size_t argc, lil_value_t* argv)
{
	if (argc == 1) return lil_parse(lil, lil_to_string(argv[0]));
	if (argc > 1) {
		lil_value_t val = alloc_value(NULL), r;
		size_t i;
		for (i=0; i<argc; i++) {
			if (i) append_char(val, ' ');
			append_val(val, argv[i]);
		}
		r = lil_parse(lil, lil_to_string(val));
		free_value(val);
		return r;
	}
	return NULL;
}

static lil_value_t cmd_count(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_list_t list;
	char buff[64];
	if (!argc) return alloc_value("0");
	list = lil_list_from_value(argv[0]);
	sprintf(buff, "%u", (unsigned int)list->c);
	lil_free_list(list);
	return alloc_value(buff);
}

static lil_value_t cmd_foreach(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_list_t list, rlist;
	lil_value_t r;
	size_t i;
	if (argc < 2) return NULL;
	rlist = lil_alloc_list();
	list = lil_list_from_value(argv[0]);
	for (i=0; i<list->c; i++) {
		lil_value_t rv;
		set_var(lil, "i", list->v[i], 1);
		rv = lil_parse(lil, lil_to_string(argv[1]));
		if (rv->l) lil_list_append(rlist, rv);
	}
	r = lil_list_to_value(rlist);
	lil_free_list(rlist);
	return r;
}

static lil_value_t cmd_return(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil->breakrun = 1;
	return argc < 1 ? NULL : clone_value(argv[0]);
}

static lil_value_t cmd_expr(lil_t lil, size_t argc, lil_value_t* argv)
{
	if (argc == 1) return lil_eval_expr(lil, argv[0]);
	if (argc > 1) {
		lil_value_t val = alloc_value(NULL), r;
		size_t i;
		for (i=0; i<argc; i++) {
			if (i) append_char(val, ' ');
			append_val(val, argv[i]);
		}
		r = lil_eval_expr(lil, val);
		free_value(val);
		return r;
	}
	return NULL;
}

static void register_stdcmds(lil_t lil)
{
	lil_register(lil, "command", cmd_command);
	lil_register(lil, "set", cmd_set);
	lil_register(lil, "write", cmd_write);
	lil_register(lil, "print", cmd_print);
	lil_register(lil, "eval", cmd_eval);
	lil_register(lil, "count", cmd_count);
	lil_register(lil, "foreach", cmd_foreach);
	lil_register(lil, "return", cmd_return);
	lil_register(lil, "expr", cmd_expr);
}
