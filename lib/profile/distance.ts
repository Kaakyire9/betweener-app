const KM_PER_MILE = 1.60934;

export type DistanceUnit = 'auto' | 'km' | 'mi';

export const isDistanceLabel = (label?: string | null) => {
  if (!label) return false;
  const lower = label.toLowerCase();
  return lower.includes('away') || /\b(km|mi|mile|miles)\b/.test(lower) || /<\s*1/.test(lower);
};

export const parseDistanceKmFromLabel = (label?: string | null): number | undefined => {
  if (!label) return undefined;
  const lower = label.toLowerCase();
  const lessMatch = lower.match(/<\s*1\s*(km|mi|mile|miles)\b/);
  if (lessMatch) {
    return lessMatch[1].startsWith('mi') || lessMatch[1].startsWith('mile') ? 0.5 * KM_PER_MILE : 0.5;
  }
  const kmMatch = lower.match(/([\d.]+)\s*km\b/);
  if (kmMatch) return Number(kmMatch[1]);
  const miMatch = lower.match(/([\d.]+)\s*(mi|mile|miles)\b/);
  if (miMatch) return Number(miMatch[1]) * KM_PER_MILE;
  return undefined;
};
