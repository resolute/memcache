/* eslint-disable max-len */
import { SocketConnectOpts } from 'net';
import { MemcacheOptions, CommandCallback } from './types';

import net = require('net');
import util = require('util');

import MemcacheRequest = require('./request');
import MemcacheResponse = require('./response');
import MemcacheError = require('./error');
import MemcacheUtil = require('./util');

const debug = util.debuglog('memcache:connection');

class Connection extends net.Socket {
  // config
  public readonly host = '127.0.0.1';
  public readonly port = 11211;
  public readonly path?: string;
  public readonly queueSize = Infinity;
  public readonly commandTimeout = 4_000;
  public readonly multiResponseOpCodes = [0x10]; // [stat]

  // keepalive config
  public readonly connectTimeout = 2_000; // milliseconds .connect() may take
  public readonly retries = Infinity; // connection attempts before marked dead
  public readonly minDelay = 1000; // milliseconds
  public readonly maxDelay = 30_000; // milliseconds
  public readonly backoff = (attempt: number) => attempt * this.minDelay; // incremental backoff

  // sasl config (coerced to undefined if server responds ERR_UNKNOWN_COMMAND)
  public username?: string;
  public password?: string;

  // protected state
  protected queue: [MemcacheRequest, CommandCallback<any>, NodeJS.Timer | undefined][] = [];
  protected killed: MemcacheError | false = false;

  // private state
  private writeBufferAvailable = true;
  private sendPointer = 0;
  private residualBuffer?: Buffer;
  private multiResponse: MemcacheResponse[] = [];
  private connectTimer?: NodeJS.Timer;
  private attempt = 1;
  private _handle: any; // from Node’s internal `net` module

  constructor({
    host, port, path, queueSize, commandTimeout, connectTimeout,
    minDelay, maxDelay, retries, backoff, username, password,
    multiResponseOpCodes,
  }: Partial<MemcacheOptions>) {
    super();

    MemcacheUtil.extendIfDefined(this, {
      host,
      port,
      path,
      queueSize,
      commandTimeout,
      connectTimeout,
      retries,
      minDelay,
      maxDelay,
      backoff,
      username,
      password,
      multiResponseOpCodes,
    });

    this

      .on('connect', () => {
        debug('on("connect")');
        clearTimeout(this.connectTimer!);
        this.connectTimer = undefined;
        this.attempt = 1;
        this.residualBuffer = undefined;
        this.unref();
        this.drain();
      })

      .on('ready', () => {
        debug('on("ready")');
        this.ref();
        this.drain();
      })

      .on('drain', () => {
        debug('on("drain")');
        this.writeBufferAvailable = true;
        this.ref();
        this.drain();
      })

      .on('data', this.receive.bind(this))

      // attach a hollow handler so that exception isn’t thrown
      .on('error', debug)

      .on('close', () => {
        debug('on("close") attempt %s of %s',
          this.attempt.toLocaleString(),
          this.retries.toLocaleString());
        this.sendPointer = 0;
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = undefined;
        }
        if (this.attempt >= this.retries) {
          this.kill(new MemcacheError({
            message: `Failed to connect to ${this.socketConnectString} after ${this.attempt.toLocaleString()} attempt${this.attempt !== 1 ? 's' : /* istanbul ignore next */ ''}.`,
            status: MemcacheError.ERR_CONNECTION,
          }));
          return;
        }
        // Only retry if the connection has not been `kill()`ed.
        /* istanbul ignore else */
        if (this.killed === false) {
          const delay = Math.min(this.maxDelay, this.backoff(this.attempt));
          this.attempt += 1;
          debug('retry in %s ms', delay.toLocaleString());
          // Retry this.connect() after backoff milliseconds. Similarly to the
          // connect timer, the retry timer should never prevent the Node
          // process from terminating.
          setTimeout(
            this.connect.bind(this),
            delay,
          ).unref();
        }
      })

      .setNoDelay(true)

      .setKeepAlive(true);

