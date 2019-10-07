/* eslint-disable max-len */
import { ZlibOptions } from 'zlib';
import { SocketConnectOpts } from 'net';

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');

export interface CommandCallback<T> {
  (error?: MemcacheError, response?: T): void;
  // (error: MemcacheError): void;
  // (error: undefined, response: T): void;
}

export interface Encoder {
  // <T, U>(request: T, callback: CommandCallback<U>): void;
  // <T extends MemcacheRequest, U extends T>(request: T, callback: CommandCallback<U>): void;
  (request: MemcacheRequest, callback: CommandCallback<MemcacheRequest>): void;
}

export interface Decoder {
  // <T>(response: T, callback: CommandCallback<T>): void;
  // <T, U>(response: T, callback: CommandCallback<U>): void;
  <T>(response: MemcacheResponse, callback: CommandCallback<MemcacheResponse<T>>): void;
}

export interface Send {
  // <R, S>(request: R, callback: CommandCallback<S>): void;
  // <R extends MemcacheRequest, S extends MemcacheResponse | MemcacheResponse[]>(request: R, callback: CommandCallback<S>): void;
  // <T extends MemcacheResponse<T> | MemcacheResponse<T>[]>(request: MemcacheRequest, callback: CommandCallback<T>): void;
  <T>(request: MemcacheRequest, callback: CommandCallback<MemcacheResponse<T> | MemcacheResponse<T>[]>): void;
}

export interface Wrap {
  (fn: Encoder | Encoder[], callback?: Encoder | Send): CommandCallback<Encoder | Send>;
  <T>(fn: Send | Send[], callback?: CommandCallback<T> | Decoder): void;
  <T>(fn: Decoder[], callback?: CommandCallback<T> | Decoder): void;
}

export interface Get {
  <T>(key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView): Promise<MemcacheResponse<T>>;
  <T>(key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, callback: CommandCallback<MemcacheResponse<T>>): void;
}

export interface Gat {
  <T>(key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, ttl: number | Date): Promise<MemcacheResponse<T>>;
  <T>(key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, ttl: number | Date, callback: CommandCallback<MemcacheResponse<T>>): void;
}

export interface Touch {
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, ttl: number | Date): Promise<MemcacheResponse<void>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, ttl: number | Date, callback: CommandCallback<MemcacheResponse<void>>): void;
}

export interface Del {
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView): Promise<MemcacheResponse<void>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, callback: CommandCallback<MemcacheResponse<void>>): void;
}

export interface Flush {
  (ttl?: number | Date): Promise<MemcacheResponse<void>>;
  (callback: CommandCallback<MemcacheResponse<void>>): void;
  (ttl: number | Date, callback: CommandCallback<MemcacheResponse<void>>): void;
}

export interface Version {
  (callback: CommandCallback<string>): void;
  (): Promise<string>;
}

export interface Stat {
  (key?: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView): Promise<{ [property: string]: string }>;
  (callback: CommandCallback<{ [property: string]: string }>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, callback: CommandCallback<{ [property: string]: string }>): void;
}

export interface AppendPrepend {
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, cas?: Buffer | MemcacheResponse): Promise<MemcacheResponse<void>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, callback: CommandCallback<MemcacheResponse<void>>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, cas: Buffer | MemcacheResponse, callback: CommandCallback<MemcacheResponse<void>>): void;
}

export interface SetReplace {
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, ttl?: number | Date): Promise<MemcacheResponse<void>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, options?: { ttl?: number | Date, flags?: number, cas?: Buffer | MemcacheResponse }): Promise<MemcacheResponse<void>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, callback: CommandCallback<MemcacheResponse<void>>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, ttl: number | Date, callback: CommandCallback<MemcacheResponse<void>>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, options: { ttl?: number | Date, flags?: number, cas?: Buffer | MemcacheResponse }, callback: CommandCallback<MemcacheResponse<void>>): void;
}

export interface Add {
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, ttl?: number | Date): Promise<MemcacheResponse<void>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, options?: { ttl?: number | Date, flags?: number }): Promise<MemcacheResponse<void>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, callback: CommandCallback<MemcacheResponse<void>>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, ttl: number | Date, callback: CommandCallback<MemcacheResponse<void>>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, value: any, options: { ttl?: number | Date, flags?: number }, callback: CommandCallback<MemcacheResponse<void>>): void;
}

export interface IncrDecr {
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, amount: number, ttl?: number | Date): Promise<MemcacheResponse<number>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, amount: number, options?: { ttl?: number | Date, initial?: number, cas?: Buffer | MemcacheResponse }): Promise<MemcacheResponse<number>>;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, amount: number, callback: CommandCallback<MemcacheResponse<number>>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, amount: number, ttl: number | Date, callback: CommandCallback<MemcacheResponse<number>>): void;
  (key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView, amount: number, options: { ttl?: number | Date, initial?: number, cas?: Buffer | MemcacheResponse }, callback: CommandCallback<MemcacheResponse<number>>): void;
}

export interface MemcacheOptions {
  port?: number;
  host?: string;
  path?: string;
  queueSize?: number;
  maxKeySize?: number;
  maxValueSize?: number;
  connectTimeout?: number;
  multiResponseOpCodes?: number[];
  retries?: number;
  minDelay?: number;
  maxDelay?: number;
  backoff?: (attempt: number) => number;
  username?: string;
  password?: string;
  commandTimeout?: number;
  ttl?: number; // Date _not_ allowed here
  compression?: CompressionOptions | false;
  serialization?: SerializationOptions | false;
}

export interface CompressionOptions {
  flag?: number;
  options?: ZlibOptions;
  threshold?: number;
  compress?: (buf: Buffer, options?: any, callback?: (error: Error | null, result: Buffer) => void) => void;
  decompress?: (buf: Buffer, options?: any, callback?: (error: Error | null, result: Buffer) => void) => void;
}

export interface MemcacheRequestOptions {
  opcode: number;
  key: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView;
  value: string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView;
  amount: number;
  ttl: number | Date;
  cas: Buffer | MemcacheResponse;
  flags: number;
  initial: number;
}

export interface SerializationOptions {
  stringFlag?: number;
  jsonFlag?: number;
  binaryFlag?: number;
  numberFlag?: number;
  serialize?: (value: any, options?: any) => Buffer | string;
  deserialize?: (value: string, options?: any) => any;
}

export interface SocketConnectOpts { }
