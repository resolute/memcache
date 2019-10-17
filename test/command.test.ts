/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import { randomBytes } from 'crypto';
import { port } from './env';
import { randomString } from './util';


import memcache = require('../src');
import MemcacheResponse = require('../src/response');
import MemcacheError = require('../src/error');
const { ERR_INVALID } = MemcacheError;

const EMPTY_CAS = Buffer.alloc(8, 0);
const key = randomString(7);
const value = 'bar';
const {
  ERR_KEY_NOT_FOUND, ERR_KEY_EXISTS,
} = MemcacheError;
const {
  get, set, add, replace, incr, decr, append, prepend,
  touch, gat, del, version, stat,
} = memcache({ port, maxKeySize: 250, maxValueSize: 1_048_576 });

test.concurrent('ttl', async () => {
  const key = randomString(7);
  let response: MemcacheResponse;
  response = await set(key, 'bar', new Date(new Date().valueOf() + 2000));
  response = await get<string>(key);
  assert.strictEqual(response.value, 'bar');
  await assert.rejects(new Promise((resolve, reject) => {
    setTimeout(() => { get<string>(key).then(resolve, reject); }, 3000);
  }), { status: ERR_KEY_NOT_FOUND });
}, 7_000);

test.concurrent('c.r.u.d. commands', async () => {
  const key = randomString(7);

  // `add` success only when key _does not_ exist
  await add(key, value, 10);

  // `add` fails if key exists
  await assert.rejects(add(key, value), { status: ERR_KEY_EXISTS });

  // `replace` success only when key exist
  await replace(key, value, { ttl: 10 });

  // `get` success when key exists
  assert.strictEqual((await get(key)).value, value);

  // `del` success only when key exists
  await del(key);

  // `del` fails if key _does not_ exist
  await assert.rejects(del(key), { status: ERR_KEY_NOT_FOUND });

  // `replace` fails if key _does not_ exist
  await assert.rejects(replace(key, value), { status: ERR_KEY_NOT_FOUND });

  // `get` fails when key _does not_ exist
  await assert.rejects(get(key), { status: ERR_KEY_NOT_FOUND });
});

test.concurrent('invalid `key` fails',
  async () => assert.rejects(get(''),
    { status: ERR_INVALID }));

test.concurrent('`key` too large fails',
  async () => assert.rejects(set(randomString(251), value),
    { status: ERR_INVALID }));

test.concurrent('`value` too large (something that can’t be compressed)',
  async () => assert.rejects(set(key, randomBytes(1_048_576 * 2)),
    { status: ERR_INVALID }));

test.concurrent('`amount` invalid',
  // @ts-ignore
  async () => assert.rejects(incr(key, 'not a number'),
    { status: ERR_INVALID }));

test.concurrent('bogus ttl → `defaultTtl`',
  async () => set(key, value, Infinity));


test.concurrent('date objects parsed', async () => {
  const now = new Date();
  const thirtyDays2SecondsFromNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 30,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds() + 2,
  );
  await set(key, value, thirtyDays2SecondsFromNow);
});

test.concurrent('version',
  async () => { assert.strictEqual(/^\d+\.\d+\.\d+/.test(await version()), true); });

// TODO how should this be tested?
test.concurrent('stat() promise style', async () => stat());
test('stat() callback style', (done) => {
  // Callback style does not work with test.concurrent()
  expect.assertions(2);
  stat((error, response) => {
    expect(error).toBeUndefined();
    expect(response).toBeDefined();
    done();
  });
});
test.concurrent('stat("slabs")', async () => stat('slabs'));
test.concurrent('stat("settings")', async () => stat('settings'));
test.concurrent('stat("sizes")', async () => stat('sizes'));
test('stat("sizes") callback style', (done) => {
  // Callback style does not work with test.concurrent()
  expect.assertions(2);
  stat('sizes', (error, response) => {
    expect(error).toBeUndefined();
    expect(response).toBeDefined();
    done();
  });
});

