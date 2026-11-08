import { Facts, PROFILE, bracket, healthy, list, object, rows, stamp } from './contract.ts';
import type { Context, RecordValue } from './contract.ts';
import { snapshotIdentity, validateControls, validateIdentity, validateTrigger } from './validation.ts';
import { inspectSignaling } from './signaling.ts';
import { inspectCoverage, inspectFreshContent, inspectTransmissions } from './media.ts';
import { inspectComparison } from './comparison.ts';

const inconclusive = (code: string) => {
  const f = new Facts();
  for (const name of Object.keys(f.states) as (keyof Facts['states'])[]) f.add(name, 'MISSING', 'INPUT_NOT_EVALUATED');
  f.add('identity', 'INVALID', code);
  return { schemaVersion: 2, proposalOnly: true, media: 'INCONCLUSIVE',
    signaling: 'NOT_ESTABLISHED', transport: 'INCONCLUSIVE_TRANSPORT_FAILURE', fullWindow: false,
    explicitEndCausalComparison: 'UNAVAILABLE', universalSecurityPass: false, securityGateAuthority: 'NONE',
    facts: Object.fromEntries(Object.entries(f.states).map(([name, status]) => [name, { status, codes: f.issues.filter(x => x.fact === name).map(x => x.code) }])),
    issues: f.issues, freshProof: [], comparison: { eligible: false, status: 'UNAVAILABLE', windowCompleted: false, causalEvidence: 'NOT_ESTABLISHED', causalProof: false } };
};

