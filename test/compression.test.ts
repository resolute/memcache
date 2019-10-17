/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import { promisify } from 'util';
import { brotliCompress, brotliDecompress } from 'zlib';
import { port } from './env';
import { randomString } from './util';

import memcache = require('../src');
import MemcacheResponse = require('../src/response');
import MemcacheError = require('../src/error');
import MemcacheCompression = require('../src/compression');

const { ERR_COMPRESSION } = MemcacheError;

const largeString = randomString(1_048_576 + 400); // just a little over maxValueSize

test.concurrent('default compression (gzip)', async () => {
  const key = randomString(7);
  let response: MemcacheResponse<any>;
  const compression = {
    flag: 0b1,
    options: { level: 6 },
    threshold: 3,
  };
  const { set, gat, get } = memcache({ port, compression });
  await set(key, 'bar');
  response = await gat(key, 10);
  assert.strictEqual(response.value, 'bar');
  assert.notStrictEqual(response.flags & compression.flag, compression.flag);
  await set(key, largeString);
  response = await get(key);
  assert.strictEqual(response.value, largeString);
  assert.strictEqual(response.flags & compression.flag, compression.flag);
});

test.concurrent('alternative compression library (brotli)', async () => {
  const key = randomString(7);
  const compression = {
    flag: 1 << 6, // 0b1000000
    compress: promisify(brotliCompress), // promisified or
    decompress: brotliDecompress, // callback style are ok
  };
  const { set, get } = memcache({ port, compression });
  await set(key, largeString);
  const response = await get(key);
  assert.strictEqual(response.value, largeString);
  assert.strictEqual(response.flags & compression.flag, compression.flag);
});

test.concurrent('decompression on bogus data', async () => {
  const key = randomString(7);
  const compressionFlag = 0b1;
  const { set, get } = memcache({ port });
  await set(key, Buffer.from([1, 2, 3, 4, 5]), { flags: compressionFlag });
  assert.rejects(get(key), { status: ERR_COMPRESSION });
});

test.concurrent('a compressor that always fails', async () => {
  const key = randomString(7);
  const compression = {
    threshold: 3,
    compress: async () => { throw new Error('I fail all the time!'); },
  };
  const { set } = memcache({ port, compression });
  assert.rejects(set(key, largeString), { status: ERR_COMPRESSION });
});

test.concurrent('compression threshold is set independent of maxValueSize', async () => {
  const compression = MemcacheCompression();
  const { set, get } = memcache({ port, compression: false, serialization: false })
    .register(...compression);
  const key = randomString(7);
  await set(key, largeString);
  const response = await get(key);
  expect(response).toHaveProperty('flags', 0b1);
});

test.concurrent('empty .register() does nothing', async () => {
  const key = randomString(7);
  const compression = {
    flag: 0b1,
    options: { level: 6 },
    threshold: 3,
  };
  const { set, get } = memcache({ port, compression }).register();
  await set(key, largeString);
  const response = await get(key);
  assert.strictEqual(response.value, largeString);
  assert.strictEqual(response.flags & compression.flag, compression.flag);
});
