import { strict as assert } from 'assert';
import { TestOptions } from './index.test';

export default async ({ memcache, port, namespace: key }: TestOptions) => {
    const { flush, set, get } = memcache({ port })

    await set(key, 'foo');
    await flush();

    try {
        await get(key);
    } catch (error) {
        assert.strictEqual(error.response.status, memcache.ERR_KEY_NOT_FOUND);
    }

}