import { strict as assert } from 'assert';
import MemcacheResponse from '../lib/response';
import { TestOptions } from './index.test';

export default async ({ memcache, port, namespace: key }: TestOptions) => {

    const jsonFlag = 1 << 1;
    const stringFlag = 1 << 4;
    const { set, get } = memcache({ port, jsonFlag, stringFlag })

    let response: MemcacheResponse;

    response = await set(key, { foo: 'bar' }, 10);
    response = await get(key);
    assert.deepStrictEqual(response.value, { foo: 'bar' });

    response = await set(key, 1, { ttl: 10, cas: response });
    response = await get(key);
    assert.strictEqual(response.value, 1);

    response = await set(key, null, { ttl: 10, cas: response.cas });
    response = await get(key);
    assert.strictEqual(response.value, null);

    response = await set(key, undefined, { ttl: 10, cas: response.cas });
    response = await get(key);
    assert.strictEqual(response.value, undefined);

    response = await set(key, false, { ttl: 10, cas: response.cas });
    response = await get(key);
    assert.strictEqual(response.value, false);

    // This test would fail if the string serializer were disabled!
    response = await set(key, '1', { ttl: 10, cas: response.cas });
    response = await get(key);
    assert.strictEqual(response.value, '1');
    assert.strictEqual(response.flags & stringFlag, stringFlag);
    assert.strictEqual(response.flags & jsonFlag, 0);

    response = await set(key, '', { ttl: 10, cas: response.cas });
    response = await get(key);
    assert.strictEqual(response.value, '');
    assert.strictEqual(response.flags & stringFlag, stringFlag);
    assert.strictEqual(response.flags & jsonFlag, 0);

    // TODO: add tests for `json` module _without_ `string`

}