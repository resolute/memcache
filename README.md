# Memcache

Memcache client library based on binary protocol.

## Key Features

* **Promise**-based API
* [**Compression**](#compression)
* [**SASL**](#sasl) Authentication
* [**JSON**](#serialization) Serialization
* Memcached [**Binary Protocol**](https://github.com/memcached/memcached/wiki/BinaryProtocolRevamped)

## Installation

```
npm i @resolute/memcache
```

## Client Setup

Every instance of `memcache()` represents an encapsulated connection to the memcached server through either a specified TCP `host:port` or a Unix socket `path`. No options are shared with other instances. By default, the connection to the server is kept alive and always tries to reconnect with [incremental backoff](#backoff) when errors occur. Additionally, [compression](#compression) and [serialization/deserialization](#serialization) is handled automatically and is designed to handle most popular use cases. This client also provides [reliable timeout](#timeouts) for all commands. This document covers specific scenarios where you may wish to disable or change the default behavior.

``` js
const memcache = require('@resolute/memcache');
const cache = memcache(options);
```

### Options

| Options                | Default       | Description                                                                                                                                                                                                         |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`connection`**       | `true`        | Provides the basic socket connection to the server.                                                                                                                                                                 |
| `port`                 | `11211`       | TCP port the socket should connect to.                                                                                                                                                                              |
| `host`                 | `'127.0.0.1'` | Host the socket should connect to.                                                                                                                                                                                  |
| `path`                 | `undefined`   | Path the client should connect to. See [Identifying paths for IPC connections](https://nodejs.org/api/net.html#net_identifying_paths_for_ipc_connections). If provided, the TCP-specific options above are ignored. |
| `queueSize`            | `Infinity`    | Number of requests queued internally (in Node) when Socket.write() is busy.                                                                                                                                         |
| `connectTimeout`       | `2_000`       | Milliseconds connecting can take before being terminated and retried.                                                                                                                                               |
| `multiResponseOpCodes` | `[0x10]`      | Array of Memcached OpCodes that return multiple responses for a single request. Default: array of only [`stat`](#stat)’s OpCode (`0x10`).                                                                           |
| **`keepalive`**        | `true`        | Retries connecting to server during network errors; `false` to disable. See [Keepalive](#keepalive)                                                                                                                 |
| `retries`              | `Infinity`    | Maximum number of reconnection attempts before emitting [`kill` event](#kill-event).                                                                                                                                |
| `minDelay`             | `100`         | Milliseconds used as initial incremental backoff for reconnection attempts.                                                                                                                                         |
| `maxDelay`             | `30_000`      | Maximum milliseconds between reconnection attempts.                                                                                                                                                                 |
| `backoff`              | `Function`    | [Backoff](#backoff) function called between retry attempts. Default: incremental backoff function.                                                                                                                  |
| **`sasl`**             | `true`        | Enables [SASL](#SASL) authentication if `username` and `password` are provided; `false` to disable completely.                                                                                                      |
| `username`             | `undefined`   | SASL username.                                                                                                                                                                                                      |
| `password`             | `undefined`   | SASL password.                                                                                                                                                                                                      |
| **`protocol`**         | `true`        | Provides methods to send/receive Memcached requests/responses over the binary protocol.                                                                                                                             |
| `ttl`                  | `0`           | Default TTL in seconds, Dates may _not_ be used for default TTL. See [Expiration Time](#expiration-time).                                                                                                           |
| `commandTimeout`       | `4_000`       | Milliseconds any command may take before rejecting. See [Timeouts](#timeouts).                                                                                                                                      |
| `maxKeySize`           | `250`         | Maximum bytes of keys (should match Memcached configuration).                                                                                                                                                       |
| `maxValueSize`         | `1_048_576`   | Maximum bytes of values (should match Memcached configuration).                                                                                                                                                     |
| **`compression`**      | `true`        | Any Buffer-like `value` with a length greater than `maxValueSize` is compressed and `compressionFlag` is set; `false` to disable.                                                                                   |
| `compressionFlag`      | `1 << 0`      | Bitmask to identify value is compressed. Use to match other clients which may use different flags to represent compressed data or different compression formats.                                                    |
| `compressionOptions`   | `Object`      | **Default**: `{ level: zlib.constants.Z_BEST_SPEED }`. See [Zlib Constantans](https://nodejs.org/api/zlib.html#zlib_zlib_constants).                                                                                |
| `compressIf`           | `Function`    | **Default**: function that returns true if the `value` (`Buffer`) is larger than `maxValueSize`. You may provide your own function to decide whether or not to apply compression to `value`.                        |
| `compress`             | `Function`    | `promisify`’d `zlib.gzip`. See [Compression](#compression).                                                                                                                                                         |
| `decompress`           | `Function`    | `promisify`’d `zlib.gunzip`. See [Compression](#compression).                                                                                                                                                       |
| **`json`**             | `true`        | any non-Buffer values are passed to `JSON.stringify()` and `jsonFlag` is set; `false` to disable.                                                                                                                   |
| `jsonFlag`             | `1 << 1`      | Bitmask to identify value stored as JSON. Change this to match other clients which may use different flags to represent JSON data.                                                                                  |
| `serialize`            | `Function`    | **Default**: `JSON.stringify`. See [Serialization](#serialization).                                                                                                                                                 |
| `deserialize`          | `Function`    | **Default**: `JSON.parse`. See [Serialization](#serialization).                                                                                                                                                     |
| **`string`**           | `true`        | Strings are immediately converted to Buffer and `stringFlag` is set; `false` to disable. See [Serialization](#serialization) before disabling.                                                                      |
| `stringFlag`           | `1 << 4`      | Bitmask to identify value is a string. Modify to match other clients which may use different flags to represent String data.                                                                                        |

## Timeouts

This client provides two timeout options, `connectTimeout` and `commandTimeout`.

The `connectTimeout` is simply the number of milliseconds the `Socket.connect()` method must take to connect to the server. This also applies to any reconnection attempts. The default timeout is suitable for most applications.

The `commandTimeout` option is the most important timeout to specify. It marks the time from when you issue an command up until the _complete_ response is returned from Memcached. This ensures that your command will complete or fail within the configured `commandTimeout` milliseconds. Many things could happen that could cause delays: network degradation, Memcached restarting, etc. Regardless of the reason, you can be confident that your commands will _always_ succeed or fail within the specified number of milliseconds. You may then decide to poll the data source if this occurs without wasting time for what _should be_ a fast cache lookup.

For example, If you’re using Memcache store SQL responses, you may wish to configure a low `commandTimeout` like `200` milliseconds. If Memcached becomes unavailable for whatever reason, the cache retrieval will fail in 200 milliseconds and your code could continue to query SQL for the response and return it to the end user. In this scenario, you are mitigating the amount of time your app will wait for a degraded Memcache connection.

## Keepalive

By default, the client will constantly try to reconnect to the server when connection errors occur. When disabled, any network error will cause the client to emit the [`kill` event](#kill-event) and no further connection attempts will be made. Any command issued to a client that has emitted the `kill` event will immediately reject with the error causing the connection `kill` event.

## Backoff

The internal backoff is simply a function of `attempt * minDelay` until it exceeds `maxDelay`. The following example shows how to configure exponential backoff:

```js
  const { get, set, … } = memcache({
      backoff: (attempt) => 100 * (2 ** attempt), // exponential backoff
      maxDelay: 30_000 // do not wait longer than 30 seconds
  })
```

## Kill Event

By default, client will try to re-establish the connection when encountering connection errors. However, if `failures` attempts has been reached, SASL auth is required and fails, or you explicitly invoke the `kill()` method, all reconnection attempts will be terminated and no further attempts will be made. This library will emit a kill event when any of these scenarios occurs.

``` js
const cache = memcache();
cache.on('kill', (error) => {
    // This connection has either:
    // 1. reached the maximum number of `failures` attempts, or
    // 2. SASL authentication failed, or
    // 3. `cache.kill()` was invoked
})
```

## SASL

Some Memcached servers require SASL authentication. Please note that SASL does *not* provide any encryption or even any real protection to your data. It may only be regarded as a simple way to prevent unintentional access/corruption on *trusted* networks.

Note: most servers require the `username` in the “user@host” format.

## Expiration Time

Some commands (`set`, `add`, `replace`, `incr`, `decr`, `touch`, `gat`, `flush`) accept a `ttl` expiration time.

You may specify either a `Date` object in the future or the number of _seconds_ (from now) when a key should expire.

`0` means never expire.

If you pass a `number`, this can be up to 30 days (2,592,000 seconds). After 30 days, it is treated as a unix timestamp of an exact date.

If you pass a `Date` object, the operation will be converted to the number of seconds until that date if it is less than or equal to 30 days otherwise it will be converted to a unix timestamp, abiding by this protocol. This is the easiest way to set longer expiration times without confusion.

**Note**: you may _not_ use a `Date` object when specifying a default `ttl` option to the memcache client. Only a number of seconds is allowed in this case.

## Check And Set

All commands that resolve to a [MemcacheResponse](#memcacheresponse) will include a `cas` (check and set) property. This is a unique representation of the value after the command has completed (See [Binary Protocol Specification](https://github.com/memcached/memcached/wiki/BinaryProtocolRevamped#set-add-replace) for more information). You may pass a `cas` back to any write operation (`set`, `replace`, `incr`, `decr`, `append`, `prepend`) in order to ensure that the value has not changed since the previous command. In other words, if the value of specified key has changed, your operation will fail. This is useful for resolving race conditions.

``` js
const { value, cas } = await set('foo', 'abc');
// another process mutates the value
try {
    await append('foo', 'def', { cas });
} catch (error) {
    if (error.status === memcache.ERR_KEY_EXISTS) {
      // 'foo' has changed since we last `set`
    }
}
```

## Flags

The [`set`](#set), [`add`](#add), [`replace`](#replace) commands accept a `flags` property on the optional `options` parameter. When using the default JSON and string serializers and/or the compression functions, flags are set using bitmasks against `stringFlag`, `jsonFlag`, and `compressionFlag`, respectively.

If you require special behavior, you may disable these serializers and compression and/or provide your own `flags` property to these commands. When you retrieve your key through `get` or `gat`, you may reference and test the `flags` of any [MemcacheResponse](#memcacheresponse) using the `.flags` getter.

## Compression

By default, the client uses `promisify`’d Node’s internal `zlib.gzip` and `zlib.gunzip` for values that exceed `maxValueSize`. To change the compression format, pass in an array of your own compression and decompression functions to the `compressFunctions` option.

**Example**
``` js
const { promisify } = require('util');
const { brotliCompress, brotliDecompress } = require('zlib');

const cacheUsingBrotli = memcache({
    compress: promisify(brotliCompress),
    decompress: promisify(brotliDecompress),
    compressionFlag: 1 << 6 // match another brotli-enabled client
});
```

## Serialization

All `value`s are sent to the server as a `Buffer` over the binary protocol. By default, the client performs useful transformations in the following order:

1. Serialization.
   1. **string** is immediately converted to `Buffer` and `stringFlag` | `flags`
   2. **Any** non-Buffer type (`object`, `array`, `number`, `boolean`, etc.) is passed to `JSON.stringify` and then converted to `Buffer` and `jsonFlag` | `flags`
   3. `Buffer` is passed to Compression as-is with no modification to `flags`
2. Compression.
   1. The `Buffer` length is tested against the `maxValueSize` option using the `compressIf` function and compressed accordingly.
   2. `compressionFlag` | `flags` (bitmask set)

During retrieval commands (`get`, `gat`), the reverse transformations are evaluated based on the `flags` of the response and performed accordingly. The resulting `MemcacheResponse.value` will match the `value` passed during the write command.

You may substitute the default JSON serializer with your own or with powerful alternatives like 
[fast-json-stable-stringify](https://www.npmjs.com/package/fast-json-stable-stringify) or [yieldable-json](https://www.npmjs.com/package/yieldable-json).

Example using fast-json-stable-stringify:
```js
const { promisify } = require('util');
const { stringifyAsync, parseAsync } = require('yieldable-json');
const cache = memcache({
    serialize: promisify(stringifyAsync),
    deserialize: promisify(parseAsync)
})
```



## Buffer

All `Buffer` parameters will also accept Buffer-like types such as: `ArrayBuffer`, `SharedArrayBuffer`, `DataView`.

## Incr/Decr

The `incr` and `decr` commands are very handy, but can easily have unexpected results. Take the following example:

```js
const { set, incr } = memcache();
await set('foo', 'bar');
try {
    await incr('foo', 1);
} catch (error) {
    error.status === memcache.ERR_INCR_DECR_ON_NON_NUMERIC_VALUE
}
```

If you or another process accidentally changes a value to something other than a number, your `incr`/`decr` commands will fail. Additionally, the Memcached binary protocol allows for an `initial` value to be set in the case where the key does not already exist. However, you may not specify any `flags`. This is demonstrated in the [`incr`](#incr) example below.

You should make sure that any key you plan to use for `incr`/`decr` has already been `set`, `add`, or `replace` with proper flags so that the retrieval (`get`) does not introduce an unexpected `Buffer` instead of a `number`.

**Note**: Memcached allows for 64-bit integers, but JavaScript bitwise operations are only supported on 32-bit integers. Node v12 introduces native support for `bigint`. This package may change to represent these values as `bigint` at some point in the future.

## Append/Prepend

When using the default `string: true` option, you can be sure that your strings will be stored without quotes (") and `append` and `prepend` operations will work as expected. The string conversion seems unnecessary, but the `append`/`prepend` operations would break if the string value was transformed by `JSON.stringify`. Take the following example:

``` js
const { set, get, append } = memcache({ string: false });
await set('foo', 'bar');
await get('foo'); // 'bar'
await append('foo', 'baz');
try {
    await get('foo'); // expected 'barbaz'
} catch (error) {
    // Exception: JSON.parse("bar""baz")
}
```

**Note:** In general, if you are storing anything other than a Buffer or string (like: object, array, boolean), `append` and `prepend` should *not be used*.

## MemcacheResponse

MemcacheResponse is the small wrapper for the binary data returned from the server. When using defaults, the `value` property (getter) will return exactly what was written using a write command,  the uncompressed deserialized value for the given request. Use the [`cas`](#check-and-set) property (getter) to reference the check-and-set value. [`flags`](#flags) may also be referenced if you have special requirements for handling them.

```js
const response = get('foo');

// the final value after all deserialization and decompression:
response.value;

// raw Buffer response from server before any deserialization or decompression:
response.rawValue;

// check-and-set Buffer:
response.cas;

// 32-bit integer
response.flags;
```

## MemcacheError

All commands may reject with an error object represented by the following properties:

```js
MemcacheError {
    message: '…', // descriptive error
    status: number, // one of the codes returned by client or server
    type: 'client|server', // who threw the error: client or server
    request: MemcacheRequest, // originating request that caused the error
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
| client  | ERR_QUEUE_FULL                            | 0x0102 |
| client  | ERR_TIMEOUT                               | 0x0103 |
| client  | ERR_INVALID_KEY                           | 0x0104 |
| client  | ERR_INVALID_VALUE                         | 0x0105 |
| client  | ERR_COMPRESSION                           | 0x0106 |
| client  | ERR_JSON                                  | 0x0107 |

These errors are bound to the `memcache` object and may be referenced like the following example:

```js
const { get } = memcache();
try {
    const { value } = await get('foo');
    return value;
} catch (error) {
    switch (error.status) {
        case memcache.ERR_KEY_NOT_FOUND:
            // do something
            break;
        case memcache.ERR_OUT_OF_MEMORY:
            // do something else
            break;
        default
            // rethrow for some reason
            throw error;
            break;
    }
 }
```

## Cluster

The focus of this client is to provide an extremely reliable connection to a single memcached server. It intentionally does not provide cluster/hashring support. Cluster/hashring may be considered in a separate package that would use this reliable client for each of the nodes.

## AWS
Currently, this client does not support [AWS ElastiCache](https://aws.amazon.com/elasticache/) specific `config get cluster` commands. Pull requests welcomed for this feature. AWS supported [Java client](https://github.com/awslabs/aws-elasticache-cluster-client-memcached-for-java/blob/master/src/main/java/net/spy/memcached/protocol/binary/GetConfigOperationImpl.java) reference.

## Testing

Testing this client requires local access to a SASL-enabled memcached server. `bin/memcached-sasl.sh` contains a sample shell script for downloading and compiling the latest version of Memcached with SASL support.

## Commands

### `get`
Get the value for the given key.

| Param     | Type                 |
| --------- | -------------------- |
| **`key`** | `string` \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If key does not exist.

**See**: [`gat`](#gat)

**Example**
```js
const { get } = memcache();
try {
    const { value, cas } = await get('foo');
    return {
        value, // value for “foo”
        cas // “check-and-set” buffer that can be passed as option to almost every other command.
    }
 } catch (error) {
    if (error.status === memcache.ERR_KEY_NOT_FOUND) {
        return ''; // not found → '' (empty string)
    } else {
        throw error; // re-throw any other error
    }
 }
```

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

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If unable to store value for any reason.

**Note:** Unlike [add](#add), this method will overwrite any existing value associated with given key.

**See**: [`add`](#add), [`replace`](#replace)

**Example**
```js
const { set } = memcache();
try {
    await set('foo', 'bar', 60); // expire in 1 minute
} catch (error) {
    // any error means that the value was not stored
}
```

### `add`
Add a value for the given key.

| Param                                          | Type                                  |
| ---------------------------------------------- | ------------------------------------- |
| **`key`**                                      | `string` \| `Buffer`                  |
| **`value`**                                    | `*`                                   |
| *`options`*                                    | `object` \| [`ttl`](#expiration-time) |
| *<code>options.[ttl](#expiration-time)</code>* | `number` \| `Date`                    |
| *<code>options.[flags](#flags)</code>*         | `number`                              |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` exists.

**Note:** Unlike `set`, this method will fail if a value is already assigned to the given key.

**See**: [`set`](#set), [`replace`](#replace)

**Example**
```js
const { add } = memcache();
try {
    await add('foo', 'bar'); // works
    await add('foo', 'baz'); // fails
} catch (error) {
    // error.status === ERR_KEY_EXISTS (Key exists)
    // 'bar' is still the value
}
```

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

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` does *not* exist.

**Note:** Conversely to `add`, this method will fail the key has expired or does not exist.

**See**: [`set`](#set), [`add`](#add)

**Example**
```js
const { replace, set, del } = memcache();
try {
    await set('foo', 'bar');
    await replace('foo', 'baz'); // works
    await del('foo');
    await replace('foo', 'bar'); // fails
} catch (error) {
    // error.status === error.ERR_KEY_NOT_FOUND
}
```

### `del`
### `delete` (alias to `del`)
Delete the given key.

| Param     | Type                 |
| --------- | -------------------- |
| **`key`** | `string` \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` does *not* exist.

**Note:** `del` throws an error if the key does not exist _as well as_ for many other issues. However, you might consider that a “key not found” error satisfies the deletion of a key. This common pattern is demonstrated in the example.

**Example**
```js
const { del } = memcache();
try {
    await del('foo');
} catch (error) {
    if (error.status !== memcache.ERR_KEY_NOT_FOUND) {
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

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` contains non-numeric value.

**Note:** If the `key` is does not exist, the key will be “set” with the `initial` value (default: 0). However, _no_ `flags` will be set and a subsequent `get` will return a `Buffer` instead of a `number`. Use caution by either checking for a buffer on subsequent `get` or use `set` to set an initial value and proper flags. See [Incr/Decr](#incr-decr).

**See**: [`decr`](#decr)

**Example**
```js
const { incr, del } = memcache();

// unexpected buffer response:
await del('foo');
await incr('foo', 1); // initial value defaults to 0, but no flags set
const { value } = await get('foo');
value instanceof Buffer; // true
parseInt(value) === 0; // true

// expected numeric response:
await set('foo', 0);
await incr('foo', 1);
const { value } = await get('foo');
value === 1; // true
```

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

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` contains non-numeric value.

**Note:** Decrementing a counter will never result in a “negative value” (or cause the counter to “wrap”). Instead the counter is set to `0`. Incrementing the counter may cause the counter to wrap.

**See**: [`incr`](#incr)

**Example**
```js
const { decr } = memcache();
await decr('foo', 1, { initial: 10 }); // foo: 10
await decr('foo', 1); // foo: 9
await decr('foo', 10); // foo: 0 (not -1)
```

### `append`
Append the specified value to the given key.

| Param                     | Type                                                |
| ------------------------- | --------------------------------------------------- |
| **`key`**                 | `string` \| `Buffer`                                |
| **`value`**               | `string` \| `Buffer`                                |
| *[`cas`](#check-and-set)* | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` does not exist.

**Note:** Do not accidentally `JSON.stringify()` the request value as this would introduce quotes around your string. See [Serialization](#serialization) for more information.

**See**: [`prepend`](#prepend)

**Example**
```js
const { append, set, get } = memcache();
await set('foo', 'ab');
await append('foo', 'c');
await get('foo'); // 'abc'
```

### `prepend`
Prepend the specified value to the given key.

| Param                     | Type                                                |
| ------------------------- | --------------------------------------------------- |
| **`key`**                 | `string` \| `Buffer`                                |
| **`value`**               | `string` \| `Buffer`                                |
| *[`cas`](#check-and-set)* | [`MemcacheResponse`](#memcacheresponse) \| `Buffer` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` does not exist.

**Note:** Do not accidentally `JSON.stringify()` the request value as this would introduce quotes around your string. See [Serialization](#serialization) for more information.

**See**: append

**Example**
```js
const { prepend, set, get } = memcache();
await set('foo', 'bc');
await prepend('foo', 'a');
await get('foo'); // 'abc'
```

### `touch`
Touch is used to set a new expiration time for an existing item.

| Param                         | Type                 |
| ----------------------------- | -------------------- |
| **`key`**                     | `string` \| `Buffer` |
| **[`ttl`](#expiration-time)** | `number` \| `Date`   |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: `ERR_KEY_NOT_FOUND` if `key` does not exist.

**See**: [`gat`](#gat)

**Example**
```js
const { touch } = memcache();
await touch('foo', 3600);
```

### `gat`
Get And Touch is used to set a new expiration time for an existing item and retrieve its value.

| Param                         | Type                 |
| ----------------------------- | -------------------- |
| **`key`**                     | `string` \| `Buffer` |
| **[`ttl`](#expiration-time)** | `number` \| `Date`   |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Throws**: If `key` does not exist.

**See**: [`get`](#get), [`touch`](#touch)

**Example**
```js
const { gat } = memcache();
await gat('foo', 3600);
```

### `flush`
Flush the items in the cache now or some time in the future as specified by the optional `ttl` parameter.

| Param                       | Type               |
| --------------------------- | ------------------ |
| *[`ttl`](#expiration-time)* | `number` \| `Date` |

**Returns**: <code>Promise&lt;[MemcacheResponse](#memcacheresponse)&gt;</code>

**Example**
```js
const { flush } = memcache();
await flush(); // delete all keys now
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
Statistics. Without a key specified the server will respond with a “default” set of statistics information.

| Param   | Type     |
| ------- | -------- |
| *`key`* | `string` |

**Returns**: <code>Promise&lt;{Object.&lt;string, string&gt;}&gt;</code>

**Note**: supported `key` options: `'items'`, `'slabs'`, `'sizes'`, but others may work depending on your Memcached server.

**Example**
```js
const { stat } = memcache();
await stat('slabs');
```