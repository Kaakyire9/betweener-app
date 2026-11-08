import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildChatProviderMediaReference,
  parseChatProviderMediaReference,
  type ChatExpressionMediaKind,
  type ChatProviderExpressionSelection,
  type ChatProviderMediaReference,
} from '@/lib/chat/expressions/chat-gif-provider';

const STORAGE_KEY_PREFIX = 'betweener.chat.expressions.v2';
const MAX_RECENT_EMOJIS = 24;
const MAX_RECENT_STICKERS = 12;
const MAX_FAVOURITE_STICKERS = 24;
const MAX_RECENT_PROVIDER_EXPRESSIONS = 18;
const MAX_FAVOURITE_PROVIDER_EXPRESSIONS = 24;

const PROVIDER_KINDS = new Set<ChatExpressionMediaKind>([
  'giphy_gif',
  'giphy_sticker',
  'giphy_emoji',
  'giphy_text',
]);

export type ChatExpressionPreferences = {
  recentEmojis: string[];
  recentStickerIds: string[];
  favouriteStickerIds: string[];
  recentProviderExpressions: ChatProviderMediaReference[];
  favouriteProviderExpressions: ChatProviderMediaReference[];
};

export const EMPTY_CHAT_EXPRESSION_PREFERENCES: ChatExpressionPreferences = {
  recentEmojis: [],
  recentStickerIds: [],
  favouriteStickerIds: [],
  recentProviderExpressions: [],
  favouriteProviderExpressions: [],
};

const storageKey = (ownerUserId?: string | null) => {
  const owner = String(ownerUserId || 'signed-out').trim() || 'signed-out';
  return `${STORAGE_KEY_PREFIX}:${owner}`;
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

const normalizeProviderExpressions = (value: unknown, limit: number): ChatProviderMediaReference[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: ChatProviderMediaReference[] = [];
  value.forEach((item) => {
    const record = item && typeof item === 'object' && !Array.isArray(item)
      ? item as Record<string, unknown>
      : null;
    const reference = parseChatProviderMediaReference(record ? {
      schemaVersion: record.schemaVersion,
      provider: record.provider,
      providerMediaId: record.providerMediaId ?? record.id,
      title: record.title,
      width: record.width,
      height: record.height,
      kind: record.kind,
    } : null);
    const stableKey = reference ? `${reference.kind}:${reference.providerMediaId}` : '';
    if (!reference || !PROVIDER_KINDS.has(reference.kind) || seen.has(stableKey)) return;
    seen.add(stableKey);
    output.push(reference);
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
    recentProviderExpressions: normalizeProviderExpressions(
      record.recentProviderExpressions,
      MAX_RECENT_PROVIDER_EXPRESSIONS,
    ),
    favouriteProviderExpressions: normalizeProviderExpressions(
      record.favouriteProviderExpressions,
      MAX_FAVOURITE_PROVIDER_EXPRESSIONS,
    ),
  };
};

export const loadChatExpressionPreferences = async (ownerUserId?: string | null) => {
  try {
    const raw = await AsyncStorage.getItem(storageKey(ownerUserId));
    const normalized = normalizeChatExpressionPreferences(raw ? JSON.parse(raw) : null);
    const sanitized = JSON.stringify(normalized);
    if (raw !== sanitized) {
      await AsyncStorage.setItem(storageKey(ownerUserId), sanitized);
    }
    return normalized;
  } catch {
    return EMPTY_CHAT_EXPRESSION_PREFERENCES;
  }
};

export const saveChatExpressionPreferences = async (
  value: ChatExpressionPreferences,
  ownerUserId?: string | null,
) => {
  const normalized = normalizeChatExpressionPreferences(value);
  await AsyncStorage.setItem(storageKey(ownerUserId), JSON.stringify(normalized));
  return normalized;
};

const providerIdentity = (item: ChatProviderExpressionSelection) => (
  `${item.kind}:${item.providerMediaId}`
);

export const recordRecentProviderExpression = (
  current: ChatExpressionPreferences,
  item: ChatProviderExpressionSelection,
): ChatExpressionPreferences => normalizeChatExpressionPreferences({
  ...current,
  recentProviderExpressions: [
    buildChatProviderMediaReference(item),
    ...current.recentProviderExpressions.filter(
      (candidate) => providerIdentity(candidate) !== providerIdentity(item),
    ),
  ],
});

export const toggleFavouriteProviderExpression = (
  current: ChatExpressionPreferences,
  item: ChatProviderExpressionSelection,
): ChatExpressionPreferences => {
  const identity = providerIdentity(item);
  const exists = current.favouriteProviderExpressions.some(
    (candidate) => providerIdentity(candidate) === identity,
  );
  return normalizeChatExpressionPreferences({
    ...current,
    favouriteProviderExpressions: exists
      ? current.favouriteProviderExpressions.filter(
          (candidate) => providerIdentity(candidate) !== identity,
        )
      : [buildChatProviderMediaReference(item), ...current.favouriteProviderExpressions],
  });
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
