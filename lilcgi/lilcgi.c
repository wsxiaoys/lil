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
#include <ctype.h>
#include <unistd.h>
#include <sys/time.h>
#include <lil.h>
#include "md5.h"
#include "db.h"

typedef struct _qattr_t
{
    lil_value_t name;
    lil_value_t value;
} qattr_t;

typedef qattr_t cookie_t;

static lil_value_t gi_response;
static lil_list_t gi_headers;
static qattr_t** qattr;
static size_t qattrc;
static cookie_t** cookie;
static size_t cookies;

/* Random number generator (based on ISAAC) */
static uint32_t girand_res[256], girand_cnt;
static uint32_t girand_mm[256], girand_aa, girand_bb, girand_cc;
static void girand_cycle(void)
{
    register uint32_t i, x, y;
    girand_cc++;
    girand_bb += girand_cc;

    for (i=0; i<256; i++) {
        x = girand_mm[i];
        switch (i&3) {
        case 0: girand_aa ^= girand_aa<<13; break;
        case 1: girand_aa ^= girand_aa<<6; break;
        case 2: girand_aa ^= girand_aa<<2; break;
        case 3: girand_aa ^= girand_aa<<16; break;
        }
        girand_aa = girand_mm[(i + 128)&0xFF] + girand_aa;
        girand_mm[i] = y = girand_mm[(x >> 2)&0xFF] + girand_aa + girand_bb;
        girand_res[i] = girand_bb = girand_mm[(y >> 10)&0xFF] + x;
    }
}

#define girand_mix(a,b,c,d,e,f,g,h) { \
   a^=b<<11; d+=a; b+=c; \
   b^=c>>2;  e+=b; c+=d; \
   c^=d<<8;  f+=c; d+=e; \
   d^=e>>16; g+=d; e+=f; \
   e^=f<<10; h+=e; f+=g; \
   f^=g>>4;  a+=f; g+=h; \
   g^=h<<8;  b+=g; h+=a; \
   h^=a>>9;  c+=h; a+=b; \
}

static uint32_t girand_timebasedseed(void)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec*10000 + tv.tv_usec/100;
}

static void girand_init(void)
{
    int i;
    uint32_t a, b, c, d, e, f, g, h;
    girand_aa = girand_bb = girand_cc = 0;
    a = b = c = d = e = f = g = h = 0x9e3779b9;
    for (i=0; i<4; i++) girand_mix(a, b, c, d, e, f, g, h);
    srand(girand_timebasedseed() + getpid());
    for (i=0; i<256; i++) girand_res[i] = girand_mm[i] = (rand()<<16)|rand();
    for (i=0; i<256; i += 8) {
        a += girand_res[i];
        b += girand_res[i + 1];
        c += girand_res[i + 2];
        d += girand_res[i + 3];
        e += girand_res[i + 4];
        f += girand_res[i + 5];
        g += girand_res[i + 6];
        h += girand_res[i + 7];
        girand_mix(a, b, c, d, e, f, g, h);
        girand_mm[i] = a;
        girand_mm[i + 1] = b;
        girand_mm[i + 2] = c;
        girand_mm[i + 3] = d;
        girand_mm[i + 4] = e;
        girand_mm[i + 5] = f;
        girand_mm[i + 6] = g;
        girand_mm[i + 7] = h;
    }
    for (i=0; i<256; i += 8) {
        a += girand_mm[i];
        b += girand_mm[i + 1];
        c += girand_mm[i + 2];
        d += girand_mm[i + 3];
        e += girand_mm[i + 4];
        f += girand_mm[i + 5];
        g += girand_mm[i + 6];
        h += girand_mm[i + 7];
        girand_mix(a, b, c, d, e, f, g, h);
        girand_mm[i + 0] = a;
        girand_mm[i + 1] = b;
        girand_mm[i + 2] = c;
        girand_mm[i + 3] = d;
        girand_mm[i + 4] = e;
        girand_mm[i + 5] = f;
        girand_mm[i + 6] = g;
        girand_mm[i + 7] = h;
    }

    for (i=(rand()&0xF) + 2; i; i--) girand_cycle();
    girand_cnt = 256;
}

static uint32_t girand(void)
{
    if (girand_cnt == 256) {
        girand_cnt = 0;
        girand_cycle();
    }
    return girand_res[girand_cnt++];
}

