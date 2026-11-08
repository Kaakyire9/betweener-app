// Pure v1 navigation envelope; no credentials, caller names, avatars or acceptance.
export const CONNECT_PUSH_TYPES = new Set(['connect_voice_incoming', 'connect_voice_cancelled', 'connect_voice_declined',
  'connect_voice_missed', 'connect_voice_expired', 'connect_voice_revoked', 'connect_voice_blocked']);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export interface ConnectPushData { type: string; call_id: string; call_generation: string; call_version: number; recipient_user_id: string }
export function readConnectPushData(value: unknown): ConnectPushData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (Object.keys(d).length !== 5 || !CONNECT_PUSH_TYPES.has(String(d.type)) || !uuid(d.call_id) || !uuid(d.recipient_user_id)
    || typeof d.call_generation !== 'string' || !Number.isFinite(Date.parse(d.call_generation))
    || !Number.isSafeInteger(d.call_version) || (d.call_version as number) < 1) return null;
  return { type: String(d.type), call_id: d.call_id, call_generation: d.call_generation, call_version: d.call_version as number, recipient_user_id: d.recipient_user_id };
}
export function connectPushDeliveryOptions(data: unknown, config: { enabled: boolean; environment: string; applicationId: string }) {
  const parsed = readConnectPushData(data);
  if (!parsed || !config.enabled || config.environment !== 'staging' || config.applicationId !== 'com.aduboffour.betweener.staging') return null;
  return { data: parsed, ttl: parsed.type === 'connect_voice_incoming' ? 45 : 600, priority: 'high' as const };
}
