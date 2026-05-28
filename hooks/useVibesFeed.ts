import useAIRecommendations from '@/hooks/useAIRecommendations';
import type { Match } from '@/types/match';
import { getSupabaseNetEvents, supabase } from '@/lib/supabase';
import { captureMessage } from '@/lib/telemetry/sentry';
import { buildLocationSearchText, isRecentlyActive, parseDistanceKm, rerankVibesSegment, type VibesSegment } from '@/lib/vibes/discovery-logic';
import { readVibesSnapshot, writeVibesSnapshot } from '@/lib/offline/vibes-store';
import type { RelationshipCompass } from '@/lib/relationship-compass';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { peekCache } from '@/lib/persisted-cache';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  snapshotOwnerIds?: Array<string | null | undefined>;
  segment: VibesSegment;
  activeWindowMinutes?: number;
  distanceUnit?: 'auto' | 'km' | 'mi';
  liveFetchEnabled?: boolean;
  momentUserIds?: Set<string>;
  viewerInterests?: string[];
  viewerGender?: string | null;
  viewerProfile?: any;
  relationshipCompass?: RelationshipCompass | null;
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

const computeSharedInterests = (viewerInterests: string[] | undefined, matchInterests: string[] | undefined) => {
  if (!Array.isArray(viewerInterests) || !viewerInterests.length) return [];
  if (!Array.isArray(matchInterests) || !matchInterests.length) return [];
  const viewerSet = new Set(
    viewerInterests.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean),
  );
  const shared: string[] = [];
  matchInterests.forEach((interest) => {
    const normalized = String(interest || '').trim().toLowerCase();
    if (!normalized || !viewerSet.has(normalized) || shared.some((item) => item.toLowerCase() === normalized)) {
      return;
    }
    shared.push(interest);
  });
  return shared;
};

const VIBES_EXCLUSIONS_CACHE_KEY_PREFIX = 'vibes_exclusions_v1:';

type PersistedVibesExclusions = {
  dayKey: string;
  blockedIds: string[];
  swipedTodayIds: string[];
  pendingIntentPeerIds: string[];
  acceptedMatchPeerIds: string[];
  chattedPeerIds: string[];
  cachedAt: number;
};

const getVibesExclusionsCacheKey = (profileId: string) =>
  `${VIBES_EXCLUSIONS_CACHE_KEY_PREFIX}${profileId}`;

const getTodayDayKey = () => new Date().toISOString().slice(0, 10);

const buildLegacyRecommendationsCacheKey = (
  profileId: string,
  segment: VibesSegment,
  activeWindowMinutes: number,
) => {
  const mode = segment === 'activeNow' ? 'active' : segment === 'nearby' ? 'nearby' : 'forYou';
  const win = mode === 'active' ? String(activeWindowMinutes) : '-';
  return `cache:ai_recs:v3:${profileId}:${mode}:${win}`;
};

// Shared filter logic so the UI can show an accurate "preview count" while users tweak draft filters.
export function applyVibesFilters(
  list: Match[],
  filters: VibesFilters,
  opts: {
    segment: VibesSegment;
    momentUserIds?: Set<string>;
    viewerInterests?: string[];
    relationshipCompass?: RelationshipCompass | null;
    viewerProfile?: any;
    preserveOrder?: boolean;
  },
): Match[] {
  let out = list.slice();
  const { segment, momentUserIds, viewerInterests, relationshipCompass, viewerProfile } = opts;

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
      const loc = buildLocationSearchText(m);
      return loc.includes(q);
    });
  }

  if (opts.preserveOrder) {
    return out;
  }

  return rerankVibesSegment(out, segment, viewerInterests, momentUserIds, relationshipCompass, viewerProfile);
}

