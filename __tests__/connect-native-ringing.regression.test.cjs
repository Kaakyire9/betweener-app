const test = require('node:test');
const assert = require('node:assert/strict');
const { registerConnectRingingOwner, assertConnectRingingOwner } = require('../features/connect/media/native-ringing-guard.ts');
const call = () => ({ type: 'betweener_connect', id: 'owned-call', cid: 'betweener_connect:owned-call' });
test('cold-start and unowned native acceptance cannot join Connect', async () => {
  await assert.rejects(assertConnectRingingOwner(call()), /requires_authority/);
});
test('only the exact admitted Call object can pass the native join hook', async () => {
  const c = call(), release = registerConnectRingingOwner(c, () => true);
  await assertConnectRingingOwner(c);
  await assert.rejects(assertConnectRingingOwner({ ...c }), /requires_authority/);
  release(); await assert.rejects(assertConnectRingingOwner(c), /requires_authority/);
});
test('account change, background or retirement invalidates the existing permit', async () => {
  const c = call(); let current = true;
  const release = registerConnectRingingOwner(c, () => current); current = false;
  await assert.rejects(assertConnectRingingOwner(c), /requires_authority/); release();
});
test('call mutation and simultaneous ownership are rejected', async () => {
  const c = call(), release = registerConnectRingingOwner(c, () => true);
  assert.throws(() => registerConnectRingingOwner(c, () => true), /owner_busy/);
  c.id = 'different'; await assert.rejects(assertConnectRingingOwner(c), /requires_authority/); release();
});
test('Live call types retain their existing join behaviour', async () => {
  await assertConnectRingingOwner({ type: 'livestream', id: 'live', cid: 'livestream:live' });
});

test('entry-point hooks and refreshed adapters share permits without weakening retirement', async () => {
  const fs = require('node:fs'), ts = require('typescript');
  const source = ts.transpileModule(fs.readFileSync('features/connect/media/native-ringing-guard.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const original = {}, refreshed = {};
  new Function('exports', source)(original); new Function('exports', source)(refreshed);
  const c = call(); let current = true;
  const release = refreshed.registerConnectRingingOwner(c, () => current);
  await original.assertConnectRingingOwner(c); current = false;
  await assert.rejects(original.assertConnectRingingOwner(c), /requires_authority/); release();
});
