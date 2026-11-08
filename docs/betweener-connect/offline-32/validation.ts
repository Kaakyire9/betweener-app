import { Facts, PROFILE, audio, bracket, browserClock, finite, frameQualified, integer, list, object, receivers, rows, stamp, text } from './contract.ts';
import type { Context, Participant, RecordValue } from './contract.ts';

export function validateIdentity(p: RecordValue, c: Context, f: Facts) {
  if (c.schemaVersion !== 2 || !text(c.callId) || !text(c.callType) || !text(c.providerSessionId)
    || c.cid !== `${c.callType}:${c.callId}`) f.add('identity', 'INVALID', 'CALL_SESSION_CONTEXT_INVALID');
  const expected = list(c.participants, 2).map(object); const bindings = list(p.bindings, 2).map(object);
  if (expected.length !== 2 || bindings.length !== 2) f.add('identity', 'MISSING', 'PAIR_BINDINGS_MISSING');
  for (const field of ['userId', 'rawSessionId', 'trackId', 'inboundId', 'inboundSsrc']) {
    if (new Set(expected.map(e => e[field])).size !== 2) f.add('identity', 'INVALID', 'PARTICIPANT_ASSOCIATION_DUPLICATED');
  }
  if (new Set(bindings.map(e => e.userId)).size !== 2 || new Set(bindings.map(e => e.rawSessionId)).size !== 2) {
    f.add('identity', 'INVALID', 'USER_OR_RAW_SESSION_DUPLICATED');
  }
  expected.forEach((e, i) => {
    const b = bindings[i] ?? {};
    if (e.sender !== i + 1 || !['userId', 'rawSessionId', 'trackId', 'inboundId', 'outboundId', 'outboundTrackId'].every(k => text(e[k]))
      || !integer(e.inboundSsrc) || e.inboundSsrc > 0xffffffff || !integer(e.outboundSsrc) || e.outboundSsrc > 0xffffffff
      || !finite(e.timeOrigin) || !finite(e.sampleRate) || e.sampleRate < 8000) f.add('identity', 'INVALID', 'PARTICIPANT_CONTEXT_INVALID', i + 1);
    if (b.sender !== e.sender || b.userId !== e.userId || b.rawSessionId !== e.rawSessionId) f.add('identity', 'INVALID', 'PHASE_BINDING_MISMATCH', i + 1);
  });
  const sessionEvidence = object(c.sessionEvidence); const session = object(sessionEvidence.session);
  if (!bracket(sessionEvidence) || sessionEvidence.callId !== c.callId || sessionEvidence.cid !== c.cid
    || session.id !== c.providerSessionId || !text(session.startedAt) || !Number.isFinite(Date.parse(session.startedAt))) {
    f.add('identity', 'INVALID', 'PROVIDER_SESSION_PROVENANCE_INVALID');
  }
  const users = list(sessionEvidence.users, 2);
  if (users.length !== 2 || !expected.every(e => users.includes(e.userId))) f.add('identity', 'INVALID', 'SESSION_PARTICIPANTS_MISMATCH');
  const trigger = object(p.trigger); const provider = object(trigger.provider);
  if (stamp(sessionEvidence.completed) && stamp(trigger.before) && (sessionEvidence.completed.mono > trigger.before.mono
    || Date.parse(sessionEvidence.completed.utc) > Date.parse(trigger.before.utc))) f.add('chronology', 'INVALID', 'SESSION_PROVENANCE_AFTER_TRIGGER');
  if (p.phase === 1 && (provider.callId !== c.callId || provider.cid !== c.cid || provider.ended !== true)) f.add('identity', 'INVALID', 'ENDED_CALL_BINDING_MISMATCH');
  // An ended read can legitimately omit its session. A different supplied session is a contradiction.
  if (provider.session !== null && provider.session !== undefined && object(provider.session).id !== c.providerSessionId) f.add('identity', 'INVALID', 'ENDED_PROVIDER_SESSION_MISMATCH');
}

export function validateTrigger(p: RecordValue, f: Facts) {
  const t = object(p.trigger);
  if (!stamp(t.before) || !stamp(t.completed)) f.add('chronology', 'MISSING', 'TRIGGER_TIMESTAMP_MISSING');
  else if (t.completed.mono < t.before.mono || Date.parse(t.completed.utc) < Date.parse(t.before.utc)) f.add('chronology', 'INVALID', 'TRIGGER_BRACKET_INVERTED');
  if (p.phase === 1 ? t.kind !== 'timer-ended-get' || t.ended !== true : p.phase !== 2 || t.kind !== 'backend-end-ack' || t.ack !== true) {
    f.add('chronology', 'INVALID', 'TRIGGER_NOT_ACKNOWLEDGED');
  }
  if (!text(object(p.clockModel).uncertainty)) f.add('chronology', 'MISSING', 'CLOCK_UNCERTAINTY_UNDECLARED');
}

