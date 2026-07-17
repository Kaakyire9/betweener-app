import type { MessageType } from "@/components/chat/types";

type ReactionEntry = MessageType["reactions"][number];

export const applyDeleteMessageForEveryone = ({
  items,
  messageId,
  deletedAt,
  deletedBy,
}: {
  items: MessageType[];
  messageId: string;
  deletedAt: Date;
  deletedBy: string;
}) =>
  items.map((msg) =>
    msg.id === messageId
      ? {
          ...msg,
          type: 'text' as const,
          text: 'Message deleted',
          deletedForAll: true,
          deletedAt,
          deletedBy,
          imageUrl: undefined,
          videoUrl: undefined,
          document: undefined,
          location: undefined,
          voiceMessage: undefined,
          reactions: [],
        }
      : msg
  );

export const applyOptimisticMessageEdit = ({
  items,
  messageId,
  text,
  editedAt,
}: {
  items: MessageType[];
  messageId: string;
  text: string;
  editedAt: Date;
}) =>
  items.map((msg) =>
    msg.id === messageId ? { ...msg, text, editedAt } : msg
  );

export const reconcileEditedMessage = ({
  items,
  messageId,
  text,
  editedAt,
}: {
  items: MessageType[];
  messageId: string;
  text: string;
  editedAt?: Date | null;
}) =>
  items.map((msg) =>
    msg.id === messageId
      ? { ...msg, text, editedAt: editedAt ?? msg.editedAt ?? new Date() }
      : msg
  );

export const applyLocalReactionToggle = ({
  items,
  messageId,
  userId,
  emoji,
}: {
  items: MessageType[];
  messageId: string;
  userId: string;
  emoji: string;
}) => {
  const target = items.find((msg) => msg.id === messageId);
  const previousReactions = target?.reactions ?? [];
  const existingReaction = previousReactions.find((reaction) => reaction.userId === userId);
  const shouldRemove = existingReaction?.emoji === emoji;

  const nextItems = items.map((msg) => {
    if (msg.id !== messageId) return msg;
    if (shouldRemove) {
      return {
        ...msg,
        reactions: msg.reactions.filter((reaction) => reaction.userId !== userId),
      };
    }
    if (existingReaction) {
      return {
        ...msg,
        reactions: msg.reactions.map((reaction) =>
          reaction.userId === userId ? { ...reaction, emoji } : reaction
        ),
      };
    }
    return {
      ...msg,
      reactions: [...msg.reactions, { userId, emoji }],
    };
  });

  return {
    items: nextItems,
    previousReactions,
    shouldRemove,
  };
};

export const restoreMessageReactions = ({
  items,
  messageId,
  reactions,
}: {
  items: MessageType[];
  messageId: string;
  reactions: ReactionEntry[];
}) =>
  items.map((msg) =>
    msg.id === messageId ? { ...msg, reactions } : msg
  );

export const addPinnedMessageId = (ids: string[], messageId: string) =>
  Array.from(new Set([...ids, messageId]));

export const removePinnedMessageId = (ids: string[], messageId: string) =>
  ids.filter((id) => id !== messageId);
