const test = require('node:test'), assert = require('node:assert/strict');
const { connectionQuality } = require('../features/connect/media/connection-quality.ts');
const { createAudioHealthMonitor, retireAudioHealth } = require('../features/connect/media/audio-health.ts');
const { fixture, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const health = { reception: 'receiving', jitterMs: 2, roundTripMs: 10, packetLossPercent: 0 };
test('quality uses fresh transport estimates and never treats unknown or stale reception as good', () => {
  assert.equal(connectionQuality(), 'unknown'); assert.equal(connectionQuality({ ...health, reception: 'stale' }), 'unknown');
  assert.equal(connectionQuality(health), 'good'); assert.equal(connectionQuality({ ...health, jitterMs: 35 }), 'fair');
  assert.equal(connectionQuality({ ...health, roundTripMs: 700 }), 'poor'); assert.equal(connectionQuality({ ...health, packetLossPercent: 9 }), 'poor');
});
test('loss percentage uses the latest interval, not the lifetime packet total', () => {
  const m = createAudioHealthMonitor(), sample = { timestamp: 1, sentBytes: 0, receivedBytes: 0, receivedPackets: 1000, lostPackets: 100, jitterMs: 0, roundTripMs: 10 };
  m.read(sample, 0);
  const next = m.read({ ...sample, timestamp: 2, receivedPackets: 1090, lostPackets: 110 }, 1000);
  assert.equal(next.packetLossPercent, 10); assert.equal(next.audibleOutput, 'not_verified');
  assert.equal(m.read(null, 9000).packetLossPercent, null); assert.equal(connectionQuality(retireAudioHealth(next)), 'unknown');
});
test('lower-data video changes only a camera-off configuration after accepted video admission', async () => {
  const f = fixture(false, { videoCalling: true, media: 'video' }), modes = [];
  f.handle.setCameraQuality = async mode => { modes.push(mode); };
  await f.active(); await f.composition.controller.toggleDataSavingVideo();
  assert.deepEqual(modes, ['data_saver']); assert.equal(f.cameraCounts().enabled, 0);
  assert.equal(f.composition.controller.getSnapshot().video.quality, 'data_saver');
  await f.composition.controller.toggleCamera(); await f.composition.controller.toggleDataSavingVideo();
  assert.deepEqual(modes, ['data_saver']); await f.product.dispose(); await f.composition.owner().release();
});
test('late quality changes after End cannot publish or alter another call view', async () => {
  const gate = deferred(), f = fixture(false, { videoCalling: true, media: 'video' }); f.handle.setCameraQuality = () => gate.promise;
  await f.active(); const changing = f.composition.controller.toggleDataSavingVideo(); await settle();
  await f.composition.controller.hangup(); gate.resolve(); await changing; await f.composition.owner().release();
  assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.cameraCounts().enabled, 0); await f.product.dispose();
});
test('voice consent never enables lower-data video controls', async () => {
  const f = fixture(); await f.active(); f.handle.setCameraQuality = () => { throw Error('voice must not reach camera configuration'); };
  await f.composition.controller.toggleDataSavingVideo(); assert.equal(f.composition.controller.getSnapshot().video, undefined);
  await f.product.dispose(); await f.composition.owner().release();
});

test('minimizing during a quality change keeps camera off and preserves the completed setting', async () => {
  const gate = deferred(), f = fixture(false, { videoCalling: true, media: 'video' }); f.handle.setCameraQuality = () => gate.promise;
  await f.active(); const changing = f.composition.controller.toggleDataSavingVideo(); await settle();
  const minimizing = f.composition.controller.minimize(); await settle(); gate.resolve(); await changing; await minimizing;
  const state = f.composition.controller.getSnapshot();
  assert.equal(state.minimized, true); assert.equal(state.video.qualityChanging, false); assert.equal(state.video.quality, 'data_saver');
  assert.equal(state.video.camera, 'off'); assert.equal(f.cameraCounts().enabled, 0); await f.product.dispose(); await f.composition.owner().release();
});
