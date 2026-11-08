import { Facts, PROFILE, audio, bracket, browserClock, finite, frameQualified, healthy, integer, list, object, receivers, rows, stamp } from './contract.ts';
import type { Context, RecordValue } from './contract.ts';
import { livePeer, snapshotIdentity } from './validation.ts';

export function inspectTransmissions(p: RecordValue, c: Context, f: Facts) {
  const targets = list(p.targets, 2).map(object); const txs = list(p.transmissions, 2).map(object); const trigger = object(p.trigger);
  if (targets.length !== 2 || txs.length !== 2) f.add('chronology', 'MISSING', 'TARGETS_OR_TRANSMISSIONS_MISSING');
  if (targets.length === 2 && targets[0].nonce === targets[1].nonce) f.add('chronology', 'INVALID', 'NONCE_REUSED');
  targets.forEach((t, i) => {
    const tx = txs[i] ?? {}; const rendered = object(tx.transmission); const e = c.participants?.[i];
    if (typeof t.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(t.nonce) || /^0+$/.test(t.nonce)
      || t.phase !== p.phase || t.sender !== i + 1 || !stamp(t.generated) || !stamp(trigger.completed)
      || t.generated.mono < trigger.completed.mono || Date.parse(t.generated.utc) < Date.parse(trigger.completed.utc)) f.add('chronology', 'INVALID', 'FRESH_TARGET_INVALID', i + 1);
    if (typeof t.nonce === 'string' && c.previouslyUsedNonces?.includes(t.nonce)) f.add('chronology', 'INVALID', 'NONCE_REPLAYED_FROM_EARLIER_PHASE', i + 1);
    if (t.triggerCompleted !== undefined && (!stamp(t.triggerCompleted) || !stamp(trigger.completed)
      || t.triggerCompleted.mono !== trigger.completed.mono || t.triggerCompleted.utc !== trigger.completed.utc)) f.add('chronology', 'INVALID', 'TARGET_TRIGGER_LINK_INVALID', i + 1);
    if (!bracket(tx, PROFILE.maximumTransmissionMs) || !stamp(t.generated) || !stamp(tx.before) || tx.before.mono < t.generated.mono
      || Date.parse(tx.before.utc) < Date.parse(t.generated.utc)
      || rendered.nonce !== t.nonce || rendered.phase !== t.phase || rendered.sender !== t.sender
      || !browserClock(rendered.before) || !browserClock(rendered.renderClockPassed) || !e
      || rendered.before.timeOrigin !== e.timeOrigin || rendered.renderClockPassed.timeOrigin !== e.timeOrigin
      || rendered.renderClockPassed.mono < rendered.before.mono || !finite(rendered.scheduledAudioSeconds)
      || Date.parse(rendered.renderClockPassed.utc) < Date.parse(rendered.before.utc)
      || rendered.scheduledAudioSeconds < rendered.before.audioSeconds || rendered.renderClockPassed.audioSeconds < rendered.scheduledAudioSeconds) {
      f.add('chronology', 'INVALID', 'SOURCE_SCHEDULING_PROVENANCE_INVALID', i + 1);
    }
  });
  return { targets, txs };
}

