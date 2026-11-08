import type { ConnectSession } from './connect.ts';
import type { VoiceApi, VoicePeer } from '../voice/voice-types.ts';
export function callHistoryLabel(call: ConnectSession) {
  const media = call.media === 'video' ? 'video' : 'voice';
  return call.state === 'RINGING' ? `${media === 'video' ? 'Video' : 'Voice'} invitation`
    : call.state === 'MISSED' ? `Missed ${media} call` : call.state === 'DECLINED' ? `Declined ${media} call`
      : call.state === 'CANCELLED' ? `Cancelled ${media} call` : `${media === 'video' ? 'Video' : 'Voice'} call`;
}
/** Expand a bounded recent window to avoid skipping equal-timestamp rows in the
 * current timestamp-only RPC. No new backend contract is assumed. */
export async function loadRecentCallHistory(input: {
  api: Pick<VoiceApi, 'getHistory'>; selfProfileId: string; limit: number; peer(id: string): Promise<VoicePeer>; current(): boolean;
}) {
  const calls = await input.api.getHistory(null, Math.min(100, Math.max(20, input.limit)));
  if (!input.current()) return null;
  const peers = new Map<string, Promise<VoicePeer | null>>();
  const rows = await Promise.all(calls.map(async call => {
    const id = input.selfProfileId === call.caller_profile_id ? call.recipient_profile_id : call.caller_profile_id;
    if (!peers.has(id)) peers.set(id, input.peer(id).catch(() => null));
    return { call, name: (await peers.get(id))?.name || 'Your connection' };
  }));
  return input.current() ? rows : null;
}
