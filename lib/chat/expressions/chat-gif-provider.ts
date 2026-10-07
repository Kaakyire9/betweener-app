export type ChatExpressionMediaKind = 'giphy_gif' | 'giphy_sticker' | 'giphy_emoji' | 'giphy_text';

export type ChatProviderMediaReference = {
  schemaVersion: 1;
  provider: 'giphy';
  providerMediaId: string;
  title: string;
  width: number | null;
  height: number | null;
  kind: ChatExpressionMediaKind;
};

export type ChatGifResult = {
  schemaVersion: 1;
  source: 'provider';
  provider: 'giphy';
  providerMediaId: string;
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  kind: ChatExpressionMediaKind;
  isAnimated: true;
  attributionLabel: 'GIPHY';
};

export type ChatProviderExpressionSelection = ChatGifResult | ChatProviderMediaReference;

export type ChatGifPlatform = 'ios' | 'android' | 'web' | 'unknown';

type GiphyRendition = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  size?: unknown;
};

const GIPHY_API_ROOT = 'https://api.giphy.com/v1';
const GIPHY_MEDIA_HOST = /(^|\.)giphy\.com$/iu;

const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const isApprovedChatGifUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && GIPHY_MEDIA_HOST.test(url.hostname);
  } catch {
    return false;
  }
};

export const getChatGifApiKey = (platform: ChatGifPlatform) => {
  const platformKey = platform === 'ios'
    ? process.env.EXPO_PUBLIC_GIPHY_IOS_API_KEY
    : platform === 'android'
      ? process.env.EXPO_PUBLIC_GIPHY_ANDROID_API_KEY
      : platform === 'web'
        ? process.env.EXPO_PUBLIC_GIPHY_WEB_API_KEY
        : undefined;
  return platformKey?.trim() || process.env.EXPO_PUBLIC_GIPHY_API_KEY?.trim() || '';
};

export const isChatGifProviderConfigured = (platform: ChatGifPlatform = 'unknown') => Boolean(
  getChatGifApiKey(platform),
);

const PROVIDER_MEDIA_ID = /^[a-z0-9_-]{1,100}$/iu;
const PROVIDER_MEDIA_REFERENCE_KEYS = new Set([
  'schemaVersion',
  'provider',
  'providerMediaId',
  'title',
  'width',
  'height',
  'kind',
]);

const boundedDimension = (value: unknown) => {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed <= 8192 ? parsed : null;
};

export const parseChatProviderMediaReference = (value: unknown): ChatProviderMediaReference | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !PROVIDER_MEDIA_REFERENCE_KEYS.has(key))) return null;
  const providerMediaId = typeof record.providerMediaId === 'string'
    ? record.providerMediaId.trim()
    : '';
  const kind = typeof record.kind === 'string' ? record.kind : '';
  const title = typeof record.title === 'string' ? record.title.trim().slice(0, 160) : '';
  const width = record.width === null ? null : boundedDimension(record.width);
  const height = record.height === null ? null : boundedDimension(record.height);
  if (
    record.schemaVersion !== 1
    || record.provider !== 'giphy'
    || !PROVIDER_MEDIA_ID.test(providerMediaId)
    || !['giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text'].includes(kind)
    || (record.width !== null && width === null)
    || (record.height !== null && height === null)
  ) return null;
  return {
    schemaVersion: 1,
    provider: 'giphy',
    providerMediaId,
    title: title || 'GIPHY expression',
    width,
    height,
    kind: kind as ChatExpressionMediaKind,
  };
};

export const buildChatProviderMediaReference = (
  result: ChatProviderExpressionSelection,
): ChatProviderMediaReference => ({
  schemaVersion: 1,
  provider: 'giphy',
  providerMediaId: result.providerMediaId,
  title: result.title.trim().slice(0, 160) || 'GIPHY expression',
  width: result.width,
  height: result.height,
  kind: result.kind,
});

export const parseChatGifProviderResult = (
  value: unknown,
  kind: ChatExpressionMediaKind = 'giphy_gif',
): ChatGifResult | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const images = record.images && typeof record.images === 'object'
    ? record.images as Record<string, GiphyRendition>
    : {};
  const previewCandidates = [
    images.fixed_width_small,
    images.fixed_height_small,
    images.fixed_width,
    images.fixed_height,
    images.downsized,
    images.downsized_medium,
    images.original,
  ];
  const originalCandidates = [
    images.downsized_medium,
    images.downsized,
    images.original,
    images.fixed_width,
    images.fixed_height,
    images.fixed_width_small,
    images.fixed_height_small,
  ];
  const preview = previewCandidates.find((rendition) => (
    typeof rendition?.url === 'string' && isApprovedChatGifUrl(rendition.url)
  ));
  const original = originalCandidates.find((rendition) => (
    typeof rendition?.url === 'string' && isApprovedChatGifUrl(rendition.url)
  ));
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const previewUrl = typeof preview?.url === 'string' ? preview.url : '';
  const originalUrl = typeof original?.url === 'string' ? original.url : '';
  const byteSize = finiteNumber(original?.size);
  if (
    !id
    || !isApprovedChatGifUrl(previewUrl)
    || !isApprovedChatGifUrl(originalUrl)
  ) return null;
  return {
    schemaVersion: 1,
    source: 'provider',
    provider: 'giphy',
    providerMediaId: id,
    id,
    title: typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : 'GIF',
    previewUrl,
    originalUrl,
    width: finiteNumber(original?.width),
    height: finiteNumber(original?.height),
    byteSize,
    kind,
    isAnimated: true,
    attributionLabel: 'GIPHY',
  };
};

export const fetchChatGifs = async ({
  query,
  signal,
  limit = 24,
  platform = 'unknown',
  kind = 'giphy_gif',
}: {
  query: string;
  signal?: AbortSignal;
  limit?: number;
  platform?: ChatGifPlatform;
  kind?: Extract<ChatExpressionMediaKind, 'giphy_gif' | 'giphy_sticker'>;
}): Promise<ChatGifResult[]> => {
  const apiKey = getChatGifApiKey(platform);
  if (!apiKey) return [];
  const normalizedQuery = query.trim().slice(0, 80);
  const endpoint = normalizedQuery ? 'search' : 'trending';
  const params = new URLSearchParams({
    api_key: apiKey,
    rating: 'g',
    limit: String(Math.max(1, Math.min(limit, 30))),
    bundle: 'messaging_non_clips',
  });
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
    params.set('lang', 'en');
  }
  const catalogue = kind === 'giphy_sticker' ? 'stickers' : 'gifs';
  const response = await fetch(`${GIPHY_API_ROOT}/${catalogue}/${endpoint}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`chat_gif_provider_${response.status}`);
  const payload = await response.json() as { data?: unknown };
  return Array.isArray(payload.data)
    ? payload.data
      .map((item) => parseChatGifProviderResult(item, kind))
      .filter((item): item is ChatGifResult => Boolean(item))
    : [];
};