export function inspectCoverage(p: RecordValue, c: Context, f: Facts) {
  if (!Array.isArray(p.samples) || p.samples.length > PROFILE.maximumSamples) f.add('coverage', 'INVALID', 'SAMPLE_ARRAY_INVALID_OR_TOO_LARGE');
  const samples = list(p.samples).map(object); const trigger = object(p.trigger); let previous: RecordValue | undefined;
  let maximumGapMs = 0;
  const validSample: boolean[] = [];
  samples.forEach((s, index) => {
    const local = new Facts(); const identity = snapshotIdentity(s, c, local, index);
    if (!bracket(s)) local.add('coverage', 'INVALID', 'SAMPLE_BRACKET_INVALID', undefined, index);
    if (previous && stamp(previous.completed) && stamp(s.before)) {
      const gap = s.before.mono - previous.completed.mono;
      if (gap < 0 || (stamp(s.completed) && s.completed.mono <= previous.completed.mono)
        || Date.parse(s.before.utc) < Date.parse(previous.completed.utc)) local.add('coverage', 'INVALID', 'SAMPLE_ORDER_OR_DUPLICATE_INVALID', undefined, index);
      maximumGapMs = Math.max(maximumGapMs, gap);
      if (gap > PROFILE.maximumSampleGapMs) local.add('coverage', 'MISSING', 'SAMPLING_GAP_EXCEEDS_V2_PROFILE', undefined, index);
    }
    list(s.peers, 2).forEach((peer, i) => {
      const e = c.participants?.[i]; if (!e) return;
      livePeer(peer, e, local, index);
      for (const kind of ['sub', 'publisher'] as const) {
        const pc = object(object(object(peer).peers)[kind]); const transports = list(pc.transports, 8).map(object);
        if (!['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'].includes(String(pc.connectionState))
          || !transports.length || transports.some(t => !['new', 'connecting', 'connected', 'closed', 'failed'].includes(String(t.dtlsState))
          || !['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed'].includes(String(t.iceState)))) local.add('transport', 'MISSING', 'TRANSPORT_LAYER_EVIDENCE_MISSING', i + 1, index);
        const r = rows(peer, kind)[0] ?? {}; const priorPeer = list(previous?.peers, 2)[i]; const prior = rows(priorPeer, kind)[0];
        if (prior && (!finite(r.timestamp) || !finite(prior.timestamp) || r.timestamp <= prior.timestamp
          || (kind === 'sub' ? (r.bytesReceived as number) < (prior.bytesReceived as number) || (r.packetsReceived as number) < (prior.packetsReceived as number)
            : (r.bytesSent as number) < (prior.bytesSent as number) || (r.packetsSent as number) < (prior.packetsSent as number)))) {
          local.add(kind === 'sub' ? 'receiver' : 'source', 'INVALID', 'RTP_STATS_FROZEN_RESET_OR_REORDERED', i + 1, index);
        }
      }
      const a = audio(peer); const priorPeer = list(previous?.peers, 2)[i]; const pa = audio(priorPeer);
      const baselinePeer = list(object(c.baseline).peers, 2)[i];
      if (index === 0) for (const kind of ['sub', 'publisher'] as const) {
        const r = rows(peer, kind)[0]; const b = rows(baselinePeer, kind)[0];
        if (r && b && ((r.timestamp as number) <= (b.timestamp as number) || (kind === 'sub'
          ? (r.bytesReceived as number) < (b.bytesReceived as number) || (r.packetsReceived as number) < (b.packetsReceived as number)
          : (r.bytesSent as number) < (b.bytesSent as number) || (r.packetsSent as number) < (b.packetsSent as number)))) local.add(kind === 'sub' ? 'receiver' : 'source', 'INVALID', 'BASELINE_RTP_COUNTER_OR_CLOCK_RESET', i + 1, index);
      }
      const decoder = receivers(peer)[0] ?? {}; const priorDecoder = receivers(priorPeer)[0];
      if (priorDecoder && ((decoder.samples as number) <= (priorDecoder.samples as number) || (decoder.chunks as number) <= (priorDecoder.chunks as number)
        || !browserClock(a.clock) || !browserClock(pa.clock) || a.clock.mono <= pa.clock.mono || a.clock.audioSeconds <= pa.clock.audioSeconds)) {
        local.add('receiver', 'INVALID', 'DECODER_OR_BROWSER_CLOCK_NOT_ADVANCING', i + 1, index);
      }
    });
    validSample.push(identity && bracket(s) && local.states.coverage !== 'INVALID' && local.valid('identity', 'chronology', 'receiver', 'source'));
    for (const issue of local.issues) f.add(issue.fact, issue.kind, issue.code, issue.peer, issue.sample);
    previous = s;
  });
  const first = samples[0]; const last = samples.at(-1);
  const elapsedMs = last && stamp(last.completed) && stamp(trigger.completed) ? last.completed.mono - trigger.completed.mono : null;
  const startDelayMs = first && stamp(first.before) && stamp(trigger.completed) ? first.before.mono - trigger.completed.mono : null;
  const minimum = p.phase === 1 ? PROFILE.timerMinimumMs : PROFILE.endMinimumMs;
  const maximum = p.phase === 1 ? PROFILE.timerMaximumMs : PROFILE.endMaximumMs;
  if (samples.length < 3 || elapsedMs === null || startDelayMs === null) f.add('coverage', 'MISSING', 'OBSERVATION_INTERVAL_MISSING');
  else if (elapsedMs < minimum || elapsedMs > maximum || startDelayMs < 0 || startDelayMs > PROFILE.maximumStartDelayMs) f.add('coverage', 'MISSING', 'OBSERVATION_INTERVAL_INCOMPLETE');
  if (p.windowComplete !== true) f.add('coverage', 'MISSING', 'RUNNER_WINDOW_NOT_COMPLETE');
  const tail = last && stamp(last.completed) ? samples.filter(s => stamp(s.before) && s.before.mono >= (last.completed as { mono: number }).mono - PROFILE.stableTailMs) : [];
  const tailFirst = tail[0]; const tailLast = tail.at(-1);
  const tailSpanMs = tailFirst && tailLast && stamp(tailFirst.completed) && stamp(tailLast.before) ? tailLast.before.mono - tailFirst.completed.mono : 0;
  if (tail.length < 3 || tailSpanMs < PROFILE.minimumStableSpanMs) f.add('coverage', 'MISSING', 'STABLE_TAIL_COVERAGE_INCOMPLETE');
  let receivingFlat = tail.length >= 3; let publishersAdvancing = true;
  for (let i = 0; i < 2; i++) {
    const baseline = rows(list(tailFirst?.peers, 2)[i], 'sub')[0];
    if (!baseline || tail.some(s => rows(list(s.peers, 2)[i], 'sub').some(r => r.id !== baseline.id || r.ssrc !== baseline.ssrc
      || r.bytesReceived !== baseline.bytesReceived || r.packetsReceived !== baseline.packetsReceived))) receivingFlat = false;
    const firstTx = rows(list(tailFirst?.peers, 2)[i], 'publisher')[0]; const lastTx = rows(list(tailLast?.peers, 2)[i], 'publisher')[0];
    if (!firstTx || !lastTx || !((lastTx.bytesSent as number) > (firstTx.bytesSent as number)) || !((lastTx.packetsSent as number) > (firstTx.packetsSent as number))) publishersAdvancing = false;
    const lastAudio = audio(list(tailLast?.peers, 2)[i]); const transmission = object(list(lastAudio.transmissions, 256).at(-1)); const target = object(list(p.targets, 2)[i]);
    if (transmission.nonce !== target.nonce || transmission.phase !== p.phase || transmission.sender !== i + 1) f.add('source', 'INVALID', 'CURRENT_SOURCE_TARGET_MISMATCH', i + 1);
    const active = tail.filter(s => (audio(list(s.peers, 2)[i]).sourcePeak as number) >= PROFILE.minimumSourcePeak);
    if (active.length < 2 || !stamp(active[0]?.completed) || !stamp(active.at(-1)?.before)
      || (active.at(-1)?.before as { mono: number }).mono - (active[0]?.completed as { mono: number }).mono < PROFILE.minimumSourceSpanMs) {
      f.add('source', 'INVALID', 'SOURCE_WAVEFORM_NOT_LIVE_IN_TAIL', i + 1);
    }
  }
  if (!publishersAdvancing) f.add('source', 'INVALID', 'PUBLISHER_COUNTERS_NOT_ADVANCING');
  return { samples, validSample, runnerComplete: p.windowComplete === true, fullWindow: f.valid('coverage'),
    startDelayMs, elapsedMs, maximumGapMs, observedSpanMs: first && last && stamp(first.before) && stamp(last.completed) ? last.completed.mono - first.before.mono : null,
    tail, tailSpanMs, receivingFlat, healthyTail: tail.length > 0 && tail.every(s => list(s.peers, 2).every(healthy)) };
}

