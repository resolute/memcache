/* eslint-disable no-undef */

import MemcacheUtil = require('../src/util');

test.concurrent('`MemcacheUtil.callbackWrapper` without callback', async () => {
  expect(() => {
    MemcacheUtil.callbackWrapper(() => { })('foo');
  }).toThrow();
});

const troubleMaker = (arg: number, callback: (error?: Error, result?: number) => void) => {
  callback(undefined, arg + 1); // Everything’s good!
  callback(new Error('grenade')); // Uh oh, invoking the callback again?!
};

test('troubleMaker without `MemcacheUtil.callbackWrapper`', () => {
  expect.assertions(4);
  troubleMaker(1, (error, result) => {
    if (error) {
      expect(result).toBeUndefined();
      expect(error).toBeDefined();
    } else {
      expect(result).toBe(2);
      expect(error).toBeUndefined();
    }
  });
});

test('troubleMaker _with_ `MemcacheUtil.callbackWrapper` prevents multiple invocations', () => {
  expect.assertions(2);
  const wrappedTroubleMaker = MemcacheUtil.callbackWrapper(troubleMaker);
  wrappedTroubleMaker(1, (error?: Error, result?: number) => {
    expect(error).toBeUndefined();
    expect(result).toBe(2);
  });
});
