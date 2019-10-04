import util = require('util');

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
  return undefined;
};

export const extendIfDefined = (ctx: { [key: string]: any }, options: object) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of Object.entries(options)) {
    if (typeof value !== 'undefined') {
      ctx[key] = value;
    }
  }
};

export const callbackWrapper = (fn: Function) => (...args: any[]) => {
  let returnValue: any;
  let syncError: Error | undefined;
  try {
    returnValue = fn(...args);
  } catch (error) {
    syncError = error;
  }
  const callback = args[args.length - 1];
  if (typeof callback !== 'function') {
    return;
  }
  if (typeof syncError !== 'undefined') {
    // TODO make sure syncError is not falsey to avoid anti-pattern in Node
    // callback style:
    callback(syncError);
    return;
  }
  if (util.types.isPromise(returnValue)) {
    returnValue
      .then((value: any) => { callback(undefined, value); })
      .catch((error: any) => { callback(error); });
    return;
  }
  if (typeof returnValue !== 'undefined') {
    callback(undefined, returnValue);
  }
};