export function inspectFreshContent(p: RecordValue, c: Context, samples: RecordValue[], validSample: boolean[], headerValid: boolean, f: Facts) {
  const proofs: { receiver: number; sender: number; observedBy: unknown; pcmInterval: number[]; anchorBracket: unknown }[] = [];
  const baseline = object(c.baseline); const trigger = object(p.trigger); const targets = list(p.targets, 2).map(object); const txs = list(p.transmissions, 2).map(object);
  const rejectedIntervals = new Set<string>();
  if (!bracket(baseline) || !stamp(baseline.completed) || !stamp(trigger.before) || baseline.completed.mono > trigger.before.mono) {
    f.add('freshContent', 'MISSING', 'PRE_TRIGGER_PCM_BASELINE_MISSING_OR_LATE'); return proofs;
  }
  for (let receiver = 0; receiver < 2; receiver++) {
    const e = c.participants?.[receiver]; const target = targets[1 - receiver]; const tx = txs[1 - receiver];
    if (!e || !target || !tx || !stamp(tx.completed)) continue;
    const baselinePeer = list(baseline.peers, 2)[receiver]; const baselineDecoder = receivers(baselinePeer)[0] ?? {};
    const anchorIndex = samples.findIndex((s, index) => validSample[index] && stamp(s.before) && s.before.mono >= (tx.completed as { mono: number }).mono);
    const anchor = samples[anchorIndex]; const anchorPeer = list(anchor?.peers, 2)[receiver]; const anchorDecoder = receivers(anchorPeer)[0] ?? {}; const anchorClock = audio(anchorPeer).clock;
    const intervals = new Map<string, string>(); const provenIntervals = new Set<string>();
    for (const control of list(p.controls, 2).slice(receiver, receiver + 1).flatMap(peer => receivers(peer).flatMap(r => list(r.frames, 256)))) {
      const frame = object(control); intervals.set(`${frame.startSample}:${frame.endSample}`, `${frame.nonce}:${frame.phase}:${frame.sender}`);
    }
    samples.forEach((s, index) => {
      const peer = list(s.peers, 2)[receiver]; const a = audio(peer); const r = receivers(peer)[0] ?? {};
      if (!Array.isArray(r.frames) || r.frames.length > 256) { f.add('freshContent', 'INVALID', 'DECODED_FRAME_ARRAY_INVALID', receiver + 1, index); return; }
      const seen = new Set<string>();
      for (const value of r.frames) {
        const frame = object(value); const key = `${frame.startSample}:${frame.endSample}`; const payload = `${frame.nonce}:${frame.phase}:${frame.sender}`;
        if (seen.has(`${key}:${payload}`)) { f.add('freshContent', 'INVALID', 'DUPLICATE_FRAME_OBSERVATION', receiver + 1, index); rejectedIntervals.add(`${receiver + 1}:${key}`); }
        seen.add(`${key}:${payload}`);
        const reassigned = intervals.has(key) && intervals.get(key) !== payload;
        if (reassigned) { f.add('freshContent', 'INVALID', 'PCM_INTERVAL_REASSIGNED', receiver + 1, index); rejectedIntervals.add(`${receiver + 1}:${key}`); }
        intervals.set(key, payload);
        if (frame.nonce !== target.nonce || frame.phase !== p.phase) continue;
        if (!frameQualified(frame, target.nonce, p.phase, 2 - receiver)) { f.add('freshContent', 'INVALID', 'TARGET_FRAME_NOT_QUALIFIED', receiver + 1, index); continue; }
        const observed = frame.observed;
        if (anchorIndex < 0) { f.add('freshContent', 'MISSING', 'POST_TRIGGER_PCM_ANCHOR_MISSING', receiver + 1, index); continue; }
        if (integer(frame.startSample) && integer(anchorDecoder.samples) && integer(baselineDecoder.samples)
          && frame.startSample >= baselineDecoder.samples && frame.startSample < anchorDecoder.samples) {
          f.add('freshContent', 'MISSING', 'POST_TRIGGER_PCM_ORDER_NOT_BOUNDED', receiver + 1, index); continue;
        }
        const valid = headerValid && !reassigned && validSample[index] && anchorIndex >= 0 && index > anchorIndex
          && integer(baselineDecoder.samples) && integer(anchorDecoder.samples) && integer(r.samples)
          && integer(frame.startSample) && integer(frame.endSample) && frame.startSample >= anchorDecoder.samples
          && frame.startSample >= baselineDecoder.samples && frame.endSample <= r.samples
          && browserClock(observed) && browserClock(a.clock) && browserClock(anchorClock)
          && observed.timeOrigin === e.timeOrigin && observed.timeOrigin === a.clock.timeOrigin
          && observed.mono >= anchorClock.mono && observed.mono <= a.clock.mono
          && Date.parse(observed.utc) >= Date.parse(anchorClock.utc) && Date.parse(observed.utc) <= Date.parse(a.clock.utc)
          && observed.audioSeconds >= anchorClock.audioSeconds && observed.audioSeconds <= a.clock.audioSeconds
          && integer(frame.audioWorkletFrame) && finite(frame.sampleRate) && frame.sampleRate === e.sampleRate
          // Earliest possible first audio frame using the fixed collector batch bound.
          && frame.audioWorkletFrame - PROFILE.pcmBatchFrames - (frame.endSample - frame.startSample) >= Math.ceil(anchorClock.audioSeconds * frame.sampleRate)
          && frame.audioWorkletFrame <= Math.ceil(observed.audioSeconds * frame.sampleRate);
        if (!valid) { f.add('freshContent', 'INVALID', 'FRESH_PCM_CLOCK_PROVENANCE_INVALID', receiver + 1, index); continue; }
        if (!provenIntervals.has(key)) { provenIntervals.add(key); proofs.push({ receiver: receiver + 1, sender: 2 - receiver,
          observedBy: s.completed, pcmInterval: [frame.startSample as number, frame.endSample as number],
          anchorBracket: { before: anchor.before, completed: anchor.completed } }); }
      }
    });
  }
  return proofs.filter(proof => !rejectedIntervals.has(`${proof.receiver}:${proof.pcmInterval[0]}:${proof.pcmInterval[1]}`));
}
