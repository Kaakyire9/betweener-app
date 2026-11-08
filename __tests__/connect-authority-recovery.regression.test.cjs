const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, deferred, settle, id } = require('./fixtures/connect-product-fixture.cjs');
const { recoveryAuthorityMatches, CONNECT_RECOVERY_TOTAL_MS } = require('../features/connect/media/recovery-policy.ts');

async function recover(f) { f.emit('offline'); await f.composition.controller.connectionLost(); await settle(); }
test('default-off recovery preserves the existing terminal disconnect behavior', async () => {
  const f = fixture(); await f.active(); await recover(f);
  assert.equal(f.model.state, 'ENDED'); assert.equal(f.counts().credentialCount, 1); await f.product.dispose();
});
test('recovery releases the old owner, obtains fresh admission and preserves mute without creating another call', async () => {
  const f = fixture(false, { connectionRecovery: true }); await f.active(); const owner = f.composition.owner();
  await f.composition.controller.toggleMute(); await recover(f);
  assert.equal(owner.getSnapshot().retired, true); assert.notEqual(f.composition.owner(), owner);
  assert.equal(f.counts().credentialCount, 2); assert.equal(f.counts().createCount, 1);
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE'); assert.equal(f.composition.controller.getSnapshot().muted, true);
  assert.equal(f.sdkState.microphoneStatus, 'disabled'); assert.equal(f.model.state, 'ACTIVE');
  assert.ok(f.events.indexOf('disconnect') < f.events.lastIndexOf('client-created'));
  await f.product.dispose(); await f.composition.owner().release();
});
test('video recovery is audio-only until a new explicit camera action', async () => {
  const f = fixture(false, { connectionRecovery: true, videoCalling: true, media: 'video' }); await f.active();
  await f.composition.controller.toggleCamera(); await recover(f);
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE'); assert.equal(f.composition.controller.getSnapshot().video.camera, 'off');
  assert.equal(f.sdkState.cameraStatus, 'disabled'); assert.equal(f.cameraCounts().enabled, 1);
  await f.product.dispose(); await f.composition.owner().release();
});
for (const reason of ['revoked', 'terminal', 'jwt', 'changed_generation']) test(`${reason} during recovery cannot authorize a successor capture`, async () => {
  const gate = deferred(), f = fixture(false, { connectionRecovery: true }); await f.active();
  const get = f.services.api.getCall; f.services.api.getCall = async (...args) => { await gate.promise; return get(...args); };
  f.emit('offline'); await settle();
  if (reason === 'revoked') f.eligible(false);
  if (reason === 'terminal') { f.model.state = 'ENDED'; f.model.ended_at = new Date().toISOString(); f.model.version++; }
  if (reason === 'jwt') f.nativeAuth.invalidate();
  if (reason === 'changed_generation') f.model.created_at = '2020-01-01T00:00:00Z';
  gate.resolve(); await f.composition.controller.connectionLost(); await settle();
  assert.notEqual(f.composition.controller.getSnapshot().phase, 'ACTIVE'); assert.ok(f.tracks.every(t => t.readyState === 'ended'));
  assert.equal(f.events.filter(e => e === 'client-created').length, 1); await f.product.dispose();
});
test('End during a delayed recovery cannot recreate or unmute the call', async () => {
  const gate = deferred(), f = fixture(false, { connectionRecovery: true }); await f.active();
  const credentials = f.ports.credentials; f.ports.credentials = async (...args) => { await gate.promise; return credentials(...args); };
  f.emit('offline'); await settle(); await f.composition.controller.hangup(); gate.resolve(); await settle();
  assert.equal(f.model.state, 'ENDED'); assert.equal(f.events.filter(e => e === 'client-created').length, 1);
  assert.ok(f.tracks.every(t => t.readyState === 'ended')); await f.product.dispose();
});
test('incomplete SDK release keeps the exclusive owner and refuses recovery admission', async () => {
  const f = fixture(false, { connectionRecovery: true }); await f.active(); f.handle.leave = async () => { throw Error('leave failed'); };
  await recover(f); assert.equal(f.counts().credentialCount, 1); assert.equal(f.model.state, 'ENDED');
  assert.equal(f.composition.owner().getSnapshot().retired, true); await f.product.dispose();
});
test('recovery has a per-call attempt bound instead of an infinite provider loop', async () => {
  const f = fixture(false, { connectionRecovery: true }); await f.active(); await recover(f); await recover(f); await recover(f);
  assert.equal(f.counts().credentialCount, 3); assert.equal(f.model.state, 'ENDED'); await f.product.dispose();
});
test('recovery cannot cross call, party, media, version, deadline or lifecycle bindings', async () => {
  const f = fixture(); await f.active(); const previous = f.model;
  assert.equal(recoveryAuthorityMatches(previous, { ...previous }, Date.now()), true);
  for (const patch of [{ id: id(99) }, { media: 'video' }, { caller_profile_id: id(98) }, { version: 0 },
    { state: 'ENDED' }, { deadline: '2000-01-01T00:00:00Z' }, { authorization: 'pre_match' }, { connected_at: '2000-01-01T00:00:00Z' }]) {
    assert.equal(recoveryAuthorityMatches(previous, { ...previous, ...patch }, Date.now()), false);
  }
  await f.product.dispose();
});

