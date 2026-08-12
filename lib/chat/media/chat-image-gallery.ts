import type { ChatMediaItem, MessageType } from '@/components/chat/types';
import { getMessageImageItems } from '../media-album.ts';

export type ChatImageGallerySelection = {
  count: number;
  index: number;
  mediaItem: ChatMediaItem | null;
  message: MessageType;
  renderedUri: string | null;
};

const firstUri = (...values: (string | null | undefined)[]) =>
  values.find((value): value is string => Boolean(value?.trim())) ?? null;

export const resolveChatGalleryOriginalUri = (
  mediaItem: ChatMediaItem,
  mediaUrisByPath: Readonly<Record<string, string>>,
) => firstUri(
  mediaItem.storagePath ? mediaUrisByPath[mediaItem.storagePath] : null,
  mediaItem.localUri,
  mediaItem.signedUrl,
);

export const resolveChatGalleryPreviewUri = (
  mediaItem: ChatMediaItem,
  mediaUrisByPath: Readonly<Record<string, string>>,
) => firstUri(
  mediaItem.localPreviewUri,
  mediaItem.previewStoragePath ? mediaUrisByPath[mediaItem.previewStoragePath] : null,
  mediaItem.previewSignedUrl,
);

export const selectChatImageGalleryItem = (
  message: MessageType,
  requestedIndex: number,
  mediaUrisByPath: Readonly<Record<string, string>>,
  fallbackUri?: string | null,
): ChatImageGallerySelection => {
  const mediaItems = getMessageImageItems(message);
  if (mediaItems.length === 0) {
    return {
      count: 1,
      index: 0,
      mediaItem: null,
      message,
      renderedUri: firstUri(fallbackUri, message.offlineImageUri, message.imageUrl),
    };
  }

  const index = Math.max(0, Math.min(Math.trunc(requestedIndex), mediaItems.length - 1));
  const mediaItem = mediaItems[index];
  const originalUri = resolveChatGalleryOriginalUri(mediaItem, mediaUrisByPath);
  const previewUri = resolveChatGalleryPreviewUri(mediaItem, mediaUrisByPath);
  const renderedUri = firstUri(originalUri, previewUri, index === 0 ? fallbackUri : null);

  return {
    count: mediaItems.length,
    index,
    mediaItem,
    renderedUri,
    message: {
      ...message,
      storagePath: mediaItem.storagePath || message.storagePath || null,
      imageUrl: mediaItem.signedUrl ?? renderedUri ?? message.imageUrl,
      offlineImageUri: mediaItem.localUri,
    },
  };
};
