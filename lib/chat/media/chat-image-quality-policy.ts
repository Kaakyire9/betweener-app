export type ChatImageSendQuality = 'standard' | 'hd';

export const CHAT_IMAGE_QUALITY_PROFILES = {
  standard: {
    maxEdge: 1920,
    quality: 0.8,
    targetBytes: 2 * 1024 * 1024,
    fallbackMaxEdge: 1600,
    fallbackQuality: 0.68,
  },
  hd: {
    maxEdge: 4096,
    quality: 0.92,
    targetBytes: 8 * 1024 * 1024,
    fallbackMaxEdge: 3072,
    fallbackQuality: 0.86,
  },
} as const;

export const shouldPreserveAnimatedChatImage = (mime: string, fileName: string) =>
  mime.toLowerCase() === 'image/gif' || fileName.toLowerCase().endsWith('.gif');

export const canReuseChatImageWithoutCompression = (input: {
  mime: string;
  byteSize: number | null;
  width?: number | null;
  height?: number | null;
  quality: ChatImageSendQuality;
}) => {
  const profile = CHAT_IMAGE_QUALITY_PROFILES[input.quality];
  const maxSourceEdge = Math.max(input.width ?? 0, input.height ?? 0);
  return !['image/heic', 'image/heif'].includes(input.mime.toLowerCase())
    && input.byteSize !== null
    && input.byteSize > 0
    && input.byteSize <= profile.targetBytes
    && maxSourceEdge > 0
    && maxSourceEdge <= profile.maxEdge;
};
