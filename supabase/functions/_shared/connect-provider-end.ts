export interface ConnectEndAcknowledgement {
  type: 'betweener_connect'; id: string; outcome: 'accepted' | 'absent'; mediaEnforcement: 'unverified';
}
export class ConnectEndUnconfirmed extends Error {
  readonly category: 'permission' | 'timeout' | 'ambiguous';
  constructor(category: ConnectEndUnconfirmed['category']) { super('connect_provider_end_unconfirmed'); this.category = category; }
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function isScopedNotFound(error: unknown): boolean {
  const e = object(error); return e.code === 16 && object(e.metadata).responseCode === 404;
}
export function unconfirmedEnd(error: unknown): ConnectEndUnconfirmed {
  const e = object(error); const status = object(e.metadata).responseCode;
  return new ConnectEndUnconfirmed(status === 401 || status === 403 ? 'permission'
    : status === 408 && e.code === 23 ? 'timeout' : 'ambiguous');
}
export function isAcceptedEnd(value: unknown): boolean {
  const r = object(value); const status = object(r.metadata).responseCode;
  return typeof status === 'number' && Number.isInteger(status) && status >= 200 && status < 300
    && typeof r.duration === 'string' && r.duration.trim().length > 0 && r.code === undefined;
}
/** Persisted control-plane state only, never remote-media cutoff evidence. */
export function isScopedEndedCall(value: unknown, id: string): boolean {
  const call = object(object(value).call);
  const endedAt = call.ended_at;
  const timestamp = endedAt instanceof Date ? endedAt.getTime()
    : typeof endedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(endedAt) ? Date.parse(endedAt) : NaN;
  return call.id === id && call.type === 'betweener_connect' && Number.isFinite(timestamp);
}
export function assertConnectEndAcknowledged(value: unknown, id: string): asserts value is ConnectEndAcknowledgement {
  const r = object(value);
  if (r.type !== 'betweener_connect' || r.id !== id || (r.outcome !== 'accepted' && r.outcome !== 'absent')
    || r.mediaEnforcement !== 'unverified') throw new ConnectEndUnconfirmed('ambiguous');
}
