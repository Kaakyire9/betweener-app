import { supabase } from '@/lib/supabase';
import { Match } from '@/types/match';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, Linking } from 'react-native';

// Tunable window for "Active" tab (minutes)
const ACTIVE_WINDOW_MINUTES = 15;
const DISTANCE_UNIT_KEY = 'distance_unit';
const KM_PER_MILE = 1.60934;
const DISTANCE_UNIT_EVENT = 'distance_unit_changed';

type DistanceUnit = 'auto' | 'km' | 'mi';

const resolveAutoUnit = (): 'km' | 'mi' => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return /[-_]US\b/i.test(locale) ? 'mi' : 'km';
  } catch {
    return 'km';
  }
};

const parseDistanceKmFromLabel = (label?: string | null): number | undefined => {
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

// Format distance with sensible rounding and short strings
function formatDistance(distanceKm?: number | null, fallback?: string, unit: DistanceUnit = 'km') {
  if (distanceKm == null || Number.isNaN(Number(distanceKm))) {
    return fallback || '';
  }
  const km = Number(distanceKm);
  const resolvedUnit: 'km' | 'mi' = unit === 'mi' ? 'mi' : 'km';
  const value = resolvedUnit === 'mi' ? km / KM_PER_MILE : km;
  const unitSingular = resolvedUnit === 'mi' ? 'mile' : 'km';
  const unitPlural = resolvedUnit === 'mi' ? 'miles' : 'km';

  if (value < 1) return `<1 ${unitSingular} away`;
  if (value < 10) {
    const pretty = Number(value.toFixed(1));
    const label = resolvedUnit === 'mi' && pretty >= 1 && pretty < 1.5 ? unitSingular : unitPlural;
    return `${pretty.toFixed(1)} ${label} away`;
  }
  const rounded = Math.round(value);
  const label = resolvedUnit === 'mi' && rounded === 1 ? unitSingular : unitPlural;
  return `${rounded} ${label} away`;
}

const parseAiScorePercent = (value: unknown): number | undefined => {
  const asNumber =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(asNumber)) return undefined;
  return Math.max(0, Math.min(100, asNumber));
};

async function signProfileVideoUrl(path?: string | null) {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  try {
    const { data, error } = await supabase.storage.from('profile-videos').createSignedUrl(path, 3600);
    if (error) return undefined;
    return data?.signedUrl || undefined;
  } catch {
    return undefined;
  }
}

