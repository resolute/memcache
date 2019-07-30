import { strict as assert } from 'assert';
import { TestOptions } from './index.test';

export default async ({ memcache, port, namespace: key, floodify, randomString }: TestOptions) => {

    const { get, set, replace } = memcache({ port });

    // generate 5,000 random strings of varying lengths
    const truth = Array(2_000).fill('').map(() => randomString(~~(Math.random() * 10_000)));

    await Promise.all(truth.map((value, index) => set(`${key}-${index}`, value)));

    const getAndVerifyRandomTruth = async () => {
        const index = ~~(Math.random() * truth.length);
        const { value } = await get(`${key}-${index}`);
        assert.strictEqual(value, truth[index]);
    }

    const replaceRandomTruth = async () => {
        const index = ~~(Math.random() * truth.length);
        await replace(`${key}-${index}`, truth[index]);
    }

    const delay = (fn: Function, milliseconds: number) => new Promise((resolve, reject) => {
        setTimeout(fn().then(resolve, reject), milliseconds);
    });

    const chaos = () => {
        const random = Math.random();
        // 10% of the time perform a replace; 90% do a get
        if (random % 9 === 0) {
            return delay(replaceRandomTruth, random * 100);
        } else {
            return delay(getAndVerifyRandomTruth, random * 100);
        }
    };

    await Promise.all([
        floodify(1_000, chaos),
        floodify(1_000, chaos),
        floodify(1_000, chaos),
        floodify(1_000, chaos),
        floodify(1_000, chaos),
    ]);

}