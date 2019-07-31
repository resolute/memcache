import { timer } from "./util";
import MemcacheError, { ERR_TIMEOUT } from "./error";
import { Timer } from "./types";
import MemcacheResponse from "./response";

export default class MemcacheRequest {
    public buffer: Buffer;
    public promise: Promise<MemcacheResponse | MemcacheResponse[]>;
    public resolve: (value: MemcacheResponse | MemcacheResponse[]) => void = (value) => { };
    public reject: (reason: MemcacheError) => void = (reason) => { };
    public timer?: Timer;

    constructor(buffer: Buffer, timeout?: number) {
        this.buffer = buffer;
        this.promise = new Promise((
            resolve: (value: MemcacheResponse | MemcacheResponse[]) => void,
            reject: (reason: MemcacheError) => void) => {
            this.resolve = (value: MemcacheResponse | MemcacheResponse[]) => {
                if (this.timer) {
                    this.timer.stop();
                }
                resolve.call(undefined, value);
            }
            this.reject = (reason: MemcacheError) => {
                if (this.timer) {
                    this.timer.stop();
                }
                reject.call(undefined, reason);
            }
        });
        // The command timer is always ref()’d and prevents the Node process
        // from terminating once a command is issued until it is received.
        if (timeout) {
            this.timer = timer(timeout, true, () => {
                this.reject(new MemcacheError({
                    message: `commandTimeout (${timeout.toLocaleString()} ms) exceeded.`,
                    status: ERR_TIMEOUT,
                    request: this
                }));
            });
            this.timer.start();
        }
    }
}