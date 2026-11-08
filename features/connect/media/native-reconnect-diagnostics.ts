export const nativeTransportFailureCodes = ['PARTICIPANT_MEDIA_TRANSPORT_FAILURE', 'PARTICIPANT_SIGNAL_LOST',
  'PARTICIPANT_RECONNECT_FAILED', 'PARTICIPANT_MIGRATION_FAILED', 'PARTICIPANT_NOT_FOUND',
  'PUBLISH_TRACK_NOT_FOUND', 'PUBLISH_TRACKS_MISMATCH', 'PUBLISH_TRACK_OUT_OF_ORDER', 'LIVE_ENDED',
  'SFU_FULL', 'UNAUTHENTICATED', 'PERMISSION_DENIED'] as const;
export const nativeReconnectStrategies = ['UNSPECIFIED', 'DISCONNECT', 'FAST', 'REJOIN', 'MIGRATE'] as const;
export interface NativeTransportFailure {
  code: typeof nativeTransportFailureCodes[number] | 'unknown';
  strategy: typeof nativeReconnectStrategies[number] | 'unknown';
}
interface Models { ErrorCode?: Readonly<Record<number, string>>; WebsocketReconnectStrategy?: Readonly<Record<number, string>> }

/** Keep only closed SDK enum categories. Never retain a provider message,
 * session, participant ID, URL, SDP or other payload in a product snapshot. */
export function nativeReconnectFailure(event: unknown, models: Models): NativeTransportFailure {
  const result: NativeTransportFailure = { code: 'unknown', strategy: 'unknown' };
  try {
    const value = event as { error?: { code?: unknown }; reconnectStrategy?: unknown };
    const code = typeof value?.error?.code === 'number' ? models.ErrorCode?.[value.error.code] : undefined;
    const strategy = typeof value?.reconnectStrategy === 'number' ? models.WebsocketReconnectStrategy?.[value.reconnectStrategy] : undefined;
    result.code = nativeTransportFailureCodes.find(known => known === code) ?? 'unknown';
    result.strategy = nativeReconnectStrategies.find(known => known === strategy) ?? 'unknown';
  } catch { /* Diagnostics must never interrupt setup or cleanup. */ }
  return result;
}
