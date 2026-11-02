const { randomBytes } = require('node:crypto');
const stamp = () => ({ mono: performance.now(), utc: new Date().toISOString() });
const CLOCK_MODEL = Object.freeze({
  intervals: 'Parent monotonic milliseconds; UTC is correlation only.',
  browserMapping: 'Each IPC operation is bracketed by parent monotonic stamps. Browser performance/timeOrigin and AudioContext sample clocks are retained separately.',
  uncertainty: 'IPC brackets bound observation time; AudioContext scheduling is not an RTP wire timestamp. Provider clock offset is UNKNOWN. No cross-host latency bound is inferred.',
});
function challenge(trigger, phase, sender, used = new Set(), rng = randomBytes, clock = stamp) {
  if (!trigger || !Number.isFinite(trigger.completed?.mono) || ![1, 2].includes(phase) || ![1, 2].includes(sender)
    || (phase === 1 ? trigger.kind !== 'timer-ended-get' || trigger.ended !== true : trigger.kind !== 'backend-end-ack' || trigger.ack !== true)) throw new Error('trigger_required');
  const generated = clock();
  if (!(generated.mono >= trigger.completed.mono)) throw new Error('invalid_generation_time');
  const nonce = rng(16).toString('hex');
  if (!/^[0-9a-f]{32}$/.test(nonce) || /^0+$/.test(nonce) || used.has(nonce)) throw new Error('nonce_collision');
  used.add(nonce);
  return { nonce, phase, sender, generated, triggerCompleted: trigger.completed };
}
function matches(frames, target, receiver) {
  const valid = frames.filter((f) => f.nonce === target.nonce && f.phase === target.phase && f.sender === target.sender
    && receiver !== target.sender && f.confidence >= 0.97 && f.minimumSymbolConfidence >= 0.75 && f.crcValid === true
    && Number.isFinite(f.sampleRate) && f.sampleRate >= 8000 && Number.isFinite(f.startSample)
    && (f.endSample - f.startSample) / f.sampleRate >= 3.99 && (f.endSample - f.startSample) / f.sampleRate <= 4.01);
  return valid.length > 0;
}
module.exports = { stamp, CLOCK_MODEL, challenge, matches };
