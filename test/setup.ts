import { spawnServer, flappyServer } from './util';
import {
  server, path, port, portSasl, portFlappy, portFlush, saslConf, saslPwdb,
} from './env';

// runs once before all tests in suite
export = () => {
  // non-SASL server
  spawnServer(server, [`-p${port}`]);

  // SASL server
  spawnServer(server, [`-p${portSasl}`, '-S'], {
    SASL_CONF_PATH: saslConf,
    MEMCACHED_SASL_PWDB: saslPwdb,
  });

  // socket server
  spawnServer(server, [`-s${path}`]);

  // flapping server: goes up and down at random, but never longer than
  // `maxDelay`.
  const stopFlappyServer = flappyServer(() => spawnServer(server, [`-p${portFlappy}`]));
  process.on('exit', () => {
    stopFlappyServer();
  });

  // flush server: one server _just_ to test `flush` so that other tests are not
  // affected :)
  spawnServer(server, [`-p${portFlush}`]);
};
