import { ChatRepository, type ChatThreadRow } from "@/lib/chat/local/chat-db";
import { Platform } from "react-native";
import { useEffect, useState } from "react";

type UseChatThreadsArgs = {
  ownerUserId?: string | null;
  includeArchived?: boolean;
  limit?: number;
};

export const useChatThreads = ({
  ownerUserId,
  includeArchived = true,
  limit = 200,
}: UseChatThreadsArgs) => {
  const [rows, setRows] = useState<ChatThreadRow[]>([]);
  const [hasLoadedLocal, setHasLoadedLocal] = useState(false);

  useEffect(() => {
    if (!ownerUserId) {
      setRows([]);
      setHasLoadedLocal(false);
      return;
    }

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let loadVersion = 0;

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

    const load = async () => {
      const version = ++loadVersion;
      const timeoutMs = Platform.OS === 'ios' ? 1000 : 2200;
      const { value: nextRows, timedOut } = await withTimeoutFallback(
        ChatRepository.getThreads(ownerUserId, {
          includeArchived,
          limit,
          operationPriority: 'normal',
        }),
        timeoutMs,
        rows,
      );
      if (cancelled || version !== loadVersion) return;
      if (timedOut) {
        console.log('[chat][list][local] observe-threads-timeout', {
          ownerUserId,
          platform: Platform.OS,
          timeoutMs,
          includeArchived,
          limit,
        });
      }
      setRows(nextRows);
      setHasLoadedLocal(true);
    };

    const unsubscribe = ChatRepository.observeThreads(ownerUserId, () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void load();
      }, 40);
    });

    void load();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [includeArchived, limit, ownerUserId]);

  return {
    rows,
    hasLoadedLocal,
  };
};
