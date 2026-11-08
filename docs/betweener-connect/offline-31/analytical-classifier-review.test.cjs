'use strict';
// Independent offline review. Known proposal defects remain TODO failures of
// the desired safety contract; they are not assertions that unsafe output is OK.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { analysePhase, analyseBoundary } = require('../offline-30/termination-analysis-proposal.cjs');
const { classifyPhase } = require('../../../scripts/lib/connect-media-truth/verdict.cjs');
const rawPath = 'tmp/connect-media-truth-b3-execution/approval-media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c.json.evidence.json';
const boundaryPath = 'tmp/connect-boundary/provider-results.json';
const rawBytes = fs.readFileSync(rawPath); const boundaryBytes = fs.readFileSync(boundaryPath);
const raw = JSON.parse(rawBytes); const boundary = JSON.parse(boundaryBytes);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const phase = (i = 0) => structuredClone(raw.phases[i]);
const context = { authenticatedSessionPath: true, nonCooperativeHarness: true,
  processHealthy: true, localCleanupStarted: raw.localCleanupStarted };
const rows = (s, i) => s.peers[i].peers.sub.rtp.filter(r => r.type === 'inbound-rtp');
const healthyCopy = (s) => {
  const copy = structuredClone(s);
  for (const p of copy.peers) for (const name of ['sub', 'publisher']) {
    p.peers[name].connectionState = 'connected'; p.peers[name].iceConnectionState = 'connected';
    for (const t of p.peers[name].transports) { t.dtlsState = 'connected'; t.iceState = 'connected'; }
  }
  return copy;
};
const observations = [];
function record(name, expected, actual) {
  observations.push({ name, expected, actual, desiredSafetyExpectationMet: JSON.stringify(actual) === JSON.stringify(expected) });
}
function gap(name, body) {
  test(name, { todo: 'Known isolated-proposal limitation; no runtime repair is authorized in this review' }, body);
}
test('immutable originals and B3 historical verdicts remain exact', () => {
  assert.equal(hash(rawBytes), '0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55');
  assert.equal(hash(boundaryBytes), '8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d');
  for (const p of raw.phases) assert.deepEqual(classifyPhase(p), p.verdict);
});
test('independent B3 checks corroborate bound SFU events and receiver quiescence, not a security PASS', () => {
  const p = raw.phases[0]; assert.equal(new Set(p.bindings.map(x => x.userId)).size, 2);
  assert.equal(new Set(p.bindings.map(x => x.rawSessionId)).size, 2);
  const last = p.samples.at(-1); const tail = p.samples.filter(s => s.before.mono >= last.completed.mono - 5000);
  assert.ok(tail.length >= 3); assert.ok(tail.at(-1).before.mono - tail[0].completed.mono >= 3500);
  for (let i = 0; i < 2; i++) {
    const baseline = rows(tail[0], i)[0]; let previous = -Infinity;
    for (const s of tail) {
      const r = rows(s, i)[0]; assert.equal(r.id, baseline.id); assert.equal(r.ssrc, baseline.ssrc);
      assert.equal(r.bytesReceived, baseline.bytesReceived); assert.equal(r.packetsReceived, baseline.packetsReceived);
      assert.ok(r.timestamp > previous); previous = r.timestamp;
      assert.ok(r.lastPacketReceivedTimestamp <= r.timestamp);
    }
    const events = last.signaling[i].events; const join = events.find(e => e.type === 'joinResponse');
    const end = events.find(e => e.type === 'callEnded'); const close = events.find(e => e.type === 'websocket-close');
    assert.ok(join.at.mono < end.at.mono && end.at.mono < close.at.mono);
    assert.equal(close.code, 1000); assert.equal(close.clean, true);
    assert.ok(last.peers[i].audio.receivers.every(r => !r.frames.some(f => f.nonce === p.targets[1 - i].nonce)));
  }
  assert.ok(raw.localCleanupStarted.mono > last.completed.mono);
  const a = analysePhase(p, context); assert.equal(a.signaling, 'OBSERVED_SFU_TERMINATION');
  assert.equal(a.media, 'OBSERVED_RECEIVER_RTP_QUIESCENCE'); assert.equal(a.universalSecurityPass, false);
});
test('Report 18 receiving increments are independently calculated, not fresh-content proof', () => {
  const c = boundary.calls.find(x => x.name === 'active_timer_with_end_failure');
  const ended = c.timerSamples.filter(x => x.provider.ended); assert.equal(ended.length, 2);
  assert.deepEqual(ended[1].stats.map((r, i) => r.receivedAudio.bytesReceived - ended[0].stats[i].receivedAudio.bytesReceived), [25956, 26208]);
  assert.ok(ended.every(s => s.stats.every(r => !r.callEndedObserved)));
  assert.ok(ended.every(s => s.stats.every(r => !('transports' in r) && !('timestamp' in r.receivedAudio))));
});
test('no SFU end event leaves unrelated observed loss inconclusive', () => {
  const p = phase(); for (const s of p.samples) for (const x of s.signaling) x.events = x.events.filter(e => e.type !== 'callEnded');
  const a = analysePhase(p, context); assert.equal(a.signaling, 'NOT_ESTABLISHED'); assert.equal(a.media, 'INCONCLUSIVE');
});
test('DTLS closure without SFU termination cannot become connected-peer cutoff', () => {
  const p = phase(); for (const s of p.samples) {
    for (const x of s.signaling) x.events = x.events.filter(e => e.type !== 'callEnded');
    for (const x of s.peers) for (const k of ['sub', 'publisher']) x.peers[k].connectionState = 'connected';
  }
  assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('SFU event plus sustained receiving growth refuses quiescence', () => {
  const p = phase(); for (const [n, s] of p.samples.entries()) for (let i = 0; i < 2; i++) {
    for (const r of rows(s, i)) { r.bytesReceived += n * 100; r.packetsReceived += n; }
  }
  const a = analysePhase(p, context); assert.equal(a.signaling, 'OBSERVED_SFU_TERMINATION'); assert.equal(a.media, 'INCONCLUSIVE');
});
test('synthetic temporally later fresh frame outranks SFU end signaling', () => {
  const p = phase(); const last = p.samples.at(-1); const receiver = last.peers[1].audio.receivers[0];
  const base = p.controls[1].audio.receivers[0].frames[0];
  receiver.frames.push({ ...base, nonce: p.targets[0].nonce, phase: 1, sender: 1,
    startSample: receiver.samples - 192000, endSample: receiver.samples, observed: last.peers[1].audio.clock });
  assert.equal(analysePhase(p, context).media, 'FRESH_MEDIA_AFTER_END');
});
test('frozen RTP statistics cannot establish a negative result', () => {
  const p = phase(); for (const s of p.samples) for (const r of rows(s, 0)) r.timestamp = 1;
  assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('out-of-order parent sample brackets invalidate quiescence', () => {
  const p = phase(); p.samples[1].before.mono = p.samples[0].before.mono - 1;
  assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('a deliberately incomplete observation cannot become a negative result', () => {
  const p = phase(); p.windowComplete = false; assert.equal(analysePhase(p, context).media, 'INCONCLUSIVE');
});
test('delayed metadata completion need not follow SFU signaling immediately', () => {
  const p = phase(); const shift = s => { s.mono += 1000; s.utc = new Date(Date.parse(s.utc) + 1000).toISOString(); };
  for (const s of [p.trigger.before, p.trigger.completed, ...p.targets.map(t => t.generated),
    ...p.transmissions.flatMap(t => [t.before, t.completed]), ...p.samples.flatMap(s => [s.before, s.completed])]) shift(s);
  assert.equal(analysePhase(p, context).media, 'OBSERVED_RECEIVER_RTP_QUIESCENCE');
});
test('explicit end after already failed transports has no independent comparison arm', () => {
  const a = analysePhase(raw.phases[1], { ...context, priorSample: raw.phases[0].samples.at(-1) });
  assert.equal(a.explicitEndCausalComparison, 'UNAVAILABLE'); assert.equal(a.transport, 'TRANSPORT_UNAVAILABLE_BEFORE_TRIGGER');
  assert.equal(a.media, 'INCONCLUSIVE');
});
test('voluntary local disconnect contaminates the negative finding', () => {
  assert.equal(analysePhase(phase(), { ...context, voluntaryDisconnect: true }).media, 'INCONCLUSIVE');
});
gap('AR-1 duplicate raw-session bindings must not corroborate two independent receiver streams', () => {
  const p = phase(); p.bindings[1].rawSessionId = p.bindings[0].rawSessionId;
  const a = analysePhase(p, context); record('AR-1', 'INCONCLUSIVE', a.media); assert.equal(a.media, 'INCONCLUSIVE');
});
gap('AR-2 an SFU end timestamp before its own join response must not corroborate current-session termination', () => {
  const p = phase(); for (const s of p.samples) for (const signal of s.signaling) {
    const join = signal.events.find(e => e.type === 'joinResponse');
    for (const e of signal.events) if (e.type === 'callEnded') e.at = { mono: join.at.mono - 1, utc: new Date(Date.parse(join.at.utc) - 1).toISOString() };
  }
  const a = analysePhase(p, context); record('AR-2', 'INCONCLUSIVE', a.media); assert.equal(a.media, 'INCONCLUSIVE');
});
gap('AR-3 a target attributed to already decoded control PCM cannot establish post-trigger fresh delivery', () => {
  const p = phase(); const control = p.controls[1].audio.receivers[0].frames[0];
  p.samples.at(-1).peers[1].audio.receivers[0].frames.push({ ...control, nonce: p.targets[0].nonce, phase: 1, sender: 1 });
  const a = analysePhase(p, context); record('AR-3', false, a.media === 'FRESH_MEDIA_AFTER_END'); assert.notEqual(a.media, 'FRESH_MEDIA_AFTER_END');
});
gap('AR-4 missing event stamps followed by a valid event must fail closed without throwing', () => {
  const p = phase(); for (const s of p.samples) for (const signal of s.signaling) signal.events.unshift({ type: 'callEnded' });
  let result; try { result = { throws: false, media: analysePhase(p, context).media }; } catch (e) { result = { throws: true, errorType: e.name }; }
  const expected = { throws: false, media: 'INCONCLUSIVE' };
  record('AR-4', expected, result); assert.deepEqual(result, expected);
});
gap('AR-5a a future-dated healthy snapshot is not valid pre-ACK evidence', () => {
  const p = phase(1); const prior = healthyCopy(raw.calibration);
  prior.before = { mono: p.trigger.completed.mono + 10000, utc: '2030-01-01T00:00:00Z' };
  prior.completed = { mono: prior.before.mono + 10, utc: '2030-01-01T00:00:00.010Z' };
  const a = analysePhase(p, { ...context, priorSample: prior }); record('AR-5a', 'UNAVAILABLE', a.explicitEndCausalComparison);
  assert.equal(a.explicitEndCausalComparison, 'UNAVAILABLE');
});
gap('AR-5b absent backend-end ACK cannot make a comparison eligible', () => {
  const p = phase(1); p.trigger.ack = false; const prior = healthyCopy(raw.calibration);
  const a = analysePhase(p, { ...context, priorSample: prior }); record('AR-5b', 'UNAVAILABLE', a.explicitEndCausalComparison);
  assert.equal(a.explicitEndCausalComparison, 'UNAVAILABLE');
});
gap('AR-6 fullWindow must not overstate a supplied trace cropped to its final tail', () => {
  const p = phase(); p.samples = p.samples.filter(s => s.before.mono >= p.samples.at(-1).completed.mono - 5000).map(healthyCopy);
  const a = analysePhase(p, context); record('AR-6', false, a.fullWindow);
  // Desired future coverage annotation: report actual capture span/gaps separately from the runner's completion flag.
  assert.equal(a.fullWindow, false);
});
gap('AR-7 a boundary projection with flat counters must not claim measured RTP growth', () => {
  const copy = structuredClone(boundary); const c = copy.calls.find(x => x.name === 'active_timer_with_end_failure');
  const ended = c.timerSamples.filter(s => s.provider.ended);
  for (const s of ended) for (let i = 0; i < 2; i++) s.stats[i].receivedAudio = structuredClone(ended[0].stats[i].receivedAudio);
  const a = analyseBoundary(copy); record('AR-7', false, a.media === 'POST_END_RTP_GROWTH_CONTENT_AGE_UNKNOWN');
  assert.notEqual(a.media, 'POST_END_RTP_GROWTH_CONTENT_AGE_UNKNOWN');
});
test('supplementary output never sets security gates or returns a universal success', () => {
  const a = analysePhase(raw.phases[0], context); assert.equal(a.universalSecurityPass, false);
  for (const k of ['UNIVERSAL_MEDIA_CUTOFF_VERIFIED', 'CONSENT_REVOCATION_SECURITY_PASS', 'CONNECT_M2A_SECURITY_GATE', 'CONNECT_M2B_READY']) assert.equal(k in a, false);
});
test.after(() => {
  assert.deepEqual(fs.readFileSync(rawPath), rawBytes); assert.deepEqual(fs.readFileSync(boundaryPath), boundaryBytes);
  const outputPath = `${fs.mkdtempSync('tmp/connect-analytical-review-31/probes-')}/independent-probes.json`;
  fs.writeFileSync(outputPath, JSON.stringify({
    proposalChanged: false, safetyCounterexamples: observations,
    unmetDesiredSafetyExpectations: observations.filter(x => !x.desiredSafetyExpectationMet).length,
    note: 'TODO failures are recorded limitations, not passing classifier acceptance tests.',
  }, null, 2) + '\n', { flag: 'wx' });
  console.log(`INDEPENDENT_REVIEW_PROBES=${outputPath}`);
});
