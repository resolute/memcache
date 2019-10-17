/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import { port } from './env';
import { randomString } from './util';

import fastJsonStableStringify = require('fast-json-stable-stringify');
// @ts-ignore .d.ts file not available
import yieldableJson = require('yieldable-json');
import memcache = require('../src');
import MemcacheError = require('../src/error');

const stringFlag = 0b0;
const jsonFlag = 0b10;
const binaryFlag = 0b100;
const numberFlag = 0b1000;
const { set, get } = memcache({
  port,
  serialization: {
    stringFlag,
    jsonFlag,
    binaryFlag,
    numberFlag,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  },
});
const { ERR_SERIALIZATION } = MemcacheError;

test.concurrent('object', async () => {
  const key = randomString(7);
  await set(key, { foo: 'bar' });
  const response = await get<{ foo: string }>(key);
  assert.deepStrictEqual(response.value, { foo: 'bar' });
  assert.strictEqual(response.flags & jsonFlag, jsonFlag);
});

test.concurrent('number', async () => {
  const key = randomString(7);
  await set(key, 1);
  const response = await get<number>(key);
  assert.strictEqual(response.value, 1);
  assert.strictEqual(response.flags & numberFlag, numberFlag);
});

test.concurrent('TypedArray (Uint8Array)', async () => {
  const key = randomString(7);
  const buffer = Uint8Array.from([1, 2]);
  await set(key, buffer);
  const response = await get<Buffer>(key);
  assert.strictEqual(response.value.equals(buffer), true);
  assert.strictEqual(response.flags & binaryFlag, binaryFlag);
});

test.concurrent('SharedArrayBuffer', async () => {
  const key = randomString(7);
  const sharedArrayBuffer = new SharedArrayBuffer(7);
  await set(key, sharedArrayBuffer);
  const buffer = Buffer.from(sharedArrayBuffer);
  const response = await get<Buffer>(key);
  assert.strictEqual(response.value.equals(buffer), true);
  assert.strictEqual(response.flags & binaryFlag, binaryFlag);
});

test.concurrent('null', async () => {
  const key = randomString(7);
  await set(key, null);
  const response = await get<null>(key);
  assert.strictEqual(response.value, null);
  assert.strictEqual(response.flags & jsonFlag, jsonFlag);
});

// undefined, '', Buffer.alloc(0) are all stored as a zero-length buffer, but
// will return differently based on flags set.

test.concurrent('undefined', async () => {
  const key = randomString(7);
  await set(key, undefined);
  const response = await get<string>(key);
  assert.strictEqual(response.value, '');
  assert.strictEqual(response.flags, stringFlag);
});

test.concurrent('empty string', async () => {
  const key = randomString(7);
  await set(key, '');
  const response = await get<string>(key);
  assert.strictEqual(response.value, '');
  assert.strictEqual(response.flags, stringFlag);
});

test.concurrent('Buffer.alloc(0)', async () => {
  const key = randomString(7);
  const buffer = Buffer.alloc(0);
  await set(key, buffer);
  const response = await get<Buffer>(key);
  assert.strictEqual(response.value.equals(buffer), true);
  assert.strictEqual(response.flags & binaryFlag, binaryFlag);
});

test.concurrent('boolean', async () => {
  const key = randomString(7);
  await set(key, false);
  const response = await get<boolean>(key);
  assert.strictEqual(response.value, false);
  assert.strictEqual(response.flags & jsonFlag, jsonFlag);
});

test.concurrent('string', async () => {
  const key = randomString(7);
  await set(key, '1');
  const response = await get<string>(key);
  assert.strictEqual(response.value, '1');
  assert.strictEqual(response.flags & stringFlag, stringFlag);
  assert.strictEqual(response.flags & jsonFlag, 0);
});

test.concurrent('ability to deserialize a response key', async () => {
  const key = Buffer.from(randomString(7)).toString('base64');
  await set(key, 'test ability to deserialize key');
  const response = await get<string>(key);
  const keyAsString = Buffer.from(key, 'base64').toString();
  response.key = keyAsString;
  assert.strictEqual(response.key, keyAsString);
});

test.concurrent('malformed JSON', async () => {
  const key = randomString(7);
  await set(key, 'Can’t parse this…duh duh duh duh, duh duh, duh duh', { flags: jsonFlag });
  return assert.rejects(get(key), { status: ERR_SERIALIZATION });
});

