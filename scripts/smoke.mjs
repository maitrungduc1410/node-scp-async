// Loads the built package through its ES module exports.
import assert from 'node:assert/strict';
import { connect, ErrorCode, isScpError, ScpError, upload } from 'node-scp';
import LegacyClient, { Client } from 'node-scp/legacy';
import scp2, { scp } from 'node-scp/scp2';

assert.equal(typeof connect, 'function');
assert.equal(typeof upload, 'function');
assert.ok(isScpError(new ScpError(ErrorCode.Timeout, 'x'), ErrorCode.Timeout));
assert.equal(LegacyClient, Client);
assert.equal(typeof scp, 'function');
assert.equal(typeof scp2.scp, 'function');

await assert.rejects(connect({ host: 'localhost', protocol: 'nope' }), (err) =>
  isScpError(err, ErrorCode.InvalidArgument),
);

console.log(`ES module smoke test passed on Node ${process.version}`);
