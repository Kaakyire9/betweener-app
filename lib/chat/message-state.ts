import type { MessageType } from "@/components/chat/types";

type MessageStatus = NonNullable<MessageType["status"]>;

export const appendMessage = (
  items: MessageType[],
  message: MessageType,
) => [...items, message];

export const removeMessageById = (
  items: MessageType[],
  messageId: string,
) => items.filter((item) => item.id !== messageId);

export const replaceMessageById = (
  items: MessageType[],
  messageId: string,
  replacement: MessageType,
) => {
  const index = items.findIndex((msg) => msg.id === messageId);
  if (index === -1) return items;
  const next = items.slice();
  next[index] = replacement;
  return next;
};

export const setMessageStatus = (
  items: MessageType[],
  messageId: string,
  status: MessageStatus,
) => {
  let changed = false;
  const next = items.map((msg) => {
    if (msg.id !== messageId || msg.status === status) return msg;
    changed = true;
    return { ...msg, status };
  });
  return changed ? next : items;
};

export const reconcileMessageWithServer = ({
  items,
  messageId,
  serverMessage,
}: {
  items: MessageType[];
  messageId: string;
  serverMessage: MessageType;
}) =>
  items.map((msg) => {
    if (msg.id !== messageId) return msg;
    return {
      ...serverMessage,
      replyToId: msg.replyToId ?? serverMessage.replyToId ?? null,
      replyTo: msg.replyTo ?? serverMessage.replyTo,
    };
  });

export const markIncomingMessageRead = ({
  items,
  messageId,
  currentUserId,
  readAt = new Date(),
}: {
  items: MessageType[];
  messageId: string;
  currentUserId?: string | null;
  readAt?: Date;
}) => {
  let changed = false;
  const next = items.map((msg) => {
    if (msg.id !== messageId || msg.senderId === (currentUserId || '')) return msg;
    if (msg.status === 'read' && msg.readAt) return msg;
    changed = true;
    return { ...msg, status: 'read' as const, readAt };
  });
  return changed ? next : items;
};

export const markOutgoingMessageDelivered = ({
  items,
  messageId,
  currentUserId,
}: {
  items: MessageType[];
  messageId: string;
  currentUserId?: string | null;
}) => {
  let changed = false;
  const next = items.map((msg) => {
    if (msg.id !== messageId || msg.senderId !== (currentUserId || '')) return msg;
    if (msg.status === 'read' || msg.status === 'delivered' || msg.status === 'failed') {
      return msg;
    }
    changed = true;
    return { ...msg, status: 'delivered' as const };
  });
  return changed ? next : items;
};

export const markAllOutgoingMessagesDelivered = ({
  items,
  currentUserId,
}: {
  items: MessageType[];
  currentUserId?: string | null;
}) => {
  let changed = false;
  const next = items.map((msg) => {
    if (msg.senderId !== (currentUserId || '')) return msg;
    if (msg.status === 'read' || msg.status === 'delivered' || msg.status === 'failed') {
      return msg;
    }
    changed = true;
    return { ...msg, status: 'delivered' as const };
  });
  return changed ? next : items;
};

export const applySyncedOutgoingReceiptState = ({
  items,
  messageId,
  currentUserId,
  isRead,
  deliveredAt,
  readAt = new Date(),
}: {
  items: MessageType[];
  messageId: string;
  currentUserId?: string | null;
  isRead: boolean;
  deliveredAt?: string | Date | null;
  readAt?: Date;
}) => {
  let resolvedStatus: MessageType["status"] | null = null;
  let changed = false;
  const next = items.map((msg) => {
    if (msg.id !== messageId || msg.senderId !== (currentUserId || '')) return msg;
    const nextStatus: MessageType["status"] = isRead
      ? 'read'
      : deliveredAt
      ? 'delivered'
      : msg.status === 'failed'
      ? 'failed'
      : 'sent';
    resolvedStatus = nextStatus;
    const nextReadAt = isRead ? (msg.readAt ?? readAt) : msg.readAt;
    if (msg.status === nextStatus && msg.readAt === nextReadAt) return msg;
    changed = true;
    return {
      ...msg,
      status: nextStatus,
      readAt: nextReadAt,
    };
  });
  return {
    items: changed ? next : items,
    resolvedStatus,
  };
};