test('duplicate connection-loss handlers share one recovery and cannot consume another call slot', async () => {
  const f = fixture(false, { connectionRecovery: true }); await f.active(); f.emit('offline');
  const first = f.composition.controller.connectionLost(), second = f.composition.controller.connectionLost(); assert.equal(first, second);
  await first; assert.equal(f.counts().credentialCount, 2); assert.equal(f.counts().createCount, 1);
  await f.product.dispose(); await f.composition.owner().release();
});
test('Live taking ownership before recovery admission cannot be borrowed or disconnected', async () => {
  const f = fixture(false, { connectionRecovery: true }), gate = deferred(); await f.active();
  const get = f.services.api.getCall; f.services.api.getCall = async (...args) => { await gate.promise; return get(...args); };
  f.emit('offline'); await settle(); let disconnected = false;
  const live = f.registry.acquireNativeExclusive('synthetic-live', () => ({ async disconnectUser() { disconnected = true; } }));
  gate.resolve(); await f.composition.controller.connectionLost(); assert.equal(disconnected, false); assert.equal(f.model.state, 'ENDED');
  assert.equal(f.events.filter(e => e === 'client-created').length, 1); await live.release(); await f.product.dispose();
});
test('hung release times out without constructing a successor owner or waiting to end authority', async () => {
  const f = fixture(false, { connectionRecovery: true }), gate = deferred(); await f.active();
  const leave = f.handle.leave; f.handle.leave = async () => { await gate.promise; await leave(); };
  await recover(f); assert.equal(f.model.state, 'ENDED'); assert.equal(f.counts().credentialCount, 1);
  assert.equal(f.events.filter(e => e === 'client-created').length, 1); gate.resolve(); await f.composition.owner().release(); await f.product.dispose();
});

test('the total recovery deadline ends authority even if credential delivery hangs', async context => {
  const f = fixture(false, { connectionRecovery: true }), gate = deferred(); await f.active();
  const credentials = f.ports.credentials; f.ports.credentials = async (...args) => { await gate.promise; return credentials(...args); };
  context.mock.timers.enable({ apis: ['setTimeout'] });
  f.emit('offline'); const recovering = f.composition.controller.connectionLost(); await settle();
  context.mock.timers.tick(CONNECT_RECOVERY_TOTAL_MS); await recovering;
  assert.equal(f.model.state, 'ENDED'); gate.resolve(); await settle();
  assert.equal(f.events.filter(e => e === 'client-created').length, 1); assert.ok(f.tracks.every(t => t.readyState === 'ended'));
  context.mock.timers.reset(); await f.product.dispose();
});