test.concurrent('response object', async () => {
  const key = randomString(7);
  let response: MemcacheResponse;
  response = await set(key, 'bar');
  assert.strictEqual(response.flags, 0);
  response = await get(key);
  assert.strictEqual(response.magic, 0x81);
  assert.strictEqual(response.opcode, 0x00);
  assert.strictEqual(response.dataType, 0x00);
  assert.strictEqual(response.opaque, 0x00);
  assert.strictEqual(response.key.equals(Buffer.alloc(0)), true);
  assert.strictEqual(response.key.length, 0);
});

test.concurrent('touch/gat', async () => {
  const key = randomString(7);
  await set(key, 'bar');
  await touch(key, 10);
  await gat(key, 10);
});

test.concurrent('incr/decr', async () => {
  const key = randomString(7);
  let response: MemcacheResponse;
  // When using `incr`/`decr` with implicit `initial: 0`
  response = await incr(key, 1);
  // `incr` always resolves to response.value as number
  assert.strictEqual(response.value, 0);
  response = await get<string>(key);
  // string from `get` since no flags are set
  assert.strictEqual(response.value, '0');
  // decrements will never yield a negative value
  response = await decr(key, 10);
  assert.strictEqual(response.value, 0);
});


test.concurrent('incr/decr alt', async () => {
  const key = randomString(7);
  let response: MemcacheResponse;
  // If you `set` first, then flag for JSON will be set and since value is a
  // number, `incr`/`decr` will not alter these flags.
  response = await set(key, 1);
  // It is possible that this key can be purged at any time
  response = await incr(key, 1, { ttl: 10, cas: response.cas, initial: 1 });
  response = await get<number>(key); // risky
  assert.strictEqual(response.value, 2);
  // One reliable way to read the number is to `incr` by 0
  response = await incr(key, 0);
  assert.strictEqual(response.value, 2);
  // Note: this will create the value as 0 if the key does not exist.
});

test.concurrent('append/prepend', async () => {
  const key = randomString(7);
  let response: MemcacheResponse;
  response = await set(key, 'b', { ttl: 10 });
  response = await prepend(key, 'a');
  response = await append(key, 'c', response.cas);
  response = await get(key);
  assert.strictEqual(response.value, 'abc');
});

test.concurrent('cas', async () => {
  const key = randomString(7);
  await Promise.all([
    await add(key, value),
    replace(key, value),
    append(key, 'a'),
    prepend(key, 'a'),
    await set(key, '1'),
    incr(key, 1),
    decr(key, 1),
    get(key),
  ].map(async (response) => {
    const { cas } = await response;
    assert.strictEqual(cas.equals(EMPTY_CAS), false);
    return response;
  }));
  // `del` does not provide a CAS
  assert.strictEqual((await del(key)).cas.equals(EMPTY_CAS), true);
});

test.concurrent('incorrect `cas` throws ERR_KEY_EXISTS', async () => {
  const key = randomString(7);
  const response = await set(key, `not${value}`);
  await set(key, value); // rogue process set this, oh no!
  await assert.rejects(set(key, `also not${value}`, { cas: response }),
    { status: ERR_KEY_EXISTS });
  assert.strictEqual((await get(key)).value, value);
});

test.concurrent('invalid `cas` is ignored', async () => {
  const key = randomString(7);
  await set(key, `not${value}`);
  await set(key, value, { cas: Buffer.from('derp') });
  const response = await get<string>(key);
  assert.strictEqual(response.value, value);
});

// Callback style does not work with test.concurrent()
test('callback style set', (done) => {
  expect.assertions(2);
  set(randomString(7), 'callback style set', (error?, response?) => {
    expect(error).toBeUndefined();
    expect(response).toHaveProperty('status', 0);
    done();
  });
});

// Callback style does not work with test.concurrent()
test('callback style incr', (done) => {
  expect.assertions(2);
  incr(randomString(7), 1, { initial: 1 }, (error?, response?) => {
    expect(error).toBeUndefined();
    expect(response).toHaveProperty('value', 1);
    done();
  });
});

// Callback style does not work with test.concurrent()
test('callback style append', (done) => {
  const key = randomString(7);
  expect.assertions(2);
  set(key, 'ab', () => {
    append(key, 'c', () => {
      get(key, (error?, response?) => {
        expect(error).toBeUndefined();
        expect(response).toHaveProperty('value', 'abc');
        done();
      });
    });
  });
});
