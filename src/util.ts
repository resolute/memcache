import util = require('util');
import MemcacheError = require('./error');

export const isBufferLike = (value: any):
  value is Buffer | ArrayBuffer | SharedArrayBuffer | DataView => {
  if (
    Buffer.isBuffer(value) ||
    ArrayBuffer.isView(value) ||
    util.types.isAnyArrayBuffer(value)
  ) {
    return true;
  }
  return false;
};

// @ts-ignore
// eslint-disable-next-line consistent-return
export const toBuffer = (value: any) => {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return Buffer.from(value);
  }
  if (typeof value === 'number') {
    return Buffer.from(value.toString());
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (util.types.isAnyArrayBuffer(value)) {
    return Buffer.from(value);
  }
};

export const extendIfDefined = (ctx: { [key: string]: any }, options: object) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of Object.entries(options)) {
    if (typeof value !== 'undefined') {
      ctx[key] = value;
    }
  }
};

export const singleTapCallback = <T extends Function>(fn: T): T => {
  if (typeof fn !== 'function') {
    throw new MemcacheError({
      message: 'callbackWrapper invoked without a callback as last parameter.',
    });
  }
  let called = false;
  return ((...args: any[]) => {
    if (!called) {
      called = true;
      fn(...args);
    }
  }) as unknown as T;
};

export const callbackWrapper = <T extends Function>(fn: T): T => ((...args: any[]) => {
  const handler = singleTapCallback(args.pop());
  // let callbackCalled = false;
  // const handler = (error?: Error, result?: any) => {
  //   if (callbackCalled) {
  //     return;
  //   }
  //   callbackCalled = true;
  //   callback(error, result);
  // };
  let syncReturn: any;
  let syncError: Error | undefined;
  try {
    syncReturn = fn(...args, handler);
  } catch (error) {
    syncError = error as Error;
  }
  if (typeof syncError !== 'undefined') {
    // TODO make sure syncError is not falsey to avoid anti-pattern in Node
    // callback style:
    handler(syncError);
    return;
  }
  if (util.types.isPromise(syncReturn)) {
    syncReturn
      .then((value: any) => { handler(undefined, value); })
      .catch((error: any) => { handler(error); });
    return;
  }
  if (typeof syncReturn !== 'undefined') {
    handler(undefined, syncReturn);
  }
}) as unknown as T;
