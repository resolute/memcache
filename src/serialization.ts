import { types } from 'util';
import { SerializationOptions, Encoder, Decoder } from './types';
import { isBufferLike } from './util';

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');

export = ({
  stringFlag = 0b0,
  jsonFlag = 0b10,
  binaryFlag = 0b100,
  numberFlag = 0b1000,
  serialize = JSON.stringify,
  deserialize = JSON.parse,
}: SerializationOptions = {}): [Encoder, Decoder] => {
  const encoder: Encoder = async (request: MemcacheRequest) => {
    // eslint-disable-next-line default-case
    switch (typeof request.value) {
      case 'undefined':
        request.flags! |= jsonFlag;
        request.value = Buffer.allocUnsafe(0);
        break;
      case 'string':
        request.flags! |= stringFlag;
        break;
      case 'number':
        request.flags! |= numberFlag;
        break;
      case 'boolean':
      case 'object':
        if (isBufferLike(request.value)) {
          request.flags! |= binaryFlag;
        } else if (types.isPromise(request.value)) {
          request.value = await (request.value as Promise<any>);
          // recursive when value is a promise
          return encoder(request);
        } else {
          request.flags! |= jsonFlag;
          try {
            request.value = await serialize(request.value);
          } catch (error) {
            throw new MemcacheError({
              message: error.message,
              status: MemcacheError.ERR_SERIALIZATION,
              request,
              error,
            });
          }
        }
        break;
      case 'function':
        request.value = (request.value as Function)();
        return encoder(request);
    }
    return request;
  };

  const decoder: Decoder = async <V>(response: MemcacheResponse<Buffer>) => {
    if ((response.flags & binaryFlag) === binaryFlag) {
      // `binaryFlag` will just return the buffer as-is
      return response as unknown as MemcacheResponse<V>;
      // This _must_ return as any flag defined as (int) 0 will always get
      // applied. By default, stringFlag = 0 and would decode every response as
      // a string. TODO: there might be some better logic to allow users to
      // define different flags that would need to make this deserialization
      // more aware and dynamic. For example, if binaryFlag = 0, then test for
      // other flags first and return if other flags match before returning a
      // binary/Buffer result.
    }
    if ((response.flags & jsonFlag) === jsonFlag) {
      if (response.value.length === 0) {
        // @ts-ignore
        response.value = undefined;
      } else {
        try {
          response.value = await deserialize(response.value.toString());
        } catch (error) {
          throw new MemcacheError({
            message: error.message,
            status: MemcacheError.ERR_SERIALIZATION,
            response,
            error,
          });
        }
      }
    } else if ((response.flags & numberFlag) === numberFlag) {
      // @ts-ignore
      response.value = Number(response.value.toString());
    } else if ((response.flags & stringFlag) === stringFlag) {
      // @ts-ignore
      response.value = response.value.toString();
    }
    return response as unknown as MemcacheResponse<V>;
  };

  return [encoder, decoder];
}
