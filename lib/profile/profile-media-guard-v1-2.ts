import { getInstalledAppVersion } from '@/lib/app-version/app-version-service';
import { ChatUploadTransport } from '@/lib/chat/transfer/chat-upload-transport';
import { supabase } from '@/lib/supabase';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

export const PROFILE_MEDIA_GUARD_CONTRACT_V1_2 = '1.2.0';
export const PROFILE_MEDIA_STAGING_BUCKET_V1_2 = 'profile-media-staging-v1-2';
export const PROFILE_MEDIA_GUARD_FUNCTION_V1_2 = 'profile-media-guard-v1-2';

const PROFILE_MEDIA_MAX_EDGE = 1280;
const PROFILE_MEDIA_JPEG_QUALITY = 0.82;

export type LocalProfileMediaV1_2 = {
  localUri: string;
  fileName: string;
  contentType: string;
};

export type ProfileMediaGuardInputV1_2 = {
  userId: string;
  avatarUrl: string | null;
  heroImageUrl: string | null;
  photos: string[];
  localItems: LocalProfileMediaV1_2[];
  clientRequestId: string;
};

export type ProfileMediaGuardResultV1_2 = {
  ok: true;
  avatarUrl: string | null;
  heroImageUrl: string | null;
  photos: string[];
};

const localUri = (value: string | null | undefined) =>
  Boolean(value && /^(file|content|ph|assets-library):/i.test(value));

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const getImageDimensions = (uri: string) => new Promise<{ width: number; height: number }>(
  (resolve, reject) => Image.getSize(
    uri,
    (width, height) => resolve({ width, height }),
    reject,
  ),
);

const prepareLocalProfileMedia = async (item: LocalProfileMediaV1_2) => {
  const dimensions = await getImageDimensions(item.localUri);
  const longestEdge = Math.max(dimensions.width, dimensions.height);
  const actions = longestEdge > PROFILE_MEDIA_MAX_EDGE
    ? [{ resize: dimensions.width >= dimensions.height
        ? { width: PROFILE_MEDIA_MAX_EDGE }
        : { height: PROFILE_MEDIA_MAX_EDGE } }]
    : [];
  const normalized = await manipulateAsync(item.localUri, actions, {
    compress: PROFILE_MEDIA_JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });
  const baseName = item.fileName.replace(/\.[^.]+$/, '') || 'profile-photo';
  return {
    localUri: normalized.uri,
    fileName: `${baseName}.jpg`,
    contentType: 'image/jpeg',
  } satisfies LocalProfileMediaV1_2;
};

export const isProfileMediaGuardV1_2Runtime = () => {
  const match = getInstalledAppVersion().version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major > 1 || (major === 1 && minor >= 2);
};

const readFunctionError = async (error: any, data: any) => {
  let payload = data && typeof data === 'object' ? data : null;
  const context = error?.context;
  if (!payload && context?.json && typeof context.json === 'object') payload = context.json;
  if (!payload && context && typeof context.clone === 'function') {
    try {
      payload = await context.clone().json();
    } catch {
      // The transport message remains the fallback.
    }
  }
  const code = String(payload?.code || error?.code || 'PROFILE_MEDIA_SCAN_UNAVAILABLE');
  const exception = Object.assign(new Error(code), {
    code,
    reason: payload?.reason ? String(payload.reason) : null,
    slot: payload?.slot ? String(payload.slot) : null,
    itemIndex: Number.isInteger(payload?.itemIndex) ? payload.itemIndex : null,
    retryable: payload?.retryable === true || Number(context?.status || error?.status || 0) >= 500,
    status: Number(context?.status || error?.status || 0),
  });
  return exception;
};

