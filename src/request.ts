import { MemcacheRequestOptions } from './types';

import MemcacheUtil = require('./util');

class MemcacheRequest {
  public opcode!: MemcacheRequestOptions['opcode'];
  public key?: MemcacheRequestOptions['key'];
  public value?: MemcacheRequestOptions['value'];
  public amount?: MemcacheRequestOptions['amount'];
  public ttl?: MemcacheRequestOptions['ttl'];
  public cas?: MemcacheRequestOptions['cas'];
  public initial?: MemcacheRequestOptions['initial'];
  public flags?: MemcacheRequestOptions['flags'];

  constructor(options: Required<Pick<MemcacheRequestOptions, 'opcode'>> & Partial<MemcacheRequestOptions>) {
    MemcacheUtil.extendIfDefined(this, options);
  }

  public get buffer() {
    const key = this.keyAsBuffer;
    const value = this.valueAsBuffer;
    const cas = this.casAsBuffer;
    const { extrasLength } = this;
    let keyLength = 0;
    let valueLength = 0;
    if (typeof key !== 'undefined') {
      keyLength = key.length;
    }
    if (typeof value !== 'undefined') {
      valueLength = value.length;
    }
    const totalBodyLength = extrasLength + keyLength + valueLength;
    const buffer = Buffer.alloc(24 + totalBodyLength);
    buffer.writeUInt8(0x80, 0); // 0x80 Request
    buffer.writeUInt8(this.opcode, 1);
    if (keyLength) {
      buffer.writeUInt16BE(keyLength, 2); // key length
    }
    if (extrasLength) {
      buffer.writeUInt8(extrasLength, 4); // extras length
    }
    if (totalBodyLength) {
      buffer.writeUInt32BE(totalBodyLength, 8); // totalBodyLength
    }
    if (typeof cas !== 'undefined') {
      cas.copy(buffer, 16);
    }
    // WARNING: amount (incr/decr) and flags are mutually exclusive
    if (this.amount) {
      // buffer.writeBigUInt64BE(amount, 24); // TODO bigint support
      buffer.writeUInt32BE(this.amount, 28);
      if (this.initial && this.initial > 0) {
        // buffer.writeBigUInt64BE(initial, 32); // TODO bigint support
        buffer.writeUInt32BE(this.initial, 36);
      }
    } else if (this.flags && this.flags > 0) {
      buffer.writeUInt32BE(this.flags, 24);
    }
    if (typeof this.ttl === 'number') {
      // always at the end of the “extras”
      // • offset for set/add/replace = 28
      // • offset for incr/decr = 40
      buffer.writeUInt32BE(this.ttl, 24 + extrasLength - 4);
    }
    if (keyLength > 0) {
      key!.copy(buffer, 24 + extrasLength);
    }
    if (valueLength > 0) {
      value!.copy(buffer, 24 + extrasLength + keyLength);
    }
    return buffer;
  }

  public get keyAsBuffer() {
    return MemcacheUtil.toBuffer(this.key);
  }

  public get valueAsBuffer() {
    return MemcacheUtil.toBuffer(this.value);
  }

  public get extrasLength() {
    let length = 0;
    if (typeof this.ttl === 'number') {
      length += 4;
    }
    // WARNING: amount (incr/decr) and flags are mutually exclusive
    if (typeof this.amount === 'number') {
      length += 16;
    } else if (typeof this.flags === 'number') {
      length += 4;
    }
    return length;
  }

  // @ts-ignore
  // eslint-disable-next-line consistent-return, getter-return
  public get casAsBuffer() {
    if (typeof this.cas === 'undefined') {
      return;
    }
    const buffer = (Buffer.isBuffer(this.cas))
      ? MemcacheUtil.toBuffer(this.cas)
      : this.cas.cas;

    if (buffer && buffer.length === 8) {
      // eslint-disable-next-line consistent-return
      return buffer;
    }
  }
}

export = MemcacheRequest;
