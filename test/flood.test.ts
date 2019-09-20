/* eslint-disable no-undef */

import { port, portInvalid } from './env';
import { randomString, floodify } from './util';

import memcache = require('..');

const key = randomString(7);

// test the flood!
const mc1 = memcache({ port });
const mc2 = memcache({ port });
const mc3 = memcache({ port, compression: { threshold: 100 } });
const mc4 = memcache({ port });
const mc5 = memcache({ port: portInvalid, commandTimeout: 100 });

beforeAll(async () => Promise.all([
  mc1.set(`${key}-1`, Buffer.from(randomString(1_000))),
  mc2.set(`${key}-2`, Buffer.from(randomString(1_048_576 + 400))),
  mc3.set(`${key}-3`, Buffer.from(randomString(300_000))), // also over custom maxSizeValue
  mc4.set(`${key}-4`, Buffer.from(randomString(600_000))),
]));

test.concurrent('flood string 1_000', async () => floodify(100, () => mc1.get(`${key}-1`)));
test.concurrent('flood string 1_048_576 + 400 (little over maxValueSize)', async () => floodify(100, () => mc2.get(`${key}-2`)));
test.concurrent('flood string 300_000 (also over configured maxValueSize)', async () => floodify(100, () => mc3.get(`${key}-3`)));
test.concurrent('flood string 600_000', async () => floodify(100, () => mc4.get(`${key}-4`)));
test.concurrent('flood fake port, but low commandTimeout', async () => floodify(100, () => mc5.set(`${key}-5`, 'bar')));
