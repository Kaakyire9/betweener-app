import { logger } from '@/lib/telemetry/logger';
import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export type RelationshipGistManualCoverDraft = {
  uri: string;
  width: number;
  height: number;
  altText: string;
};

const MAX_COVER_WIDTH = 1536;

const readBytes = async (uri: string) => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export async function uploadRelationshipGistManualCover(input: {
  revisionId: string;
  perspective: string;
  cover: RelationshipGistManualCoverDraft;
}) {
  const altText = input.cover.altText.trim();
  if (altText.length < 10 || altText.length > 300) {
    throw new Error('Describe the cover image in 10–300 characters for members using screen readers.');
  }

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error('Your session expired. Sign in again before uploading a cover.');

  const actions = input.cover.width > MAX_COVER_WIDTH
    ? [{ resize: { width: MAX_COVER_WIDTH } }]
    : [];
  const normalized = await manipulateAsync(input.cover.uri, actions, {
    compress: 0.84,
    format: SaveFormat.WEBP,
  });
  if (normalized.width < 320 || normalized.height < 200) {
    throw new Error('Choose a larger image for the Relationship Gist cover.');
  }

  const storagePath = `${userId}/${input.revisionId}/${Crypto.randomUUID()}.webp`;
  const bytes = await readBytes(normalized.uri);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const upload = await supabase.storage.from('relationship-gist-covers').upload(storagePath, bytes, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (upload.error) throw upload.error;

  try {
    const { data, error } = await (supabase as any).rpc('rpc_finalize_relationship_gist_manual_cover', {
      p_revision_id: input.revisionId,
      p_perspective: input.perspective,
      p_storage_path: storagePath,
      p_sha256: sha256,
      p_alt_text: altText,
      p_width: normalized.width,
      p_height: normalized.height,
    });
    if (error) throw error;
    return data as Record<string, unknown>;
  } catch (error) {
    const cleanup = await supabase.storage.from('relationship-gist-covers').remove([storagePath]);
    if (cleanup.error) {
      logger.warn('[relationship-gist] manual_cover_cleanup_failed', {
        code: String((cleanup.error as any)?.statusCode ?? 'unknown'),
      });
    }
    throw error;
  }
}
