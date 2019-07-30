import { extendIfDefined, normalizeOptions, sanitizeKey, sanitizeValue, sanitizeCas, sanitizeTtl } from './util';
import { key, value, ttl, cas, SetReplaceOptions, AddOptions, IncrDecrOptions, DefaultOptions, AnyOptions } from './types';
import MemcacheRequest from './request';
import MemcacheResponse from './response';
import MemcacheError from './error';

export const NULL_BUFFER = Buffer.allocUnsafe(0);

export default (Base: any) => class extends Base {

    // config
    public defaultTtl: number = 0;
    public commandTimeout: number = 4_000; // milliseconds commands may take
    public maxValueSize = 1_048_576; // 1MB or 2e20 bytes
    public maxKeySize = 250;

    public normalizeOptions: (options?: AnyOptions) => DefaultOptions;
    public sanitizeKey: (key: key) => Buffer;
    public sanitizeValue: (value: value) => Buffer;
    public sanitizeTtl: (ttl?: ttl) => number;
    public sanitizeCas: (cas?: cas) => Buffer;

    constructor({ ttl: defaultTtl, commandTimeout, maxValueSize, maxKeySize,
        ...options }: {
            ttl?: number,
            commandTimeout?: number,
            maxValueSize?: number,
            maxKeySize?: number
        } = {}) {

        super(options);

        extendIfDefined(this, { defaultTtl, maxValueSize, maxKeySize });

        this.sanitizeKey = sanitizeKey(this.maxKeySize);
        this.sanitizeValue = sanitizeValue(this.maxValueSize);
        this.sanitizeTtl = sanitizeTtl(this.defaultTtl);
        this.sanitizeCas = sanitizeCas(NULL_BUFFER);
        this.normalizeOptions = normalizeOptions({
            ttl: this.defaultTtl,
            cas: NULL_BUFFER,
            flags: 0,
            initial: 0,
        });

    }

    protected async send(buffer: Buffer): Promise<MemcacheResponse | MemcacheResponse[]> {
        const request = new MemcacheRequest(buffer, this.commandTimeout);
        request.timer.start();
        return super.send(request);
    }

    protected receive(response: MemcacheResponse | MemcacheResponse[]) {
        const request: MemcacheRequest = super.receive(response);
        request.timer.stop();
        const firstResponse = Array.isArray(response) ? response[0] : response;
        if (firstResponse.status !== 0) {
            request.reject(new MemcacheError({ request, response: firstResponse }));
        } else {
            request.resolve(response);
        }
        return request;
    }

    public async decode(response: MemcacheResponse) {
        return response;
    }

    protected async encode(key: key, value: value, options: DefaultOptions) {
        return {
            key: this.sanitizeKey(key),
            value: this.sanitizeValue(value),
            options
        };
    }

    protected async GetDel(opcode: number, key: key) {
        const keyBuffer = this.sanitizeKey(key);
        const buffer = Buffer.alloc(24 + keyBuffer.length);
        buffer.writeUInt8(0x80, 0); // 0x80 Request
        buffer.writeUInt8(opcode, 1); // 0x00: Get, 0x04: Del
        buffer.writeUInt16BE(keyBuffer.length, 2); // key length
        buffer.writeUInt32BE(keyBuffer.length, 8); // totalBodyLength
        keyBuffer.copy(buffer, 24);
        return this.send(buffer) as Promise<MemcacheResponse>;
    }

    protected async SetAddReplace(opcode: number, key: key, value: value, options?: SetReplaceOptions) {
        const encoded = await this.encode(key, value, this.normalizeOptions(options));
        {
            const { key, value, options: { ttl, cas, flags } } = encoded;
            {
                const buffer = Buffer.alloc(
                    32 + // header(24) + extras(8)
                    key.length +
                    value.length
                );
                buffer.writeUInt8(0x80, 0); // 0x80 Request
                buffer.writeUInt8(opcode, 1); // 0x01: Set, 0x02: Add, 0x03: Replace
                buffer.writeUInt16BE(key.length, 2); // key length
                buffer.writeUInt8(8, 4); // extras length
                buffer.writeUInt32BE(8 + key.length + value.length, 8); // totalBodyLength
                if (cas.length > 0 && opcode !== 0x02) { // ignore cas for Add operations
                    cas.copy(buffer, 16);
                }
                buffer.writeUInt32BE(flags, 24)
                buffer.writeUInt32BE(ttl, 28);
                key.copy(buffer, 32);
                value.copy(buffer, 32 + key.length)
                return this.send(buffer) as Promise<MemcacheResponse>
            }
        }
    }

    protected async IncrDecr(opcode: number, key: key, amount: number, options?: IncrDecrOptions) {
        const keyBuffer = this.sanitizeKey(key);
        const { ttl, cas, initial } = this.normalizeOptions(options);
        const buffer = Buffer.alloc(
            44 + // header(24) + extras(20)
            keyBuffer.length
        );
        buffer.writeUInt8(0x80, 0); // 0x80 Request
        buffer.writeUInt8(opcode, 1); // 0x05: Incr, 0x06: Decr
        buffer.writeUInt16BE(keyBuffer.length, 2); // key length
        buffer.writeUInt8(20, 4); // extras length
        buffer.writeUInt32BE(20 + keyBuffer.length, 8); // totalBodyLength
        if (cas.length > 0) {
            cas.copy(buffer, 16);
        }
        // TODO bigint support
        // buffer.writeBigUInt64BE(typeof amount !== 'bigint' ? BigInt(amount) : amount, 24);
        buffer.writeUInt32BE(amount, 28);
        // buffer.writeBigUInt64BE(typeof initial !== 'bigint' ? BigInt(initial) : initial, 32)
        buffer.writeUInt32BE(initial, 36)
        buffer.writeUInt32BE(ttl, 40);
        keyBuffer.copy(buffer, 44);
        return this.send(buffer) as Promise<MemcacheResponse>;
    }

    protected async AppendPrepend(opcode: number, key: key, value: value, cas?: cas) {
        const keyBuffer = this.sanitizeKey(key);
        const valueBuffer = this.sanitizeValue(value);
        const casBuffer = this.sanitizeCas(cas);
        const buffer = Buffer.alloc(
            24 + // header(24)
            keyBuffer.length +
            valueBuffer.length
        );
        buffer.writeUInt8(0x80, 0); // 0x80 Request
        buffer.writeUInt8(opcode, 1); // 0x0e: Append, 0x0f: Prepend
        buffer.writeUInt16BE(keyBuffer.length, 2); // key length
        buffer.writeUInt32BE(keyBuffer.length + valueBuffer.length, 8); // totalBodyLength
        if (casBuffer.length > 0) {
            casBuffer.copy(buffer, 16);
        }
        keyBuffer.copy(buffer, 24);
        valueBuffer.copy(buffer, 24 + keyBuffer.length)
        return this.send(buffer) as Promise<MemcacheResponse>;
    }

    protected async TouchGat(opcode: number, key: key, ttl: ttl) {
        const keyBuffer = this.sanitizeKey(key);
        const buffer = Buffer.alloc(
            28 + // header(24) + extras(4)
            keyBuffer.length
        );
        buffer.writeUInt8(0x80, 0); // 0x80 Request
        buffer.writeUInt8(opcode, 1); // 0x1c: Touch, 0x1d: GAT (Get And Touch)
        buffer.writeUInt16BE(keyBuffer.length, 2); // key length
        buffer.writeUInt8(4, 4); // extras length
        buffer.writeUInt32BE(4 + keyBuffer.length, 8); // totalBodyLength
        buffer.writeUInt32BE(this.sanitizeTtl(ttl), 24);
        keyBuffer.copy(buffer, 28);
        return this.send(buffer) as Promise<MemcacheResponse>;
    }

    public async get(key: key) {
        const response = await this.GetDel(0x00, key);
        return this.decode(response);
    }

    public async set(key: key, value: value, options?: SetReplaceOptions) {
        return this.SetAddReplace(0x01, key, value, options);
    }

    public async add(key: key, value: value, options?: AddOptions) {
        return this.SetAddReplace(0x02, key, value, options);
    }

    public async replace(key: key, value: value, options?: SetReplaceOptions) {
        return this.SetAddReplace(0x03, key, value, options);
    }

    public async del(key: key) {
        return this.GetDel(0x04, key);
    }

    public async incr(key: key, amount: number, options?: IncrDecrOptions) {
        return this.IncrDecr(0x05, key, amount, options);
    }

    public async decr(key: key, amount: number, options?: IncrDecrOptions) {
        return this.IncrDecr(0x06, key, amount, options);
    }

    public async append(key: key, value: value, cas?: cas) {
        return this.AppendPrepend(0x0e, key, value, cas);
    }

    public async prepend(key: key, value: value, cas?: cas) {
        return this.AppendPrepend(0x0f, key, value, cas);
    }

    public async touch(key: key, ttl: ttl) {
        return this.TouchGat(0x1c, key, ttl);
    }

    public async gat(key: key, ttl: ttl) {
        const response = await this.TouchGat(0x1d, key, ttl);
        return this.decode(response);
    }

    public async version(): Promise<string> {
        const buffer = Buffer.alloc(24); // header(24)
        buffer.writeUInt8(0x80, 0); // 0x80 Request
        buffer.writeUInt8(0x0b, 1); // 0x0b: Version
        return (this.send(buffer) as Promise<MemcacheResponse>)
            .then((response) => response.value.toString());
        ;
    }

    public async stat(key?: key): Promise<{ [property: string]: string }> {
        const keyBuffer = key ? this.sanitizeKey(key) : NULL_BUFFER;
        const buffer = Buffer.alloc(24 + keyBuffer.length); // header(24) + key(4)
        buffer.writeUInt8(0x80, 0); // 0x80 Request
        buffer.writeUInt8(0x10, 1); // 0x10: Stat
        buffer.writeUInt16BE(keyBuffer.length, 2); // totalBodyLength
        buffer.writeUInt32BE(keyBuffer.length, 8); // totalBodyLength
        keyBuffer.copy(buffer, 24);
        return (this.send(buffer) as Promise<MemcacheResponse[]>)
            .then((responses) => {
                if (!Array.isArray(responses)) {
                    return {};
                }
                return responses.reduce((carry: any, { key, value }) => {
                    carry[key.toString()] = value.toString();
                    return carry;
                }, {});
            })
    }

    public async flush(ttl?: ttl) {
        const buffer = Buffer.alloc(28); // header(24) + extras(4)
        buffer.writeUInt8(0x80, 0); // 0x80 Request
        buffer.writeUInt8(0x08, 1); // 0x08: Flush
        buffer.writeUInt8(4, 4); // extras length
        buffer.writeUInt32BE(4, 8); // totalBodyLength
        buffer.writeUInt32BE(this.sanitizeTtl(ttl), 24);
        return this.send(buffer) as Promise<MemcacheResponse>;
    }

}