import { migrateAsyncChatSnapshotsToSQLite, ChatRepository, type ChatThreadRow } from "@/lib/chat/local/chat-db";
import { readOfflineSnapshot } from "@/lib/offline/chat-store";
import { Platform } from "react-native";
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

  const withTimeoutFallback = async <T,>(
    task: Promise<T>,
    timeoutMs: number,
    fallback: T,
  ): Promise<{ value: T; timedOut: boolean }> => {
    let timedOut = false;
    const timeoutTask = new Promise<T>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve(fallback);
      }, timeoutMs);
    });
    const value = await Promise.race([task, timeoutTask]);
    return { value, timedOut };
  };

  useEffect(() => {
    if (!cacheKey || !ownerUserId) {
      setInitialHydratedConversations(null);
      setLastSyncedAtMs(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      await migrateAsyncChatSnapshotsToSQLite(ownerUserId);
      const localTimeoutMs = Platform.OS === 'ios' ? 1000 : 2200;
      const [{ value: localThreads, timedOut: localThreadsTimedOut }, { value: syncState, timedOut: syncStateTimedOut }] =
        await Promise.all([
          withTimeoutFallback(
            ChatRepository.getThreads(ownerUserId, { includeArchived: true }),
            localTimeoutMs,
            [] as ChatThreadRow[],
          ),
          withTimeoutFallback(
            ChatRepository.getSyncState(ownerUserId, 'global_threads'),
            localTimeoutMs,
            null,
          ),
        ]);

      if (localThreadsTimedOut) {
        console.log('[chat][list][local] hydrate-threads-timeout', {
          ownerUserId,
          platform: Platform.OS,
          timeoutMs: localTimeoutMs,
        });
      }
      if (syncStateTimedOut) {
        console.log('[chat][list][local] hydrate-sync-timeout', {
          ownerUserId,
          platform: Platform.OS,
          timeoutMs: localTimeoutMs,
        });
      }
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
