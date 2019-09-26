import { CompressionOptions, Encoder, Decoder } from './types';

import zlib = require('zlib');
import util = require('util');

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');

export = ({
  flag = 0b1,
  threshold = 1_048_576,
  options = { level: zlib.constants.Z_BEST_SPEED },
  compress = util.promisify(zlib.gzip),
  decompress = util.promisify(zlib.gunzip),
}: CompressionOptions = {}): [Encoder, Decoder] => ([
  // encoder
  async <T>(request: MemcacheRequest<T>) => {
    const buffer = request.valueAsBuffer;
    if (typeof buffer === 'undefined' || buffer.length <= threshold) {
      return request;
    }
    try {
      request.value = await compress(buffer, options);
      request.flags! |= flag;
    } catch (error) {
      throw new MemcacheError({
        message: error.message,
        status: MemcacheError.ERR_COMPRESSION,
        request,
        error,
      });
    }
    return request;
  },
  // decoder
  async <T>(response: MemcacheResponse<Buffer>) => {
    if ((response.flags & flag) !== flag) {
      return response as unknown as MemcacheResponse<T>;
    }
    try {
      response.value = await decompress(response.value, options);
    } catch (error) {
      throw new MemcacheError({
        message: error.message,
        status: MemcacheError.ERR_COMPRESSION,
        response,
        error,
      });
    }
    return response as unknown as MemcacheResponse<T>;
  },
])
