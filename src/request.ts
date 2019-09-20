import {
  MemcacheRequestOptions, BufferLike, Ttl, Cas,
} from './types';
import { extendIfDefined, toBuffer } from './util';

import MemcacheError = require('./error');
import MemcacheResponse = require('./response');

class MemcacheRequest<T = MemcacheResponse> {
  public opcode!: number;
  public key?: BufferLike;
  public value?: BufferLike;
  public amount?: number;
  public ttl?: Ttl;
  public cas?: Cas;
  public initial?: number;
  public flags?: number;
  public promise!: Promise<T>;
  public resolve!: (value: T) => void;
  public reject!: (reason: MemcacheError) => void;
  public timeout?: number; // purely cosmetic
  private timer?: NodeJS.Timer;

  constructor(options: MemcacheRequestOptions) {
    extendIfDefined(this, options);

    const promise = new Promise((resolve, reject) => {
      Object.defineProperties(this, {
        resolve: {
          value: (value: T) => {
            this.stop();
            resolve.call(undefined, value);
          },
        },
        reject: {
          value: (reason: MemcacheError) => {
            this.stop();
            reject.call(undefined, reason);
          },
        },
      });
    });

    Object.defineProperties(this, {
      promise: { value: promise },
    });
  }

  public start(msecs: number) {
    this.timeout = msecs; // purely cosmetic
    // The command timer is always ref()’d and prevents the Node process
    // from terminating once a command is issued until it is received.
    Object.defineProperty(this, 'timer', {
      value: setTimeout(() => {
        this.reject(new MemcacheError({
          message: `commandTimeout (${msecs.toLocaleString()} ms) exceeded.`,
          status: MemcacheError.ERR_CONNECTION,
          request: this,
        }));
      }, msecs),
    });
    return this;
  }

  private stop() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    return this;
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
    return toBuffer(this.key);
  }

  public get valueAsBuffer() {
    return toBuffer(this.value);
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
      return undefined;
    }
    const buffer = (Buffer.isBuffer(this.cas))
      ? toBuffer(this.cas)
      : this.cas.cas;

    if (buffer && buffer.length === 8) {
      // eslint-disable-next-line consistent-return
      return buffer;
    }
  }
}

export = MemcacheRequest;
