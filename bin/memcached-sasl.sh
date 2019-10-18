#!/bin/sh

DIR=/tmp/memcached-latest
URL=https://memcached.org/latest

if [ ! -e $DIR/memcached ]; then
  echo Downloading and building memcached...
  mkdir -p "$DIR" && \
  curl -sL "$URL" | tar zxf - -C "$DIR" --strip-components=1 && \
  cd "$DIR" && \
  CFLAGS=-Wno-error=deprecated-declarations ./configure --enable-sasl --enable-sasl-pwdb && \
  make -j2 && \
  echo mech_list: plain > "$DIR/memcached.conf"
  echo foo@bar:baz > "$DIR/memcached-sasl-pwdb"
fi
