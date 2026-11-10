const test = require('node:test'), assert = require('node:assert/strict');
const { createNativeSetupTimings } = require('../features/connect/media/native-setup-timings.ts');
const { deferred } = require('./fixtures/connect-product-fixture.cjs');

test('native setup spans measure completion, retain first observation, and return a copy', async () => {
  let now = 10; const q = createNativeSetupTimings(() => now), gate = deferred();
  const result = q.measure('providerReadMs', () => gate.promise); assert.deepEqual(q.snapshot(), {});
  now = 35; gate.resolve('provider result'); assert.equal(await result, 'provider result');
  assert.equal(q.snapshot().providerReadMs, 25);
  await q.measure('providerReadMs', async () => { now = 100; }); assert.equal(q.snapshot().providerReadMs, 25);
  q.snapshot().providerReadMs = 900; assert.equal(q.snapshot().providerReadMs, 25);
});

test('failed native setup records latency without changing its error or allowing clock regression', async () => {
  let now = 100; const q = createNativeSetupTimings(() => now), error = Error('synthetic');
  await assert.rejects(q.measure('mediaJoinMs', async () => { now = 150; throw error; }), value => value === error);
  assert.equal(q.snapshot().mediaJoinMs, 50);
  q.finish('microphoneInputMs', 200); assert.equal(q.snapshot().microphoneInputMs, null);
});

test('unavailable diagnostic clocks never prevent admitted setup or its cleanup', async () => {
  const q = createNativeSetupTimings(() => { throw Error('clock unavailable'); });
  assert.equal(await q.measure('mediaJoinMs', async () => 'joined'), 'joined'); assert.equal(q.snapshot().mediaJoinMs, null);
});
