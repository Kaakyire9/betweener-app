const LEGACY_CHAT_MEDIA_URL_MARKERS = [
  '/storage/v1/object/public/chat-media/',
  '/storage/v1/object/sign/chat-media/',
];

/** Extracts a private chat-media path from legacy Supabase public/signed URLs. */
export const getLegacyChatMediaStoragePath = (url?: string | null) => {
  if (!url) return null;
  for (const marker of LEGACY_CHAT_MEDIA_URL_MARKERS) {
    const markerIndex = url.indexOf(marker);
    if (markerIndex < 0) continue;
    const encodedPath = url.slice(markerIndex + marker.length).split('?')[0];
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }
  return null;
};

/** Encodes each storage segment while retaining path separators. */
export const encodeChatMediaStoragePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
