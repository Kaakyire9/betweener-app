import type { MessageType } from "@/components/chat/types";
import type { ChatMessageRow } from "@/lib/chat/local/chat-db";
import { useMemo } from "react";

type UseChatThreadLocalStateArgs = {
  rows: ChatMessageRow[];
  hasLoadedLocal: boolean;
  pageSize: number;
  currentMessages: MessageType[];
  mapRow: (row: ChatMessageRow) => MessageType;
  mergeOfflineMediaIntoMessage: (nextMessage: MessageType, previous?: MessageType | null) => MessageType;
  linkReplies: (messages: MessageType[]) => MessageType[];
  reconcileDeliveredFallback: (messages: MessageType[]) => MessageType[];
  getMessageLocalObserverKey: (message: MessageType) => string;
};

export const useChatThreadLocalState = ({
  rows,
  hasLoadedLocal,
  pageSize,
  currentMessages,
  mapRow,
  mergeOfflineMediaIntoMessage,
  linkReplies,
  reconcileDeliveredFallback,
  getMessageLocalObserverKey,
}: UseChatThreadLocalStateArgs) => {
  return useMemo(() => {
    if (!hasLoadedLocal || rows.length === 0) {
      return {
        mergedMessages: null as MessageType[] | null,
        hasMore: false,
        oldestTimestamp: null as Date | null,
      };
    }

    const localMessages = rows.map(mapRow);
    const previousById = new Map(currentMessages.map((message) => [message.id, message] as const));
    const localIds = new Set(localMessages.map((message) => message.id));

    const mergedLocal = localMessages.map((message) => {
      const previous = previousById.get(message.id);
      const withOfflineMedia = mergeOfflineMediaIntoMessage(message, previous);
      if (!previous) return withOfflineMedia;
      return {
        ...withOfflineMedia,
        reactions: previous.reactions?.length ? previous.reactions : withOfflineMedia.reactions,
        replyTo: previous.replyTo,
        offlineImageUri: withOfflineMedia.offlineImageUri ?? previous.offlineImageUri,
        offlineVideoUri: withOfflineMedia.offlineVideoUri ?? previous.offlineVideoUri,
        voiceMessage:
          withOfflineMedia.voiceMessage && previous.voiceMessage
            ? {
                ...withOfflineMedia.voiceMessage,
                isPlaying: previous.voiceMessage.isPlaying,
              }
            : withOfflineMedia.voiceMessage,
      } satisfies MessageType;
    });

    const preserved = currentMessages.filter((message) => !localIds.has(message.id));
    const mergedMessages = reconcileDeliveredFallback(
      linkReplies([...mergedLocal, ...preserved].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())),
    );

    const currentKey = currentMessages.map(getMessageLocalObserverKey).join("|");
    const nextKey = mergedMessages.map(getMessageLocalObserverKey).join("|");

    return {
      mergedMessages: currentKey === nextKey ? currentMessages : mergedMessages,
      hasMore: rows.length >= pageSize,
      oldestTimestamp: rows[0] ? new Date(rows[0].created_at) : null,
    };
  }, [
    currentMessages,
    getMessageLocalObserverKey,
    hasLoadedLocal,
    linkReplies,
    mapRow,
    mergeOfflineMediaIntoMessage,
    pageSize,
    reconcileDeliveredFallback,
    rows,
  ]);
};
