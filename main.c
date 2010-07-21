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
#include "lil.h"

int main (int argc, const char* argv[])
{
	char buffer[16384];
	lil_t lil = lil_new();
	printf("Little Interpreted Language Interactive Shell\n");
	while (1) {
		lil_value_t result;
		const char* strres;
		buffer[0] = 0;
		printf("# ");
		if (!fgets(buffer, 16384, stdin)) break;
		result = lil_parse(lil, buffer, 0, 1);
		strres = lil_to_string(result);
		if (strres[0])
			printf(" -> %s\n", strres);
		lil_free_value(result);
	}
	lil_free(lil);
    return 0;
}
