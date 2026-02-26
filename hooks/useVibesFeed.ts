import useAIRecommendations from '@/hooks/useAIRecommendations';
import type { Match } from '@/types/match';
import { getSupabaseNetEvents, supabase } from '@/lib/supabase';
import { captureMessage } from '@/lib/telemetry/sentry';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type VibesSegment = 'forYou' | 'nearby' | 'activeNow';

export type VibesFilters = {
  verifiedOnly: boolean;
  distanceFilterKm: number | null;
  minAge: number;
  maxAge: number;
  religionFilter: string | null;
  locationQuery: string;
  hasVideoOnly: boolean;
  activeOnly: boolean;
  minVibeScore: number | null;
  minSharedInterests: number;
};

type UseVibesFeedParams = {
  userId?: string | null;
  segment: VibesSegment;
  activeWindowMinutes?: number;
  distanceUnit?: 'auto' | 'km' | 'mi';
  momentUserIds?: Set<string>;
  viewerInterests?: string[];
  initialFilters?: Partial<VibesFilters>;
};

const DEFAULT_FILTERS: VibesFilters = {
  verifiedOnly: false,
  distanceFilterKm: null,
  minAge: 18,
  maxAge: 60,
  religionFilter: null,
  locationQuery: '',
  hasVideoOnly: false,
  activeOnly: false,
  minVibeScore: null,
  minSharedInterests: 0,
};

const toStartOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const parseDistanceKm = (label?: string | null) => {
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

const isRecentlyActive = (lastActive?: string | null) => {
  if (!lastActive) return false;
  try {
    const then = new Date(lastActive).getTime();
    if (Number.isNaN(then)) return false;
    return Date.now() - then <= 45 * 60 * 1000;
  } catch {
    return false;
  }
};

// Shared filter logic so the UI can show an accurate "preview count" while users tweak draft filters.
export function applyVibesFilters(
  list: Match[],
  filters: VibesFilters,
  opts: {
    segment: VibesSegment;
    momentUserIds?: Set<string>;
    viewerInterests?: string[];
  },
): Match[] {
  let out = list.slice();
  const { segment, momentUserIds, viewerInterests } = opts;

  if (filters.hasVideoOnly) {
    out = out.filter((m) => Boolean((m as any).profileVideo));
  }
  if (filters.activeOnly) {
    out = out.filter((m) => Boolean((m as any).isActiveNow) || isRecentlyActive((m as any).lastActive));
  }
  if (filters.minVibeScore != null) {
    const min = filters.minVibeScore as number;
    out = out.filter((m) => {
      const score = typeof (m as any).compatibility === 'number' ? (m as any).compatibility : null;
      if (score == null) return true;
      return score >= min;
    });
  }
  if (filters.minSharedInterests > 0 && Array.isArray(viewerInterests) && viewerInterests.length > 0) {
    const viewerSet = new Set(viewerInterests.map((s) => String(s).toLowerCase()));
    const min = filters.minSharedInterests;
    out = out.filter((m) => {
      // Interests are sometimes fetched lazily. If we don't have them yet, keep the card.
      const interests = Array.isArray((m as any).interests) ? (m as any).interests : null;
      if (!interests) return true;
      let shared = 0;
      for (const it of interests) {
        if (viewerSet.has(String(it).toLowerCase())) shared += 1;
        if (shared >= min) return true;
      }
      return false;
    });
  }
  if (filters.verifiedOnly) {
    out = out.filter((m) => {
      const level = typeof (m as any).verification_level === 'number' ? (m as any).verification_level : null;
      return level != null ? level > 0 : !!m.verified;
    });
  }
  if (segment === 'nearby' && filters.distanceFilterKm != null) {
    out = out.filter((m) => {
      const distanceKm = (m as any).distanceKm ?? parseDistanceKm(m.distance);
      if (distanceKm == null) return true;
      return distanceKm <= (filters.distanceFilterKm as number);
    });
  }
  if (filters.minAge || filters.maxAge) {
    out = out.filter((m) => {
      const age = (m as any).age;
      if (age == null) return true;
      return age >= (filters.minAge || 0) && age <= (filters.maxAge || 200);
    });
  }
  if (filters.religionFilter) {
    const needle = filters.religionFilter.toLowerCase();
    out = out.filter((m) => String((m as any).religion || '').toLowerCase() === needle);
  }
  if (filters.locationQuery.trim()) {
    // Users often type "City, Country" (e.g. "Accra, Ghana"). Our cards typically store just the city/region.
    // Treat the first segment as the primary needle so the filter behaves as expected.
    const q = filters.locationQuery.trim().split(',')[0]!.trim().toLowerCase();
    out = out.filter((m) => {
      const loc = String((m as any).location || (m as any).region || '').toLowerCase();
      return loc.includes(q);
    });
  }

  if (segment === 'forYou') {
    const momentIds = momentUserIds ?? new Set<string>();
    out = out
      .map((m) => {
        const ai = typeof (m as any).compatibility === 'number' ? (m as any).compatibility : 0;
        const momentBoost = momentIds.has(String(m.id)) ? 30 : 0;
        const activeBoost = m.isActiveNow ? 20 : isRecentlyActive((m as any).lastActive) ? 12 : 0;
        const score = momentBoost + activeBoost + Math.max(0, Math.min(100, ai)) / 10;
        return { match: m, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((row) => row.match);
  }

  return out;
}

export default function useVibesFeed({
  userId,
  segment,
  activeWindowMinutes = 15,
  distanceUnit,
  momentUserIds,
  viewerInterests,
  initialFilters,
}: UseVibesFeedParams) {
  const [filters, setFilters] = useState<VibesFilters>({ ...DEFAULT_FILTERS, ...initialFilters });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [swipedTodayIds, setSwipedTodayIds] = useState<Set<string>>(new Set());
  const [watchdogError, setWatchdogError] = useState<Error | null>(null);
  const lastWatchdogLogAtRef = useRef(0);

  const mode = segment === 'activeNow' ? 'active' : segment === 'nearby' ? 'nearby' : 'forYou';

  const {
    matches,
    recordSwipe,
    undoLastSwipe,
    refreshMatches,
    smartCount,
    lastMutualMatch,
    fetchProfileDetails,
    lastError,
    lastFetchedAt,
  } = useAIRecommendations(userId ?? undefined, {
    mode,
    activeWindowMinutes,
    distanceUnit,
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fetchBlocked = async () => {
      try {
        const { data, error } = await supabase
          .from('blocks')
          .select('blocker_id,blocked_id')
          .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
        if (error || !data || cancelled) return;
        const next = new Set<string>();
        (data as any[]).forEach((row) => {
          const other = row.blocker_id === userId ? row.blocked_id : row.blocker_id;
          if (other) next.add(String(other));
        });
        setBlockedIds(next);
      } catch {
        // ignore
      }
    };
    void fetchBlocked();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fetchSwipesToday = async () => {
      try {
        const { data, error } = await supabase
          .from('swipes')
          .select('target_id')
          .eq('swiper_id', userId)
          .gte('created_at', toStartOfTodayIso());
        if (error || !data || cancelled) return;
        const next = new Set<string>();
        (data as any[]).forEach((row) => {
          if (row?.target_id) next.add(String(row.target_id));
        });
        setSwipedTodayIds(next);
      } catch {
        // ignore
      }
    };
    void fetchSwipesToday();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshCount]);

  // If the server returns 0 rows (valid when there are no eligible profiles yet),
  // we still want to stop showing the skeleton.
  const hasFetchedOnce = lastFetchedAt != null || lastError != null;

  // Guardrail: if we ever get stuck in "loading" without a result or error,
  // stop showing an infinite skeleton and report minimal diagnostics to Sentry.
  useEffect(() => {
    setWatchdogError(null);
    if (!userId) return;
    if (hasFetchedOnce) return;

    const t = setTimeout(() => {
      // Re-check at fire time; avoid stale closures.
      if (!userId) return;
      if (lastFetchedAt != null || lastError != null) return;

      const err = new Error('vibes_feed_timeout');
      setWatchdogError(err);

      const now = Date.now();
      if (now - lastWatchdogLogAtRef.current > 60_000) {
        lastWatchdogLogAtRef.current = now;
        captureMessage('[vibes] feed timeout (skeleton watchdog)', {
          segment,
          mode,
          hasUserId: !!userId,
          lastFetchedAt,
          lastError: lastError ? String((lastError as any).message || lastError) : null,
          net: getSupabaseNetEvents(),
        });
      }
    }, 12_000);

    return () => clearTimeout(t);
  }, [hasFetchedOnce, lastError, lastFetchedAt, mode, segment, userId]);

  const applyFilters = useCallback((next: Partial<VibesFilters>) => {
    setFilters((prev) => {
      const merged = { ...prev, ...next } as VibesFilters;
      // Keep age bounds sane.
      if (merged.minAge > merged.maxAge) {
        const tmp = merged.minAge;
        merged.minAge = merged.maxAge;
        merged.maxAge = tmp;
      }
      merged.minSharedInterests = Math.max(0, Math.min(5, merged.minSharedInterests || 0));
      if (merged.minVibeScore != null) {
        merged.minVibeScore = Math.max(0, Math.min(100, merged.minVibeScore));
      }
      return merged;
    });
  }, []);

  const refresh = useCallback(() => {
    if (refreshing || refreshCount >= 3) return;
    setRefreshCount((count) => count + 1);
    setRefreshing(true);
    refreshMatches();
  }, [refreshCount, refreshMatches, refreshing]);

  useEffect(() => {
    if (refreshing) {
      setRefreshing(false);
    }
  }, [matches, refreshing]);

  const poolProfiles = useMemo(() => {
    let list = matches.slice();

    if (blockedIds.size > 0) {
      list = list.filter((m) => !blockedIds.has(String(m.id)));
    }
    if (swipedTodayIds.size > 0) {
      list = list.filter((m) => !swipedTodayIds.has(String(m.id)));
    }

    return list;
  }, [matches, blockedIds, swipedTodayIds]);

  const filteredProfiles = useMemo(() => {
    return applyVibesFilters(poolProfiles, filters, { segment, momentUserIds, viewerInterests });
  }, [filters, momentUserIds, poolProfiles, segment, viewerInterests]);

  return {
    segment,
    profiles: filteredProfiles,
    poolProfiles,
    filters,
    applyFilters,
    refresh,
    refreshing,
    refreshRemaining: Math.max(0, 3 - refreshCount),
    // Avoid "skeleton forever": "loaded" can mean "loaded 0 items".
    loading: !!userId && !hasFetchedOnce && filteredProfiles.length === 0 && !lastError && !watchdogError,
    error: lastError ?? watchdogError,
    lastFetchedAt,
    fetchNextBatch: refresh,
    recordSwipe,
    undoLastSwipe,
    smartCount,
    lastMutualMatch,
    fetchProfileDetails,
  } as const;
}
