import {
  CompressionOptions, Encoder, Decoder, CommandCallback,
} from './types';

import zlib = require('zlib');

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');
import MemcacheUtil = require('./util');

export = ({
  flag = 0b1,
  threshold = 1_048_576,
  options = { level: zlib.constants.Z_BEST_SPEED },
  compress = zlib.gzip,
  decompress = zlib.gunzip,
}: Partial<CompressionOptions> = {}): [Encoder, Decoder] => ([
  // encoder
  (request: MemcacheRequest, callback: CommandCallback<MemcacheRequest>) => {
    const buffer = request.valueAsBuffer;
    if (typeof buffer === 'undefined' || buffer.length <= threshold) {
      callback(undefined, request);
      return;
    }
    MemcacheUtil.callbackWrapper(compress)(
      buffer,
      options,
      (error: Error | null, result: Buffer) => {
        if (error) {
          callback(new MemcacheError({
            message: error.message,
            status: MemcacheError.ERR_COMPRESSION,
            request,
            error,
          }));
        } else {
          request.value = result;
          request.flags! |= flag;
          callback(undefined, request);
        }
      },
    );
  },
  // decoder
  <T>(response: MemcacheResponse, callback: CommandCallback<MemcacheResponse<T>>) => {
    if ((response.flags & flag) !== flag) {
      callback(undefined, response as unknown as MemcacheResponse<T>);
      return;
    }
    MemcacheUtil.callbackWrapper(decompress)(
      response.value,
      options,
      (error: Error | null, result: Buffer) => {
        if (error) {
          callback(new MemcacheError({
            message: error.message,
            status: MemcacheError.ERR_COMPRESSION,
            response,
            error,
          }));
        } else {
          response.value = result;
          callback(undefined, response as unknown as MemcacheResponse<T>);
        }
      },
    );
  },
])
