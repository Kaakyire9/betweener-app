import type { JournalEntry } from './journal-types.ts';
import { compareJournalEntries } from './journal-integrity.ts';

export type JournalTimelineItem<T> = { kind: 'message'; key: string; message: T; messageIndex: number; at: number }
  | { kind: 'call'; key: string; entry: JournalEntry; at: number };
/** Independent typed events: never enter the message outbox, receipts or attachment pipeline. */
export function mergeJournalTimeline<T extends { id: string; timestamp: Date }>(messages: T[], calls: JournalEntry[], hasEarlierMessages = false): JournalTimelineItem<T>[] {
  const earliest = messages.length ? messages[0].timestamp.getTime() : -Infinity;
  const rows: JournalTimelineItem<T>[] = messages.map((message, messageIndex) => ({ kind: 'message', key: `message:${message.id}`, message, messageIndex, at: message.timestamp.getTime() }));
  const seen = new Set<string>();
  for (const entry of calls) {
    const at = Date.parse(entry.call.created_at);
    if (seen.has(entry.call.id) || !entry.peer.chatVisible || (hasEarlierMessages && at < earliest)) continue;
    seen.add(entry.call.id); rows.push({ kind: 'call', key: `call:${entry.call.id}`, entry, at });
  }
  return rows.sort((a, b) => a.at - b.at || (a.kind === 'call' && b.kind === 'call'
    ? -compareJournalEntries(a.entry, b.entry) : a.key.localeCompare(b.key)));
}
export function journalMessageIndex<T>(rows: JournalTimelineItem<T>[], messageIndex: number) {
  return rows.findIndex(row => row.kind === 'message' && row.messageIndex === messageIndex);
}
/** Dedupe previews by canonical identity; a late finalisation keeps its original position. */
export function journalPreviewWins(entry: JournalEntry, messageAt: Date, activityAt?: Date | null) {
  return entry.peer.chatVisible && Date.parse(entry.call.created_at) > Math.max(messageAt.getTime(), activityAt?.getTime() ?? 0);
}
