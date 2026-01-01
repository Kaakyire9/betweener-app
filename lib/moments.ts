import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';

type MomentType = 'video' | 'photo' | 'text';
type MomentVisibility = 'public' | 'matches' | 'vibe_check_approved' | 'private';

type CreateMomentBase = {
  userId: string;
  visibility?: MomentVisibility;
  caption?: string | null;
};

type CreateMediaMomentInput = CreateMomentBase & {
  type: Exclude<MomentType, 'text'>;
  uri: string;
};

type CreateTextMomentInput = CreateMomentBase & {
  type: 'text';
  textBody: string;
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
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Uint8Array(byteNumbers);
};

export async function createMomentFromMedia(input: CreateMediaMomentInput) {
  const { userId, type, uri, caption, visibility = 'matches' } = input;
  const { data, error } = await supabase
    .from('moments')
    .insert({
      user_id: userId,
      type,
      caption: caption ?? null,
      visibility,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return { error: error?.message || 'Failed to create moment' };
  }

  const momentId = data.id as string;
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
    await supabase.from('moments').update({ is_deleted: true }).eq('id', momentId);
    return { error: upload.error.message };
  }

  const update = await supabase.from('moments').update({ media_url: filePath }).eq('id', momentId);
  if (update.error) {
    await supabase.from('moments').update({ is_deleted: true }).eq('id', momentId);
    return { error: update.error.message };
  }

  return { momentId, mediaPath: filePath };
}

export async function createTextMoment(input: CreateTextMomentInput) {
  const { userId, textBody, caption, visibility = 'matches' } = input;
  const { data, error } = await supabase
    .from('moments')
    .insert({
      user_id: userId,
      type: 'text',
      text_body: textBody,
      caption: caption ?? null,
      visibility,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return { error: error?.message || 'Failed to create moment' };
  }

  return { momentId: data.id as string };
}

export async function createSignedUrl(path: string, expiresInSeconds: number) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const { data, error } = await supabase.storage.from('moments').createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
