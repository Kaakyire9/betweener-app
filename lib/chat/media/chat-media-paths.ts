import type { MessageType } from '@/components/chat/types';

const getMessageVisualMediaPaths = (
  message?: MessageType,
  options?: { isReply?: boolean },
): (string | null | undefined)[] => {
  if (
    !message ||
    message.deletedForAll ||
    !['image', 'video', 'document'].includes(message.type) ||
    (options?.isReply && message.isViewOnce && (message.type === 'image' || message.type === 'video'))
  ) {
    return [];
  }
  return [
    message.storagePath,
    message.previewStoragePath,
    ...(message.mediaItems ?? []).flatMap((item) => [
      item.storagePath,
      item.previewStoragePath,
    ]),
  ];
};

export const getChatMessageVisualMediaPaths = (message: MessageType) =>
  [
    ...getMessageVisualMediaPaths(message),
    ...getMessageVisualMediaPaths(message.replyTo, { isReply: true }),
  ]
    .filter((path): path is string => Boolean(path?.trim()));

/** Stable private-object references that belong to the visual chat-media bucket. */
export const getChatVisualMediaPaths = (messages: readonly MessageType[]) =>
  Array.from(
    new Set(
      messages
        .flatMap(getChatMessageVisualMediaPaths),
    ),
  ).sort();
