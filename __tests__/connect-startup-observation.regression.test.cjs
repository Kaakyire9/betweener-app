const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, settle } = require('./fixtures/connect-product-fixture.cjs');

test('the first positive native report records packet observation without waiting for a tick or another report', async () => {
  const f = fixture(); let sample = null;
  f.handle.audioSample = () => sample;
  await f.active();
  sample = { timestamp: 1, sentBytes: 10, receivedBytes: 10, receivedPackets: 1, lostPackets: 0, jitterMs: 2, roundTripMs: 8 };
  f.emitMedia();
  const first = f.composition.controller.getSnapshot();
  assert.notEqual(first.quality.firstReceivedPacketMs, null);
  assert.equal(first.quality.firstReceiverGrowthMs, null);
  assert.equal(first.audioHealth.reception, 'awaiting');
  sample = { ...sample, timestamp: 2, receivedBytes: 20, receivedPackets: 2 };
  f.emitMedia();
  assert.equal(f.composition.controller.getSnapshot().audioHealth.reception, 'receiving');
  assert.notEqual(f.composition.controller.getSnapshot().quality.firstReceiverGrowthMs, null);
  assert.equal(f.composition.controller.getSnapshot().audioHealth.audibleOutput, 'not_verified');
  await f.product.dispose(); await f.composition.owner().release();
});

test('frozen or sender-only reports cannot manufacture a first received packet', async () => {
  const f = fixture(); let sample = { timestamp: 1, sentBytes: 10, receivedBytes: 0, receivedPackets: 0, lostPackets: 0, jitterMs: 0, roundTripMs: 0 };
  f.handle.audioSample = () => sample; await f.active(); f.emitMedia();
  sample = { ...sample, receivedBytes: 10, receivedPackets: 1 }; f.emitMedia();
  assert.equal(f.composition.controller.getSnapshot().quality.firstReceivedPacketMs, null);
  sample = { ...sample, timestamp: 2 }; f.emitMedia();
  assert.notEqual(f.composition.controller.getSnapshot().quality.firstReceivedPacketMs, null);
  await f.product.dispose(); await f.composition.owner().release();
});

test('late packet reports cannot overwrite completed-call evidence or reactivate audio', async () => {
  const f = fixture(); await f.active(); await f.composition.controller.hangup();
  await f.composition.owner().release(); await settle();
  const before = f.composition.controller.getSnapshot();
  f.handle.audioSample = () => ({ timestamp: 100, receivedPackets: 100, receivedBytes: 100 });
  f.emitMedia(); await f.composition.controller.tick();
  assert.deepEqual(f.composition.controller.getSnapshot().quality, before.quality);
  assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
  await f.product.dispose();
});
