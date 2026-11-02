export type ConnectMedia = 'voice' | 'video';
export type ConnectAuthorization = 'matched' | 'pre_match';
export type ConnectState = 'REQUESTED' | 'RINGING' | 'ACCEPTED' | 'CONNECTING' | 'ACTIVE' | 'RECONNECTING'
  | 'ENDING' | 'ENDED' | 'DECLINED' | 'CANCELLED' | 'MISSED' | 'BUSY' | 'FAILED';
export type ConnectTerminalState = Extract<ConnectState, 'ENDED' | 'DECLINED' | 'CANCELLED' | 'MISSED' | 'BUSY' | 'FAILED'>;
export type ConnectReason = 'connect_unauthenticated' | 'connect_unavailable' | 'connect_disabled'
  | 'connect_consent_required' | 'connect_busy' | 'connect_rate_limited' | 'connect_invalid_input'
  | 'connect_invalid_transition' | 'connect_conflict' | 'connect_idempotency_conflict' | 'connect_device_conflict'
  | 'connect_provider_unavailable' | 'connect_provider_policy_unsafe' | 'connect_test_budget_exhausted';

export interface ConnectPreferences { voice: boolean; video: boolean }
export interface ConnectGrant {
  id: string; intent_id: string; requester_profile_id: string; recipient_profile_id: string;
  voice: boolean; video: boolean; status: 'pending' | 'accepted' | 'revoked'; expires_at: string;
  requested_voice: boolean; requested_video: boolean; accepted_at: string | null; revoked_at: string | null;
}
export interface ConnectParticipant { user_id: string; profile_id: string; role: 'caller' | 'recipient' }
export interface ConnectSession {
  id: string; caller_profile_id: string; recipient_profile_id: string; media: ConnectMedia;
  authorization: ConnectAuthorization; state: ConnectState; version: number;
  created_at: string; accepted_at: string | null; connected_at: string | null; ended_at: string | null;
  deadline: string | null; reason: string | null; duration_seconds: number | null;
}
export class ConnectError extends Error {
  readonly code: ConnectReason;
  constructor(code: ConnectReason) { super(code); this.name = 'ConnectError'; this.code = code; }
}

export const terminalStates: readonly ConnectState[] = ['ENDED', 'DECLINED', 'CANCELLED', 'MISSED', 'BUSY', 'FAILED'];
export const transitions: Readonly<Record<ConnectState, readonly ConnectState[]>> = {
  REQUESTED: ['RINGING', 'CANCELLED', 'MISSED', 'FAILED', 'ENDED'],
  RINGING: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'MISSED', 'BUSY', 'FAILED', 'ENDED'],
  ACCEPTED: ['CONNECTING', 'ENDING', 'FAILED', 'ENDED'],
  CONNECTING: ['ACTIVE', 'ENDING', 'FAILED', 'ENDED'],
  ACTIVE: ['RECONNECTING', 'ENDING', 'ENDED', 'FAILED'],
  RECONNECTING: ['ACTIVE', 'ENDING', 'ENDED', 'FAILED'],
  ENDING: ['ENDED', 'FAILED'], ENDED: [], DECLINED: [], CANCELLED: [], MISSED: [], BUSY: [], FAILED: [],
};
/** Rendering/validation aid only. Postgres owns transitions and timestamps. */
export function canTransition(from: ConnectState, to: ConnectState): boolean {
  return from === to || transitions[from].includes(to);
}
export function connectedDuration(connectedAt: string | null, endedAt: string | null): number | null {
  if (!connectedAt || !endedAt) return null;
  const seconds = (Date.parse(endedAt) - Date.parse(connectedAt)) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : null;
}
