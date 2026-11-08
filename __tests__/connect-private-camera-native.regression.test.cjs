const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { createNativePrivateCameraPreview } = require('../features/connect/media/native-private-camera-preview.ts');
const { StreamVideoClientLeaseRegistry } = require('../features/live/media/stream-video-client-leases.ts');
const { deferred, settle } = require('./fixtures/connect-product-fixture.cjs');

function captures() {
  const events = [];
  let stopFails = false;
  const track = { enabled: true, readyState: 'live', stop() { events.push('stop'); if (!stopFails) this.readyState = 'ended'; }, release() { events.push('track-release'); } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [], getVideoTracks: () => [track],
    release(value) { assert.equal(value, false); events.push('stream-detach'); }, toURL: () => 'synthetic-local-stream' };
  return { events, track, stream, stopFails(value) { stopFails = value; } };
}
async function withWebRTC(getUserMedia, operation) {
  const load = Module._load, previousRequire = globalThis.require;
  // Node strip-types evaluates TS as ESM; supply the synchronous Metro boundary.
  globalThis.require = require;
  Module._load = function (name, ...args) { return name === '@stream-io/react-native-webrtc' ? { mediaDevices: { getUserMedia }, RTCView: () => null } : Reflect.apply(load, this, [name, ...args]); };
  try { await operation(); } finally { Module._load = load; if (previousRequire) globalThis.require = previousRequire; else delete globalThis.require; }
}
const liveClient = { async disconnectUser() {} };
test('native private capture requests video without audio and shares no Live/native owner', async () => {
  const c = captures(), registry = new StreamVideoClientLeaseRegistry(); let requests = 0;
  await withWebRTC(async constraints => { requests++; assert.equal(constraints.audio, false); assert.equal(constraints.video.facingMode, 'user'); return c.stream; }, async () => {
    const preview = createNativePrivateCameraPreview({ userId: 'synthetic-user', authEpoch: 'epoch', current: () => true, registry });
    assert.equal(requests, 0); await preview.start(() => true); assert.equal(requests, 1);
    assert.throws(() => registry.acquire('live', () => liveClient), /busy/);
    await preview.stop(); assert.equal(c.track.enabled, false); assert.equal(c.track.readyState, 'ended');
    assert.deepEqual(c.events, ['stop', 'stream-detach', 'track-release']);
    const successor = registry.acquire('live', () => liveClient); await successor.release();
  });
});
test('a private camera cannot allocate while Live holds the native lease', async () => {
  const registry = new StreamVideoClientLeaseRegistry(), live = registry.acquire('live', () => liveClient); let requests = 0;
  await withWebRTC(async () => { requests++; return captures().stream; }, async () => {
    const preview = createNativePrivateCameraPreview({ userId: 'synthetic-user', authEpoch: 'epoch', current: () => true, registry });
    await assert.rejects(preview.start(() => true), /busy/); assert.equal(requests, 0); await preview.stop();
  });
  await live.release();
});
test('capture resolving after auth retirement releases its own stream without rendering', async () => {
  const c = captures(), gate = deferred(), registry = new StreamVideoClientLeaseRegistry(); let current = true;
  await withWebRTC(async () => { await gate.promise; return c.stream; }, async () => {
    const preview = createNativePrivateCameraPreview({ userId: 'synthetic-user', authEpoch: 'epoch', current: () => current, registry });
    const opening = preview.start(() => true); await settle(); current = false; gate.resolve();
    await assert.rejects(opening, /retired/); await preview.stop();
    assert.equal(preview.presentation(), null); assert.equal(c.track.readyState, 'ended');
    const successor = registry.acquire('live', () => liveClient); await successor.release();
  });
});
test('an unconfirmed native stop retains exclusive ownership until cleanup succeeds', async () => {
  const c = captures(), registry = new StreamVideoClientLeaseRegistry();
  await withWebRTC(async () => c.stream, async () => {
    const preview = createNativePrivateCameraPreview({ userId: 'synthetic-user', authEpoch: 'epoch', current: () => true, registry });
    await preview.start(() => true); c.stopFails(true);
    await assert.rejects(preview.stop(), /cleanup_unconfirmed/); assert.equal(preview.released(), false);
    assert.throws(() => registry.acquire('live', () => liveClient), /busy/);
    assert.equal(c.events.includes('track-release'), false);
    c.stopFails(false); await preview.stop(); assert.equal(preview.released(), true);
    const successor = registry.acquire('live', () => liveClient); await successor.release();
  });
});
