import type { MessageType } from '@/components/chat/types';

/** Stable private-object references that belong to the visual chat-media bucket. */
export const getChatVisualMediaPaths = (messages: readonly MessageType[]) =>
  Array.from(
    new Set(
      messages
        .filter(
          (message) =>
            !message.deletedForAll &&
            (message.type === 'image' ||
              message.type === 'video' ||
              message.type === 'document'),
        )
        .flatMap((message) => [
          message.storagePath,
          ...(message.mediaItems ?? []).map((item) => item.storagePath),
        ])
        .filter((path): path is string => Boolean(path?.trim())),
    ),
  ).sort();
