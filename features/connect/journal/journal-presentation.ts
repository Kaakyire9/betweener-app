import { terminalStates } from '../domain/connect.ts';
import type { JournalEntry, JournalOutcome } from './journal-types.ts';

const interruptionReasons = new Set(['deadline_expired', 'provider_session_changed', 'provider_membership_invalid',
  'provider_unavailable', 'eligibility_revoked', 'consent_revoked', 'device_revoked', 'connection_failed', 'interrupted']);
export function journalOutcome(entry: JournalEntry): JournalOutcome {
  const c = entry.call;
  if (c.reason === 'blocked') return 'blocked';
  switch (c.state) {
    case 'REQUESTED': return 'initiated'; case 'RINGING': return 'ringing';
    case 'ACCEPTED': case 'CONNECTING': return 'answered'; case 'ACTIVE': return 'active';
    case 'RECONNECTING': return 'reconnecting'; case 'ENDING': return 'ending';
    case 'DECLINED': return 'declined'; case 'CANCELLED': return 'cancelled'; case 'BUSY': return 'busy';
    case 'MISSED': return entry.direction === 'incoming' ? 'missed' : 'no_answer';
    case 'FAILED': return c.connected_at ? 'interrupted' : 'failed';
    default: return c.connected_at ? interruptionReasons.has(c.reason ?? '') ? 'interrupted' : 'ended' : 'not_connected';
  }
}
/** Never substitutes zero for an unanswered invitation or uses the viewer's clock. */
export function journalDuration(entry: JournalEntry): number | null {
  const c = entry.call;
  if (!c.connected_at || !c.ended_at) return null;
  const delta = Date.parse(c.ended_at) - Date.parse(c.connected_at);
  return Number.isFinite(delta) && delta >= 0 ? Math.floor(delta / 1000) : null;
}
export function formatJournalDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds)), h = Math.floor(value / 3600), m = Math.floor(value / 60) % 60, s = value % 60;
  return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
}
export function journalLabel(entry: JournalEntry) {
  const medium = entry.call.media === 'video' ? 'Video' : 'Voice';
  return ({ initiated: `${medium} call started`, ringing: `${medium} call ringing`, answered: `${medium} call connecting`,
    active: `${medium} call in progress`, reconnecting: 'Reconnecting', ending: 'Ending call', ended: `${medium} call ended`,
    declined: `${medium} call declined`, missed: `Missed ${medium.toLowerCase()} call`, cancelled: `${medium} call cancelled`,
    no_answer: 'No answer', busy: 'Could not connect · Busy', failed: `${medium} call could not connect`,
    interrupted: 'Call interrupted', blocked: 'Call ended · Blocked', not_connected: 'Ended before connecting' })[journalOutcome(entry)];
}
export function journalPreview(entry: JournalEntry) {
  const duration = journalDuration(entry), outcome = journalOutcome(entry);
  if (duration !== null && outcome === 'ended') return `${entry.call.media === 'video' ? 'Video' : 'Voice'} call · ${formatJournalDuration(duration)}`;
  return outcome === 'no_answer' ? 'Outgoing call · No answer' : journalLabel(entry);
}
export function journalDay(iso: string, now = new Date()) {
  const value = new Date(iso), midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(midnight); yesterday.setDate(yesterday.getDate() - 1);
  if (value >= midnight && value < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) return 'Today';
  if (value >= yesterday && value < midnight) return 'Yesterday';
  return value.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(value.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}
export const journalTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const isJournalTerminal = (entry: JournalEntry) => terminalStates.includes(entry.call.state);
export const journalNeedsAttention = (entry: JournalEntry) => ['missed', 'no_answer', 'failed', 'interrupted', 'busy'].includes(journalOutcome(entry));
export function journalSections(rows: JournalEntry[], now = new Date()) {
  const sections: { title: string; data: JournalEntry[] }[] = [];
  for (const row of rows) {
    const title = journalDay(row.call.created_at, now), section = sections.at(-1);
    if (section?.title === title) section.data.push(row); else sections.push({ title, data: [row] });
  }
  return sections;
}
/** Only homogeneous nearby calls share a subtle heading; every individual row stays visible. */
export function nearbyJournalGroups(rows: JournalEntry[]) {
  const counts = new Map<string, number>();
  for (let index = 0; index < rows.length;) {
    const start = rows[index]; let end = index + 1;
    while (end < rows.length && rows[end].peer.profileId === start.peer.profileId && rows[end].call.media === start.call.media
      && rows[end].direction === start.direction && journalOutcome(rows[end]) === journalOutcome(start)
      && Date.parse(start.call.created_at) - Date.parse(rows[end].call.created_at) <= 600_000
      && journalDay(rows[end].call.created_at) === journalDay(start.call.created_at)) end++;
    if (end - index > 1) counts.set(start.call.id, end - index);
    index = end;
  }
  return counts;
}
