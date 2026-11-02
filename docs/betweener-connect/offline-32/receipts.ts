import { createHash } from 'node:crypto';
import { analyseBoundary, analysePhase } from './analysis.ts';
import { audio, list, object, receivers, rows } from './contract.ts';
import type { Context, Participant, Stamp } from './contract.ts';

export const B3_SHA256 = '0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55';
export const BOUNDARY_SHA256 = '8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d';
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Builds explicit context from one caller-supplied trace. Only replay functions below
// attest the identity of a historical artifact. This is not cryptographic authentication of a provider.
export function contextForReceipt(input: unknown, phaseIndex = 0,
  reviewedHarness = { authenticatedSessionPath: false, nonCooperativeHarness: false }): Context {
  const r = object(input); const calibration = object(r.calibration);
  const metadata = list(r.metadata).map(object).find(m => typeof object(m.session).startedAt === 'string') ?? {};
  const session = object(metadata.session); const peers = list(r.peers, 2).map(object);
  const participants: Participant[] = peers.map((peer, i) => {
    const sample = list(calibration.peers, 2)[i]; const rx = rows(sample, 'sub')[0] ?? {}; const tx = rows(sample, 'publisher')[0] ?? {};
    const decoder = receivers(sample)[0] ?? {}; const frame = object(list(decoder.frames, 256)[0]);
    return { sender: Number(peer.sender), userId: String(peer.userId ?? ''), rawSessionId: String(peer.rawSessionId ?? ''),
      trackId: String(decoder.trackId ?? ''), inboundId: String(rx.id ?? ''), inboundSsrc: Number(rx.ssrc),
      outboundId: String(tx.id ?? ''), outboundSsrc: Number(tx.ssrc), outboundTrackId: String(tx.trackIdentifier ?? ''), timeOrigin: Number(object(audio(sample).clock).timeOrigin), sampleRate: Number(frame.sampleRate) };
  });
  const earlier = list(r.phases, 8).slice(0, phaseIndex).flatMap(p => list(object(p).samples));
  const end = list(r.operations).map(object).find(o => o.op === 'end');
  const requests = list(object(end?.providerTiming).requests, 32).map(object);
  const acknowledged = requests.find(o => o.route === 'mark_ended' && o.method === 'POST');
  const cid = typeof metadata.cid === 'string' ? metadata.cid : '';
  return { schemaVersion: 2, callId: String(metadata.callId ?? ''), callType: cid.split(':')[0], cid,
    providerSessionId: String(session.id ?? ''), participants, sessionEvidence: metadata, calibration,
    baseline: earlier.at(-1) ?? calibration, priorSample: earlier.at(-1), priorPreviousSample: earlier.at(-2),
    priorBinding: { callId: String(metadata.callId ?? ''), providerSessionId: String(session.id ?? '') },
    historyBeforeTrigger: [calibration, ...earlier], authenticatedSessionPath: reviewedHarness.authenticatedSessionPath === true,
    nonCooperativeHarness: reviewedHarness.nonCooperativeHarness === true,
    previouslyUsedNonces: list(r.phases, 8).slice(0, phaseIndex).flatMap(p => list(object(p).targets, 2)).map(t => String(object(t).nonce)),
    processHealthy: r.status === 'COMPLETE' && list(r.errors).length === 0 && object(r.provenance).sourcesUnchanged === true,
    localCleanupStarted: r.localCleanupStarted,
    ...(end && acknowledged ? { explicitAck: { callId: String(metadata.callId ?? ''), providerSessionId: String(session.id ?? ''),
      verified: end.success === true, status: Number(acknowledged.status), before: end.started as Stamp, completed: end.completed as Stamp } } : {}) };
}

export function replayB3(bytes: Uint8Array) {
  if (bytes.byteLength > 32 * 1024 * 1024 || sha256(bytes) !== B3_SHA256) return { status: 'INVALID', code: 'HISTORICAL_B3_HASH_MISMATCH' };
  const r = object(JSON.parse(new TextDecoder().decode(bytes)));
  return { status: 'VALID', sha256: B3_SHA256, phases: list(r.phases, 2).map((p, i) => ({
    historical: object(p).verdict, analytical: analysePhase(p, contextForReceipt(r, i,
      { authenticatedSessionPath: true, nonCooperativeHarness: true })) })),
    runtimeIntegration: 'NOT_AUTHORISED', universalSecurityPass: false };
}
export function replayBoundary(bytes: Uint8Array) {
  if (bytes.byteLength > 1024 * 1024 || sha256(bytes) !== BOUNDARY_SHA256) return { status: 'INVALID', code: 'HISTORICAL_BOUNDARY_HASH_MISMATCH' };
  return { status: 'VALID', sha256: BOUNDARY_SHA256, historicalTimerVerdict: 'FAIL',
    analytical: analyseBoundary(JSON.parse(new TextDecoder().decode(bytes))), universalSecurityPass: false };
}
