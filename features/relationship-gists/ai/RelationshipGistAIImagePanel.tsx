import { Colors } from '@/constants/theme';
import {
  generateRelationshipGistAIImage,
  ownerReviewRelationshipGistAIImage,
  reviewRelationshipGistAIImage,
  type RelationshipGistAIImage,
  type RelationshipGistAIImageJob,
  type RelationshipGistAIReviewItem,
} from '@/features/relationship-gists/ai/relationship-gist-ai-repository';
import type { RelationshipGistEditorialPermissions } from '@/features/relationship-gists/editorial/relationship-gist-editorial-permissions';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export function RelationshipGistAIImagePanel({
  review,
  images,
  jobs,
  permissions,
  run,
  available,
  ownerReview,
}: {
  review: RelationshipGistAIReviewItem;
  images: RelationshipGistAIImage[];
  jobs: RelationshipGistAIImageJob[];
  permissions: RelationshipGistEditorialPermissions;
  run: (operation: () => Promise<unknown>) => Promise<void>;
  available: boolean;
  ownerReview: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [altText, setAltText] = useState<Record<string, string>>({});
  const revisionImages = images.filter((image) => image.revision_id === review.revision_id);
  const latestJob = jobs.find((job) => job.revision_id === review.revision_id);

  useEffect(() => {
    let active = true;
    void Promise.all(revisionImages.map(async (image) => {
      const { data, error } = await supabase.storage
        .from('relationship-gist-covers')
        .createSignedUrl(image.storage_path, 10 * 60);
      return error || !data?.signedUrl ? null : [image.id, data.signedUrl] as const;
    })).then((entries) => {
      if (!active) return;
      setUrls(Object.fromEntries(entries.filter(Boolean) as (readonly [string, string])[]));
      setAltText(Object.fromEntries(revisionImages.map((image) => [image.id, image.alt_text])));
    });
    return () => { active = false; };
  }, [images, review.revision_id]);

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>EDITORIAL COVER</Text>
          <Text style={styles.title}>AI imagery</Text>
          <Text style={styles.body}>Generated once, privately reviewed, and never published automatically.</Text>
        </View>
        {available && permissions.canDraft && ['draft', 'in_review'].includes(review.status) ? (
          <Pressable
            style={styles.button}
            onPress={() => void run(() => generateRelationshipGistAIImage(
              supabase as any,
              review.revision_id,
              review.perspective,
              Crypto.randomUUID(),
            ))}
            accessibilityRole="button"
            accessibilityLabel={`Generate editorial cover for ${review.title}`}
          >
            <Text style={styles.buttonText}>Generate cover</Text>
          </Pressable>
        ) : null}
      </View>

      {!available ? (
        <Text style={styles.meta}>The staging image-generation RPC is not deployed yet. Text drafting remains available.</Text>
      ) : null}

      {latestJob ? (
        <Text style={styles.meta}>
          Latest: {latestJob.status} · {latestJob.model} · {latestJob.quality}
          {latestJob.estimated_cost_microusd == null ? '' : ` · ${latestJob.estimated_cost_microusd} µUSD estimated`}
          {latestJob.failure_code ? ` · ${latestJob.failure_code}` : ''}
        </Text>
      ) : null}

      {revisionImages.map((image) => (
        <View key={image.id} style={styles.asset}>
          {urls[image.id] ? (
            <Image
              source={{ uri: urls[image.id], cacheKey: `gist-cover-review:${image.id}` }}
              style={styles.image}
              contentFit="cover"
              transition={180}
              accessibilityLabel={altText[image.id] ?? image.alt_text}
            />
          ) : <View style={[styles.image, styles.placeholder]}><Text style={styles.meta}>Loading private preview…</Text></View>}
          <View style={styles.headingRow}>
            <Text style={styles.status}>{image.status}</Text>
            <Text style={styles.meta}>{image.width}×{image.height}</Text>
          </View>
          <TextInput
            value={altText[image.id] ?? image.alt_text}
            onChangeText={(value) => setAltText((current) => ({ ...current, [image.id]: value }))}
            editable={image.status === 'generated' && permissions.canQualityApprove}
            placeholder="Describe the image for screen readers"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            maxLength={300}
            accessibilityLabel="Editorial cover alternative text"
          />
          {image.status === 'generated' && permissions.canQualityApprove ? (
            <View style={styles.actions}>
              <Pressable
                style={styles.button}
                onPress={() => void run(() => (
                  ownerReview ? ownerReviewRelationshipGistAIImage : reviewRelationshipGistAIImage
                )(
                  supabase as any, image.id, 'approve', altText[image.id] ?? image.alt_text,
                ))}
              ><Text style={styles.buttonText}>Approve image</Text></Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => void run(() => (
                  ownerReview ? ownerReviewRelationshipGistAIImage : reviewRelationshipGistAIImage
                )(
                  supabase as any, image.id, 'reject', altText[image.id] ?? image.alt_text,
                ))}
              ><Text style={styles.secondaryText}>Reject</Text></Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: (typeof Colors)[keyof typeof Colors]) => StyleSheet.create({
  container: { gap: 10, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.outline },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  copy: { flex: 1, gap: 3 },
  eyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1.1 },
  title: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 20 },
  body: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 11, lineHeight: 16 },
  meta: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 10, lineHeight: 15 },
  asset: { gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.outline },
  image: { width: '100%', aspectRatio: 1.5, borderRadius: 11, backgroundColor: theme.background },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  status: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 9, textTransform: 'uppercase' },
  input: { minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.outline, color: theme.text, backgroundColor: theme.background, fontFamily: 'Archivo_400Regular', fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 36, paddingHorizontal: 11, borderRadius: 11, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 10 },
  secondaryButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: theme.outline, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 10 },
});
