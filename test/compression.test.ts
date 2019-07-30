import { strict as assert } from 'assert';
import { promisify } from 'util';
import { brotliCompress, brotliDecompress } from 'zlib';
import MemcacheResponse from '../lib/response';
import { TestOptions } from './index.test';
import { key } from '../lib/types';

export default async ({ memcache, port, namespace: key, randomString }: TestOptions) => {

    // test ZLIB with cas
    {
        let response: MemcacheResponse;
        const compressionFlag = 1 << 0;
        const { set, gat, get } = memcache({ port, compressionOptions: { gzipLevel: 6 }, compressionFlag, compressIf: (key: key, value: Buffer) => value.length > 3 });
        response = await set(key, 'bar', 10);
        response = await gat(key, 10);
        assert.strictEqual(response.value, 'bar');
        assert.strictEqual(response.flags & compressionFlag, 0);
        const myString = randomString(1_048_576 + 400); // just a little over maxValueSize
        response = await set(key, myString, { ttl: 10, cas: response.cas });
        response = await get(key);
        assert.strictEqual(response.value, myString);
        assert.strictEqual(response.flags & compressionFlag, compressionFlag);
    }

    // test alternative compression library
    {
        let response: MemcacheResponse;
        const compressionFlag = 1 << 6;
        const { set, get } = memcache({
            compress: promisify(brotliCompress),
            decompress: promisify(brotliDecompress),
            compressionFlag
        });
        const myString = randomString(1_048_576 + 400); // just a little over maxValueSize
        response = await set(key, myString, { ttl: 10 });
        response = await get(key);
        assert.strictEqual(response.value, myString);
        assert.strictEqual(response.flags & compressionFlag, compressionFlag);
    }

}