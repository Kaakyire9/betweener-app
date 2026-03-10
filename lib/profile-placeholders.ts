const PLACEHOLDER_PALETTES = [
  { start: '#081225', end: '#1D4ED8', text: '#F8FAFC', muted: 'rgba(248,250,252,0.78)' },
  { start: '#1A102A', end: '#C026D3', text: '#FDF4FF', muted: 'rgba(253,244,255,0.78)' },
  { start: '#11221A', end: '#0F766E', text: '#F0FDFA', muted: 'rgba(240,253,250,0.78)' },
  { start: '#2A160F', end: '#EA580C', text: '#FFF7ED', muted: 'rgba(255,247,237,0.78)' },
];

const normalizeSeed = (seed?: string | null) => (seed || '').trim();

export const hasProfileImage = (uri?: string | null) => Boolean((uri || '').trim());

export const getProfileInitials = (name?: string | null, fallback = 'B') => {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

export const getProfilePlaceholderPalette = (seed?: string | null) => {
  const normalized = normalizeSeed(seed);
  if (!normalized) return PLACEHOLDER_PALETTES[0];

  const total = Array.from(normalized).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return PLACEHOLDER_PALETTES[total % PLACEHOLDER_PALETTES.length];
};
