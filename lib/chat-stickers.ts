export const STICKER_COLORS = {
  mood: '#f59e0b',
  energy: '#f97316',
  heart: '#f43f5e',
  celebration: '#38bdf8',
} as const;

export const MOOD_STICKERS = [
  { emoji: '\u{1F60A}', name: 'Happy', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F970}', name: 'Loved', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F929}', name: 'Excited', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F60E}', name: 'Cool', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F979}', name: 'Adorable', category: 'mood', color: STICKER_COLORS.mood },
  { emoji: '\u{1F4AA}', name: 'Motivated', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u{1F525}', name: 'Fire', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u26A1', name: 'Electric', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u2728', name: 'Sparkle', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u2B50', name: 'Star', category: 'energy', color: STICKER_COLORS.energy },
  { emoji: '\u2764\uFE0F', name: 'Love', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F495}', name: 'Hearts', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F496}', name: 'Sparkling Heart', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F339}', name: 'Rose', category: 'heart', color: STICKER_COLORS.heart },
  { emoji: '\u{1F973}', name: 'Party', category: 'celebration', color: STICKER_COLORS.celebration },
  { emoji: '\u{1F389}', name: 'Confetti', category: 'celebration', color: STICKER_COLORS.celebration },
  { emoji: '\u{1F64C}', name: 'Celebrate', category: 'celebration', color: STICKER_COLORS.celebration },
  { emoji: '\u{1F388}', name: 'Balloon', category: 'celebration', color: STICKER_COLORS.celebration },
] as const;

export const STICKER_TEXT_PREFIX = 'sticker::';

const LEGACY_STICKER_EMOJI_TOKEN = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D)+$/u;
const STRIP_EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu;

const STICKER_BY_NAME = new Map(
  MOOD_STICKERS.map((sticker) => [sticker.name.trim().toLowerCase(), sticker] as const),
);

export type StickerPreview = {
  emoji: string;
  name: string;
  color?: string | null;
};

const normalizeStickerLookupValue = (value?: string | null) =>
  String(value || '')
    .replace(STRIP_EMOJI_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const resolveKnownStickerByName = (value?: string | null) => {
  const normalized = normalizeStickerLookupValue(value);
  if (!normalized) return null;
  return STICKER_BY_NAME.get(normalized) ?? null;
};

export const buildStickerPayload = (sticker: (typeof MOOD_STICKERS)[number]) =>
  `${STICKER_TEXT_PREFIX}${JSON.stringify({
    emoji: sticker.emoji,
    name: sticker.name,
    color: sticker.color,
    category: sticker.category,
  })}`;

export const parseStickerPayload = (text?: string | null): StickerPreview | null => {
  const value = String(text || '').trim();
  if (!value || !value.startsWith(STICKER_TEXT_PREFIX)) return null;

  try {
    const parsed = JSON.parse(value.slice(STICKER_TEXT_PREFIX.length));
    if (!parsed || typeof parsed.emoji !== 'string') return null;
    return {
      emoji: parsed.emoji,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Sticker',
      color: typeof parsed.color === 'string' ? parsed.color : STICKER_COLORS.mood,
    };
  } catch {
    return null;
  }
};

export const parseStickerFallback = (text?: string | null): StickerPreview | null => {
  const value = String(text || '').trim();
  if (!value) return null;

  const knownSticker = resolveKnownStickerByName(value);
  if (knownSticker) {
    return {
      emoji: knownSticker.emoji,
      name: knownSticker.name,
      color: knownSticker.color,
    };
  }

  const [emoji, ...rest] = value.split(' ');
  if (!emoji || !LEGACY_STICKER_EMOJI_TOKEN.test(emoji)) return null;

  const legacyName = rest.join(' ').trim();
  const namedSticker = resolveKnownStickerByName(legacyName);
  if (namedSticker) {
    return {
      emoji: namedSticker.emoji,
      name: namedSticker.name,
      color: namedSticker.color,
    };
  }

  return {
    emoji,
    name: legacyName || 'Sticker',
    color: null,
  };
};

export const parseStickerText = (text?: string | null): StickerPreview | null =>
  parseStickerPayload(text) ?? parseStickerFallback(text);
