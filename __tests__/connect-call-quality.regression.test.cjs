const test = require('node:test'); const assert = require('node:assert/strict');
const { createCallQualityTracker } = require('../features/connect/voice/call-quality.ts');
test('quality timings use local observations and keep unknown results null', () => {
  const q = createCallQualityTracker(); q.mark('credentials', 100); q.mark('native_join', 120); q.mark('microphone', 220);
  q.mark('audio_output', 240); q.mark('ready', 300); q.mark('received_rtp', 350);
  const r = q.snapshot(); assert.equal(r.nativeJoinMs, 100); assert.equal(r.setupMs, 200); assert.equal(r.firstReceivedPacketMs, 250);
  assert.equal(r.sdkReleaseMs, null); assert.equal(r.authorityEndMs, null);
});
test('duplicate and invalid timing events cannot rewrite initial observations', () => {
  const q = createCallQualityTracker(); q.mark('credentials', 10); q.mark('credentials', 999); q.mark('ready', NaN); q.mark('ready', 20);
  assert.equal(q.snapshot().setupMs, 10);
});
test('clock regression does not become a positive latency', () => {
  const q = createCallQualityTracker(); q.mark('credentials', 100); q.mark('ready', 90); assert.equal(q.snapshot().setupMs, null);
});
test('backend terminality and SDK disposal never prove provider media or hardware shutdown', () => {
  const q = createCallQualityTracker(); q.mark('end_requested', 100); q.mark('sdk_released', 150); q.mark('authority_terminal', 200);
  assert.deepEqual(q.snapshot(), { nativeJoinMs: null, microphoneEnableMs: null, outputSelectionMs: null, setupMs: null,
    firstReceivedPacketMs: null, sdkReleaseMs: 50, authorityEndMs: 100, physicalShutdown: 'not_verified', providerMediaTermination: 'not_verified' });
});
