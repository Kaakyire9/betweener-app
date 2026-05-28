export const STICKER_TEXT_PREFIX = 'sticker::';

const LEGACY_STICKER_EMOJI_TOKEN = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D)+$/u;

export type StickerPreview = {
  emoji: string;
  name: string;
  color?: string | null;
};

export const parseStickerPreview = (text?: string | null): StickerPreview | null => {
  const value = String(text || '').trim();
  if (!value) return null;

  if (value.startsWith(STICKER_TEXT_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(STICKER_TEXT_PREFIX.length));
      if (!parsed || typeof parsed.emoji !== 'string') return null;
      return {
        emoji: parsed.emoji,
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Sticker',
        color: typeof parsed.color === 'string' ? parsed.color : null,
      };
    } catch {
      return null;
    }
  }

  const [emoji, ...rest] = value.split(' ');
  if (!emoji) return null;
  if (!LEGACY_STICKER_EMOJI_TOKEN.test(emoji)) return null;
  const name = rest.join(' ').trim() || 'Sticker';
  return { emoji, name, color: null };
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
