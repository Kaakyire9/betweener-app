import { migrateAsyncChatSnapshotsToSQLite, ChatRepository, type ChatThreadRow } from "@/lib/chat/local/chat-db";
import { readOfflineSnapshot } from "@/lib/offline/chat-store";
import { useEffect, useMemo, useState } from "react";

type UseChatListLocalStateArgs<TConversation> = {
  ownerUserId?: string | null;
  cacheKey?: string | null;
  currentConversations: TConversation[];
  localObservedThreads: ChatThreadRow[];
  hasLoadedLocalThreads: boolean;
  deserializeCache: (raw: unknown) => TConversation[];
  threadToConversation: (row: ChatThreadRow) => TConversation;
  mergeLocalThreads: (current: TConversation[], localThreads: ChatThreadRow[]) => TConversation[];
};

export const useChatListLocalState = <TConversation>({
  ownerUserId,
  cacheKey,
  currentConversations,
  localObservedThreads,
  hasLoadedLocalThreads,
  deserializeCache,
  threadToConversation,
  mergeLocalThreads,
}: UseChatListLocalStateArgs<TConversation>) => {
  const [initialHydratedConversations, setInitialHydratedConversations] = useState<TConversation[] | null>(null);
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(null);

  useEffect(() => {
    if (!cacheKey || !ownerUserId) {
      setInitialHydratedConversations(null);
      setLastSyncedAtMs(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      await migrateAsyncChatSnapshotsToSQLite(ownerUserId);
      const localThreads = await ChatRepository.getThreads(ownerUserId, { includeArchived: true });
      const syncState = await ChatRepository.getSyncState(ownerUserId, 'global_threads');
      const lastSyncedAt = syncState?.last_synced_at ? new Date(syncState.last_synced_at).getTime() : 0;

      if (cancelled) return;
      if (Number.isFinite(lastSyncedAt) && lastSyncedAt > 0) {
        setLastSyncedAtMs(lastSyncedAt);
      } else {
        setLastSyncedAtMs(null);
      }

      if (localThreads.length > 0) {
        setInitialHydratedConversations(localThreads.map(threadToConversation));
        return;
      }

      const cached = await readOfflineSnapshot<unknown[]>(cacheKey);
      if (cancelled || !cached) return;
      const hydrated = deserializeCache(cached);
      setInitialHydratedConversations(hydrated.length > 0 ? hydrated : null);
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, deserializeCache, ownerUserId, threadToConversation]);

  const mergedLocalConversations = useMemo(() => {
    if (!hasLoadedLocalThreads || localObservedThreads.length === 0) return null;
    return mergeLocalThreads(currentConversations, localObservedThreads);
  }, [currentConversations, hasLoadedLocalThreads, localObservedThreads, mergeLocalThreads]);

  return {
    initialHydratedConversations,
    mergedLocalConversations,
    lastSyncedAtMs,
  };
};
