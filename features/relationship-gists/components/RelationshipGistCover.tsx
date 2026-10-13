import { RELATIONSHIP_GIST_AI_IMAGES_ENABLED } from '@/features/relationship-gists/config/relationship-gist-ai-flags';
import { fetchRelationshipGistCover, type RelationshipGistCover as Cover } from '@/features/relationship-gists/media/relationship-gist-cover-repository';
import { resolveOfflineImageUri } from '@/lib/offline/image-store';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export function RelationshipGistCover({
  gistId,
  perspective,
  active,
}: {
  gistId: string | null;
  perspective: string;
  active: boolean;
}) {
  const [asset, setAsset] = useState<{ cover: Cover; uri: string } | null>(null);

  useEffect(() => {
    let current = true;
    setAsset(null);
    if (!RELATIONSHIP_GIST_AI_IMAGES_ENABLED || !active || !gistId) return () => { current = false; };
    void fetchRelationshipGistCover(supabase as any, gistId, perspective)
      .then(async (result) => {
        if (!result || !current) return;
        const uri = await resolveOfflineImageUri(
          `relationship-gist-cover:${result.cover.id}:${result.cover.sha256}`,
          result.signedUrl,
        );
        if (current && uri) setAsset({ cover: result.cover, uri });
      })
      .catch((error) => {
        logger.warn('[relationship-gist] cover_load_failed', {
          code: String((error as any)?.code ?? (error as Error)?.name ?? 'unknown'),
        });
      });
    return () => { current = false; };
  }, [active, gistId, perspective]);

  if (!asset) return null;
  return (
    <View style={styles.frame}>
      <Image
        source={{ uri: asset.uri, cacheKey: `relationship-gist-cover:${asset.cover.id}:${asset.cover.sha256}` }}
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
