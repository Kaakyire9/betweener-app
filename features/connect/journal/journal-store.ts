import { compareJournalEntries, mergeJournalEntry } from './journal-integrity.ts';
import type { JournalEntry, JournalHint, JournalQuery, JournalService } from './journal-types.ts';

export interface JournalFeedState {
  rows: JournalEntry[]; busy: boolean; error: string | null; offline: boolean; hasMore: boolean; freshIds: ReadonlySet<string>;
}
const empty = (): JournalFeedState => ({ rows: [], busy: false, error: null, offline: false, hasMore: true, freshIds: new Set() });
const retiredSnapshot = empty();
/** One account/epoch, canonical identities. No persistent private data or native SDK. */
export class JournalStore {
  readonly service: JournalService;
  private entries = new Map<string, JournalEntry>();
  private deleted = new Set<string>();
  private pendingDetails = new Set<string>();
  private listeners = new Set<() => void>();
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private retired = false;
  constructor(service: JournalService) { this.service = service; }
  current = () => !this.retired && this.service.current();
  get = (id: string) => this.current() ? this.entries.get(id) : undefined;
  peerForProfile = (id: string) => this.current() ? [...this.entries.values()].find(row => row.peer.profileId === id && row.peer.available && row.peer.chatVisible && !row.peer.blocked) : undefined;
  merge(rows: JournalEntry[]) {
    if (!this.current()) throw Error('connect_unauthenticated');
    for (const row of rows) { this.deleted.delete(row.call.id); this.entries.set(row.call.id, mergeJournalEntry(this.entries.get(row.call.id), row)); }
    return rows.map(row => this.entries.get(row.call.id)!);
  }
  async detail(id: string) {
    const page = await this.service.page({ callId: id, limit: 1 });
    if (!this.current()) throw Error('connect_unauthenticated');
    if (!page.items.length) { this.entries.delete(id); this.deleted.add(id); return null; }
    return this.merge(page.items)[0];
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.unsubscribe) this.unsubscribe = this.service.subscribe?.(hint => this.invalidate(hint));
    return () => { this.listeners.delete(listener); if (!this.listeners.size) { this.unsubscribe?.(); this.unsubscribe = undefined; } };
  };
  invalidate = (hint?: JournalHint) => {
    if (hint && this.entries.has(hint.callId) && hint.version >= this.entries.get(hint.callId)!.call.version && this.pendingDetails.size < 10) this.pendingDetails.add(hint.callId);
    if (this.timer || !this.current()) return;
    this.timer = setTimeout(() => { this.timer = undefined; const ids = [...this.pendingDetails]; this.pendingDetails.clear();
      void Promise.allSettled(ids.map(id => this.detail(id))).then(() => { if (this.current()) for (const listener of this.listeners) listener(); });
    }, 180);
  };
  retire() { this.retired = true; clearTimeout(this.timer); this.unsubscribe?.(); this.entries.clear(); this.deleted.clear(); this.pendingDetails.clear(); this.listeners.clear(); }
  feed(query: JournalQuery) {
    let state = empty(), sequence = 0, cursor: { at: string; id: string } | null = null, loaded = false, disposed = false;
    const listeners = new Set<() => void>();
    const publish = (next: JournalFeedState) => { state = next; for (const listener of listeners) listener(); };
    const update = async (more = false, reconcile = false) => {
      if (disposed || !this.current() || (more && (state.busy || !state.hasMore))) return;
      const request = ++sequence;
      publish({ ...state, busy: true, error: null });
      try {
        const page = await this.service.page({ ...query, cursor: more ? cursor : null });
        if (disposed || request !== sequence || !this.current()) return;
        const oldIds = new Set(state.rows.map(row => row.call.id)), rows = this.merge(page.items);
        const map = new Map((more || reconcile ? state.rows : []).filter(row => !this.deleted.has(row.call.id)).map(row => [row.call.id, this.get(row.call.id) ?? row]));
        // A visibility change must remove previously visible rows, including older pages.
        if (query.scope === 'chat' && rows.some(row => !row.peer.chatVisible)) map.clear();
        for (const row of rows) map.set(row.call.id, row);
        if (query.scope === 'chat') {
          const cutoff = rows[0]?.peer.chatHiddenBefore;
          if (cutoff) for (const [id, row] of map) if (Date.parse(row.call.created_at) <= Date.parse(cutoff)) map.delete(id);
        }
        if (!more && page.items.length === 0) map.clear();
        cursor = more || !reconcile ? page.nextCursor : cursor;
        const freshIds = new Set(rows.filter(row => !oldIds.has(row.call.id)
          && (loaded || (Date.now() - Date.parse(row.call.created_at) >= 0 && Date.now() - Date.parse(row.call.created_at) < 120_000))).map(row => row.call.id));
        publish({ rows: [...map.values()].sort(compareJournalEntries), busy: false, error: null, offline: false,
          hasMore: more || !reconcile ? !!page.nextCursor : state.hasMore, freshIds }); loaded = true;
      } catch {
        if (disposed || request !== sequence || !this.current()) return;
        publish({ ...state, busy: false, offline: state.rows.length > 0, error: 'History could not be refreshed. Try again.' });
      }
    };
    return { snapshot: () => this.current() && !disposed ? state : retiredSnapshot,
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
      refresh: () => update(), more: () => update(true),
      reconcile: () => update(false, true),
      cancel: () => { ++sequence; publish({ ...state, busy: false }); },
      dispose: () => { disposed = true; ++sequence; listeners.clear(); } };
  }
}
