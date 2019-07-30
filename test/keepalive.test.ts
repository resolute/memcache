import { strict as assert } from 'assert';
import { TestOptions } from './index.test';

export default async ({ memcache, port, portInvalid, namespace: key, spawnServer, flakyServer, floodify, trickle }: TestOptions) => {

    const tests: Promise<any>[] = [];

    // Establish a flaky server that goes up and down at random, but never
    // longer than maxDelay. Run tests against that server and confirm
    // that all commands run successfully.
    {
        const portFlaky = 11214;
        const timeout = 5_000;
        const stopFlakyServer = flakyServer(() => spawnServer([`-p${portFlaky}`]));

        // Create client before bringing up server
        const { set: setFlaky } = memcache({
            port: portFlaky,
            timeout,
            minDelay: 100,
            maxDelay: 30_000,
            connectTimeout: 2_000,
            retries: Infinity,
        });

        // `set` should succeed eventually
        assert.strictEqual((await setFlaky(key, 'bar')).status, 0);

        // start a flood
        tests.push(
            trickle({
                duration: 5_000,
                upper: 100,
                lower: 10,
                fn: () => floodify(1_000, async () => {
                    const { status } = await setFlaky(key, 'bar');
                    assert.strictEqual(status, 0);
                }),
            })
                // kill-off the server
                .finally(stopFlakyServer)
        );

    }

    // test `retries` of finite integer
    {
        const cache = memcache({
            port: portInvalid,
            retries: 3,
            connectTimeout: 1_000,
            minDelay: 100,
            maxDelay: 2_000,
        });
        tests.push(assert.rejects(new Promise((resolve, reject) => {
            cache.on('kill', reject);
        }), { status: memcache.ERR_CONNECTION }));
    }

    // test manual `.kill()` termination
    {
        const cache = memcache({ port });
        tests.push(assert.rejects(new Promise((resolve, reject) => {
            cache.on('kill', reject);
        }), { status: memcache.ERR_CONNECTION }));
        await cache.set(key, 'bar');
        cache.kill();
        tests.push(assert.rejects(cache.set(key, 'bar'), { status: memcache.ERR_CONNECTION }));
    }

    await Promise.all(tests);
}