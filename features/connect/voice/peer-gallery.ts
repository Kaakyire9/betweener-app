/** Published profile URLs only. Never reads the device photo library or storage credentials. */
export function voicePeerPhotos(avatar: unknown, gallery: unknown): string[] {
  const photos = new Set<string>();
  for (const candidate of [avatar, ...(Array.isArray(gallery) ? gallery : []).slice(0, 24)]) {
    if (typeof candidate !== 'string' || candidate.length > 4096) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol === 'https:' && !url.username && !url.password) photos.add(url.toString());
    } catch { /* Invalid/missing photo: use the next published photo, then initials. */ }
    if (photos.size === 6) break;
  }
  return [...photos];
}
