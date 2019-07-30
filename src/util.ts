import { setTimeout, clearTimeout } from 'timers';
import MemcacheResponse from './response';
import MemcacheError, { ERR_INVALID_KEY, ERR_INVALID_VALUE } from './error';
import { types } from 'util';
import { key, value, ttl, cas, DefaultOptions, AnyOptions, Timer } from './types';
import { SocketConnectOpts } from 'net';

export const isPositive = (number: any): Boolean => typeof number === 'number' && Number.isFinite(number) && number >= 0;

export const isBufferish = (value: any): Boolean => {
    if (typeof value === 'object' && value instanceof Buffer) {
        return true;
    }
    if (typeof value === 'string') {
        return true;
    }
    if (ArrayBuffer.isView(value)) {
        return true;
    }
    if (types.isAnyArrayBuffer(value)) {
        return true;
    }
    return false;
}

export const toBuffer = (value: value): Buffer => {
    if (typeof value === 'object' && value instanceof Buffer) {
        return value;
    }
    if (typeof value === 'string') {
        return Buffer.from(value);
    }
    if (ArrayBuffer.isView(value)) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    if (types.isAnyArrayBuffer(value)) {
        return Buffer.from(value);
    }
    throw new MemcacheError({
        message: 'Expected string, Buffer, or Buffer-like object',
        status: ERR_INVALID_VALUE
    });
}

export const timer = (msecs: number, ref: boolean = true, fn: Function): Timer => {
    let timer: NodeJS.Timer | null = null;
    const defaultMsecs = msecs;
    const start = (msecs?: number) => {
        if (timer !== null) {
            return timer;
        }
        timer = setTimeout(() => {
            timer = null;
            fn.call(undefined);
        }, typeof msecs === 'number' ? msecs : defaultMsecs);
        if (ref === false) {
            timer.unref();
        }
        return timer;
    }
    const stop = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }
    const restart = (msecs?: number) => {
        stop();
        return start(msecs);
    }
    return { start, stop, restart };
}

export const extendIfDefined = (ctx: { [key: string]: any }, options: object) => {
    for (const [key, value] of Object.entries(options)) {
        if (typeof value !== 'undefined') {
            ctx[key] = value;
        }
    }
}

export const socketConnectOptions = ({ port, host, path }: { port: number, host: string, path?: string }): SocketConnectOpts => {
    if (typeof path === 'string' && path.length > 0) {
        return { path };
    }
    return { host, port };
}

export const sanitizeKey = (maxKeySize: number) => (key: key) => {
    let keyBuffer;
    try {
        keyBuffer = toBuffer(key);
    } catch {
        throw new MemcacheError({
            message: '“key” must be a string, Buffer, ArrayBuffer, SharedArrayBuffer, DataView',
            status: ERR_INVALID_KEY
        });
    }
    if (keyBuffer.length === 0) {
        throw new MemcacheError({
            message: '“key” must be greater than 0 bytes',
            status: ERR_INVALID_KEY
        });
    }
    if (keyBuffer.length > maxKeySize) {
        throw new MemcacheError({
            message: `“key” may not exceed ${maxKeySize.toLocaleString()} bytes`,
            status: ERR_INVALID_KEY
        });
    }
    return keyBuffer;
};

export const sanitizeValue = (maxValueSize: number) => (value: value) => {
    let valueBuffer;
    try {
        valueBuffer = toBuffer(value);
    } catch {
        throw new MemcacheError({
            message: '“value” must be a string, Buffer, ArrayBuffer, SharedArrayBuffer, DataView',
            status: ERR_INVALID_VALUE
        });
    }
    // allow 0 byte values--this represents `undefined` in json module
    if (valueBuffer.length > maxValueSize) {
        throw new MemcacheError({
            message: `“value” may not exceed ${maxValueSize.toLocaleString()} bytes`,
            status: ERR_INVALID_VALUE
        });
    }
    return valueBuffer;
};


export const sanitizeTtl = (defaultTtl: number) => (ttl?: ttl) => {
    // An expiration time, in seconds. '0' means never expire. Can be up to
    // 30 days. After 30 days, is treated as a unix timestamp of an exact date.
    // From: https://github.com/memcached/memcached/wiki/Commands
    let seconds = 0;
    if (typeof ttl === 'number') {
        seconds = ttl;
    } else if (ttl instanceof Date) {
        seconds = (ttl.valueOf() - new Date().valueOf()) / 1000;
        if (seconds > 2_592_000) {
            seconds = ttl.valueOf() / 1000;
        }
    } else {
        return defaultTtl;
    }
    if (Number.isFinite(seconds)) {
        return Math.max(0, Math.floor(seconds));
    } else {
        return defaultTtl;
    }
}

export const sanitizeCas = (defaultCas: Buffer) => (cas?: cas) => {
    if (typeof cas === 'undefined') {
        return defaultCas;
    }
    let casBuffer;
    if (cas instanceof MemcacheResponse) {
        return cas.cas;
    }
    try {
        casBuffer = toBuffer(cas);
    } catch {
        return defaultCas;
    }
    if (casBuffer.length === 8) {
        return casBuffer;
    }
    return defaultCas;
}

export const sanitizePositiveNumber = (defaultValue: number) => (value?: number) => {
    if (typeof value !== 'undefined' && isPositive(value)) {
        return ~~value;
    }
    return defaultValue;
}

export const normalizeOptions = (defaults: DefaultOptions) => (options?: AnyOptions): DefaultOptions => {
    if (
        typeof options === 'undefined' ||
        typeof options === 'number' ||
        (typeof options === 'object' && options instanceof Date)
    ) {
        return {
            ...defaults,
            ttl: sanitizeTtl(defaults.ttl)(options)
        }
    }
    return {
        ttl: sanitizeTtl(defaults.ttl)(options.ttl),
        cas: sanitizeCas(defaults.cas)(options.cas),
        flags: sanitizePositiveNumber(defaults.flags)(options.flags),
        initial: sanitizePositiveNumber(defaults.initial)(options.initial),
    }

}