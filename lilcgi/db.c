/*
 * LILCGI - Little Interpreted Language CGI runner
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
#include <lil.h>
#include "sqlite3.h"
#include "db.h"

#define DEFAULT_BUSY_TIMEOUT 5000

/* Objects */
#define OT_CONN 0
#define OT_STMT 1

typedef struct _dbobj_t
{
    char* name;
    int type;
    void* obj;
    sqlite3* db;
} dbobj_t;

static dbobj_t** ob;
static size_t obc;

static void obj_reg(const char* name, int type, void* objref, sqlite3* db)
{
    dbobj_t* obj = malloc(sizeof(dbobj_t));
    obj->name = strdup(name);
    obj->type = type;
    obj->obj = objref;
    obj->db = db;
    ob = realloc(ob, sizeof(dbobj_t*)*(obc + 1));
    ob[obc++] = obj;
}

static void obj_unreg(dbobj_t* obj)
{
    size_t i;
    switch (obj->type) {
    case OT_CONN:
        sqlite3_close((sqlite3*)obj->obj);
        break;
    case OT_STMT:
        sqlite3_finalize((sqlite3_stmt*)obj->obj);
        break;
    }
    for (i=0; i<obc; i++) {
        if (ob[i] == obj) {
            free(ob[i]->name);
            free(ob[i]);
            for (; i<obc - 1; i++)
                ob[i] = ob[i + 1];
            ob[--obc] = NULL;
            break;
        }
    }
}

static dbobj_t* obj_find(const char* name)
{
    size_t i;
    for (i=0; i<obc; i++)
        if (!strcmp(ob[i]->name, name))
            return ob[i];
    return NULL;
}

/* Functions */
typedef struct _db_exec_context_t
{
    lil_t lil;
    const char* code;
} db_exec_context;

static lil_value_t fnc_db_open(lil_t lil, size_t argc, lil_value_t* argv)
{
    const char* dbname;
    const char* dbsource;
    sqlite3* db;
    if (argc < 2) return NULL;

    dbname = lil_to_string(argv[0]);
    dbsource = lil_to_string(argv[1]);

    if (!dbname[0] || !dbsource[0]) return NULL;

    if (sqlite3_open(dbsource, &db) != SQLITE_OK) {
        sqlite3_close(db);
        return NULL;
    }

    obj_reg(dbname, OT_CONN, db, db);
    sqlite3_busy_timeout(db, DEFAULT_BUSY_TIMEOUT);

    return lil_alloc_integer(1);
}

static lil_value_t fnc_db_finalize(lil_t lil, size_t argc, lil_value_t* argv)
{
    dbobj_t* obj;
    if (argc < 1) return NULL;
    obj = obj_find(lil_to_string(argv[0]));
    if (!obj) return NULL;
    obj_unreg(obj);
    return lil_alloc_integer(1);
}

static lil_value_t fnc_db_prepare(lil_t lil, size_t argc, lil_value_t* argv)
{
    dbobj_t* obj;
    const char* dbname;
    const char* stname;
    const char* query;
    sqlite3* db;
    sqlite3_stmt* stmt = NULL;
    if (argc < 3) return NULL;

    dbname = lil_to_string(argv[0]);
    stname = lil_to_string(argv[1]);
    query = lil_to_string(argv[2]);

    if (!stname[0] || !query[0]) return NULL;

    obj = obj_find(dbname);
    if (!obj || obj->type != OT_CONN) return NULL;
    db = obj->obj;

    if (sqlite3_prepare_v2(db, query, -1, &stmt, NULL) != SQLITE_OK) {
        if (stmt) sqlite3_finalize(stmt);
        return NULL;
    }

    obj_reg(stname, OT_STMT, stmt, db);

    return lil_alloc_integer(1);
}

static lil_value_t fnc_db_step(lil_t lil, size_t argc, lil_value_t* argv)
{
    sqlite3_stmt* stmt = NULL;
    dbobj_t* obj;
    int r;
    if (argc < 1) return NULL;
    obj = obj_find(lil_to_string(argv[0]));
    if (!obj || obj->type != OT_STMT) return NULL;
    stmt = obj->obj;
    r = sqlite3_step(stmt);
    if (r != SQLITE_DONE && r != SQLITE_ROW && r != SQLITE_OK) return NULL;
    return lil_alloc_integer(r == SQLITE_ROW ? 1 : 0);
}

static lil_value_t fnc_db_reset(lil_t lil, size_t argc, lil_value_t* argv)
{
    sqlite3_stmt* stmt = NULL;
    dbobj_t* obj;
    int r;
    if (argc < 1) return NULL;
    obj = obj_find(lil_to_string(argv[0]));
    if (!obj || obj->type != OT_STMT) return NULL;
    stmt = obj->obj;
    r = sqlite3_reset(stmt);
    return lil_alloc_integer(r == SQLITE_OK ? 1 : 0);
}

