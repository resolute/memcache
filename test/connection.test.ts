/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import { port, portInvalid, path } from './env';
import { randomString } from './util';

import memcache = require('../src');
import MemcacheError = require('../src/error');

const key = randomString(7);
const { ERR_CONNECTION } = MemcacheError;

test.concurrent('fails when `retries` exceeded', async () => {
  // test `retries` of finite integer
  const cache = memcache({
    port: portInvalid,
    retries: 3,
    connectTimeout: 1_000,
    minDelay: 100,
    maxDelay: 2_000,
  });
  return assert.rejects(new Promise((_resolve, reject) => {
    cache.on('kill', reject);
  }), { status: ERR_CONNECTION });
});

// test manual `.kill()` termination
test.concurrent('dies when `.kill()` invoked', async () => {
  const cache = memcache();
  const deferred = assert.rejects(new Promise((_resolve, reject) => {
    cache.on('kill', reject);
  }), { status: ERR_CONNECTION });
  cache.kill();
  await deferred;
  return assert.rejects(cache.set(key, 'bar'),
    { status: ERR_CONNECTION });
});

// test queueSize
test.concurrent('fails when `queueSize` exceeded', async () => {
  const { set } = memcache({ queueSize: 1, port });
  return assert.rejects(Promise.all([
    set(key, 'bar'),
    set(key, 'bar'),
  ]), { status: ERR_CONNECTION });
});

// test unix socket
test.concurrent('works over sockets (`path`)', async () => {
  const key = randomString(7);
  const { set, get } = memcache({ path });
  await set(key, 'foo');
  const response = await get(key);
  assert.strictEqual(response.value, 'foo');
});

// test `commandTimeout`
test.concurrent('fails when `commandTimeout` is exceeded', async () => {
  const { set } = memcache({ commandTimeout: 100, retries: 2, port: portInvalid });
  return assert.rejects(set(key, 'bar'),
    { status: ERR_CONNECTION });
});

// test `connectTimeout` to TCP port that will “hang” the connection instead of
// rejecting immediately.
test.concurrent('honors `connectTimeout` especially when connecting to server/firewall that DROPs connection', async () => {
  const connectTimeout = 100;
  const retries = 2;
  const { set } = memcache({
    connectTimeout,
    retries,
    backoff: () => 1,
    commandTimeout: 90e3,
    host: '1.1.1.1',
    port: 11211,
  });
  await assert.rejects(new Promise((_resolve, reject) => {
    set(key, 'bar').catch(reject);
    setTimeout(() => {
      reject(new Error('`connectTimeout` did not work correctly'));
    }, connectTimeout * retries + 1000); // add a little grace period
  }), { status: ERR_CONNECTION });
});
