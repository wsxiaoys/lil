fnc_strpos(lil_t lil, size_t argc, lil_value_t* argv)
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

static LILCALLBACK lil_value_t fnc_length(lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t i, total = 0;
    for (i=0; i<argc; i++) {
        if (i) total++;
        total += strlen(lil_to_string(argv[i]));
    }
    return lil_alloc_integer((int64_t)total);
}

static lil_value_t real_trim(const char* str, const char* chars, int left, int right)
{
    int base = 0;
    lil_value_t r = NULL;
    if (left) {
        while (str[base] && strchr(chars, str[base])) base++;
        if (!right) r = lil_alloc_string(str[base] ? str + base : NULL);
    }
    if (right) {
        size_t len;
        char* s;
        s = strclone(str + base);
        len = strlen(s);
        while (len && strchr(chars, s[len - 1])) len--;
        s[len] = 0;
        r = lil_alloc_string(s);
        free(s);
    }
    return r;
}

static LILCALLBACK lil_value_t fnc_trim(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (!argc) return NULL;
    return real_trim(lil_to_string(argv[0]), argc < 2 ? " \f\n\r\t\v" : lil_to_string(argv[1]), 1, 1);
}

static LILCALLBACK lil_value_t fnc_ltrim(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (!argc) return NULL;
    return real_trim(lil_to_string(argv[0]), argc < 2 ? " \f\n\r\t\v" : lil_to_string(argv[1]), 1, 0);
}

static LILCALLBACK lil_value_t fnc_rtrim(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (!argc) return NULL;
    return real_trim(lil_to_string(argv[0]), argc < 2 ? " \f\n\r\t\v" : lil_to_string(argv[1]), 0, 1);
}

static LILCALLBACK lil_value_t fnc_strcmp(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc < 2) return NULL;
    return lil_alloc_integer(strcmp(lil_to_string(argv[0]), lil_to_string(argv[1])));
}

static LILCALLBACK lil_value_t fnc_streq(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc < 2) return NULL;
    return lil_alloc_integer(strcmp(lil_to_string(argv[0]), lil_to_string(argv[1]))?0:1);
}

static LILCALLBACK lil_value_t fnc_repstr(lil_t lil, size_t argc, lil_value_t* argv)
{
    const char* from;
    const char* to;
    char* src;
    const char* sub;
    size_t idx;
    size_t fromlen;
    size_t tolen;
    size_t srclen;
    lil_value_t r;
    if (argc < 1) return NULL;
    if (argc < 3) return lil_clone_value(argv[0]);
    from = lil_to_string(argv[1]);
    to = lil_to_string(argv[2]);
    if (!from[0]) return NULL;
    src = strclone(lil_to_string(argv[0]));
    srclen = strlen(src);
    fromlen = strlen(from);
    tolen = strlen(to);
    while ((sub = strstr(src, from))) {
        char* newsrc = malloc(srclen - fromlen + tolen + 1);
        idx = sub - src;
        if (idx) memcpy(newsrc, src, idx);
        memcpy(newsrc + idx, to, tolen);
        memcpy(newsrc + idx + tolen, src + idx + fromlen, srclen - idx - fromlen);
        srclen = srclen - fromlen + tolen;
        free(src);
        src = newsrc;
        src[srclen] = 0;
    }
    r = lil_alloc_string(src);
    free(src);
    return r;
}

