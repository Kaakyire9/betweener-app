import { readConnectPushData } from '../../../supabase/functions/_shared/connect-push-contract.ts';
import type { ConnectSession } from './connect.ts';
import { connectUuid } from './call-navigation.ts';

export interface ConnectNotificationBinding { recipientUserId: string; callGeneration: string; callVersion: string }
export function boundConnectNotificationTarget(data: Record<string, unknown>, enabled: boolean) {
  const d = readConnectPushData(data);
  if (!enabled || !d) return null;
  return { pathname: '/connect/voice', params: { callId: d.call_id, recipientUserId: d.recipient_user_id, callGeneration: d.call_generation, callVersion: String(d.call_version) } };
}
export function readNotificationBinding(params: Record<string, unknown>): ConnectNotificationBinding | null | 'invalid' {
  if (!['recipientUserId', 'callGeneration', 'callVersion'].some(k => params[k] !== undefined)) return null;
  if (!connectUuid(params.recipientUserId) || typeof params.callGeneration !== 'string' || !Number.isFinite(Date.parse(params.callGeneration))
    || typeof params.callVersion !== 'string' || !/^[1-9]\d*$/.test(params.callVersion) || !Number.isSafeInteger(Number(params.callVersion))) return 'invalid';
  return { recipientUserId: params.recipientUserId, callGeneration: params.callGeneration, callVersion: params.callVersion };
}
export function notificationMatchesCall(binding: ConnectNotificationBinding, userId: string, call: ConnectSession) {
  return binding.recipientUserId === userId && Date.parse(binding.callGeneration) === Date.parse(call.created_at)
    && call.version >= Number(binding.callVersion);
}
export function connectNotificationAccountAllowed(path: string, params: Record<string, string> | undefined, userId: string | null) {
  if (path !== '/connect/voice') return true;
  const binding = readNotificationBinding(params ?? {});
  return binding !== 'invalid' && !!binding && binding.recipientUserId === userId;
}