export default function useVibesFeed({
  userId,
  snapshotOwnerIds,
  segment,
  activeWindowMinutes = 15,
  distanceUnit,
  liveFetchEnabled = true,
  momentUserIds,
  viewerInterests,
  viewerGender,
  viewerProfile,
  relationshipCompass,
  initialFilters,
}: UseVibesFeedParams) {
  const snapshotOwnerIdsSignature = JSON.stringify(
    [userId, ...(snapshotOwnerIds ?? [])]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean),
  );
  const snapshotKeys = useMemo(
    () =>
      Array.from(
        new Set(
          (JSON.parse(snapshotOwnerIdsSignature) as string[])
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      ),
    [snapshotOwnerIdsSignature],
  );
  const [filters, setFilters] = useState<VibesFilters>({ ...DEFAULT_FILTERS, ...initialFilters });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [swipedTodayIds, setSwipedTodayIds] = useState<Set<string>>(new Set());
  const [pendingIntentPeerIds, setPendingIntentPeerIds] = useState<Set<string>>(new Set());
  const [acceptedMatchPeerIds, setAcceptedMatchPeerIds] = useState<Set<string>>(new Set());
  const [chattedPeerIds, setChattedPeerIds] = useState<Set<string>>(new Set());
  const [exclusionsHydrated, setExclusionsHydrated] = useState(false);
  const [cachedMatches, setCachedMatches] = useState<Match[]>([]);
  const [snapshotHydrated, setSnapshotHydrated] = useState(false);
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
    liveFetchEnabled,
  });

  useEffect(() => {
    if (snapshotKeys.length === 0) {
      setSnapshotHydrated(true);
      return;
    }

    let cancelled = false;
    setSnapshotHydrated(false);

    void (async () => {
      try {
        for (const key of snapshotKeys) {
          const snapshot = await readVibesSnapshot(key, segment);
          if (Array.isArray(snapshot) && snapshot.length > 0) {
            if (!cancelled) {
              setCachedMatches(snapshot);
            }
            return;
          }

          const legacy = await peekCache<{ fetchedAt?: number; matches?: Match[] }>(
            buildLegacyRecommendationsCacheKey(key, segment, activeWindowMinutes),
          );
          const legacyMatches = Array.isArray(legacy?.matches) ? legacy.matches : [];
          if (legacyMatches.length > 0) {
            if (!cancelled) {
              setCachedMatches(legacyMatches);
            }
            void Promise.all(
              snapshotKeys.map((ownerId) =>
                writeVibesSnapshot(ownerId, segment, legacyMatches).catch(() => undefined),
              ),
            );
            return;
          }
        }

        if (!cancelled) {
          setCachedMatches([]);
        }
      } finally {
        if (!cancelled) {
          setSnapshotHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeWindowMinutes, segment, snapshotKeys]);

  useEffect(() => {
    if (snapshotKeys.length === 0 || lastFetchedAt == null || lastError) return;
    void Promise.all(
      snapshotKeys.map((key) => writeVibesSnapshot(key, segment, matches).catch(() => undefined)),
    );
    setCachedMatches(matches);
  }, [lastError, lastFetchedAt, matches, segment, snapshotKeys]);

  useEffect(() => {
    if (!userId) {
      setExclusionsHydrated(true);
      return;
    }

    let cancelled = false;
    setExclusionsHydrated(false);

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(getVibesExclusionsCacheKey(userId));
        if (!raw || cancelled) {
          setExclusionsHydrated(true);
          return;
        }

        const parsed = JSON.parse(raw) as Partial<PersistedVibesExclusions> | null;
        if (cancelled || !parsed) {
          setExclusionsHydrated(true);
          return;
        }

        const todayKey = getTodayDayKey();
        setBlockedIds(new Set((parsed.blockedIds ?? []).map(String)));
        setPendingIntentPeerIds(new Set((parsed.pendingIntentPeerIds ?? []).map(String)));
        setAcceptedMatchPeerIds(new Set((parsed.acceptedMatchPeerIds ?? []).map(String)));
        setChattedPeerIds(new Set((parsed.chattedPeerIds ?? []).map(String)));
        setSwipedTodayIds(
          new Set(
            parsed.dayKey === todayKey
              ? (parsed.swipedTodayIds ?? []).map(String)
              : []
          )
        );
      } catch {
        // ignore cache errors
      } finally {
        if (!cancelled) {
          setExclusionsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !exclusionsHydrated) return;
    const payload: PersistedVibesExclusions = {
      dayKey: getTodayDayKey(),
      blockedIds: Array.from(blockedIds),
      swipedTodayIds: Array.from(swipedTodayIds),
      pendingIntentPeerIds: Array.from(pendingIntentPeerIds),
      acceptedMatchPeerIds: Array.from(acceptedMatchPeerIds),
      chattedPeerIds: Array.from(chattedPeerIds),
      cachedAt: Date.now(),
    };
    void AsyncStorage.setItem(
      getVibesExclusionsCacheKey(userId),
      JSON.stringify(payload)
    ).catch(() => {
      // best effort only
    });
  }, [
    acceptedMatchPeerIds,
    blockedIds,
    chattedPeerIds,
    exclusionsHydrated,
    pendingIntentPeerIds,
    swipedTodayIds,
    userId,
  ]);

  useEffect(() => {
    if (!userId) return;
    if (!liveFetchEnabled) return;
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
  }, [liveFetchEnabled, userId]);

  useEffect(() => {
    if (!userId) return;
    if (!liveFetchEnabled) return;
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
  }, [liveFetchEnabled, refreshCount, userId]);

  // Remove from the discovery deck any profile with a pending intent interaction
  // (incoming or outgoing), or an already-accepted match.
  useEffect(() => {
    if (!userId) return;
    if (!liveFetchEnabled) return;
    let cancelled = false;

    const fetchIntentPeers = async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('intent_requests')
          .select('actor_id,recipient_id,expires_at,status')
          .in('status', ['pending', 'accepted', 'matched'])
          .or(`actor_id.eq.${userId},recipient_id.eq.${userId}`);
        if (error || !data || cancelled) return;

        const next = new Set<string>();
        (data as any[]).forEach((row) => {
          const status = String(row?.status || '').toLowerCase();
          const expiresAt = row?.expires_at ? Date.parse(String(row.expires_at)) : null;
          const isActivePending = status === 'pending' && expiresAt != null && !Number.isNaN(expiresAt) && expiresAt >= Date.now();
          const isAcceptedConnection = status === 'accepted' || status === 'matched';
          if (!isActivePending && !isAcceptedConnection) return;

          const actor = row?.actor_id ? String(row.actor_id) : null;
          const recipient = row?.recipient_id ? String(row.recipient_id) : null;
          if (!actor || !recipient) return;
          const other = actor === String(userId) ? recipient : actor;
          if (other) next.add(other);
        });
        setPendingIntentPeerIds(next);
      } catch {
        // ignore
      }
    };

    const fetchAcceptedMatchPeers = async () => {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('user1_id,user2_id,status')
          .in('status', ['PENDING', 'ACCEPTED'])
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
        if (error || !data || cancelled) return;

        const next = new Set<string>();
        (data as any[]).forEach((row) => {
          const a = row?.user1_id ? String(row.user1_id) : null;
          const b = row?.user2_id ? String(row.user2_id) : null;
          if (!a || !b) return;
          const other = a === String(userId) ? b : a;
          if (other) next.add(other);
        });
        setAcceptedMatchPeerIds(next);
      } catch {
        // ignore
      }
    };

    const fetchChatPeers = async () => {
      try {
        let viewerAuthUserId =
          typeof viewerProfile?.user_id === 'string'
            ? viewerProfile.user_id
            : typeof viewerProfile?.userId === 'string'
              ? viewerProfile.userId
              : null;

        if (!viewerAuthUserId) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('id', userId)
            .maybeSingle();
          viewerAuthUserId = typeof (profileRow as any)?.user_id === 'string' ? (profileRow as any).user_id : null;
        }

        if (!viewerAuthUserId || cancelled) return;

        const { data, error } = await supabase
          .from('messages')
          .select('sender_id,receiver_id')
          .or(`sender_id.eq.${viewerAuthUserId},receiver_id.eq.${viewerAuthUserId}`)
          .order('created_at', { ascending: false })
          .limit(500);
        if (error || !Array.isArray(data) || cancelled) return;

        const peerUserIds = Array.from(
          new Set(
            (data as any[])
              .map((row) => {
                const sender = row?.sender_id ? String(row.sender_id) : null;
                const receiver = row?.receiver_id ? String(row.receiver_id) : null;
                if (sender === viewerAuthUserId) return receiver;
                if (receiver === viewerAuthUserId) return sender;
                return null;
              })
              .filter((value): value is string => Boolean(value)),
          ),
        );

        if (peerUserIds.length === 0) {
          setChattedPeerIds(new Set());
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id,user_id')
          .in('user_id', peerUserIds);
        if (profilesError || !Array.isArray(profiles) || cancelled) return;

        setChattedPeerIds(
          new Set(
            (profiles as any[])
              .map((row) => (row?.id ? String(row.id) : null))
              .filter((value): value is string => Boolean(value)),
          ),
        );
      } catch {
        // ignore
      }
    };

    void fetchIntentPeers();
    void fetchAcceptedMatchPeers();
    void fetchChatPeers();

    return () => {
      cancelled = true;
    };
  }, [liveFetchEnabled, refreshCount, userId, viewerProfile?.user_id, viewerProfile?.userId]);

  // If the server returns 0 rows (valid when there are no eligible profiles yet),
  // we still want to stop showing the skeleton.
  const hasFetchedOnce = lastFetchedAt != null || lastError != null;

  // Guardrail: if we ever get stuck in "loading" without a result or error,
  // stop showing an infinite skeleton and report minimal diagnostics to Sentry.
  useEffect(() => {
    setWatchdogError(null);
    if (!userId) return;
    if (!liveFetchEnabled) return;
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
  }, [hasFetchedOnce, lastError, lastFetchedAt, liveFetchEnabled, mode, segment, userId]);

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

  const sourceMatches = useMemo(() => {
    if (matches.length > 0) return matches;
    if (!hasFetchedOnce || lastError || watchdogError) return cachedMatches;
    return matches;
  }, [cachedMatches, hasFetchedOnce, lastError, matches, watchdogError]);

  const usingCachedSnapshot = useMemo(
    () => matches.length === 0 && cachedMatches.length > 0 && (!hasFetchedOnce || !!lastError || !!watchdogError),
    [cachedMatches.length, hasFetchedOnce, lastError, matches.length, watchdogError],
  );

  const serverRankedSource = useMemo(
    () =>
      sourceMatches.length > 0 &&
      sourceMatches.every((match) => Boolean((match as any).serverRanked)),
    [sourceMatches],
  );

  const poolProfiles = useMemo(() => {
    let list = sourceMatches.slice().map((match) => ({
      ...match,
      commonInterests: computeSharedInterests(viewerInterests, (match as any).interests),
    }));
    const normalizedViewerGender =
      viewerGender === 'MALE' || viewerGender === 'FEMALE' ? viewerGender : null;

    if (normalizedViewerGender) {
      list = list.filter((match) => {
        const candidateGender = String((match as any).gender || '').trim().toUpperCase();
        if (candidateGender !== 'MALE' && candidateGender !== 'FEMALE') return true;
        return normalizedViewerGender === 'MALE'
          ? candidateGender === 'FEMALE'
          : candidateGender === 'MALE';
      });
    }

    if (blockedIds.size > 0) {
      list = list.filter((m) => !blockedIds.has(String(m.id)));
    }
    if (swipedTodayIds.size > 0) {
      list = list.filter((m) => !swipedTodayIds.has(String(m.id)));
    }
    if (pendingIntentPeerIds.size > 0) {
      list = list.filter((m) => !pendingIntentPeerIds.has(String(m.id)));
    }
    if (acceptedMatchPeerIds.size > 0) {
      list = list.filter((m) => !acceptedMatchPeerIds.has(String(m.id)));
    }
    if (chattedPeerIds.size > 0) {
      list = list.filter((m) => !chattedPeerIds.has(String(m.id)));
    }

    return list;
  }, [sourceMatches, blockedIds, swipedTodayIds, pendingIntentPeerIds, acceptedMatchPeerIds, chattedPeerIds, viewerInterests, viewerGender]);

  const filteredProfiles = useMemo(() => {
    return applyVibesFilters(poolProfiles, filters, {
      segment,
      momentUserIds,
      viewerInterests,
      relationshipCompass,
      viewerProfile,
      preserveOrder: usingCachedSnapshot || serverRankedSource,
    });
  }, [filters, momentUserIds, poolProfiles, relationshipCompass, segment, serverRankedSource, usingCachedSnapshot, viewerInterests, viewerProfile]);

  const recordFeedSwipe = useCallback(
    (id: string, action: 'like' | 'dislike' | 'superlike', index = 0) => {
      setSwipedTodayIds((prev) => {
        const next = new Set(prev);
        next.add(String(id));
        return next;
      });
      recordSwipe(id, action, index);
    },
    [recordSwipe],
  );

  const undoFeedSwipe = useCallback(() => {
    const undone = undoLastSwipe();
    if (!undone?.match?.id) return undone;

    setSwipedTodayIds((prev) => {
      if (!prev.has(String(undone.match.id))) return prev;
      const next = new Set(prev);
      next.delete(String(undone.match.id));
      return next;
    });

    return undone;
  }, [undoLastSwipe]);

  const snapshotsReady = exclusionsHydrated && snapshotHydrated;
  const visiblePoolProfiles = snapshotsReady ? poolProfiles : [];
  const visibleProfiles = snapshotsReady ? filteredProfiles : [];

  return {
    segment,
    profiles: visibleProfiles,
    poolProfiles: visiblePoolProfiles,
    filters,
    applyFilters,
    refresh,
    refreshing,
    refreshRemaining: Math.max(0, 3 - refreshCount),
    // Avoid "skeleton forever": "loaded" can mean "loaded 0 items".
    loading:
      (liveFetchEnabled && !snapshotsReady) ||
      (!!userId &&
        liveFetchEnabled &&
        !hasFetchedOnce &&
        visibleProfiles.length === 0 &&
        !lastError &&
        !watchdogError),
    error: lastError ?? watchdogError,
    lastFetchedAt,
    fetchNextBatch: refresh,
    recordSwipe: recordFeedSwipe,
    undoLastSwipe: undoFeedSwipe,
    smartCount,
    lastMutualMatch,
    fetchProfileDetails,
  } as const;
}
