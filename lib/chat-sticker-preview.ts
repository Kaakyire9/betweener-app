import {
  parseStickerText,
  type StickerPreview,
} from '@/lib/chat-stickers';

export const parseStickerPreview = (text?: string | null): StickerPreview | null => {
  return parseStickerText(text);
};

export const getStickerMessagePreview = (text?: string | null) => {
  const sticker = parseStickerPreview(text);
  if (!sticker) return 'Sticker';
  return `${sticker.name} ${sticker.emoji}`.trim();
};

export const getStickerReactionTarget = (text?: string | null, previewsAllowed = true) => {
  if (!previewsAllowed) return 'your sticker';
  const sticker = parseStickerPreview(text);
  if (!sticker) return 'your sticker';
  if (sticker.name && sticker.name !== 'Sticker') return `your ${sticker.name} sticker`;
  return 'your sticker';
};
