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

    const load = async () => {
      const nextRows = await ChatRepository.getThreads(ownerUserId, { includeArchived, limit });
      if (cancelled) return;
      setRows(nextRows);
      setHasLoadedLocal(true);
    };

    const unsubscribe = ChatRepository.observeThreads(ownerUserId, () => {
      void load();
    });

    void load();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [includeArchived, limit, ownerUserId]);

  return {
    rows,
    hasLoadedLocal,
  };
};
