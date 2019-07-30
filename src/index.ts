import { MemcacheClient, MemcacheOptions, MemcacheConstructor } from './types';
import { ErrorCodes } from './error';

import { Socket } from 'net'
import connection from './connection';
import keepalive from './keepalive';
import sasl from './sasl';
import protocol from './protocol';
import compression from './compression';
import json from './json';
import string from './string';

const defaultModules = {
    connection,
    keepalive,
    sasl,
    protocol,
    compression,
    json,
    string,
}

const memcache: MemcacheConstructor = Object.assign(
    (options: MemcacheOptions = {}): MemcacheClient => {

        const ComposedClass = Object.entries(defaultModules)
            .map(([name, module]) => {
                if (typeof options[name] === 'function') {
                    return options[name];
                }
                if (options[name] === false) {
                    return false;
                }
                return module;
            })
            .filter((module) => typeof module === 'function')
            .reduce((composite, module) => module(composite), Socket);


        const client = new ComposedClass(options);

        [
            'get', 'set', 'add', 'replace', 'del',
            'incr', 'decr', 'append', 'prepend',
            'touch', 'gat', 'version', 'stat', 'flush',
            'on', 'kill', 'destroy'
        ]
            // `kill` is only specified in keepalive, so check and make sure
            // that each method exists before providing a bind
            .filter((method) => method in client)
            .forEach((method) => {
                client[method] = client[method].bind(client);
            })

        // alias methods:
        client.delete = client.del.bind(client);
        client.increment = client.incr.bind(client);
        client.decrement = client.decr.bind(client);

        return client;

    }, ErrorCodes);

export default memcache;