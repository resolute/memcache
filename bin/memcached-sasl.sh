#!/bin/sh
if [ ! -e memcached-latest/memcached ]; then
    echo Downloading and building memcached...
    mkdir -p memcached-latest && \
    curl -sL http://memcached.org/latest | tar zxf - -C memcached-latest --strip-components=1 && \
    cd memcached-latest && \
    CFLAGS=-Wno-error=deprecated-declarations ./configure --enable-sasl --enable-sasl-pwdb && \
    make -j2 && \
    echo "foo@bar:baz" > memcached-sasl-pwdb && \
    echo "mech_list: plain" > memcached.conf && \
    cd ..
fi