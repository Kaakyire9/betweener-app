import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useJournalStore } from './journal-context';
import { journalPreview } from './journal-presentation';
import { journalPreviewWins } from './journal-timeline';
import type { JournalEntry, JournalQuery } from './journal-types';

const blank = { rows: [] as JournalEntry[], busy: false, error: null, offline: false, hasMore: false, freshIds: new Set<string>() };
const none = () => () => {};
export function useJournalFeed(query: JournalQuery, enabled = true) {
  const store = useJournalStore(), key = JSON.stringify(query);
  const feed = useMemo(() => enabled && store ? store.feed(JSON.parse(key)) : null, [enabled, key, store]);
  const state = useSyncExternalStore(feed?.subscribe ?? none, feed?.snapshot ?? (() => blank), feed?.snapshot ?? (() => blank));
  useEffect(() => () => { feed?.cancel(); }, [feed]);
  useFocusEffect(useCallback(() => {
    if (!feed || !store) return;
    const refresh = () => { if (AppState.currentState === 'active') void feed.refresh(); };
    refresh();
    const reconcile = () => { if (AppState.currentState === 'active') void feed.reconcile(); };
    const stop = store.subscribe(reconcile), app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(reconcile, 30_000);
    return () => { stop(); app.remove(); clearInterval(timer); feed.cancel(); };
  }, [feed, store]));
  return { ...state, ready: !!feed, refresh: feed?.refresh ?? (() => Promise.resolve()), more: feed?.more ?? (() => Promise.resolve()) };
}
/** A single bounded batch per visible chat list, not a history fetch per row. */
export function useJournalPreviews<T extends { id: string; lastMessage: { timestamp: Date }; latestActivity?: { createdAt: Date } | null }>(conversations: T[]) {
  const store = useJournalStore(), peersKey = JSON.stringify(conversations.map(row => row.id).slice(0, 200).sort());
  const [state, setState] = useState<{ store: typeof store; rows: JournalEntry[] }>({ store: null, rows: [] });
  useFocusEffect(useCallback(() => {
    if (!store) return;
    let live = true, sequence = 0;
    const refresh = async () => {
      if (AppState.currentState !== 'active') return;
      const request = ++sequence;
      try { const rows = await store.service.previews(JSON.parse(peersKey));
        if (live && request === sequence && store.current()) setState({ store, rows: store.merge(rows) });
      } catch { /* Message previews remain intact when history cannot be refreshed. */ }
    };
    void refresh(); const stop = store.subscribe(() => { void refresh(); });
    const app = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => { live = false; ++sequence; stop(); app.remove(); clearInterval(timer); };
  }, [peersKey, store]));
  return useMemo(() => {
    const rows = new Map((state.store === store && store?.current() ? state.rows : []).map(row => [row.peer.userId, row]));
    return conversations.map(item => {
      const entry = rows.get(item.id);
      return entry && journalPreviewWins(entry, item.lastMessage.timestamp, item.latestActivity?.createdAt)
        ? { ...item, callPreview: { callId: entry.call.id, text: journalPreview(entry), at: new Date(entry.call.created_at), media: entry.call.media } } : item;
    });
  }, [conversations, state, store]);
}
