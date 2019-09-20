import { types } from 'util';
import {
  MemcacheOptions, BufferLike, Ttl, Cas, SetReplace, Add, IncrDecr,
  CommandOptions, Encoder, Decoder, Funnel,
} from './types';

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
    decode<MemcacheResponse<T>>(
      await connection.send(
        checkKeyLength(
          new MemcacheRequest({
            opcode: 0x00, key,
          }),
        ),
      ),
    );

  const set: SetReplace = async (key: BufferLike, value: any, options?: any) =>
    connection.send(
      checkValueLength(
        checkKeyLength(
          await encode(
            new MemcacheRequest<MemcacheResponse<void>>({
              opcode: 0x01,
              key,
              value,
              ...normalizeOptions(defaultTtl)(options),
            }),
          ),
        ),
      ),
    );

  const add: Add = async (key: BufferLike, value: any, options?: any) =>
    connection.send(
      checkValueLength(
        checkKeyLength(
          await encode(
            new MemcacheRequest<MemcacheResponse<void>>({
              opcode: 0x02,
              key,
              value,
              ...normalizeOptions(defaultTtl)(options),
            }),
          ),
        ),
      ),
    );

  const replace: SetReplace = async (key: BufferLike, value: any, options?: any) =>
    connection.send(
      checkValueLength(
        checkKeyLength(
          await encode(
            new MemcacheRequest<MemcacheResponse<void>>({
              opcode: 0x03,
              key,
              value,
              ...normalizeOptions(defaultTtl)(options),
            }),
          ),
        ),
      ),
    );


  const del = async (key: BufferLike) =>
    connection.send(
      checkKeyLength(
        new MemcacheRequest<MemcacheResponse<void>>({
          opcode: 0x04, key,
        }),
      ),
    );

  const incr: IncrDecr = async (key: BufferLike, amount: number, options?: any) => {
    const request = new MemcacheRequest<MemcacheResponse<number>>({
      opcode: 0x05,
      key,
      amount: sanitizeAmount(amount),
      ...normalizeOptions(defaultTtl)(options),
    });
    const response = await connection.send(
      checkKeyLength(
        request,
      ),
    );
    response.value = response.rawValue.readUInt32BE(4);
    return response;
  };

  const decr: IncrDecr = async (key: BufferLike, amount: number, options?: any) => {
    const request = new MemcacheRequest<MemcacheResponse<number>>({
      opcode: 0x06,
      key,
      amount: sanitizeAmount(amount),
      ...normalizeOptions(defaultTtl)(options),
    });
    const response = await connection.send(
      checkKeyLength(
        request,
      ),
    );
    response.value = response.rawValue.readUInt32BE(4);
    return response;
  };

  const append = async (key: BufferLike, value: BufferLike, cas?: Cas) =>
    connection.send(
      checkKeyLength(
        new MemcacheRequest<MemcacheResponse<void>>({
          opcode: 0x0e, key, value, cas,
        }),
      ),
    );

  const prepend = async (key: BufferLike, value: BufferLike, cas?: Cas) =>
    connection.send(
      checkKeyLength(
        new MemcacheRequest<MemcacheResponse<void>>({
          opcode: 0x0f, key, value, cas,
        }),
      ),
    );

  const touch = async (key: BufferLike, ttl: Ttl) =>
    connection.send(
      checkKeyLength(
        new MemcacheRequest<MemcacheResponse<void>>({
          opcode: 0x1c, key, ttl: sanitizeTtl(defaultTtl)(ttl),
        }),
      ),
    );

  const gat = async <T>(key: BufferLike, ttl: Ttl) =>
    decode<MemcacheResponse<T>>(
      await connection.send(
        checkKeyLength(
          new MemcacheRequest({
            opcode: 0x1d, key, ttl: sanitizeTtl(defaultTtl)(ttl),
          }),
        ),
      ),
    );

  const version = async () =>
    (await connection.send<MemcacheResponse<Buffer>>(new MemcacheRequest({
      opcode: 0x0b,
    }))).value.toString();

  const stat = async (key?: BufferLike) => {
    const request = new MemcacheRequest<MemcacheResponse<Buffer>[]>({
      opcode: 0x10, key,
    });
    if (key) {
      // key is not required, but when required, must conform.
      checkKeyLength(request);
    }
    const responses = await connection.send(request);
    return responses.reduce((carry, { key, value }) => {
      // eslint-disable-next-line no-param-reassign
      carry[key.toString()] = value.toString();
      return carry;
    }, {} as { [property: string]: string });
  };

  // If unspecified, users expect the TTL to be immediate for `flush`.
  const flush = async (ttl?: Ttl) =>
    connection.send(
      new MemcacheRequest<MemcacheResponse<void>>({
        opcode: 0x08, ttl: sanitizeTtl(0)(ttl),
      }),
    );

  // Memcache Client Context

  const defaultTtl = options.ttl || 0;
  const connection = new MemcacheConnection(options);
  const encoders: Encoder[] = [];
  const decoders: Decoder[] = [];
  const encode = funnel(encoders);
  const decode = funnel(decoders);
  const maxKeySize = options.maxKeySize !== undefined ? options.maxKeySize : 250;
  const maxValueSize = options.maxValueSize !== undefined ? options.maxValueSize : 1_048_576;

  const checkKeyLength = <T extends MemcacheRequest<any>>(request: T) => {
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
  const checkValueLength = <T extends MemcacheRequest<any>>(request: T) => {
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
    send: connection.send.bind(connection),
    destroy: connection.destroy.bind(connection),
    connection, // underlying Socket
    register,
  };

  // default compression
  register(...normalizeCoder(MemcacheCompression,
    { threshold: options.maxValueSize, ...options.compression }));
  // default serialization
  register(...normalizeCoder(MemcacheSerialization,
    options.serialization));

  return ctx;
};

export = memcache;

const normalizeCoder = (
  factory: typeof MemcacheCompression | typeof MemcacheSerialization,
  options: MemcacheOptions['compression'] | MemcacheOptions['serialization'],
): [Encoder?, Decoder?] => {
  if (options === false) {
    return [];
  }
  return factory(options);
};

const normalizeOptions = (defaultTtl: number) => (options?: Ttl | CommandOptions) => {
  if (
    typeof options === 'undefined' ||
    typeof options === 'number' ||
    types.isDate(options)
  ) {
    return { flags: 0, ttl: sanitizeTtl(defaultTtl)(options) };
  }
  return { flags: 0, ...options, ttl: sanitizeTtl(defaultTtl)(options.ttl) };
};

const funnel: Funnel = (fns: any[]) => async (initial: any) => fns
  .reduce(
    async (value, fn) => fn(await value),
    initial,
  );

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
    types.isDate(ttl)
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
