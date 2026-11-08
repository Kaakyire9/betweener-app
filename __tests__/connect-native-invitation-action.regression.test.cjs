const test = require('node:test'), assert = require('node:assert/strict');
const { nativeInvitationAction } = require('../features/connect/application/native-invitation-action.ts');
const { fixture, id, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
function input(f, patch = {}) {
  return { enabled: true, action: 'answer', envelope: { type: 'connect_voice_incoming', call_id: f.model.id, call_generation: f.model.created_at, call_version: 1, recipient_user_id: id(1) },
    auth: f.nativeAuth.owner, lifecycle: { appState: () => 'active' }, selfProfileId: id(2), deviceId: id(4),
    api: f.services.api, controller: f.composition.controller, now: Date.now, ...patch };
}
test('disabled native incoming boundary performs no RPC, native or credential work', async () => {
  const f = fixture(true); assert.equal(await nativeInvitationAction(input(f, { enabled: false })), 'disabled');
  assert.deepEqual(f.events, []); await f.product.dispose();
});
test('an explicit native Answer uses canonical recipient acceptance without creating another call', async () => {
  const f = fixture(true); assert.equal(await nativeInvitationAction(input(f)), 'answer_requested');
  assert.equal(f.counts().createCount, 0); assert.equal(f.counts().credentialCount, 1);
  assert.equal(f.events.filter(e => e.rpc === 'rpc_connect_act' && e.args.p_action === 'accept').length, 1);
  await f.product.dispose(); await f.composition.owner().release();
});
test('locked/background Answer requires foreground and never mints media credentials', async () => {
  const f = fixture(true); f.background('background');
  assert.equal(await nativeInvitationAction(input(f, { lifecycle: { appState: () => 'background' } })), 'requires_foreground');
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.events.includes('client-created'), false); await f.product.dispose();
});
for (const condition of ['foreign_account', 'generation', 'future_version', 'terminal', 'expired', 'sender', 'video', 'secret_payload']) test(`native Answer rejects ${condition}`, async () => {
  const f = fixture(true), i = input(f);
  if (condition === 'foreign_account') i.envelope.recipient_user_id = id(88);
  if (condition === 'generation') i.envelope.call_generation = '2000-01-01T00:00:00Z';
  if (condition === 'future_version') i.envelope.call_version = 99;
  if (condition === 'terminal') f.model.state = 'ENDED';
  if (condition === 'expired') f.model.deadline = '2000-01-01T00:00:00Z';
  if (condition === 'sender') f.model.recipient_profile_id = id(3);
  if (condition === 'video') f.model.media = 'video';
  if (condition === 'secret_payload') i.envelope.token = 'forbidden';
  assert.equal(await nativeInvitationAction(i), 'unavailable'); assert.equal(f.counts().credentialCount, 0); await f.product.dispose();
});
test('native Decline uses the authenticated existing action and never loads media', async () => {
  const f = fixture(true); assert.equal(await nativeInvitationAction(input(f, { action: 'decline' })), 'declined');
  assert.equal(f.model.state, 'ENDED'); assert.equal(f.counts().credentialCount, 0); assert.equal(f.events.includes('capture'), false); await f.product.dispose();
});
test('an account switch during canonical validation cannot accept an old native invitation', async () => {
  const f = fixture(true), gate = deferred(), get = f.services.api.getCall;
  f.services.api.getCall = async (...args) => { await gate.promise; return get(...args); };
  const answering = nativeInvitationAction(input(f)); await settle(); f.nativeAuth.invalidate(); gate.resolve();
  assert.equal(await answering, 'unavailable'); assert.equal(f.counts().credentialCount, 0); await f.product.dispose();
});

test('duplicated explicit native Answer cannot double-accept or create two media owners', async () => {
  const f = fixture(true); await Promise.all([nativeInvitationAction(input(f)), nativeInvitationAction(input(f))]);
  assert.equal(f.events.filter(e => e.rpc === 'rpc_connect_act' && e.args.p_action === 'accept').length, 1);
  assert.equal(f.counts().credentialCount, 1); await f.product.dispose(); await f.composition.owner().release();
});
