import type { VoiceApi, VoiceCredentials } from '../voice/voice-types.ts';

export function createVoiceApi(service: Omit<VoiceApi, 'credentials'>, issue: VoiceApi['credentials']): VoiceApi {
  return { ...service, credentials: issue };
}
export function readVoiceCredentials(value: unknown, callId: string, userId?: string, now = Date.now()): VoiceCredentials {
  const data = value as VoiceCredentials | null;
  if (!data || data.media !== 'voice' || data.call?.id !== callId || data.call.type !== 'betweener_connect'
    || data.call.cid !== `betweener_connect:${callId}` || typeof data.token !== 'string' || !data.token
    || typeof data.apiKey !== 'string' || !data.apiKey || typeof data.user?.id !== 'string' || !data.user.id
    || (userId && data.user.id !== userId) || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= now) {
    throw new Error('connect_unavailable');
  }
  return data;
}
