import type { ChatMediaItem, MessageType } from '@/components/chat/types';

const asFiniteNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export const normalizeChatMediaItems = (value: unknown): ChatMediaItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, fallbackIndex): ChatMediaItem | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const storagePath = typeof record.storagePath === 'string' ? record.storagePath : '';
      const attachmentId = typeof record.attachmentId === 'string' ? record.attachmentId : '';
      const index = asFiniteNumber(record.index) ?? fallbackIndex;
      if (!storagePath || !attachmentId) return null;
      return {
        attachmentId,
        index,
        type: record.type === 'video' ? 'video' : 'image',
        storagePath,
        mimeType: typeof record.mimeType === 'string' ? record.mimeType : null,
        width: asFiniteNumber(record.width),
        height: asFiniteNumber(record.height),
        byteSize: asFiniteNumber(record.byteSize),
        durationMs: asFiniteNumber(record.durationMs),
        previewStoragePath:
          typeof record.previewStoragePath === 'string' ? record.previewStoragePath : null,
      };
    })
    .filter((entry): entry is ChatMediaItem => Boolean(entry))
    .sort((left, right) => left.index - right.index)
    .slice(0, 10);
};

export const getMessageMediaItems = (message: MessageType): ChatMediaItem[] => {
  if (message.mediaItems?.length) {
    const ordered = [...message.mediaItems].sort((a, b) => a.index - b.index);
    const expectedCount = Math.max(ordered.length, Math.min(message.mediaExpectedCount ?? ordered.length, 10));
    if (expectedCount === ordered.length) return ordered;
    const byIndex = new Map(ordered.map((item) => [item.index, item]));
    return Array.from({ length: expectedCount }, (_, index) => byIndex.get(index) ?? {
      attachmentId: `pending-${message.id}-${index}`,
      index,
      type: message.type === 'video' ? 'video' as const : 'image' as const,
      storagePath: '',
    });
  }
  const mediaType = message.type === 'video' ? 'video' as const : 'image' as const;
  const uri = mediaType === 'video'
    ? message.offlineVideoUri ?? message.videoUrl
    : message.offlineImageUri ?? message.imageUrl;
  if (!message.storagePath && !uri) return [];
  return [{
    attachmentId: message.id,
    index: 0,
    type: mediaType,
    storagePath: message.storagePath ?? '',
    localUri: mediaType === 'video' ? message.offlineVideoUri : message.offlineImageUri,
    signedUrl: mediaType === 'video' ? message.videoUrl : message.imageUrl,
  }];
};

/** @deprecated Prefer getMessageMediaItems; retained for existing callers. */
export const getMessageImageItems = getMessageMediaItems;

export const getStableChatImageFrame = (
  width?: number | null,
  height?: number | null,
  maxWidth = 340,
) => {
  const safeWidth = width && width > 0 ? width : 1;
  const safeHeight = height && height > 0 ? height : 1;
  const ratio = safeWidth / safeHeight;
  if (ratio < 0.82) return { width: maxWidth, height: Math.round(maxWidth * 1.25) };
  if (ratio > 1.28) return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
  return { width: maxWidth, height: maxWidth };
};
