// Unit tests may use loopback fixtures; external services require separate execution authority.
const net = require('node:net');
const { URL } = require('node:url');
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
const deny = () => { throw Error('TEST_EXTERNAL_NETWORK_FORBIDDEN'); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === 'object') {
    if (!first.path && !local(first.host || first.hostname || 'localhost')) deny();
  } else if ((typeof first === 'number' || /^\d+$/.test(String(first)))
    && !local(typeof args[1] === 'string' ? args[1] : 'localhost')) deny();
  return connect.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const address = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local(address.hostname)) deny();
  return fetch(input, init);
};