static lil_value_t fnc_db_get(lil_t lil, size_t argc, lil_value_t* argv)
{
    sqlite3_stmt* stmt = NULL;
    dbobj_t* obj;
    lil_value_t r;
    int index;
    const char* type;
    if (argc < 2) return NULL;
    type = lil_to_string(argv[0]);
    obj = obj_find(lil_to_string(argv[1]));
    if (!obj || obj->type != OT_STMT) return NULL;
    stmt = obj->obj;
    if (!strcmp(type, "columns")) {
        return lil_alloc_integer(sqlite3_column_count(stmt));
    }
    if (argc < 3) return NULL;
    index = (int)lil_to_integer(argv[2]);
    if (index < 0 || index >= sqlite3_column_count(stmt)) return NULL;
    if (!strcmp(type, "double")) r = lil_alloc_double(sqlite3_column_double(stmt, index));
    else if (!strcmp(type, "integer")) r = lil_alloc_integer(sqlite3_column_int64(stmt, index));
    else if (!strcmp(type, "string")) r = lil_alloc_string((const char*)sqlite3_column_text(stmt, index));
    else if (!strcmp(type, "name")) r = lil_alloc_string(sqlite3_column_name(stmt, index));
    else if (!strcmp(type, "type")) {
        switch (sqlite3_column_type(stmt, index)) {
        case SQLITE_INTEGER: r = lil_alloc_string("integer"); break;
        case SQLITE_FLOAT: r = lil_alloc_string("double"); break;
        case SQLITE_TEXT: r = lil_alloc_string("string"); break;
        default: r = lil_alloc_string("unknown");
        }
    } else r = NULL;
    return r;
}

static int db_exec_callback(void* ptr, int cols, char** colvals, char** colnames)
{
    db_exec_context* ctx = ptr;
    int r = 0;
    lil_value_t tcols, tcolvals = NULL, tcolnames = NULL;
    lil_list_t list;
    if (!ctx->code[0]) return 0;

    tcols = lil_alloc_integer(cols);
    lil_set_var(ctx->lil, "db:count", tcols, LIL_SETVAR_LOCAL);
    lil_free_value(tcols);
    if (tcols) {
        int i;
        list = lil_alloc_list();
        for (i=0; i<cols; i++)
            lil_list_append(list, lil_alloc_string(colvals[i]));
        tcolvals = lil_list_to_value(list, 1);
        lil_free_list(list);
        list = lil_alloc_list();
        for (i=0; i<cols; i++)
            lil_list_append(list, lil_alloc_string(colnames[i]));
        tcolnames = lil_list_to_value(list, 1);
        lil_free_list(list);
        lil_set_var(ctx->lil, "db:values", tcolvals, LIL_SETVAR_LOCAL);
        lil_set_var(ctx->lil, "db:names", tcolnames, LIL_SETVAR_LOCAL);
        lil_free_value(tcolvals);
        lil_free_value(tcolnames);
    }

    lil_free_value(lil_parse(ctx->lil, ctx->code, 0, 0));
    return r;
}

static lil_value_t fnc_db_exec(lil_t lil, size_t argc, lil_value_t* argv)
{
    dbobj_t* obj;
    const char* dbname;
    const char* query;
    sqlite3* db;
    db_exec_context ctx;
    lil_value_t val;
    char* errormsg;
    if (argc < 2) return lil_alloc_string("not enough arguments to db:exec");

    dbname = lil_to_string(argv[0]);
    query = lil_to_string(argv[1]);

    if (!query[0]) return lil_alloc_string("no query given to db:exec");;

    obj = obj_find(dbname);
    if (!obj || obj->type != OT_CONN) return lil_alloc_string("invalid database connection object name");;
    db = obj->obj;

    if (argc > 2) {
        ctx.lil = lil;
        ctx.code = lil_to_string(argv[2]);
    }

    errormsg = NULL;
    sqlite3_exec(db, query, argc > 2 ? db_exec_callback : NULL, &ctx, &errormsg);
    if (errormsg == NULL)
        return NULL;

    val = lil_alloc_string(errormsg);
    sqlite3_free(errormsg);

    return val;
}

static lil_value_t fnc_db_escape(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t val = lil_alloc_string("");
    char* escaped;
    size_t i;
    for (i=0; i<argc; i++) {
        if (i) lil_append_char(val, ' ');
        lil_append_val(val, argv[i]);
    }
    escaped = sqlite3_mprintf("%q", lil_to_string(val));
    lil_free_value(val);
    val = lil_alloc_string(escaped);
    sqlite3_free(escaped);
    return val;
}

/* Init/shutdown */
void db_shutdown(void)
{
    size_t i = 0;
    while (i < obc) {
        if (ob[i]->type == OT_STMT)
            obj_unreg(ob[i]);
        else i++;
    }
    i = 0;
    while (i < obc) {
        if (ob[i]->type == OT_CONN)
            obj_unreg(ob[i]);
        else i++;
    }
    free(ob);
    ob = NULL;
    obc = 0;
}

void db_register_funcs(lil_t lil)
{
    lil_register(lil, "db:open", fnc_db_open);
    lil_register(lil, "db:finalize", fnc_db_finalize);
    lil_register(lil, "db:prepare", fnc_db_prepare);
    lil_register(lil, "db:step", fnc_db_step);
    lil_register(lil, "db:reset", fnc_db_reset);
    lil_register(lil, "db:get", fnc_db_get);
    lil_register(lil, "db:exec", fnc_db_exec);
    lil_register(lil, "db:escape", fnc_db_escape);
}
