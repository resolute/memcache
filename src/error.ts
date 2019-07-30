import MemcacheRequest from './request';
import MemcacheResponse from './response';
import { extendIfDefined } from './util';

export const ERR_KEY_NOT_FOUND = 0x0001;
export const ERR_KEY_EXISTS = 0x0002;
export const ERR_VALUE_TOO_LARGE = 0x0003;
export const ERR_INVALID_ARGUMENTS = 0x0004;
export const ERR_ITEM_NOT_STORED = 0x0005;
export const ERR_INCR_DECR_ON_NON_NUMERIC_VALUE = 0x0006;
export const ERR_THE_VBUCKET_BELONGS_TO_ANOTHER_SERVER = 0x0007;
export const ERR_AUTHENTICATION_ERROR = 0x0008;
export const ERR_AUTHENTICATION_CONTINUE = 0x0009;
export const ERR_AUTHENTICATION_FAILED = 0x0020; // added because Memcached will respond with this on failed auth
export const ERR_UNKNOWN_COMMAND = 0x0081;
export const ERR_OUT_OF_MEMORY = 0x0082;
export const ERR_NOT_SUPPORTED = 0x0083;
export const ERR_INTERNAL_ERROR = 0x0084;
export const ERR_BUSY = 0x0085;
export const ERR_TEMPORARY_FAILURE = 0x0086;
export const ERR_UNEXPECTED = 0x0100;
export const ERR_CONNECTION = 0x0101;
export const ERR_QUEUE_FULL = 0x0102;
export const ERR_TIMEOUT = 0x0103;
export const ERR_INVALID_KEY = 0x0104;
export const ERR_INVALID_VALUE = 0x0105;
export const ERR_COMPRESSION = 0x0106;
export const ERR_JSON = 0x0107;

export const ErrorCodes = {
    ERR_KEY_NOT_FOUND,
    ERR_KEY_EXISTS,
    ERR_VALUE_TOO_LARGE,
    ERR_INVALID_ARGUMENTS,
    ERR_ITEM_NOT_STORED,
    ERR_INCR_DECR_ON_NON_NUMERIC_VALUE,
    ERR_THE_VBUCKET_BELONGS_TO_ANOTHER_SERVER,
    ERR_AUTHENTICATION_ERROR,
    ERR_AUTHENTICATION_CONTINUE,
    ERR_AUTHENTICATION_FAILED,
    ERR_UNKNOWN_COMMAND,
    ERR_OUT_OF_MEMORY,
    ERR_NOT_SUPPORTED,
    ERR_INTERNAL_ERROR,
    ERR_BUSY,
    ERR_TEMPORARY_FAILURE,
    ERR_UNEXPECTED,
    ERR_CONNECTION,
    ERR_QUEUE_FULL,
    ERR_TIMEOUT,
    ERR_INVALID_KEY,
    ERR_INVALID_VALUE,
    ERR_COMPRESSION,
    ERR_JSON,
}

const parseMessage = (message?: string, response?: MemcacheResponse) => {
    let msg = 'Unexpected error';
    if (message) {
        msg = message;
    } else if (response && response.status > 0) {
        // if Memcached responds with custom error status / message
        msg = response.value.toString();
    }
    return msg;
}

export default class MemcacheError extends Error {
    public status: number = ERR_UNEXPECTED; // Unexpected error
    public type: 'client' | 'server' = 'server';
    public request?: MemcacheRequest;
    public response?: MemcacheResponse;
    public error?: Error;

    constructor({
        message, status, request, response, error }: {
            message?: string,
            status?: number,
            request?: MemcacheRequest,
            response?: MemcacheResponse,
            error?: Error
        }) {

        super(parseMessage(message, response));

        if (typeof status === 'number') {
            this.status = status;
        } else if (response) {
            this.status = response.status;
        }

        if (this.status >= 0x100) {
            this.type = 'client';
        }

        extendIfDefined(this, { request, response, error });
    }
}