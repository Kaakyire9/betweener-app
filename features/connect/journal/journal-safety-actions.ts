import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner.ts';
import type { JournalEntry, JournalService } from './journal-types.ts';
export interface JournalSafetyPort {
  block(userId: string, peerUserId: string, token: string): Promise<{ error: unknown }>;
  report(peerUserId: string, reason: string, token: string): Promise<{ error: unknown }>;
}
/** Explicit safety mutations are separate from the read-only history service. */
export function createJournalSafetyActions(auth: NativeSessionOwner, service: JournalService, port: JournalSafetyPort) {
  const binding = auth.snapshot();
  if (!binding || binding.userId !== service.userId || binding.generation !== service.epoch) throw Error('connect_unauthenticated');
  const run = async (entry: JournalEntry, operation: 'block' | 'report', reason = '') => {
    const token = auth.accessToken(binding);
    const fresh = (await service.page({ callId: entry.call.id, limit: 1 })).items[0];
    auth.accessToken(binding);
    if (!fresh || fresh.peer.userId !== entry.peer.userId || !service.current()) throw Error('connect_journal_unavailable');
    const result = operation === 'block' ? await port.block(service.userId, fresh.peer.userId, token) : await port.report(fresh.peer.userId, reason, token);
    auth.accessToken(binding); if (result.error) throw Error('connect_journal_safety_unavailable');
  };
  return { block: (entry: JournalEntry) => run(entry, 'block'), report: (entry: JournalEntry, reason: string) => {
    if (!['spam', 'harassment', 'inappropriate', 'scam', 'other'].includes(reason)) return Promise.reject(Error('connect_journal_invalid'));
    return run(entry, 'report', reason);
  } };
}
