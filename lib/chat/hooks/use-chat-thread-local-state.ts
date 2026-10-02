import type { MessageType } from "@/components/chat/types";
import type { ChatMessageRow } from "@/lib/chat/local/chat-db";
import {
  preserveUnchangedMessageReferences,
  removeSupersededOptimisticMessages,
} from "@/lib/chat/message-list-reconciliation";
import { mergeMessageWithMonotonicReceipt } from "@/lib/chat/message-state";
import {
  buildChatThreadLocalRevision,
  getChatMessageRowRevisionKey,
} from '@/lib/chat/local/chat-thread-local-revision';
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
  getMessageRevisionKey: (message: MessageType) => string;
};

export const buildChatThreadLocalState = ({
  rows,
  hasLoadedLocal,
  pageSize,
  currentMessages,
  mapRow,
  mergeOfflineMediaIntoMessage,
  linkReplies,
  reconcileDeliveredFallback,
  getMessageRevisionKey,
}: UseChatThreadLocalStateArgs) => {
  if (!hasLoadedLocal || rows.length === 0) {
    return {
      mergedMessages: null as MessageType[] | null,
      hasMore: false,
      oldestTimestamp: null as Date | null,
      revision: null as string | null,
    };
  }

  const localMessages = rows.map(mapRow);
  const previousById = new Map(currentMessages.map((message) => [message.id, message] as const));
  const localIds = new Set(localMessages.map((message) => message.id));

  const mergedLocal = localMessages.map((message) => {
    const previous = previousById.get(message.id);
    const withOfflineMedia = mergeOfflineMediaIntoMessage(message, previous);
    if (!previous) return withOfflineMedia;
    const withReceipt = mergeMessageWithMonotonicReceipt(previous, withOfflineMedia);
    return {
      ...withReceipt,
      reactions: previous.reactions?.length ? previous.reactions : withReceipt.reactions,
      replyTo: previous.replyTo,
      offlineImageUri: withReceipt.offlineImageUri ?? previous.offlineImageUri,
      offlineVideoUri: withReceipt.offlineVideoUri ?? previous.offlineVideoUri,
      voiceMessage:
        withReceipt.voiceMessage && previous.voiceMessage
          ? {
              ...withReceipt.voiceMessage,
              isPlaying: previous.voiceMessage.isPlaying,
            }
          : withReceipt.voiceMessage,
    } satisfies MessageType;
  });

  const preserved = currentMessages.filter((message) => !localIds.has(message.id));
  const mergedMessages = reconcileDeliveredFallback(
    linkReplies(
      [...removeSupersededOptimisticMessages([...mergedLocal, ...preserved])]
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    ),
  );

  const reconciledMessages = preserveUnchangedMessageReferences(
    currentMessages,
    mergedMessages,
    getMessageRevisionKey,
  );

  const hasMore = rows.length >= pageSize;
  const oldestTimestamp = rows[0] ? new Date(rows[0].created_at) : null;
  // This revision represents the SQLite snapshot only. Including merged React
  // state here makes a UI update look like a fresh database observation and
  // can recursively reapply an unchanged snapshot.
  const revision = buildChatThreadLocalRevision(
    rows,
    hasMore,
    oldestTimestamp,
    getChatMessageRowRevisionKey,
  );

  return {
    mergedMessages: reconciledMessages,
    hasMore,
    oldestTimestamp,
    revision,
  };
};

export const useChatThreadLocalState = (args: UseChatThreadLocalStateArgs) => {
  return useMemo(() => buildChatThreadLocalState(args), [
    args.currentMessages,
    args.getMessageRevisionKey,
    args.hasLoadedLocal,
    args.linkReplies,
    args.mapRow,
    args.mergeOfflineMediaIntoMessage,
    args.pageSize,
    args.reconcileDeliveredFallback,
    args.rows,
  ]);
};
