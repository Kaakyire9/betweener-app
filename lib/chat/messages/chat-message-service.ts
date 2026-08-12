import type { MessageType } from '@/components/chat/types';

/** Builds a locally durable text message before the outbox sends it. */
export const createOptimisticTextMessage = ({
  text,
  senderId,
  replyTo,
  now = new Date(),
}: {
  text: string;
  senderId: string;
  replyTo?: MessageType;
  now?: Date;
}): MessageType => {
  const id = `temp-${now.getTime()}`;

  return {
    id,
    clientMessageId: id,
    text,
    senderId,
    timestamp: now,
    type: 'text',
    reactions: [],
    status: 'sending',
    replyToId: replyTo?.id ?? null,
    replyTo,
  };
};
