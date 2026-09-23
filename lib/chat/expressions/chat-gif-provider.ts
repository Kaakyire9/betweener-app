import { CHAT_ATTACHMENT_LIMITS } from '../attachment-policy.ts';

export type ChatGifResult = {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
};

export type ChatGifPlatform = 'ios' | 'android' | 'web' | 'unknown';

type GiphyRendition = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  size?: unknown;
};

const GIPHY_API_ROOT = 'https://api.giphy.com/v1/gifs';
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

export const parseChatGifProviderResult = (value: unknown): ChatGifResult | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const images = record.images && typeof record.images === 'object'
    ? record.images as Record<string, GiphyRendition>
    : {};
  const preview = images.fixed_width_small ?? images.fixed_width ?? images.downsized;
  const original = images.downsized_medium ?? images.downsized ?? images.original;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const previewUrl = typeof preview?.url === 'string' ? preview.url : '';
  const originalUrl = typeof original?.url === 'string' ? original.url : '';
  const byteSize = finiteNumber(original?.size);
  if (
    !id
    || !isApprovedChatGifUrl(previewUrl)
    || !isApprovedChatGifUrl(originalUrl)
    || (byteSize !== null && byteSize > CHAT_ATTACHMENT_LIMITS.imageBytes)
  ) return null;
  return {
    id,
    title: typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : 'GIF',
    previewUrl,
    originalUrl,
    width: finiteNumber(original?.width),
    height: finiteNumber(original?.height),
    byteSize,
  };
};

export const fetchChatGifs = async ({
  query,
  signal,
  limit = 24,
  platform = 'unknown',
}: {
  query: string;
  signal?: AbortSignal;
  limit?: number;
  platform?: ChatGifPlatform;
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
  const response = await fetch(`${GIPHY_API_ROOT}/${endpoint}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`chat_gif_provider_${response.status}`);
  const payload = await response.json() as { data?: unknown };
  return Array.isArray(payload.data)
    ? payload.data.map(parseChatGifProviderResult).filter((item): item is ChatGifResult => Boolean(item))
    : [];
};
