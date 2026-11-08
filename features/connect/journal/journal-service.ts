import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner.ts';
import { connectUuid } from '../domain/call-navigation.ts';
import { readJournalEntry } from './journal-integrity.ts';
import type { JournalEntry, JournalHint, JournalPage, JournalQuery, JournalService } from './journal-types.ts';

export interface JournalRpcPort { rpc(name: string, args: Record<string, unknown>, token: string): Promise<{ data: unknown; error: unknown }> }
export function createJournalService(auth: NativeSessionOwner, profileId: string, port: JournalRpcPort,
  subscribe?: (listener: (hint?: JournalHint) => void) => () => void): JournalService {
  const binding = auth.snapshot();
  if (!binding || !connectUuid(profileId)) throw Error('connect_unauthenticated');
  const current = () => { const live = auth.snapshot(); return live?.generation === binding.generation && live?.userId === binding.userId; };
  const request = async (name: string, args: Record<string, unknown>) => {
    const token = auth.accessToken(binding), result = await port.rpc(name, args, token); auth.accessToken(binding);
    if (result.error) throw Error('connect_journal_unavailable');
    return result.data;
  };
  const read = (value: unknown) => readJournalEntry(value, profileId, binding.userId);
  return { userId: binding.userId, profileId, epoch: binding.generation, current, subscribe,
    async page(query: JournalQuery): Promise<JournalPage> {
      const value = await request('rpc_connect_journal', { p_query: {
        scope: query.scope ?? 'history', peer_user_id: query.peerUserId ?? null, search: query.search?.trim().slice(0, 80) ?? '',
        filter: query.filter ?? 'all', direction: query.direction ?? 'all', outcome: query.outcome ?? 'all', from: query.from ?? null, to: query.to ?? null,
        before: query.cursor?.at ?? null, before_id: query.cursor?.id ?? null, limit: Math.min(50, Math.max(1, query.limit ?? 30)), call_id: query.callId ?? null,
      } }) as { items?: unknown[]; next_cursor?: { at: string; id: string } | null };
      if (!value || !Array.isArray(value.items) || value.items.length > 50) throw Error('connect_journal_invalid');
      const items = value.items.map(read), cursor = value.next_cursor ?? null;
      if (query.peerUserId && items.some(row => row.peer.userId !== query.peerUserId)) throw Error('connect_journal_invalid');
      if (query.callId && items.some(row => row.call.id !== query.callId)) throw Error('connect_journal_invalid');
      if (query.scope === 'chat' && items.some(row => !row.peer.chatVisible)) throw Error('connect_journal_invalid');
      if (cursor && (!items.length || cursor.at !== items.at(-1)!.call.created_at || cursor.id !== items.at(-1)!.call.id)) throw Error('connect_journal_invalid');
      return { items, nextCursor: cursor };
    },
    async previews(peers) {
      const selected = [...new Set(peers)].filter(connectUuid).slice(0, 200);
      if (!selected.length) return [];
      const value = await request('rpc_connect_journal_previews', { p_peers: selected });
      if (!Array.isArray(value) || value.length > selected.length) throw Error('connect_journal_invalid');
      const rows: JournalEntry[] = value.map(read);
      if (rows.some(row => !selected.includes(row.peer.userId) || !row.peer.chatVisible)) throw Error('connect_journal_invalid');
      return rows;
    },
  };
}
