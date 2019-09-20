import { ZlibOptions } from 'zlib';

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');

export type BufferLike = string | Buffer | ArrayBuffer | SharedArrayBuffer | DataView;
export type BufferAble = number | BufferLike;
export type Ttl = number | Date;
export type Cas = MemcacheResponse<unknown> | Buffer;

export interface Encoder {
  (request: MemcacheRequest): Promise<MemcacheRequest>;
}

export interface Decoder {
  (response: MemcacheResponse<Buffer>): Promise<MemcacheResponse<Buffer>>;
}

export interface Funnel {
  (fns: Encoder[]): <T>(initial: T) => Promise<T>;
  (fns: Decoder[]): <T>(initial: T) => Promise<T>;
}

export interface SetReplace {
  (key: BufferLike, value: any, ttl?: number | Date): Promise<MemcacheResponse<void>>;
  (key: BufferLike, value: any, options?: Omit<CommandOptions, 'initial'>): Promise<MemcacheResponse<void>>;
}

export interface Add {
  (key: BufferLike, value: any, ttl?: number | Date): Promise<MemcacheResponse<void>>;
  (key: BufferLike, value: any, options?: Omit<CommandOptions, 'initial' | 'cas'>): Promise<MemcacheResponse<void>>;
}

export interface IncrDecr {
  (key: BufferLike, value: number, ttl?: number | Date): Promise<MemcacheResponse<number>>;
  (key: BufferLike, value: number, options?: Omit<CommandOptions, 'flags'>): Promise<MemcacheResponse<number>>;
}

export interface CommandOptions {
  ttl?: Ttl;
  cas?: Cas;
  flags?: number;
  initial?: number;
}

export interface MemcacheRequestOptions extends CommandOptions {
  opcode: number;
  key?: BufferLike;
  value?: BufferLike;
  amount?: number;
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
  compress?: (buf: Buffer, options?: any) => Promise<Buffer>;
  decompress?: (buf: Buffer, options?: any) => Promise<Buffer>;
}

export interface SerializationOptions {
  stringFlag?: number;
  jsonFlag?: number;
  binaryFlag?: number;
  numberFlag?: number;
  serialize?: (value: any, options?: any) => Promise<Buffer | string> | Buffer | string;
  deserialize?: (value: string, options?: any) => Promise<any> | any;
}
