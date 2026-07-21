type ChatMediaUriSource = {
  imageUrl?: string | null;
  videoUrl?: string | null;
  offlineImageUri?: string | null;
  offlineVideoUri?: string | null;
  storagePath?: string | null;
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

export const resolveKnownSignedChatMediaUri = (
  storagePath: string | null | undefined,
  currentUri: string | null | undefined,
  signedUris: ReadonlyMap<string, string>,
) => firstAvailableUri(storagePath ? signedUris.get(storagePath) : null, currentUri);

type ChatImageViewerResolver = {
  online: boolean;
  findCachedUri: (sourceKey: string) => Promise<string | null>;
  localUriExists: (uri: string) => Promise<boolean>;
  createSignedUrl: (storagePath: string) => Promise<string | null>;
  cacheRemoteImage: (sourceKey: string, remoteUri: string) => Promise<string | null>;
};

export type ChatImageViewerResolution = {
  uri: string | null;
  cacheKey: string | null;
  cachedUri: string | null;
  refreshedRemoteUri: string | null;
};

const uniqueUris = (...values: (string | null | undefined)[]) =>
  Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      ),
    ),
  );

const isLocalMediaUri = (uri: string) =>
  uri.startsWith('file://') || uri.startsWith('content://');

export const resolveChatImageViewerUri = async (
  message: ChatMediaUriSource,
  renderedUri: string | null | undefined,
  resolver: ChatImageViewerResolver,
): Promise<ChatImageViewerResolution> => {
  const storagePath = message.storagePath?.trim() || null;
  const fallbackUri = firstAvailableUri(renderedUri, message.offlineImageUri, message.imageUrl);
  const cacheKey = storagePath ?? message.imageUrl?.trim() ?? renderedUri?.trim() ?? null;

  for (const localUri of uniqueUris(message.offlineImageUri)) {
    if (isLocalMediaUri(localUri) && await resolver.localUriExists(localUri)) {
      return { uri: localUri, cacheKey, cachedUri: localUri, refreshedRemoteUri: null };
    }
  }

  for (const key of uniqueUris(cacheKey, renderedUri, message.imageUrl)) {
    const cachedUri = await resolver.findCachedUri(key);
    if (cachedUri && isLocalMediaUri(cachedUri) && await resolver.localUriExists(cachedUri)) {
      return { uri: cachedUri, cacheKey, cachedUri, refreshedRemoteUri: null };
    }
  }

  let remoteUri = fallbackUri?.startsWith('http') ? fallbackUri : null;
  let refreshedRemoteUri: string | null = null;
  if (resolver.online && storagePath) {
    refreshedRemoteUri = await resolver.createSignedUrl(storagePath);
    remoteUri = refreshedRemoteUri ?? remoteUri;
  }

  if (resolver.online && remoteUri && cacheKey) {
    const cachedUri = await resolver.cacheRemoteImage(cacheKey, remoteUri);
    if (cachedUri && isLocalMediaUri(cachedUri) && await resolver.localUriExists(cachedUri)) {
      return { uri: cachedUri, cacheKey, cachedUri, refreshedRemoteUri };
    }
  }

  return {
    uri: remoteUri ?? fallbackUri,
    cacheKey,
    cachedUri: null,
    refreshedRemoteUri,
  };
};
