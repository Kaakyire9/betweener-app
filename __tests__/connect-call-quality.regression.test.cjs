const test = require('node:test'); const assert = require('node:assert/strict');
const { createCallQualityTracker } = require('../features/connect/voice/call-quality.ts');
test('quality timings use local observations and keep unknown results null', () => {
  const q = createCallQualityTracker(); q.mark('credentials', 100); q.mark('native_join', 120); q.mark('microphone', 220);
  q.mark('audio_output', 240); q.mark('microphone_ready', 280); q.mark('audio_output_ready', 300); q.mark('ready', 300); q.mark('received_rtp', 350);
  const r = q.snapshot(); assert.equal(r.nativeJoinMs, 100); assert.equal(r.setupMs, 200); assert.equal(r.firstReceivedPacketMs, 250);
  assert.equal(r.microphoneEnableMs, 60); assert.equal(r.outputSelectionMs, 60);
  assert.equal(r.sdkReleaseMs, null); assert.equal(r.authorityEndMs, null);
});

test('overlapping audio startup measures each acknowledgement without summing durations', () => {
  const q = createCallQualityTracker();
  for (const [event, time] of [['credentials', 0], ['native_join', 100], ['microphone', 300], ['audio_output', 300],
    ['audio_output_ready', 500], ['microphone_ready', 900], ['ready', 900]]) q.mark(event, time);
  assert.equal(q.snapshot().microphoneEnableMs, 600); assert.equal(q.snapshot().outputSelectionMs, 200);
  assert.equal(q.snapshot().setupMs, 900);
});

test('unfinished audio operations stay unknown even when the other operation finishes', () => {
  const q = createCallQualityTracker(); q.mark('microphone', 100); q.mark('audio_output', 100); q.mark('audio_output_ready', 150);
  assert.equal(q.snapshot().microphoneEnableMs, null); assert.equal(q.snapshot().outputSelectionMs, 50);
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
  assert.deepEqual(q.snapshot(), { credentialsMs: null, nativeJoinMs: null, microphoneEnableMs: null, outputSelectionMs: null, setupMs: null,
    firstReceivedPacketMs: null, firstReceiverGrowthMs: null, sdkReleaseMs: 50, authorityEndMs: 100, physicalShutdown: 'not_verified', providerMediaTermination: 'not_verified' });
});
