const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { createCodec } = require('../scripts/lib/connect-media-truth/codec.cjs');
const { challenge, matches, CLOCK_MODEL } = require('../scripts/lib/connect-media-truth/evidence.cjs');
const { classifyPhase } = require('../scripts/lib/connect-media-truth/verdict.cjs');
const { readManifest, authorize, reserve, approvedFactory } = require('../scripts/lib/connect-media-truth/approval.cjs');
const { assertLedger, ownedCall, ownedUser } = require('../scripts/lib/connect-media-truth/scope.cjs');
const { collectStats } = require('../scripts/lib/connect-media-truth/browser.cjs');
const codec = createCodec();
const target = { nonce: '1234567890abcdef9876543210fedcba', phase: 1, sender: 1 };
function decode(input, { delay = 0, amplitude = 1, noise = 0, repeats = 2, rate = 48000 } = {}) {
  const decoder = codec.decoder(rate); const output = []; let seed = 9;
  const feed = (pcm) => { for (let n = 0; n < pcm.length; n += 2048) output.push(...decoder.push(pcm.slice(n, n + 2048))); };
  feed(new Float32Array(Math.round(delay * rate)));
  for (let r = 0; r < repeats; r++) {
    const pcm = codec.encode(input, rate);
    for (let n = 0; n < pcm.length; n++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pcm[n] = amplitude * pcm[n] + noise * (seed / 2 ** 32 - 0.5); }
    feed(pcm);
  }
  return output;
}
const clock = (mono) => ({ mono, utc: new Date(1790000000000 + mono).toISOString() });
const framePair = (value) => [0, 199680].map((startSample) => ({ ...value, confidence: 0.999, minimumSymbolConfidence: 0.999, crcValid: true, sampleRate: 48000, startSample, endSample: startSample + 192000 }));
function receipt(phase = 1) {
  const trigger = { kind: phase === 1 ? 'timer-ended-get' : 'backend-end-ack', ended: phase === 1, ack: phase === 2, completed: clock(0) };
  const targets = [1, 2].map((sender) => ({ ...target, nonce: `${sender}`.repeat(32), phase, sender, generated: clock(10) }));
  const peer = (sender, mono) => ({ audio: { contextState: 'running', sourcePeak: 0.25, transmissions: [targets[sender - 1]], receivers: [{ trackId: `track-${sender}`, chunks: mono, samples: mono * 48,
    frames: framePair({ nonce: codec.controlNonce, phase: 0, sender: 3 - sender }) }] },
    peers: Object.fromEntries(['sub', 'publisher'].map((name) => [name, { connectionState: 'connected', rtp: [{
      id: `${name}-${sender}`, type: name === 'sub' ? 'inbound-rtp' : 'outbound-rtp', ssrc: sender, timestamp: mono,
      bytesReceived: 1000, packetsReceived: 20, bytesSent: mono * 10, packetsSent: mono,
    }] }])) });
  const times = phase === 1 ? [1000, 55000, 56250, 57500, 59000] : [1000, 5000, 6250, 7500, 9000];
  return { phase, trigger, targets, clockModel: CLOCK_MODEL, errors: [], windowComplete: true,
    bindings: [1, 2].map((sender) => ({ sender, userId: `fixture-${sender}`, rawSessionId: `raw-${sender}` })),
    controls: [peer(1, 1), peer(2, 1)],
    transmissions: targets.map((t) => ({ before: clock(20), completed: clock(120), transmission: { nonce: t.nonce, scheduledAudioSeconds: 0.1 } })),
    samples: times.map((mono) => ({ before: clock(mono), completed: clock(mono + 1), peers: [peer(1, mono), peer(2, mono)] })),
    cleanup: { errors: [] } };
}
test('fresh random nonce is generated strictly after a completed trigger', () => {
  let calls = 0; const trigger = { kind: 'timer-ended-get', ended: true, completed: clock(10) };
  const result = challenge(trigger, 1, 1, new Set(), () => { calls++; return Buffer.alloc(16, 7); }, () => clock(11));
  assert.equal(calls, 1); assert.equal(result.generated.mono, 11); assert.equal(result.nonce, '07'.repeat(16));
});
test('no RNG invocation before a valid trigger or with backwards time', () => {
  let calls = 0; const rng = () => { calls++; return Buffer.alloc(16, 8); };
  assert.throws(() => challenge(null, 1, 1, new Set(), rng));
  assert.throws(() => challenge({ kind: 'timer-ended-get', ended: false, completed: clock(1) }, 1, 1, new Set(), rng));
  assert.throws(() => challenge({ kind: 'timer-ended-get', ended: true, completed: clock(2) }, 1, 1, new Set(), rng, () => clock(1)));
  assert.equal(calls, 0);
});
test('blind remote decoder identifies a complete CRC-valid fresh frame', () => assert.ok(matches(decode(target, { repeats: 1 }), target, 2)));
test('wrong nonce, sender, phase and local loopback identity are rejected', () => {
  const frames = decode(target);
  for (const wrong of [{ nonce: 'ab'.repeat(16) }, { sender: 2 }, { phase: 2 }]) assert.equal(matches(frames, { ...target, ...wrong }, 2), false);
  assert.equal(matches(frames, target, 1), false);
});
test('previously generated calibration audio cannot identify the fresh challenge', () => assert.equal(matches(decode({ nonce: codec.controlNonce, phase: 0, sender: 1 }), target, 2), false));
test('seeded noise and silence produce no valid frame', () => {
  const d = codec.decoder(); let seed = 7; let found = [];
  for (let n = 0; n < 400; n++) {
    const pcm = Float32Array.from({ length: 2048 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 0.3; });
    found.push(...d.push(pcm));
  }
  found.push(...d.push(new Float32Array(4096))); assert.deepEqual(found, []);
});
test('delayed, attenuated, noisy audio decodes without an expected-nonce input', () => assert.ok(matches(decode(target, { delay: 0.137, amplitude: 0.25, noise: 0.002 }), target, 2)));
test('44.1 kHz codec control decodes independently', () => assert.ok(matches(decode(target, { rate: 44100, delay: 0.007 }), target, 2)));
test('partial frame, missing CRC or unqualified symbols cannot prove delivery', () => {
  const decoder = codec.decoder(); const pcm = codec.encode(target); const found = [];
  for (let n = 0; n < pcm.length / 2; n += 2048) found.push(...decoder.push(pcm.slice(n, Math.min(n + 2048, pcm.length / 2))));
  assert.equal(matches(found, target, 2), false);
  const one = framePair(target)[0];
  assert.equal(matches([{ ...one, crcValid: false }], target, 2), false);
  assert.equal(matches([{ ...one, minimumSymbolConfidence: 0.5 }], target, 2), false);
});
test('duplicate random nonce fails instead of retrying generation', () => {
  assert.throws(() => challenge({ kind: 'backend-end-ack', ack: true, completed: clock(0) }, 2, 1, new Set(['07'.repeat(16)]), () => Buffer.alloc(16, 7)));
});
test('fresh remote nonce proof is FAIL; no universal PASS enum exists', () => {
  const r = receipt(); r.samples.at(-1).peers[1].audio.receivers[0].frames.push(...framePair(r.targets[0]));
  assert.equal(classifyPhase(r).verdict, 'FAIL');
});
test('stable current receiver stats plus live controls produce only OBSERVED_CUTOFF', () => {
  for (const phase of [1, 2]) { const verdict = classifyPhase(receipt(phase)); assert.equal(verdict.verdict, 'OBSERVED_CUTOFF'); assert.equal(verdict.universalSecurityPass, false); }
});
test('growing cumulative RTP counters alone stay INCONCLUSIVE', () => {
  const r = receipt(); r.samples.at(-1).peers[0].peers.sub.rtp[0].bytesReceived++;
  assert.equal(classifyPhase(r).verdict, 'INCONCLUSIVE');
});
for (const [name, change] of [
  ['missing positive controls', (r) => { r.controls = []; }],
  ['failed decoder', (r) => { r.samples[0].peers[0].audio.receivers[0].error = 'failed'; }],
  ['missing stats', (r) => { r.samples[0].peers[0].peers.sub.rtp = []; }],
  ['invalid timestamps', (r) => { r.samples[0].completed.mono = NaN; }],
  ['missing UTC timestamps', (r) => { delete r.samples[0].before.utc; }],
  ['wide clock uncertainty bracket', (r) => { r.samples[0].completed.mono += 600; }],
  ['missing uncertainty declaration', (r) => { r.clockModel = {}; }],
  ['timer metadata alone', (r) => { r.targets = []; r.samples = []; }],
  ['normal end ACK alone', (r) => { r.phase = 2; r.trigger = { kind: 'backend-end-ack', ack: true, completed: clock(0) }; r.samples = []; }],
  ['SFU end event alone', (r) => { r.callEndedObserved = true; r.samples = []; }],
  ['process failure', (r) => { r.processFailure = true; }],
  ['deadline', (r) => { r.deadlineExceeded = true; }],
  ['partial window', (r) => { r.windowComplete = false; }],
  ['local PC closure', (r) => { r.localClosedAt = clock(100); }],
  ['stale stats timestamps', (r) => { r.samples.at(-1).peers[0].peers.sub.rtp[0].timestamp = 55000; }],
  ['changed SSRC binding', (r) => { r.samples.at(-1).peers[0].peers.sub.rtp[0].ssrc++; }],
  ['changed decoder track binding', (r) => { r.samples.at(-1).peers[0].audio.receivers[0].trackId = 'unexpected-track'; }],
  ['stopped publisher', (r) => { r.samples.at(-1).peers[0].peers.publisher.rtp[0].bytesSent = 1; }],
  ['silent synthetic publisher', (r) => { r.samples.forEach((s) => { s.peers[0].audio.sourcePeak = 0; }); }],
  ['wrong currently scheduled waveform', (r) => { r.samples.at(-1).peers[0].audio.transmissions = [{ nonce: 'wrong', phase: 1 }]; }],
  ['frozen decoder heartbeat', (r) => { r.samples.at(-1).peers[0].audio.receivers[0].samples = 1; }],
  ['truncated event stream', (r) => { r.telemetryTruncated = true; }],
  ['low confidence nonce', (r) => { r.samples.at(-1).peers[1].audio.receivers[0].frames.push(...framePair(r.targets[0]).map((f) => ({ ...f, confidence: 0.5 }))); r.samples.at(-1).peers[0].peers.sub.rtp[0].bytesReceived++; }],
]) test(`${name} cannot become successful cutoff`, () => { const r = receipt(); change(r); assert.equal(classifyPhase(r).verdict, 'INCONCLUSIVE'); });
test('cleanup errors remain explicit and prevent a cutoff verdict', () => {
  const r = receipt(); r.cleanup.errors.push('owned_call_cleanup_failed'); const verdict = classifyPhase(r);
  assert.equal(verdict.verdict, 'INCONCLUSIVE'); assert.ok(verdict.reasons.includes('cleanup_failed')); assert.equal(r.cleanup.errors.length, 1);
});
test('clock model explicitly marks provider offset and transmission uncertainty', () => {
  assert.match(CLOCK_MODEL.uncertainty, /Provider clock offset is UNKNOWN/); assert.match(CLOCK_MODEL.uncertainty, /not an RTP wire timestamp/);
});
test('collector preserves fresh SSRC counters, optional fields and transport states without SDP or addresses', async () => {
  const previous = globalThis.window; let bytes = 10;
  const pc = { connectionState: 'connected', iceConnectionState: 'connected', iceGatheringState: 'complete', signalingState: 'stable',
    getStats: async () => new Map([
      ['rx', { id: 'rx', type: 'inbound-rtp', kind: 'audio', ssrc: 123, trackIdentifier: 'owned-track', timestamp: bytes, bytesReceived: bytes, packetsReceived: 2, address: 'DO_NOT_EXPORT', sdp: 'DO_NOT_EXPORT' }],
      ['tx', { id: 'tx', type: 'outbound-rtp', kind: 'audio', ssrc: 456, mediaSourceId: 'source', timestamp: bytes, bytesSent: bytes }],
      ['source', { id: 'source', type: 'media-source', trackIdentifier: 'synthetic-source' }],
      ['dtls', { id: 'dtls', type: 'transport', dtlsState: 'connected', iceState: 'connected', timestamp: bytes }],
    ]) };
  globalThis.window = { auditPcs: { sub: pc, publisher: pc }, mediaTruth: { snapshot: () => ({ contextState: 'running' }) } };
  try {
    const first = await collectStats(); bytes = 12; const next = await collectStats();
    assert.equal(first.peers.sub.rtp[0].bytesReceived, 10); assert.equal(next.peers.sub.rtp[0].bytesReceived, 12);
    assert.equal(next.peers.sub.rtp[0].lastPacketReceivedTimestamp, null);
    assert.equal(next.peers.publisher.rtp[1].trackIdentifier, 'synthetic-source');
    assert.equal(next.peers.sub.transports[0].dtlsState, 'connected'); assert.equal(JSON.stringify(next).includes('DO_NOT_EXPORT'), false);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
test('expired approval prevents provider factory, credentials or network work', async () => {
  const { manifest, hash } = readManifest(); let calls = 0;
  const approval = { explicitExecutionApproval: true, experimentId: manifest.experimentId, manifestSha256: hash,
    approvedBy: 'offline-test', approvalId: 'offline-test-expired', approvedAt: '2020-01-01T00:00:00Z', expiresAt: '2020-01-01T01:00:00Z' };
  await assert.rejects(approvedFactory({ execute: true, manifest, hash, approval }, () => { calls++; }), /expired/);
  assert.equal(calls, 0);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-truth-expired-'));
  const file = path.join(directory, 'expired.json'); fs.writeFileSync(file, JSON.stringify(approval));
  try { await assert.rejects(require('../scripts/test-connect-media-truth.cjs').main(['--execute', '--approval', file]), /expired/); }
  finally { fs.unlinkSync(file); fs.rmdirSync(directory); }
});
test('manifest scope and explicit execution flag must both match approval', () => {
  const { manifest, hash } = readManifest(); const now = Date.now();
  const approval = { explicitExecutionApproval: true, experimentId: manifest.experimentId, manifestSha256: hash, approvedBy: 'offline-test', approvalId: 'offline-test-scope',
    approvedAt: new Date(now - 100).toISOString(), expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(authorize({ execute: true, manifest, hash, approval, now }), approval);
  assert.throws(() => authorize({ execute: false, manifest, hash, approval, now }));
  assert.throws(() => authorize({ execute: true, manifest, hash: 'changed', approval, now }));
  assert.equal(manifest.resources.newCallsMaximum, 1); assert.equal(manifest.resources.newOwnedUsersMaximum, 2);
});
test('single-use reservation cannot create a replacement fixture or delete by prefix', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-truth-unit-'));
  try {
    const { manifest, hash } = readManifest(); const a = { approvalId: 'offline-test-reserve' };
    const { ledger } = reserve(directory, a, manifest, hash); assertLedger(ledger, manifest, hash);
    assert.throws(() => reserve(directory, a, manifest, hash), /EEXIST/);
    assert.equal(ownedUser({ id: ledger.users[0] }, ledger), false);
    assert.equal(ownedCall({ call: { id: ledger.callId, type: 'betweener_connect' }, members: ledger.users.map((user_id) => ({ user_id })) }, ledger), false);
    assert.equal(ownedUser({ id: ledger.users[0], custom: { connect_media_truth_21: ledger.marker } }, ledger), true);
  } finally { for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); }
});
