'use strict';
// OFFLINE REVIEW PROPOSAL ONLY. Never imported by the experiment or product.
// Findings are additional axes, not replacements for historical verdicts.
const { classifyPhase } = require('../../../scripts/lib/connect-media-truth/verdict.cjs');
const { matches } = require('../../../scripts/lib/connect-media-truth/evidence.cjs');
const finite = Number.isFinite;
const stamp = (s) => finite(s?.mono) && typeof s?.utc === 'string' && finite(Date.parse(s.utc));
const rtp = (p) => p?.peers?.sub?.rtp?.filter((r) => r.type === 'inbound-rtp') ?? [];
const connected = (p) => ['sub', 'publisher'].every((k) => p?.peers?.[k]?.connectionState === 'connected');
const healthy = (p) => connected(p) && ['sub', 'publisher'].every((k) => p.peers[k].transports?.length > 0
  && p.peers[k].transports.every((t) => t.dtlsState === 'connected' && ['connected', 'completed'].includes(t.iceState)));
function validTrigger(p) {
  return stamp(p.trigger?.before) && stamp(p.trigger?.completed) && p.trigger.completed.mono >= p.trigger.before.mono
    && (p.phase === 1 ? p.trigger.kind === 'timer-ended-get' && p.trigger.ended === true
      : p.phase === 2 && p.trigger.kind === 'backend-end-ack' && p.trigger.ack === true);
}
function freshProof(p) {
  if (!validTrigger(p) || p.bindings?.length !== 2 || p.bindings[0].userId === p.bindings[1].userId
    || p.bindings[0].rawSessionId === p.bindings[1].rawSessionId) return [];
  const hits = [];
  for (let receiver = 0; receiver < 2; receiver++) {
    const sender = 1 - receiver; const t = p.targets?.[sender]; const tx = p.transmissions?.[sender];
    const binding = p.bindings[receiver]; const remote = p.bindings[sender];
    if (!binding?.userId || !binding.rawSessionId || binding.sender !== receiver + 1 || !remote?.userId
      || !remote.rawSessionId || remote.sender !== sender + 1 || !/^[0-9a-f]{32}$/.test(t?.nonce ?? '')
      || /^0+$/.test(t.nonce) || t.nonce === p.targets?.[receiver]?.nonce || t.phase !== p.phase || t.sender !== sender + 1
      || !stamp(t.generated) || t.generated.mono < p.trigger.completed.mono || !stamp(tx?.before)
      || !stamp(tx?.completed) || tx.before.mono < t.generated.mono || tx.completed.mono < tx.before.mono
      || tx.completed.mono - tx.before.mono > 2000 || tx.transmission?.nonce !== t.nonce
      || !finite(tx.transmission.scheduledAudioSeconds)) continue;
    const controls = p.controls?.[receiver]?.audio?.receivers ?? [];
    for (const s of p.samples ?? []) {
      if (!stamp(s.before) || !stamp(s.completed) || s.before.mono < tx.completed.mono
        || s.completed.mono < s.before.mono || s.completed.mono - s.before.mono > 500) continue;
      for (const r of s.peers?.[receiver]?.audio?.receivers ?? []) {
        const c = controls.find((x) => x.trackId === r.trackId && !x.error
          && matches(x.frames ?? [], { nonce: '0'.repeat(32), phase: 0, sender: sender + 1 }, receiver + 1));
        if (c && !r.error && matches(r.frames ?? [], t, receiver + 1)) hits.push({ receiver: receiver + 1, sender: sender + 1, observedBy: s.completed });
      }
    }
  }
  return hits;
}
function signalEvidence(p, context) {
  return [0, 1].map((i) => {
    const samples = p.samples ?? [];
    const endIndex = samples.findIndex((s) => s.signaling?.[i]?.events?.some((e) => e.type === 'callEnded' && stamp(e.at)));
    const closeIndex = samples.findIndex((s) => s.signaling?.[i]?.events?.some((e) => e.type === 'websocket-close'
      && stamp(e.at) && e.code === 1000 && e.clean === true));
    const badIndex = samples.findIndex((s) => !connected(s.peers?.[i]));
    const events = endIndex < 0 ? [] : samples[endIndex].signaling[i].events;
    const end = events.find((e) => e.type === 'callEnded');
    const close = closeIndex < 0 ? null : samples[closeIndex].signaling[i].events.find((e) => e.type === 'websocket-close');
    // Event timestamps share a raw-child clock only within this peer. No cross-host subtraction.
    const ordered = end && close && close.at.mono >= end.at.mono && Date.parse(close.at.utc) >= Date.parse(end.at.utc);
    return { peer: i + 1, event: end ?? null, close, firstParentCapture: endIndex < 0 ? null : samples[endIndex].completed,
      authenticatedSessionPath: context.authenticatedSessionPath === true,
      eventBeforeObservedAggregatePcLoss: endIndex >= 0 && (badIndex < 0 || endIndex < badIndex),
      cleanCloseBeforeObservedAggregatePcLoss: closeIndex >= 0 && (badIndex < 0 || closeIndex < badIndex),
      ordered: !!ordered };
  });
}
function analysePhase(p, context = {}) {
  const historical = classifyPhase(p); const fresh = freshProof(p); const signals = signalEvidence(p, context);
  const samples = p.samples ?? []; const last = samples.at(-1); const first = samples[0];
  const closedLocally = stamp(context.localCleanupStarted) && last && context.localCleanupStarted.mono <= last.completed?.mono;
  const localAction = context.voluntaryDisconnect === true || !!p.localClosedAt || !!closedLocally;
  const processFailure = context.processHealthy !== true || !!p.processFailure || !!p.errors?.length || !!p.telemetryTruncated;
  const unhealthyBefore = context.priorSample?.peers?.some((x) => !healthy(x)) === true;
  const unavailable = samples.some((s) => s.peers?.some((x) => !connected(x)));
  const signalObserved = context.authenticatedSessionPath === true && signals.every((s) => s.event);
  // This establishes correlation before aggregate PC failure, not a server-side causal timestamp.
  const correlatedLoss = signalObserved && signals.every((s) => s.ordered && s.eventBeforeObservedAggregatePcLoss
    && s.cleanCloseBeforeObservedAggregatePcLoss);
  const onlyTransportReason = historical.reasons.length > 0 && historical.reasons.every((x) => x === 'transport_closed_or_unavailable');
  const usableNegative = validTrigger(p) && context.nonCooperativeHarness === true && !localAction && !processFailure
    && !unhealthyBefore && (historical.verdict === 'OBSERVED_CUTOFF' || onlyTransportReason);
  let transport = samples.every((s) => s.peers?.length === 2 && s.peers.every(healthy))
    ? 'HEALTHY_TRANSPORTS_IN_OBSERVED_SAMPLES' : 'INCONCLUSIVE_LOWER_LAYER_TRANSPORT';
  if (processFailure) transport = 'INCONCLUSIVE_BROWSER_OR_PROCESS_FAILURE';
  else if (localAction) transport = 'VOLUNTARY_CLIENT_DISCONNECTION';
  else if (unhealthyBefore) transport = 'TRANSPORT_UNAVAILABLE_BEFORE_TRIGGER';
  else if (unavailable) transport = correlatedLoss ? 'SFU_SIGNALED_TERMINATION_WITH_TRANSPORT_LOSS' : 'INCONCLUSIVE_TRANSPORT_FAILURE';
  let media = 'INCONCLUSIVE';
  if (fresh.length) media = 'FRESH_MEDIA_AFTER_END';
  else if (usableNegative && historical.verdict === 'OBSERVED_CUTOFF'
    && samples.filter((s) => s.before.mono >= last.completed.mono - 5000).every((s) => s.peers.every(healthy))) media = 'OBSERVED_CUTOFF_WITH_CONNECTED_PEERS';
  else if (usableNegative && correlatedLoss) media = 'OBSERVED_RECEIVER_RTP_QUIESCENCE';
  const firstGrowth = [0, 1].map((i) => {
    let prior = rtp(first?.peers?.[i]); let found = null;
    for (const s of samples.slice(1)) {
      const rows = rtp(s.peers?.[i]);
      if (prior.some((r) => rows.some((n) => n.id === r.id && n.ssrc === r.ssrc
        && (n.bytesReceived > r.bytesReceived || n.packetsReceived > r.packetsReceived)))) found = { before: s.before, completed: s.completed };
      prior = rows;
    }
    return found;
  });
  return { proposalOnly: true, historical, signaling: signalObserved ? 'OBSERVED_SFU_TERMINATION' : 'NOT_ESTABLISHED',
    media, transport, freshProof: fresh, signals, lastObservedCounterGrowth: firstGrowth,
    fullWindow: p.windowComplete === true, explicitEndCausalComparison: p.phase === 2
      ? (!unhealthyBefore && !!context.priorSample && context.priorSample.peers.every(healthy) ? 'ELIGIBLE_FOR_REVIEW' : 'UNAVAILABLE') : 'NOT_APPLICABLE',
    universalSecurityPass: false };
}
function analyseBoundary(result) {
  const c = result.calls.find((x) => x.name === 'active_timer_with_end_failure');
  const ended = c.timerSamples.filter((x) => x.provider?.ended === true); const first = ended[0], last = ended.at(-1);
  return { proposalOnly: true, historicalSuiteResult: result.result, historicalTimerResultPreserved: 'FAIL',
    session: c.afterMedia.session, endedAt: first.provider.endedAt, firstEndedSampleLabel: first.sampledAt,
    lastSampleLabel: last.sampledAt, labelSemantics: 'after provider GET; before awaiting stats; completion brackets unavailable',
    receivingGrowth: first.stats.map((r, i) => ({ receiver: i + 1,
      bytes: last.stats[i].receivedAudio.bytesReceived - r.receivedAudio.bytesReceived,
      packets: last.stats[i].receivedAudio.packetsReceived - r.receivedAudio.packetsReceived })),
    signaling: ended.some((s) => s.stats.some((r) => r.callEndedObserved)) ? 'OBSERVED' : 'NOT_OBSERVED_IN_RETAINED_SAMPLES',
    media: 'POST_END_RTP_GROWTH_CONTENT_AGE_UNKNOWN', freshNonceEvidence: 'NOT_INSTRUMENTED',
    modernCutoffEvaluation: 'INELIGIBLE_MISSING_PER_SSRC_CLOCK_AND_DECODER_EVIDENCE', universalSecurityPass: false };
}
module.exports = { analysePhase, analyseBoundary, freshProof };
