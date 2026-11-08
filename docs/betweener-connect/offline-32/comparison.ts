import { Facts, PROFILE, audio, bracket, browserClock, finite, healthy, list, object, receivers, rows, stamp } from './contract.ts';
import type { Context, RecordValue } from './contract.ts';
import { livePeer, snapshotIdentity } from './validation.ts';

export function inspectComparison(p: RecordValue, c: Context, f: Facts, fullWindow: boolean) {
  if (p.phase !== 2) return { eligible: false, status: 'NOT_APPLICABLE', windowCompleted: false, causalEvidence: 'NOT_ESTABLISHED', causalProof: false };
  const trigger = object(p.trigger); const ack = c.explicitAck;
  if (!ack) f.add('comparison', 'MISSING', 'EXPLICIT_ACK_EVIDENCE_MISSING');
  else if (trigger.kind !== 'backend-end-ack' || trigger.ack !== true || ack.verified !== true || !Number.isInteger(ack.status)
    || ack.status < 200 || ack.status >= 300 || ack.callId !== c.callId || ack.providerSessionId !== c.providerSessionId
    || !bracket(ack, PROFILE.maximumTransmissionMs) || !stamp(trigger.before) || !stamp(trigger.completed)
    || ack.before.mono < trigger.before.mono || ack.completed.mono > trigger.completed.mono
    || Date.parse(ack.before.utc) < Date.parse(trigger.before.utc)
    || Date.parse(ack.completed.utc) > Date.parse(trigger.completed.utc)) f.add('comparison', 'INVALID', 'EXPLICIT_ACK_INVALID');
  const prior = object(c.priorSample); const previous = object(c.priorPreviousSample);
  if (c.priorBinding?.callId !== c.callId || c.priorBinding?.providerSessionId !== c.providerSessionId) f.add('comparison', 'INVALID', 'PRIOR_CALL_SESSION_BINDING_INVALID');
  if (!bracket(prior) || !bracket(previous) || !stamp(trigger.before)) f.add('comparison', 'MISSING', 'PRE_INTERVENTION_SAMPLE_PAIR_MISSING');
  else if (stamp(prior.completed) && stamp(previous.completed) && stamp(prior.before) && stamp(trigger.before)) {
    const age = trigger.before.mono - prior.completed.mono;
    if (age < 0 || Date.parse(prior.completed.utc) > Date.parse(trigger.before.utc)) f.add('comparison', 'INVALID', 'PRIOR_SNAPSHOT_IN_FUTURE');
    else if (age > PROFILE.maximumPriorAgeMs) f.add('comparison', 'MISSING', 'PRIOR_SNAPSHOT_STALE');
    if (previous.completed.mono > prior.before.mono || prior.before.mono - previous.completed.mono > PROFILE.maximumSampleGapMs) f.add('comparison', 'INVALID', 'PRIOR_SAMPLE_PAIR_ORDER_INVALID');
  }
  const checks = new Facts(); snapshotIdentity(prior, c, checks); snapshotIdentity(previous, c, checks);
  const peers = list(prior.peers, 2); const previousPeers = list(previous.peers, 2);
  peers.forEach((peer, i) => {
    const e = c.participants?.[i]; if (!e) return; livePeer(peer, e, checks, -1); livePeer(previousPeers[i], e, checks, -1);
    const rx = rows(peer, 'sub')[0] ?? {}; const earlier = rows(previousPeers[i], 'sub')[0] ?? {};
    if (!healthy(peer) || !healthy(previousPeers[i])) f.add('comparison', 'MISSING', 'PRE_INTERVENTION_TRANSPORT_UNAVAILABLE', i + 1);
    if (!finite(rx.timestamp) || !finite(earlier.timestamp) || rx.timestamp <= earlier.timestamp
      || !((rx.bytesReceived as number) > (earlier.bytesReceived as number)) || !((rx.packetsReceived as number) > (earlier.packetsReceived as number))
      || !finite(rx.lastPacketReceivedTimestamp) || !finite(earlier.lastPacketReceivedTimestamp)
      || rx.lastPacketReceivedTimestamp <= earlier.lastPacketReceivedTimestamp) f.add('comparison', 'MISSING', 'PRE_INTERVENTION_REMOTE_PROGRESS_UNPROVEN', i + 1);
    const tx = rows(peer, 'publisher')[0] ?? {}; const beforeTx = rows(previousPeers[i], 'publisher')[0] ?? {};
    const decoder = receivers(peer)[0] ?? {}; const beforeDecoder = receivers(previousPeers[i])[0] ?? {};
    const clock = audio(peer).clock; const beforeClock = audio(previousPeers[i]).clock;
    if (!((tx.bytesSent as number) > (beforeTx.bytesSent as number)) || !((tx.packetsSent as number) > (beforeTx.packetsSent as number))
      || !((decoder.samples as number) > (beforeDecoder.samples as number)) || !((decoder.chunks as number) > (beforeDecoder.chunks as number))
      || !browserClock(clock) || !browserClock(beforeClock) || clock.mono <= beforeClock.mono || clock.audioSeconds <= beforeClock.audioSeconds) f.add('comparison', 'MISSING', 'PRE_INTERVENTION_SOURCE_OR_DECODER_PROGRESS_UNPROVEN', i + 1);
  });
  if (!checks.valid('identity', 'chronology', 'receiver', 'source')) f.add('comparison', 'INVALID', 'PRIOR_MEDIA_PROVENANCE_INVALID');
  const history = list(c.historyBeforeTrigger);
  if (!history.length) f.add('comparison', 'MISSING', 'PRE_INTERVENTION_HISTORY_MISSING');
  history.forEach((s, i) => {
    const row = object(s); const previous = object(history[i - 1]);
    if (!bracket(row) || list(row.peers, 2).length !== 2 || !stamp(row.completed) || !stamp(trigger.before)
      || row.completed.mono > trigger.before.mono || (i > 0 && stamp(previous.completed) && stamp(row.before) && row.before.mono < previous.completed.mono)) f.add('comparison', 'INVALID', 'PRE_INTERVENTION_HISTORY_INVALID');
  });
  if (history.some(s => list(object(s).peers, 2).some(peer => !healthy(peer)))) f.add('comparison', 'MISSING', 'EARLIER_TRANSPORT_FAILURE');
  if (history.some(s => list(object(s).signaling, 2).some(signal => list(object(signal).events, PROFILE.maximumEvents).some(e => object(e).type === 'callEnded')))) f.add('comparison', 'MISSING', 'EARLIER_SFU_TERMINATION');
  const eligible = f.valid('identity', 'chronology', 'controls', 'comparison');
  return { eligible, status: !eligible ? 'UNAVAILABLE' : fullWindow ? 'COMPARISON_COMPLETED' : 'ELIGIBLE_FOR_COMPARISON',
    windowCompleted: eligible && fullWindow, causalEvidence: 'NOT_ESTABLISHED', causalProof: false };
}
