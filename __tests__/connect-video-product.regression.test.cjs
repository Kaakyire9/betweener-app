const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, id, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const { readVoiceCredentials, readConnectCredentials } = require('../features/connect/data/voice-api.ts');
const { connectFeatureFlags } = require('../features/connect/config/connect-feature-flags.ts');
const { resolveCapturePermission } = require('../features/connect/media/capture-permission.ts');

async function active(options = {}, incoming = false) {
  const f = fixture(incoming, { media: 'video', videoCalling: true, ...options });
  await f.active();
  f.model.state = 'ACTIVE'; f.model.connected_at = new Date().toISOString();
  await f.composition.controller.refresh();
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
  return f;
}
const close = async f => { await f.composition.controller.hangup(); await f.composition.owner()?.release(); await f.product.dispose(); };

test('video stays default-off and cannot call the API or load native media from an unapproved start', async () => {
  assert.equal(connectFeatureFlags.videoCalling, false);
  const f = fixture();
  await f.composition.controller.start({ profileId: id(3), name: 'Peer', avatar: null }, 'matched', null, 'video');
  assert.deepEqual(f.counts(), { permissionCalls: 0, createCount: 0, credentialCount: 0 });
  assert.equal(f.events.includes('client-created'), false); await f.product.dispose();
});
test('strict voice credentials cannot be reused as video authority, and video parsing stays opt-in', () => {
  const value = { apiKey: 'offline', token: 'synthetic', media: 'video', user: { id: id(1) }, expiresAt: new Date(Date.now() + 60000).toISOString(), call: { id: id(10), cid: `betweener_connect:${id(10)}`, type: 'betweener_connect' } };
  assert.throws(() => readVoiceCredentials(value, id(10), id(1)), /unavailable/);
  assert.throws(() => readConnectCredentials(value, id(10), id(1)), /unavailable/);
  assert.equal(readConnectCredentials(value, id(10), id(1), Date.now(), true).media, 'video');
  for (const patch of [{ user: { id: id(8) } }, { expiresAt: 'invalid' }, { call: { ...value.call, cid: 'other' } }]) {
    assert.throws(() => readConnectCredentials({ ...value, ...patch }, id(10), id(1), Date.now(), true), /unavailable/);
  }
});
test('an active voice call cannot enable camera even when video implementation is available', async () => {
  const f = await active({ media: 'voice' });
  await f.composition.controller.toggleCamera(); await f.composition.controller.flipCamera();
  assert.deepEqual(f.cameraCounts(), { permission: 0, enabled: 0 });
  assert.equal(f.composition.controller.videoPresentation(), null); await close(f);
});
test('the real outgoing lifecycle requests video separately and joins with the camera off', async () => {
  const f = await active();
  assert.equal(f.events.find(e => e.rpc === 'rpc_connect_create_call').args.p_media, 'video');
  assert.deepEqual(f.cameraCounts(), { permission: 0, enabled: 0 });
  assert.equal(f.composition.controller.getSnapshot().video.camera, 'off');
  assert.equal(f.composition.controller.getSnapshot().route, 'speaker'); await close(f);
});
test('incoming canonical video is not accepted, captured or tokenised simply by opening it', async () => {
  const f = fixture(true, { media: 'video', videoCalling: true });
  await f.composition.controller.openCall(f.model.id);
  assert.equal(f.composition.controller.getSnapshot().phase, 'RINGING');
  assert.deepEqual(f.counts(), { permissionCalls: 0, createCount: 0, credentialCount: 0 });
  assert.equal(f.cameraCounts().enabled, 0); await close(f);
});
test('answering video joins audio without enabling camera', async () => {
  const f = await active({}, true);
  assert.equal(f.cameraCounts().enabled, 0); assert.equal(f.composition.controller.getSnapshot().video.camera, 'off');
  await close(f);
});
test('camera enable, flip and off use the exact current owner and release its native tracks', async () => {
  const f = await active(); const controller = f.composition.controller;
  assert.equal(controller.videoPresentation(), controller.videoPresentation(), 'Call-owned surfaces keep stable component identity');
  await controller.flipCamera(); assert.equal(f.events.includes('camera-flip'), false);
  await controller.toggleCamera(); assert.equal(controller.getSnapshot().video.camera, 'on');
  assert.equal(f.sdkState.videoPublishing, true);
  await controller.flipCamera(); assert.equal(controller.getSnapshot().video.facing, 'back');
  await controller.toggleCamera(); assert.equal(controller.getSnapshot().video.camera, 'off');
  assert.equal(f.cameraTracks[0].readyState, 'ended'); assert.ok(f.events.includes('camera-track-release'));
  assert.equal(f.sdkState.videoPublishing, false); await close(f);
});
for (const permission of ['denied', 'blocked']) test(`${permission} camera permission leaves the audio call usable without capture`, async () => {
  const f = await active(); f.cameraPermission(permission); await f.composition.controller.toggleCamera();
  assert.equal(f.cameraCounts().enabled, 0); assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
  assert.equal(f.composition.controller.getSnapshot().video.permission, permission); await close(f);
});
test('a camera start failure stops the SDK camera and permits an audio-only conversation', async () => {
  const f = await active({ cameraFailure: true }); await f.composition.controller.toggleCamera();
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
  assert.equal(f.composition.controller.getSnapshot().video.camera, 'off');
  assert.equal(f.sdkState.cameraStatus, 'disabled'); await close(f);
});
test('camera cancellation while permission is pending prevents a late native enable', async () => {
  const gate = deferred(), f = await active({ cameraPermissionGate: gate });
  const enabling = f.composition.controller.toggleCamera(); await settle();
  const stopping = f.composition.controller.toggleCamera(); await settle();
  assert.equal(f.composition.controller.getSnapshot().video.camera, 'stopping');
  gate.resolve(); await Promise.all([enabling, stopping]);
  assert.equal(f.cameraCounts().enabled, 0); assert.equal(f.composition.controller.getSnapshot().video.camera, 'off'); await close(f);
});
test('End dispatches authority while native camera enable remains hung; late media is released', async () => {
  const gate = deferred(), f = await active({ cameraEnableGate: gate });
  const enabling = f.composition.controller.toggleCamera(); await settle();
  await f.composition.controller.hangup();
  assert.equal(f.model.state, 'ENDED'); assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
  assert.equal(f.composition.owner().getSnapshot().retired, true);
  gate.resolve(); await enabling; await f.composition.owner().release();
  assert.ok(f.cameraTracks.every(t => t.readyState === 'ended'));
  assert.equal(f.sdkState.videoPublishing, false); await f.product.dispose();
});
test('End Call & Block persists independently of hung camera teardown', async () => {
  const gate = deferred(), f = await active({ cameraEnableGate: gate });
  const enabling = f.composition.controller.toggleCamera(); await settle();
  await f.composition.controller.endCallAndBlock();
  assert.equal(f.composition.controller.getSnapshot().endBlock.block, 'saved');
  assert.equal(f.composition.controller.getSnapshot().endBlock.provider, 'pending');
  gate.resolve(); await enabling; await f.composition.owner().release(); await f.product.dispose();
});
test('logout during permission read prevents stale capture and makes old surfaces inert', async () => {
  const gate = deferred(), f = await active({ cameraPermissionGate: gate });
  const source = f.composition.controller.videoPresentation();
  const enabling = f.composition.controller.toggleCamera(); await settle();
  f.nativeAuth.accept(null); gate.resolve(); await enabling; await f.composition.owner().release();
  assert.equal(f.cameraCounts().enabled, 0); assert.deepEqual(source.participants(), []); assert.equal(source.render('self', true), null);
  await f.product.dispose();
});
test('background during camera enable retires the owner, and foreground cannot restart it', async () => {
  const gate = deferred(), f = await active({ cameraEnableGate: gate });
  const enabling = f.composition.controller.toggleCamera(); await settle();
  f.background('inactive'); gate.resolve(); await enabling; await settle();
  f.background('active'); await f.composition.controller.tick(); await f.composition.owner().release();
  assert.equal(f.cameraCounts().enabled, 1); assert.equal(f.sdkState.videoPublishing, false);
  assert.ok(f.cameraTracks.every(t => t.readyState === 'ended')); await f.product.dispose();
});
test('camera off during a delayed flip cannot leave restarted video enabled', async () => {
  const gate = deferred(), f = await active({ cameraFlipGate: gate });
  await f.composition.controller.toggleCamera(); const flipping = f.composition.controller.flipCamera(); await settle();
  const stopping = f.composition.controller.toggleCamera(); await settle(); gate.resolve(); await Promise.all([flipping, stopping]);
  assert.equal(f.composition.controller.getSnapshot().video.camera, 'off'); assert.equal(f.sdkState.videoPublishing, false); await close(f);
});
test('render failure stops local video, disables re-enable and leaves End/audio controls usable', async () => {
  const f = await active(); await f.composition.controller.toggleCamera(); await f.composition.controller.stopVideoForRenderFailure();
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE'); assert.equal(f.composition.controller.getSnapshot().video.renderFailed, true);
  const before = f.cameraCounts().enabled; await f.composition.controller.toggleCamera(); assert.equal(f.cameraCounts().enabled, before);
  await close(f);
});
test('wrong-media credentials are rejected before native client construction', async () => {
  const f = fixture(false, { media: 'video', videoCalling: true, credentialsMedia: 'voice' }); await f.active();
  assert.equal(f.events.includes('client-created'), false); assert.equal(f.cameraCounts().enabled, 0); await f.product.dispose();
});
test('camera permission resolver fails closed and never re-prompts a blocked user', async () => {
  let requested = 0;
  assert.equal(await resolveCapturePermission({ get: async () => ({ granted: false, canAskAgain: false }), request: async () => { requested++; return {}; } }), 'blocked');
  assert.equal(requested, 0);
  assert.equal(await resolveCapturePermission({ get: async () => { throw Error('unavailable'); }, request: async () => ({}) }), 'denied');
});
test('camera permission preparation happens on explicit Start, before native client creation', async () => {
  const gate = deferred(), f = fixture(false, { media: 'video', videoCalling: true, cameraPrepareGate: gate });
  const starting = f.start(); await settle();
  assert.equal(f.cameraPreparationCount(), 1); assert.equal(f.counts().createCount, 0);
  assert.equal(f.events.includes('client-created'), false); assert.equal(f.cameraCounts().enabled, 0);
  gate.resolve(); await starting; assert.equal(f.counts().createCount, 1); await close(f);
});
test('account switching during permission preparation cannot create a late invitation', async () => {
  const gate = deferred(), f = fixture(false, { media: 'video', videoCalling: true, cameraPrepareGate: gate });
  const starting = f.start(); await settle(); f.nativeAuth.accept(null); gate.resolve(); await starting;
  assert.equal(f.counts().createCount, 0); assert.equal(f.cameraCounts().enabled, 0); await f.product.dispose();
});
test('native camera entry refuses to open permission or capture before a completed join', async () => {
  const f = await active(); f.sdkState.callingState = 'joining';
  await assert.rejects(f.composition.owner().bindings.call.camera.enable(), /not_authorized/);
  assert.equal(f.cameraCounts().permission, 0); assert.equal(f.cameraCounts().enabled, 0); await close(f);
});
test('unsolicited SDK camera activity in a voice call is stopped without restarting it', async () => {
  const f = await active({ media: 'voice' });
  f.sdkState.cameraStatus = 'enabled';
  f.cameraTracks.push({ enabled: true, readyState: 'live', stop() { this.enabled = false; this.readyState = 'ended'; }, release() {} });
  f.emitMedia(); await settle();
  assert.equal(f.sdkState.cameraStatus, 'disabled'); assert.equal(f.cameraTracks[0].readyState, 'ended');
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE'); await close(f);
});
test('a pending native camera mutation keeps the exclusive lease unavailable to Live', async () => {
  const gate = deferred(), f = await active({ cameraEnableGate: gate });
  const enabling = f.composition.controller.toggleCamera(); await settle(); await f.composition.controller.hangup();
  let created = false;
  assert.throws(() => f.registry.acquireNativeExclusive('live-other', () => { created = true; return f.client; }), /busy|pending/);
  assert.equal(created, false); gate.resolve(); await enabling; await f.composition.owner().release(); await f.product.dispose();
});
test('a resolved camera-off promise cannot certify SDK shutdown when the SDK still reports enabled', async () => {
  const f = await active(); await f.composition.controller.toggleCamera();
  f.handle.disableCamera = async () => {}; // A swallowed/ambiguous native result.
  await f.composition.controller.toggleCamera(); await settle();
  assert.equal(f.composition.controller.getSnapshot().video.camera, 'failed');
  assert.equal(f.model.state, 'ENDED'); await f.composition.owner().release(); await f.product.dispose();
});
test('permission-dialog foreground recovery precedes credentials and native join', async () => {
  const f = fixture(true, { media: 'video', videoCalling: true });
  const rpc = f.ports.rpc;
  f.ports.rpc = async (...args) => {
    const result = await rpc(...args);
    if (args[0] === 'rpc_connect_act' && args[1].p_action === 'accept') await f.composition.controller.setForeground(false);
    return result;
  };
  await f.composition.controller.openCall(f.model.id); await f.composition.controller.accept();
  assert.equal(f.counts().credentialCount, 0); assert.equal(f.events.includes('client-created'), false);
  f.model.state = 'ACTIVE'; f.model.connected_at = new Date().toISOString();
  await f.composition.controller.setForeground(true);
  assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
  assert.equal(f.composition.controller.getSnapshot().muted, false); assert.equal(f.cameraCounts().enabled, 0);
  await close(f);
});

