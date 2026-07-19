type ChatMediaUriSource = {
  imageUrl?: string | null;
  videoUrl?: string | null;
  offlineImageUri?: string | null;
  offlineVideoUri?: string | null;
};

const firstAvailableUri = (...values: (string | null | undefined)[]) =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? null;

export const resolveChatImageUri = (
  message: ChatMediaUriSource,
  cachedImageUri?: string | null,
) => firstAvailableUri(message.offlineImageUri, cachedImageUri, message.imageUrl);

export const resolveChatVideoUri = (
  message: ChatMediaUriSource,
  cachedVideoUri?: string | null,
) => firstAvailableUri(message.offlineVideoUri, cachedVideoUri, message.videoUrl);
