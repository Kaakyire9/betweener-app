import type { AudioHealth } from './audio-health.ts';
/** Local transport estimates; never a measure of audible speech or identity. */
export function connectionQuality(health?: AudioHealth): 'unknown' | 'good' | 'fair' | 'poor' {
  if (health?.reception !== 'receiving') return 'unknown';
  const { jitterMs, roundTripMs, packetLossPercent } = health;
  if ([jitterMs, roundTripMs, packetLossPercent].every(v => v === null || v === undefined)) return 'unknown';
  if ((jitterMs ?? 0) >= 80 || (roundTripMs ?? 0) >= 600 || (packetLossPercent ?? 0) >= 8) return 'poor';
  if ((jitterMs ?? 0) >= 30 || (roundTripMs ?? 0) >= 300 || (packetLossPercent ?? 0) >= 3) return 'fair';
  return 'good';
}
