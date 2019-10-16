import { spawnServer, flappyServer } from './util';
import {
  server, path, port, portSasl, portFlappy, portFlush, saslConf, saslPwdb, user,
} from './env';

// runs once before all tests in suite
export = () => {
  // non-SASL server
  spawnServer(server, [`-u${user}`, `-p${port}`]);

  // SASL server
  spawnServer(server, [`-u${user}`, `-p${portSasl}`, '-S'], {
    SASL_CONF_PATH: saslConf,
    MEMCACHED_SASL_PWDB: saslPwdb,
  });

  // socket server
  spawnServer(server, [`-u${user}`, `-s${path}`]);

  // flapping server: goes up and down at random, but never longer than
  // `maxDelay`.
  const stopFlappyServer = flappyServer(() => spawnServer(server, [`-u${user}`, `-p${portFlappy}`]));
  process.on('exit', () => {
    stopFlappyServer();
  });

  // flush server: one server _just_ to test `flush` so that other tests are not
  // affected :)
  spawnServer(server, [`-u${user}`, `-p${portFlush}`]);
};
