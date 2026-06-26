import type { VibesFilters } from '@/hooks/useVibesFeed';

export type RoomSummary = {
  title: string;
  body: string;
};

export type PreviewTone = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
};

export const clearPremiumVibesFilters = (filters: VibesFilters): VibesFilters => ({
  ...filters,
  verifiedOnly: false,
  hasVideoOnly: false,
  activeOnly: false,
  distanceFilterKm: null,
  minVibeScore: null,
  minSharedInterests: 0,
});

export const resolveAutoUnit = (): 'km' | 'mi' => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return /[-_]US\b/i.test(locale) ? 'mi' : 'km';
  } catch {
    return 'km';
  }
};

export const hasAnyDraftFilters = (filters: VibesFilters) =>
  Boolean(filters.verifiedOnly) ||
  Boolean(filters.hasVideoOnly) ||
  Boolean(filters.activeOnly) ||
  filters.distanceFilterKm != null ||
  filters.minVibeScore != null ||
  (filters.minSharedInterests || 0) > 0 ||
  filters.minAge !== 18 ||
  filters.maxAge !== 60 ||
  Boolean(filters.religionFilter) ||
  Boolean(filters.locationQuery?.trim());

export const deriveActivePresetKey = (filters: VibesFilters): string | null => {
  if (filters.verifiedOnly && filters.minVibeScore === 60 && (filters.minSharedInterests || 0) >= 2) return 'real-intent';
  if (filters.minVibeScore === 70 && (filters.minSharedInterests || 0) >= 2 && filters.activeOnly) return 'high-vibe';
  if (filters.verifiedOnly && !filters.hasVideoOnly && !filters.activeOnly && filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'verified';
  if (filters.hasVideoOnly && !filters.verifiedOnly && !filters.activeOnly && filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'video';
  if (filters.activeOnly && !filters.verifiedOnly && !filters.hasVideoOnly && filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'active';
  return null;
};

export const deriveRoomSummary = (filters: VibesFilters): RoomSummary => {
  const preset = deriveActivePresetKey(filters);
  if (!hasAnyDraftFilters(filters)) {
    return {
      title: 'Open room - discover freely',
      body: 'Keep the room open and let chemistry surprise you.',
    };
  }
  if (preset === 'real-intent') {
    return {
      title: 'Real-intent room',
      body: 'Biased toward trust, overlap, and people showing stronger follow-through.',
    };
  }
  if (preset === 'high-vibe') {
    return {
      title: 'High-vibe room',
      body: 'Fewer, stronger profiles ahead with better chemistry and momentum.',
    };
  }
  if (filters.verifiedOnly && filters.activeOnly) {
    return {
      title: 'Shaped around trusted, active people',
      body: 'Less noise, more visible energy, and a tighter pace.',
    };
  }
  if (filters.minVibeScore != null || (filters.minSharedInterests || 0) > 0) {
    return {
      title: 'Focused on stronger chemistry',
      body: 'You are asking for fewer matches, but better overlap and better fit.',
    };
  }
  if (filters.distanceFilterKm != null) {
    return {
      title: 'Closer, tighter room',
      body: 'Discovery is leaning toward people within an easier reach.',
    };
  }
  if (filters.religionFilter || filters.locationQuery?.trim()) {
    return {
      title: 'Gently refined room',
      body: 'A few quiet boundaries are shaping discovery without closing it down too much.',
    };
  }
  if (filters.hasVideoOnly) {
    return {
      title: 'Biased toward presence',
      body: 'The room is leaning toward people who have shown a little more of themselves.',
    };
  }
  return {
    title: 'Room taking shape',
    body: 'A calmer, more selective mix is starting to emerge.',
  };
};

export const deriveCompatibilityHint = (filters: VibesFilters) => {
  if (filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'Wide and open';
  if ((filters.minVibeScore || 0) >= 70 || (filters.minSharedInterests || 0) >= 3) return 'Fewer but stronger matches';
  if ((filters.minVibeScore || 0) >= 60 || (filters.minSharedInterests || 0) >= 2) return 'Tighter, higher-intent room';
  return 'Balanced chemistry';
};

export const derivePreviewTone = (
  previewCount: number | null,
  filters: VibesFilters,
  loadedCount: number,
): PreviewTone => {
  if (previewCount == null) {
    return {
      eyebrow: 'Room preview',
      title: 'Shape first, then preview',
      body: 'Your count updates as the room shifts.',
      cta: 'Apply my room',
    };
  }
  if (previewCount === 0) {
    return {
      eyebrow: 'Very selective',
      title: 'No one matches this room yet',
      body: 'Ease a few controls and the room will open again.',
      cta: 'Apply my room',
    };
  }
  if (!hasAnyDraftFilters(filters)) {
    return {
      eyebrow: 'Open discovery',
      title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
      body: loadedCount > 0 ? 'Broad, relaxed, and ready for surprise chemistry.' : 'A wide-open room for freer discovery.',
      cta: 'Apply my room',
    };
  }
  if (previewCount <= 5) {
    return {
      eyebrow: 'Highly curated',
      title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
      body: 'Very selective. Fewer profiles ahead, but likely stronger fit.',
      cta: 'Apply my room',
    };
  }
  if (previewCount <= 15) {
    return {
      eyebrow: 'Focused room',
      title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
      body: 'More selective, stronger fit.',
      cta: 'Apply & preview my room',
    };
  }
  return {
    eyebrow: 'Balanced room',
    title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
    body: 'A healthy mix of openness and stronger targeting.',
    cta: 'Apply my room',
  };
};
