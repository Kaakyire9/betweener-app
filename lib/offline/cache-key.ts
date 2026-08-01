const ANONYMOUS_CACHE_OWNER = 'anonymous';

export const buildScopedOfflineCacheKey = (ownerId: string, sourceKey: string) => {
  if (sourceKey.startsWith('owner/')) return sourceKey;
  return `owner/${ownerId || ANONYMOUS_CACHE_OWNER}/${sourceKey}`;
};
