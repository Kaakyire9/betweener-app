import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'betweener.chat.expressions.v1';
const MAX_RECENT_EMOJIS = 24;
const MAX_RECENT_STICKERS = 12;
const MAX_FAVOURITE_STICKERS = 24;

export type ChatExpressionPreferences = {
  recentEmojis: string[];
  recentStickerIds: string[];
  favouriteStickerIds: string[];
};

export const EMPTY_CHAT_EXPRESSION_PREFERENCES: ChatExpressionPreferences = {
  recentEmojis: [],
  recentStickerIds: [],
  favouriteStickerIds: [],
};

const boundedUnique = (value: unknown, limit: number) => {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  value.forEach((item) => {
    const normalized = typeof item === 'string' ? item.trim() : '';
    if (!normalized || output.includes(normalized)) return;
    output.push(normalized);
  });
  return output.slice(0, limit);
};

export const normalizeChatExpressionPreferences = (
  value: unknown,
): ChatExpressionPreferences => {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  return {
    recentEmojis: boundedUnique(record.recentEmojis, MAX_RECENT_EMOJIS),
    recentStickerIds: boundedUnique(record.recentStickerIds, MAX_RECENT_STICKERS),
    favouriteStickerIds: boundedUnique(record.favouriteStickerIds, MAX_FAVOURITE_STICKERS),
  };
};

export const loadChatExpressionPreferences = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalizeChatExpressionPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY_CHAT_EXPRESSION_PREFERENCES;
  }
};

export const saveChatExpressionPreferences = async (
  value: ChatExpressionPreferences,
) => {
  const normalized = normalizeChatExpressionPreferences(value);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const recordRecentExpression = (
  current: ChatExpressionPreferences,
  kind: 'emoji' | 'sticker',
  id: string,
): ChatExpressionPreferences => normalizeChatExpressionPreferences({
  ...current,
  ...(kind === 'emoji'
    ? { recentEmojis: [id, ...current.recentEmojis] }
    : { recentStickerIds: [id, ...current.recentStickerIds] }),
});

export const toggleFavouriteSticker = (
  current: ChatExpressionPreferences,
  stickerId: string,
): ChatExpressionPreferences => normalizeChatExpressionPreferences({
  ...current,
  favouriteStickerIds: current.favouriteStickerIds.includes(stickerId)
    ? current.favouriteStickerIds.filter((id) => id !== stickerId)
    : [stickerId, ...current.favouriteStickerIds],
});
