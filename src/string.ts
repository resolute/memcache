import MemcacheResponse from './response';
import { key, value, DefaultOptions } from './types';
import { extendIfDefined } from './util';

export default (Base: any) => class extends Base {

    public stringFlag: number = 1 << 4;

    constructor({ stringFlag,
        ...options }: {
            stringFlag?: number
        } = {}) {

        super(options);

        extendIfDefined(this, { stringFlag })

    }

    protected async decode(response: MemcacheResponse) {
        const responseSuper = await super.decode(response);
        {
            const response = responseSuper;
            if ((response.flags & this.stringFlag) === 0) {
                return response;
            }
            response.value = response.value.toString();
            return response;
        }
    }

    protected async encode(key: key, value: value, options: DefaultOptions) {
        if (typeof value !== 'string') {
            return super.encode(key, value, options);
        }
        return super.encode(
            key,
            // value
            Buffer.from(value),
            // options
            {
                ...options,
                flags: options.flags | this.stringFlag
            }
        );

    }

}