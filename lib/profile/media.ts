import { supabase } from '@/lib/supabase';

export const isLocalMediaUri = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase();
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
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isRemoteMediaUri(raw) || isLocalMediaUri(raw)) return raw;
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(raw);
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
