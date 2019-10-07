/* eslint-disable max-len */
import {
  MemcacheOptions, MemcacheRequestOptions, CommandCallback,
  Encoder, Decoder, Send,
  Get, SetReplace, Add, IncrDecr, Del, AppendPrepend, Gat,
  Flush, Touch, Version, Stat,
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
  const get: Get = <T>(key: any, cb?: any): any => {
    const { callback, returnValue } = normalizeCallback(cb);
    const request = new MemcacheRequest({
      opcode: 0x00,
      key,
    });
    flow(request)([
      checkKey,
      send,
      ...decoders,
    ])<MemcacheResponse<T>>(callback);
    return returnValue;
  };

  const set: SetReplace = (key: any, value: any, ...args: any[]): any => {
    const { callback, returnValue, ...options } = normalizeOptions(defaultTtl)(...args);
    const request = new MemcacheRequest({
      opcode: 0x01,
      key,
      value,
      ...options,
    });
    flow(request)([
      ...encoders,
      checkKey,
      checkValue,
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const add: Add = (key: any, value: any, ...args: any[]): any => {
    const { callback, returnValue, ...options } = normalizeOptions(defaultTtl)(...args);
    const request = new MemcacheRequest({
      opcode: 0x02,
      key,
      value,
      ...options,
    });
    flow(request)([
      ...encoders,
      checkKey,
      checkValue,
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const replace: SetReplace = (key: any, value: any, ...args: any[]): any => {
    const { callback, returnValue, ...options } = normalizeOptions(defaultTtl)(...args);
    const request = new MemcacheRequest({
      opcode: 0x03,
      key,
      value,
      ...options,
    });
    flow(request)([
      ...encoders,
      checkKey,
      checkValue,
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const del: Del = (key: any, cb?: any): any => {
    const { callback, returnValue } = normalizeCallback(cb);
    const request = new MemcacheRequest({
      opcode: 0x04,
      key,
    });
    flow(request)([
      checkKey,
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const incr: IncrDecr = (key: any, amount: any, ...args: any[]): any => {
    const { callback, returnValue, ...options } = normalizeOptions(defaultTtl)(...args);
    const request = new MemcacheRequest({
      opcode: 0x05,
      key,
      amount,
      ...options,
    });
    flow(request)([
      checkKey,
      checkAmount,
      send,
      decodeIncrDecrValue,
    ])<MemcacheResponse<number>>(callback);
    return returnValue;
  };

  const decr: IncrDecr = (key: any, amount: any, ...args: any[]): any => {
    const { callback, returnValue, ...options } = normalizeOptions(defaultTtl)(...args);
    const request = new MemcacheRequest({
      opcode: 0x06,
      key,
      amount,
      ...options,
    });
    flow(request)([
      checkKey,
      checkAmount,
      send,
      decodeIncrDecrValue,
    ])<MemcacheResponse<number>>(callback);
    return returnValue;
  };

  const append: AppendPrepend = (key: any, value: any, ...args: any[]): any => {
    const { callback, returnValue, cas } = normalizeAppendPrependOptions(...args);
    const request = new MemcacheRequest({
      opcode: 0x0e,
      key,
      value,
      cas,
    });
    flow(request)([
      checkKey,
      checkValue,
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const prepend: AppendPrepend = (key: any, value: any, ...args: any[]): any => {
    const { callback, returnValue, cas } = normalizeAppendPrependOptions(...args);
    const request = new MemcacheRequest({
      opcode: 0x0f,
      key,
      value,
      cas,
    });
    flow(request)([
      checkKey,
      checkValue,
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const touch: Touch = (key: any, ...args: any[]): any => {
    const { callback, returnValue, ttl } = normalizeOptions(defaultTtl)(...args);
    const request = new MemcacheRequest({
      opcode: 0x1c,
      key,
      ttl,
    });
    flow(request)([
      checkKey,
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const gat: Gat = <T>(key: any, ...args: any[]): any => {
    const { callback, returnValue, ttl } = normalizeOptions(defaultTtl)(...args);
    const request = new MemcacheRequest({
      opcode: 0x1d,
      key,
      ttl,
    });
    flow(request)([
      checkKey,
      send,
      ...decoders,
    ])<MemcacheResponse<T>>(callback);
    return returnValue;
  };

  const flush: Flush = (...args: any[]): any => {
    // If unspecified, users expect the TTL to be immediate for `flush`.
    const { callback, returnValue, ttl } = normalizeOptions(0)(...args);
    const request = new MemcacheRequest({
      opcode: 0x08,
      ttl,
    });
    flow(request)([
      send,
    ])<MemcacheResponse<void>>(callback);
    return returnValue;
  };

  const version: Version = (cb?: any): any => {
    const { callback, returnValue } = normalizeCallback(cb);
    const request = new MemcacheRequest({
      opcode: 0x0b,
    });
    flow(request)([
      send,
      // @ts-ignore
      decodeVersion,
    ])<string>(callback);
    return returnValue;
  };

  const stat: Stat = (...args: any[]): any => {
    let key: MemcacheRequestOptions['key'] | undefined;
    let cb: CommandCallback<{ [property: string]: string }> | undefined;
    if (typeof args[0] === 'function') {
      [cb] = args;
    } else {
      [key, cb] = args;
    }
    const { callback, returnValue } = normalizeCallback(cb);
    const request = new MemcacheRequest({
      opcode: 0x10,
      key,
    });
    // @ts-ignore
    flow(request)([
      ...(typeof key === 'undefined' ? [] : [checkKey]),
      send,
      decodeStat,
    ])<{ [property: string]: string }>(callback);
    return returnValue;
  };

  // Memcache Client Context

  const defaultTtl = options.ttl || 0;
  const connection = new MemcacheConnection(options);
  const send = connection.send.bind(connection);
  const encoders: Encoder[] = [];
  const decoders: Decoder[] = [];
  const maxKeySize = options.maxKeySize !== undefined ? options.maxKeySize : 250;
  const maxValueSize = options.maxValueSize !== undefined ? options.maxValueSize : 1_048_576;

  const checkKey: Encoder = (request: MemcacheRequest, callback: CommandCallback<MemcacheRequest>) => {
    const { keyAsBuffer } = request;
    let keyLength = 0;
    /* istanbul ignore else */
    if (keyAsBuffer) {
      keyLength = keyAsBuffer.length;
    }
    if (keyLength === 0 || keyLength > maxKeySize) {
      callback(new MemcacheError({
        message: `Invalid \`key\` size ${keyLength.toLocaleString()} bytes.`,
        status: MemcacheError.ERR_INVALID,
        request,
      }));
    } else {
      // @ts-ignore
      callback(undefined, request);
    }
  };

  const checkValue: Encoder = (request: MemcacheRequest, callback: CommandCallback<MemcacheRequest>) => {
    const { valueAsBuffer } = request;
    let valueLength = 0;
    if (valueAsBuffer) {
      valueLength = valueAsBuffer.length;
    }
    if (valueLength > maxValueSize) {
      callback(new MemcacheError({
        message: `Invalid \`value\` size ${valueLength.toLocaleString()} bytes.`,
        status: MemcacheError.ERR_INVALID,
        request,
      }));
    } else {
      callback(undefined, request);
    }
  };

  const checkAmount: Encoder = <T extends MemcacheRequest, U extends T>(request: T, callback: CommandCallback<U>) => {
    let n = request.amount;
    if (typeof n === 'string') {
      n = parseInt(n, 10);
    }
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      callback(new MemcacheError({
        message: `“${request.amount}” is not a valid amount (number)`,
        status: MemcacheError.ERR_INVALID,
      }));
    } else {
      request.amount = n;
      // @ts-ignore
      callback(undefined, request);
    }
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

const normalizeOptions = (defaultTtl: number) => <T>(options?: number | Date | Partial<Pick<MemcacheRequestOptions, 'ttl' | 'flags' | 'initial' | 'cas'>> | CommandCallback<T>, callback?: CommandCallback<T>) => {
  if (typeof options === 'function') {
    return { flags: 0, ttl: defaultTtl, ...normalizeCallback(options) };
  }
  if (
    typeof options === 'undefined' ||
    typeof options === 'number' ||
    util.types.isDate(options)
  ) {
    return { flags: 0, ttl: sanitizeTtl(defaultTtl)(options), ...normalizeCallback(callback) };
  }
  return {
    flags: 0, ...options, ttl: sanitizeTtl(defaultTtl)(options.ttl), ...normalizeCallback(callback),
  };
};

const normalizeAppendPrependOptions = <T>(cas?: MemcacheRequestOptions['cas'], callback?: CommandCallback<T>) => {
  if (typeof cas === 'function') {
    return { cas: undefined, ...normalizeCallback(cas) };
  }
  return { cas, ...normalizeCallback(callback) };
};

const normalizeCallback: {
  <T>(callback?: CommandCallback<T>): { callback: CommandCallback<T>, returnValue: void };
  <T>(): { callback: CommandCallback<T>, returnValue: Promise<T> };
} = <T>(arg?: any): any => {
  if (typeof arg !== 'undefined') {
    return { callback: arg, returnValue: undefined };
  }
  let callback: CommandCallback<T>;
  const returnValue: Promise<T> = new Promise((resolve, reject) => {
    callback = (error?: MemcacheError, response?: T) => {
      if (typeof error !== 'undefined') {
        reject(error);
      } else {
        resolve(response);
      }
    };
  });
  return { callback: callback!, returnValue };
};

// const flow = (request: MemcacheRequest) => (stack: (<T extends MemcacheRequest | MemcacheResponse, U extends MemcacheRequest | MemcacheResponse>(payload: T, callback: CommandCallback<U>) => void)[]) => <Z>(callback: CommandCallback<Z>) => {
const flow = (request: MemcacheRequest) => (stack: (Send | Encoder | Decoder)[]) => <T>(callback: CommandCallback<T>) => {
  let cursor = 0;
  const recurse = (error?: MemcacheError, result?: any) => {
    if (typeof error !== 'undefined') {
      callback(error);
    } else if (cursor >= stack.length) {
      callback(undefined, result!);
    } else {
      // @ts-ignore
      stack[cursor++](result, recurse);
    }
  };
  recurse(undefined, request);
};

const sanitizeTtl = (defaultTtl: number) => (ttl?: number | Date) => {
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

const decodeIncrDecrValue: Decoder = <T>(response: MemcacheResponse, callback: CommandCallback<MemcacheResponse<T>>) => {
  response.value = response.rawValue.readUInt32BE(4);
  callback(undefined, response as MemcacheResponse<T>);
};

const decodeVersion = (response: MemcacheResponse<Buffer>, callback: CommandCallback<string>) => {
  callback(undefined, response.value.toString());
};

const decodeStat = (responses: MemcacheResponse<Buffer>[], callback: CommandCallback<{ [property: string]: string }>) => {
  callback(undefined, responses.reduce((carry, { key, value }) => {
    // eslint-disable-next-line no-param-reassign
    carry[key.toString()] = value.toString();
    return carry;
  }, {} as { [property: string]: string }));
};
