import * as Crypto from 'expo-crypto';

import { buildScopedOfflineCacheKey } from '@/lib/offline/cache-key';
import { supabase } from '@/lib/supabase';

const ANONYMOUS_CACHE_OWNER = 'anonymous';

export const getOfflineCacheOwnerId = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? ANONYMOUS_CACHE_OWNER;
};

export { buildScopedOfflineCacheKey } from '@/lib/offline/cache-key';

export const scopeOfflineCacheKey = async (sourceKey: string): Promise<string> => {
  const ownerId = await getOfflineCacheOwnerId();
  return buildScopedOfflineCacheKey(ownerId, sourceKey);
};

export const getOfflineCacheOwnerDirectory = async (): Promise<string> => {
  const ownerId = await getOfflineCacheOwnerId();
  return getOfflineCacheOwnerDirectoryForId(ownerId);
};

export const getOfflineCacheOwnerDirectoryForId = (ownerId: string): Promise<string> =>
  Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    ownerId || ANONYMOUS_CACHE_OWNER,
  );
