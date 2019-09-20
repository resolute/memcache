process.title = 'memcache-test';

process.setMaxListeners(20);

export const port = process.env.MEMCACHED_PORT ?
  parseInt(process.env.MEMCACHED_PORT, 10) :
  11212;

export const portSasl = process.env.MEMCACHED_PORT_SASL ?
  parseInt(process.env.MEMCACHED_PORT_SASL, 10) :
  11213;

export const portFlappy = process.env.MEMCACHED_PORT_FLAPPY ?
  parseInt(process.env.MEMCACHED_PORT_FLAPPY, 10) :
  11214;

export const portFlush = process.env.MEMCACHED_PORT_FLUSH ?
  parseInt(process.env.MEMCACHED_PORT_FLUSH, 10) :
  11215;

// nothing should listen to this port
export const portInvalid = process.env.MEMCACHED_PORT_INVALID ?
  parseInt(process.env.MEMCACHED_PORT_INVALID, 10) :
  11111;

export const path = process.env.MEMCACHED_SOCKET || './memcached-latest/memcached.sock';

export const server = process.env.MEMCACHED_PATH || './memcached-latest/memcached';

export const saslConf = process.env.SASL_CONF_PATH || './memcached-latest/memcached.conf';

export const saslPwdb = process.env.MEMCACHED_SASL_PWDB || './memcached-latest/memcached-sasl-pwdb';

export const username = process.env.MEMCACHED_USERNAME || 'foo@bar';

export const password = process.env.MEMCACHED_PASSWORD || 'baz';
