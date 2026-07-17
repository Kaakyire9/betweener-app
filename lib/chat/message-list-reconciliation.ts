import type { MessageType } from "@/components/chat/types";

export const preserveUnchangedMessageReferences = (
  currentMessages: MessageType[],
  nextMessages: MessageType[],
  getMessageKey: (message: MessageType) => string,
) => {
  if (nextMessages.length === 0) {
    return currentMessages.length === 0 ? currentMessages : nextMessages;
  }

  const currentById = new Map(
    currentMessages.map((message) => [message.id, message] as const),
  );
  let listChanged = currentMessages.length !== nextMessages.length;

  const reconciled = nextMessages.map((nextMessage, index) => {
    const currentMessage = currentById.get(nextMessage.id);
    const resolvedMessage =
      currentMessage && getMessageKey(currentMessage) === getMessageKey(nextMessage)
        ? currentMessage
        : nextMessage;

    if (!listChanged && currentMessages[index] !== resolvedMessage) {
      listChanged = true;
    }

    return resolvedMessage;
  });

  return listChanged ? reconciled : currentMessages;
};
