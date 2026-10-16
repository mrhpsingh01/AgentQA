/** Audit runner guard: NODE_OPTIONS=--require=<absolute path to this file>.
 * Reject external TCP connections, including calls whose errors are swallowed.
 * Browser fixture pages are intercepted by Playwright; node traffic is loopback only.
 */
const net = require('node:net');
const connect = net.Socket.prototype.connect;
let attempts = 0;
net.Socket.prototype.connect = function (...args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  const options = typeof first === 'object' ? first : { host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  const host = options.host || options.hostname || 'localhost';
  if (!options.path && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    attempts++;
    throw new Error(`Offline audit blocked external TCP connection to ${host}`);
  }
  return connect.apply(this, args);
};
process.on('exit', () => {
  if (attempts) process.exitCode = 1;
});
