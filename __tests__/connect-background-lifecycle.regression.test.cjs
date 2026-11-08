const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');

test('background during a pending create cancels its late canonical result without credentials', async () => {
  const gate = deferred();
  const f = fixture(false, { wrapApi(api) { return { ...api, async createCall(...args) { await gate.promise; return api.createCall(...args); } }; } });
  const starting = f.start(); await settle();
  f.background('background'); gate.resolve(); await starting; await settle();
  assert.equal(f.model.state, 'ENDED'); assert.equal(f.counts().credentialCount, 0);
  assert.equal(f.events.includes('capture'), false);
  assert.equal(f.composition.controller.getSnapshot().foreground, false);
  await f.product.dispose();
});

test('background while credentials are pending fences the late SDK bootstrap', async () => {
  const f = fixture(), gate = deferred(); await f.start(); f.model.state = 'ACTIVE';
  const admission = await f.ports.credentials(f.model.id, 'offline-device', 'offline');
  f.ports.credentials = () => gate.promise;
  const connecting = f.composition.controller.refresh(); await settle();
  f.background('background'); gate.resolve(admission); await connecting; await settle();
  assert.equal(f.events.includes('client-created'), false);
  assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
  f.background('active'); await settle();
  assert.equal(f.events.includes('capture'), false); await f.product.dispose();
});

test('a background caller cannot start a new request or reset itself into foreground', async () => {
  const f = fixture(); f.background('background'); await f.start();
  assert.equal(f.counts().createCount, 0); assert.equal(f.counts().permissionCalls, 0);
  f.composition.controller.reset(); assert.equal(f.composition.controller.getSnapshot().foreground, false);
  await f.product.dispose();
});

test('background incoming hints do not render or accept until a fresh foreground read', async () => {
  const f = fixture(true); f.background('background');
  await f.composition.controller.openCall(f.model.id); await f.composition.controller.accept();
  assert.equal(f.composition.controller.getSnapshot().session, null);
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.counts().permissionCalls, 0);
  f.background('active'); await settle();
  assert.equal(f.composition.controller.getSnapshot().phase, 'RINGING');
  assert.equal(f.events.some(e => e.args?.p_action === 'accept'), false); await f.product.dispose();
});

test('an unanswered incoming invitation is not declined by backgrounding', async () => {
  const f = fixture(true); await f.composition.controller.openCall(f.model.id);
  f.background('background'); await settle();
  assert.equal(f.model.state, 'RINGING'); assert.equal(f.counts().credentialCount, 0);
  assert.equal(f.composition.controller.getSnapshot().foreground, false); await f.product.dispose();
});

test('background while Accept is in flight ends the winning accepted state without capture', async () => {
  const gate = deferred();
  const f = fixture(true, { wrapApi(api) { return { ...api, async act(...args) { const result = await api.act(...args); if (args[1] === 'accept') await gate.promise; return result; } }; } });
  await f.composition.controller.openCall(f.model.id);
  const accepting = f.composition.controller.accept(); await settle();
  f.background('background'); gate.resolve(); await accepting; await settle();
  assert.equal(f.model.state, 'ENDED'); assert.equal(f.counts().credentialCount, 0);
  assert.equal(f.events.includes('capture'), false); await f.product.dispose();
});

test('inactive permission UI pauses setup without treating it as an accepted background call', async () => {
  const gate = deferred(), f = fixture(true, { media: 'video', videoCalling: true, cameraPrepareGate: gate });
  await f.composition.controller.openCall(f.model.id);
  const accepting = f.composition.controller.accept(); await settle();
  f.background('inactive'); gate.resolve(); await accepting;
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.model.state, 'ACCEPTED');
  f.background('active'); await settle(); await settle();
  assert.equal(f.counts().credentialCount, 1); assert.equal(f.cameraCounts().enabled, 0);
  await f.product.dispose(); if (f.composition.owner()) await f.composition.owner().release();
});

test('background teardown remains independent of a hanging mute operation', async () => {
  const f = fixture(); await f.active();
  f.composition.transport.setMuted = () => new Promise(() => {});
  void f.composition.controller.setForeground(false); await settle();
  assert.equal(f.model.state, 'ENDED');
  assert.equal(f.tracks.every(track => track.readyState === 'ended'), true);
  await f.composition.owner().release(); await f.product.dispose();
});