export function analysePhase(input: unknown, context: unknown = {}) {
  try {
    const p = object(input); const c = object(context) as unknown as Context; const f = new Facts();
    validateIdentity(p, c, f); validateTrigger(p, f); validateControls(p, c, f);
    if (c.authenticatedSessionPath !== true) f.add('identity', 'MISSING', 'AUTHENTICATED_PROVIDER_PROVENANCE_MISSING');
    if (c.nonCooperativeHarness !== true) f.add('coverage', 'MISSING', 'NONCOOPERATIVE_SOURCE_PROVENANCE_MISSING');
    const baseline = object(c.baseline);
    if (!bracket(baseline) || !stamp(baseline.completed) || !stamp(object(p.trigger).before)) f.add('chronology', 'MISSING', 'BASELINE_BRACKET_MISSING');
    else if (baseline.completed.mono > (object(p.trigger).before as { mono: number }).mono
      || Date.parse(baseline.completed.utc) > Date.parse((object(p.trigger).before as { utc: string }).utc)) f.add('chronology', 'INVALID', 'BASELINE_AFTER_TRIGGER');
    snapshotIdentity(baseline, c, f);
    inspectTransmissions(p, c, f);
    const headerValid = f.valid('identity', 'chronology', 'controls');
    const coverage = inspectCoverage(p, c, f); const signaling = inspectSignaling(coverage.samples, c, f);
    const freshProof = inspectFreshContent(p, c, coverage.samples, coverage.validSample, headerValid, f);
    const last = coverage.samples.at(-1); const localCleanup = c.localCleanupStarted;
    const voluntary = c.voluntaryDisconnect === true || p.localClosedAt !== undefined
      || (stamp(localCleanup) && last && stamp(last.completed) && localCleanup.mono <= last.completed.mono);
    if (voluntary) f.add('coverage', 'INVALID', 'VOLUNTARY_LOCAL_CLEANUP_DURING_MEASUREMENT');
    if (c.processHealthy !== true || p.processFailure || p.deadlineExceeded || p.telemetryTruncated || list(p.errors).length || list(object(p.cleanup).errors).length) {
      f.add('coverage', 'INVALID', 'MEASUREMENT_PROCESS_OR_CLEANUP_INCOMPLETE');
    }
    const preexistingLoss = list(baseline.peers, 2).some(peer => !healthy(peer));
    const comparison = inspectComparison(p, c, f, coverage.fullWindow && f.valid('identity', 'chronology', 'controls', 'coverage', 'receiver', 'source', 'transport', 'freshContent'));
    const negativeValid = headerValid && c.nonCooperativeHarness === true && !preexistingLoss
      && f.valid('identity', 'chronology', 'controls', 'coverage', 'receiver', 'source', 'transport', 'freshContent')
      && f.states.sfuEvent !== 'INVALID' && (p.phase !== 2 || comparison.eligible);
    let media = 'INCONCLUSIVE';
    if (freshProof.length > 0) media = 'FRESH_MEDIA_AFTER_END';
    else if (negativeValid && coverage.receivingFlat && coverage.healthyTail) media = 'OBSERVED_CUTOFF_WITH_CONNECTED_PEERS';
    else if (negativeValid && coverage.receivingFlat && signaling.corroborated && signaling.cleanClosures) media = 'OBSERVED_RECEIVER_RTP_QUIESCENCE';
    if (comparison.eligible && comparison.windowCompleted && media === 'OBSERVED_RECEIVER_RTP_QUIESCENCE'
      && signaling.association === 'FIRST_OBSERVED_AFTER_BASELINE') comparison.causalEvidence = 'CORROBORATED_TEMPORAL_ASSOCIATION_ONLY';
    const layer = (name: string) => coverage.samples.map(s => list(s.peers, 2).map(peer => {
      const pc = object(object(object(peer).peers)[name]); return { aggregate: pc.connectionState ?? null,
        iceProperty: pc.iceConnectionState ?? null, layers: list(pc.transports, 8).map(t => ({ dtls: object(t).dtlsState ?? null, ice: object(t).iceState ?? null })) };
    }));
    const transport = voluntary ? 'VOLUNTARY_CLIENT_DISCONNECTION' : preexistingLoss ? 'TRANSPORT_UNAVAILABLE_BEFORE_TRIGGER'
      : !coverage.healthyTail ? signaling.corroborated ? 'SFU_SIGNALED_TERMINATION_WITH_TRANSPORT_LOSS' : 'INCONCLUSIVE_TRANSPORT_FAILURE'
        : 'HEALTHY_TRANSPORTS_IN_OBSERVED_TAIL';
    return { schemaVersion: 2, proposalOnly: true, profile: PROFILE.version, media,
      signaling: signaling.corroborated ? 'OBSERVED_SFU_TERMINATION' : 'NOT_ESTABLISHED', transport,
      fullWindow: coverage.fullWindow && f.valid('coverage'), runnerWindowComplete: coverage.runnerComplete,
      explicitEndCausalComparison: comparison.eligible ? 'ELIGIBLE_FOR_REVIEW' : 'UNAVAILABLE',
      facts: Object.fromEntries(Object.entries(f.states).map(([name, status]) => [name, { status, codes: f.issues.filter(x => x.fact === name).map(x => x.code) }])),
      issues: f.issues, freshProof, comparison,
      axes: { providerEndedMetadata: p.phase === 1 && object(p.trigger).ended === true ? 'OBSERVED' : 'NOT_A_TIMER_METADATA_TRIGGER',
        sfu: signaling, sourceNonCooperationReviewed: c.nonCooperativeHarness === true,
        localCleanupDuringMeasurement: !!voluntary, sub: layer('sub'), publisher: layer('publisher') },
      receiverSummary: [0, 1].map(i => { const a = rows(list(coverage.samples[0]?.peers, 2)[i], 'sub')[0]; const b = rows(list(last?.peers, 2)[i], 'sub')[0];
        return { receiver: i + 1, id: b?.id ?? null, ssrc: b?.ssrc ?? null, firstBytes: a?.bytesReceived ?? null, lastBytes: b?.bytesReceived ?? null,
          firstPackets: a?.packetsReceived ?? null, lastPackets: b?.packetsReceived ?? null, lastPacketTimestamp: b?.lastPacketReceivedTimestamp ?? null }; }),
      coverage: { profileVersion: PROFILE.version, runnerClaim: coverage.runnerComplete, measuredValid: coverage.fullWindow && f.valid('coverage'),
        firstBracket: coverage.samples[0] ? { before: coverage.samples[0].before, completed: coverage.samples[0].completed } : null,
        lastBracket: last ? { before: last.before, completed: last.completed } : null, startDelayMs: coverage.startDelayMs,
        elapsedMs: coverage.elapsedMs, sampleSpanMs: coverage.observedSpanMs, maximumGapMs: coverage.maximumGapMs,
        tailSpanMs: coverage.tailSpanMs, sampleCount: coverage.samples.length, receiverTailFlat: coverage.receivingFlat },
      universalSecurityPass: false, securityGateAuthority: 'NONE' };
  } catch {
    return inconclusive('MALFORMED_OR_UNSUPPORTED_INPUT');
  }
}

