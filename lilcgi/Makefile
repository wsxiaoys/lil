#
# Makefile for LILCGI. It requires GNU Make.
#

PREFIX = /usr/local
PROGRAM = lilcgi
BININSTALL = $(PREFIX)/bin
MANINSTALL = $(PREFIX)/man/man1
CFLAGS = -g3 -std=c99 -pedantic -Wall -Wextra -Wno-unused-parameter -I..
LDFLAGS = -g -L.. -llil

SOURCES = $(wildcard *.c)
HEADERS = $(wildcard *.h)
OBJECTS = $(patsubst %.c,%.o,$(SOURCES))

.PHONY: all
all: $(PROGRAM)

$(PROGRAM): $(OBJECTS) ../liblil.a
	$(CC) $(LDFLAGS) -o $(PROGRAM) $(OBJECTS)

$(OBJECTS): %.o: %.c
	$(CC) -c $(CFLAGS) $< -o $@

.PHONY: clean
clean:
	$(RM) -f $(OBJECTS) $(PROGRAM)
