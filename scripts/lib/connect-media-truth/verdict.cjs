const { matches } = require('./evidence.cjs');
const { createCodec } = require('./codec.cjs');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const validStamp = (x) => finite(x?.mono) && typeof x?.utc === 'string' && Number.isFinite(Date.parse(x.utc));
function rows(peer, type) { return peer?.peers?.[type === 'inbound-rtp' ? 'sub' : 'publisher']?.rtp?.filter((r) => r.type === type) ?? []; }
function control(peer, sender) {
  return peer?.audio?.contextState === 'running' && peer.audio.receivers?.some((r) => !r.error
    && matches(r.frames ?? [], { nonce: createCodec().controlNonce, phase: 0, sender: 3 - sender }, sender));
}
function classify(receipt) {
  const reasons = []; const value = (verdict) => ({ verdict, reasons, clockModel: receipt.clockModel ?? null });
  const phase = receipt.phase;
  const trigger = receipt.trigger;
  if (![1, 2].includes(phase) || !trigger || !validStamp(trigger.completed)
    || (phase === 1 ? trigger.kind !== 'timer-ended-get' || trigger.ended !== true : trigger.kind !== 'backend-end-ack' || trigger.ack !== true)) reasons.push('valid_trigger_missing');
  if (!receipt.clockModel?.uncertainty) reasons.push('clock_uncertainty_missing');
  if (receipt.errors?.length || receipt.deadlineExceeded || receipt.processFailure || receipt.telemetryTruncated) reasons.push('incomplete_or_failed_process');
  if (receipt.cleanup?.errors?.length) reasons.push('cleanup_failed');
  if (!receipt.bindings?.every((b, i) => b.sender === i + 1 && b.userId && b.rawSessionId) || receipt.bindings?.length !== 2
    || receipt.bindings?.[0]?.userId === receipt.bindings?.[1]?.userId) reasons.push('remote_identity_binding_missing');
  if (receipt.controls?.length !== 2 || !receipt.controls.every((p, i) => control(p, i + 1))) reasons.push('positive_decoder_controls_missing');
  const targets = receipt.targets ?? []; const tx = receipt.transmissions ?? [];
  if (targets.length !== 2 || targets.some((t, i) => t.sender !== i + 1 || t.phase !== phase || !/^[0-9a-f]{32}$/.test(t.nonce)
    || /^0+$/.test(t.nonce) || !validStamp(t.generated) || !(t.generated.mono >= trigger?.completed?.mono)
    || tx[i]?.transmission?.nonce !== t.nonce || !(tx[i]?.before?.mono >= t.generated.mono)
    || !(tx[i]?.completed?.mono >= tx[i]?.before?.mono) || tx[i]?.completed?.mono - tx[i]?.before?.mono > 2000
    || !finite(tx[i]?.transmission?.scheduledAudioSeconds))) reasons.push('fresh_generation_or_transmission_missing');
  if (targets[0]?.nonce === targets[1]?.nonce) reasons.push('nonce_reused');
  const samples = receipt.samples ?? [];
  if (samples.length < 3) reasons.push('insufficient_samples');
  let previous = -Infinity;
  for (const sample of samples) {
    if (!validStamp(sample.before) || !validStamp(sample.completed) || sample.before.mono < previous || sample.completed.mono < sample.before.mono
      || sample.completed.mono - sample.before.mono > 500 || sample.peers?.length !== 2) reasons.push('invalid_or_uncertain_sample_timing');
    previous = sample.completed?.mono;
    for (const [index, peer] of (sample.peers ?? []).entries()) {
      if (peer.audio?.contextState !== 'running' || !peer.audio.receivers?.length || peer.audio.receivers.some((r) => r.error || !r.chunks || !r.samples)) reasons.push('decoder_unavailable');
      if (peer.audio.receivers.some((r) => !receipt.controls?.[index]?.audio.receivers.some((c) => c.trackId === r.trackId))) reasons.push('receiver_track_binding_changed');
      for (const type of ['inbound-rtp', 'outbound-rtp']) {
        const rtp = rows(peer, type);
        if (!rtp.length || rtp.some((r) => !r.id || !finite(r.ssrc) || !finite(r.timestamp)
          || !finite(r[type === 'inbound-rtp' ? 'bytesReceived' : 'bytesSent']) || !finite(r[type === 'inbound-rtp' ? 'packetsReceived' : 'packetsSent'])
          || r[type === 'inbound-rtp' ? 'bytesReceived' : 'bytesSent'] < 0 || r[type === 'inbound-rtp' ? 'packetsReceived' : 'packetsSent'] < 0)) reasons.push('stats_unavailable');
        if (type === 'inbound-rtp' && rtp.some((r) => !rows(receipt.controls?.[index], type).some((c) => c.id === r.id && c.ssrc === r.ssrc))) reasons.push('receiver_ssrc_binding_changed');
      }
    }
  }
  if (reasons.length) return value('INCONCLUSIVE');
  const final = samples.at(-1);
  for (let i = 0; i < 2; i++) {
    const receiver = final.peers[i]; const target = targets[1 - i];
    if (receiver.audio.receivers.some((r) => matches(r.frames, target, i + 1))) {
      reasons.push(`fresh_nonce_decoded_by_receiver_${i + 1}`); return value('FAIL');
    }
  }
  if (final.peers.some((peer, i) => peer.audio.receivers.some((r) => r.frames.some((f) => f.nonce === targets[1 - i].nonce && f.phase === phase
    && (f.confidence < 0.97 || !(f.minimumSymbolConfidence >= 0.75)))))) {
    reasons.push('nonce_identification_confidence_insufficient'); return value('INCONCLUSIVE');
  }
  const requiredMs = phase === 1 ? 59000 : 9000;
  const limitMs = phase === 1 ? 60000 : 10000;
  if (!receipt.windowComplete || final.completed.mono - trigger.completed.mono < requiredMs
    || final.completed.mono - trigger.completed.mono > limitMs || receipt.localClosedAt) reasons.push('observation_window_incomplete');
  const tail = samples.filter((s) => s.before.mono >= final.completed.mono - 5000);
  if (tail.length < 3 || tail.at(-1).before.mono - tail[0].completed.mono < 3500) reasons.push('stable_window_too_short');
  for (let i = 0; i < 2; i++) {
    const first = tail[0]?.peers[i]; const last = tail.at(-1)?.peers[i];
    if (!first || !last) continue;
    const initial = rows(first, 'inbound-rtp'); const end = rows(last, 'inbound-rtp');
    if (initial.length !== end.length || initial.some((r) => !end.some((e) => e.id === r.id && e.ssrc === r.ssrc))) reasons.push('receiver_stream_changed');
    for (const r of initial) {
      let time = r.timestamp;
      for (const sample of tail.slice(1)) {
        const next = rows(sample.peers[i], 'inbound-rtp').find((x) => x.id === r.id && x.ssrc === r.ssrc);
        if (!next || !(next.timestamp > time) || next.bytesReceived !== r.bytesReceived || next.packetsReceived !== r.packetsReceived) reasons.push('receiving_not_stable_or_fresh');
        time = next?.timestamp;
      }
    }
    const pubStart = rows(first, 'outbound-rtp'); const pubEnd = rows(last, 'outbound-rtp');
    if (!pubStart.every((r) => pubEnd.some((e) => e.id === r.id && e.ssrc === r.ssrc && e.bytesSent > r.bytesSent && e.packetsSent > r.packetsSent && e.timestamp > r.timestamp))) reasons.push('publisher_not_advancing');
    const liveSource = tail.filter((s) => s.peers[i].audio.sourcePeak >= 0.01);
    if (liveSource.length < 2 || liveSource.at(-1).before.mono - liveSource[0].completed.mono < 3000
      || last.audio.transmissions?.at(-1)?.nonce !== targets[i].nonce || last.audio.transmissions?.at(-1)?.phase !== phase) reasons.push('source_waveform_unverified');
    if (!['sub', 'publisher'].every((name) => tail.every((s) => s.peers[i].peers[name].connectionState === 'connected'))) reasons.push('transport_closed_or_unavailable');
    if (!first.audio.receivers.every((r) => last.audio.receivers.some((e) => e.trackId === r.trackId && e.samples > r.samples && e.chunks > r.chunks))) reasons.push('decoder_not_live');
  }
  if (reasons.length) return value('INCONCLUSIVE');
  reasons.push('stable_receiving_with_live_decoder_and_advancing_publishers_in_measured_tail');
  return { ...value('OBSERVED_CUTOFF'), observedStableInterval: { before: tail[0].completed, completed: final.completed }, universalSecurityPass: false };
}
function classifyPhase(receipt) {
  try { return classify(receipt); } catch { return { verdict: 'INCONCLUSIVE', reasons: ['malformed_or_incomplete_receipt'], universalSecurityPass: false }; }
}
module.exports = { classifyPhase };
