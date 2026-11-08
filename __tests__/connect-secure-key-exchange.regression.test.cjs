const test = require('node:test'), assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createDeviceKeyStore, toHex } = require('../features/connect/security/device-keys.ts');
const { createCallKeyAgent } = require('../features/connect/security/call-key-agent.ts');
const id = n => `86000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const random = size => new Uint8Array(randomBytes(size));
async function fixture() {
  const stores = [new Map(), new Map()], live = [true, true], envelopes = [];
  const keys = stores.map(store => createDeviceKeyStore({ get: async name => store.get(name) ?? null, set: async (name, value) => { store.set(name, value); } }, random));
  const devices = [];
  for (let i = 0; i < 2; i++) {
    const identity = await keys[i].identity(id(i + 1), id(i + 3));
    devices.push({ user_id: id(i + 1), device_id: id(i + 3), public_key: identity.publicKey }); identity.secretKey.fill(0);
  }
  const context = { call_id: id(9), generation: '2026-11-03T12:00:00+00:00', media: 'voice', caller_user_id: id(1), recipient_user_id: id(2),
    caller_device: id(3), expires_at: '2026-11-04T12:00:00+00:00', devices };
  let publications = 0; const codes = [];
  const agents = keys.map((store, i) => createCallKeyAgent({ userId: id(i + 1), deviceId: id(i + 3), authEpoch: 'epoch-1', keys: store,
    current: () => live[i], random, now: () => Date.parse('2026-11-03T12:01:00Z'), onSafetyCode: code => { codes[i] = code; }, exchange: {
      async context() { return { ...context, devices: devices.map(d => ({ ...d })), envelopes: envelopes.filter(e => e.user_id === id(i + 1)) }; },
      async publish(_id, _device, _generation, values) { publications++; if (envelopes.length) return false; envelopes.push(...values); return true; },
    } }));
  const binding = i => ({ cid: `betweener_connect:${id(9)}`, userId: id(i + 1), authEpoch: 'epoch-1', participants: [id(1), id(2)], generation: context.generation });
  return { keys, stores, devices, live, envelopes, context, agents, binding, codes, publications: () => publications };
}
test('two account-bound devices derive the same call key through opaque authenticated envelopes', async () => {
  const f = await fixture(), a = await f.agents[0].acquire(f.binding(0)), b = await f.agents[1].acquire(f.binding(1));
  assert.deepEqual(new Uint8Array(a.key), new Uint8Array(b.key)); assert.equal(a.key.byteLength, 32);
  assert.equal(f.publications(), 1); assert.equal(f.codes[0].code, f.codes[1].code); assert.equal(f.codes[0].peerIdentity, 'unverified');
  for (const envelope of f.envelopes) assert.ok(!envelope.ciphertext.includes(toHex(new Uint8Array(a.key))));
  new Uint8Array(a.key).fill(0); new Uint8Array(b.key).fill(0);
});
test('recovery retrieves the same key without regenerating or republishing it', async () => {
  const f = await fixture(), a = await f.agents[0].acquire(f.binding(0)), b = await f.agents[0].acquire(f.binding(0));
  assert.deepEqual(new Uint8Array(a.key), new Uint8Array(b.key)); assert.equal(f.publications(), 1);
});
test('one installation never reuses another account private key', async () => {
  const f = await fixture(), a = await f.keys[0].identity(id(1), id(3)), b = await f.keys[0].identity(id(2), id(3));
  assert.notEqual(a.publicKey, b.publicKey); a.secretKey.fill(0); b.secretKey.fill(0);
});
for (const tamper of ['ciphertext', 'nonce', 'generation', 'participants', 'call', 'expired', 'own_device', 'peer_key']) test(`key exchange rejects ${tamper}`, async () => {
  const f = await fixture(); await f.agents[0].acquire(f.binding(0)); const binding = f.binding(1);
  if (tamper === 'ciphertext') f.envelopes[1].ciphertext = '00'.repeat(f.envelopes[1].ciphertext.length / 2);
  if (tamper === 'nonce') f.envelopes[1].nonce = '00'.repeat(24);
  if (tamper === 'generation') binding.generation = '2026-11-02T12:00:00Z';
  if (tamper === 'participants') binding.participants = [id(2), id(8)];
  if (tamper === 'call') binding.cid = `betweener_connect:${id(8)}`;
  if (tamper === 'expired') f.context.expires_at = '2026-11-02T12:00:00Z';
  if (tamper === 'own_device') f.devices[1].public_key = '00'.repeat(32);
  if (tamper === 'peer_key') f.devices[0].public_key = '01'.repeat(32);
  await assert.rejects(f.agents[1].acquire(binding));
});
test('a pinned peer key change requires explicit repair instead of silent trust replacement', async () => {
  const f = await fixture(); await f.agents[0].acquire(f.binding(0)); f.devices[1].public_key = '01'.repeat(32);
  await assert.rejects(f.agents[0].acquire(f.binding(0)), /peer_key_changed/);
});
test('logout retires key access without exposing another account or creating new envelopes', async () => {
  const f = await fixture(); f.live[0] = false;
  await assert.rejects(f.agents[0].acquire(f.binding(0)), /owner_retired/); assert.equal(f.envelopes.length, 0);
});
test('recipient cannot create the caller key or publish a replacement', async () => {
  const f = await fixture(); await assert.rejects(f.agents[1].acquire(f.binding(1)), /key_not_ready/); assert.equal(f.publications(), 0);
});
