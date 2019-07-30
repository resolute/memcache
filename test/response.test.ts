import { strict as assert } from 'assert';
import MemcacheResponse from '../lib/response';
import { TestOptions } from './index.test';

export default async ({ memcache, port, namespace: key }: TestOptions) => {

    const { get, set } = memcache({ port });

    // test response object
    let response: MemcacheResponse;
    response = await set(key, 'bar');
    assert.strictEqual(response.flags, 0)
    response = await get(key);
    assert.strictEqual(response.magic, 0x81);
    assert.strictEqual(response.opcode, 0x00);
    assert.strictEqual(response.dataType, 0x00);
    assert.strictEqual(response.opaque, 0x00);
    assert.strictEqual(response.key.length, 0);

}