import { spawn, ChildProcess, ChildProcessWithoutNullStreams } from 'child_process';

import memcache from '../lib';

import response from './response.test';
import connection from './connection.test';
import keepalive from './keepalive.test';
import sasl from './sasl.test';
import protocol from './protocol.test';
import compression from './compression.test';
import json from './json.test';
import string from './string.test';
import command from './command.test';
import cas from './cas.test';
import flush from './flush.test';
import flood from './flood.test';
import chaos from './chaos.test';
import { MemcacheConstructor } from '../lib/types';

process.title = 'memcache-test';

const MEMCACHED_PORT = 11212;
const MEMCACHED_PORT_SASL = 11213;
const MEMCACHED_SOCKET = './memcached-latest/memcached.sock';
const MEMCACHED_PATH = process.env.MEMCACHED_PATH || './memcached-latest/memcached';
const SASL_CONF_PATH = process.env.SASL_CONF_PATH || './memcached-latest/memcached.conf';
const MEMCACHED_SASL_PWDB = process.env.MEMCACHED_SASL_PWDB || './memcached-latest/memcached-sasl-pwdb';
const MEMCACHED_USERNAME = process.env.MEMCACHED_USERNAME || 'foo@bar';
const MEMCACHED_PASSWORD = process.env.MEMCACHED_PASSWORD || 'baz';

const servers: ChildProcess[] = [];
const spawnServer = (args: string[], env?: {}) => {
    const server = spawn(MEMCACHED_PATH, args, { env })
        .on('error', (error) => {
            console.log(error);
            cleanup();
            process.exit();
        });
    servers.push(server);
    return server;
}
const cleanup = () => {
    for (const server of servers) {
        server.kill();
    }
}
process.on('SIGINT', () => {
    cleanup();
    process.exit();
})
process.on('beforeExit', cleanup);
spawnServer([`-p${MEMCACHED_PORT}`]);
spawnServer([`-p${MEMCACHED_PORT_SASL}`, '-S'], {
    SASL_CONF_PATH,
    MEMCACHED_SASL_PWDB
});

const flakyServer = (create: Function) => {
    let stop = false;
    const loop = () => {
        setTimeout(() => {
            const server: ChildProcess = create();
            setTimeout(() => {
                server.kill();
                if (!stop) {
                    loop();
                }
            }, Math.floor(100 + 700 * Math.random()))
        }, Math.floor(50 + 100 * Math.random()));
    };
    loop();
    return () => {
        stop = true;
    }
}

const randomString = (length: number) => {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

const floodify = (length: number, fn: (...args: any[]) => Promise<any>) => Promise.all(Array(length).fill(fn).map((fn) => fn()
    .then(() => true)
    .catch(() => false)
))
    .then((responses) => {
        const success = responses.filter(r => r).length;
        const failure = responses.filter(r => !r).length;
        // console.log(`Flood: resolved (${success.toLocaleString()}) rejected (${failure.toLocaleString()})`)
        return { success, failure };
    });

const trickle = async ({ duration = 1_000, upper = 100, lower = 10, fn }: { duration: number, upper: number, lower: number, fn: Function }) => {
    const responses = [];
    const starttime = process.hrtime();
    const milliseconds = () => {
        const [seconds, nanoseconds] = process.hrtime(starttime);
        return ~~(seconds * 1000 + nanoseconds / 1e6);
    }
    do {
        responses.push(
            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(fn());
                }, Math.min(
                    duration - milliseconds(), // time remaining
                    Math.floor(lower + (upper - lower) * Math.random())));
            })
        );
    } while (milliseconds() < duration)
    return responses;
}

export interface TestOptions {
    memcache: MemcacheConstructor,
    port: number,
    portSasl: number,
    portInvalid: number,
    socketPath: string,
    namespace: string,
    floodify: (...args: any[]) => Promise<any>,
    randomString: (arg: number) => string,
    bin: string
    SASL_CONF_PATH: string,
    MEMCACHED_SASL_PWDB: string,
    username: string,
    password: string,
    spawnServer: (args: string[], env?: {}) => ChildProcessWithoutNullStreams,
    flakyServer: (create: Function) => () => void,
    trickle: ({ duration, upper, lower, fn }: {
        duration: number;
        upper: number;
        lower: number;
        fn: Function;
    }) => Promise<any[]>,
}

const options: TestOptions = {
    memcache,
    port: MEMCACHED_PORT,
    portSasl: MEMCACHED_PORT_SASL,
    portInvalid: 11111, // nothing ever runs here
    socketPath: MEMCACHED_SOCKET, // nothing ever runs here
    bin: MEMCACHED_PATH,
    SASL_CONF_PATH,
    MEMCACHED_SASL_PWDB,
    username: MEMCACHED_USERNAME,
    password: MEMCACHED_PASSWORD,
    spawnServer,
    flakyServer,
    floodify,
    trickle,
    randomString,
    namespace: 'foo',
};


(async () => {
    console.log('Memcache Test Suite Starting...');
    const starttime = process.hrtime();
    try {
        await flush({ ...options, namespace: randomString(7) });
        await Promise.all([
            response,
            connection,
            keepalive,
            sasl,
            protocol,
            compression,
            json,
            string,
            command,
            cas,
            flood,
            chaos,
        ].map((module) => module({ ...options, namespace: randomString(7) })));
    } catch (error) {
        console.log('TEST FAILED:');
        console.log(error);
    }
    cleanup();
    const [seconds, nanoseconds] = process.hrtime(starttime);
    const duration = (seconds * 1000 + nanoseconds / 1e6)
        .toLocaleString(undefined, { maximumFractionDigits: 0 });
    console.log(`Memcache Test Suite Complete after ${duration} milliseconds.`);
})();