for (const ended of [false, true]) test(`a background video caller revalidates on return (${ended ? 'already ended' : 'still accepted'})`, async () => {
  const f = fixture(false, { media: 'video', videoCalling: true });
  const controller = f.composition.controller;
  await f.start();
  await controller.setForeground(false);
  f.model.state = 'ACCEPTED'; f.model.version++;
  await controller.refresh();
  assert.equal(f.counts().credentialCount, 0);
  assert.equal(f.events.includes('client-created'), false);
  if (ended) { f.model.state = 'FAILED'; f.model.version++; f.model.ended_at = new Date().toISOString(); }
  await controller.setForeground(true);
  assert.equal(f.counts().credentialCount, ended ? 0 : 1);
  assert.equal(f.cameraCounts().enabled, 0);
  if (ended) {
    assert.equal(controller.getSnapshot().phase, 'FAILED');
    assert.equal(f.events.includes('client-created'), false);
  } else assert.ok(f.composition.owner());
  await close(f);
});

test('video fit options reach only the current call-owned renderer and cannot survive retirement', async () => {
  const f = await active(); const rendered = [];
  f.handle.videoPresentation = () => ({ participants: () => [], subscribe: () => () => {}, render: (...args) => { rendered.push(args); return 'offline-frame'; } });
  const source = f.composition.controller.videoPresentation();
  assert.equal(source.render('peer', false, { fit: 'cover' }), 'offline-frame');
  assert.equal(source.render('self', true, { fit: 'contain' }), 'offline-frame');
  assert.deepEqual(rendered, [['peer', false, { fit: 'cover' }], ['self', true, { fit: 'contain' }]]);
  await f.composition.controller.hangup();
  assert.equal(source.render('peer', false, { fit: 'cover' }), null);
  assert.equal(rendered.length, 2); await f.composition.owner().release(); await f.product.dispose();
});

test('a completed video camera state cannot carry into the next incoming invitation', async () => {
  const f = await active({}, true), controller = f.composition.controller;
  await controller.toggleCamera(); assert.equal(controller.getSnapshot().video.camera, 'on');
  await controller.hangup(); await f.composition.owner().release(); await settle();
  assert.equal(f.sdkState.cameraStatus, 'disabled');
  assert.equal(controller.dismissCompletedCall(), true);
  assert.equal(controller.getSnapshot().video, undefined);
  Object.assign(f.model, { id: id(50), state: 'RINGING', version: 1, connected_at: null, ended_at: null, created_at: new Date().toISOString() });
  await controller.receive({ ...f.model });
  assert.equal(controller.getSnapshot().phase, 'RINGING');
  assert.notEqual(controller.getSnapshot().video?.camera, 'on');
  assert.equal(f.cameraCounts().enabled, 1, 'The new invitation never starts another capture');
  await f.product.dispose();
});