static LILCALLBACK lil_value_t fnc_split(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_list_t list;
    const char* sep = " ";
    size_t i;
    lil_value_t val;
    const char* str;
    if (argc == 0) return NULL;
    if (argc > 1) {
        sep = lil_to_string(argv[1]);
        if (!sep || !sep[0]) return lil_clone_value(argv[0]);
    }
    val = lil_alloc_string("");
    str = lil_to_string(argv[0]);
    list = lil_alloc_list();
    for (i=0; str[i]; i++) {
        if (strchr(sep, str[i])) {
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

static LILCALLBACK lil_value_t fnc_try(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t r;
    if (argc < 1) return NULL;
    if (lil->error) return NULL;
    r = lil_parse_value(lil, argv[0], 0);
    if (lil->error) {
        lil->error = ERROR_NOERROR;
        lil_free_value(r);
        if (argc > 1) r = lil_parse_value(lil, argv[1], 0);
        else r = 0;
    }
    return r;
}

static LILCALLBACK lil_value_t fnc_error(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_set_error(lil, argc > 0 ? lil_to_string(argv[0]) : NULL);
    return NULL;
}

static LILCALLBACK lil_value_t fnc_exit(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (lil->callback[LIL_CALLBACK_EXIT]) {
        lil_exit_callback_proc_t proc = (lil_exit_callback_proc_t)lil->callback[LIL_CALLBACK_EXIT];
        proc(lil, argc > 0 ? argv[0] : NULL);
    }
    return NULL;
}

static LILCALLBACK lil_value_t fnc_source(lil_t lil, size_t argc, lil_value_t* argv)
{
    FILE* f;
    size_t size;
    char* buffer;
    lil_value_t r;
    if (argc < 1) return NULL;
    if (lil->callback[LIL_CALLBACK_SOURCE]) {
        lil_source_callback_proc_t proc = (lil_source_callback_proc_t)lil->callback[LIL_CALLBACK_SOURCE];
        buffer = proc(lil, lil_to_string(argv[0]));
    } else if (lil->callback[LIL_CALLBACK_READ]) {
        lil_read_callback_proc_t proc = (lil_read_callback_proc_t)lil->callback[LIL_CALLBACK_READ];
        buffer = proc(lil, lil_to_string(argv[0]));
    } else {
        f = fopen(lil_to_string(argv[0]), "rb");
        if (!f) return NULL;
        fseek(f, 0, SEEK_END);
        size = ftell(f);
        fseek(f, 0, SEEK_SET);
        buffer = malloc(size + 1);
        fread(buffer, 1, size, f);
        buffer[size] = 0;
        fclose(f);
    }
    r = lil_parse(lil, buffer, 0, 0);
    free(buffer);
    return r;
}

static LILCALLBACK lil_value_t fnc_lmap(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_list_t list;
    size_t i;
    if (argc < 2) return NULL;
    list = lil_subst_to_list(lil, argv[0]);
    for (i=1; i<argc; i++)
        lil_set_var(lil, lil_to_string(argv[i]), lil_list_get(list, i - 1), LIL_SETVAR_LOCAL);
    lil_free_list(list);
    return NULL;
}

static LILCALLBACK lil_value_t fnc_rand(lil_t lil, size_t argc, lil_value_t* argv)
{
    return lil_alloc_double(rand()/(double)RAND_MAX);
}

static LILCALLBACK lil_value_t fnc_catcher(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc == 0) {
        return lil_alloc_string(lil->catcher);
    } else {
        const char* catcher = lil_to_string(argv[0]);
        free(lil->catcher);
        lil->catcher = catcher[0] ? strclone(catcher) : NULL;
    }
    return NULL;
}

static void register_stdcmds(lil_t lil)
{
    lil_register(lil, "reflect", fnc_reflect);
    lil_register(lil, "func", fnc_func);
    lil_register(lil, "rename", fnc_rename);
    lil_register(lil, "unusedname", fnc_unusedname);
    lil_register(lil, "quote", fnc_quote);
    lil_register(lil, "set", fnc_set);
    lil_register(lil, "write", fnc_write);
    lil_register(lil, "print", fnc_print);
    lil_register(lil, "eval", fnc_eval);
    lil_register(lil, "upeval", fnc_upeval);
    lil_register(lil, "downeval", fnc_downeval);
    lil_register(lil, "jaileval", fnc_jaileval);
    lil_register(lil, "count", fnc_count);
    lil_register(lil, "index", fnc_index);
    lil_register(lil, "indexof", fnc_indexof);
    lil_register(lil, "filter", fnc_filter);
    lil_register(lil, "list", fnc_list);
    lil_register(lil, "append", fnc_append);
    lil_register(lil, "slice", fnc_slice);
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
    lil_register(lil, "char", fnc_char);
    lil_register(lil, "charat", fnc_charat);
    lil_register(lil, "codeat", fnc_codeat);
    lil_register(lil, "substr", fnc_substr);
    lil_register(lil, "strpos", fnc_strpos);
    lil_register(lil, "length", fnc_length);
    lil_register(lil, "trim", fnc_trim);
    lil_register(lil, "ltrim", fnc_ltrim);
    lil_register(lil, "rtrim", fnc_rtrim);
    lil_register(lil, "strcmp", fnc_strcmp);
    lil_register(lil, "streq", fnc_streq);
    lil_register(lil, "repstr", fnc_repstr);
    lil_register(lil, "split", fnc_split);
    lil_register(lil, "try", fnc_try);
    lil_register(lil, "error", fnc_error);
    lil_register(lil, "exit", fnc_exit);
    lil_register(lil, "source", fnc_source);
    lil_register(lil, "lmap", fnc_lmap);
    lil_register(lil, "rand", fnc_rand);
    lil_register(lil, "catcher", fnc_catcher);
    lil->syscmds = lil->cmds;
}
