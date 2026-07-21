import { ChatRepository, type ChatMessageRow } from "@/lib/chat/local/chat-db";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

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
      const startedAt = Date.now();
      const nextRows = await Promise.race([
        ChatRepository.getMessages(ownerUserId, threadId, { limit }),
        new Promise<ChatMessageRow[]>((resolve) => {
          setTimeout(() => resolve([]), Platform.OS === "ios" ? 1200 : 2500);
        }),
      ]);
      if (nextRows.length === 0 && Date.now() - startedAt >= (Platform.OS === "ios" ? 1150 : 2450)) {
        console.log("[chat][thread][local] getMessages-timeout", {
          ownerUserId,
          threadId,
          limit,
          platform: Platform.OS,
          durationMs: Date.now() - startedAt,
        });
      }
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
