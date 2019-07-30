import { isBufferish, toBuffer, extendIfDefined } from './util';
import { NULL_BUFFER } from './protocol';
import MemcacheResponse from './response';
import MemcacheError, { ERR_JSON } from './error';
import { key, value, DefaultOptions, jsonSerializer, jsonDeserializer } from './types';

export default (Base: any) => class extends Base {

    public jsonFlag: number = 1 << 1;
    public serialize: jsonSerializer = JSON.stringify;
    public deserialize: jsonDeserializer = JSON.parse;

    constructor({ jsonFlag, serialize, deserialize,
        ...options }: {
            jsonFlag?: number,
            serialize?: jsonSerializer;
            deserialize?: jsonDeserializer,
        } = {}) {

        super(options);

        extendIfDefined(this, { jsonFlag, serialize, deserialize })
    }

    protected async decode(response: MemcacheResponse) {
        const responseSuper = await super.decode(response);
        {
            const response = responseSuper;
            if ((response.flags & this.jsonFlag) === 0) {
                return response;
            }
            if (response.value.length === 0) {
                response.value = undefined;
                return response;
            }
            try {
                response.value = await this.deserialize(response.value.toString());
            } catch (error) {
                throw new MemcacheError({
                    message: error.message,
                    status: ERR_JSON,
                    response,
                    error
                });
            }
            return response;
        }
    }

    protected async encode(key: key, value: value, options: DefaultOptions) {
        if (isBufferish(value)) {
            return super.encode(key, value, options);
        }
        try {
            let valueBuffer = NULL_BUFFER;
            if (typeof value !== 'undefined') {
                // `toBuffer()` prevents double encoding and that any
                // user-supplied serializer returns a Buffer.
                valueBuffer = toBuffer(await this.serialize(value));
            }
            return super.encode(
                key,
                // value
                await valueBuffer,
                // options
                {
                    ...options,
                    flags: options.flags | this.jsonFlag
                }
            );

        } catch (error) {
            throw new MemcacheError({
                message: error.message,
                status: ERR_JSON,
                error
            });
        }
    }

}