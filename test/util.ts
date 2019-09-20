import { spawn } from 'child_process';

export const spawnServer = (cmd: string, args: string[], env?: {}) => {
  const server = spawn(cmd, args, { env })
    .on('error', (error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      server.kill();
      process.exit(1);
    });
  process.on('exit', () => {
    server.kill();
  });
  return server;
};

export const flappyServer = (create: (() => ReturnType<typeof spawnServer>)) => {
  let stop = false;
  const loop = () => {
    setTimeout(() => {
      const server = create();
      setTimeout(() => {
        server.kill();
        if (!stop) {
          loop();
        }
      }, Math.floor(100 + 700 * Math.random()));
    }, Math.floor(50 + 100 * Math.random()));
  };
  loop();
  return () => {
    stop = true;
  };
};

export const randomString = (length: number) => {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export const floodify = (length: number, fn: (...args: any[]) => Promise<any>) =>
  Promise.all(Array(length).fill(fn).map((fn) => fn()
    .then(() => true)
    .catch(() => false)))
    .then((responses) => {
      const success = responses.filter((r) => r).length;
      const failure = responses.filter((r) => !r).length;
      // eslint-disable-next-line max-len
      // console.log(`Flood: resolved (${success.toLocaleString()}) rejected (${failure.toLocaleString()})`);
      return { success, failure };
    });

export const trickle = async ({
  duration = 1_000, upper = 100, lower = 10, fn = () => { },
}) => {
  const responses = [];
  const starttime = process.hrtime();
  const milliseconds = () => {
    const [seconds, nanoseconds] = process.hrtime(starttime);
    return ~~(seconds * 1000 + nanoseconds / 1e6);
  };
  do {
    responses.push(
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(fn());
        }, Math.min(
          duration - milliseconds(), // time remaining
          Math.floor(lower + (upper - lower) * Math.random()),
        ));
      }),
    );
  } while (milliseconds() < duration);
  return responses;
};
