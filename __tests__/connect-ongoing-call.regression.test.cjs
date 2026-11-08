const test = require('node:test'), assert = require('node:assert/strict');
const { createOngoingCallLease } = require('../features/connect/media/native-ongoing-call.ts');
const { fixture, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const cid = 'betweener_connect:a0330000-0000-4000-8000-000000000011';
function leaseFixture(platform = 'android') {
  const events = []; let current = true;
  const port = { isSetup: true, isOngoingCallsEnabled: true, canPostNotifications: true, isCallTracked: () => true,
    async setCurrentCallActive(id) { assert.equal(id, cid); events.push('active'); }, async acquireBackgroundTask() { events.push('acquire'); }, async releaseBackgroundTask() { events.push('release'); } };
  return { port, events, stop: () => { current = false; }, lease: createOngoingCallLease({ cid, platform, port, current: () => current }) };
}
for (const platform of ['ios', 'android']) test(`${platform} ongoing registration owns and releases only its native task`, async () => {
  const f = leaseFixture(platform); assert.equal(await f.lease.set(true), true); assert.equal(f.lease.active(), true);
  await f.lease.dispose(); assert.equal(f.lease.active(), false);
  assert.deepEqual(f.events, platform === 'android' ? ['active', 'acquire', 'release'] : ['active']);
});
for (const field of ['isSetup', 'isOngoingCallsEnabled', 'canPostNotifications', 'isCallTracked']) test(`background denied without ${field}`, async () => {
  const f = leaseFixture(); f.port[field] = field === 'isCallTracked' ? () => false : false;
  await assert.rejects(f.lease.set(true), /unavailable/); assert.deepEqual(f.events, []);
});
test('a late keep-alive acknowledgement after End releases its task and cannot restore ownership', async () => {
  const f = leaseFixture(), gate = deferred(); f.port.acquireBackgroundTask = async () => { await gate.promise; f.events.push('acquired'); };
  const enabling = f.lease.set(true); await settle(); await f.lease.dispose(); gate.resolve();
  await assert.rejects(enabling, /unavailable/); assert.equal(f.lease.active(), false);
  assert.deepEqual(f.events, ['active', 'release', 'acquired', 'release']);
});

test('disabling during native activation cancels the late activation without acquiring a task', async () => {
  const f = leaseFixture(), gate = deferred(); f.port.setCurrentCallActive = () => gate.promise;
  const enabling = f.lease.set(true); await f.lease.set(false); gate.resolve();
  await assert.rejects(enabling, /unavailable/); assert.equal(f.lease.active(), false); assert.deepEqual(f.events, []);
});

async function connected(options = {}) {
  const f = fixture(false, { backgroundAudio: true, ...options }); let active = false;
  const actions = new Set();
  f.handle.setBackgroundAudio = async enabled => { active = enabled; return enabled; };
  f.handle.backgroundAudioActive = () => active;
  f.handle.observeSystemActions = fn => { actions.add(fn); return () => actions.delete(fn); };
  await f.active();
  return { ...f, actions };
}
test('background audio is opt-in and requires fresh canonical ACTIVE authority', async () => {
  const f = await connected(); assert.equal(f.composition.controller.getSnapshot().backgroundAudio, 'off');
  f.model.state = 'ENDED'; await f.composition.controller.toggleBackgroundAudio();
  assert.notEqual(f.composition.controller.getSnapshot().backgroundAudio, 'enabled');
  assert.equal(f.composition.owner().getSnapshot().retired, true); await f.product.dispose();
});
test('an opted-in registered call keeps audio on lock, suspends camera and never auto-restores it', async () => {
  const f = await connected({ media: 'video', videoCalling: true }); const c = f.composition.controller;
  await c.toggleCamera(); await c.toggleBackgroundAudio(); assert.equal(c.getSnapshot().backgroundAudio, 'enabled');
  f.background('background'); await settle();
  assert.equal(f.composition.owner().getSnapshot().retired, false); assert.equal(f.sdkState.microphoneStatus, 'enabled');
  assert.equal(f.sdkState.cameraStatus, 'disabled'); assert.equal(c.getSnapshot().foreground, false);
  f.background('active'); await settle(); assert.equal(f.cameraCounts().enabled, 1);
  await c.hangup(); await f.composition.owner().release(); await f.product.dispose();
});
test('system mute and End target the exact owner and still work while locked', async () => {
  const f = await connected(), c = f.composition.controller; await c.toggleBackgroundAudio(); f.background('background');
  for (const fn of f.actions) fn({ kind: 'mute', muted: true }); await settle(); assert.equal(c.getSnapshot().muted, true);
  for (const fn of f.actions) fn({ kind: 'end' }); await settle(); assert.equal(f.composition.owner().getSnapshot().retired, true);
  assert.equal(f.model.state, 'ENDED'); await f.composition.owner().release(); await f.product.dispose();
});
test('background consent revocation and account switch cannot retain capture', async () => {
  for (const change of ['revocation', 'logout']) {
    const f = await connected(); await f.composition.controller.toggleBackgroundAudio(); f.background('background');
    if (change === 'revocation') { f.model.state = 'ENDED'; f.model.reason = 'eligibility_revoked'; f.model.version++; await f.composition.controller.refresh(); }
    else f.nativeAuth.invalidate();
    assert.equal(f.composition.owner().getSnapshot().retired, true); assert.ok(f.tracks.every(t => t.readyState === 'ended'));
    await f.composition.owner().release(); await f.product.dispose();
  }
});
