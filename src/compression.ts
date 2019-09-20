import { gzip, gunzip, constants } from 'zlib';
import { promisify } from 'util';
import { CompressionOptions, Encoder, Decoder } from './types';

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');

export = ({
  flag = 0b1,
  threshold = 1_048_576,
  options = { level: constants.Z_BEST_SPEED },
  compress = promisify(gzip),
  decompress = promisify(gunzip),
}: CompressionOptions = {}): [Encoder, Decoder] => ([
  // encoder
  async (request: MemcacheRequest) => {
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
  async (response: MemcacheResponse<Buffer>) => {
    if ((response.flags & flag) !== flag) {
      return response;
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
    return response;
  },
])
