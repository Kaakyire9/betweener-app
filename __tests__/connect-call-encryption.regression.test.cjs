const test = require('node:test'); const assert = require('node:assert/strict');
const { prepareCallEncryption } = require('../features/connect/experimental/call-encryption.ts');
const { connectAdvancedCapabilities } = require('../features/connect/experimental/capabilities.ts');
function fixture() {
  const events = []; let left = false, current = true, epoch = 0;
  const a = 'f0110000-0000-4000-8000-000000000001', b = 'f0110000-0000-4000-8000-000000000002';
  const binding = { cid: 'betweener_connect:f0110000-0000-4000-8000-000000000003', userId: a, authEpoch: 'auth-1', participants: [a, b] };
  const manager = { setSharedKey(i) { events.push(['key', i]); }, removeSharedKey(i) { events.push(['remove', i]); }, dispose() { events.push('dispose'); } };
  const input = { required: true, binding, current: () => current, now: () => 1,
    call: { cid: binding.cid, attach(m) { assert.equal(m, manager); events.push('attach'); }, hasLeft: () => left, hasJoined: () => false, mode: () => 'auto-on' },
    sdk: { isSupported: () => true, async create() { events.push('create'); return manager; } },
    agent: { async acquire() { return { ...binding, participants: [...binding.participants], mode: 'required', epoch: epoch++, expiresAt: 100, key: new Uint8Array(16).fill(7).buffer }; } } };
  return { input, events, manager, leave() { left = true; }, retire() { current = false; } };
}
test('advanced native, video and E2EE activation remain off', () => {
  assert.ok(Object.values(connectAdvancedCapabilities).every(v => v === false));
});
test('disabled E2EE never loads keys or constructs a native manager', async () => {
  const f = fixture(); assert.equal(await prepareCallEncryption({ ...f.input, required: false }), null); assert.deepEqual(f.events, []);
});
test('missing authenticated key distribution and native support fail closed', async () => {
  const f = fixture(); await assert.rejects(prepareCallEncryption({ ...f.input, agent: undefined }), /distribution_unavailable/);
  f.input.sdk.isSupported = () => false; await assert.rejects(prepareCallEncryption(f.input), /native_unsupported/); assert.deepEqual(f.events, []);
});

for (const condition of ['disabled', 'unknown', 'joined', 'left']) test(`E2EE rejects ${condition} call before requesting any key`, async () => {
  const f = fixture(); let requested = false; f.input.agent.acquire = async () => { requested = true; throw Error('must not fetch'); };
  if (condition === 'joined') f.input.call.hasJoined = () => true;
  else if (condition === 'left') f.leave(); else f.input.call.mode = () => condition;
  await assert.rejects(prepareCallEncryption(f.input), /call_not_prepared/); assert.equal(requested, false); assert.deepEqual(f.events, []);
});

test('a call that joins while its manager is loading cannot attach encryption late', async () => {
  const f = fixture(), create = f.input.sdk.create;
  f.input.sdk.create = async () => { const manager = await create(); f.input.call.hasJoined = () => true; return manager; };
  await assert.rejects(prepareCallEncryption(f.input), /owner_retired/);
  assert.equal(f.events.includes('attach'), false); assert.equal(f.events.filter(e => e === 'dispose').length, 1);
});
test('key setup precedes attachment and does not claim encryption or physical disposal', async () => {
  const f = fixture(); const e = await prepareCallEncryption(f.input);
  assert.deepEqual(f.events, ['create', ['key', 0], 'attach']); assert.equal(e.encryptionEffect, 'not_verified');
  assert.throws(() => e.release(), /release_pending/); f.leave(); assert.deepEqual(e.release(), { nativeDisposal: 'requested' }); e.release();
  assert.equal(f.events.filter(x => x === 'dispose').length, 1);
});
for (const patch of [{ cid: 'other' }, { authEpoch: 'other' }, { generation: 'different-call-generation' }, { userId: 'other' }, { participants: ['a', 'a'] }, { expiresAt: 0 }, { epoch: 256 }, { mode: 'off' }]) {
  test(`invalid encryption lease rejects before creating a manager: ${JSON.stringify(patch)}`, async () => {
    const f = fixture(), acquire = f.input.agent.acquire; const key = new Uint8Array(16).fill(9);
    f.input.agent.acquire = async () => ({ ...await acquire(), key: key.buffer, ...patch });
    await assert.rejects(prepareCallEncryption(f.input), /binding_invalid/); assert.deepEqual(f.events, []); assert.ok(key.every(v => v === 0));
  });
}
test('rotation requires a newer epoch and erases temporary key bytes', async () => {
  const f = fixture(), keys = [], acquire = f.input.agent.acquire;
  f.input.agent.acquire = async () => { const lease = await acquire(); keys.push(lease.key); return lease; };
  const e = await prepareCallEncryption(f.input); await e.rotate();
  assert.ok(keys.every(k => new Uint8Array(k).every(v => v === 0)));
  assert.deepEqual(f.events.slice(-2), [['key', 1], ['remove', 0]]);
  f.input.agent.acquire = async () => ({ ...await acquire(), epoch: 1 });
  await assert.rejects(e.rotate(), /binding_invalid/); e.retire(); await assert.rejects(e.rotate(), /owner_retired/);
  f.leave(); e.release();
});
test('auth changes during a key fetch cannot attach or revive the call', async () => {
  const f = fixture(), acquire = f.input.agent.acquire;
  f.input.agent.acquire = async () => { const lease = await acquire(); f.retire(); return lease; };
  await assert.rejects(prepareCallEncryption(f.input), /owner_retired/); assert.deepEqual(f.events, []);
});

test('an ambiguous rotation retains both epochs for cleanup and blocks later rotations', async () => {
  const f = fixture(), e = await prepareCallEncryption(f.input); const remove = f.manager.removeSharedKey;
  f.manager.removeSharedKey = () => { throw Error('native remove failed'); };
  await assert.rejects(e.rotate(), /native remove failed/);
  await assert.rejects(e.rotate(), /owner_retired/);
  f.manager.removeSharedKey = remove; f.leave(); e.release();
  assert.deepEqual(f.events.slice(-3), [['remove', 0], ['remove', 1], 'dispose']);
});

test('rotation cannot silently change the native encryption algorithm', async () => {
  const f = fixture(), e = await prepareCallEncryption(f.input), acquire = f.input.agent.acquire;
  f.input.agent.acquire = async () => ({ ...await acquire(), key: new ArrayBuffer(32) });
  await assert.rejects(e.rotate(), /binding_invalid/); f.leave(); e.release();
});

test('invalid call and participant identities are rejected before requesting keys', async () => {
  const f = fixture(); let requests = 0;
  f.input.binding.participants[1] = 'arbitrary-peer'; f.input.agent.acquire = async () => { requests++; throw Error('must not acquire'); };
  await assert.rejects(prepareCallEncryption(f.input), /binding_invalid/); assert.equal(requests, 0);
});

test('key expiry while native creation is pending prevents attachment', async () => {
  const f = fixture(), create = f.input.sdk.create;
  f.input.sdk.create = async () => { const m = await create(); f.input.now = () => 101; return m; };
  await assert.rejects(prepareCallEncryption(f.input), /key_expired/);
  assert.deepEqual(f.events, ['create', 'dispose']);
});
