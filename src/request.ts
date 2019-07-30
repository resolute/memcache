import { timer } from "./util";
import MemcacheError, { ERR_TIMEOUT } from "./error";
import { Timer } from "./types";
import MemcacheResponse from "./response";

export default class MemcacheRequest {
    public buffer: Buffer;
    public promise: Promise<MemcacheResponse | MemcacheResponse[]>;
    public resolve: (value: MemcacheResponse | MemcacheResponse[]) => void = (value) => { };
    public reject: (reason: MemcacheError) => void = (reason) => { };
    public timer: Timer;

    constructor(buffer: Buffer, timeout: number) {
        this.buffer = buffer;
        this.promise = new Promise((
            resolve: (value: MemcacheResponse | MemcacheResponse[]) => void,
            reject: (reason: MemcacheError) => void) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        // The command timer is always ref()’d and prevents the Node process
        // from terminating once a command is issued until it is received.
        this.timer = timer(timeout, true, () => {
            this.reject(new MemcacheError({
                message: `commandTimeout (${timeout.toLocaleString()} ms) exceeded.`,
                status: ERR_TIMEOUT,
                request: this
            }));
        });
    }

    // TODO: write some helper methods to inspect requests and ultimately a
    // proper .toString() method.
}