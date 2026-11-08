import type { ConnectSession } from './connect.ts';
export interface EndBlockContext {
  call_id: string; generation: string; actor_user_id: string; peer_user_id: string; peer_profile_id: string;
  caller_profile_id: string; recipient_profile_id: string; media: 'voice' | 'video'; authorization: 'matched' | 'pre_match';
  grant_id: string | null; block_id: string | null; revocation_at: string | null;
}
export interface EndBlockReceipt {
  call_id: string; generation: string; actor_user_id: string; peer_user_id: string; peer_profile_id: string; request_id: string;
  block: 'saved' | 'no_longer_saved'; call: 'terminal'; provider: 'pending' | 'acknowledged' | 'unconfirmed'; media: 'unverified';
}
export interface EndBlockView {
  block: 'pending' | 'saved' | 'no_longer_saved'; call: 'pending' | 'terminal';
  provider: 'pending' | 'acknowledged' | 'unconfirmed'; media: 'unverified'; error: string | null;
}
export const pendingEndBlock = (): EndBlockView => ({ block: 'pending', call: 'pending', provider: 'pending', media: 'unverified', error: null });
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const identifier = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
export function readEndBlockContext(value: unknown, call: ConnectSession, peer: string): EndBlockContext {
  const c = object(value);
  if (c.call_id !== call.id || c.generation !== call.created_at || c.peer_profile_id !== peer
    || c.caller_profile_id !== call.caller_profile_id || c.recipient_profile_id !== call.recipient_profile_id
    || c.media !== call.media || c.authorization !== call.authorization || !identifier(c.actor_user_id) || !identifier(c.peer_user_id)
    || c.actor_user_id === c.peer_user_id || ![null, 'string'].includes(c.grant_id === null ? null : typeof c.grant_id)
    || ![null, 'string'].includes(c.block_id === null ? null : typeof c.block_id)
    || ![null, 'string'].includes(c.revocation_at === null ? null : typeof c.revocation_at)) throw new Error('connect_unavailable');
  return c as unknown as EndBlockContext;
}
export function readEndBlockReceipt(value: unknown, context: Pick<EndBlockContext, 'call_id' | 'generation' | 'actor_user_id' | 'peer_user_id' | 'peer_profile_id'>, key?: string): EndBlockReceipt {
  const r = object(value);
  for (const k of ['call_id', 'generation', 'actor_user_id', 'peer_user_id', 'peer_profile_id'] as const) {
    if (r[k] !== context[k]) throw new Error('connect_unavailable');
  }
  if (!identifier(r.request_id) || (key !== undefined && r.request_id !== key) || (r.block !== 'saved' && r.block !== 'no_longer_saved')
    || r.call !== 'terminal' || (r.provider !== 'pending' && r.provider !== 'acknowledged' && r.provider !== 'unconfirmed') || r.media !== 'unverified') throw new Error('connect_unavailable');
  return r as unknown as EndBlockReceipt;
}
