import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheUtil = require('./util');

class MemcacheError extends Error {
  public status: number = MemcacheError.ERR_UNEXPECTED; // Unexpected error
  public type: 'client' | 'server' = 'server';
  public request?: MemcacheRequest<any>;
  public response?: MemcacheResponse<any>;
  public error?: Error;

  constructor({
    message, status, request, response, error,
  }: {
    message?: string,
    status?: number,
    request?: MemcacheRequest<any>,
    response?: MemcacheResponse<any>,
    error?: Error
  }) {
    super(parseErrorMessage(message, response));

    if (response) {
      this.status = response.status;
    }
    if (typeof status === 'number') {
      this.status = status;
    }
    if (this.status >= 0x100) {
      this.type = 'client';
    }

    MemcacheUtil.extendIfDefined(this, { request, response, error });
  }

  static ERR_KEY_NOT_FOUND = 0x0001; // 1
  static ERR_KEY_EXISTS = 0x0002; // 2
  static ERR_VALUE_TOO_LARGE = 0x0003; // 3
  static ERR_INVALID_ARGUMENTS = 0x0004; // 4
  static ERR_ITEM_NOT_STORED = 0x0005; // 5
  static ERR_INCR_DECR_ON_NON_NUMERIC_VALUE = 0x0006; // 6
  static ERR_THE_VBUCKET_BELONGS_TO_ANOTHER_SERVER = 0x0007; // 7
  static ERR_AUTHENTICATION_ERROR = 0x0008; // 8
  static ERR_AUTHENTICATION_CONTINUE = 0x0009; // 9
  static ERR_AUTHENTICATION_FAILED = 0x0020; // 32 (added: Memcached responds on failed auth)
  static ERR_UNKNOWN_COMMAND = 0x0081; // 129
  static ERR_OUT_OF_MEMORY = 0x0082; // 130
  static ERR_NOT_SUPPORTED = 0x0083; // 131
  static ERR_INTERNAL_ERROR = 0x0084; // 132
  static ERR_BUSY = 0x0085; // 133
  static ERR_TEMPORARY_FAILURE = 0x0086; // 134
  static ERR_UNEXPECTED = 0x0100; // 256
  static ERR_CONNECTION = 0x0101; // 257
  static ERR_INVALID = 0x0102; // 258
  static ERR_COMPRESSION = 0x0103; // 259
  static ERR_SERIALIZATION = 0x0104; // 260
}

export = MemcacheError;

const parseErrorMessage = (message?: string, response?: MemcacheResponse) => {
  let msg = 'Unexpected error';
  if (
    response && response.status > 0 &&
    Buffer.isBuffer(response.value)
  ) {
    // server responds with custom error status/message
    msg = response.value.toString();
  }
  if (message) {
    msg = message;
  }
  return msg;
};