// Generic aggregate projection. It cannot attest historical verdicts or independent identities.
export function analyseBoundary(input: unknown) {
  try {
    const c = list(object(input).calls, 8).map(object).find(c => c.name === 'active_timer_with_end_failure');
    if (!c) return { media: 'INCONCLUSIVE', status: 'MISSING', codes: ['BOUNDARY_CALL_MISSING'], universalSecurityPass: false };
    const ended = list(c.timerSamples).map(object).filter(s => object(s.provider).ended === true);
    if (ended.length < 2 || ended.some((s, i) => typeof s.sampledAt !== 'string' || !Number.isFinite(Date.parse(s.sampledAt))
      || (i > 0 && Date.parse(s.sampledAt) <= Date.parse(ended[i - 1].sampledAt as string)) || list(s.stats, 2).length !== 2)) {
      return { media: 'INCONCLUSIVE', status: 'INVALID', codes: ['BOUNDARY_SAMPLES_INVALID'], universalSecurityPass: false };
    }
    const growth = [0, 1].map(i => {
      let bytes = 0; let packets = 0; let previous: RecordValue | null = null;
      for (const s of ended) {
        const r = object(object(list(s.stats, 2)[i]).receivedAudio);
        if (!Number.isSafeInteger(r.bytesReceived) || !Number.isSafeInteger(r.packetsReceived) || (r.bytesReceived as number) < 0 || (r.packetsReceived as number) < 0
          || (previous && ((r.bytesReceived as number) < (previous.bytesReceived as number) || (r.packetsReceived as number) < (previous.packetsReceived as number)))) throw new Error('invalid_counter');
        if (previous) { bytes += (r.bytesReceived as number) - (previous.bytesReceived as number); packets += (r.packetsReceived as number) - (previous.packetsReceived as number); }
        previous = r;
      }
      return { receiver: i + 1, bytes, packets };
    });
    return { media: growth.some(g => g.bytes > 0 || g.packets > 0) ? 'POST_END_RTP_GROWTH_CONTENT_AGE_UNKNOWN' : 'NO_POST_END_RTP_GROWTH_OBSERVED',
      status: 'VALID', codes: [], receivingGrowth: growth, identityScope: 'ARRAY_ORDER_ONLY_NOT_INDEPENDENTLY_ATTESTED',
      signaling: ended.some(s => list(s.stats, 2).some(r => object(r).callEndedObserved === true)) ? 'OBSERVED' : 'NOT_OBSERVED_IN_RETAINED_SAMPLES',
      freshNonceEvidence: 'NOT_INSTRUMENTED', timerOnlyCutoffBound: 'UNPROVEN', historicalVerdict: 'NOT_ATTESTED_BY_GENERIC_PROJECTION', universalSecurityPass: false };
  } catch { return { media: 'INCONCLUSIVE', status: 'INVALID', codes: ['BOUNDARY_COUNTERS_OR_SCHEMA_INVALID'], universalSecurityPass: false }; }
}