/* Query attributes */
static void qattr_add(lil_value_t name, lil_value_t value)
{
    qattr_t* a = malloc(sizeof(qattr_t));
    a->name = name;
    a->value = value;
    qattr = realloc(qattr, sizeof(qattr_t*)*(qattrc + 1));
    qattr[qattrc++] = a;
}

static void qattr_free(void)
{
    size_t i;
    for (i=0; i<qattrc; i++) {
        lil_free_value(qattr[i]->name);
        lil_free_value(qattr[i]->value);
        free(qattr[i]);
    }
    free(qattr);
}

static lil_value_t qattr_find(lil_value_t name)
{
    const char* namestr = lil_to_string(name);
    size_t i;
    for (i=0; i<qattrc; i++)
        if (!strcmp(namestr, lil_to_string(qattr[i]->name)))
            return qattr[i]->value;
    return NULL;
}

static int hexnib(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return 0;
}

static int nibhex(char c)
{
    if (c >= 0 && c <= 9) return c + '0';
    return 'a' + (c - 10);
}

static const char* tohex8(uint8_t v)
{
    static char tmp[3];
    tmp[0] = nibhex(v>>4);
    tmp[1] = nibhex(v&0x0F);
    tmp[2] = 0;
    return tmp;
}

static const char* tohex16(uint16_t v)
{
    static char tmp[5];
    strcpy(tmp, tohex8(v>>8));
    strcpy(tmp + 2, tohex8(v&0xFF));
    return tmp;
}

static const char* tohex32(uint32_t v)
{
    static char tmp[9];
    strcpy(tmp, tohex16(v>>16));
    strcpy(tmp + 4, tohex16(v&0xFFFF));
    return tmp;
}

static lil_value_t qattr_parse_query_string_part(const char* qs, size_t* h, size_t len, char stop1, char stop2)
{
    lil_value_t val = lil_alloc_string("");
    while (*h < len) {
        if (qs[*h] == '+') lil_append_char(val, ' ');
        else if(qs[*h] == '%' && *h < len - 2) {
            int hnib = hexnib(qs[++(*h)]);
            int lnib = hexnib(qs[++(*h)]);
            char ch = (hnib << 4)|lnib;
            lil_append_char(val, ch?ch:' ');
        } else if (qs[*h] == stop1 || qs[*h] == stop2) break;
        else lil_append_char(val, qs[*h]);
        (*h)++;
    }
    return val;
}

static void qattr_parse_query_string(const char* qs)
{
    size_t h = 0, len;
    if (!qs) return;
    len = strlen(qs);
    while (h < len) {
        lil_value_t name, value = NULL;
        name = qattr_parse_query_string_part(qs, &h, len, '=', 0);
        if (qs[h] == '=') {
            h++;
            value = qattr_parse_query_string_part(qs, &h, len, '&', ';');
        }
        if (value)
            qattr_add(name, value);
        else
            lil_free_value(name);
        if (qs[h] == '&' || qs[h] == ';') h++;
    }
}

static void qattr_load_attrs(void)
{
    const char* method = getenv("REQUEST_METHOD");

    /* load QUERY_STRING */
    qattr_parse_query_string(getenv("QUERY_STRING"));

    /* check for POST */
    if (method && !strcmp(method, "POST")) {
        const char* content_type = getenv("CONTENT_TYPE");
        size_t content_length;
        char* content;
        if (!content_type) return;
        if (strcmp(content_type, "application/x-www-form-urlencoded")) return;
        content_length = atoi(getenv("CONTENT_LENGTH"));
        content = malloc(content_length + 1);
        fread(content, content_length, 1, stdin);
        content[content_length] = 0;
        qattr_parse_query_string(content);
        free(content);
    }
}


/* Cookies */
static void cookies_add(lil_value_t name, lil_value_t value)
{
    cookie_t* a = malloc(sizeof(cookie_t));
    a->name = name;
    a->value = value;
    cookie = realloc(cookie, sizeof(cookie_t*)*(cookies + 1));
    cookie[cookies++] = a;
}

static void cookies_free(void)
{
    size_t i;
    for (i=0; i<cookies; i++) {
        lil_free_value(cookie[i]->name);
        lil_free_value(cookie[i]->value);
        free(cookie[i]);
    }
    free(cookie);
}

static lil_value_t cookies_find(lil_value_t name)
{
    const char* namestr = lil_to_string(name);
    size_t i;
    for (i=0; i<cookies; i++)
        if (!strcmp(namestr, lil_to_string(cookie[i]->name)))
            return cookie[i]->value;
    return NULL;
}

