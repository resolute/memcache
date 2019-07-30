import MemcacheResponse from './response';
import { ErrorCodes } from './error';
import { InputType } from 'zlib';

export type bufferish = Buffer | ArrayBuffer | SharedArrayBuffer | DataView;
export type key = string | bufferish;
export type value = string | bufferish;
export type ttl = number | Date;
export type cas = MemcacheResponse | bufferish;
export interface DefaultOptions {
    ttl: number, // Default TTL must be a number--not a Date
    cas: Buffer,
    initial: number,
    flags: number,
}
export interface AllOptions {
    ttl?: ttl,
    cas?: cas,
    initial?: number,
    flags?: number,
}
export type SetReplaceOptions = ttl | { ttl?: ttl, cas?: cas, flags?: number };
export type AddOptions = ttl | { ttl?: ttl, flags?: number };
export type IncrDecrOptions = ttl | { ttl?: ttl, cas?: cas, initial?: number };
export type AnyOptions = ttl | AllOptions;
export type backoff = (attempt: number) => number;
export type compressFunction = (buf: InputType, options?: any) => Promise<Buffer>;
export type decompressFunction = compressFunction;
export type compressIf = (key: key, value: Buffer) => boolean;
export type jsonSerializer = (value: any, options?: any) => Promise<string> | string;
export type jsonDeserializer = (value: string, options?: any) => Promise<any> | any;

export interface MemcacheOptions {
    connection?: boolean | Function;
    port?: number;
    host?: string;
    path?: string;
    queueSize?: number;
    connectTimeout?: number;
    multiResponseOpCodes?: number[];
    keepalive?: boolean | Function;
    retries?: number;
    minDelay?: number;
    maxDelay?: number;
    backoff?: backoff;
    sasl?: boolean | Function;
    username?: string;
    password?: string;
    protocol?: boolean | Function;
    ttl?: number; // Date _not_ allowed here
    commandTimeout?: number;
    maxKeySize?: number;
    maxValueSize?: number;
    compression?: boolean | Function;
    compressionFlag?: number;
    compressIf?: (key: key, value: Buffer) => boolean;
    compressionOptions?: any;
    compress?: compressFunction;
    decompress?: decompressFunction;
    json?: boolean | Function;
    jsonFlag?: number;
    serialize?: jsonSerializer;
    deserialize?: jsonDeserializer;
    string?: boolean | Function;
    stringFlag?: number;
    [property: string]: any;
}

export interface MemcacheClient {
    // (options: MemcacheOptions): MemcacheClient,
    get: (key: key) => Promise<MemcacheResponse>,
    set: (key: key, value: any, options?: SetReplaceOptions) => Promise<MemcacheResponse>,
    add: (key: key, value: any, options?: AddOptions) => Promise<MemcacheResponse>,
    replace: (key: key, value: any, options?: SetReplaceOptions) => Promise<MemcacheResponse>,
    del: (key: key) => Promise<MemcacheResponse>,
    incr: (key: key, amount: number, options?: IncrDecrOptions) => Promise<MemcacheResponse>,
    decr: (key: key, amount: number, options?: IncrDecrOptions) => Promise<MemcacheResponse>,
    append: (key: key, value: value, cas?: cas) => Promise<MemcacheResponse>,
    prepend: (key: key, value: value, cas?: cas) => Promise<MemcacheResponse>,
    touch: (key: key, ttl: ttl) => Promise<MemcacheResponse>,
    gat: (key: key, ttl: ttl) => Promise<MemcacheResponse>,
    flush: (ttl?: ttl) => Promise<MemcacheResponse>,
    version: () => Promise<string>,
    stat: (key?: key) => Promise<{ [property: string]: string }>,
    [method: string]: any,
}

export type MemcacheConstructor = ((options?: MemcacheOptions) => MemcacheClient) & typeof ErrorCodes;

export interface Timer {
    start(msecs?: number): NodeJS.Timer;
    stop(): void;
    restart(msecs?: number): NodeJS.Timer;
}