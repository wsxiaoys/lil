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
		result = lil_parse(lil, buffer);
		strres = lil_to_string(result);
		if (strres[0])
			printf(" -> %s\n", strres);
		lil_release(result);
	}
	lil_free(lil);
    return 0;
}
