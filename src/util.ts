import { BufferLike } from './types';

import util = require('util');

export const isBufferLike = (value: any): value is BufferLike => {
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
