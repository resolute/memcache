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

  const decoders = ([
    [binaryFlag, (value: Buffer) => value],
    [stringFlag, (value: Buffer) => value.toString()],
    [numberFlag, (value: Buffer) => Number(value.toString())],
    [jsonFlag, (value: Buffer) => {
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
    // `stringFlag`=0 and would decode every response as a string if we evaulate
    // it first. So, we sort these decoders in descending order of the
    // configured flags so that one configured with a `0` flag is evaluated last
    // and performed if and only if no other flags matched.
    .sort(([a], [b]) => b - a);

  const decoder: Decoder = async <V>(response: MemcacheResponse<Buffer>) => {
    // eslint-disable-next-line no-restricted-syntax
    for (const [flag, decoder] of decoders) {
      if ((response.flags & flag) === flag) {
        try {
          // eslint-disable-next-line no-await-in-loop
          response.value = await decoder(response.value);
        } catch (error) {
          throw new MemcacheError({
            message: error.message,
            status: MemcacheError.ERR_SERIALIZATION,
            response,
            error,
          });
        }
        break;
      }
    }
    return response as unknown as MemcacheResponse<V>;
  };

  return [encoder, decoder];
}