export default function useAIRecommendations(
  userId?: string,
  opts?: {
    mutualMatchTestIds?: string[];
    mode?: 'forYou' | 'nearby' | 'active';
    activeWindowMinutes?: number;
    distanceUnit?: DistanceUnit;
  }
) {
  // Start empty; prefer server-sourced profiles. Mocks are only a fallback
  // when the server cannot be reached.
  const [matches, setMatches] = useState<Match[]>([]);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const [lastMutualMatch, setLastMutualMatch] = useState<Match | null>(null);
  const [swipeHistory, setSwipeHistory] = useState<Array<{ id: string; action: 'like' | 'dislike' | 'superlike'; index: number; match: Match }>>([]);
  const mountedRef = useRef(true);
  const mode = opts?.mode ?? 'forYou';
  const activeWindowMinutes = opts?.activeWindowMinutes ?? ACTIVE_WINDOW_MINUTES;
  const effectiveDistanceUnit =
    opts?.distanceUnit && opts.distanceUnit !== 'auto' ? opts.distanceUnit : distanceUnit;
  const resolvedDistanceUnit = useMemo(
    () => (effectiveDistanceUnit === 'auto' ? resolveAutoUnit() : effectiveDistanceUnit),
    [effectiveDistanceUnit]
  );

  const getStoredDistanceUnit = useCallback(async (): Promise<DistanceUnit> => {
    try {
      const stored = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
      if (stored === 'auto' || stored === 'km' || stored === 'mi') {
        return stored;
      }
    } catch {}
    return effectiveDistanceUnit;
  }, [effectiveDistanceUnit]);

  useEffect(() => {
    setMatches((prev) =>
      prev.map((m) => {
        const fallback = (m as any).region || (m as any).location || m.distance;
        let distanceKm = (m as any).distanceKm;
        if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm)) {
          distanceKm = parseDistanceKmFromLabel(m.distance);
        }
        if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm)) {
          return m;
        }
        return {
          ...m,
          distance: formatDistance(distanceKm, fallback, resolvedDistanceUnit),
          distanceKm,
        } as Match;
      })
    );
  }, [resolvedDistanceUnit]);

  useEffect(() => {
    let mounted = true;
    const loadDistanceUnit = async () => {
      try {
        const stored = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
        if (!mounted) return;
        if (stored === 'auto' || stored === 'km' || stored === 'mi') {
          setDistanceUnit(stored);
        }
      } catch {}
    };
    void loadDistanceUnit();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DISTANCE_UNIT_EVENT, (next: DistanceUnit) => {
      if (next === 'auto' || next === 'km' || next === 'mi') {
        setDistanceUnit(next);
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  // simple mock: when a swipe is recorded, remove the head and append a regenerated match
  const recordSwipe = useCallback((id: string, action: 'like' | 'dislike' | 'superlike', index = 0) => {
    setSwipeHistory((prev) => {
      const head = matches[0];
      if (!head) return prev;
      return [...prev, { id, action, index, match: head }];
    });
    setMatches((prev: Match[]) => prev.slice(1));
    // Persist the swipe to Supabase if configured and we have a userId
    (async () => {
      try {
        if (!userId) return;
        // insert swipe record
        const { error: insertErr } = await supabase
          .from('swipes')
          .upsert([{
            swiper_id: userId,
            target_id: id,
            action: action === 'superlike' ? 'SUPERLIKE' : action === 'like' ? 'LIKE' : 'PASS',
          }], { onConflict: 'swiper_id,target_id' });
        if (insertErr) {
          console.log('[recordSwipe] failed to upsert swipe', insertErr);
        }

        // If this was a 'like', check whether the target already liked us -> mutual match
        if (action === 'like') {
            const { data: reciprocal, error: rErr } = await supabase
              .from('swipes')
              .select('swiper_id, target_id, action')
              .eq('swiper_id', id)
              .eq('target_id', userId)
              .in('action', ['LIKE', 'SUPERLIKE'])
              .limit(1);
          if (rErr) {
            console.log('[recordSwipe] reciprocal check error', rErr);
          }
          if (!rErr && reciprocal && reciprocal.length > 0) {
            // Local celebration; match row will be created/updated by DB trigger
            const swipeMatch = matches.find((m) => String(m.id) === String(id));
            if (swipeMatch) {
              setLastMutualMatch(swipeMatch);
              setTimeout(() => setLastMutualMatch(null), 10_000);
            }
          }
        }
      } catch (e) {
        // ignore and keep local mock behavior
      }
    })();
  }, [matches]);

  // Expose a deterministic trigger for QA and debug: can be called to force the celebration modal
  const triggerMutualMatch = useCallback((matchId: string) => {
    try {
      const found = matches.find((m) => String(m.id) === String(matchId));
      if (found) {
        setLastMutualMatch(found);
        // automatically clear after a reasonable QA timeout
        setTimeout(() => {
          if (mountedRef.current) setLastMutualMatch(null);
        }, 10_000);
        return true;
      }
    } catch (e) {}
    return false;
  }, [matches]);

  // Realtime listener for matches inserts so UI can react even if swipe reciprocal check is skipped by RLS
  const matchesRef = useRef(matches);
  useEffect(() => { matchesRef.current = matches; }, [matches]);
  const lastMatchToastRef = useRef<{ id: string | null; ts: number }>({ id: null, ts: 0 });

  useEffect(() => {
    if (!userId) return;

    const handleMatchChange = async (payload: any) => {
      try {
        const row = payload?.new;
        if (!row) return;
        if (row.user1_id !== userId && row.user2_id !== userId) return;
        const otherId = row.user1_id === userId ? row.user2_id : row.user1_id;
        const nowTs = Date.now();
        if (lastMatchToastRef.current.id === String(otherId) && (nowTs - lastMatchToastRef.current.ts) < 5000) {
          // prevent rapid duplicate toasts for the same match
          return;
        }

        // try to ensure status ACCEPTED (in case trigger inserted pending)
        try {
          const sorted = [row.user1_id, row.user2_id].sort();
          const { error: statusErr } = await supabase
            .from('matches')
            .update({
              status: 'ACCEPTED',
              updated_at: new Date().toISOString(),
            })
            .or(`and(user1_id.eq.${sorted[0]},user2_id.eq.${sorted[1]}),and(user1_id.eq.${sorted[1]},user2_id.eq.${sorted[0]})`);
          if (statusErr) {
            console.log('[matches realtime] status update error', statusErr);
          }
        } catch (e) {
          console.log('[matches realtime] status update threw', e);
        }

        // fetch the other profile with minimal fields
        let { data: profileData, error: pErr } = await supabase
          .from('profiles')
          .select('id, full_name, bio, age, avatar_url, region, tribe, religion, personality_type')
          .eq('id', otherId)
          .limit(1)
          .single();
        // If any column is missing, retry with minimal select
        if ((pErr && (pErr as any).code === '42703') || (!profileData && pErr)) {
          try {
            const retry = await supabase
              .from('profiles')
              .select('id, full_name, bio, age, avatar_url, region, tribe, religion, personality_type')
              .eq('id', otherId)
              .limit(1)
              .single();
            if (!retry.error && retry.data) {
              pErr = null as any;
              profileData = retry.data as any;
            }
          } catch {}
        }
        if (pErr || !profileData) {
          console.log('[matches realtime] profile fetch error', pErr);
          // fallback: surface the match from local list if present
          const swipeMatch = matchesRef.current.find((m) => String(m.id) === String(otherId));
          if (swipeMatch) {
            console.log('[matches realtime] using local match fallback', { otherId });
            setLastMutualMatch(swipeMatch);
            setTimeout(() => {
              if (mountedRef.current) setLastMutualMatch(null);
            }, 10_000);
          }
          return;
        }

        // fetch interests for the matched profile (profile_interests table)
        let matchedInterests: string[] = [];
        try {
          const { data: piRows, error: piErr } = await supabase
            .from('profile_interests')
            .select('profile_id, interests ( name )')
            .eq('profile_id', otherId);
          if (!piErr && Array.isArray(piRows) && piRows.length > 0) {
            for (const r of piRows as any[]) {
              const arr = Array.isArray(r.interests) ? r.interests.map((i: any) => i.name).filter(Boolean) : [];
              matchedInterests = matchedInterests.concat(arr);
            }
          }
        } catch (e) {}

        const matched: Match = {
          id: profileData.id,
          name: profileData.full_name || profileData.id,
          age: profileData.age,
          tagline: profileData.bio || '',
          interests: matchedInterests || [],
          avatar_url: profileData.avatar_url || undefined,
          distance: profileData.region || '',
          isActiveNow: false,
          lastActive: null as any,
          verified: false,
          personalityTags: Array.isArray((profileData as any).personality_tags)
            ? (profileData as any).personality_tags.map((t: any) => (typeof t === 'string' ? t : t?.name || String(t)))
            : (profileData as any).personality_type ? [(profileData as any).personality_type] : [],
          profileVideo: undefined,
          tribe: profileData.tribe,
          religion: profileData.religion,
          region: profileData.region,
        } as Match;

        console.log('[matches realtime] received accepted match', { otherId });
        lastMatchToastRef.current = { id: String(otherId), ts: Date.now() };
        setLastMutualMatch(matched);
        setTimeout(() => {
          if (mountedRef.current) setLastMutualMatch(null);
        }, 10_000);
      } catch (e) {
        console.log('[matches realtime] handler threw', e);
      }
    };

    const channel = supabase
      .channel('matches-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: 'status=eq.ACCEPTED' }, handleMatchChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'status=eq.ACCEPTED' }, handleMatchChange);

    try { channel.subscribe(); } catch {}
    return () => {
      try { channel.unsubscribe(); } catch {}
    };
  }, [userId, mode]);

  // Deep-link support: listen for URLs containing `mutualMatch=<id>` (comma-separated allowed)
  useEffect(() => {
    mountedRef.current = true;
    const parseAndTrigger = (raw: string | undefined) => {
      if (!raw) return;
      try {
        // extract query param manually to avoid URL constructor issues on older RN
        const m = raw.match(/[?&]mutualMatch=([^&]+)/);
        if (m && m[1]) {
          const ids = decodeURIComponent(m[1]).split(',').map((s) => s.trim()).filter(Boolean);
          if (ids.length > 0) {
            // try to trigger the first id that matches our current list
            for (const id of ids) {
              const ok = triggerMutualMatch(id);
              if (ok) break;
            }
          }
        }
      } catch (e) {}
    };

    // handle initial URL if app was launched via deep link
    void Linking.getInitialURL().then((url) => parseAndTrigger(url)).catch(() => {});

    const sub = Linking.addEventListener?.('url', (ev: any) => {
      try { parseAndTrigger(ev?.url); } catch {}
    });

    return () => {
      mountedRef.current = false;
      try {
        if (sub && typeof sub.remove === 'function') sub.remove();
        // older RN versions: Linking.removeEventListener
        // @ts-ignore
        if (Linking.removeEventListener) Linking.removeEventListener('url', parseAndTrigger);
      } catch {}
    };
  }, [triggerMutualMatch]);

  const undoLastSwipe = useCallback((): { match: Match; index: number } | null => {
    let lastEntry: { id: string; action: 'like' | 'dislike' | 'superlike'; index: number; match: Match } | undefined;
    setSwipeHistory((prev) => {
      if (prev.length === 0) return prev;
      lastEntry = prev[prev.length - 1];
      return prev.slice(0, -1);
    });

    if (!lastEntry) return null;

    // re-insert the match at the front so it becomes the active card again
    // and remove the generated tail element that was appended when the swipe
    // was originally recorded — this keeps the matches array length stable
    setMatches((prev) => {
      if (prev.length === 0) return [lastEntry!.match];
      const withoutLast = prev.slice(0, -1);
      return [lastEntry!.match, ...withoutLast];
    });
    return { match: lastEntry.match, index: lastEntry.index };
  }, []);

  const smartCount = useMemo(() => {
    // pretend some are AI-curated
    return Math.max(0, Math.min(5, Math.floor(matches.length / 2)));
  }, [matches]);

  const fetchMatchesFromServer = useCallback(async () => {
    try {
      const storedUnit = await getStoredDistanceUnit();
      const unitForFormat: DistanceUnit = storedUnit === 'auto' ? resolveAutoUnit() : storedUnit;
      console.log('[useAIRecommendations] fetchMatchesFromServer starting', { userId });
      const resolveProfileVideos = async (list: Match[]) => {
        if (!Array.isArray(list) || list.length === 0) return list;
        const signedByPath: Record<string, string> = {};
        await Promise.all(
          list.map(async (m) => {
            const raw = (m as any).profileVideo;
            if (!raw || typeof raw !== 'string' || raw.startsWith('http')) return;
            if (signedByPath[raw]) return;
            const signed = await signProfileVideoUrl(raw);
            if (signed) signedByPath[raw] = signed;
          }),
        );
        if (Object.keys(signedByPath).length === 0) return list;
        return list.map((m) => {
          const raw = (m as any).profileVideo;
          if (raw && signedByPath[raw]) {
            return { ...m, profileVideo: signedByPath[raw] } as Match;
          }
          return m;
        });
      };
      // If Supabase is configured and we have a user id, fetch profiles
      if (supabase && userId) {
        // Nearby mode: server-side distance sort via RPC
        if (mode === 'nearby') {
          try {
            const scored = await supabase.rpc('get_recs_nearby_scored', { p_user_id: userId, p_limit: 20 });
            const { data, error } = !scored.error ? scored : await supabase.rpc('get_recs_nearby', { p_user_id: userId, p_limit: 20 });
            if (!error && Array.isArray(data)) {
              const mapped: Match[] = data.map((p: any) => ({
                id: p.id,
                name: p.full_name || p.user_id || String(p.id),
                age: p.age,
                tagline: p.bio || '',
                interests: Array.isArray(p.interests) ? p.interests : [],
                avatar_url: p.avatar_url || undefined,
                distance: formatDistance(p.distance_km, p.location || p.region, unitForFormat),
                distanceKm: typeof p.distance_km === 'number' ? p.distance_km : undefined,
                isActiveNow: !!p.online || !!p.is_active,
                lastActive: p.last_active ?? null,
                verified: typeof p.verified === 'boolean' ? p.verified : (typeof p.verification_level === 'number' ? p.verification_level > 0 : false),
                personalityTags: Array.isArray((p as any).personality_tags) ? (p as any).personality_tags : ((p as any).personality_type ? [(p as any).personality_type] : []),
                aiScore: parseAiScorePercent(p.ai_score),
                profileVideo: (p as any).profile_video || undefined,
                location: p.location || undefined,
                tribe: p.tribe,
                religion: p.religion,
                region: p.region,
                current_country: (p as any).current_country,
                current_country_code: (p as any).current_country_code,
                location_precision: (p as any).location_precision,
              } as Match));
              const withSigned = await resolveProfileVideos(mapped);
              setMatches(withSigned);
            if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[useAIRecommendations] nearby rpc result', { count: mapped.length });
            return;
          }
        } catch (e) {
          console.log('[useAIRecommendations] nearby rpc error', e);
        }
        }

        // Active mode: server-side active filter via RPC
        if (mode === 'active') {
          try {
            const scored = await supabase.rpc('get_recs_active_scored', { p_user_id: userId, p_window_minutes: activeWindowMinutes });
            const { data, error } = !scored.error ? scored : await supabase.rpc('get_recs_active', { p_user_id: userId, p_window_minutes: activeWindowMinutes });
            if (!error && Array.isArray(data)) {
              const mapped: Match[] = data.map((p: any) => ({
                id: p.id,
                name: p.full_name || p.user_id || String(p.id),
                age: p.age,
                tagline: p.bio || '',
                interests: Array.isArray(p.interests) ? p.interests : [],
                avatar_url: p.avatar_url || undefined,
                distance: p.location || p.region || '',
                distanceKm: undefined,
                isActiveNow: !!p.online || !!p.is_active,
                lastActive: p.last_active ?? null,
                verified: typeof p.verified === 'boolean' ? p.verified : (typeof p.verification_level === 'number' ? p.verification_level > 0 : false),
                personalityTags: Array.isArray((p as any).personality_tags) ? (p as any).personality_tags : ((p as any).personality_type ? [(p as any).personality_type] : []),
                aiScore: parseAiScorePercent(p.ai_score),
                profileVideo: (p as any).profile_video || undefined,
                location: p.location || undefined,
                tribe: p.tribe,
                religion: p.religion,
                region: p.region,
                current_country: (p as any).current_country,
                current_country_code: (p as any).current_country_code,
                location_precision: (p as any).location_precision,
              } as Match));
              const withSigned = await resolveProfileVideos(mapped);
              setMatches(withSigned);
              if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[useAIRecommendations] active rpc result', { count: mapped.length });
              return;
            }
          } catch (e) {
            console.log('[useAIRecommendations] active rpc error', e);
          }
        }

        // For-you mode: prefer scored RPC (per-viewer compatibility)
        try {
          const { data, error } = await supabase.rpc('get_recs_for_you_scored', { p_user_id: userId, p_limit: 20 });
          if (!error && Array.isArray(data)) {
            const mapped: Match[] = data.map((p: any) => ({
              id: p.id,
              name: p.full_name || p.user_id || String(p.id),
              age: p.age,
              tagline: p.bio || '',
              interests: Array.isArray(p.interests) ? p.interests : [],
              avatar_url: p.avatar_url || undefined,
              distance: formatDistance(p.distance_km, p.location || p.region, unitForFormat),
              distanceKm: typeof p.distance_km === 'number' ? p.distance_km : undefined,
              isActiveNow: !!p.online || !!p.is_active,
              lastActive: p.last_active ?? null,
              verified: typeof p.verified === 'boolean' ? p.verified : (typeof p.verification_level === 'number' ? p.verification_level > 0 : false),
              personalityTags: Array.isArray((p as any).personality_tags) ? (p as any).personality_tags : ((p as any).personality_type ? [(p as any).personality_type] : []),
              aiScore: parseAiScorePercent(p.ai_score),
              profileVideo: (p as any).profile_video || undefined,
              location: p.location || undefined,
              tribe: p.tribe,
              religion: p.religion,
              region: p.region,
              current_country: (p as any).current_country,
              current_country_code: (p as any).current_country_code,
              location_precision: (p as any).location_precision,
            } as Match));
            const withSigned = await resolveProfileVideos(mapped);
            setMatches(withSigned);
            if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[useAIRecommendations] forYou scored rpc result', { count: mapped.length });
            return;
          }
        } catch (e) {
          // fall through to legacy query
        }

        // The `profiles` table may vary across environments. Try an
        // extended select first (includes optional fields). If it fails
        // due to missing columns (Postgres error 42703), retry with a
        // minimal safe column list to avoid falling back to mocks.
        const extendedSelect =
          'id, user_id, full_name, age, bio, avatar_url, location, latitude, longitude, region, tribe, religion, personality_type, online, is_active, verification_level, ai_score, profile_video, current_country, current_country_code, location_precision';
        const minimalSelect =
          'id, user_id, full_name, age, bio, avatar_url, location, latitude, longitude, region, tribe, religion, personality_type, online, is_active, verification_level, profile_video, current_country, current_country_code, location_precision';

        let data: any[] | null = null;
        let error: any = null;
        let usedMinimal = false;

        try {
          const res = await supabase.from('profiles').select(extendedSelect).neq('id', userId).limit(20);
          // @ts-ignore
          data = res.data;
          // @ts-ignore
          error = res.error;
        } catch (e) {
          error = e;
        }

        // If we got a missing-column error, retry with minimalSelect
        if (error && (error.code === '42703' || String(error.message).includes('does not exist'))) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[useAIRecommendations] extended select failed, retrying with minimalSelect', { error });
          try {
            const res2 = await supabase.from('profiles').select(minimalSelect).neq('id', userId).limit(20);
            // @ts-ignore
            data = res2.data;
            // @ts-ignore
            error = res2.error;
            usedMinimal = true;
          } catch (e) {
            error = e;
          }
        }

        // Debug: log raw result (only in dev to avoid noisy prod logs)
        try {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[useAIRecommendations] supabase.profiles result', {
              error: error || null,
              count: Array.isArray(data) ? data.length : null,
              raw: data,
              usedMinimal,
            });
          }
        } catch (e) {}

        if (!error && Array.isArray(data) && data.length > 0) {
          // Also fetch profile interests in bulk to populate the UI tags
          const profileIds = data.map((p: any) => p.id).filter(Boolean);
          let interestsMap: Record<string, string[]> = {};
          try {
          const { data: piData, error: piErr } = await supabase
            .from('profile_interests')
            .select('profile_id, interests!inner(name)')
            .in('profile_id', profileIds);
          if (!piErr && Array.isArray(piData)) {
            for (const row of piData as any[]) {
              const pid = row.profile_id;
              let arr: string[] = [];
              if (Array.isArray(row.interests)) {
                arr = row.interests.map((i: any) => i.name).filter(Boolean);
              } else if (row.interests && row.interests.name) {
                arr = [row.interests.name];
              }
              if (!interestsMap[pid]) interestsMap[pid] = [];
              interestsMap[pid] = [...interestsMap[pid], ...arr];
            }
          }
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log('[useAIRecommendations] profile_interests result', { count: Object.keys(interestsMap).length, interestsMap });
            }
          } catch (e) {
            // ignore profile interests errors
          }

          // Try to fetch the current user's coordinates so we can compute distances
          let userCoords: { latitude?: number; longitude?: number } | null = null;
          try {
            const { data: myProfile, error: myErr } = await supabase
              .from('profiles')
              .select('latitude, longitude')
              .eq('id', userId)
              .limit(1)
              .single();
            if (!myErr && myProfile) {
              userCoords = { latitude: myProfile.latitude, longitude: myProfile.longitude };
            }
          } catch (e) {
            userCoords = null;
          }

          const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const toRad = (v: number) => (v * Math.PI) / 180;
            const R = 6371; // km
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
          };

          const mapped: Match[] = data.map((p: any) => {
            // build interests: prefer interestsMap, fallback to region/tribe
            let interestsArr: string[] = Array.isArray(interestsMap[p.id]) ? interestsMap[p.id].map((i: any) => (typeof i === 'string' ? i : i?.name || String(i))) : [];

            // compute distance when we have coordinates; otherwise fall back to stored location label
            let distanceStr = '';
            let distanceKm: number | undefined;
            if (userCoords && p.latitude != null && p.longitude != null && userCoords.latitude != null && userCoords.longitude != null) {
              try {
                const km = haversineKm(userCoords.latitude!, userCoords.longitude!, Number(p.latitude), Number(p.longitude));
                distanceStr = formatDistance(km, p.location || p.region, unitForFormat);
                distanceKm = km;
              } catch (e) {
                distanceStr = p.location || p.region || '';
              }
            } else if (p.location || p.region) {
              distanceStr = p.location || p.region || '';
            }

            const ptags = Array.isArray(p.personality_tags) ? p.personality_tags.map((t: any) => (typeof t === 'string' ? t : t?.name || String(t))) : [];

            return ({
              id: p.id,
              name: p.full_name || p.user_id || String(p.id),
              age: p.age,
              tagline: p.bio || '',
              interests: interestsArr || [],
              avatar_url: p.avatar_url || undefined,
              distance: distanceStr || '',
              distanceKm: typeof distanceKm === 'number' && !Number.isNaN(distanceKm) ? distanceKm : undefined,
              isActiveNow: !!p.online || !!p.is_active,
              lastActive: p.last_active ?? null,
              verified: typeof p.verified === 'boolean' ? p.verified : (typeof p.verification_level === 'number' ? p.verification_level > 0 : false),
              personalityTags: ptags || [],
              aiScore: parseAiScorePercent(p.ai_score),
              profileVideo: p.profile_video || undefined,
              location: p.location || undefined,
              tribe: p.tribe,
              religion: p.religion,
              region: p.region,
              current_country: p.current_country,
              current_country_code: (p as any).current_country_code,
              location_precision: p.location_precision,
            } as Match);
          });
          const withSigned = await resolveProfileVideos(mapped);
          setMatches(withSigned);
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[useAIRecommendations] fetched matches from server', { count: mapped.length, sample: mapped.slice(0, 3) });
          }
          return;
        }
        // If we got here, a fetch was attempted but either errored or returned zero rows.
        // Use debug mock fallback only when a query error occurred. If the query
        // returned zero rows, leave `matches` empty so the UI shows the empty state.
        if (error) {
          console.log('[useAIRecommendations] profiles query error (falling back to mocks)', error);
        } else if (Array.isArray(data) && data.length === 0) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[useAIRecommendations] profiles query returned 0 rows - leaving matches empty');
          setMatches([]);
          return;
        }
      } else {
        // No userId available yet (not signed in / profile not loaded) —
        // do not populate mocks proactively. Leave matches empty and let
        // the UI show the empty state until a userId is present.
        return;
      }
    } catch (e) {
      console.log('[useAIRecommendations] fetch error', e);
      setMatches([]);
      return;
    }
    // If we reached here it means a server fetch was attempted and failed
    // (or returned no profiles). Leave matches empty to avoid mock data.
    console.log('[useAIRecommendations] leaving matches empty after fetch failure');
    setMatches([]);
  }, [userId, mode, activeWindowMinutes, resolvedDistanceUnit, getStoredDistanceUnit]);

    // Fetch matches on mount and when userId changes
    useEffect(() => {
      void fetchMatchesFromServer();
    }, [fetchMatchesFromServer]);

  const refreshMatches = useCallback(() => {
    // fire-and-forget: try server, fallback to mock on error
    void fetchMatchesFromServer();
    setSwipeHistory(() => []);
  }, [fetchMatchesFromServer]);

  // on-demand fetch for optional profile details (personality_tags, profile_video, profile_interests)
  const fetchProfileDetails = useCallback(async (profileId?: string) => {
    if (!profileId || !supabase) return null;
    try {
      // fetch optional profile fields
      const { data: profileData, error: pErr } = await supabase
        .from('profiles')
              .select('id, profile_video, latitude, longitude, region, tribe, religion, current_country, current_country_code, location_precision, personality_type, online, is_active, verification_level')
        .eq('id', profileId)
        .limit(1)
        .single();

      // fetch interests for this profile
      let interestsArr: string[] = [];
      try {
        const { data: piRows, error: piErr } = await supabase
          .from('profile_interests')
          .select('profile_id, interests!inner(name)')
          .eq('profile_id', profileId);
        if (!piErr && Array.isArray(piRows) && piRows.length > 0) {
          for (const r of piRows as any[]) {
            let arr: string[] = [];
            if (Array.isArray(r.interests)) {
              arr = r.interests.map((i: any) => i.name).filter(Boolean);
            } else if (r.interests && r.interests.name) {
              arr = [r.interests.name];
            }
            interestsArr = interestsArr.concat(arr);
          }
        }
      } catch (e) {}

      const signedProfileVideo = profileData?.profile_video
        ? await signProfileVideoUrl(profileData.profile_video)
        : undefined;

      // merge into existing matches
      let merged: any = null;
      setMatches((prev) => {
        const next = prev.map((m) => {
          if (String(m.id) !== String(profileId)) return m;
          const personality = profileData?.personality_type
            ? [profileData.personality_type]
            : (m as any).personalityTags || [];
          const interestsFinal = (interestsArr && interestsArr.length > 0) ? interestsArr : ((m as any).interests && (m as any).interests.length > 0 ? (m as any).interests : [profileData?.region, profileData?.tribe].filter(Boolean));
          merged = {
            ...m,
            profileVideo: signedProfileVideo || (m as any).profileVideo,
            personalityTags: personality,
            interests: interestsFinal,
            tribe: profileData?.tribe ?? (m as any).tribe,
            religion: profileData?.religion ?? (m as any).religion,
            region: profileData?.region ?? (m as any).region,
            current_country: profileData?.current_country ?? (m as any).current_country,
            current_country_code: profileData?.current_country_code ?? (m as any).current_country_code,
            location_precision: profileData?.location_precision ?? (m as any).location_precision,
          } as Match;
          return merged;
        });
        return next;
      });

      return merged;
    } catch (e) {
      return null;
    }
  }, []);

  return { matches, recordSwipe, swipeHistory, undoLastSwipe, refreshMatches, smartCount, lastMutualMatch, triggerMutualMatch, fetchProfileDetails } as const;
}
