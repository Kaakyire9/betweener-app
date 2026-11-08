import type { ConnectSession } from '../domain/connect.ts';
import type { LocalShutdownResult } from './local-shutdown.ts';

export const CONNECT_RECOVERY_ATTEMPTS = 2;
export const CONNECT_RECOVERY_RELEASE_MS = 8_000;
export const CONNECT_RECOVERY_TOTAL_MS = 20_000;
/** Expiry does not cancel native promises; owner/generation retirement fences
 * their late completion. Never use a timer as provider-media shutdown evidence. */
export async function withinRecoveryBudget<T>(run: () => Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([run(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('connect_recovery_timeout')), timeout); })]); }
  finally { clearTimeout(timer); }
}
/** SDK release permits a new owner; it is not physical or remote shutdown proof. */
export const sdkOwnerReleased = (value: LocalShutdownResult) => value.sdkLeave === 'completed'
  && value.resourceRelease === 'completed' && !Object.values(value).includes('failed') && !Object.values(value).includes('pending');

/** A fresh RPC snapshot is necessary, but server credential admission remains mandatory. */
export function recoveryAuthorityMatches(previous: ConnectSession, fresh: ConnectSession, now: number) {
  const starting = ['ACCEPTED', 'CONNECTING'].includes(previous.state) && previous.connected_at === null;
  const freshStarting = ['ACCEPTED', 'CONNECTING'].includes(fresh.state) && fresh.connected_at === null;
  const freshActive = ['ACTIVE', 'RECONNECTING'].includes(fresh.state)
    && !!fresh.connected_at && Number.isFinite(Date.parse(fresh.connected_at));
  const connectionMatches = starting ? freshStarting || freshActive
    : ['ACTIVE', 'RECONNECTING'].includes(previous.state) && freshActive && previous.connected_at === fresh.connected_at;
  return previous.id === fresh.id && previous.created_at === fresh.created_at && previous.media === fresh.media
    && previous.caller_profile_id === fresh.caller_profile_id && previous.recipient_profile_id === fresh.recipient_profile_id
    && previous.authorization === fresh.authorization && connectionMatches
    && previous.ended_at === null && fresh.version >= previous.version && fresh.ended_at === null
    && (!fresh.deadline || (Number.isFinite(Date.parse(fresh.deadline)) && Date.parse(fresh.deadline) > now));
}
