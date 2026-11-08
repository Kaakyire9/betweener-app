'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { analysePhase, analyseBoundary } = require('./termination-analysis-proposal.cjs');
const { CLOCK_MODEL } = require('../../../scripts/lib/connect-media-truth/evidence.cjs');
const { classifyPhase } = require('../../../scripts/lib/connect-media-truth/verdict.cjs');
const clock = (mono) => ({ mono, utc: new Date(1790000000000 + mono).toISOString() });
const frame = (t) => ({ ...t, confidence: 0.999, minimumSymbolConfidence: 0.999, crcValid: true,
  sampleRate: 48000, startSample: 0, endSample: 192000 });
const context = { authenticatedSessionPath: true, nonCooperativeHarness: true, processHealthy: true };
function fixture({ events = true, failed = true } = {}) {
  const targets = [1, 2].map((sender) => ({ nonce: `${sender}`.repeat(32), sender, phase: 1, generated: clock(10) }));
  const peer = (sender, mono) => ({ audio: { contextState: 'running', sourcePeak: 0.25, transmissions: [targets[sender - 1]],
    receivers: [{ trackId: `track-${sender}`, chunks: mono + 1000, samples: (mono + 1000) * 48,
      frames: [frame({ nonce: '0'.repeat(32), phase: 0, sender: 3 - sender })] }] },
  peers: Object.fromEntries(['sub', 'publisher'].map((k) => [k, { connectionState: failed && mono >= 4000 ? 'failed' : 'connected',
    transports: [{ dtlsState: failed && mono >= 4000 ? 'closed' : 'connected', iceState: failed && mono >= 4000 ? 'failed' : 'connected' }],
    rtp: [{ id: `${k}-${sender}`, ssrc: sender, type: k === 'sub' ? 'inbound-rtp' : 'outbound-rtp', timestamp: mono,
      bytesReceived: 1000, packetsReceived: 20, bytesSent: mono * 10, packetsSent: mono }] }])) });
  return { phase: 1, trigger: { kind: 'timer-ended-get', ended: true, before: clock(-10), completed: clock(0) },
    targets, bindings: [1, 2].map((sender) => ({ sender, userId: `fixture-${sender}`, rawSessionId: `raw-${sender}` })),
    clockModel: CLOCK_MODEL, controls: [peer(1, -100), peer(2, -100)], errors: [], windowComplete: true,
    transmissions: targets.map((t) => ({ before: clock(20), completed: clock(120), transmission: { nonce: t.nonce, scheduledAudioSeconds: 1 } })),
    samples: [1000, 2000, 4000, 55000, 56000, 57000, 58000, 59000].map((mono) => ({ before: clock(mono), completed: clock(mono + 1),
      peers: [peer(1, mono), peer(2, mono)], signaling: [1, 2].map(() => ({ events: events ? [
        { type: 'callEnded', at: clock(500) }, ...(mono >= 2000 ? [{ type: 'websocket-close', at: clock(1500), code: 1000, clean: true }] : [])] : [] })) })),
    cleanup: { errors: [] } };
}
function addFresh(p) { p.samples.at(-1).peers[1].audio.receivers[0].frames.push(frame(p.targets[0])); }
test('synthetic clean provider signaling plus independent quiet tail is descriptive quiescence, never security PASS', () => {
  const p = fixture(); const before = JSON.stringify(p); const result = analysePhase(p, context);
  assert.equal(result.historical.verdict, 'INCONCLUSIVE'); assert.equal(result.signaling, 'OBSERVED_SFU_TERMINATION');
  assert.equal(result.media, 'OBSERVED_RECEIVER_RTP_QUIESCENCE');
  assert.equal(result.transport, 'SFU_SIGNALED_TERMINATION_WITH_TRANSPORT_LOSS');
  assert.equal(result.universalSecurityPass, false); assert.equal(JSON.stringify(p), before);
});
test('unrelated ICE failure cannot become provider-enforced cutoff', () => {
  const r = analysePhase(fixture({ events: false }), context);
  assert.equal(r.transport, 'INCONCLUSIVE_TRANSPORT_FAILURE'); assert.equal(r.media, 'INCONCLUSIVE');
});
test('client voluntary close remains contaminated even with SFU events', () => {
  const r = analysePhase(fixture(), { ...context, voluntaryDisconnect: true });
  assert.equal(r.transport, 'VOLUNTARY_CLIENT_DISCONNECTION'); assert.equal(r.media, 'INCONCLUSIVE');
});
test('local cleanup during observation prevents a negative finding', () => {
  assert.equal(analysePhase(fixture(), { ...context, localCleanupStarted: clock(3000) }).media, 'INCONCLUSIVE');
});
test('browser/process failure cannot establish cessation', () => {
  const p = fixture(); p.processFailure = true; const r = analysePhase(p, context);
  assert.equal(r.media, 'INCONCLUSIVE'); assert.equal(r.transport, 'INCONCLUSIVE_BROWSER_OR_PROCESS_FAILURE');
});
test('stale stats timestamps invalidate otherwise perfect signaling/closure', () => {
  const p = fixture(); p.samples.at(-1).peers[0].peers.sub.rtp[0].timestamp = 55000;
  assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('local sending advancement and live decoder alone do not prove receiver delivery or server cutoff', () => {
  assert.equal(analysePhase(fixture({ events: false }), context).media, 'INCONCLUSIVE');
});
test('SFU event without media cutoff retains signaling but refuses cessation', () => {
  const p = fixture(); p.samples.at(-1).peers[0].peers.sub.rtp[0].bytesReceived++;
  const r = analysePhase(p, context); assert.equal(r.signaling, 'OBSERVED_SFU_TERMINATION'); assert.equal(r.media, 'INCONCLUSIVE');
});
test('cutoff with connected raw peers is separate and does not require an SFU event', () => {
  const r = analysePhase(fixture({ events: false, failed: false }), context);
  assert.equal(r.media, 'OBSERVED_CUTOFF_WITH_CONNECTED_PEERS'); assert.equal(r.signaling, 'NOT_ESTABLISHED');
});
test('one late early-window packet has unknown content and permits only a later quiet-tail observation', () => {
  const p = fixture(); for (const s of p.samples.slice(1)) { const r = s.peers[1].peers.sub.rtp[0]; r.bytesReceived += 81; r.packetsReceived++; }
  const r = analysePhase(p, context); assert.equal(r.freshProof.length, 0); assert.equal(r.media, 'OBSERVED_RECEIVER_RTP_QUIESCENCE');
});
test('a late tail packet invalidates the stable tail', () => {
  const p = fixture(); p.samples.at(-1).peers[1].peers.sub.rtp[0].packetsReceived++;
  assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('fresh qualified remote nonce dominates end events and failed transports', () => {
  const p = fixture(); addFresh(p); const r = analysePhase(p, context);
  assert.equal(r.media, 'FRESH_MEDIA_AFTER_END'); assert.equal(r.historical.verdict, 'FAIL');
});
test('positive fresh proof survives an incomplete later window without turning the negative finding into success', () => {
  const p = fixture(); addFresh(p); p.windowComplete = false;
  assert.equal(analysePhase(p, context).media, 'FRESH_MEDIA_AFTER_END');
});
test('positive receipt remains independently visible if a later process failure masks it in the original classifier', () => {
  const p = fixture(); addFresh(p); p.processFailure = true;
  const r = analysePhase(p, context); assert.equal(r.historical.verdict, 'INCONCLUSIVE'); assert.equal(r.media, 'FRESH_MEDIA_AFTER_END');
});
for (const [name, change] of [
  ['missing trigger timestamp', p => { delete p.trigger.completed; }],
  ['inverted sample bracket', p => { p.samples[0].completed.mono = -100; }],
  ['missing UTC stamp', p => { delete p.samples[0].before.utc; }],
  ['incomplete comparison window', p => { p.windowComplete = false; }],
  ['missing decoder controls', p => { p.controls = []; }],
  ['stopped source', p => { p.samples.forEach(s => { s.peers[0].audio.sourcePeak = 0; }); }],
  ['unbound SSRC', p => { p.samples.at(-1).peers[0].peers.sub.rtp[0].ssrc++; }],
]) test(`${name} cannot establish cessation`, () => { const p = fixture(); change(p); assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE'); });
test('unqualified event origin cannot explain transport failure', () => {
  const r = analysePhase(fixture(), { ...context, authenticatedSessionPath: false });
  assert.equal(r.signaling, 'NOT_ESTABLISHED'); assert.equal(r.media, 'INCONCLUSIVE');
});
test('failure before provider-ended evidence is separately marked', () => {
  const p = fixture(); const prior = structuredClone(p.samples.at(-1));
  const r = analysePhase(p, { ...context, priorSample: prior });
  assert.equal(r.transport, 'TRANSPORT_UNAVAILABLE_BEFORE_TRIGGER'); assert.equal(r.media, 'INCONCLUSIVE');
});
test('invalid CRC, identity, old nonce and weak confidence cannot prove fresh audio', () => {
  for (const change of [f => { f.crcValid = false; }, f => { f.sender = 2; }, f => { f.nonce = '0'.repeat(32); }, f => { f.confidence = 0.5; }]) {
    const p = fixture(); addFresh(p); change(p.samples.at(-1).peers[1].audio.receivers[0].frames.at(-1));
    assert.notEqual(analysePhase(p, context).media, 'FRESH_MEDIA_AFTER_END');
  }
});
test('synthetic event after failure cannot authenticate the cause of earlier media loss', () => {
  const p = fixture(); p.samples.slice(0, 3).forEach(s => { s.signaling = [{ events: [] }, { events: [] }]; });
  const r = analysePhase(p, context); assert.equal(r.signaling, 'OBSERVED_SFU_TERMINATION'); assert.equal(r.media, 'INCONCLUSIVE');
});
test('aggregate connected with closed DTLS is not the connected-cutoff category', () => {
  const p = fixture({ events: false, failed: false }); p.samples.forEach(s => { s.peers[0].peers.sub.transports[0].dtlsState = 'closed'; });
  const r = analysePhase(p, context); assert.equal(r.historical.verdict, 'OBSERVED_CUTOFF'); assert.equal(r.media, 'INCONCLUSIVE');
});
test('missing lower-layer stats cannot establish healthy connected cutoff', () => {
  const p = fixture({ events: false, failed: false }); p.samples.forEach(s => { delete s.peers[0].peers.sub.transports; });
  assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('reversed SFU event/close ordering refuses a correlated termination finding', () => {
  const p = fixture(); for(const s of p.samples) for(const peer of s.signaling) for(const e of peer.events) if(e.type==='websocket-close') e.at=clock(100);
  assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('B3 original receipt is unchanged and both historical verdicts replay exactly', () => {
  const p = 'tmp/connect-media-truth-b3-execution/approval-media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c.json.evidence.json';
  const bytes = fs.readFileSync(p); assert.equal(createHash('sha256').update(bytes).digest('hex'), '0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55');
  const r = JSON.parse(bytes); const a = analysePhase(r.phases[0], { ...context, localCleanupStarted: r.localCleanupStarted });
  const b = analysePhase(r.phases[1], { ...context, localCleanupStarted: r.localCleanupStarted, priorSample: r.phases[0].samples.at(-1) });
  assert.equal(a.media, 'OBSERVED_RECEIVER_RTP_QUIESCENCE'); assert.equal(a.signaling, 'OBSERVED_SFU_TERMINATION');
  assert.equal(b.media, 'INCONCLUSIVE'); assert.equal(b.explicitEndCausalComparison, 'UNAVAILABLE');
  for (const p of r.phases) assert.deepEqual(classifyPhase(p), p.verdict);
  assert.deepEqual(fs.readFileSync(p), bytes);
});
test('Report 18 original retains post-ended RTP growth without invented fresh-content or clock evidence', () => {
  const p = 'tmp/connect-boundary/provider-results.json'; const bytes = fs.readFileSync(p);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d');
  const a = analyseBoundary(JSON.parse(bytes)); assert.deepEqual(a.receivingGrowth.map(x => [x.bytes, x.packets]), [[25956, 103], [26208, 104]]);
  assert.equal(a.signaling, 'NOT_OBSERVED_IN_RETAINED_SAMPLES'); assert.equal(a.freshNonceEvidence, 'NOT_INSTRUMENTED');
  assert.deepEqual(fs.readFileSync(p), bytes);
});
