import * as FileSystem from 'expo-file-system/legacy';
import * as ExpoCrypto from 'expo-crypto';
import type { MomentMetadata } from '@/lib/moment-text-style';
import { isMomentPostingEligibilityError, MOMENT_POSTING_EXPLAINER } from '@/lib/moments-eligibility';
import { rememberOfflineImageUri } from '@/lib/offline/image-store';
import { rememberOfflineVideoUri } from '@/lib/offline/video-store';
import { supabase } from '@/lib/supabase';

type MomentType = 'video' | 'photo' | 'text';
type MomentVisibility = 'public' | 'matches' | 'vibe_check_approved' | 'private';

type CreateMomentBase = {
  userId: string;
  visibility?: MomentVisibility;
  caption?: string | null;
  metadata?: MomentMetadata | null;
};

type CreateMediaMomentInput = CreateMomentBase & {
  type: Exclude<MomentType, 'text'>;
  uri: string;
};

type CreateTextMomentInput = CreateMomentBase & {
  type: 'text';
  textBody: string;
};

type DeleteMomentInput = {
  momentId: string;
  mediaPath?: string | null;
};

const getFileExtension = (uri: string) => {
  const parts = uri.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
};

const getContentType = (type: 'video' | 'photo', ext: string) => {
  if (type === 'photo') {
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  }
  if (ext === 'mov') return 'video/quicktime';
  return 'video/mp4';
};

const readFileAsUint8Array = async (uri: string) => {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
};

const toMomentError = (error: unknown, stage: 'insert' | 'upload' | 'update' | 'delete') => {
  const next =
    isMomentPostingEligibilityError(error)
      ? new Error(MOMENT_POSTING_EXPLAINER)
      : error instanceof Error
        ? error
        : new Error(String(error || 'moment_failed'));
  (next as Error & { stage?: string }).stage = stage;
  return next;
};

export async function createMomentFromMediaStrict(input: CreateMediaMomentInput) {
  const { userId, type, uri, caption, visibility = 'matches', metadata } = input;
  const momentId = ExpoCrypto.randomUUID();
  const ext = getFileExtension(uri);
  const fileName = `${Date.now()}.${ext}`;
  const filePath = `${userId}/${momentId}/${fileName}`;
  const contentType = getContentType(type, ext);

  const bytes = await readFileAsUint8Array(uri);
  const upload = await supabase.storage.from('moments').upload(filePath, bytes, {
    contentType,
    upsert: false,
  });

  if (upload.error) {
    throw toMomentError(upload.error, 'upload');
  }

  const { data, error } = await supabase.rpc('rpc_create_media_moment', {
    p_moment_id: momentId,
    p_type: type,
    p_media_url: filePath,
    p_caption: caption ?? null,
    p_visibility: visibility,
    p_metadata: metadata ?? {},
  });

  const createdMomentId = typeof data === 'string' ? data : null;

  if (error || !createdMomentId) {
    await supabase.storage.from('moments').remove([filePath]);
    throw toMomentError(error?.message ? new Error(error.message) : error || new Error('Failed to create moment'), 'insert');
  }

  const sourceKey = `moment-media:${type}:${filePath}`;
  try {
    if (type === 'photo') {
      await rememberOfflineImageUri(sourceKey, uri, filePath);
    } else {
      await rememberOfflineVideoUri(sourceKey, uri, filePath);
    }
  } catch (error) {
    console.log('[moments] failed to cache local media source', error);
  }

  return { momentId: createdMomentId, mediaPath: filePath };
}

export async function createMomentFromMedia(input: CreateMediaMomentInput) {
  try {
    return await createMomentFromMediaStrict(input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create moment' };
  }
}

export async function createTextMomentStrict(input: CreateTextMomentInput) {
  const { textBody, caption, visibility = 'matches', metadata } = input;
  const { data, error } = await supabase.rpc('rpc_create_moment', {
    p_type: 'text',
    p_text_body: textBody,
    p_caption: caption ?? null,
    p_visibility: visibility,
    p_metadata: metadata ?? {},
  });

  const momentId = typeof data === 'string' ? data : null;

  if (error || !momentId) {
    throw toMomentError(error?.message ? new Error(error.message) : error || new Error('Failed to create moment'), 'insert');
  }

  return { momentId };
}

export async function createTextMoment(input: CreateTextMomentInput) {
  try {
    return await createTextMomentStrict(input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create moment' };
  }
}

export async function deleteMomentStrict(input: DeleteMomentInput) {
  const { momentId, mediaPath } = input;
  const { data, error } = await supabase
    .from('moments')
    .update({ is_deleted: true })
    .eq('id', momentId)
    .select('id');

  if (error) {
    const { error: deleteError } = await supabase.from('moments').delete().eq('id', momentId);
    if (deleteError) {
      throw toMomentError(deleteError, 'delete');
    }
  } else if (!data || data.length === 0) {
    const { error: deleteError } = await supabase.from('moments').delete().eq('id', momentId);
    if (deleteError) {
      throw toMomentError(deleteError, 'delete');
    }
  }

  if (mediaPath && !mediaPath.startsWith('http')) {
    const { error: storageError } = await supabase.storage.from('moments').remove([mediaPath]);
    if (storageError) {
      console.log('[moments] storage cleanup failed after delete', storageError);
    }
  }
}

export async function createSignedUrl(path: string, expiresInSeconds: number) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const { data, error } = await supabase.storage.from('moments').createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
