const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { globSync } = require('glob');
const forge = require('node-forge');
const queryString = require('query-string');

test('patched URI decoder retains the router CommonJS query API', () => {
  assert.deepEqual({ ...queryString.parse('q=caf%C3%A9&space=hello+world') }, { q: 'caf\u00e9', space: 'hello world' });
  assert.equal(queryString.parse('q=%E0%A4%A').q, '%E0%A4%A');
});

test('malformed URI runs finish in an isolated bounded process', () => {
  const script = "const decode=require('decode-uri-component').default; const input='%C0%AF%FE%FF'.repeat(5000); if(typeof decode(input)!=='string') process.exit(1);";
  execFileSync(process.execPath, ['-e', script], { timeout: 10000, stdio: 'pipe', windowsHide: true });
});

test('merge cannot poison a result prototype from source or target, including null prototypes', () => {
  for (const module of ['deepmerge', 'deepmerge/dist/umd.js']) {
    const merge = require(module);
    const payload = () => JSON.parse('{"__proto__":{"unsafeRole":true}}');
    for (const [target, source] of [[Object.create(null), payload()], [payload(), {}],
      [{ profile: Object.create(null) }, { profile: payload() }]]) {
      const result = merge(target, source);
      assert.equal(result.unsafeRole, undefined);
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      if (result.profile) assert.equal(result.profile.unsafeRole, undefined);
    }
    assert.deepEqual(merge({ nested: { first: 1 }, values: [1] }, { nested: { second: 2 }, values: [2] }),
      { nested: { first: 1, second: 2 }, values: [1, 2] });
  }
  assert.equal(Object.prototype.unsafeRole, undefined);
});

test('updated forge rejects an empty GCM authentication tag', () => {
  const decipher = forge.cipher.createDecipher('AES-GCM', String.fromCharCode(0).repeat(16));
  assert.throws(() => decipher.start({ iv: String.fromCharCode(0).repeat(12), tag: '', tagLength: 0 }));
});

test('patched glob retains the build tools synchronous named API', () => {
  assert.deepEqual(globSync('__tests__/dependency-security.regression.test.cjs', { cwd: process.cwd(), posix: true }),
    ['__tests__/dependency-security.regression.test.cjs']);
});


test('realtime disconnect clears its fallback deadline after successful socket cleanup', async (context) => {
  const SocketAdapter = require('@supabase/realtime-js/dist/main/phoenix/socketAdapter.js').default;
  const adapter = new SocketAdapter('ws://127.0.0.1:1/socket', {});
  adapter.socket.disconnect = (done) => done();
  const deadline = {};
  context.mock.method(globalThis, 'setTimeout', () => deadline);
  const cleared = context.mock.method(globalThis, 'clearTimeout', () => undefined);
  let finished = false;
  assert.equal(await adapter.disconnect(() => { finished = true; }), 'ok');
  assert.equal(finished, true);
  assert.equal(cleared.mock.callCount(), 1);
  assert.equal(cleared.mock.calls[0].arguments[0], deadline);
});

test('realtime disconnect preserves the deadline when socket cleanup does not acknowledge', async (context) => {
  const SocketAdapter = require('@supabase/realtime-js/dist/main/phoenix/socketAdapter.js').default;
  const adapter = new SocketAdapter('ws://127.0.0.1:1/socket', {});
  adapter.socket.disconnect = () => undefined;
  let fireDeadline;
  context.mock.method(globalThis, 'setTimeout', (callback) => { fireDeadline = callback; return {}; });
  context.mock.method(globalThis, 'clearTimeout', () => undefined);
  let finished = false;
  const result = adapter.disconnect(() => { finished = true; });
  fireDeadline();
  assert.equal(await result, 'timeout');
  assert.equal(finished, false);
});
