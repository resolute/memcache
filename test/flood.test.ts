import { TestOptions } from "./index.test";
import { key } from "../src/types";

export default async ({ memcache, port, portInvalid, namespace: key, floodify, randomString }: TestOptions) => {

    // test the flood!
    const mc1 = memcache({ port });
    const mc2 = memcache({ port });
    const mc3 = memcache({ port, compressIf: (key: key, value: Buffer) => value.length > 100 });
    const mc4 = memcache({ port });
    const mc5 = memcache({ port: portInvalid }); // invalid port (no server running here)

    await Promise.all([
        mc1.set(`${key}-1`, Buffer.from(randomString(1_000))),
        mc2.set(`${key}-2`, Buffer.from(randomString(1_048_576 + 400))), // a little over maxSizeValue
        mc3.set(`${key}-3`, Buffer.from(randomString(300_000))), // also over custom maxSizeValue
        mc4.set(`${key}-4`, Buffer.from(randomString(600_000))),
    ]);

    await Promise.all([
        floodify(100, () => mc1.get(`${key}-1`)),
        floodify(100, () => mc2.get(`${key}-2`)),
        floodify(100, () => mc3.get(`${key}-3`)),
        floodify(100, () => mc4.get(`${key}-4`)),
        floodify(100, () => mc5.set(`${key}-5`, 'bar')),
    ]);

}