import { strict as assert } from 'assert';
import MemcacheResponse from '../lib/response';
import { TestOptions } from './index.test';

export default async ({ memcache, port, namespace: key }: TestOptions) => {

    const stringFlag = 1 << 4;
    const { set, get, append, prepend } = memcache({ port, stringFlag });

    let response: MemcacheResponse;

    // test string with cas
    {

        response = await set(key, 'bar', 10);
        response = await get(key);
        assert.strictEqual(response.value, 'bar');
        response = await set(key, 'baz', { ttl: 10, cas: response.cas });
        response = await get(key);
        assert.strictEqual(response.value, 'baz');
        assert.rejects(set(key, 'never should get set', { ttl: 10, cas: Buffer.alloc(8, 1) }));
        response = await get(key);
        assert.strictEqual(response.value, 'baz');
    }

    // test append/prepend
    {
        let response: MemcacheResponse;
        response = await set(key, 'b', { ttl: 10 });
        response = await prepend(key, 'a');
        response = await append(key, 'c', response.cas);
        response = await get(key);
        assert.strictEqual(response.flags & stringFlag, stringFlag);
        assert.strictEqual(response.value, 'abc');
    }


    // test append/prepend would fail without `string` module
    {
        const { set, get, append, prepend } = memcache({ port, string: false });
        let response: MemcacheResponse;
        response = await set(key, 'b', { ttl: 10 });
        response = await prepend(key, 'a');
        response = await append(key, 'c', response.cas);
        try {
            // will fail with JSON.parse() error
            await get(key);
        } catch (error) {
            assert.strictEqual(error.status, memcache.ERR_JSON);
            assert.strictEqual(error.response.flags & stringFlag, 0);
            assert.notStrictEqual(error.response.value.toString(), 'abc');
        }
    }

}