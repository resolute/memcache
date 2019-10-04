/* eslint-disable max-len */
import {
  SerializationOptions, Encoder, Decoder, CommandCallback,
} from './types';

import util = require('util');

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');
import MemcacheUtil = require('./util');

export = ({
  stringFlag = 0b0,
  jsonFlag = 0b10,
  binaryFlag = 0b100,
  numberFlag = 0b1000,
  // TODO since JSON.* methods have option 2nd and 3rd parameters, our
  // util.callbackWrapper will introduce an Maximum Callstack Error. So, we use
  // a wrapper beforehand, but maybe this whole callbackWrapper thing isn’t
  // really going to work.
  serialize = (value: any) => JSON.stringify(value),
  deserialize = (string: string) => JSON.parse(string),
}: SerializationOptions = {}): [Encoder, Decoder] => {
  const encoder: Encoder = (request: MemcacheRequest, callback: CommandCallback<MemcacheRequest>) => {
    // eslint-disable-next-line default-case
    switch (typeof request.value) {
      case 'undefined':
        request.value = Buffer.allocUnsafe(0);
        break;
      case 'string':
        // string will be Buffer.from(<String>) by MemcacheRequest
        request.flags! |= stringFlag;
        break;
      case 'number':
        // number will be Buffer.from(<Number>.toString()) by MemcacheRequest
        request.flags! |= numberFlag;
        break;
      case 'function':
        request.value = (request.value as Function)();
        // recursive when value is a function
        encoder(request, callback);
        return undefined;
      case 'boolean':
      case 'object':
        if (MemcacheUtil.isBufferLike(request.value)) {
          request.flags! |= binaryFlag;
        } else if (util.types.isPromise(request.value)) {
          (request.value as Promise<unknown>)
            .then((value: any) => {
              request.value = value;
              // recursive when value is a promise
              encoder(request, callback);
            })
            .catch((error: MemcacheError) => {
              callback(error);
            });
          return undefined;
        } else {
          request.flags! |= jsonFlag;
          MemcacheUtil.callbackWrapper(serialize)(request.value, (error?: MemcacheError, value?: any) => {
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
          });
        }
        break;
    }
    callback(undefined, request);
    return undefined;
  };

  const decoders = ([
    [binaryFlag, (value: Buffer) => value],
    [stringFlag, (value: Buffer) => value.toString()],
    [numberFlag, (value: Buffer) => Number(value.toString())],
    [jsonFlag, (value: Buffer) => {
      // Protect simple case where an empty value is flagged as JSON. This
      // wouldn’t happen with the defaults of this client, but it is possible
      // another client (or a custom config of this client) could create this
      // scenario.
      if (value.length === 0) {
        return undefined;
      }
      return deserialize(value.toString());
    }],
  ] as [number, (arg: Buffer) => any][])
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

  const decoder: Decoder = <T>(response: MemcacheResponse, callback: CommandCallback<MemcacheResponse<T>>) => {
    // eslint-disable-next-line no-restricted-syntax
    for (const [flag, decoder] of decoders) {
      if ((response.flags & flag) === flag) {
        try {
          response.value = decoder(response.value as Buffer);
        } catch (error) {
          callback(new MemcacheError({
            message: error.message,
            status: MemcacheError.ERR_SERIALIZATION,
            response,
            error,
          }));
          return;
        }
        break;
      }
    }
    callback(undefined, response as unknown as MemcacheResponse<T>);
  };

  return [encoder, decoder];
}