test.concurrent('0-byte/empty string with JSON flag → undefined', async () => {
  const key = randomString(7);
  await set(key, '', { flags: jsonFlag });
  const response = await get(key);
  assert.strictEqual(response.flags & jsonFlag, jsonFlag);
  expect(response.value).toBeUndefined();
});

test.concurrent('Symbol ~ empty string since Symbol.toString() is always undefined', async () => {
  const key = randomString(7);
  const symbol = Symbol('foo');
  await set(key, symbol);
  const response = await get(key);
  assert.strictEqual(response.value, '');
  assert.strictEqual(response.flags, 0);
});

test.concurrent('value = Function', async () => {
  const key = randomString(7);
  const fn = () => 'foo';
  await set(key, fn);
  const response = await get<string>(key);
  assert.strictEqual(response.value, 'foo');
  assert.strictEqual(response.flags, stringFlag);
});

test.concurrent('value = Promise that resolves', async () => {
  const key = randomString(7);
  const value = 'foo';
  await set(key, Promise.resolve(value));
  const response = await get<string>(key);
  assert.strictEqual(response.value, value);
  assert.strictEqual(response.flags, stringFlag);
});

test.concurrent('value = Promise that rejects', async () => {
  const key = randomString(7);
  const error = new Error('foo');
  return assert.rejects(set(key, Promise.reject(error)), { status: ERR_SERIALIZATION, error });
});

test.concurrent('value = async Function', async () => {
  const key = randomString(7);
  const fn = async () => [1, 2, 3];
  await set(key, fn);
  const response = await get<number[]>(key);
  assert.deepStrictEqual(response.value, [1, 2, 3]);
  assert.strictEqual(response.flags & jsonFlag, jsonFlag);
});

test.concurrent('a serializer that always fails', async () => {
  const key = randomString(7);
  const serialization = {
    serialize: async () => { throw new Error('I fail all the time!'); },
    deserialize: async () => { throw new Error('I also fail all the time!'); },
  };
  // @ts-ignore
  const { set } = memcache({ port, serialization });
  assert.rejects(set(key, ['I will not make it…']), { status: ERR_SERIALIZATION });
});

test.concurrent('a serializer that returns a Buffer', async () => {
  const key = randomString(7);
  const value = ['I will be JSON in a Buffer'];
  const serialization = {
    serialize: (value: string) => Buffer.from(JSON.stringify(value)),
  };
  const { set, get } = memcache({ port, serialization });
  await set(key, value);
  const response = await get<typeof value>(key);
  expect(response).toHaveProperty('flags', jsonFlag);
  expect(response).toHaveProperty('status', 0);
  expect(response).toHaveProperty('value', ['I will be JSON in a Buffer']);
});

test.concurrent('a synchronous serializer that returns a promise', async () => {
  const key = randomString(7);
  const serialization = {
    serialize: (value: string) => Promise.resolve(JSON.stringify(value)),
  };
  // @ts-ignore
  const { set } = memcache({ port, serialization });
  const response = await set(key, ['I will do just fine.']);
  expect(response).toHaveProperty('status', 0);
});

test.concurrent('`serialization: false` yields a Buffer response.value', async () => {
  const key = randomString(7);
  const value = Buffer.from('bar');
  const { get, set } = memcache({ port, serialization: false });
  await set(key, value);
  const response = await get<Buffer>(key);
  assert.strictEqual(value.equals(response.value), true);
});

test.concurrent('fast-json-stable-stringify', async () => {
  const key = randomString(7);
  const value = { foo: 'bar' };
  const { get, set } = memcache({ port, serialization: { serialize: fastJsonStableStringify } });
  await set(key, value);
  const response = await get<typeof value>(key);
  expect(response.value).toStrictEqual(value);
});

test.concurrent('yieldable-json', async () => {
  const key = randomString(7);
  const value = { foo: 'bar' };
  const { get, set } = memcache({
    port,
    serialization: {
      serialize: yieldableJson.stringifyAsync,
      deserialize: yieldableJson.parseAsync,
    },
  });
  await set(key, value);
  const response = await get<typeof value>(key);
  expect(response.value).toStrictEqual(value);
});
