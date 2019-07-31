import { debuglog, inspect } from 'util';
import { SocketConnectOpts } from 'net';
import MemcacheRequest from './request';
import MemcacheResponse from './response';
import MemcacheError, {
    ERR_TIMEOUT,
    ERR_QUEUE_FULL, ERR_UNEXPECTED, ERR_CONNECTION
} from './error';
import { NULL_BUFFER } from './protocol';
import { timer, extendIfDefined, socketConnectOptions } from './util';
import { Timer } from './types';

const debug = debuglog('memcache');

export default (Base: any) => class extends Base {

    // config
    public host: string = '127.0.0.1';
    public port: number = 11211;
    public path?: string;
    public queueSize: number = Infinity;
    public connectTimeout: number = 2_000; // milliseconds .connect() may take
    public multiResponseOpCodes: number[] = [0x10];

    // protected state
    protected queue: MemcacheRequest[] = [];
    protected socketConnectOptions: SocketConnectOpts;
    protected killed: MemcacheError | false = false;

    // private state
    private writeBufferAvailable = true;
    private sendPointer: number = 0;
    private residualBuffer: Buffer = NULL_BUFFER;
    private multiResponse: MemcacheResponse[] = [];
    private connectTimer: Timer;
    private _handle: any; // from Node’s internal net module

    constructor({ host, port, path, queueSize, connectTimeout,
        multiResponseOpCodes }: {
            host?: string,
            port?: number,
            path?: string,
            queueSize?: number,
            connectTimeout?: number,
            multiResponseOpCodes?: number[],
        } = {}) {

        super();

        extendIfDefined(this, {
            host, port, path, queueSize,
            connectTimeout, multiResponseOpCodes,
        });

        this.socketConnectOptions = socketConnectOptions({
            port: this.port,
            host: this.host,
            path: this.path,
        });

        // The connect timer is unref()’d as it should never keep the Node
        // process from terminating by itself.
        this.connectTimer = timer(this.connectTimeout, false, () => {
            debug('connection: connectTimer expired');
            this.destroy(new MemcacheError({
                message: `Connection to ${inspect(this.socketConnectOptions)} exceeded ${this.connectTimeout.toLocaleString()} ms timeout.`,
                status: ERR_TIMEOUT,
            }));
        });

        this

            .on('connect', () => {
                debug(`connection.on('connect')`);
                this.connectTimer.stop();
                this.residualBuffer = NULL_BUFFER;
                this.unref();
                this._send();
            })

            .on('ready', () => {
                debug(`connection.on('ready')`);
                this._send();
            })

            .on('drain', () => {
                debug(`connection.on('drain')`);
                this.writeBufferAvailable = true;
                this._send();
            })

            .on('data', this._receive)

            .on('error', (error: Error) => {
                // If keepalive is disabled, then any error event must “kill”
                // this client. This listener will be removed by keepalive if it
                // is enabled.
                this.kill(new MemcacheError(error));
            })

            .on('close', () => {
                debug(`connection.on('close')`);
                this.connectTimer.stop();
                this.sendPointer = 0;
            })

            .setNoDelay(true);

        // Defer this.connect() so that extending classes may finish their
        // constructor execution.
        process.nextTick(this.connect.bind(this));
    }

    public connect() {
        debug('connection.connect()');
        this.connectTimer.restart();
        super.connect(this.socketConnectOptions);
        return this;
    }

    private _send() {
        debug(`connection._send(): queue(%s) sendPointer(%s)`,
            this.queue.length.toLocaleString(),
            this.sendPointer.toLocaleString());
        if (this.sendPointer < this.queue.length) {
            this.ref();
        }
        while (
            this.writable &&
            this.writeBufferAvailable &&
            this.sendPointer < this.queue.length
        ) {
            const request = this.queue[this.sendPointer];
            debug('connection._send() request: ', request);
            this.writeBufferAvailable = this.write(request.buffer);
            this.sendPointer++;
        }
        return this;
    }

    protected async send(request: MemcacheRequest): Promise<MemcacheResponse | MemcacheResponse[]> {
        if (this.killed !== false) {
            request.reject(this.killed);
            return request.promise;
        }
        if (this.queue.length >= this.queueSize) {
            request.reject(new MemcacheError({
                message: `queueSize ${this.queueSize.toLocaleString()} exceeded`,
                status: ERR_QUEUE_FULL,
                request
            }));
            return request.promise;
        }
        this.queue.push(request);
        // TODO this breaks (I think) the async hook chain
        this._send();
        debug("connection.send() this.listenerCount('connect'): %s",
            this.listenerCount('connect').toLocaleString());
        return request.promise;
        // return request;
    }

    private _receive(newBuffer: Buffer) {
        debug('connection._receive()');
        let buffer: Buffer;
        if (this.residualBuffer.length > 0) {
            buffer = Buffer.concat([this.residualBuffer, newBuffer],
                this.residualBuffer.length + newBuffer.length);
        } else {
            buffer = newBuffer;
        }
        if (buffer.length < 24) {
            this.residualBuffer = buffer;
            return;
        }
        const totalResponseLength = 24 + buffer.readUInt32BE(8);
        if (buffer.length < totalResponseLength) {
            this.residualBuffer = buffer;
            return;
        }
        this.residualBuffer = NULL_BUFFER;

        const response = new MemcacheResponse(
            buffer.slice(0, totalResponseLength)
        );
        if (this.multiResponseOpCodes.indexOf(response.opcode) !== -1) {
            // multi responses (ex. stats)
            if (response.key.length === 0) {
                //  end with a empty key and value
                this.receive(this.multiResponse);
                this.multiResponse = [];
            } else {
                this.multiResponse.push(response);
            }
        } else {
            // single response
            this.receive(response);
        }
        if (buffer.length > totalResponseLength) {
            this._receive(buffer.slice(totalResponseLength));
        }
    }

    protected receive(response: MemcacheResponse | MemcacheResponse[]) {
        const firstResponse = Array.isArray(response) ? response[0] : response;
        debug('connection.receive():\n this.queue.length: %s' +
            '\n sendPointer: %s\n firstResponse.totalBodyLength: %s',
            this.queue.length.toLocaleString(),
            this.sendPointer.toLocaleString(),
            firstResponse.totalBodyLength.toLocaleString());
        const request = this.queue.shift();
        // adjust the sendPointer to reflect the adjusted this.queue size
        this.sendPointer--;
        if (request === undefined) {
            // If you encounter this error, please open an issue in GitHub. This
            // should never occur, but I guess it is technically possible. The
            // only other solution I can think of is to leverage the opaque
            // field of the Memcache Binary Protocol, and match every response
            // to its request. However the performance and maintenance
            // implications do not seem worth it at the time of this writing.
            const error = new MemcacheError({
                message: 'Received a response from Memcached, but do not have a matching request.',
                status: ERR_UNEXPECTED,
                response: firstResponse
            });
            console.error(error);
            this.destroy(error);
        }
        if (this.queue.length === 0) {
            // once this.queue is empty, this socket will _not_ keep the node
            // process running
            this.unref();
        }
        return request;
    }

    // net.Socket.ref() performs this check and will add a `connect` listener if
    // the _handle does not yet exist. This can create too many listeners and
    // trigger a max listeners exceeded warning.
    public ref() {
        if (this._handle) {
            debug('connection.ref()');
            super.ref();
        }
        return this;
    }

    // same goes for `unref`
    public unref() {
        if (this._handle) {
            debug('connection.unref()');
            super.unref();
        }
        return this;
    }

    public kill(error?: MemcacheError) {
        debug(`connection.kill() Error: ${error}`);
        this.killed = error || new MemcacheError({
            message: `Socket explicitly killed.`,
            status: ERR_CONNECTION,
        });
        for (const request of this.queue) {
            request.reject(this.killed);
        }
        this.queue = [];
        this.destroy(this.killed);
        this.emit('kill', this.killed);
    }

}