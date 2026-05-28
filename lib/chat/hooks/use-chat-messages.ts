import { ChatRepository, type ChatMessageRow } from "@/lib/chat/local/chat-db";
import { useEffect, useState } from "react";

type UseChatMessagesArgs = {
  ownerUserId?: string | null;
  threadId?: string | null;
  limit?: number;
};

export const useChatMessages = ({
  ownerUserId,
  threadId,
  limit = 50,
}: UseChatMessagesArgs) => {
  const [rows, setRows] = useState<ChatMessageRow[]>([]);
  const [hasLoadedLocal, setHasLoadedLocal] = useState(false);

  useEffect(() => {
    if (!ownerUserId || !threadId) {
      setRows([]);
      setHasLoadedLocal(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const nextRows = await ChatRepository.getMessages(ownerUserId, threadId, { limit });
      if (cancelled) return;
      setRows(nextRows);
      setHasLoadedLocal(true);
    };

    const unsubscribe = ChatRepository.observeMessages(ownerUserId, threadId, () => {
      void load();
    });

    void load();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [limit, ownerUserId, threadId]);

  return {
    rows,
    hasLoadedLocal,
  };
};