static void cookies_parse(void)
{
    size_t h = 0, len;
    const char* cookiestr = getenv("HTTP_COOKIE");
    if (!cookiestr || !cookiestr[0]) return;
    len = strlen(cookiestr);
    while (h < len) {
        lil_value_t name, value = NULL;
        name = lil_alloc_string(NULL);
        while (h < len) {
            if (cookiestr[h] == '=') break;
            lil_append_char(name, cookiestr[h++]);
        }
        if (cookiestr[h] == '=') {
            value = lil_alloc_string(NULL);
            h++;
            if (cookiestr[h] == '"') {
                h++;
                while (h < len) {
                    if (cookiestr[h] == '"') {
                        h++;
                        break;
                    } else if (cookiestr[h] == '\\') {
                        h++;
                        lil_append_char(value, cookiestr[h++]);
                    } else lil_append_char(value, cookiestr[h++]);
                }
            } else {
                while (h < len) {
                    if (cookiestr[h] == ';' || cookiestr[h] == ',') break;
                    lil_append_char(value, cookiestr[h++]);
                }
            }
        }
        if (cookiestr[h] == ';' || cookiestr[h] == ',') h++;
        while (h < len && isspace(cookiestr[h])) h++;

        if (!value || lil_to_string(value)[0] == '$') {
            lil_free_value(value);
            lil_free_value(name);
            continue;
        }

        cookies_add(name, value);
    }
}

/* Utility functions */
static int ut_escape_html(lil_value_t r, lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t i;
    if (argc < 1) return 0;
    for (i=0; i<argc; i++) {
        const char* str = lil_to_string(argv[i]);
        size_t h;
        if (i) lil_append_char(r, ' ');
        for (h=0; str[h]; h++) {
            switch (str[h]) {
            case '&':
                lil_append_string(r, "&amp;");
                break;
            case '<':
                lil_append_string(r, "&lt;");
                break;
            case '>':
                lil_append_string(r, "&gt;");
                break;
            case '"':
                lil_append_string(r, "&quot;");
                break;
            case '\'':
                lil_append_string(r, "&#39;");
                break;
            default:
                lil_append_char(r, str[h]);
            }
        }
    }
    return 1;
}

static lil_value_t ut_escape_url(lil_value_t r, lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t i;
    if (argc < 1) return NULL;
    for (i=0; i<argc; i++) {
        const char* str = lil_to_string(argv[i]);
        size_t h;
        if (i) lil_append_char(r, '+');
        for (h=0; str[h]; h++) {
            if (str[h] == ' ') {
                lil_append_char(r, '+');
            } else if (isalnum(str[h])) {
                lil_append_char(r, str[h]);
            } else {
                lil_append_char(r, '%');
                lil_append_char(r, nibhex(str[h]>>4));
                lil_append_char(r, nibhex(str[h]&0x0F));
            }
        }
    }
    return r;
}


/* CGI functions */
static lil_value_t fnc_gi_header(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (argc == 0) return lil_list_to_value(gi_headers, 1);
    lil_list_append(gi_headers, lil_clone_value(argv[0]));
    return lil_clone_value(argv[0]);
}

static lil_value_t fnc_gi_print(lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t i;
    for (i=0; i<argc; i++) {
        if (i) lil_append_char(gi_response, ' ');
        lil_append_val(gi_response, argv[i]);
    }
    return NULL;
}

static lil_value_t fnc_gi_hprint(lil_t lil, size_t argc, lil_value_t* argv)
{
    ut_escape_html(gi_response, lil, argc, argv);
    return NULL;
}

static lil_value_t fnc_gi_uprint(lil_t lil, size_t argc, lil_value_t* argv)
{
    ut_escape_url(gi_response, lil, argc, argv);
    return NULL;
}

static lil_value_t fnc_gi_flush(lil_t lil, size_t argc, lil_value_t* argv)
{
    size_t i;
    if (gi_headers) {
        for (i=0; i<lil_list_size(gi_headers); i++)
            printf("%s%c%c", lil_to_string(lil_list_get(gi_headers, i)), 0xa, 0xd);
        printf("%c%c", 0xa, 0xd);
        lil_free_list(gi_headers);
        gi_headers = NULL;
    }
    printf("%s", lil_to_string(gi_response));
    lil_free_value(gi_response);
    gi_response = lil_alloc_string("");
    return NULL;
}