    // Defer this.connect() so that extending classes may finish their
    // constructor execution.
    process.nextTick(this.connect.bind(this));
  }

  public connect() {
    debug('connect(%s)', this.socketConnectString);
    // The connect timer is unref()’d as it should never keep the Node process
    // from terminating by itself.
    this.connectTimer = setTimeout(
      () => {
        debug('`connectTimer` expired');
        this.destroy(new MemcacheError({
          message: `Connection to ${this.socketConnectString} exceeded ${this.connectTimeout.toLocaleString()} ms timeout.`,
          status: MemcacheError.ERR_CONNECTION,
        }));
      },
      this.connectTimeout,
    ).unref();

    // frontload our auth request if not already in front
    if (
      this.username &&
      this.password && (
        this.queue.length === 0 ||
        this.queue[0][0].buffer.readUInt8(1) !== 0x21 // sasl
      )
    ) {
      debug('sasl frontload on send queue');
      // Does _not_ use the `commandTimeout`, because user is not
      // depending on this command explicitly. Instead, user commands will
      // timeout independently and this SASL auth command will also never
      // keep the Node process running by itself.
      const request = new MemcacheRequest({
        opcode: 0x21,
        key: Buffer.from('PLAIN'),
        value: Buffer.from(`\x00${this.username}\x00${this.password}`),
      });
      const callback = (error?: MemcacheError) => {
        if (!error) {
          return;
        }
        // It is possible that the user supplied a username/password, but the
        // server is _not_ compiled with SASL support. In this case, we 1) log a
        // warning, 2) zero out the username and password, 3) allow future
        // commands to proceed.
        if (error.status === MemcacheError.ERR_UNKNOWN_COMMAND) {
          debug('sasl not supported by server, disabling sasl on the client');
          process.emitWarning(`server at ${this.socketConnectString} does not support SASL. Disabling SASL on the client.`, 'MemcacheWarning');
          this.username = undefined;
          this.password = undefined;
        } else {
          this.kill(error);
        }
      };
      this.queue.unshift([request, callback, undefined]);
    }

    return super.connect(this.socketConnectOptions);
  }

  public drain() {
    debug('drain(): queue.length=%s sendPointer=%s',
      this.queue.length.toLocaleString(),
      this.sendPointer.toLocaleString());
    if (
      this.sendPointer >= this.queue.length ||
      !this.writeBufferAvailable ||
      !this.writable
    ) {
      return;
    }
    const [request] = this.queue[this.sendPointer];
    this.writeBufferAvailable = this.write(request.buffer);
    this.sendPointer += 1;
    this.drain();
  }

  // public send<R extends MemcacheRequest, S extends MemcacheResponse | MemcacheResponse[]>(request: R, callback: CommandCallback<S>) {
  // public send<R, S>(request: R, callback: CommandCallback<S>) {
  public send<T>(request: MemcacheRequest, callback: CommandCallback<MemcacheResponse<T> | MemcacheResponse<T>[]>) {
    debug("send()\nthis.listenerCount('connect')=%s\nthis.queue.length = %s + 1\nrequest: %s",
      this.listenerCount('connect').toLocaleString(),
      this.queue.length.toLocaleString(),
      request);
    if (this.killed !== false) {
      callback({ ...this.killed, request });
      return;
    }
    if (this.queue.length >= this.queueSize) {
      callback(new MemcacheError({
        message: `queueSize ${this.queueSize.toLocaleString()} exceeded`,
        status: MemcacheError.ERR_CONNECTION,
        request,
      }));
      return;
    }
    const timer = setTimeout(() => {
      callback(new MemcacheError({
        message: `commandTimeout (${this.commandTimeout.toLocaleString()} ms) exceeded.`,
        status: MemcacheError.ERR_CONNECTION,
        request,
      }));
    }, this.commandTimeout);
    this.queue.push([request, callback, timer]);
    this.ref();
    this.drain();
  }

  protected receive(newBuffer: Buffer) {
    // Rules for `newBuffer` and `this.residualBuffer`
    // 1. _Always_ marks first byte of a response or is empty.
    // 2. May contain less than, exactly, or more than one response.
    let bufferLength = newBuffer.length;
    let buffer = newBuffer;
    if (this.residualBuffer) {
      bufferLength += this.residualBuffer.length;
      buffer = Buffer.concat([this.residualBuffer, newBuffer],
        bufferLength);
    }
    if (buffer.length < 24) {
      // not large enough to contain a response header
      this.residualBuffer = buffer;
      return;
    }
    const responseLength = 24 + buffer.readUInt32BE(8);
    if (buffer.length < responseLength) {
      // not a full response
      this.residualBuffer = buffer;
      return;
    }
    this.residualBuffer = undefined;
    const response = new MemcacheResponse(
      buffer.slice(0, responseLength),
    );
    if (this.multiResponseOpCodes.indexOf(response.opcode) !== -1) {
      // multi responses (ex. stat)
      if (response.key.length === 0) {
        // end with a empty key and value
        this.respond(this.multiResponse);
        this.multiResponse = [];
      } else {
        this.multiResponse.push(response);
      }
    } else {
      // single response
      this.respond(response);
    }
    this.receive(buffer.slice(responseLength));
  }

  protected respond(response: MemcacheResponse<any> | MemcacheResponse<any>[]) {
    const firstResponse = Array.isArray(response) ? response[0] : response;
    debug('receive():\nthis.queue.length: %s\nsendPointer: %s\nfirstResponse.totalBodyLength: %s',
      this.queue.length.toLocaleString(),
      this.sendPointer.toLocaleString(),
      firstResponse && firstResponse.totalBodyLength.toLocaleString());
    const responder = this.queue.shift();
    // adjust the sendPointer to reflect the adjusted this.queue size
    this.sendPointer -= 1;
    // Once this.queue is empty, this socket will _not_ keep the node process
    // running. this.unref() will only unref the connection if this.queue.length
    // === 0 and the connection is actually active.
    this.unref();
    /* istanbul ignore next */
    if (typeof responder === 'undefined') {
      // If you encounter this error, please open an issue in GitHub. This
      // should never occur, but I guess it is technically possible. The only
      // other solution I can think of is to leverage the opaque field of the
      // Memcache Binary Protocol, and match every response to its request.
      // However the performance and maintenance implications do not seem worth
      // it at the time of this writing.
      /* istanbul ignore next */
      const error = new MemcacheError({
        message: 'Received a response from server, but do not have a matching request.\nPlease file a issue for this at https://github.com/resolute/memcache/issues',
        status: MemcacheError.ERR_UNEXPECTED,
        response: firstResponse,
      });
      /* istanbul ignore next */
      this.kill(error);
      // eslint-disable-next-line no-console
      /* istanbul ignore next */ console.error(error);
      // eslint-disable-next-line no-console
      /* istanbul ignore next */ console.error(`response.opcode: ${firstResponse.opcode}`);
      // eslint-disable-next-line no-console
      /* istanbul ignore next */ console.error(`response.status: ${firstResponse.status}`);
      // eslint-disable-next-line no-console
      /* istanbul ignore next */ console.error(`response.value: ${firstResponse.value}`);
      /* istanbul ignore next */
      return;
    }
    const [request, callback, timer] = responder;
    if (timer) {
      clearTimeout(timer);
    }
    if (firstResponse && firstResponse.status === 0) {
      callback(undefined, response);
    } else {
      callback(new MemcacheError({ request, response: firstResponse }));
    }
  }

  // net.Socket.ref() performs this check and will add a `connect` listener if
  // the _handle does not yet exist. This can create too many listeners and
  // trigger a max listeners exceeded warning.
  public ref() {
    // eslint-disable-next-line no-underscore-dangle
    if (this._handle && this.sendPointer < this.queue.length) {
      debug('ref()');
      super.ref();
    }
    return this;
  }

  // same goes for `unref`
  public unref() {
    // eslint-disable-next-line no-underscore-dangle
    if (this._handle && this.queue.length === 0) {
      debug('unref()');
      super.unref();
    }
    return this;
  }

  public kill(error?: MemcacheError) {
    debug('kill(%s)', error);
    this.killed = error || new MemcacheError({
      message: 'Socket explicitly killed.',
      status: MemcacheError.ERR_CONNECTION,
    });
    // eslint-disable-next-line no-restricted-syntax
    for (const [request, callback] of this.queue) {
      callback({ ...this.killed, request });
    }
    this.destroy(this.killed);
    this.emit('kill', this.killed);
    process.nextTick(() => { this.queue = []; });
  }

  public get socketConnectOptions(): SocketConnectOpts {
    if (typeof this.path === 'string' && this.path.length > 0) {
      return { path: this.path };
    }
    return { host: this.host, port: this.port };
  }

  public get socketConnectString() {
    if (typeof this.path === 'string' && this.path.length > 0) {
      return this.path;
    }
    return `${this.host}:${this.port}`;
  }
}

export = Connection;
