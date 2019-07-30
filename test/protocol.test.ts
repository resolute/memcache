import { strict as assert } from 'assert';
import { TestOptions } from './index.test';

const value = 'bar';

export default async ({ memcache, port, portInvalid, namespace: key }: TestOptions) => {

    const { del, add, replace, set, get, version } = memcache({
        port,
        maxKeySize: key.length,
        maxValueSize: 4
    });

    // `add` success only when key _does not_ exist
    await add(key, value);

    // `replace` success only when key exist
    await replace(key, value);

    // `get` success when key exists
    assert.strictEqual((await get(key)).value, value);

    // `del` success only when key exists
    await del(key);

    // `del` fails if key _does not_ exist
    await assert.rejects(del(key));

    // `replace` fails if key _does not_ exist
    await assert.rejects(replace(key, value));

    // `get` fails when key _does not_ exist
    await assert.rejects(get(key));

    // `add` fails if key exists
    await set(key, value);
    await assert.rejects(add(key, value));

    // fail for invalid key
    await assert.rejects(set('', value));

    // key too large
    await assert.rejects(set(`${key}-overflow`, value));

    // value too large
    await assert.rejects(replace(key, `${value}-overflow`));

    assert.strictEqual(/^\d+\.\d+\.\d+/.test(await version()), true);

    // test stat commands
    {
        const { stat } = memcache({ port });

        // how should this be tested?
        await stat();
        await stat('items');
        await stat('slabs');
        await stat('settings');
        await stat('sizes');
    }

    // test commandTimeout
    {
        const { set } = memcache({ commandTimeout: 100, port: portInvalid });
        await assert.rejects(set(key, 'bar'), { status: memcache.ERR_TIMEOUT });
    }

}