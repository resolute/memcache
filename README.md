# Memcache

Memcache client library based on binary protocol.

[![Build Status](https://travis-ci.com/resolute/memcache.svg?branch=master)](https://travis-ci.com/resolute/memcache)
[![codecov](https://codecov.io/gh/resolute/memcache/branch/master/graph/badge.svg)](https://codecov.io/gh/resolute/memcache)
[![Total alerts](https://img.shields.io/lgtm/alerts/g/resolute/memcache.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/resolute/memcache/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/resolute/memcache.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/resolute/memcache/context:javascript)

## Key Features

* **Promise**-based API
* Memcached [**Binary Protocol**](https://github.com/memcached/memcached/wiki/BinaryProtocolRevamped)
* [**Reliable** command timeouts](#timeouts)
* [**SASL**](#sasl) Authentication
* [**Compression**](#compression)
* [**Serialization**](#serialization)

## Installation

```
npm i @resolute/memcache
```

## Client Setup

Every instance of `memcache()` represents an encapsulated connection to a server
through either a specified TCP `host:port` or a Unix socket `path`. No options
are shared with other instances. By default, the connection to the server is
kept alive and always tries to reconnect with [incremental backoff](#backoff)
when errors occur. Additionally, [compression](#compression) and
[serialization/deserialization](#serialization) is handled automatically and is
designed to handle most popular use cases. This client also provides [reliable
timeout](#timeouts) for all commands. This document covers specific scenarios
where you may wish to disable or change the default behavior.

``` js
const memcache = require('@resolute/memcache');
const cache = memcache({ /* options */ });
```

### Options

| Property               | Default         | Description                                                                                                                                                                                            |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `port`                 | `11211`         | TCP port for the socket.                                                                                                                                                                               |
| `host`                 | `'127.0.0.1'`   | Host for the socket.                                                                                                                                                                                   |
| `path`                 | `undefined`     | Socket path filename. See [Identifying paths for IPC connections](https://nodejs.org/api/net.html#net_identifying_paths_for_ipc_connections). If provided, the TCP-specific options above are ignored. |
| `queueSize`            | `Infinity`      | Number of requests queued internally (in Node) when Socket.write() is busy.                                                                                                                            |
| `maxKeySize`           | `250`           | Max byte size for any key.                                                                                                                                                                             |
| `maxValueSize`         | `1_048_576`     | Max byte size for any value.                                                                                                                                                                           |
| `connectTimeout`       | `2_000`         | Milliseconds connecting can take before being terminated and retried.                                                                                                                                  |
| `multiResponseOpCodes` | `[0x10]`        | Array of Memcached OpCodes that return multiple responses for a single request. Default: array of only [`stat`](#stat)’s OpCode (`0x10`).                                                              |
| `retries`              | `Infinity`      | Maximum number of reconnection attempts before emitting [`kill` event](#kill-event).                                                                                                                   |
| `minDelay`             | `100`           | Milliseconds used as initial incremental backoff for reconnection attempts.                                                                                                                            |
| `maxDelay`             | `30_000`        | Maximum milliseconds between reconnection attempts.                                                                                                                                                    |
| `backoff`              | *(incremental)* | [Backoff](#backoff) function called between retry attempts.                                                                                                                                            |
| `username`             | `undefined`     | SASL username.                                                                                                                                                                                         |
| `password`             | `undefined`     | SASL password.                                                                                                                                                                                         |
| `ttl`                  | `0`             | Default TTL in seconds, Dates may _not_ be used for default TTL. See [Expiration Time](#expiration-time).                                                                                              |
| `commandTimeout`       | `4_000`         | Milliseconds any command may take before rejecting. See [Timeouts](#timeouts).                                                                                                                         |
| `compression`          | *(enabled)*     | [Compression](#compression) options or  `false` to disable.                                                                                                                                            |
| `serialization`        | *(enabled)*     | [Serialization](#serialization) options or `false` to disable.                                                                                                                                         |

## Timeouts

This client provides two timeout options, `connectTimeout` and `commandTimeout`.

The `connectTimeout` is simply the number of milliseconds the `Socket.connect()`
method must take to connect to the server. This also applies to any reconnection
attempts. The importance of the `connectTimeout` is much less significant than
the `commandTimeout` for most applications.

The `commandTimeout` option is the most important timeout to specify. It marks
the time from when you issue an command up until the _complete_ response is
returned from the server. This ensures that your command will complete or fail
within the configured `commandTimeout` milliseconds.

Many things could happen that could cause delays: network degradation, server
flapping, etc. Regardless of the reason, you can be confident that your commands
will _always_ succeed or fail within the specified number of milliseconds. You
may then decide to poll the data source if this occurs without wasting time for
what _should be_ a fast cache lookup.

For example, If you’re using Memcache to store SQL responses, you may wish to
configure a low `commandTimeout` like `200` milliseconds. If the server becomes
unavailable for whatever reason, the cache retrieval will fail in 200
milliseconds and your code could continue to query SQL for the response and
return it to the end user. In this scenario, you are mitigating the amount of
time your app will wait for a degraded Memcache connection.

## Compression

| Property     | Default        | Description                                                              |
| ------------ | -------------- | ------------------------------------------------------------------------ |
| `flag`       | `0b1`          | Compression bitmask.                                                     |
| `options`    | `{ level: 1 }` | See [Zlib Options](https://nodejs.org/api/zlib.html#zlib_class_options). |
| `threshold`  | `maxValueSize` | Compress values larger than `threshold`.                                 |
| `compress`   | `zlib.gzip`    |                                                                          |
| `decompress` | `zlib.gunzip`  |                                                                          |

By default, the client uses Node’s internal `zlib.gzip` and `zlib.gunzip` for
values that exceed `compression.threshold`.

To disable compression completely *for both storage and retrieval*, pass 
`{ compression: false }` when initializing the Memcache client.

To change the compression format, simply pass any compression utility. For
example, to use Brotli compression instead of Gzip:

``` js
const { brotliCompress, brotliDecompress } = require('zlib');
const compression = {
  compress: brotliCompress,
  decompress: brotliDecompress,
  flag: 0b100000 // match another brotli-enabled client
}
const cache = memcache({ compression });
```

## Serialization

| Property      | Default          | Description                                           |
| ------------- | ---------------- | ----------------------------------------------------- |
| `stringFlag`  | `0`              | Bitmask flag to identify value stored as a string.    |
| `jsonFlag`    | `0b10`           | Bitmask flag to identify value stored as JSON.        |
| `binaryFlag`  | `0b100`          | Bitmask flag to identify value stored as binary/blob. |
| `numberFlag`  | `0b1000`         | Bitmask flag to identify value stored as a number.    |
| `serialize`   | `JSON.stringify` |                                                       |
| `deserialize` | `JSON.parse`     |                                                       |

All `value`s are sent to and received from the server as a `Buffer` over the
binary protocol. By default, the client performs useful transformations
accordingly:

| `typeof value`           | `flags` set  | `Buffer` Encoding                  |
| ------------------------ | ------------ | ---------------------------------- |
| `undefined`              | `0`          | `Buffer.alloc(0)`                  |
| `string`                 | `stringFlag` | `Buffer.from(<string>)`            |
| `number`                 | `numberFlag` | `Buffer.from(<number>.toString())` |
| [`Buffer`](#buffer)-like | `binaryFlag` | as-is                              |
| _any_<sup>*</sup>        | `jsonFlag`   | `Buffer.from(serialize(<value>))`  |

<sup>*</sup> `object` (non-Buffer), `array`, `boolean`, `null`, etc. is passed to `serialize` then converted to `Buffer` and `jsonFlag` is set.

Similarly, retrieval commands ([`get`](#get), [`gat`](#gat)) decode the response value by:

| `response.flag` | `response.value` Buffer Decoding                                                         |
| --------------- | ---------------------------------------------------------------------------------------- |
| `binaryFlag`    | `<Buffer>` (as is)                                                                       |
| `stringFlag`    | `<Buffer>.toString()`                                                                    |
| `numberFlag`    | `Number(<Buffer>.toString())`                                                            |
| `jsonFlag`      | if `<Buffer>.length === 0` then `undefined` otherwise `deserialize(<Buffer>.toString())` |

You may substitute the default JSON serializer/deserializer with with other
powerful alternatives, like:

[yieldable-json](https://www.npmjs.com/package/yieldable-json):
```js
const { stringifyAsync, parseAsync } = require('yieldable-json');
const serialization = {
  serialize: stringifyAsync,
  deserialize: parseAsync,
};
const { get, set } = memcache({ serialization })
```

[fast-json-stable-stringify](https://www.npmjs.com/package/fast-json-stable-stringify):
```js
const fastJsonStableStringify = require('fast-json-stable-stringify');
const serialization = {
  serialize: fastJsonStableStringify,
  // and still use the default JSON.parse for deserialize
};
const { get, set } = memcache({ serialization })
```

## Expiration Time

The [`set`](#set), [`add`](#add), [`replace`](#replace), [`incr`](#incr),
[`decr`](#decr), [`touch`](#touch), [`gat`](#gat), [`flush`](#flush) commands
accept a [`ttl`](#expiration-time) expiration time.

You may specify either a `Date` object in the future or the number of _seconds_
(from now) when a key should expire.

`0` means never expire.

If you pass a `number`, this can be up to 30 days (2,592,000 seconds). After 30
days, it is treated as a unix timestamp of an exact date.

`Date` objects are converted to the number of seconds until that date if it is
less than or equal to 30 days otherwise it will be converted to a unix timestamp
in seconds, abiding by this protocol. This is the easiest way to set longer
expiration times without confusion.

**Note**: you may _not_ use a `Date` object when specifying a default
[`ttl`](#expiration-time) option for the memcache client. Only a number of
seconds is allowed in this case.

## Check And Set

All commands that resolve to a [`MemcacheResponse`](#memcacheresponse) include a
`cas` (check and set) property. This is a unique representation of the value
after the command has completed (See [Binary Protocol
Specification](https://github.com/memcached/memcached/wiki/BinaryProtocolRevamped#set-add-replace)
for more information). You may pass a `cas` back to any write operation
([`set`](#set), [`replace`](#replace), [`incr`](#incr), [`decr`](#decr),
[`append`](#append), [`prepend`](#prepend)) in order to ensure that the value
has not changed since the previous command. In other words, if the value of
specified key has changed, your operation will fail. This is useful for
resolving race conditions.

``` js
const { ERR_KEY_EXISTS } = require('@resolute/memcache/error');
const { set } = memcache();
const { value, cas } = await set('foo', 'abc');
// another process mutates the value
try {
  await append('foo', 'def', { cas });
} catch (error) {
  if (error.status === ERR_KEY_EXISTS) {
    // 'foo' has changed since we last `set`
  }
}
```

## SASL

Some Memcached servers require SASL authentication. Please note that SASL does
*not* provide any encryption or even any real protection to your data. It may
only be regarded as a simple way to prevent unintentional access/corruption on
*trusted* networks.

Note: most servers require the `username` in the “user@host” format.

## Commands

### `get`
Get the value for the given key.

| Param     | Type                 |
| --------- | -------------------- |
| **`key`** | `string` \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;T&gt;&gt;</code>

**Throws**: If key does not exist.

**Example**
```js
const { ERR_KEY_NOT_FOUND } = require('@resolute/memcache/error');
const { get } = memcache();
try {
  const { value, cas } = await get('foo');
  return {
    // value for “foo”
    value,
    // “check-and-set” buffer that can be
    // passed as option to another command.
    cas
  }
} catch (error) {
  if (error.status === ERR_KEY_NOT_FOUND) {
    // not found → '' (empty string)
    return '';
  } else {
    // re-throw any other error
    throw error;
  }
}
```

**See**: [`gat`](#gat)

### `set`
Set the value for the given key.

| Param                                          | Type                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| **`key`**                                      | `string` \| `Buffer`                                |
| **`value`**                                    | `*`                                                 |
| *`options`*                                    | `object` \| [`ttl`](#expiration-time)               |
| *<code>options.[ttl](#expiration-time)</code>* | `number` \| `Date`                                  |
| *<code>options.[cas](#check-and-set)</code>*   | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |
| *<code>options.[flags](#flags)</code>*         | `number`                                            |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Throws**: If unable to store value for any reason.

**Note:** Unlike [add](#add), this method will overwrite any existing value
associated with given key.

**Example**
```js
const { set } = memcache();
try {
  // expire in 1 minute
  await set('foo', 'bar', 60);
} catch (error) {
  // any error means that the
  // value was not stored
}
```

**See**: [`add`](#add), [`replace`](#replace)

### `add`
Add a value for the given key.

| Param                                          | Type                                  |
| ---------------------------------------------- | ------------------------------------- |
| **`key`**                                      | `string` \| `Buffer`                  |
| **`value`**                                    | `*`                                   |
| *`options`*                                    | `object` \| [`ttl`](#expiration-time) |
| *<code>options.[ttl](#expiration-time)</code>* | `number` \| `Date`                    |
| *<code>options.[flags](#flags)</code>*         | `number`                              |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Throws**: If `key` exists.

**Note:** Unlike `set`, this method will fail if a value is already assigned to
the given key.

**Example**
```js
const { ERR_KEY_EXISTS } = require('@resolute/memcache/error');
const { add } = memcache();
try {
  await add('foo', 'bar'); // works
  await add('foo', 'baz'); // fails
} catch (error) {
  // error.status === ERR_KEY_EXISTS
  // 'bar' is still the value
}
```

**See**: [`set`](#set), [`replace`](#replace)

### `replace`
Replace a value for the given key.

| Param                                          | Type                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| **`key`**                                      | `string` \| `Buffer`                                |
| **`value`**                                    | `*`                                                 |
| *`options`*                                    | `object` \| [`ttl`](#expiration-time)               |
| *<code>options.[ttl](#expiration-time)</code>* | `number` \| `Date`                                  |
| *<code>options.[cas](#check-and-set)</code>*   | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |
| *<code>options.[flags](#flags)</code>*         | `number`                                            |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Throws**: If `key` does *not* exist.

**Note:** Conversely to `add`, this method will fail the key has expired or does
not exist.

**Example**
```js
const { ERR_KEY_NOT_FOUND } = require('@resolute/memcache/error');
const { replace, set, del } = memcache();
try {
  await set('foo', 'bar');
  await replace('foo', 'baz'); // works
  await del('foo');
  await replace('foo', 'bar'); // fails
} catch (error) {
  // error.status === ERR_KEY_NOT_FOUND
}
```

**See**: [`set`](#set), [`add`](#add)

### `del`
### `delete` (alias to `del`)
Delete the given key.

| Param     | Type                 |
| --------- | -------------------- |
| **`key`** | `string` \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Throws**: If `key` does *not* exist.

**Note:** `del` throws an error if the key does not exist _as well as_ for many
other issues. However, you might consider that a “key not found” error satisfies
the deletion of a key. This common pattern is demonstrated in the example.

**Example**
```js
const { ERR_KEY_NOT_FOUND } = require('@resolute/memcache/error');
const { del } = memcache();
try {
  await del('foo');
} catch (error) {
  if (error.status !== ERR_KEY_NOT_FOUND) {
    throw error; // rethrow any other error
  }
}
```

### `incr`
### `increment` (alias to `incr`)
Increment *numeric* value of given key.

| Param                                          | Type                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| **`key`**                                      | `string` \| `Buffer`                                |
| **`amount`**                                   | `number`                                            |
| *`options`*                                    | `object` \| [`ttl`](#expiration-time)               |
| *<code>options.[ttl](#expiration-time)</code>* | `number` \| `Date`                                  |
| *<code>options.[cas](#check-and-set)</code>*   | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |
| *<code>options.[initial](#incr-decr)</code>*   | `number`                                            |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;number&gt;&gt;</code>

**Throws**: If `key` contains non-numeric value.

**Note:** If the `key` is does not exist, the key will be “set” with the
`initial` value (default: 0). However, _no_ `flags` will be set and a subsequent
`get` will return a `string` or `Buffer` instead of a `number`. Use caution by
either type checking the `MemcacheResponse.value` during `get` or using `await
incr(key, 0)` to retrieve the number. See [Incr/Decr](#incr-decr).

**Example**
```js
const { incr, del } = memcache();

// example of unexpected `typeof response.value`:
await del('foo').catch(() => {}); // ignore any error
await incr('foo', 1, { initial: 1 }); // but no flags set
const { value } = await get('foo');
typeof value === 'string'; // true
value; // '1'

// this time, it would be a numeric response:
await set('foo', 0);
await incr('foo', 1);
const { value } = await get('foo');
typeof value === 'number'; // true
value; // 1
```

**See**: [`decr`](#decr)

### `decr`
### `decrement` (alias to `decr`)
Decrement *numeric* value of the given key.

| Param                                          | Type                                                |
| ---------------------------------------------- | --------------------------------------------------- |
| **`key`**                                      | `string` \| `Buffer`                                |
| **`amount`**                                   | `number`                                            |
| *`options`*                                    | `object` \| [`ttl`](#expiration-time)               |
| *<code>options.[ttl](#expiration-time)</code>* | `number` \| `Date`                                  |
| *<code>options.[cas](#check-and-set)</code>*   | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |
| *<code>options.[initial](#incr-decr)</code>*   | `number`                                            |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;number&gt;&gt;</code>

**Throws**: If `key` contains non-numeric value.

**Note:** Decrementing a counter will never result in a “negative value” (or
cause the counter to “wrap”). Instead the counter is set to `0`. Incrementing
the counter may cause the counter to wrap.

**Example**
```js
const { decr, del } = memcache();
await del('foo').catch(() => {}); // ignore any error
await decr('foo', 1, { initial: 10 }); // .value === 10
await decr('foo', 1); // .value === 9
await decr('foo', 10); // .value === 0 (not -1)
```

**See**: [`incr`](#incr)

### `append`
Append the specified value to the given key.

| Param                     | Type                                                |
| ------------------------- | --------------------------------------------------- |
| **`key`**                 | `string` \| `Buffer`                                |
| **`value`**               | `string` \| `Buffer`                                |
| *[`cas`](#check-and-set)* | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Throws**: If `key` does not exist.

**Example**
```js
const { append, set, get } = memcache();
await set('foo', 'ab');
await append('foo', 'c');
await get('foo'); // 'abc'
```

**See**: [`prepend`](#prepend)

### `prepend`
Prepend the specified value to the given key.

| Param                     | Type                                                |
| ------------------------- | --------------------------------------------------- |
| **`key`**                 | `string` \| `Buffer`                                |
| **`value`**               | `string` \| `Buffer`                                |
| *[`cas`](#check-and-set)* | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Throws**: If `key` does not exist.

**Example**
```js
const { prepend, set, get } = memcache();
await set('foo', 'bc');
await prepend('foo', 'a');
await get('foo'); // 'abc'
```

**See**: [`append`](#append)

### `touch`
Set a new expiration time for an existing item.

| Param                         | Type                 |
| ----------------------------- | -------------------- |
| **`key`**                     | `string` \| `Buffer` |
| **[`ttl`](#expiration-time)** | `number` \| `Date`   |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Throws**: `ERR_KEY_NOT_FOUND` if `key` does not exist.

**Example**
```js
const { touch } = memcache();
await touch('foo', 3600); // expire in 1 hour
```

**See**: [`gat`](#gat)

### `gat`
Get And Touch is used to set a new expiration time for an existing item and
retrieve its value.

| Param                         | Type                 |
| ----------------------------- | -------------------- |
| **`key`**                     | `string` \| `Buffer` |
| **[`ttl`](#expiration-time)** | `number` \| `Date`   |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;T&gt;&gt;</code>

**Throws**: If `key` does not exist.

**Example**
```js
const { gat } = memcache();
await gat('foo', 3600); // expire in 1 hour
```

**See**: [`get`](#get), [`touch`](#touch)

### `flush`
Flush the items in the cache now or some time in the future as specified by the
optional `ttl` parameter.

| Param                       | Type               |
| --------------------------- | ------------------ |
| *[`ttl`](#expiration-time)* | `number` \| `Date` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&lt;void&gt;&gt;</code>

**Note**: If `ttl` is unspecified, then it will default to `0`—*not* the
configured default `ttl`.

**Example**
```js
const { flush } = memcache();
await flush(); // delete all keys immediately
```

### `version`
Version string in the body with the following format: “x.y.z”

**Returns**: <code>Promise&lt;string&gt;</code>

**Example**
```js
const { version } = memcache();
await version(); // '1.5.14'
```

### `stat`
Statistics. Without a key specified the server will respond with a “default” set
of statistics information.

| Param   | Type     |
| ------- | -------- |
| *`key`* | `string` |

**Returns**: <code>Promise&lt;{Object.&lt;string, string&gt;}&gt;</code>

**Note**: supported `key` options: `'slabs'`, `'settings'`, `'sizes'`, but others
may work depending on your server.

**Example**
```js
const { stat } = memcache();
await stat('slabs');
```

## Keepalive

By default, the client will constantly try to reconnect to the server when
connection errors occur. When disabled, any network error will cause the client
to emit the [`kill` event](#kill-event) and no further connection attempts will
be made. Any command issued to a client that has emitted the `kill` event will
immediately reject with the error causing the connection `kill` event.

## Backoff

The internal backoff is simply a function of `attempt * minDelay` until it
exceeds `maxDelay`. The following example shows how to implement exponential
backoff if preferred:

```js
const cache = memcache({
  backoff: (attempt) => 100 * (2 ** attempt), // exponential backoff
  maxDelay: 30_000 // never wait longer than 30 seconds
})
```

## Kill Event

By default, client will try to re-establish the connection when encountering
connection errors. However, if `failures` attempts has been reached, SASL auth
is required and fails, or you explicitly invoke the `kill()` method, all
reconnection attempts will be terminated and no further attempts will be made.
This library will emit a kill event when any of these scenarios occurs.

``` js
const cache = memcache();
cache.on('kill', (error) => {
  // This connection has either:
  // 1. reached the maximum number of `failures` attempts, or
  // 2. SASL authentication failed, or
  // 3. `cache.kill()` was invoked.
})
```

## Flags

The [`set`](#set), [`add`](#add), [`replace`](#replace) commands accept a
`flags` property on the optional `options` parameter. When using the default
serialization and/or the compression functions, flags are set using bitmask
against `stringFlag`, `jsonFlag`, `binaryFlag`, `numberFlag`, and
`compressionFlag`.

If you require special behavior, you may disable these serializes and
compression and/or provide your own `flags` property to these commands. When you
retrieve your key through `get` or `gat`, you may reference and test the `flags`
of any [`MemcacheResponse`](#memcacheresponse) using the `.flags` getter.

## Buffer

All `Buffer` parameters will also accept Buffer-like types such as:
`ArrayBuffer`, `SharedArrayBuffer`, `DataView`.

## Incr/Decr

The `incr` and `decr` commands are very handy, but can easily have unexpected
results. Take the following example:

```js
const { incr, get } = memcache();
await incr('foo', 1, { initial: 1 });
const { value } = await get('foo');
console.log(typeof value); // string, expected number
```

This is because the `incr` and `decr` commands do _not_ accept a flags
parameter. If the key does not already exist, then these commands will set the
value to the `initial` value (or `0` if not specified). When this happens, the
flags for that key will be set to `0`. As a result, it is not guaranteed that
you will receive the value as a number on a subsequent `get`.

Because the `incr` and `decr` commands always return the `value` as a number
_after_ performing the command, you may simply issue a `incr(key, 0)` to read
the value as a number as illustrated below. While this approach guarantees that
the response value is a number, it will also create the key if it doesn’t exist.

```js
const { incr } = memcache();
await incr('foo', 1, { initial: 1 });
// ... some time later, you want to check the current value:
const { value } = await incr('foo', 0);
console.log(typeof value); // number (always)
console.log(value); // 1 (or possibly 0 if it didn’t exist)
```

Additionally, if another process changes a value to something other than a
number, your `incr`/`decr` commands will throw a
`ERR_INCR_DECR_ON_NON_NUMERIC_VALUE` error.

**Note**: Memcached allows for 64-bit integers, but JavaScript bitwise
operations are only supported on 32-bit integers. Node v12 introduces native
support for `bigint`. This package may optionally allow to represent these
values as `bigint` at some point in the future.

## `MemcacheResponse`

`MemcacheResponse` is a small wrapper for the binary data returned from the
server. The `rawValue` (getter) property will always return the raw Buffer sent
by the server. When using compression and/or serialization, the `value` (getter)
property will return the uncompressed deserialized value for the given request.
Use the [`cas`](#check-and-set) (getter) property to reference the check-and-set
value. [`flags`](#flags) may also be referenced if you have special
requirements.

```js
const response = await get('foo');

// the final value after all deserialization and decompression:
response.value;

// raw Buffer response from server before any deserialization or decompression:
response.rawValue;

// check-and-set 8-byte Buffer:
response.cas;

// 32-bit integer:
response.flags;
```

## `MemcacheError`

All commands may reject with an error object represented by the following
properties:

```js
MemcacheError {
  message: '…', // descriptive error
  status: number, // one of the codes returned by client or server
  type: 'client|server', // origin of error
  request: MemcacheRequest, // request that caused the error
  response: MemcacheResponse, // server response, if one exists
  error: Error // if another error caused this error (ex. gzip failed)
}
```

| `.type` | `.status`                                 | Code   |
| ------- | ----------------------------------------- | ------ |
| server  | ERR_KEY_NOT_FOUND                         | 0x0001 |
| server  | ERR_KEY_EXISTS                            | 0x0002 |
| server  | ERR_VALUE_TOO_LARGE                       | 0x0003 |
| server  | ERR_INVALID_ARGUMENTS                     | 0x0004 |
| server  | ERR_ITEM_NOT_STORED                       | 0x0005 |
| server  | ERR_INCR_DECR_ON_NON_NUMERIC_VALUE        | 0x0006 |
| server  | ERR_THE_VBUCKET_BELONGS_TO_ANOTHER_SERVER | 0x0007 |
| server  | ERR_AUTHENTICATION_ERROR                  | 0x0008 |
| server  | ERR_AUTHENTICATION_CONTINUE               | 0x0009 |
| server  | ERR_AUTHENTICATION_FAILED                 | 0x0020 |
| server  | ERR_UNKNOWN_COMMAND                       | 0x0081 |
| server  | ERR_OUT_OF_MEMORY                         | 0x0082 |
| server  | ERR_NOT_SUPPORTED                         | 0x0083 |
| server  | ERR_INTERNAL_ERROR                        | 0x0084 |
| server  | ERR_BUSY                                  | 0x0085 |
| server  | ERR_TEMPORARY_FAILURE                     | 0x0086 |
| client  | ERR_UNEXPECTED                            | 0x0100 |
| client  | ERR_CONNECTION                            | 0x0101 |
| client  | ERR_INVALID                               | 0x0102 |
| client  | ERR_COMPRESSION                           | 0x0103 |
| client  | ERR_SERIALIZATION                         | 0x0104 |

```js
const { ERR_KEY_NOT_FOUND } = require('@resolute/memcache/error');
const { get } = memcache();
try {
  const { value } = await get('foo');
  return value;
} catch (error) {
  switch (error.status) {
    case ERR_KEY_NOT_FOUND:
      return undefined;
    default
      throw error; // rethrow
  }
 }
```

## Cluster

The focus of this client is to provide an extremely reliable connection to a
single server. It intentionally does not provide cluster/hashring support.
Cluster/hashring may be considered in a separate package that would use this
reliable client for each of the nodes.

## AWS
Currently, this client does not support [AWS
ElastiCache](https://aws.amazon.com/elasticache/) specific `config get cluster`
commands. Pull requests welcomed for this feature. AWS supported [Java
client](https://github.com/awslabs/aws-elasticache-cluster-client-memcached-for-java/blob/master/src/main/java/net/spy/memcached/protocol/binary/GetConfigOperationImpl.java)
reference.

## Testing

Testing this client requires local access to a SASL-enabled memcached server.
`bin/memcached-sasl.sh` contains a sample shell script for downloading and
compiling the latest version of Memcached with SASL support.

## Overloading

TODO
