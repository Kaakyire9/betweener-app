const test = require('node:test');
const assert = require('node:assert/strict');
const { audioSampleFromReport, createAudioHealthMonitor, AUDIO_SAMPLE_FRESHNESS_MS } = require('../features/connect/media/audio-health.ts');
const sample = (timestamp, bytes = 0) => ({ timestamp, sentBytes: bytes, receivedBytes: bytes,
  receivedPackets: bytes, lostPackets: 0, jitterMs: 3, roundTripMs: 20 });
test('first cumulative counters never certify newly received audio', () => {
  const m = createAudioHealthMonitor(); assert.equal(m.read(sample(100, 500), 1).reception, 'awaiting');
});
test('fresh receiver increments are distinct from audible hardware output', () => {
  const m = createAudioHealthMonitor(); m.read(sample(100), 1);
  const r = m.read(sample(200, 10), 20);
  assert.equal(r.reception, 'receiving'); assert.equal(r.sending, true); assert.equal(r.audibleOutput, 'not_verified');
});
test('repeated and out-of-order SDK snapshots cannot refresh frozen statistics', () => {
  for (const timestamp of [100, 99]) {
    const m = createAudioHealthMonitor(); m.read(sample(100), 1);
    assert.equal(m.read(sample(timestamp, 1000), AUDIO_SAMPLE_FRESHNESS_MS + 2).reception, 'stale');
  }
});
test('local freshness does not compare SDK and parent clock origins', () => {
  const m = createAudioHealthMonitor(); m.read(sample(9e12), 10);
  assert.equal(m.read(sample(9e12 + 1, 4), 11).reception, 'receiving');
});
test('counter resets invalidate previous receiver-growth evidence', () => {
  const m = createAudioHealthMonitor(); m.read(sample(1, 10), 1); m.read(sample(2, 20), 2);
  assert.equal(m.read(sample(3, 0), 3).reception, 'awaiting');
});
test('sender growth without remote delivery cannot claim reception', () => {
  const m = createAudioHealthMonitor(); m.read(sample(1), 1);
  const r = m.read({ ...sample(2), sentBytes: 10 }, 2);
  assert.equal(r.sending, true); assert.equal(r.reception, 'awaiting');
});
test('missing stats and a regressed local clock stay unverified', () => {
  const m = createAudioHealthMonitor(); assert.equal(m.read(null, 1).reception, 'unavailable');
  m.read(sample(1), 20); assert.equal(m.read(null, 10).reception, 'stale');
});
test('the SDK boundary drops raw stats, participant identifiers and malformed numbers', () => {
  const r = audioSampleFromReport({ timestamp: 1, rawStats: 'SECRET', datacenter: 'IP', participants: ['USER'],
    publisherAudioStats: { totalBytesSent: Infinity, averageRoundTripTimeInMs: 10 },
    subscriberAudioStats: { totalBytesReceived: -1, totalPacketsReceived: 0, averageJitterInMs: NaN } });
  assert.equal(r.sentBytes, null); assert.equal(r.receivedBytes, null); assert.equal(r.jitterMs, null);
  assert.doesNotMatch(JSON.stringify(r), /SECRET|USER|IP/);
  assert.equal(audioSampleFromReport({ timestamp: NaN }), null);
});
