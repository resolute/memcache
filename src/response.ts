export default class MemcacheResponse {
    private buffer: Buffer;
    private _key?: any;
    private _keySet?: boolean;
    private _value?: any;
    private _valueSet?: boolean;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    // header
    public get magic() { return this.buffer.readUInt8(0); }
    public get opcode() { return this.buffer.readUInt8(1); }
    public get keyLength() { return this.buffer.readUInt16BE(2); }
    public get extrasLength() { return this.buffer.readUInt8(4); }
    public get dataType() { return this.buffer.readUInt8(5); }
    public get status() { return this.buffer.readUInt16BE(6); }
    public get totalBodyLength() { return this.buffer.readUInt32BE(8); }
    public get opaque() { return this.buffer.readUInt32BE(12); }
    public get cas() { return this.buffer.slice(16, 24); }

    // body
    public get extras() { return this.buffer.slice(24, 24 + this.extrasLength); }
    public get flags() { return this.extrasLength >= 4 ? this.extras.readUInt32BE(0) : 0; }
    public get key() { return this._keySet ? this._key : this.rawKey }
    public set key(data) { this._key = data; this._keySet = true; }
    public get rawKey() { return this.buffer.slice(24 + this.extrasLength, 24 + this.extrasLength + this.keyLength); }
    public get value() { return this._valueSet ? this._value : this.rawValue }
    public set value(data) { this._value = data; this._valueSet = true; }
    public get rawValue() { return this.buffer.slice(24 + this.extrasLength + this.keyLength, 24 + this.totalBodyLength); }
}