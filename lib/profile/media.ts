import { supabase } from '@/lib/supabase';

const isAbsoluteFilesystemPath = (raw: string) =>
  raw.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(raw);

export const normalizeLocalMediaUri = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (
    raw.toLowerCase().startsWith('file://') ||
    raw.toLowerCase().startsWith('content://') ||
    raw.toLowerCase().startsWith('ph://') ||
    raw.toLowerCase().startsWith('assets-library://')
  ) {
    return raw;
  }
  if (isAbsoluteFilesystemPath(raw)) {
    return raw.startsWith('file://') ? raw : `file://${raw}`;
  }
  return raw;
};

export const isLocalMediaUri = (value?: string | null) => {
  const raw = normalizeLocalMediaUri(value).toLowerCase();
  return (
    raw.startsWith('file://') ||
    raw.startsWith('content://') ||
    raw.startsWith('ph://') ||
    raw.startsWith('assets-library://')
  );
};

export const isRemoteMediaUri = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase();
  return raw.startsWith('http://') || raw.startsWith('https://');
};

export const normalizeProfilePhotoUri = (value?: string | null) => {
  const raw = normalizeLocalMediaUri(value);
  if (!raw) return '';
  if (isRemoteMediaUri(raw) || isLocalMediaUri(raw)) return raw;
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(raw);
  return data.publicUrl || raw;
};

export const normalizeProfileVideoUri = (value?: string | null) => {
  const raw = normalizeLocalMediaUri(value);
  if (!raw) return '';
  if (isRemoteMediaUri(raw) || isLocalMediaUri(raw)) return raw;
  const { data } = supabase.storage.from('profile-videos').getPublicUrl(raw);
  return data.publicUrl || raw;
};

export const normalizeProfilePhotoList = (items?: unknown) =>
  Array.isArray(items)
    ? items
        .map((item) => normalizeProfilePhotoUri(typeof item === 'string' ? item : ''))
        .filter(Boolean)
    : [];

export const normalizeGalleryPhotoList = (
  items?: unknown,
  avatarUri?: string | null,
) => {
  const normalizedAvatar = normalizeProfilePhotoUri(avatarUri);
  const seen = new Set<string>();

  return normalizeProfilePhotoList(items).filter((item) => {
    if (!item) return false;
    if (normalizedAvatar && item === normalizedAvatar) return false;
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
};
