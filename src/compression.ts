import { gzip, gunzip, constants } from 'zlib';
import { promisify } from 'util';

import MemcacheResponse from './response';
import MemcacheError, { ERR_COMPRESSION } from './error';
import { key, value, DefaultOptions, compressFunction, decompressFunction, compressIf } from './types';
import { toBuffer, extendIfDefined } from './util';

export default (Base: any) => class extends Base {

    public compressionFlag: number = 1 << 0;
    public compressIf: compressIf = (key: key, value: Buffer) => value.length > this.maxValueSize;
    public compressionOptions: any = { level: constants.Z_BEST_SPEED };
    public compress: compressFunction = promisify(gzip);
    public decompress: decompressFunction = promisify(gunzip);

    constructor({ compressionFlag, compressIf, compressionOptions, compress, decompress,
        ...options }: {
            compressionFlag?: number,
            compressIf?: compressIf,
            compressionOptions?: any,
            compress?: compressFunction,
            decompress?: decompressFunction,
        } = {}) {

        super(options);

        extendIfDefined(this, { compressionFlag, compressIf, compressionOptions, compress, decompress })
    }

    protected async decode(response: MemcacheResponse) {
        const responseSuper = await super.decode(response);
        {
            const response = responseSuper;
            if ((response.flags & this.compressionFlag) === 0) {
                return response;
            }
            try {
                response.value = await this.decompress(response.value, this.compressionOptions);
            } catch (error) {
                throw new MemcacheError({
                    message: error.message,
                    status: ERR_COMPRESSION,
                    response,
                    error
                });
            }
            return response;
        }
    }

    protected async encode(key: key, value: value, options: DefaultOptions) {
        const valueBuffer = toBuffer(value);
        if (!this.compressIf(key, valueBuffer)) {
            return super.encode(key, value, options);
        }
        try {
            return super.encode(
                key,
                // value
                await this.compress(value, this.compressionOptions),
                // options
                {
                    ...options,
                    flags: options.flags | this.compressionFlag
                }
            );
        } catch (error) {
            throw new MemcacheError({
                message: error.message,
                status: ERR_COMPRESSION,
                error
            });
        }
    }

}