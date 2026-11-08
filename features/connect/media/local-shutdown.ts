export type ShutdownEvidence = 'pending' | 'verified' | 'unverified' | 'failed';
export type ShutdownOperation = 'pending' | 'completed' | 'failed' | 'not_owned';
export interface LocalShutdownResult {
  microphone: ShutdownEvidence; camera: ShutdownEvidence; publication: ShutdownEvidence; playback: ShutdownEvidence; subscriptions: ShutdownEvidence;
  sdkLeave: ShutdownOperation; resourceRelease: ShutdownOperation;
}
export const pendingShutdown = (): LocalShutdownResult => ({ microphone: 'pending', camera: 'pending', publication: 'pending',
  playback: 'pending', subscriptions: 'pending', sdkLeave: 'pending', resourceRelease: 'pending' });
export const unverifiedShutdown = (): LocalShutdownResult => ({ microphone: 'unverified', camera: 'unverified', publication: 'unverified',
  playback: 'unverified', subscriptions: 'unverified', sdkLeave: 'not_owned', resourceRelease: 'not_owned' });
export function normalizeShutdown(value: unknown): LocalShutdownResult {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = unverifiedShutdown();
  for (const k of ['microphone', 'camera', 'publication', 'playback', 'subscriptions'] as const) {
    if (typeof v[k] === 'string' && ['pending', 'verified', 'unverified', 'failed'].includes(v[k] as string)) result[k] = v[k] as ShutdownEvidence;
  }
  for (const k of ['sdkLeave', 'resourceRelease'] as const) {
    if (typeof v[k] === 'string' && ['pending', 'completed', 'failed', 'not_owned'].includes(v[k] as string)) result[k] = v[k] as ShutdownOperation;
  }
  return result;
}
export const isLocalShutdownVerified = (r: LocalShutdownResult): boolean =>
  [r.microphone, r.camera, r.publication, r.playback, r.subscriptions].every(s => s === 'verified')
  && r.sdkLeave === 'completed' && r.resourceRelease === 'completed';
