import type { MessageType } from "@/components/chat/types";
import {
  mergeOutgoingMessageLifecycleState,
  transitionChatLifecycle,
  type ChatLifecycleEvent,
  type OutgoingMessageState,
} from './lifecycle/chat-lifecycle-state-machine.ts';

export type MessageLifecycleEvent =
  | Extract<
      ChatLifecycleEvent,
      | 'send_started'
      | 'finalize_succeeded'
      | 'delivery_confirmed'
      | 'read_confirmed'
      | 'retryable_failure'
      | 'terminal_failure'
      | 'retry_requested'
      | 'cancel_requested'
      | 'delete_requested'
    >
  | 'send_deferred';

const toOutgoingLifecycleState = (
  status?: MessageType['status'] | null,
): OutgoingMessageState => status === 'failed' ? 'retryable_failed' : status ?? 'queued';

const fromOutgoingLifecycleState = (
  status: OutgoingMessageState,
): MessageType['status'] => {
  if (status === 'retryable_failed' || status === 'terminal_failed' || status === 'cancelled') {
    return 'failed';
  }
  if (status === 'deleted') return 'sent';
  return status;
};

const runOutgoingMessageTransition = (
  currentState: OutgoingMessageState,
  event: ChatLifecycleEvent,
) => transitionChatLifecycle({
  machine: 'outgoing_message',
  currentState,
  event,
}).to;

/**
 * Applies a user-visible message event through the formal outgoing-message
 * state machine. `send_deferred` is the intentional two-step transition used
 * when an in-flight optimistic message is durably returned to the queue.
 */
export const transitionOutgoingMessageState = (
  currentState: OutgoingMessageState,
  event: MessageLifecycleEvent,
): OutgoingMessageState => {
  if (event === 'send_deferred') {
    if (currentState === 'queued') return currentState;
    if (currentState === 'retryable_failed') {
      return runOutgoingMessageTransition(currentState, 'retry_requested');
    }
    const failed = runOutgoingMessageTransition(currentState, 'retryable_failure');
    return runOutgoingMessageTransition(failed, 'retry_requested');
  }

  if (event === 'send_started' && currentState === 'retryable_failed') {
    const queued = runOutgoingMessageTransition(currentState, 'retry_requested');
    return runOutgoingMessageTransition(queued, event);
  }

  // A canonical acknowledgement can arrive after the request response was
  // lost and the optimistic message was returned to its durable queue.
  if (
    (event === 'finalize_succeeded' || event === 'delivery_confirmed' || event === 'read_confirmed') &&
    (currentState === 'queued' || currentState === 'retryable_failed')
  ) {
    const queued = currentState === 'retryable_failed'
      ? runOutgoingMessageTransition(currentState, 'retry_requested')
      : currentState;
    const sending = runOutgoingMessageTransition(queued, 'send_started');
    return runOutgoingMessageTransition(sending, event);
  }

  return runOutgoingMessageTransition(currentState, event);
};

export const transitionMessageLifecycle = ({
  items,
  messageId,
  event,
  readAt,
}: {
  items: MessageType[];
  messageId: string;
  event: MessageLifecycleEvent;
  readAt?: Date;
}) => {
  let changed = false;
  const next = items.map((message) => {
    if (message.id !== messageId) return message;
    const transitioned = transitionMessageLifecycleRecord({ message, event, readAt });
    if (transitioned === message) return message;
    changed = true;
    return transitioned;
  });
  return changed ? next : items;
};

export const transitionMessageLifecycleRecord = ({
  message,
  event,
  readAt,
}: {
  message: MessageType;
  event: MessageLifecycleEvent;
  readAt?: Date;
}): MessageType => {
  const currentState = toOutgoingLifecycleState(message.status);
  const nextState = transitionOutgoingMessageState(currentState, event);
  const status = fromOutgoingLifecycleState(nextState);
  const nextReadAt = nextState === 'read' ? message.readAt ?? readAt ?? new Date() : message.readAt;
  if (message.status === status && message.readAt === nextReadAt) return message;
  return { ...message, status, readAt: nextReadAt };
};

export const mergeMessageWithMonotonicReceipt = (
  previous: MessageType,
  next: MessageType,
): MessageType => {
  const status = fromOutgoingLifecycleState(mergeOutgoingMessageLifecycleState(
    toOutgoingLifecycleState(previous.status),
    toOutgoingLifecycleState(next.status),
  ));
  const readAt = status === 'read' ? previous.readAt ?? next.readAt : next.readAt;

  return {
    ...next,
    status,
    readAt,
  };
};

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
    const merged = mergeMessageWithMonotonicReceipt(msg, serverMessage);
    return {
      ...merged,
      replyToId: msg.replyToId ?? merged.replyToId ?? null,
      replyTo: msg.replyTo ?? merged.replyTo,
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
    const nextState = transitionOutgoingMessageState(toOutgoingLifecycleState(msg.status), 'read_confirmed');
    changed = true;
    return { ...msg, status: fromOutgoingLifecycleState(nextState), readAt };
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
    const nextState = transitionOutgoingMessageState(toOutgoingLifecycleState(msg.status), 'delivery_confirmed');
    changed = true;
    return { ...msg, status: fromOutgoingLifecycleState(nextState) };
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
    const nextState = transitionOutgoingMessageState(toOutgoingLifecycleState(msg.status), 'delivery_confirmed');
    changed = true;
    return { ...msg, status: fromOutgoingLifecycleState(nextState) };
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
    const resolvedFromServer: MessageType["status"] = isRead
      ? 'read'
      : deliveredAt
      ? 'delivered'
      : msg.status === 'failed'
      ? 'failed'
      : 'sent';
    const nextStatus = fromOutgoingLifecycleState(mergeOutgoingMessageLifecycleState(
      toOutgoingLifecycleState(msg.status),
      toOutgoingLifecycleState(resolvedFromServer),
    ));
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
