import { strict as assert } from 'assert';
import { TestOptions } from './index.test';
import MemcacheResponse from '../lib/response';

const value = 'bar';
const test = ({ cas }: { cas: Buffer }) => {
    assert.notStrictEqual(cas.compare(Buffer.alloc(8, 0)), 0);
}

export default async ({ memcache, port, namespace: key }: TestOptions) => {

    const { del, get, add, replace, set, append, prepend, incr, decr } = memcache({ port });

    test(await add(key, value));
    test(await replace(key, value));
    test(await append(key, 'a'));
    test(await prepend(key, 'a'));
    test(await set(key, 1));
    test(await incr(key, 1));
    test(await decr(key, 1));
    test(await get(key));
    // `del` does not provide a CAS
    assert.strictEqual((await del(key)).cas.compare(Buffer.alloc(8, 0)), 0);

    // test that an invalid cas throws ERR_KEY_EXISTS
    {
        let response: MemcacheResponse;
        const keyNegativeTest = `${key}-negative-test`;
        response = await set(keyNegativeTest, 'foo');
        await set(keyNegativeTest, 'bar'); // rogue process set this, oh no!
        await assert.rejects(set(keyNegativeTest, 'baz', { cas: response }),
            { status: memcache.ERR_KEY_EXISTS });
        assert.strictEqual((await get(keyNegativeTest)).value, 'bar');
    }
}