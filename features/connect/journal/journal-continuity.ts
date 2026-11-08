import type { ConnectSession } from '../domain/connect.ts';
import { terminalStates } from '../domain/connect.ts';
import type { JournalEntry } from './journal-types.ts';
/** Navigation only. Never sends a message, changes consent or certifies media shutdown. */
export function journalContinuation(call: ConnectSession | null, peer: JournalEntry | undefined, safeToDismiss: boolean) {
  if (!safeToDismiss || !call || !terminalStates.includes(call.state) || !peer?.peer.available || !peer.peer.chatVisible || peer.peer.blocked
    || ![call.caller_profile_id, call.recipient_profile_id].includes(peer.peer.profileId)) return null;
  return { pathname: '/chat/[id]' as const, params: { id: peer.peer.userId, peerUserId: peer.peer.userId,
    peerProfileId: peer.peer.profileId, userName: peer.peer.name, userAvatar: peer.peer.avatar ?? '' } };
}
