/* eslint-disable max-len */
import {
  SerializationOptions, Encoder, Decoder, CommandCallback,
} from './types';

interface Deserializer {
  // (arg: Buffer): Buffer | number | string;
  // (arg: Buffer, callback: CommandCallback<any>): void
  (...args: any[]): void;
}

import util = require('util');

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');
import MemcacheUtil = require('./util');

const wrappedJsonStringify = (value: any) => JSON.stringify(value);
const wrappedJsonParse = (string: string) => JSON.parse(string);

export = ({
  stringFlag = 0b0,
  jsonFlag = 0b10,
  binaryFlag = 0b100,
  numberFlag = 0b1000,
  serialize = wrappedJsonStringify,
  deserialize = wrappedJsonParse,
}: Partial<SerializationOptions> = {}): [Encoder, Decoder] => {
  // Since JSON.* methods have option 2nd and 3rd parameters, our
  // MemcacheUtil.callbackWrapper will introduce a Maximum Callstack Error. So,
  // we will revert to a wrapped version if these native implementations has
  // been passed.
  if (serialize === JSON.stringify) {
    // eslint-disable-next-line no-param-reassign
    serialize = wrappedJsonStringify;
  }
  if (deserialize === JSON.parse) {
    // eslint-disable-next-line no-param-reassign
    deserialize = wrappedJsonParse;
  }

  const encoder: Encoder = (request: MemcacheRequest, callback: CommandCallback<MemcacheRequest>) => {
    // eslint-disable-next-line default-case
    switch (typeof request.value) {
      case 'undefined':
        request.value = Buffer.allocUnsafe(0);
        break;
      case 'string':
        // string will be Buffer.from(<String>) by MemcacheRequest
        if ((request.flags! & jsonFlag) !== jsonFlag) {
          request.flags! |= stringFlag;
        }
        break;
      case 'number':
        // number will be Buffer.from(<Number>.toString()) by MemcacheRequest
        request.flags! |= numberFlag;
        break;
      case 'function':
        request.value = (request.value as Function)();
        // recursive when value is a function
        encoder(request, callback);
        return;
      case 'boolean':
      case 'object':
        if (MemcacheUtil.isBufferLike(request.value)) {
          if ((request.flags! & jsonFlag) !== jsonFlag) {
            request.flags! |= binaryFlag;
          }
        } else if (util.types.isPromise(request.value)) {
          (request.value as Promise<unknown>)
            .then((value: any) => {
              request.value = value;
              // recursive when value is a promise
              encoder(request, callback);
            })
            .catch((error: MemcacheError) => {
              callback(new MemcacheError({
                message: error.message,
                status: MemcacheError.ERR_SERIALIZATION,
                request,
                error,
              }));
            });
          return;
        } else {
          request.flags! |= jsonFlag;
          MemcacheUtil.callbackWrapper(serialize)(
            request.value,
            (error?: MemcacheError, value?: any) => {
              if (error) {
                callback(new MemcacheError({
                  message: error.message,
                  status: MemcacheError.ERR_SERIALIZATION,
                  request,
                  error,
                }));
              } else {
                request.value = value;
                // recursive when using possibly user-defined serializer
                encoder(request, callback);
              }
            },
          );
          return;
        }
        break;
    }
    callback(undefined, request);
  };

  const decoders = ([
    [binaryFlag, (value: Buffer) => value],
    [stringFlag, (value: Buffer) => value.toString()],
    [numberFlag, (value: Buffer) => Number(value.toString())],
    [jsonFlag, (value: Buffer, callback: CommandCallback<any>) => {
      // Protect simple case where an empty value is flagged as JSON. This
      // wouldn’t happen with the defaults of this client, but it is possible
      // another client (or a custom config of this client) could create this
      // scenario.
      if (value.length === 0) {
        callback(undefined, undefined);
      } else {
        MemcacheUtil.callbackWrapper(deserialize)(value, callback);
      }
    }],
  ] as [number, Deserializer][])
    .map<[number, Deserializer]>(([flag, fn]) => [flag, MemcacheUtil.callbackWrapper(fn)])
    // Why are we sorting the decoders in descending order of the corresponding
    // configurable flag? Some commands (ex. `incr` and `decr`) allow keys to be
    // created without flags. In those scenarios, the `<MemcacheResponse>.flags`
    // will be `0`. Depending on which decoder flag is configured as `0`, it
    // might be applied instead of another. For example, by default,
    // `stringFlag`=0 and would decode every response as a string if we evaluate
    // it first. So, we sort these decoders in descending order of the
    // configured flags so that one configured with a `0` flag is evaluated last
    // and performed if and only if no other flags matched.
    .sort(([a], [b]) => b - a);

  const decoder: Decoder = <T>(
    response: MemcacheResponse,
    callback: CommandCallback<MemcacheResponse<T>>,
  ) => {
    // eslint-disable-next-line no-restricted-syntax
    for (const [flag, decoder] of decoders) {
      if ((response.flags & flag) === flag) {
        decoder(response.value, (error?: MemcacheError, value?: any) => {
          if (error) {
            callback(new MemcacheError({
              message: error.message,
              status: MemcacheError.ERR_SERIALIZATION,
              response,
              error,
            }));
          } else {
            response.value = value;
            callback(undefined, response as MemcacheResponse<T>);
          }
        });
        break;
      }
    }
  };

  return [encoder, decoder];
}
