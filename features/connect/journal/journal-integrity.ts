import { terminalStates, transitions } from '../domain/connect.ts';
import { connectUuid } from '../domain/call-navigation.ts';
import type { JournalEntry } from './journal-types.ts';

const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableTime = (value: unknown) => value === null || timestamp(value);
export function readJournalEntry(value: unknown, selfProfileId: string, selfUserId: string): JournalEntry {
  const row = value as JournalEntry, c = row?.call, peer = row?.peer;
  if (!c || !connectUuid(c.id) || !connectUuid(c.caller_profile_id) || !connectUuid(c.recipient_profile_id)
    || ![c.caller_profile_id, c.recipient_profile_id].includes(selfProfileId) || c.caller_profile_id === c.recipient_profile_id
    || !['voice', 'video'].includes(c.media) || !Object.hasOwn(transitions, c.state) || !['matched', 'pre_match'].includes(c.authorization)
    || !Number.isSafeInteger(c.version) || c.version < 1 || !timestamp(c.created_at)
    || ![c.accepted_at, c.connected_at, c.ended_at].every(nullableTime) || (c.reason !== null && typeof c.reason !== 'string')
    || !peer || !connectUuid(peer.profileId) || !connectUuid(peer.userId) || peer.userId === selfUserId
    || peer.profileId !== (c.caller_profile_id === selfProfileId ? c.recipient_profile_id : c.caller_profile_id)
    || row.direction !== (c.caller_profile_id === selfProfileId ? 'outgoing' : 'incoming')
    || typeof peer.name !== 'string' || !peer.name.trim() || peer.name.length > 120
    || ![peer.available, peer.blocked, peer.chatVisible, row.redialAllowed].every(v => typeof v === 'boolean') || !nullableTime(peer.chatHiddenBefore ?? null)
    || !['pending', 'acknowledged', 'not_applicable'].includes(row.cleanup)) throw Error('connect_journal_invalid');
  for (const time of [c.accepted_at, c.connected_at, c.ended_at]) if (time && Date.parse(time) < Date.parse(c.created_at)) throw Error('connect_journal_invalid');
  if (c.connected_at && c.ended_at && Date.parse(c.ended_at) < Date.parse(c.connected_at)) throw Error('connect_journal_invalid');
  let avatar: string | null = null;
  try { const url = new URL(peer.avatar ?? ''); if (url.protocol === 'https:' && !url.username && !url.password) avatar = url.toString(); } catch { /* Initials fallback. */ }
  // Explicit projection: no provider fields or unexpected secrets enter the cache.
  return { call: { id: c.id, caller_profile_id: c.caller_profile_id, recipient_profile_id: c.recipient_profile_id,
    media: c.media, authorization: c.authorization, state: c.state, version: c.version, created_at: c.created_at,
    accepted_at: c.accepted_at, connected_at: c.connected_at, ended_at: c.ended_at, deadline: null, reason: c.reason,
    duration_seconds: null }, direction: row.direction, cleanup: row.cleanup, redialAllowed: row.redialAllowed,
    peer: { profileId: peer.profileId, userId: peer.userId, name: peer.name.trim(), avatar: peer.available && !peer.blocked ? avatar : null,
      available: peer.available, blocked: peer.blocked, chatVisible: peer.chatVisible, chatHiddenBefore: peer.chatHiddenBefore ?? null } };
}
export function mergeJournalEntry(previous: JournalEntry | undefined, next: JournalEntry): JournalEntry {
  if (!previous) return next;
  const a = previous.call, b = next.call;
  if (a.id !== b.id || a.created_at !== b.created_at || a.media !== b.media || a.caller_profile_id !== b.caller_profile_id || a.recipient_profile_id !== b.recipient_profile_id
    || previous.peer.userId !== next.peer.userId || a.authorization !== b.authorization) throw Error('connect_journal_identity_drift');
  if (b.version < a.version || (terminalStates.includes(a.state) && a.state !== b.state)) return previous;
  if (b.version === a.version && a.state !== b.state) return previous;
  return next;
}
/** Preserve sub-millisecond server ordering; the raw timestamp is also the cursor. */
export function compareJournalEntries(a: JournalEntry, b: JournalEntry) {
  const ms = Date.parse(b.call.created_at) - Date.parse(a.call.created_at);
  if (ms) return ms;
  const fraction = (iso: string) => (iso.match(/\.(\d+)/)?.[1] ?? '').padEnd(9, '0');
  return fraction(b.call.created_at).localeCompare(fraction(a.call.created_at)) || b.call.id.localeCompare(a.call.id);
}
