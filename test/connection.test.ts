import { strict as assert } from 'assert';
import { TestOptions } from './index.test';

export default async ({ memcache, port, namespace: key, spawnServer, socketPath: path }: TestOptions) => {

    // test connectTimeout
    {
        const { set } = memcache({ connectTimeout: 100, host: '1.1.1.1', port: 11211 });
        await assert.rejects(set(key, 'bar'), { status: memcache.ERR_TIMEOUT });
    }

    // test queueSize
    {
        const { set } = memcache({ queueSize: 1, port });
        await assert.rejects(Promise.all([
            set(key, 'bar'),
            set(key, 'bar'),
        ]), { status: memcache.ERR_QUEUE_FULL });
    }

    // test unix socket
    {
        spawnServer([`-s${path}`]);
        const { set, get } = memcache({ path });
        await set(`${key}-socket`, 'foo');
        assert.strictEqual((await get(`${key}-socket`)).value, 'foo');
    }

}