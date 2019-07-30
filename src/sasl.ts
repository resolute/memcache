import { debuglog } from 'util';
import MemcacheError from './error';
import MemcacheRequest from './request';

const debug = debuglog('memcache');

const generateAuthBuffer = (username: string, password: string) => {
    const key = Buffer.from('PLAIN');
    const value = Buffer.from(`\x00${username}\x00${password}`);
    const buffer = Buffer.alloc(
        24 + // header(24)
        key.length +
        value.length
    );
    buffer.writeUInt8(0x80, 0); // 0x80 Request
    buffer.writeUInt8(0x21, 1); // 0x21: Start Authentication
    buffer.writeUInt16BE(key.length, 2); // key length
    buffer.writeUInt32BE(key.length + value.length, 8); // totalBodyLength
    key.copy(buffer, 24);
    value.copy(buffer, 24 + key.length)
    return buffer;
}

export default (Base: any) => class extends Base {

    // config
    private authBuffer?: Buffer;

    constructor({ username, password,
        ...options }: {
            username?: string, password?: string
        } = {}) {

        super(options);

        if (username && password) {
            this.authBuffer = generateAuthBuffer(username, password);
        }
    }

    public connect() {
        debug('sasl.connect()');
        // frontload our auth request if not already in front
        if (this.authBuffer && (this.queue.length === 0 || this.queue[0][0] !== this.authBuffer)) {
            debug('sasl.connect() unshift authBuffer on queue');
            const request = new MemcacheRequest(this.authBuffer, this.commandTimeout);
            // Do not start/set the commandTimer for this request because we’re
            // not sending immediately.
            request.promise.catch((error: MemcacheError) => {
                debug('SASL Error. Destroying socket...');
                if (this.kill) {
                    this.kill(error);
                } else {
                    this.destroy(error);
                }
            })
            this.queue.unshift(request);
        }
        super.connect();
        return this;
    }

}