static lil_value_t fnc_gi_info(lil_t lil, size_t argc, lil_value_t* argv)
{
    const char* type;
    if (argc == 0) return NULL;
    type = lil_to_string(argv[0]);
    if (!strcmp(type, "gateway-interface")) {
        return lil_alloc_string("cgi");
    }
    if (!strcmp(type, "auth-type")) {
        return lil_alloc_string(getenv("AUTH_TYPE"));
    }
    if (!strcmp(type, "content-length")) {
        return lil_alloc_string(getenv("CONTENT_LENGTH"));
    }
    if (!strcmp(type, "content-type")) {
        return lil_alloc_string(getenv("CONTENT_TYPE"));
    }
    if (!strcmp(type, "query")) {
        return lil_alloc_string(getenv("QUERY_STRING"));
    }
    if (!strcmp(type, "remote-address")) {
        return lil_alloc_string(getenv("REMOTE_ADDR"));
    }
    if (!strcmp(type, "remote-host")) {
        return lil_alloc_string(getenv("REMOTE_HOST"));
    }
    if (!strcmp(type, "auth-user")) {
        return lil_alloc_string(getenv("REMOTE_USER"));
    }
    if (!strcmp(type, "request-method")) {
        return lil_alloc_string(getenv("REQUEST_METHOD"));
    }
    return NULL;
}

static lil_value_t fnc_gi_get(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t r;
    if (!argc) {
        lil_list_t names = lil_alloc_list();
        size_t i;
        for (i=0; i<qattrc; i++) {
            lil_value_t entry = lil_alloc_string("{");
            lil_append_val(entry, qattr[i]->name);
            lil_append_string(entry, "} {");
            lil_append_val(entry, qattr[i]->value);
            lil_append_char(entry, '}');
            lil_list_append(names, entry);
        }
        r = lil_list_to_value(names, 1);
        return r;
    }
    if (argc == 1) return lil_clone_value(qattr_find(argv[0]));
    r = qattr_find(argv[0]);
    if (!r || !lil_to_string(r)[0]) r = argv[1];
    return lil_clone_value(r);
}

static lil_value_t fnc_gi_getvar(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t r;
    lil_list_t master, list;
    size_t i;
    if (!argc) {
        lil_list_t names = lil_alloc_list();
        for (i=0; i<qattrc; i++) {
            lil_value_t entry = lil_alloc_string("{");
            lil_append_val(entry, qattr[i]->name);
            lil_append_string(entry, "} {");
            lil_append_val(entry, qattr[i]->value);
            lil_append_char(entry, '}');
            lil_list_append(names, entry);
        }
        r = lil_list_to_value(names, 1);
        return r;
    }
    master = lil_alloc_list();
    for (i=0; i<argc; i++) {
        list = lil_alloc_list();
        lil_set_var(lil, lil_to_string(argv[i]), r = qattr_find(argv[i]), LIL_SETVAR_LOCAL);
        lil_list_append(list, lil_clone_value(argv[i]));
        lil_list_append(list, lil_clone_value(r));
        lil_list_append(master, lil_list_to_value(list, 1));
        lil_free_list(list);
    }
    r = lil_list_to_value(master, 1);
    lil_free_list(master);
    return r;
}

static lil_value_t fnc_gi_cookie(lil_t lil, size_t argc, lil_value_t* argv)
{
    if (!argc) return NULL;
    return lil_clone_value(cookies_find(argv[0]));
}

static lil_value_t fnc_gi_hescape(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t v = lil_alloc_string(NULL);
    ut_escape_html(v, lil, argc, argv);
    return v;
}

static lil_value_t fnc_gi_uescape(lil_t lil, size_t argc, lil_value_t* argv)
{
    lil_value_t v = lil_alloc_string(NULL);
    ut_escape_url(v, lil, argc, argv);
    return v;
}

