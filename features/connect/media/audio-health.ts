/** Local, aggregate SDK observations only. No audio, identifiers, SDP or network addresses. */
export interface AudioSample {
  timestamp: number; sentBytes: number | null; receivedBytes: number | null;
  receivedPackets: number | null; lostPackets: number | null; jitterMs: number | null; roundTripMs: number | null;
}
export interface AudioHealth {
  reception: 'unavailable' | 'awaiting' | 'receiving' | 'stale';
  sending: boolean | null; jitterMs: number | null; roundTripMs: number | null;
  receivedPackets: number | null; lostPackets: number | null;
  packetLossPercent?: number | null;
  audibleOutput: 'not_verified';
}
export const AUDIO_SAMPLE_FRESHNESS_MS = 6_000;
/** The monitor is no longer attached. Preserve cumulative history, never a live-media claim. */
export function retireAudioHealth(previous: AudioHealth | undefined): AudioHealth | undefined {
  return previous ? { ...previous, reception: 'unavailable', sending: null, jitterMs: null, roundTripMs: null, packetLossPercent: null, audibleOutput: 'not_verified' } : undefined;
}
const count = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function audioSampleFromReport(report: unknown): AudioSample | null {
  if (!report || typeof report !== 'object') return null;
  const r = report as Record<string, unknown>;
  const p = r.publisherAudioStats as Record<string, unknown> | undefined;
  const s = r.subscriberAudioStats as Record<string, unknown> | undefined;
  const timestamp = count(r.timestamp);
  if (timestamp === null || !p || !s) return null;
  return { timestamp, sentBytes: count(p.totalBytesSent), receivedBytes: count(s.totalBytesReceived),
    receivedPackets: count(s.totalPacketsReceived), lostPackets: count(s.totalPacketsLost),
    jitterMs: count(s.averageJitterInMs), roundTripMs: count(p.averageRoundTripTimeInMs) };
}

/** SDK timestamps are compared only to each other. Freshness uses local observation time. */
export function createAudioHealthMonitor() {
  let previous: AudioSample | null = null, observedAt: number | null = null, receivedAt: number | null = null;
  let sending: boolean | null = null, packetLossPercent: number | null = null;
  return {
    read(sample: AudioSample | null, now: number): AudioHealth {
      if (sample && Number.isFinite(sample.timestamp) && (!previous || sample.timestamp > previous.timestamp)) {
        const grows = (a: number | null, b: number | null) => a !== null && b !== null && a > b;
        const reset = previous && (['sentBytes', 'receivedBytes', 'receivedPackets'] as const)
          .some(k => previous![k] !== null && sample[k] !== null && sample[k]! < previous![k]!);
        packetLossPercent = null;
        if (reset) { receivedAt = null; sending = null; }
        else if (previous) {
          if (grows(sample.receivedPackets, previous.receivedPackets) || grows(sample.receivedBytes, previous.receivedBytes)) receivedAt = now;
          sending = sample.sentBytes !== null && previous.sentBytes !== null ? grows(sample.sentBytes, previous.sentBytes) : null;
          if (sample.receivedPackets !== null && previous.receivedPackets !== null && sample.lostPackets !== null && previous.lostPackets !== null) {
            const received = sample.receivedPackets - previous.receivedPackets, lost = sample.lostPackets - previous.lostPackets;
            if (received >= 0 && lost >= 0 && received + lost > 0) packetLossPercent = Math.round(1000 * lost / (received + lost)) / 10;
          }
        }
        previous = { ...sample }; observedAt = now;
      }
      const fresh = observedAt !== null && now >= observedAt && now - observedAt <= AUDIO_SAMPLE_FRESHNESS_MS;
      return { reception: observedAt === null ? 'unavailable' : !fresh ? 'stale'
          : receivedAt !== null && now >= receivedAt && now - receivedAt <= AUDIO_SAMPLE_FRESHNESS_MS ? 'receiving' : 'awaiting',
        sending: fresh ? sending : null, jitterMs: fresh ? previous!.jitterMs : null, roundTripMs: fresh ? previous!.roundTripMs : null,
        receivedPackets: previous?.receivedPackets ?? null, lostPackets: previous?.lostPackets ?? null,
        packetLossPercent: fresh ? packetLossPercent : null, audibleOutput: 'not_verified' };
    },
  };
}
