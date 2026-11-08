// Offline analytical contract v2. Never grants security authority.
export type RecordValue = Record<string, unknown>;
export type Status = 'VALID' | 'MISSING' | 'INVALID';
export type FactName = 'identity' | 'chronology' | 'controls' | 'coverage' | 'receiver' | 'source'
  | 'freshContent' | 'sfuEvent' | 'transport' | 'comparison';
export type Issue = { fact: FactName; kind: Exclude<Status, 'VALID'>; code: string; peer?: number; sample?: number };
export class Facts {
  readonly issues: Issue[] = [];
  readonly states: Record<FactName, Status> = { identity: 'VALID', chronology: 'VALID', controls: 'VALID',
    coverage: 'VALID', receiver: 'VALID', source: 'VALID', freshContent: 'VALID', sfuEvent: 'VALID', transport: 'VALID', comparison: 'VALID' };
  add(fact: FactName, kind: 'MISSING' | 'INVALID', code: string, peer?: number, sample?: number) {
    if (this.states[fact] !== 'INVALID') this.states[fact] = kind;
    if (this.issues.length < 256 && !this.issues.some(x => x.fact === fact && x.code === code && x.peer === peer)) {
      this.issues.push({ fact, kind, code, ...(peer === undefined ? {} : { peer }), ...(sample === undefined ? {} : { sample }) });
    }
  }
  valid(...names: FactName[]) { return names.every(name => this.states[name] === 'VALID'); }
}
export const PROFILE = Object.freeze({
  version: 2, maximumSamples: 4096, maximumEvents: 2048,
  // Existing contract, unchanged.
  maximumIpcMs: 500, maximumTransmissionMs: 2000, minimumConfidence: 0.97, minimumSymbolConfidence: 0.75,
  minimumFrameSeconds: 3.99, maximumFrameSeconds: 4.01, stableTailMs: 5000,
  minimumStableSpanMs: 3500, minimumSourceSpanMs: 3000, minimumSourcePeak: 0.01,
  timerMinimumMs: 59000, timerMaximumMs: 60000, endMinimumMs: 9000, endMaximumMs: 10000,
  // New stricter analytical coverage/comparison profile, not historical runner changes.
  maximumStartDelayMs: 2000, maximumSampleGapMs: 1000, maximumPriorAgeMs: 1000,
  maximumBrowserStatsAgeMs: 500,
  // Pinned v1 collector batches exactly 2048 PCM samples. Validate, do not infer from wall-clock time.
  pcmBatchFrames: 2048,
});
export const object = (x: unknown): RecordValue => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as RecordValue : {};
export const list = (x: unknown, maximum: number = PROFILE.maximumSamples): unknown[] => Array.isArray(x) && x.length <= maximum ? x : [];
export const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 256 && x.trim() === x;
export const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const integer = (x: unknown): x is number => finite(x) && Number.isSafeInteger(x) && x >= 0;
export type Stamp = { mono: number; utc: string };
export type BrowserClock = Stamp & { timeOrigin: number; audioSeconds: number };
export const stamp = (x: unknown): x is Stamp => finite(object(x).mono) && typeof object(x).utc === 'string'
  && Number.isFinite(Date.parse(object(x).utc as string));
export const browserClock = (x: unknown): x is BrowserClock => stamp(x) && finite(object(x).timeOrigin) && finite(object(x).audioSeconds)
  && (object(x).audioSeconds as number) >= 0;
export const bracket = (x: unknown, limit: number = PROFILE.maximumIpcMs) => {
  const r = object(x);
  return stamp(r.before) && stamp(r.completed) && r.completed.mono >= r.before.mono
    && r.completed.mono - r.before.mono <= limit && Date.parse(r.completed.utc) >= Date.parse(r.before.utc);
};
export const epochEqual = (a: unknown, b: unknown) => browserClock(a) && browserClock(b) && a.timeOrigin === b.timeOrigin;
export const rows = (peer: unknown, kind: 'sub' | 'publisher') => list(object(object(object(peer).peers)[kind]).rtp, 8).map(object);
export const receivers = (peer: unknown) => list(object(object(peer).audio).receivers, 4).map(object);
export const audio = (peer: unknown) => object(object(peer).audio);
export const frameQualified = (f: RecordValue, nonce: unknown, phase: unknown, sender: unknown) => {
  if (!finite(f.sampleRate) || !integer(f.startSample) || !integer(f.endSample)) return false;
  const duration = (f.endSample - f.startSample) / f.sampleRate;
  return f.nonce === nonce && f.phase === phase && f.sender === sender && f.crcValid === true && f.sampleRate >= 8000
    && finite(f.confidence) && f.confidence >= PROFILE.minimumConfidence && f.confidence <= 1
    && finite(f.minimumSymbolConfidence) && f.minimumSymbolConfidence >= PROFILE.minimumSymbolConfidence && f.minimumSymbolConfidence <= f.confidence
    && duration >= PROFILE.minimumFrameSeconds && duration <= PROFILE.maximumFrameSeconds;
};
export const healthy = (peer: unknown) => ['sub', 'publisher'].every(kind => {
  const p = object(object(object(peer).peers)[kind]); const transports = list(p.transports, 8).map(object);
  return p.connectionState === 'connected' && transports.length > 0
    && transports.every(t => t.dtlsState === 'connected' && ['connected', 'completed'].includes(String(t.iceState)));
});
export type Participant = { sender: number; userId: string; rawSessionId: string; trackId: string;
  inboundId: string; inboundSsrc: number; outboundId: string; outboundSsrc: number; outboundTrackId: string; timeOrigin: number; sampleRate: number };
export type Context = { schemaVersion: 2; callId: string; callType: string; cid: string; providerSessionId: string;
  participants: Participant[]; sessionEvidence: unknown; calibration: unknown; baseline: unknown;
  authenticatedSessionPath: boolean; nonCooperativeHarness: boolean; processHealthy: boolean;
  localCleanupStarted?: unknown; voluntaryDisconnect?: boolean; priorSample?: unknown; priorPreviousSample?: unknown;
  previouslyUsedNonces?: string[];
  priorBinding?: { callId: string; providerSessionId: string }; historyBeforeTrigger: unknown[];
  explicitAck?: { callId: string; providerSessionId: string; verified: boolean; status: number; before: Stamp; completed: Stamp } };
