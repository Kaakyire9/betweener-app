// Offline controller/owner integration. No provider or physical media assurance.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, deferred, settle, id } = require('./fixtures/connect-product-fixture.cjs');
const { recoveryAuthorityMatches, CONNECT_RECOVERY_TOTAL_MS } = require('../features/connect/media/recovery-policy.ts');

async function startWithReconnect(f, state = 'CONNECTING') {
  const enable = f.handle.enableMicrophone; let injected = false;
  f.handle.enableMicrophone = async () => { await enable(); if (!injected) { injected = true; f.emit('reconnecting'); } };
  await f.start(); f.model.state = state; f.model.version++;
  await f.composition.controller.refresh();
  await f.composition.controller.connectionLost(); await settle();
}

for (const state of ['ACCEPTED', 'CONNECTING']) test(`startup reconnect in ${state} releases its owner and gets fresh admission on the same call`, async () => {
  const f = fixture(false, { connectionRecovery: true });
  try {
    await startWithReconnect(f, state);
    const view = f.composition.controller.getSnapshot();
    assert.equal(f.counts().createCount, 1); assert.equal(f.counts().credentialCount, 2);
    assert.equal(f.model.state, state); assert.equal(view.phase, 'CONNECTING');
    assert.equal(view.audioSetupStage, 'ready'); assert.equal(view.error, null);
    assert.equal(view.muted, false); // Initial setup mute is not a user mute request.
    assert.ok(f.tracks.slice(0,-1).every(track => track.readyState === 'ended'));
    assert.equal(f.tracks.at(-1).readyState, 'live');
    assert.ok(f.events.indexOf('disconnect') < f.events.lastIndexOf('client-created'));
    assert.equal(f.events.filter(event => event.rpc === 'rpc_connect_act').length, 0);
    f.model.state = 'ACTIVE'; f.model.connected_at = new Date().toISOString(); f.model.version++;
    await f.composition.controller.refresh();
    await f.composition.controller.toggleMute();
    assert.equal(f.composition.controller.getSnapshot().muted, true);
    await f.composition.controller.toggleMute();
    assert.equal(f.composition.controller.getSnapshot().muted, false);
  } finally { await f.product.dispose(); }
});

test('startup authority permits a canonical activation but rejects identity, time and admission drift', async () => {
  const f = fixture();
  try {
    await f.start(); const previous = { ...f.model, state: 'CONNECTING', connected_at: null };
    const active = { ...previous, state: 'ACTIVE', connected_at: new Date().toISOString(), version: previous.version + 1 };
    assert.equal(recoveryAuthorityMatches(previous, previous, Date.now()), true);
    assert.equal(recoveryAuthorityMatches(previous, active, Date.now()), true);
    for (const patch of [{ id: id(99) }, { created_at: '2000-01-01T00:00:00Z' }, { media: 'video' },
      { caller_profile_id: id(99) }, { authorization: 'pre_match' }, { version: 0 }, { state: 'RINGING' },
      { state: 'ENDED' }, { ended_at: new Date().toISOString() }, { deadline: '2000-01-01T00:00:00Z' },
      { state: 'ACTIVE' }, { connected_at: 'invalid' }]) {
      assert.equal(recoveryAuthorityMatches(previous, { ...previous, ...patch }, Date.now()), false, JSON.stringify(patch));
    }
    assert.equal(recoveryAuthorityMatches({ ...active }, { ...active, state: 'CONNECTING', connected_at: null }, Date.now()), false);
  } finally { await f.product.dispose(); }
});

for (const reason of ['revoked', 'terminal', 'changed_generation', 'logout', 'background', 'end'])
test(`${reason} during startup recovery prevents successor capture`, async () => {
  const gate = deferred(), f = fixture(false, { connectionRecovery: true });
  try {
    const get = f.services.api.getCall; let reads = 0;
    f.services.api.getCall = async (...args) => { if (++reads > 1) await gate.promise; return get(...args); };
    const pending = startWithReconnect(f); await settle();
    if (reason === 'revoked') f.eligible(false);
    if (reason === 'terminal') { f.model.state = 'ENDED'; f.model.ended_at = new Date().toISOString(); f.model.version++; }
    if (reason === 'changed_generation') f.model.created_at = '2000-01-01T00:00:00Z';
    if (reason === 'logout') f.nativeAuth.invalidate();
    if (reason === 'background') f.background('background');
    if (reason === 'end') await f.composition.controller.hangup();
    gate.resolve(); await pending; await settle();
    assert.equal(f.events.filter(event => event === 'client-created').length, 1);
    assert.ok(f.tracks.every(track => track.readyState === 'ended'));
    assert.notEqual(f.composition.controller.getSnapshot().phase, 'ACTIVE');
  } finally { gate.resolve(); await f.product.dispose(); }
});

test('startup recovery keeps the existing per-call attempt bound', async () => {
  const f = fixture(false, { connectionRecovery: true });
  try {
    await startWithReconnect(f);
    for (let i = 0; i < 2; i++) { f.emit('reconnecting'); await f.composition.controller.connectionLost(); await settle(); }
    assert.equal(f.counts().createCount, 1); assert.equal(f.counts().credentialCount, 3);
    assert.equal(f.model.state, 'ENDED');
  } finally { await f.product.dispose(); }
});

test('late startup recovery cannot block or clear a successor calls recovery', async () => {
  const f = fixture(false, { connectionRecovery: true }), oldGate = deferred(), newGate = deferred();
  try {
    const get = f.services.api.getCall; let oldId, reads = 0, waitForNew = false;
    f.services.api.getCall = async (...args) => {
      const reply = await get(...args); oldId ??= reply.id;
      if (reply.id === oldId && ++reads > 1) await oldGate.promise;
      else if (reply.id !== oldId && waitForNew) await newGate.promise;
      return reply;
    };
    const first = startWithReconnect(f); await settle();
    await f.composition.controller.hangup(); await settle();
    assert.equal(f.composition.controller.dismissCompletedCall(), true);
    await f.active(); assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE'); waitForNew = true;
    f.emit('reconnecting'); const second = f.composition.controller.connectionLost(); await settle();
    oldGate.resolve(); await first;
    assert.equal(f.composition.controller.connectionLost(), second, JSON.stringify({ view: f.composition.controller.getSnapshot().phase, counts: f.counts(), state: f.model.state }));
    newGate.resolve(); await second;
    assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
    assert.equal(f.counts().createCount, 2); assert.equal(f.counts().credentialCount, 3);
  } finally { oldGate.resolve(); newGate.resolve(); await f.product.dispose(); }
});

test('a hung startup mutation cannot create another owner or extend the total recovery deadline', async t => {
  const f = fixture(false, { connectionRecovery: true }), gate = deferred();
  const enable = f.handle.enableMicrophone;
  f.handle.enableMicrophone = async () => { await enable(); f.emit('reconnecting'); await gate.promise; };
  try {
    await f.start(); f.model.state = 'CONNECTING'; f.model.version++;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const setup = f.composition.controller.refresh(); await settle();
    const recovery = f.composition.controller.connectionLost();
    t.mock.timers.tick(CONNECT_RECOVERY_TOTAL_MS); await recovery;
    assert.equal(f.model.state, 'ENDED'); assert.equal(f.counts().credentialCount, 1);
    gate.resolve(); await setup; await settle();
    assert.equal(f.events.filter(event => event === 'client-created').length, 1);
  } finally { gate.resolve(); t.mock.timers.reset(); await f.product.dispose(); }
});
