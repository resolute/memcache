import {
  MemcacheOptions, BufferLike, Ttl, Cas, SetReplace, Add, IncrDecr,
  CommandOptions, Encoder, Decoder, Send,
} from './types';

import util = require('util');
import MemcacheError = require('./error');
import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheConnection = require('./connection');
import MemcacheCompression = require('./compression');
import MemcacheSerialization = require('./serialization');

/**
 * Memcache Client
 *
 * TODO: add JSDoc to each method
 *
 */
const memcache = (options: MemcacheOptions = {}) => {
  /**
     * Get the value for the given key.
     * @param key
     */
  const get = async <T>(key: BufferLike) =>
    funnel(new MemcacheRequest<MemcacheResponse<T>>({
      opcode: 0x00,
      key,
    })).through([
      checkKey,
      send,
      ...decoders,
    ]);

  const set: SetReplace = async (key: BufferLike, value: any, options?: any) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x01,
      key,
      value,
      ...normalizeOptions(defaultTtl)(options),
    })).through([
      ...encoders,
      checkKey,
      checkValue,
      send,
    ]);

  const add: Add = async (key: BufferLike, value: any, options?: any) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x02,
      key,
      value,
      ...normalizeOptions(defaultTtl)(options),
    })).through([
      ...encoders,
      checkKey,
      checkValue,
      send,
    ]);

  const replace: SetReplace = async (key: BufferLike, value: any, options?: any) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x03,
      key,
      value,
      ...normalizeOptions(defaultTtl)(options),
    })).through([
      ...encoders,
      checkKey,
      checkValue,
      send,
    ]);


  const del = async (key: BufferLike) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x04,
      key,
    })).through([
      checkKey,
      send,
    ]);

  const incr: IncrDecr = async (key: BufferLike, amount: number, options?: any) =>
    funnel(new MemcacheRequest<MemcacheResponse<number>>({
      opcode: 0x05,
      key,
      amount: sanitizeAmount(amount),
      ...normalizeOptions(defaultTtl)(options),
    })).through([
      checkKey,
      send,
      setIncrDecrValue,
    ]);

  const decr: IncrDecr = async (key: BufferLike, amount: number, options?: any) =>
    funnel(new MemcacheRequest<MemcacheResponse<number>>({
      opcode: 0x06,
      key,
      amount: sanitizeAmount(amount),
      ...normalizeOptions(defaultTtl)(options),
    })).through([
      checkKey,
      send,
      setIncrDecrValue,
    ]);

  const append = async (key: BufferLike, value: BufferLike, cas?: Cas) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x0e,
      key,
      value,
      cas,
    })).through([
      checkKey,
      send,
    ]);

  const prepend = async (key: BufferLike, value: BufferLike, cas?: Cas) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x0f,
      key,
      value,
      cas,
    })).through([
      checkKey,
      send,
    ]);

  const touch = async (key: BufferLike, ttl: Ttl) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x1c,
      key,
      ttl: sanitizeTtl(defaultTtl)(ttl),
    })).through([
      checkKey,
      send,
    ]);

  const gat = async <T>(key: BufferLike, ttl: Ttl) =>
    funnel(new MemcacheRequest<MemcacheResponse<T>>({
      opcode: 0x1d,
      key,
      ttl: sanitizeTtl(defaultTtl)(ttl),
    })).through([
      checkKey,
      send,
      ...decoders,
    ]);

  const version = async () =>
    funnel(new MemcacheRequest<MemcacheResponse<Buffer>>({
      opcode: 0x0b,
    })).through([
      send,
    ]).then(({ value }) => value.toString());

  const stat = async (key?: BufferLike) =>
    funnel(new MemcacheRequest<MemcacheResponse<Buffer>[]>({
      opcode: 0x10,
      key,
    })).through([
      ...(!key ? [] : [checkKey]),
      send,
    ]).then((responses) => responses.reduce((carry, { key, value }) => {
      // eslint-disable-next-line no-param-reassign
      carry[key.toString()] = value.toString();
      return carry;
    }, {} as { [property: string]: string }));

  const flush = async (ttl?: Ttl) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x08,
      // If unspecified, users expect the TTL to be immediate for `flush`.
      ttl: sanitizeTtl(0)(ttl),
    })).through([
      send,
    ]);

  // Memcache Client Context

  const defaultTtl = options.ttl || 0;
  const connection = new MemcacheConnection(options);
  const send = connection.send.bind(connection);
  const encoders: Encoder[] = [];
  const decoders: Decoder[] = [];
  const maxKeySize = options.maxKeySize !== undefined ? options.maxKeySize : 250;
  const maxValueSize = options.maxValueSize !== undefined ? options.maxValueSize : 1_048_576;

  const checkKey = <T>(request: MemcacheRequest<T>) => {
    const { keyAsBuffer } = request;
    let keyLength = 0;
    /* istanbul ignore else */
    if (keyAsBuffer) {
      keyLength = keyAsBuffer.length;
    }
    if (keyLength === 0 || keyLength > maxKeySize) {
      throw new MemcacheError({
        message: `Invalid \`key\` size ${keyLength.toLocaleString()} bytes.`,
        status: MemcacheError.ERR_INVALID,
        request,
      });
    }
    return request;
  };

  const checkValue = <T>(request: MemcacheRequest<T>) => {
    const { valueAsBuffer } = request;
    let valueLength = 0;
    if (valueAsBuffer) {
      valueLength = valueAsBuffer.length;
    }
    if (valueLength > maxValueSize) {
      throw new MemcacheError({
        message: `Invalid \`value\` size ${valueLength.toLocaleString()} bytes.`,
        status: MemcacheError.ERR_INVALID,
        request,
      });
    }
    return request;
  };

  const register = (encoder?: Encoder, decoder?: Decoder) => {
    if (encoder) {
      encoders.unshift(encoder);
    }
    if (decoder) {
      decoders.push(decoder);
    }
    return ctx;
  };

  const ctx = {
    get,
    set,
    add,
    replace,
    del,
    incr,
    decr,
    append,
    prepend,
    touch,
    gat,
    version,
    stat,
    flush,
    delete: del,
    increment: incr,
    decrement: decr,
    on: connection.on.bind(connection),
    kill: connection.kill.bind(connection),
    send,
    destroy: connection.destroy.bind(connection),
    connection, // underlying Socket
    register,
  };

  // default compression
  if (options.compression !== false) {
    register(...MemcacheCompression({
      threshold: options.maxValueSize,
      ...options.compression,
    }));
  }
  // default serialization
  if (options.serialization !== false) {
    register(...MemcacheSerialization(
      options.serialization,
    ));
  }

  return ctx;
};

