/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import {
  port, portSasl, username, password, portInvalid,
} from './env';

import memcache = require('../src');
import MemcacheError = require('../src/error');

const { ERR_AUTHENTICATION_FAILED, ERR_CONNECTION } = MemcacheError;

// permutations of sasl
// | #  | server | client | response.status           |
// |----|--------|--------|---------------------------|
// | 1. | yes    | yes    | ok                        |
// | 2. | no     | no     | ok                        |
// | 3. | yes    | no     | ERR_AUTHENTICATION_FAILED |
// | 4. | no     | yes    | ok*                       |
// | 5. | yes    | wrong  | ERR_AUTHENTICATION_FAILED |
// |----|--------|--------|---------------------------|
// * In this case, the server does not support SASL, and the client will remove
//   the `username` and `password` from the options--essentially disabling SASL
//   support on the client to match the server.

test.concurrent('sasl:server-yes:client-yes', async () => memcache({
  port: portSasl,
  username,
  password,
}).set('sasl:server-yes:client-yes', 'works'));

test.concurrent('sasl:server-no:client-no', async () => memcache({
  port,
}).set('sasl:server-no:client-no', 'works'));

test.concurrent('sasl:server-yes:client-no', async () => assert.rejects(memcache({
  port: portSasl,
}).set('sasl:server-yes:client-no', 'fails'), { status: ERR_AUTHENTICATION_FAILED }));

test.concurrent('sasl:server-no:client-yes', async () =>
  Promise.all([
    // // JEST ISSUE: https://github.com/facebook/jest/issues/8246
    // new Promise((resolve, reject) => {
    //   const handler = (warning: { name: string; }) => {
    //     process.off('warning', handler);
    //     if (warning.name === 'MemcacheWarning') {
    //       resolve();
    //     } else {
    //       reject(new Error('Did not receive a process.emitWarning("…", "MemcacheWarning")!'));
    //     }
    //   };
    //   process.on('warning', handler);
    // }),
    memcache({
      port,
      username,
      password,
    }).set('sasl:server-no:client-yes', 'works'),
  ]));

test.concurrent('sasl:server-yes:client-wrong-pw', async () => assert.rejects(memcache({
  port: portSasl,
  username,
  password: 'X',
}).set('sasl:server-yes:client-wrong-pw', 'fails'), { status: ERR_AUTHENTICATION_FAILED }));

test.concurrent('sasl and finite `retries` compete to .kill()', async () => {
  const cache = memcache({
    port: portInvalid,
    retries: 1,
    username: 'foo',
    password: 'bar',
  });
  const response = cache.set('foo', 'bar');
  return Promise.all([
    assert.rejects(new Promise((_resolve, reject) => {
      cache.on('kill', reject);
    }), { status: ERR_CONNECTION }),
    assert.rejects(response, { status: ERR_CONNECTION }),
  ]);
});
