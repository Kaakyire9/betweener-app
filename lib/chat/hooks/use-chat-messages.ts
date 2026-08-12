import { ChatRepository, type ChatMessageRow } from "@/lib/chat/local/chat-db";
import { createCoalescedAsyncRunner } from "@/lib/chat/local/coalesced-async-runner";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

type UseChatMessagesArgs = {
  ownerUserId?: string | null;
  threadId?: string | null;
  limit?: number;
};

const areMessageRowsEqual = (
  previous: ChatMessageRow[],
  next: ChatMessageRow[],
) => {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;

  return previous.every((previousRow, index) => {
    const nextRow = next[index];
    if (!nextRow) return false;

    const keys = Object.keys(previousRow) as (keyof ChatMessageRow)[];
    const nextKeys = Object.keys(nextRow) as (keyof ChatMessageRow)[];
    if (keys.length !== nextKeys.length) return false;
    return keys.every((key) => previousRow[key] === nextRow[key]);
  });
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
    const timeoutMs = Platform.OS === "ios" ? 1200 : 2500;

    const load = async () => {
      const startedAt = Date.now();
      let timedOut = false;
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        console.log("[chat][thread][local] getMessages-timeout", {
          ownerUserId,
          threadId,
          limit,
          platform: Platform.OS,
          durationMs: Date.now() - startedAt,
        });
        // A slow local cache must never hold remote thread recovery hostage.
        // Keep the current rows intact; the pending read remains authoritative
        // and will still be applied when SQLite finishes.
        if (!cancelled) {
          setHasLoadedLocal(true);
        }
      }, timeoutMs);

      let nextRows: ChatMessageRow[];
      try {
        nextRows = await ChatRepository.getMessages(ownerUserId, threadId, { limit });
      } finally {
        clearTimeout(timeoutHandle);
      }
      if (cancelled) return;
      setRows((previous) => (areMessageRowsEqual(previous, nextRows) ? previous : nextRows));
      setHasLoadedLocal(true);
      if (timedOut) {
        console.log("[chat][thread][local] getMessages-recovered", {
          ownerUserId,
          threadId,
          limit,
          platform: Platform.OS,
          durationMs: Date.now() - startedAt,
          messageCount: nextRows.length,
        });
      }
    };

    const runner = createCoalescedAsyncRunner(load, (error) => {
      console.log("[chat][thread][local] getMessages-error", {
        ownerUserId,
        threadId,
        limit,
        platform: Platform.OS,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!cancelled) {
        setHasLoadedLocal(true);
      }
    });

    const unsubscribe = ChatRepository.observeMessages(ownerUserId, threadId, () => {
      runner.request();
    });

    runner.request();

    return () => {
      cancelled = true;
      runner.stop();
      unsubscribe();
    };
  }, [limit, ownerUserId, threadId]);

  return {
    rows,
    hasLoadedLocal,
  };
};
