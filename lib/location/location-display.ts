export const BROAD_REGION_LABELS = new Set([
  'africa',
  'north america',
  'south america',
  'europe',
  'asia',
  'oceania',
  'middle east',
]);

export const normalizeLocationValue = (value?: string | null) => String(value || '').trim();

export const getFirstLocationPart = (value?: string | null) =>
  normalizeLocationValue(value).split(',')[0]?.trim() || '';

export const isBroadRegionLabel = (value?: string | null) =>
  BROAD_REGION_LABELS.has(getFirstLocationPart(value).toLowerCase());

export const pickBetterLocationValue = (
  incoming?: string | null,
  previous?: string | null,
  opts?: { preferShorter?: boolean; avoidAdministrative?: boolean },
) => {
  const next = normalizeLocationValue(incoming);
  const prev = normalizeLocationValue(previous);
  if (!next) return prev;
  if (!prev) return next;
  const nextLower = next.toLowerCase();
  const prevLower = prev.toLowerCase();
  if (nextLower === prevLower) return next;
  if (opts?.avoidAdministrative) {
    const nextAdministrative = /\b(region|district|province|state|county|municipality)\b/i.test(next);
    const prevAdministrative = /\b(region|district|province|state|county|municipality)\b/i.test(prev);
    if (nextAdministrative && !prevAdministrative) return prev;
    if (prevAdministrative && !nextAdministrative) return next;
  }
  if (opts?.preferShorter) {
    if (nextLower.includes(prevLower) && prev.length <= next.length) return prev;
    if (prevLower.includes(nextLower) && next.length <= prev.length) return next;
  }
  return next;
};

export const pickPreferredLocationLabel = (source: Record<string, any>) => {
  const city = getFirstLocationPart(source?.city);
  if (city) return city;
  const location = getFirstLocationPart(source?.location);
  if (location) return location;
  const region = getFirstLocationPart(source?.region);
  if (region && !isBroadRegionLabel(region)) return region;
  return normalizeLocationValue(source?.current_country);
};
