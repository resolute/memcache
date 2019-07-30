import { debuglog, inspect } from 'util';
import MemcacheError, { ERR_CONNECTION } from './error';
import { timer, extendIfDefined } from './util';
import { backoff, Timer } from './types';

const debug = debuglog('memcache');

export default (Base: any) => class extends Base {

    // config
    public retries = Infinity; // connection attempts before marked dead
    public minDelay = 100; // milliseconds
    public maxDelay = 30_000; // milliseconds
    public backoff: backoff = (attempt: number) => attempt * this.minDelay; // incremental backoff

    // private state
    private attempt = 0;
    private retryTimer: Timer;

    constructor({ retries, minDelay, maxDelay, backoff,
        ...options }: {
            minDelay?: number,
            maxDelay?: number,
            retries?: number,
            backoff?: backoff
        } = {}) {

        super(options);

        extendIfDefined(this, { retries, minDelay, maxDelay, backoff });

        // Similar to the connect timer, the reconnect timer should never
        // prevent the Node process from terminating.
        this.retryTimer = timer(this.minDelay, false, () => {
            super.connect();
        });

        this

            .setKeepAlive(true)

            // remove super’s existing 'error' listener, which calls
            // `.kill(error)` because it assumes there will be no reconnection
            // attempts.
            .removeAllListeners('error')

            // attach a hollow handler so that exception isn’t thrown
            .on('error', () => { })

            .on('connect', () => {
                this.retryTimer.stop();
                this.attempt = 0;
            })

            .on('close', () => {
                if (this.attempt >= this.retries) {
                    this.kill(new MemcacheError({
                        message: `Failed to connect to ${inspect(this.socketConnectOptions)} after ${this.attempt.toLocaleString()} attempt${this.attempt !== 1 ? 's' : ''}.`,
                        status: ERR_CONNECTION,
                    }));
                    return;
                }
                // only attempt to reconnect if the connection has not been
                // `kill()`ed
                if (this.killed === false) {
                    debug('keepalive: retry attempt %s of %s',
                        this.attempt.toLocaleString(),
                        this.retries.toLocaleString());
                    this.connect();
                }
            });
    }

    public connect() {
        const delay = this.backoff(++this.attempt);
        // The timer’s callback function will call super.connect() after backoff
        // milliseconds.
        this.retryTimer.restart(Math.min(this.maxDelay, delay));
        return this;
    }

}