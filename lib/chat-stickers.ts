export const STICKER_COLORS = {
  mood: '#f59e0b',
  energy: '#f97316',
  heart: '#f43f5e',
  celebration: '#38bdf8',
  connection: '#14b8a6',
  daily: '#8b5cf6',
} as const;

export type ChatStickerDefinition = {
  id: string;
  emoji: string;
  name: string;
  category: keyof typeof STICKER_COLORS;
  pack: 'Essentials' | 'Between Us' | 'Everyday';
  color: string;
  keywords: readonly string[];
};

export const MOOD_STICKERS: readonly ChatStickerDefinition[] = [
  { id: 'happy', emoji: '\u{1F60A}', name: 'Happy', category: 'mood', pack: 'Essentials', color: STICKER_COLORS.mood, keywords: ['smile', 'good'] },
  { id: 'loved', emoji: '\u{1F970}', name: 'Loved', category: 'mood', pack: 'Essentials', color: STICKER_COLORS.mood, keywords: ['blush', 'love'] },
  { id: 'excited', emoji: '\u{1F929}', name: 'Excited', category: 'mood', pack: 'Essentials', color: STICKER_COLORS.mood, keywords: ['wow', 'amazing'] },
  { id: 'cool', emoji: '\u{1F60E}', name: 'Cool', category: 'mood', pack: 'Essentials', color: STICKER_COLORS.mood, keywords: ['smooth', 'nice'] },
  { id: 'adorable', emoji: '\u{1F979}', name: 'Adorable', category: 'mood', pack: 'Essentials', color: STICKER_COLORS.mood, keywords: ['cute', 'sweet'] },
  { id: 'motivated', emoji: '\u{1F4AA}', name: 'Motivated', category: 'energy', pack: 'Essentials', color: STICKER_COLORS.energy, keywords: ['strong', 'support'] },
  { id: 'fire', emoji: '\u{1F525}', name: 'Fire', category: 'energy', pack: 'Essentials', color: STICKER_COLORS.energy, keywords: ['hot', 'attractive'] },
  { id: 'electric', emoji: '\u26A1', name: 'Electric', category: 'energy', pack: 'Essentials', color: STICKER_COLORS.energy, keywords: ['energy', 'spark'] },
  { id: 'sparkle', emoji: '\u2728', name: 'Sparkle', category: 'energy', pack: 'Essentials', color: STICKER_COLORS.energy, keywords: ['shine', 'magic'] },
  { id: 'star', emoji: '\u2B50', name: 'Star', category: 'energy', pack: 'Essentials', color: STICKER_COLORS.energy, keywords: ['brilliant', 'proud'] },
  { id: 'love', emoji: '\u2764\uFE0F', name: 'Love', category: 'heart', pack: 'Between Us', color: STICKER_COLORS.heart, keywords: ['heart', 'romance'] },
  { id: 'hearts', emoji: '\u{1F495}', name: 'Hearts', category: 'heart', pack: 'Between Us', color: STICKER_COLORS.heart, keywords: ['together', 'affection'] },
  { id: 'sparkling-heart', emoji: '\u{1F496}', name: 'Sparkling Heart', category: 'heart', pack: 'Between Us', color: STICKER_COLORS.heart, keywords: ['special', 'romance'] },
  { id: 'rose', emoji: '\u{1F339}', name: 'Rose', category: 'heart', pack: 'Between Us', color: STICKER_COLORS.heart, keywords: ['flower', 'date'] },
  { id: 'great-flow', emoji: '\u{1F49A}', name: 'Great Flow', category: 'connection', pack: 'Between Us', color: STICKER_COLORS.connection, keywords: ['chemistry', 'connection', 'vibe'] },
  { id: 'warm-spark', emoji: '\u{1FAF6}', name: 'Warm Spark', category: 'connection', pack: 'Between Us', color: STICKER_COLORS.connection, keywords: ['spark', 'care', 'hands'] },
  { id: 'perfect-match', emoji: '\u{1F9E9}', name: 'Perfect Match', category: 'connection', pack: 'Between Us', color: STICKER_COLORS.connection, keywords: ['match', 'fit', 'us'] },
  { id: 'date-energy', emoji: '\u{1F942}', name: 'Date Energy', category: 'connection', pack: 'Between Us', color: STICKER_COLORS.connection, keywords: ['date', 'cheers', 'meet'] },
  { id: 'thinking-of-you', emoji: '\u{1F4AD}', name: 'Thinking of You', category: 'connection', pack: 'Between Us', color: STICKER_COLORS.connection, keywords: ['miss', 'thinking', 'you'] },
  { id: 'chemistry', emoji: '\u{1F9EA}', name: 'Chemistry', category: 'connection', pack: 'Between Us', color: STICKER_COLORS.connection, keywords: ['vibe', 'spark', 'science'] },
  { id: 'party', emoji: '\u{1F973}', name: 'Party', category: 'celebration', pack: 'Everyday', color: STICKER_COLORS.celebration, keywords: ['fun', 'birthday'] },
  { id: 'confetti', emoji: '\u{1F389}', name: 'Confetti', category: 'celebration', pack: 'Everyday', color: STICKER_COLORS.celebration, keywords: ['congrats', 'party'] },
  { id: 'celebrate', emoji: '\u{1F64C}', name: 'Celebrate', category: 'celebration', pack: 'Everyday', color: STICKER_COLORS.celebration, keywords: ['yes', 'win'] },
  { id: 'balloon', emoji: '\u{1F388}', name: 'Balloon', category: 'celebration', pack: 'Everyday', color: STICKER_COLORS.celebration, keywords: ['birthday', 'party'] },
  { id: 'good-morning', emoji: '\u2600\uFE0F', name: 'Good Morning', category: 'daily', pack: 'Everyday', color: STICKER_COLORS.daily, keywords: ['morning', 'sun', 'hello'] },
  { id: 'sweet-dreams', emoji: '\u{1F319}', name: 'Sweet Dreams', category: 'daily', pack: 'Everyday', color: STICKER_COLORS.daily, keywords: ['night', 'sleep'] },
  { id: 'you-got-this', emoji: '\u{1F31F}', name: 'You Got This', category: 'daily', pack: 'Everyday', color: STICKER_COLORS.daily, keywords: ['support', 'proud'] },
  { id: 'lets-go', emoji: '\u{1F680}', name: 'Let\'s Go', category: 'daily', pack: 'Everyday', color: STICKER_COLORS.daily, keywords: ['ready', 'go', 'energy'] },
  { id: 'applause', emoji: '\u{1F44F}', name: 'Applause', category: 'daily', pack: 'Everyday', color: STICKER_COLORS.daily, keywords: ['clap', 'well done'] },
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

export const buildStickerPayload = (sticker: ChatStickerDefinition) =>
  `${STICKER_TEXT_PREFIX}${JSON.stringify({
    emoji: sticker.emoji,
    name: sticker.name,
    color: sticker.color,
    category: sticker.category,
    pack: sticker.pack,
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