static lil_value_t fnc_gi_uuid(lil_t lil, size_t argc, lil_value_t* argv)
{
    uint32_t node25, time_low;
    uint16_t time_mid, node01;
    uint8_t clk_seq_hi_res, clk_seq_low;
    uint8_t time_high_and_versionh, time_high_and_versionl;
    lil_value_t r;
    char sep = '-';

    if (argc) sep = lil_to_string(argv[0])[0];

    clk_seq_hi_res = girand()&0xFF;
    clk_seq_low = girand()&0xFF;
    time_mid = girand()&0xFFFF;
    time_high_and_versionh = girand()&0xFF;
    time_high_and_versionl = girand()&0xFF;
    time_low = girand();
    node01 = girand()&0xFFFF;
    node25 = girand();

    clk_seq_hi_res = (clk_seq_hi_res&0x3F)|0x80;
    time_high_and_versionh = (time_high_and_versionh&0x0F)|0x40;

    r = lil_alloc_string(tohex32(time_low));
    if (sep) lil_append_char(r, sep);
    lil_append_string(r, tohex16(time_mid));
    if (sep) lil_append_char(r, sep);
    lil_append_string(r, tohex8(time_high_and_versionh));
    lil_append_string(r, tohex8(time_high_and_versionl));
    if (sep) lil_append_char(r, sep);
    lil_append_string(r, tohex8(clk_seq_hi_res));
    lil_append_string(r, tohex8(clk_seq_low));
    if (sep) lil_append_char(r, sep);
    lil_append_string(r, tohex16(node01));
    lil_append_string(r, tohex32(node25));

    return r;
}

static lil_value_t fnc_gi_rand(lil_t lil, size_t argc, lil_value_t* argv)
{
    return lil_alloc_integer(girand());
}

static lil_value_t fnc_gi_md5(lil_t lil, size_t argc, lil_value_t* argv)
{
    md5_state_t state;
    md5_byte_t digest[16];
    const char* str;
    char digstr[32];
    size_t i;
    if (!argc) return NULL;
    str = lil_to_string(argv[0]);
    md5_init(&state);
    md5_append(&state, (const md5_byte_t*)str, strlen(str));
    md5_finish(&state, digest);
    for (i=0; i<16; i++)
        sprintf(digstr + i * 2, "%02x", digest[i]);
    return lil_alloc_string(digstr);
}

static void register_cgi_functions(lil_t lil)
{
    lil_register(lil, "gi:header", fnc_gi_header);
    lil_register(lil, "gi:print", fnc_gi_print);
    lil_register(lil, "gi:hprint", fnc_gi_hprint);
    lil_register(lil, "gi:uprint", fnc_gi_uprint);
    lil_register(lil, "gi:flush", fnc_gi_flush);
    lil_register(lil, "gi:info", fnc_gi_info);
    lil_register(lil, "gi:get", fnc_gi_get);
    lil_register(lil, "gi:getvar", fnc_gi_getvar);
    lil_register(lil, "gi:cookie", fnc_gi_cookie);
    lil_register(lil, "gi:hescape", fnc_gi_hescape);
    lil_register(lil, "gi:uescape", fnc_gi_uescape);
    lil_register(lil, "gi:uuid", fnc_gi_uuid);
    lil_register(lil, "gi:rand", fnc_gi_rand);
    lil_register(lil, "gi:md5", fnc_gi_md5);
    db_register_funcs(lil);
}

/* Loader */
static char* read_file(const char* filename)
{
    FILE* f = fopen(filename, "rb");
    size_t size;
    char* buffer;
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    size = ftell(f);
    fseek(f, 0, SEEK_SET);
    buffer = malloc(size + 1);
    fread(buffer, 1, size, f);
    buffer[size] = 0;
    fclose(f);
    return buffer;
}

static void run_file(const char* filename)
{
    char* code = read_file(filename);
    lil_t lil;
    lil_value_t result;
    if (!code) {
        printf("Content-Type: text/html%c%c%c%c<html><head><title>error</title></head><body><h1>LILCGI Error</h1> Failed to open %s</body></html>\n\n", 0xa, 0xd, 0xa, 0xd, filename);
        return;
    }
    lil = lil_new();
    register_cgi_functions(lil);
    result = lil_parse(lil, code, 0, 1);
    lil_free_value(result);
    fnc_gi_flush(lil, 0, NULL);
    lil_free(lil);
    free(code);
}

int main (int argc, const char* argv[])
{
    if (argc == 1) {
        printf("lilcgi usage: lilcgi <filename>\n");
        return 1;
    }
    girand_init();
    gi_response = lil_alloc_string("");
    gi_headers = lil_alloc_list();
    qattr_load_attrs();
    cookies_parse();
    run_file(argv[1]);
    lil_free_value(gi_response);
    qattr_free();
    cookies_free();
    db_shutdown();
    return 0;
}
