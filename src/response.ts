class MemcacheResponse<T = unknown> {
  private buffer!: Buffer;
  private keyData?: any;
  private keySet?: boolean;
  private valueData?: any;
  private valueSet?: boolean;

  constructor(buffer: Buffer) {
    Object.defineProperties(this, {
      buffer: {
        value: buffer,
        writable: true,
      },
      keyData: {
        value: undefined,
        writable: true,
      },
      keySet: {
        value: false,
        writable: true,
      },
      valueData: {
        value: undefined,
        writable: true,
      },
      valueSet: {
        value: false,
        writable: true,
      },
    });
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
  public get extras() {
    return this.buffer.slice(24, 24 + this.extrasLength);
  }
  public get flags() {
    return this.extrasLength >= 4 ? this.extras.readUInt32BE(0) : 0;
  }
  public get key() {
    return this.keySet ? this.keyData : this.rawKey;
  }
  public set key(data) {
    this.keyData = data; this.keySet = true;
  }
  public get rawKey() {
    return this.buffer.slice(24 + this.extrasLength,
      24 + this.extrasLength + this.keyLength);
  }
  public get value(): T {
    return this.valueSet ? this.valueData : this.rawValue;
  }
  public set value(data) {
    this.valueData = data; this.valueSet = true;
  }
  public get rawValue() {
    return this.buffer.slice(24 + this.extrasLength + this.keyLength,
      24 + this.totalBodyLength);
  }
}

export = MemcacheResponse;
