import { RELATIONSHIP_GIST_COVERS_ENABLED } from '@/features/relationship-gists/config/relationship-gist-ai-flags';
import { fetchRelationshipGistCover, type RelationshipGistCover as Cover } from '@/features/relationship-gists/media/relationship-gist-cover-repository';
import {
  readRelationshipGistCoverCache,
  relationshipGistCoverImageKey,
  writeRelationshipGistCoverCache,
} from '@/features/relationship-gists/media/relationship-gist-cover-cache';
import { getOfflineImageUriForOwner, resolveOfflineImageUriForOwner } from '@/lib/offline/image-store';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export function RelationshipGistCover({
  gistId,
  perspective,
  active,
  ownerUserId,
}: {
  gistId: string | null;
  perspective: string;
  active: boolean;
  ownerUserId?: string | null;
}) {
  const [asset, setAsset] = useState<{ cover: Cover; uri: string } | null>(null);

  useEffect(() => {
    let current = true;
    setAsset(null);
    if (!RELATIONSHIP_GIST_COVERS_ENABLED || !active || !gistId || !ownerUserId) {
      return () => { current = false; };
    }
    void (async () => {
      const cached = await readRelationshipGistCoverCache(ownerUserId, gistId, perspective);
      if (cached) {
        const cachedUri = await getOfflineImageUriForOwner(
          ownerUserId,
          relationshipGistCoverImageKey(cached),
        );
        if (current && cachedUri) setAsset({ cover: cached, uri: cachedUri });
      }
      try {
        const result = await fetchRelationshipGistCover(supabase as any, gistId, perspective);
        if (!result || !current) return;
        const imageKey = relationshipGistCoverImageKey(result.cover);
        const uri = await resolveOfflineImageUriForOwner(ownerUserId, imageKey, result.signedUrl);
        await writeRelationshipGistCoverCache(ownerUserId, gistId, perspective, result.cover);
        if (current && uri) setAsset({ cover: result.cover, uri });
      } catch (error) {
        logger.warn('[relationship-gist] cover_load_failed', {
          code: String((error as any)?.code ?? (error as Error)?.name ?? 'unknown'),
        });
      }
    })();
    return () => { current = false; };
  }, [active, gistId, ownerUserId, perspective]);

  if (!asset) return null;
  return (
    <View style={styles.frame}>
      <Image
        source={{ uri: asset.uri, cacheKey: relationshipGistCoverImageKey(asset.cover) }}
        style={styles.image}
        contentFit="cover"
        transition={180}
        accessibilityLabel={asset.cover.altText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: 24,
    backgroundColor: 'rgba(14, 70, 68, 0.42)',
  },
  image: { width: '100%', height: '100%' },
});
