import * as FileSystem from 'expo-file-system/legacy';
import * as ExpoCrypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

export const CIRCLE_PULSE_MEDIA_BUCKET = 'circle-pulse-media';

export type CirclePulseEditorialMediaType = 'image' | 'video';

const getFileExtension = (uri: string, mediaType: CirclePulseEditorialMediaType) => {
  const cleanUri = uri.split('?')[0];
  const extension = cleanUri.split('.').pop()?.toLowerCase();
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;
  return mediaType === 'video' ? 'mp4' : 'jpg';
};

const getContentType = (mediaType: CirclePulseEditorialMediaType, extension: string) => {
  if (mediaType === 'video') {
    return extension === 'mov' ? 'video/quicktime' : 'video/mp4';
  }
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
};

const readFileAsUint8Array = async (uri: string) => {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteNumbers[index] = byteCharacters.charCodeAt(index);
  }
  return new Uint8Array(byteNumbers);
};

export async function uploadCirclePulseMedia(
  circleId: string,
  uri: string,
  mediaType: CirclePulseEditorialMediaType,
) {
  const extension = getFileExtension(uri, mediaType);
  const mediaId = ExpoCrypto.randomUUID();
  const filePath = `${circleId}/${mediaId}/${Date.now()}.${extension}`;
  const bytes = await readFileAsUint8Array(uri);
  const { error } = await supabase.storage.from(CIRCLE_PULSE_MEDIA_BUCKET).upload(filePath, bytes, {
    contentType: getContentType(mediaType, extension),
    upsert: false,
  });
  if (error) throw error;
  return filePath;
}

export async function removeCirclePulseMedia(filePath: string) {
  if (!filePath || filePath.startsWith('http')) return;
  await supabase.storage.from(CIRCLE_PULSE_MEDIA_BUCKET).remove([filePath]);
}

export async function createSignedCirclePulseMediaUrl(filePath: string, expiresInSeconds = 3600) {
  if (!filePath) return null;
  if (filePath.startsWith('http')) return filePath;
  const { data, error } = await supabase.storage.from(CIRCLE_PULSE_MEDIA_BUCKET).createSignedUrl(filePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
