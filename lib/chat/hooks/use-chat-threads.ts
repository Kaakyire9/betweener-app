import { ChatRepository, type ChatThreadRow } from "@/lib/chat/local/chat-db";
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

    const load = async () => {
      const version = ++loadVersion;
      const nextRows = await ChatRepository.getThreads(ownerUserId, { includeArchived, limit });
      if (cancelled || version !== loadVersion) return;
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
