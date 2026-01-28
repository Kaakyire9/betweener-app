import useAIRecommendations from '@/hooks/useAIRecommendations';
import type { Match } from '@/types/match';
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type VibesSegment = 'forYou' | 'nearby' | 'activeNow';

export type VibesFilters = {
  verifiedOnly: boolean;
  distanceFilterKm: number | null;
  minAge: number;
  maxAge: number;
  religionFilter: string | null;
  locationQuery: string;
};

type UseVibesFeedParams = {
  userId?: string | null;
  segment: VibesSegment;
  activeWindowMinutes?: number;
  distanceUnit?: 'auto' | 'km' | 'mi';
  momentUserIds?: Set<string>;
  initialFilters?: Partial<VibesFilters>;
};

const DEFAULT_FILTERS: VibesFilters = {
  verifiedOnly: false,
  distanceFilterKm: null,
  minAge: 18,
  maxAge: 60,
  religionFilter: null,
  locationQuery: '',
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
    return Date.now() - then <= 3 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

export default function useVibesFeed({
  userId,
  segment,
  activeWindowMinutes = 15,
  distanceUnit,
  momentUserIds,
  initialFilters,
}: UseVibesFeedParams) {
  const [filters, setFilters] = useState<VibesFilters>({ ...DEFAULT_FILTERS, ...initialFilters });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [swipedTodayIds, setSwipedTodayIds] = useState<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);

  const mode = segment === 'activeNow' ? 'active' : segment === 'nearby' ? 'nearby' : 'forYou';

  const {
    matches,
    recordSwipe,
    undoLastSwipe,
    refreshMatches,
    smartCount,
    lastMutualMatch,
    fetchProfileDetails,
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

  useEffect(() => {
    if (matches.length > 0) hasLoadedRef.current = true;
  }, [matches.length]);

  const applyFilters = useCallback((next: Partial<VibesFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const refresh = useCallback(() => {
    if (refreshCount >= 3) return;
    setRefreshCount((count) => count + 1);
    setRefreshing(true);
    refreshMatches();
  }, [refreshCount, refreshMatches]);

  useEffect(() => {
    if (refreshing) {
      setRefreshing(false);
    }
  }, [matches, refreshing]);

  const filteredProfiles = useMemo(() => {
    let list = matches.slice();

    if (blockedIds.size > 0) {
      list = list.filter((m) => !blockedIds.has(String(m.id)));
    }
    if (swipedTodayIds.size > 0) {
      list = list.filter((m) => !swipedTodayIds.has(String(m.id)));
    }
    if (filters.verifiedOnly) {
      list = list.filter((m) => {
        const level = typeof (m as any).verification_level === 'number' ? (m as any).verification_level : null;
        return level != null ? level > 0 : !!m.verified;
      });
    }
    if (filters.distanceFilterKm != null) {
      list = list.filter((m) => {
        const distanceKm = (m as any).distanceKm ?? parseDistanceKm(m.distance);
        if (distanceKm == null) return true;
        return distanceKm <= (filters.distanceFilterKm as number);
      });
    }
    if (filters.minAge || filters.maxAge) {
      list = list.filter((m) => {
        const age = (m as any).age;
        if (age == null) return true;
        return age >= (filters.minAge || 0) && age <= (filters.maxAge || 200);
      });
    }
    if (filters.religionFilter) {
      const needle = filters.religionFilter.toLowerCase();
      list = list.filter((m) => String((m as any).religion || '').toLowerCase() === needle);
    }
    if (filters.locationQuery.trim()) {
      const q = filters.locationQuery.trim().toLowerCase();
      list = list.filter((m) => {
        const loc = String((m as any).location || (m as any).region || '').toLowerCase();
        return loc.includes(q);
      });
    }

    if (segment === 'forYou') {
      const momentIds = momentUserIds ?? new Set<string>();
      list = list
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

    return list;
  }, [
    matches,
    blockedIds,
    swipedTodayIds,
    filters.verifiedOnly,
    filters.distanceFilterKm,
    filters.minAge,
    filters.maxAge,
    filters.religionFilter,
    filters.locationQuery,
    segment,
    momentUserIds,
  ]);

  return {
    segment,
    profiles: filteredProfiles,
    filters,
    applyFilters,
    refresh,
    refreshing,
    refreshRemaining: Math.max(0, 3 - refreshCount),
    loading: !hasLoadedRef.current && filteredProfiles.length === 0,
    fetchNextBatch: refresh,
    recordSwipe,
    undoLastSwipe,
    smartCount,
    lastMutualMatch,
    fetchProfileDetails,
  } as const;
}
