import { CONNECT_PUSH_TYPES } from '../../../supabase/functions/_shared/connect-push-contract.ts';

export const connectUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export type ConnectLaunch = { kind: 'call'; callId: string } | { kind: 'outgoing'; peerId: string; authorization: 'matched' | 'pre_match'; grantId: string | null };
/** Navigation is a hint. None of these values grants call/media authority. */
export function readConnectLaunch(params: Record<string, unknown>): ConnectLaunch | null {
  if (connectUuid(params.callId)) return { kind: 'call', callId: params.callId };
  if (!connectUuid(params.peerId)) return null;
  if (params.authorization === 'matched' && !params.grantId) return { kind: 'outgoing', peerId: params.peerId, authorization: 'matched', grantId: null };
  if (params.authorization === 'pre_match' && connectUuid(params.grantId)) return { kind: 'outgoing', peerId: params.peerId, authorization: 'pre_match', grantId: params.grantId };
  return null;
}
export const connectNotificationTypes = CONNECT_PUSH_TYPES;
/** Legacy unbound local hint. Runtime push ingress requires boundConnectNotificationTarget. */
export function connectNotificationTarget(data: Record<string, unknown>, enabled: boolean) {
  if (!enabled || !connectNotificationTypes.has(String(data.type)) || !connectUuid(data.call_id)) return null;
  return { pathname: '/connect/voice', params: { callId: data.call_id } };
}
