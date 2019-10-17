/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import { portFlush } from './env';
import { randomString } from './util';

import memcache = require('../src');
import MemcacheError = require('../src/error');

const key = randomString(7);
const { ERR_KEY_NOT_FOUND } = MemcacheError;
const { flush, set, get } = memcache({ port: portFlush });

test('better get flushed', async () => {
  await set(key, 'better get flushed');
  await flush();
  return assert.rejects(get(key), { status: ERR_KEY_NOT_FOUND });
});
