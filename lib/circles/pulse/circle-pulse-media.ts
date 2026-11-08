import { supabase } from '@/lib/supabase';
import {
  ResumableStorageUpload,
  type ResumableStorageUploadProgress,
} from '@/lib/storage/resumable-storage-upload';

export const CIRCLE_PULSE_MEDIA_BUCKET = 'circle-pulse-media';

export type CirclePulseEditorialMediaType = 'image' | 'video';

export const CIRCLE_PULSE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const CIRCLE_PULSE_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
export const CIRCLE_PULSE_VIDEO_MAX_DURATION_MS = 60_000;

const ALLOWED_CIRCLE_PULSE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
]);

const getFileExtension = (uri: string, mediaType: CirclePulseEditorialMediaType) => {
  const cleanUri = uri.split('?')[0];
  const extension = cleanUri.split('.').pop()?.toLowerCase();
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;
  return mediaType === 'video' ? 'mp4' : 'jpg';
};

export const inferCirclePulseContentType = (
  uri: string,
  mediaType: CirclePulseEditorialMediaType,
  pickerMimeType?: string | null,
) => {
  const normalizedPickerType = pickerMimeType?.trim().toLowerCase() ?? '';
  if (ALLOWED_CIRCLE_PULSE_CONTENT_TYPES.has(normalizedPickerType)) {
    return normalizedPickerType;
  }
  const extension = getFileExtension(uri, mediaType);
  if (mediaType === 'video') {
    return extension === 'mov' ? 'video/quicktime' : 'video/mp4';
  }
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
};

export async function uploadCirclePulseMedia(
  filePath: string,
  uri: string,
  contentType: string,
  byteSize?: number | null,
  onProgress?: (progress: ResumableStorageUploadProgress) => void,
) {
  if (!filePath || /^https?:\/\//i.test(filePath)) {
    throw new Error('circle_media_invalid_storage_path');
  }
  if (!ALLOWED_CIRCLE_PULSE_CONTENT_TYPES.has(contentType)) {
    throw new Error('unsupported_circle_media_type');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const ownerUserId = sessionData.session?.user?.id;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!accessToken || !ownerUserId) throw new Error('unauthenticated_storage');
  if (!supabaseUrl || !anonKey) throw new Error('missing_supabase_upload_config');

  await ResumableStorageUpload.upload({
    bucket: CIRCLE_PULSE_MEDIA_BUCKET,
    objectPath: filePath,
    localUri: uri,
    fileName: filePath.split('/').pop() || 'circle-media',
    contentType,
    byteSize,
    accessToken,
    anonKey,
    supabaseUrl,
    ownerUserId,
    onProgress,
  });
  return filePath;
}

export async function removeCirclePulseMedia(filePath: string) {
  if (!filePath || /^https?:\/\//i.test(filePath)) return;
  await supabase.storage.from(CIRCLE_PULSE_MEDIA_BUCKET).remove([filePath]);
}

export async function createSignedCirclePulseMediaUrl(filePath: string, expiresInSeconds = 3600) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return null;
  const { data, error } = await supabase.storage.from(CIRCLE_PULSE_MEDIA_BUCKET).createSignedUrl(filePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
