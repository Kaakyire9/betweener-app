import * as FileSystem from 'expo-file-system/legacy';
import { uploadImage } from '@/lib/image-upload';
import { supabase } from '@/lib/supabase';

export const LIVE_EVENT_MEDIA_BUCKET = 'live-event-media';
export const LIVE_EVENT_TEASER_MAX_SECONDS = 20;
export const LIVE_EVENT_TEASER_MAX_BYTES = 25 * 1024 * 1024;

const readBytes = async (uri: string) => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const decoded = atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

export const getLiveEventMediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  return supabase.storage.from(LIVE_EVENT_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
};

export const uploadLiveEventPoster = async (input: {
  userId: string;
  sessionId: string;
  uri: string;
}) => {
  const result = await uploadImage({
    userId: input.userId,
    uri: input.uri,
    bucket: LIVE_EVENT_MEDIA_BUCKET,
    folder: `${input.userId}/${input.sessionId}`,
    maxWidth: 1440,
    maxHeight: 1800,
  });
  if (result.error || !result.path) throw new Error(result.error || 'live_event_poster_upload_failed');
  return result.path;
};

export const uploadLiveEventTeaser = async (input: {
  userId: string;
  sessionId: string;
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
}) => {
  const info = await FileSystem.getInfoAsync(input.uri);
  const byteSize = input.fileSize ?? (info.exists && 'size' in info ? info.size : 0);
  if (byteSize > LIVE_EVENT_TEASER_MAX_BYTES) throw new Error('live_event_teaser_too_large');

  const mimeType = input.mimeType === 'video/quicktime' ? 'video/quicktime' : 'video/mp4';
  const extension = mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const path = `${input.userId}/${input.sessionId}/teaser-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(LIVE_EVENT_MEDIA_BUCKET).upload(
    path,
    await readBytes(input.uri),
    { contentType: mimeType, upsert: false },
  );
  if (error) throw new Error(error.message || 'live_event_teaser_upload_failed');
  return path;
};

export const removeLiveEventMedia = async (paths: readonly (string | null | undefined)[]) => {
  const validPaths = paths.filter((path): path is string => Boolean(path));
  if (!validPaths.length) return;
  await supabase.storage.from(LIVE_EVENT_MEDIA_BUCKET).remove(validPaths);
};