export = memcache;

const normalizeOptions = (defaultTtl: number) => (options?: Ttl | CommandOptions) => {
  if (
    typeof options === 'undefined' ||
    typeof options === 'number' ||
    util.types.isDate(options)
  ) {
    return { flags: 0, ttl: sanitizeTtl(defaultTtl)(options) };
  }
  return { flags: 0, ...options, ttl: sanitizeTtl(defaultTtl)(options.ttl) };
};

const funnel = <T>(initial: MemcacheRequest<T>) => ({
  through: async (fns: (Encoder | Decoder | Send)[]): Promise<T> => fns
    .reduce(
      // @ts-ignore
      async (value: any, fn) => fn(await value),
      initial,
    ),
});

const sanitizeAmount = (arg: number | string) => {
  let n = arg;
  if (typeof arg === 'string') {
    n = parseInt(arg, 10);
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new MemcacheError({
      message: `${arg} is not a valid “amount” (number)`,
      status: MemcacheError.ERR_INVALID,
    });
  }
  return n;
};

const sanitizeTtl = (defaultTtl: number) => (ttl?: Ttl) => {
  // An expiration time, in seconds. '0' means never expire. Can be up to 30
  // days. After 30 days, is treated as a unix timestamp of an exact date.
  // From: https://github.com/memcached/memcached/wiki/Commands
  let seconds = 0;
  if (typeof ttl === 'number') {
    seconds = ttl;
  } else if (
    util.types.isDate(ttl)
    && !Number.isNaN(ttl.valueOf())
  ) {
    seconds = (ttl.valueOf() - new Date().valueOf()) / 1000;
    if (seconds > 2_592_000) {
      seconds = ttl.valueOf() / 1000;
    }
  } else {
    return defaultTtl;
  }
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.floor(seconds));
  }
  return defaultTtl;
};

const setIncrDecrValue: Decoder = <T>(response: MemcacheResponse<Buffer>) => {
  (response.value as unknown as number) = response.rawValue.readUInt32BE(4);
  return response as unknown as MemcacheResponse<T>;
};
