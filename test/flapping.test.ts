/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import { portFlappy } from './env';
import { randomString, floodify, trickle } from './util';

import memcache = require('../src');

const key = randomString(7);

// WARNING: For whatever reason, if this is tested with Jest’s
// test.concurrency(), it will randomly throw the dreaded error: “Received a
// response from server, but do not have a matching request.” I eagerly want to
// trace instances where this scenario is possible, but this error _only_ occurs
// when this is run with test.concurrency(). I believe that this is a bug within
// Jest and does _not_ present a real world scenario where this error could be
// encountered.
test('against flapping server',
  // Run commands against a flapping server and confirm that all return
  // successfully.
  async () => {
    const { set } = memcache({
      port: portFlappy,
      commandTimeout: 5_000,
      minDelay: 100,
      maxDelay: 30_000,
      connectTimeout: 2_000,
      retries: Infinity,
    });

    // send a bunch of commands and confirm that each succeed
    return trickle({
      duration: 4_000,
      upper: 100,
      lower: 10,
      fn: () => floodify(10, async () => {
        const { status } = await set(key, 'bar');
        assert.strictEqual(status, 0);
      }),
    });
  },
  5_000);
