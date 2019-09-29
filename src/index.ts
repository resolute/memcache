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
 * Create a Memcache client.
 */
const memcache = (options: MemcacheOptions = {}) => {
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

  const flush = async (ttl?: Ttl) =>
    funnel(new MemcacheRequest<MemcacheResponse<void>>({
      opcode: 0x08,
      // If unspecified, users expect the TTL to be immediate for `flush`.
      ttl: sanitizeTtl(0)(ttl),
    })).through([
      send,
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
    /**
     * Get the value for the given key.
     *
     * **Returns**: Promise<MemcacheResponse<T>>
     *
     * **Throws**: If key does not exist.
     *
     * **Example**
     * ```js
     * const { ERR_KEY_NOT_FOUND } = require('@resolute/memcache/error');
     * const { get } = memcache();
     * try {
     *   const { value, cas } = await get('foo');
     *   return {
     *     // value for “foo”
     *     value,
     *     // “check-and-set” buffer that can be
     *     // passed as option to another command.
     *     cas
     *   }
     * } catch (error) {
     *   if (error.status === ERR_KEY_NOT_FOUND) {
     *     // not found → '' (empty string)
     *     return '';
     *   } else {
     *     // re-throw any other error
     *     throw error;
     *   }
     * }
     * ```
     */
    get,
    /**
     * Set the value for the given key.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Throws**: If unable to store value for any reason.
     *
     * **Note:** Unlike [add](#add), this method will overwrite any existing
     * value associated with given key.
     *
     * **Example**
     * ```js
     * const { set } = memcache();
     * try {
     *   // expire in 1 minute
     *   await set('foo', 'bar', 60);
     * } catch (error) {
     *   // any error means that the
     *   // value was not stored
     * }
     * ```
     */
    set,
    /**
     * Add a value for the given key.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Throws**: If `key` exists.
     *
     * **Note:** Unlike `set`, this method will fail if a value is already
     * assigned to the given key.
     *
     * **Example**
     * ```js
     * const { ERR_KEY_EXISTS } = require('@resolute/memcache/error');
     * const { add } = memcache();
     * try {
     *   await add('foo', 'bar'); // works
     *   await add('foo', 'baz'); // fails
     * } catch (error) {
     *   // error.status === ERR_KEY_EXISTS
     *   // 'bar' is still the value
     * }
     * ```
     */
    add,
    /**
     * Replace a value for the given key.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Throws**: If `key` does *not* exist.
     *
     * **Note:** Conversely to `add`, this method will fail the key has expired
     * or does not exist.
     *
     * **Example**
     * ```js
     * const { ERR_KEY_NOT_FOUND } = require('@resolute/memcache/error');
     * const { replace, set, del } = memcache();
     * try {
     *   await set('foo', 'bar');
     *   await replace('foo', 'baz'); // works
     *   await del('foo');
     *   await replace('foo', 'bar'); // fails
     * } catch (error) {
     *   // error.status === ERR_KEY_NOT_FOUND
     * }
     * ```
     */
    replace,
    /**
     * Delete the given key.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Throws**: If `key` does *not* exist.
     *
     * **Note:** `del` throws an error if the key does not exist _as well as_ for many
     * other issues. However, you might consider that a “key not found” error satisfies
     * the deletion of a key. This common pattern is demonstrated in the example.
     *
     * **Example**
     * ```js
     * const { ERR_KEY_NOT_FOUND } = require('@resolute/memcache/error');
     * const { del } = memcache();
     * try {
     *   await del('foo');
     * } catch (error) {
     *   if (error.status !== ERR_KEY_NOT_FOUND) {
     *     throw error; // rethrow any other error
     *   }
     * }
     * ```
     */
    del,
    /**
     * Increment *numeric* value of given key.
     *
     * **Returns**: Promise<MemcacheResponse<number>>
     *
     * **Throws**: If `key` contains non-numeric value.
     *
     * **Note:** If the `key` is does not exist, the key will be “set” with the
     * `initial` value (default: 0). However, _no_ `flags` will be set and a
     * subsequent `get` will return a `string` or `Buffer` instead of a
     * `number`. Use caution by either type checking the
     * `MemcacheResponse.value` during `get` or using `await incr(key, 0)` to
     * retrieve the number. See [Incr/Decr](#incr-decr).
     *
     * **Example**
     * ```js
     * const { incr, del } = memcache();
     *
     * // example of unexpected `typeof response.value`:
     * await del('foo').catch(()=>{}); // ignore any error
     * await incr('foo', 1, { initial: 1 }); // but no flags set
     * const { value } = await get('foo');
     * typeof value === 'string'; // true
     * value; // '1'
     *
     * // this time, it would be a numeric response:
     * await set('foo', 0);
     * await incr('foo', 1);
     * const { value } = await get('foo');
     * typeof value === 'number'; // true
     * value; // 1
     * ```
     */
    incr,
    /**
     * Decrement *numeric* value of the given key.
     *
     * **Returns**: Promise<MemcacheResponse<number>>
     *
     * **Throws**: If `key` contains non-numeric value.
     *
     * **Note:** Decrementing a counter will never result in a “negative value”
     * (or cause the counter to “wrap”). Instead the counter is set to `0`.
     * Incrementing the counter may cause the counter to wrap.
     *
     * **Example**
     * ```js
     * const { decr, del } = memcache();
     * await del('foo').catch(()=>{}); // ignore any error
     * await decr('foo', 1, { initial: 10 }); // .value === 10
     * await decr('foo', 1); // .value === 9
     * await decr('foo', 10); // .value === 0 (not -1)
     * ```
     */
    decr,
    /**
     * Append the specified value to the given key.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Throws**: If `key` does not exist.
     *
     * **Example**
     * ```js
     * const { append, set, get } = memcache();
     * await set('foo', 'ab');
     * await append('foo', 'c');
     * await get('foo'); // 'abc'
     * ```
     */
    append,
    /**
     * Prepend the specified value to the given key.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Throws**: If `key` does not exist.
     *
     * **Example**
     * ```js
     * const { prepend, set, get } = memcache();
     * await set('foo', 'bc');
     * await prepend('foo', 'a');
     * await get('foo'); // 'abc'
     * ```
     */
    prepend,
    /**
     * Set a new expiration time for an existing item.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Throws**: `ERR_KEY_NOT_FOUND` if `key` does not exist.
     *
     * **Example**
     * ```js
     * const { touch } = memcache();
     * await touch('foo', 3600); // expire in 1hr
     * ```
     */
    touch,
    /**
     * Get And Touch is used to set a new expiration time for an existing item
     * and retrieve its value.
     *
     * **Returns**: Promise<MemcacheResponse<T>>
     *
     * **Throws**: If `key` does not exist.
     *
     * **Example**
     * ```js
     * const { gat } = memcache();
     * await gat('foo', 3600); // expire in 1hr
     * ```
     */
    gat,
    /**
     * Flush the items in the cache now or some time in the future as specified
     * by the optional `ttl` parameter.
     *
     * **Returns**: Promise<MemcacheResponse<void>>
     *
     * **Note**: If `ttl` is unspecified, then it will default to `0`—*not* the
     * configured default `ttl`.
     *
     * **Example**
     * ```js
     * const { flush } = memcache();
     * await flush(); // delete all keys immediately
     * ```
     */
    flush,
    /**
     * Version string in the body with the following format: “x.y.z”
     *
     * **Returns**: Promise<MemcacheResponse<string>>
     *
     * **Example**
     * ```js
     * const { version } = memcache();
     * await version(); // '1.5.14'
     * ```
     */
    version,
    /**
     * Statistics. Without a key specified the server will respond with a
     * “default” set of statistics information.
     *
     * **Returns**: Promise<MemcacheResponse<{Object.<string, string>}>
     *
     * **Note**: supported `key` options: `'slabs'`, `'settings'`, `'sizes'`,
     * but others may work depending on your server.
     *
     * **Example**
     * ```js
     * const { stat } = memcache();
     * await stat('slabs');
     * ```
     */
    stat,
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
