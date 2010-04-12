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

struct _lil_command_t
{
	char* name;
	lil_command_proc_t proc;
};

struct _lil_t
{
	const char* code; /* need save on parse */
	size_t clen; /* need save on parse */
	size_t head; /* need save on parse */
	lil_command_t* cmd;
	size_t cmds;
	lil_var_t* var;
	size_t vars;
	lil_value_t empty;
};

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

int lil_register(lil_t lil, const char* name, lil_command_proc_t proc)
{
	lil_command_t cmd = calloc(1, sizeof(struct _lil_command_t));
	lil_command_t* ncmd;
	cmd->name = strclone(name);
	cmd->proc = proc;
	ncmd = realloc(lil->cmd, sizeof(lil_command_t)*(lil->cmds + 1));
	if (!ncmd) {
		free(cmd);
		return 0;
	}
	lil->cmd = ncmd;
	ncmd[lil->cmds++] = cmd;
	return 1;
}

static lil_command_t find_cmd(lil_t lil, const char* name)
{
	size_t i;
	for (i=0; i<lil->cmds; i++)
		if (!strcmp(lil->cmd[i]->name, name)) return lil->cmd[i];
	return NULL;
}

static lil_var_t set_var(lil_t lil, const char* name, lil_value_t val)
{
	lil_var_t* nvar;
	if (lil->vars > 0) {
		size_t i;
		i = lil->vars - 1;
		while (1) {
			if (!strcmp(lil->var[i]->n, name)) {
				free_value(lil->var[i]->v);
				lil->var[i]->v = clone_value(val);
				return lil->var[i];
			}
			if (i == 0) break;
			i--;
		}
	}
	nvar = realloc(lil->var, sizeof(struct _lil_var_t)*(lil->vars + 1));
	if (!nvar) {
		/* TODO: report memory error */
		return NULL;
	}
	lil->var = nvar;
	nvar[lil->vars] = calloc(1, sizeof(struct _lil_var_t));
	nvar[lil->vars]->n = strclone(name);
	nvar[lil->vars]->v = clone_value(val);
	return nvar[lil->vars++];
}

static lil_value_t get_var(lil_t lil, const char* name)
{
	size_t i;
	if (lil->vars > 0) {
		i = lil->vars - 1;
		while (1) {
			if (!strcmp(lil->var[i]->n, name))
				return lil->var[i]->v;
			if (i == 0) break;
			i--;
		}
	}
	return lil->empty;
}

static void register_stdcmds(lil_t lil);

lil_t lil_new(void)
{
	lil_t lil = calloc(1, sizeof(struct _lil_t));
	lil->empty = alloc_value(NULL);
	register_stdcmds(lil);
	return lil;
}

static void skip_spaces(lil_t lil)
{
	while (lil->head < lil->clen && isspace(lil->code[lil->head])) lil->head++;
}

static lil_value_t next_word(lil_t lil)
{
	lil_value_t val;
	skip_spaces(lil);
	if (lil->code[lil->head] == '{') {
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
	} if (lil->code[lil->head] == '[') {
		size_t cnt = 1;
		lil_value_t cmd = alloc_value(NULL);
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
	} else if (lil->code[lil->head] == '"' || lil->code[lil->head] == '\'') {
		char sc = lil->code[lil->head++];
		val = alloc_value(NULL);
		while (lil->head < lil->clen) {
			if (lil->code[lil->head] == '\\') {
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
		while (lil->head < lil->clen && !isspace(lil->code[lil->head])) {
			append_char(val, lil->code[lil->head++]);
		}
	}
	return val;
}

lil_value_t lil_parse(lil_t lil, const char* code)
{
	char* save_code = lil->code;
	size_t save_clen = lil->clen;
	size_t save_head = lil->head;
	lil_value_t val = NULL;
	lil_value_t* word = NULL;
	lil_value_t* nword;
	size_t i, words = 0;
	lil->code = code;
	lil->clen = strlen(code);
	lil->head = 0;
	while (lil->head < lil->clen) {
		lil_value_t w = next_word(lil);
		if (!w->l) {
			free_value(w);
			goto cleanup;
		}
		skip_spaces(lil);
		
		nword = realloc(word, sizeof(lil_value_t)*(words + 1));
		if (!nword) {
			/* TODO: report memory error */
			goto cleanup;
		}
		nword[words++] = w;
		word = nword;
	}
	
	if (words) {
		lil_command_t cmd = find_cmd(lil, lil_to_string(word[0]));
		if (!cmd) {
			printf("unknown command %s\n", lil_to_string(word[0]));
			goto cleanup;
		}
		val = cmd->proc(lil, words - 1, word + 1);
	}
cleanup:
	for (i=0; i<words; i++) free_value(word[i]);
	free(word);
	lil->code = save_code;
	lil->clen = save_clen;
	lil->head = save_head;
	return val ? val : alloc_value(NULL);
}

const char* lil_to_string(lil_value_t val)
{
	return val->d ? val->d : "";
}

void lil_release(lil_value_t val)
{
	if (val) free_value(val);
}
			
void lil_free(lil_t lil)
{
	free_value(lil->empty);
	free(lil);
}

static lil_value_t cmd_set(lil_t lil, size_t argc, lil_value_t* argv)
{
	size_t i;
	lil_value_t val;
	lil_var_t var;
	if (!argc) return NULL;
	if (argc == 1) return clone_value(get_var(lil, lil_to_string(argv[0])));
	
	val = alloc_value(NULL);
	for (i=1; i<argc; i++) {
		if (i > 1) append_char(val, ' ');
		append_val(val, argv[i]);
	}
	
	var = set_var(lil, lil_to_string(argv[0]), val);
	free_value(val);
	
	return clone_value(var->v);
}

static lil_value_t cmd_put(lil_t lil, size_t argc, lil_value_t* argv)
{
	size_t i;
	for (i=0; i<argc; i++) {
		if (i) printf(" ");
		printf("%s", lil_to_string(argv[i]));
	}
	return NULL;
}

static lil_value_t cmd_putln(lil_t lil, size_t argc, lil_value_t* argv)
{
	lil_value_t r = cmd_put(lil, argc, argv);
	printf("\n");
	return r;
}

static void register_stdcmds(lil_t lil)
{
	lil_register(lil, "set", cmd_set);
	lil_register(lil, "put", cmd_put);
	lil_register(lil, "putln", cmd_putln);
}
