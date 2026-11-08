const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrivateCameraPreview, PrivateCameraAllocationError } = require('../features/connect/video/private-camera-preview.ts');
const { launchAllowsCalling } = require('../features/connect/domain/calling-launch-policy.ts');
const { fixture, id, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const peer = { profileId: id(3), name: 'Peer', avatar: null };
const close = async f => { await f.composition.controller.hangup(); await f.composition.owner()?.release(); await f.product.dispose(); };
async function connected(f) { f.model.state = 'ACTIVE'; f.model.connected_at = new Date().toISOString(); await f.composition.controller.refresh(); await settle(); }
function previewFixture() {
  const events = [], ready = deferred(), stopGate = { value: null };
  const presentation = { render: () => null };
  const resource = { presentation, async stop() { events.push('preview-stop'); if (stopGate.value) await stopGate.value.promise; } };
  const preview = createPrivateCameraPreview(async current => { events.push('preview-open'); await ready.promise; events.push(current() ? 'preview-current' : 'preview-retired'); return resource; });
  return { preview, ready, events, stopGate, resource };
}

test('matched-only policy rejects grants and pre-match mode without weakening matched permissions', () => {
  assert.equal(launchAllowsCalling('matched'), true);
  assert.equal(launchAllowsCalling('matched', id(9)), false);
  for (const mode of ['pre_match', 'unknown', '', null]) assert.equal(launchAllowsCalling(mode, id(9)), false);
});
test('private preview allocates only on explicit start and releases a late cancelled allocation', async () => {
  const p = previewFixture(); assert.deepEqual(p.events, []); assert.equal(p.preview.presentation(), null);
  const opening = p.preview.start(() => true); await settle();
  const stopping = p.preview.stop(); assert.equal(p.preview.released(), false);
  p.ready.resolve(); await Promise.all([opening, stopping]);
  assert.equal(p.preview.presentation(), null); assert.equal(p.preview.released(), true);
  assert.ok(p.events.includes('preview-retired')); assert.ok(p.events.includes('preview-stop'));
});
test('simultaneous preview starts cannot allocate two owners', async () => {
  const p = previewFixture(); p.ready.resolve();
  await Promise.all([p.preview.start(() => true), p.preview.start(() => true)]);
  assert.equal(p.events.filter(e => e === 'preview-open').length, 1);
  await p.preview.stop(); assert.equal(p.preview.released(), true);
});
test('a late retired allocation cannot cancel a newer preview waiting for cleanup', async () => {
  const gates = [deferred(), deferred()]; let opened = 0;
  const resources = gates.map((_, i) => ({ presentation: { render: () => i }, async stop() {} }));
  const p = createPrivateCameraPreview(async () => { const n = opened++; await gates[n].promise; return resources[n]; });
  const first = p.start(() => true); await settle(); const stop = p.stop(); const second = p.start(() => true);
  gates[0].resolve(); await first; await stop; await settle();
  assert.equal(opened, 2); gates[1].resolve(); await second;
  assert.equal(p.presentation(), resources[1].presentation); await p.stop();
});
test('failed preview release retains ownership for retry instead of admitting a successor', async () => {
  let failing = true;
  const resource = { presentation: { render: () => null }, async stop() { if (failing) throw Error('not released'); } };
  const p = createPrivateCameraPreview(async () => resource);
  await p.start(() => true); await assert.rejects(p.stop(), /not released/);
  assert.equal(p.released(), false); assert.equal(p.presentation(), null);
  failing = false; await p.stop(); assert.equal(p.released(), true);
});
test('a failed native allocation keeps its cleanup resource reachable', async () => {
  let stopped = 0;
  const resource = { presentation: { render: () => null }, async stop() { stopped++; } };
  const p = createPrivateCameraPreview(async () => { throw new PrivateCameraAllocationError(resource); });
  await assert.rejects(p.start(() => true), /cleanup_unconfirmed/);
  assert.equal(p.released(), false); await p.stop(); assert.equal(stopped, 1); assert.equal(p.released(), true);
});
test('an admitted outgoing video request gets a private preview without credentials, native call join or publication', async () => {
  const p = previewFixture(); p.ready.resolve();
  const f = fixture(false, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  await f.start(); await settle();
  assert.equal(f.composition.controller.getSnapshot().video.preview, 'ready');
  assert.ok(f.composition.controller.privateVideoPresentation());
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.events.includes('client-created'), false);
  assert.equal(f.events.includes('camera-enable'), false);
  await close(f); assert.equal(p.preview.presentation(), null); assert.equal(p.preview.released(), true);
});
test('incoming selection causes no capture or camera permission request; camera-off Answer stays off', async () => {
  const p = previewFixture(); p.ready.resolve();
  const f = fixture(true, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  const c = f.composition.controller; await c.openCall(f.model.id);
  assert.equal(c.getSnapshot().video.cameraWanted, true);
  c.setCameraOnAnswer(false); assert.equal(c.getSnapshot().video.cameraWanted, false);
  assert.equal(f.cameraPreparationCount(), 0); assert.deepEqual(p.events, []);
  await c.accept({ cameraOn: false }); await connected(f);
  assert.equal(f.cameraPreparationCount(), 0); assert.equal(f.cameraCounts().enabled, 0);
  assert.deepEqual(p.events, []); await close(f);
});
test('explicit video Answer starts the admitted camera once; generic native Answer keeps camera off', async () => {
  for (const explicit of [true, false]) {
    const p = previewFixture(); p.ready.resolve();
    const f = fixture(true, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
    const c = f.composition.controller; await c.openCall(f.model.id);
    await c.accept(explicit ? { cameraOn: true } : undefined); await connected(f);
    await c.tick(); await settle();
    assert.equal(f.cameraCounts().enabled, explicit ? 1 : 0);
    assert.equal(c.getSnapshot().video.camera, explicit ? 'on' : 'off');
    assert.deepEqual(p.events, []); await close(f);
  }
});
test('switching the outgoing preview off is preserved at connection and subsequent ticks', async () => {
  const p = previewFixture(); p.ready.resolve();
  const f = fixture(false, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  await f.start(); await settle(); await f.composition.controller.toggleCamera(); await connected(f);
  await f.composition.controller.tick(); await settle();
  assert.equal(f.cameraCounts().enabled, 0); assert.equal(f.composition.controller.getSnapshot().video.camera, 'off');
  await close(f);
});
test('preview release is acknowledged before participant credentials; End remains independent of hung preview stop', async () => {
  const p = previewFixture(); p.ready.resolve();
  const f = fixture(false, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  await f.start(); await settle(); p.stopGate.value = deferred();
  f.model.state = 'ACTIVE'; f.model.connected_at = new Date().toISOString();
  const joining = f.composition.controller.refresh(); await settle();
  assert.equal(f.counts().credentialCount, 0);
  await f.composition.controller.hangup();
  assert.equal(f.model.state, 'ENDED'); assert.equal(f.composition.controller.canDismissCompletedCall(), false);
  p.stopGate.value.resolve(); await joining; await settle();
  assert.equal(f.counts().credentialCount, 0); assert.equal(p.preview.released(), true); await f.product.dispose();
});
test('a pre-match start never requests permissions or creates a session', async () => {
  const f = fixture(false, { media: 'video', videoCalling: true });
  await f.composition.controller.start(peer, 'pre_match', id(9), 'video');
  assert.equal(f.counts().permissionCalls, 0); assert.equal(f.counts().createCount, 0);
  assert.equal(await f.services.checkEligibility(id(3), 'video', 'pre_match', id(9)), false);
  await assert.rejects(f.services.api.createCall(id(3), 'video', 'pre_match', id(8), id(4), id(9)), /connect_disabled/);
  await f.product.dispose();
});
test('minimizing stops video and restoring/ticking never reopens a camera chosen off', async () => {
  const p = previewFixture(); p.ready.resolve();
  const f = fixture(false, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  await f.start(); await connected(f); assert.equal(f.composition.controller.getSnapshot().video.camera, 'on');
  await f.composition.controller.minimize(); f.composition.controller.restore();
  await f.composition.controller.tick(); await settle();
  assert.equal(f.cameraCounts().enabled, 1); assert.equal(f.composition.controller.getSnapshot().video.camera, 'off');
  await close(f);
});

test('camera denial falls back to voice without preview or automatic camera retries', async () => {
  const p = previewFixture(); p.ready.resolve();
  const f = fixture(false, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  f.cameraPermission('denied'); await f.start(); await connected(f); await f.composition.controller.tick();
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
  assert.equal(f.composition.controller.getSnapshot().video.cameraWanted, false);
  assert.equal(f.cameraCounts().enabled, 0); assert.deepEqual(p.events, []); await close(f);
});

test('a transient Answer permission dialog preserves the selected on mode until foreground revalidation', async () => {
  const p = previewFixture(); p.ready.resolve();
  const f = fixture(true, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  const rpc = f.ports.rpc;
  f.ports.rpc = async (...args) => { const result = await rpc(...args);
    if (args[0] === 'rpc_connect_act' && args[1].p_action === 'accept') await f.composition.controller.setForeground(false);
    return result;
  };
  await f.composition.controller.openCall(f.model.id); await f.composition.controller.accept({ cameraOn: true });
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.cameraCounts().enabled, 0);
  f.model.state = 'ACTIVE'; f.model.connected_at = new Date().toISOString();
  await f.composition.controller.setForeground(true); await settle();
  assert.equal(f.cameraCounts().enabled, 1); assert.equal(f.composition.controller.getSnapshot().video.camera, 'on'); await close(f);
});

for (const cause of ['background', 'logout']) test(`a late private preview after ${cause} is released and cannot reach a call`, async () => {
  const p = previewFixture();
  const f = fixture(false, { media: 'video', videoCalling: true, videoCameraOnEntry: true, cameraPreview: p.preview });
  await f.start(); await settle();
  if (cause === 'background') f.background('background'); else f.nativeAuth.accept(null);
  p.ready.resolve(); await settle(); await settle(); await p.preview.stop();
  assert.equal(p.preview.presentation(), null); assert.equal(p.preview.released(), true);
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.cameraCounts().enabled, 0);
  assert.ok(p.events.includes('preview-retired')); await f.product.dispose();
});
