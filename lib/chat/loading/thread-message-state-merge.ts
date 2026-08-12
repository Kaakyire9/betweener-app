import type { MessageType } from '../../../components/chat/types';

/** Merges incremental server rows without losing local playback or cached media. */
export const mergeIncrementalThreadMessages = (
  previousMessages: MessageType[],
  fetchedMessages: MessageType[],
) => {
  if (fetchedMessages.length === 0) return previousMessages;
  const byId = new Map(previousMessages.map((message) => [message.id, message] as const));
  const findExistingIdByClientMessageId = (clientMessageId: string, nextId: string) => {
    for (const [id, message] of byId.entries()) {
      if (id !== nextId && message.clientMessageId === clientMessageId) return id;
    }
    return null;
  };
  fetchedMessages.forEach((message) => {
    const existingClientId = message.clientMessageId
      ? findExistingIdByClientMessageId(message.clientMessageId, message.id)
      : null;
    const previous = byId.get(existingClientId ?? message.id);
    if (existingClientId) byId.delete(existingClientId);
    byId.set(message.id, previous ? {
      ...previous,
      ...message,
      reactions: message.reactions?.length ? message.reactions : previous.reactions,
      replyTo: message.replyTo ?? previous.replyTo,
      offlineImageUri: message.offlineImageUri ?? previous.offlineImageUri,
      offlineVideoUri: message.offlineVideoUri ?? previous.offlineVideoUri,
      voiceMessage: message.voiceMessage && previous.voiceMessage
        ? { ...message.voiceMessage, isPlaying: previous.voiceMessage.isPlaying }
        : message.voiceMessage ?? previous.voiceMessage,
    } : message);
  });
  return Array.from(byId.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
};