export async function guardAndPublishProfileMediaV1_2(
  input: ProfileMediaGuardInputV1_2,
): Promise<ProfileMediaGuardResultV1_2> {
  if (!isProfileMediaGuardV1_2Runtime()) {
    throw Object.assign(new Error('PROFILE_MEDIA_CONTRACT_VERSION_MISMATCH'), {
      code: 'PROFILE_MEDIA_CONTRACT_VERSION_MISMATCH',
      retryable: false,
    });
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!accessToken || !supabaseUrl || !anonKey) {
    throw Object.assign(new Error('PROFILE_MEDIA_SCAN_UNAVAILABLE'), {
      code: 'PROFILE_MEDIA_SCAN_UNAVAILABLE', retryable: true,
    });
  }

  const stagedByLocalUri = new Map<string, string>();
  try {
    for (const item of input.localItems) {
      if (stagedByLocalUri.has(item.localUri)) continue;
      const preparedItem = await prepareLocalProfileMedia(item);
      const cleanName = preparedItem.fileName.replace(/[^a-zA-Z0-9_.-]+/g, '-').slice(-120) || 'image.jpg';
      const path = `${input.userId}/${input.clientRequestId}-${makeId()}-${cleanName}`;
      await ChatUploadTransport.upload({
        bucket: PROFILE_MEDIA_STAGING_BUCKET_V1_2,
        objectPath: path,
        localUri: preparedItem.localUri,
        fileName: cleanName,
        contentType: preparedItem.contentType,
        accessToken,
        anonKey,
        supabaseUrl,
        upsert: false,
      });
      stagedByLocalUri.set(item.localUri, path);
    }
  } catch (error) {
    if (stagedByLocalUri.size > 0) {
      await supabase.storage.from(PROFILE_MEDIA_STAGING_BUCKET_V1_2)
        .remove([...stagedByLocalUri.values()]).catch(() => undefined);
    }
    throw error;
  }

  const ref = (value: string | null) => {
    if (!value) return null;
    const path = stagedByLocalUri.get(value);
    return path ? { kind: 'staged', path } : { kind: 'existing', url: value };
  };
  if ([input.avatarUrl, input.heroImageUrl, ...input.photos]
    .some((value) => value && localUri(value) && !stagedByLocalUri.has(value))) {
    throw Object.assign(new Error('PROFILE_MEDIA_REQUEST_INVALID'), {
      code: 'PROFILE_MEDIA_REQUEST_INVALID', retryable: false,
    });
  }

  const { data, error } = await supabase.functions.invoke(PROFILE_MEDIA_GUARD_FUNCTION_V1_2, {
    body: {
      contractVersion: PROFILE_MEDIA_GUARD_CONTRACT_V1_2,
      clientRequestId: input.clientRequestId,
      avatar: ref(input.avatarUrl),
      hero: ref(input.heroImageUrl),
      photos: input.photos.map((value) => ref(value)),
    },
  });
  if (error || data?.ok !== true) {
    const invocationError = await readFunctionError(error, data);
    if (stagedByLocalUri.size > 0) {
      try {
        await supabase.storage.from(PROFILE_MEDIA_STAGING_BUCKET_V1_2)
          .remove([...stagedByLocalUri.values()]);
      } catch {
        // Best effort; a later attempt always uploads a new immutable object.
      }
    }
    throw invocationError;
  }
  return {
    ok: true,
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
    heroImageUrl: typeof data.heroImageUrl === 'string' ? data.heroImageUrl : null,
    photos: Array.isArray(data.photos) ? data.photos.filter((value: unknown) => typeof value === 'string') : [],
  };
}

export const profileMediaGuardMessageV1_2 = (error: unknown) => {
  const code = String((error as any)?.code || '');
  const reason = String((error as any)?.reason || '');
  if (code === 'PROFILE_MEDIA_SCAN_UNAVAILABLE') {
    return 'Photo safety checks are temporarily unavailable. Your existing photos are unchanged. Please try again.';
  }
  if (code !== 'PROFILE_MEDIA_REPLACE_REQUIRED') return null;
  if (reason === 'EXPLICIT_NUDITY' || reason === 'SEXUAL_CONTENT') {
    return 'This photo contains nudity or sexual content and cannot be used. Choose another photo.';
  }
  if (reason === 'CONTACT_OR_PROMOTION' || reason === 'QR_CODE') {
    return 'This photo contains contact details, promotional text, or a QR code. Choose another photo.';
  }
  if (reason === 'AVATAR_FACE_REQUIRED') {
    return 'Your profile picture must clearly show your face. Choose another photo.';
  }
  if (reason === 'AVATAR_MULTIPLE_FACES') {
    return 'Your profile picture must clearly show only you. Group photos can still be added to your gallery.';
  }
  return 'This photo does not meet the profile photo safety rules. Choose another photo.';
};
