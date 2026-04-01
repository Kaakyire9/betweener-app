import type { Match } from '@/types/match';

export type VibesSegment = 'forYou' | 'nearby' | 'activeNow';

export const parseDistanceKm = (label?: string | null) => {
  if (!label) return null;
  const lower = label.toLowerCase();
  const kmMatch = lower.match(/([\d.]+)\s*km\b/);
  if (kmMatch) return Number(kmMatch[1]);
  const miMatch = lower.match(/([\d.]+)\s*(mi|mile|miles)\b/);
  if (miMatch) return Number(miMatch[1]) * 1.60934;
  const lessThan = lower.match(/<\s*1\s*(km|mi|mile|miles)\b/);
  if (lessThan) return lessThan[1].startsWith('mi') ? 0.5 * 1.60934 : 0.5;
  return null;
};

export const isRecentlyActive = (lastActive?: string | null) => {
  if (!lastActive) return false;
  try {
    const then = new Date(lastActive).getTime();
    if (Number.isNaN(then)) return false;
    return Date.now() - then <= 45 * 60 * 1000;
  } catch {
    return false;
  }
};

export const buildLocationSearchText = (match: Match) =>
  String(
    (match as any).city ||
      (match as any).location ||
      (match as any).current_country ||
      (match as any).region ||
      '',
  ).toLowerCase();

const getDistanceKm = (match: Match) => {
  const direct = (match as any).distanceKm;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  return parseDistanceKm(match.distance);
};

const getCompatibility = (match: Match) => {
  const score = (match as any).compatibility;
  if (typeof score === 'number' && Number.isFinite(score)) {
    return Math.max(0, Math.min(100, score));
  }
  return 0;
};

const getSharedInterestCount = (match: Match, viewerInterests?: string[]) => {
  const common = Array.isArray((match as any).commonInterests) ? (match as any).commonInterests.length : 0;
  if (common > 0) return common;
  if (!Array.isArray(viewerInterests) || viewerInterests.length === 0) return 0;
  const interests = Array.isArray((match as any).interests) ? (match as any).interests : [];
  if (!interests.length) return 0;
  const viewerSet = new Set(viewerInterests.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  let count = 0;
  for (const interest of interests) {
    if (viewerSet.has(String(interest || '').trim().toLowerCase())) count += 1;
  }
  return count;
};

const getRichnessScore = (match: Match) => {
  let score = 0;
  if ((match as any).profileVideo) score += 1.6;
  if (((match as any).verification_level ?? 0) > 0 || match.verified) score += 1.2;
  if (Array.isArray((match as any).personalityTags) && (match as any).personalityTags.length > 0) score += 0.7;
  if (Array.isArray((match as any).interests) && (match as any).interests.length >= 3) score += 0.8;
  return score;
};

const getFreshnessScore = (match: Match) => {
  if ((match as any).isActiveNow) return 3.6;
  if (isRecentlyActive((match as any).lastActive)) return 2.0;
  return 0;
};

const getNearnessScore = (match: Match) => {
  const distanceKm = getDistanceKm(match);
  if (distanceKm == null) return 0;
  if (distanceKm <= 10) return 4.2;
  if (distanceKm <= 25) return 3.5;
  if (distanceKm <= 100) return 2.4;
  if (distanceKm <= 500) return 1.2;
  if (distanceKm <= 2000) return 0.2;
  return -1.1;
};

const getArchetypeKey = (match: Match, viewerInterests?: string[]) => {
  if (getSharedInterestCount(match, viewerInterests) > 0) return 'shared';
  if ((match as any).profileVideo) return 'video';
  if ((match as any).isActiveNow) return 'active';
  if (((match as any).verification_level ?? 0) > 0 || match.verified) return 'verified';
  return 'general';
};

const getLocaleKey = (match: Match) =>
  String((match as any).city || (match as any).location || match.region || (match as any).current_country || '')
    .trim()
    .toLowerCase();

export const rerankVibesSegment = (
  list: Match[],
  segment: VibesSegment,
  viewerInterests?: string[],
  momentUserIds?: Set<string>,
) => {
  if (list.length <= 1) return list;

  const ranked = list.map((match) => {
    const compatibility = getCompatibility(match) / 10;
    const sharedInterests = getSharedInterestCount(match, viewerInterests);
    const richness = getRichnessScore(match);
    const freshness = getFreshnessScore(match);
    const distanceKm = getDistanceKm(match);
    const nearness = getNearnessScore(match);
    const momentBoost = momentUserIds?.has(String(match.id)) ? 2.4 : 0;

    let baseScore = compatibility;
    if (segment === 'forYou') {
      baseScore =
        compatibility * 1.0 +
        sharedInterests * 2.1 +
        richness * 1.15 +
        freshness * 0.9 +
        nearness * 0.45 +
        momentBoost;
    } else if (segment === 'nearby') {
      baseScore =
        nearness * 2.3 +
        compatibility * 0.7 +
        sharedInterests * 1.1 +
        freshness * 0.6 +
        richness * 0.35;
    } else {
      const urgency = (match as any).isActiveNow ? 4.8 : isRecentlyActive((match as any).lastActive) ? 2.4 : 0;
      baseScore =
        urgency +
        nearness * 1.6 +
        compatibility * 0.55 +
        sharedInterests * 1.35 +
        richness * 0.45;
    }

    return {
      match,
      baseScore,
      distanceKm,
      hasPreciseDistance: typeof distanceKm === 'number' && Number.isFinite(distanceKm),
      archetype: getArchetypeKey(match, viewerInterests),
      locale: getLocaleKey(match),
    };
  });

  ranked.sort((a, b) => {
    if (segment === 'nearby') {
      if (a.hasPreciseDistance !== b.hasPreciseDistance) {
        return a.hasPreciseDistance ? -1 : 1;
      }
      if (a.hasPreciseDistance && b.hasPreciseDistance) {
        const distanceDiff = (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
        if (Math.abs(distanceDiff) > 0.001) return distanceDiff;
      }
    }
    return b.baseScore - a.baseScore;
  });

  const archetypeCounts = new Map<string, number>();
  const localeCounts = new Map<string, number>();
  const remaining = ranked.slice();
  const ordered: typeof ranked = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = -Infinity;

    remaining.forEach((item, index) => {
      const distancePenalty =
        segment === 'nearby' && !item.hasPreciseDistance
          ? 3.5 + (ordered.length > 0 ? 1.5 : 0)
          : 0;
      const archetypePenalty = (archetypeCounts.get(item.archetype) ?? 0) * (segment === 'forYou' ? 0.9 : 0.55);
      const localePenalty = item.locale ? (localeCounts.get(item.locale) ?? 0) * 0.35 : 0;
      const adjusted = item.baseScore - archetypePenalty - localePenalty - distancePenalty;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = index;
      }
    });

    const [picked] = remaining.splice(bestIndex, 1);
    ordered.push(picked);
    archetypeCounts.set(picked.archetype, (archetypeCounts.get(picked.archetype) ?? 0) + 1);
    if (picked.locale) {
      localeCounts.set(picked.locale, (localeCounts.get(picked.locale) ?? 0) + 1);
    }
  }

  return ordered.map((row) => row.match);
};
