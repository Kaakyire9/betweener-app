import { connectUuid } from './call-navigation.ts';
import type { ConnectGrant } from './connect.ts';

export interface IntentCallingContext {
  intent_id: string; requester_profile_id: string; recipient_profile_id: string;
  intent_status: string; intent_expires_at: string; available: boolean;
  offer_voice: boolean; offer_video: boolean; can_call_voice: boolean; grant: ConnectGrant | null;
}
export function readIntentCallingContext(value: unknown, intent: string, self: string): IntentCallingContext {
  const c = value as IntentCallingContext;
  if (!c || c.intent_id !== intent || !connectUuid(intent) || !connectUuid(c.requester_profile_id) || !connectUuid(c.recipient_profile_id)
    || c.requester_profile_id === c.recipient_profile_id || ![c.requester_profile_id, c.recipient_profile_id].includes(self)
    || !['pending', 'accepted', 'passed', 'expired', 'cancelled', 'matched'].includes(c.intent_status)
    || !Number.isFinite(Date.parse(c.intent_expires_at))
    || [c.available, c.offer_voice, c.offer_video, c.can_call_voice].some(v => typeof v !== 'boolean')) throw new Error('connect_unavailable');
  const g = c.grant;
  if (g && (!connectUuid(g.id) || g.intent_id !== intent || g.requester_profile_id !== c.requester_profile_id
    || g.recipient_profile_id !== c.recipient_profile_id || !['pending', 'accepted', 'revoked'].includes(g.status)
    || [g.voice, g.video, g.requested_voice, g.requested_video].some(v => typeof v !== 'boolean')
    || (g.voice && !g.requested_voice) || (g.video && !g.requested_video) || !Number.isFinite(Date.parse(g.expires_at)))) throw new Error('connect_unavailable');
  return c;
}
/** Presentation only. Each mutation/start rechecks current server authority. */
export function intentConsentPresentation(c: IntentCallingContext, self: string, now = Date.now()) {
  const g = c.grant, sender = c.requester_profile_id === self;
  const current = c.available && ['pending', 'accepted'].includes(c.intent_status) && Date.parse(c.intent_expires_at) > now;
  const grantCurrent = current && !!g && Date.parse(g.expires_at) > now && g.revoked_at === null;
  return { sender, canOffer: sender && current && !g, canDecide: !sender && grantCurrent && g?.status === 'pending',
    canWithdraw: !!g && g.status !== 'revoked',
    canCallVoice: sender && grantCurrent && g?.status === 'accepted' && g.voice && c.can_call_voice,
    state: !current ? 'unavailable' : !g ? 'not_offered' : !grantCurrent ? g.status === 'revoked' ? 'revoked' : 'expired' : g.status };
}
