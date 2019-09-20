/* eslint-disable no-undef */

import { strict as assert } from 'assert';
import { port } from './env';
import { randomString } from './util';

import pMap = require('p-map');
import memcache = require('..');

const key = randomString(7);
const { get, set, replace } = memcache({ port });
// generate many random strings of varying lengths
const truth = Array(2_000).fill('').map(() => randomString(~~(Math.random() * 10_000)));

const getAndVerifyRandomTruth = async () => {
  const index = ~~(Math.random() * truth.length);
  const { value } = await get(`${key}-${index}`);
  assert.strictEqual(value, truth[index]);
};

const replaceRandomTruth = async () => {
  const index = ~~(Math.random() * truth.length);
  await replace(`${key}-${index}`, truth[index]);
};

const delay = (fn: Function, milliseconds: number) => new Promise((resolve, reject) => {
  setTimeout(fn().then(resolve, reject), milliseconds);
});

const chaos = () => {
  const random = Math.random();
  // 10% of the time perform a replace; 90% do a get
  if (random % 9 === 0) {
    return delay(replaceRandomTruth, random * 100);
  }
  return delay(getAndVerifyRandomTruth, random * 100);
};

// `set` the truths
beforeAll(async () => Promise.all(truth.map((value, index) => set(`${key}-${index}`, value))));

test.concurrent('chaos', async () => pMap(
  Array(5_000).fill(true),
  () => chaos, { concurrency: 5, stopOnError: false },
));
