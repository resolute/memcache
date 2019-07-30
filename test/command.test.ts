import { strict as assert } from 'assert';
import MemcacheResponse from '../lib/response';
import MemcacheError from '../lib/error';
import { TestOptions } from './index.test';

export default async ({ memcache, port, namespace: key }: TestOptions) => {

    const { set, touch, gat, get, incr, decr, del } = memcache({ port });

    let response: MemcacheResponse;

    // test touch/gat
    await set(key, 'bar');
    await touch(key, 10);
    await gat(key, 10);


    // test set with cas
    {
        response = await set(key, 'bar', 10);
        response = await get(key);
        assert.strictEqual(response.value.toString(), 'bar');
        // confirm non-empty CAS
        assert.notStrictEqual(response.cas.compare(Buffer.alloc(8, 0)), 0);
        response = await set(key, 'baz', { ttl: 10, cas: response.cas });
        response = await get(key);
        assert.strictEqual(response.value.toString(), 'baz');
        // phony CAS
        assert.rejects(set(key, 'never should get set', { ttl: 10, cas: Buffer.alloc(8, 1) }));
        response = await get(key);
        assert.strictEqual(response.value.toString(), 'baz');
    }

    // test ttl
    {
        response = await set(key, 'bar', new Date(new Date().valueOf() + 2000));
        response = await get(key);
        assert.strictEqual(response.value, 'bar');
        await assert.rejects(new Promise((resolve, reject) => { setTimeout(() => { get(key).then(resolve, reject) }, 3000) }));
    }

    // test incr/decr
    assert.strictEqual(await del(key).catch((error: MemcacheError) => error.status), memcache.ERR_KEY_NOT_FOUND);
    // When using `incr`/`decr` with implicit `initial: 0`
    response = await incr(key, 1);
    response = await get(key);
    assert.strictEqual(response.value.toString(), '0');
    await del(key);
    // When using `incr`/`decr` with `initial` no flags are set. So, response.value will be the buffer.
    response = await incr(key, 1, { ttl: 10, initial: 1 });
    assert.notStrictEqual(response.value, 1);
    // If you `set` first, then flag for JSON will be set and since value is a number, `incr`/`decr` will not alter these flags.
    response = await set(key, 1);
    // confirm non-empty CAS
    assert.notStrictEqual(response.cas.compare(Buffer.alloc(8, 0)), 0);
    response = await incr(key, 1, { ttl: 10, cas: response.cas });
    response = await get(key);
    assert.strictEqual(response.value, 2);
    response = await decr(key, 1, { ttl: 10, cas: response.cas });
    response = await get(key);
    assert.strictEqual(response.value.toString(), '1');

}