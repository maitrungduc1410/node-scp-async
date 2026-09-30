// Loads the built package through its CommonJS exports, the way a `require` user would.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const main = require('node-scp');
for (const name of [
  'connect',
  'upload',
  'download',
  'ScpClient',
  'ScpError',
  'ErrorCode',
  'parseTarget',
]) {
  assert.ok(name in main, `node-scp is missing ${name}`);
}
assert.equal(typeof main.connect, 'function');
assert.equal(main.ErrorCode.NotFound, 'ERR_NOT_FOUND');
assert.deepEqual(main.parseTarget('root@10.0.0.1:/tmp'), {
  host: '10.0.0.1',
  username: 'root',
  path: '/tmp',
});

const legacy = require('node-scp/legacy');
assert.equal(typeof legacy.Client, 'function');
assert.equal(legacy.default, legacy.Client);

const scp2 = require('node-scp/scp2');
assert.equal(typeof scp2.scp, 'function');
assert.equal(typeof scp2.Client, 'function');
assert.equal(typeof scp2.defaults, 'function');

const cli = path.join(__dirname, '..', 'dist', 'cli.mjs');
const version = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim();
assert.equal(version, require('../package.json').version);

console.log(`CommonJS smoke test passed on Node ${process.version}`);