export function snapshotIdentity(sample: unknown, c: Context, f: Facts, index = -1) {
  const peers = list(object(sample).peers, 2);
  let valid = peers.length === 2;
  if (!valid) f.add('identity', 'MISSING', 'SNAPSHOT_PAIR_MISSING', undefined, index);
  peers.forEach((peer, i) => {
    const e = c.participants?.[i]; if (!e) { valid = false; return; }
    const rx = receivers(peer); const inbound = rows(peer, 'sub'); const outbound = rows(peer, 'publisher');
    const a = audio(peer);
    if (a.sender !== i + 1 || rx.length !== 1 || rx[0]?.receiver !== i + 1 || rx[0]?.trackId !== e.trackId
      || inbound.length !== 1 || inbound[0]?.type !== 'inbound-rtp' || inbound[0]?.id !== e.inboundId
      || inbound[0]?.ssrc !== e.inboundSsrc || inbound[0]?.trackIdentifier !== e.trackId
      || outbound.length !== 1 || outbound[0]?.type !== 'outbound-rtp' || outbound[0]?.id !== e.outboundId || outbound[0]?.ssrc !== e.outboundSsrc || outbound[0]?.trackIdentifier !== e.outboundTrackId) {
      valid = false; f.add('identity', 'INVALID', 'TRACK_SSRC_RECEIVER_BINDING_MISMATCH', i + 1, index);
    }
    if (!browserClock(a.clock)) { valid = false; f.add('chronology', 'MISSING', 'BROWSER_CLOCK_MISSING', i + 1, index); }
    else if (a.clock.timeOrigin !== e.timeOrigin) { valid = false; f.add('identity', 'INVALID', 'BROWSER_CLOCK_EPOCH_CHANGED', i + 1, index); }
  });
  return valid;
}

export function livePeer(peer: unknown, e: Participant, f: Facts, index: number) {
  const a = audio(peer); const r = receivers(peer)[0] ?? {}; const rx = rows(peer, 'sub')[0] ?? {}; const tx = rows(peer, 'publisher')[0] ?? {};
  let valid = true;
  if (a.contextState !== 'running' || r.error || !integer(r.samples) || !integer(r.chunks) || !r.samples || !r.chunks
    || r.samples !== r.chunks * PROFILE.pcmBatchFrames || !browserClock(r.lastChunk) || r.lastChunk.timeOrigin !== e.timeOrigin) {
    valid = false; f.add('receiver', 'INVALID', 'DECODER_PCM_CLOCK_NOT_LIVE', e.sender, index);
  }
  // The modem has intentional silent guard intervals. Activity is evaluated over
  // the unchanged multi-second tail contract, not demanded at every instant.
  if (!finite(a.sourcePeak) || a.sourcePeak < 0) { valid = false; f.add('source', 'INVALID', 'SOURCE_METER_INVALID', e.sender, index); }
  for (const [kind, row] of [['receiver', rx], ['source', tx]] as const) {
    if (!finite(row.timestamp) || !integer(kind === 'receiver' ? row.bytesReceived : row.bytesSent)
      || !integer(kind === 'receiver' ? row.packetsReceived : row.packetsSent)) {
      valid = false; f.add(kind, 'MISSING', 'RTP_STATISTICS_MISSING', e.sender, index);
    }
    if (finite(row.timestamp) && browserClock(a.clock)) {
      const age = a.clock.timeOrigin + a.clock.mono - row.timestamp;
      if (age < -1 || age > PROFILE.maximumBrowserStatsAgeMs) { valid = false; f.add(kind, 'INVALID', 'RTP_STATS_CLOCK_DOMAIN_OR_AGE_INVALID', e.sender, index); }
    }
  }
  if (rx.lastPacketReceivedTimestamp !== null && rx.lastPacketReceivedTimestamp !== undefined
    && (!finite(rx.lastPacketReceivedTimestamp) || !finite(rx.timestamp) || rx.lastPacketReceivedTimestamp > rx.timestamp)) {
    valid = false; f.add('receiver', 'INVALID', 'LAST_PACKET_TIMESTAMP_INVALID', e.sender, index);
  }
  return valid;
}

export function validateControls(p: RecordValue, c: Context, f: Facts) {
  const controls = list(p.controls, 2); const calibration = object(c.calibration);
  if (!bracket(calibration) || controls.length !== 2) { f.add('controls', 'MISSING', 'CALIBRATION_BRACKET_OR_CONTROLS_MISSING'); return; }
  const trigger = object(p.trigger);
  if (stamp(calibration.completed) && stamp(trigger.before) && calibration.completed.mono > trigger.before.mono) f.add('controls', 'INVALID', 'CALIBRATION_AFTER_TRIGGER');
  snapshotIdentity({ peers: controls }, c, f);
  controls.forEach((peer, i) => {
    const r = receivers(peer)[0] ?? {}; const a = audio(peer); const expected = c.participants[i];
    if (!expected || a.contextState !== 'running' || r.error || !integer(r.samples) || !integer(r.chunks)
      || r.samples !== r.chunks * PROFILE.pcmBatchFrames || !list(r.frames, 256).map(object).some(frame =>
        frameQualified(frame, '0'.repeat(32), 0, 2 - i) && integer(frame.endSample) && frame.endSample <= (r.samples as number)
        && browserClock(frame.observed) && browserClock(a.clock) && frame.observed.timeOrigin === expected.timeOrigin
        && frame.observed.mono <= a.clock.mono && frame.observed.audioSeconds <= a.clock.audioSeconds
        && integer(frame.audioWorkletFrame) && frame.audioWorkletFrame <= frame.observed.audioSeconds * (frame.sampleRate as number))) f.add('controls', 'INVALID', 'INDEPENDENT_CONTROL_NOT_QUALIFIED', i + 1);
  });
}
