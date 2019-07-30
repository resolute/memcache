import { strict as assert } from 'assert';
import { TestOptions } from './index.test';

export default async ({ memcache, port, portSasl, namespace, username, password }: TestOptions) => {
    const key = Buffer.from(namespace);
    const value = Buffer.from('foo');

    // permutations of sasl
    // | #  | server | client | result |
    // |----|--------|--------|--------|
    // | 1. | yes    | yes    | ok     |
    // | 2. | no     | no     | ok     |
    // | 3. | yes    | no     | fail   | * cannot test if sasl module is always included
    // | 4. | no     | yes    | ok     |
    // | 5. | yes    | yes*   | fail   |
    // |----|--------|--------|--------|
    // * yes, but invalid credentials

    const test1 = memcache({
        port: portSasl,
        username,
        password,
    });
    const test2 = memcache({
        port,
    });
    const test3 = memcache({
        port: portSasl,
        sasl: false,
    });
    const test4 = memcache({
        port,
        username,
        password,
    });
    const test5 = memcache({
        port: portSasl,
        username,
        password: 'X',
    });

    await Promise.all([
        test1.set(key, value),
        test2.set(key, value),
        assert.rejects(test3.set(key, value)),
        test4.set(key, value),
        assert.rejects(test5.set(key, value)),
    ]);
}