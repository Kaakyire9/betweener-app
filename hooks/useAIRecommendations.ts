import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { Match } from '@/types/match';
import { supabase } from '@/lib/supabase';

// lightweight mock generator (expandable)
function createMockMatches(): Match[] {
  const now = Date.now();
  const threeHoursMs = 3 * 60 * 60 * 1000;
  return [
    {
      id: 'm-001',
      name: 'Sena',
      age: 29,
      tagline: 'Coffee + trails = perfect weekend',
      interests: ['Hiking', 'Coffee', 'Design'],
      avatar_url: 'https://images.unsplash.com/photo-1545996124-8e6f5b9e2f6d?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '1.2 km away',
      isActiveNow: false,
      lastActive: new Date(now - 30 * 60 * 1000).toISOString(), // 30m ago
      verified: true,
      personalityTags: ['Calm', 'Family Oriented', 'Goal Driven'],
      aiScore: 92,
    } as Match,
    {
      id: 'm-002',
      name: 'Daniel',
      age: 31,
      tagline: 'Weekend coder, weekday dad',
      interests: ['Technology', 'Cooking', 'Running'],
      avatar_url: 'https://images.unsplash.com/photo-1544005313-1d1d3a2b7f9a?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '6.8 km away',
      isActiveNow: true,
      lastActive: new Date(now - 2 * 60 * 1000).toISOString(), // 2m ago
      verified: false,
      personalityTags: ['Goal Driven', 'Adventurous'],
      aiScore: 87,
    } as Match,
    {
      id: 'm-003',
      name: 'Esi',
      age: 26,
      tagline: 'Painter, coffee snob, plant parent',
      interests: ['Art', 'Plants', 'Travel'],
      avatar_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '3.4 km away',
      isActiveNow: false,
      lastActive: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago (recent)
      verified: false,
      personalityTags: ['Creative', 'Curious', 'Calm'],
      aiScore: 78,
    } as Match,
    {
      id: 'm-004',
      name: 'Kofi',
      age: 28,
      tagline: 'Music producer & night market fan',
      interests: ['Music', 'Food', 'Photography'],
      avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '12.1 km away',
      isActiveNow: false,
      lastActive: new Date(now - (5 * 60 * 60 * 1000)).toISOString(), // 5 hours ago
      verified: true,
      personalityTags: ['Outgoing', 'Family Oriented'],
      aiScore: 65,
    } as Match,
    {
      id: 'm-005',
      name: 'Abena',
      age: 24,
      tagline: 'Bookshop evenings and plant swaps',
      interests: ['Books', 'Gardening', 'Design'],
      avatar_url: 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=800&q=80&auto=format&fit=crop&crop=face',
      distance: '9.9 km away',
      isActiveNow: false,
      lastActive: new Date(now - (20 * 60 * 60 * 1000)).toISOString(), // 20 hours ago
      verified: false,
      personalityTags: ['Thoughtful', 'Calm'],
      aiScore: 71,
    } as Match,
  ];
}
// helper to return mock matches with optional dev-only injections
function getDebugMockMatches(): Match[] {
  const list = createMockMatches();
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    try {
      if (list[0]) (list[0] as any).personalityTags = ['Calm', 'Family Oriented', 'Goal Driven'];
      if (list[1]) (list[1] as any).personalityTags = ['Adventurous', 'Curious'];
    } catch (e) {}
  }
  return list;
}

export default function useAIRecommendations(userId?: string, opts?: { mutualMatchTestIds?: string[] }) {
  // Start empty; prefer server-sourced profiles. Mocks are only a fallback
  // when the server cannot be reached.
  const [matches, setMatches] = useState<Match[]>([]);
  const [lastMutualMatch, setLastMutualMatch] = useState<Match | null>(null);
  const [swipeHistory, setSwipeHistory] = useState<Array<{ id: string; action: 'like' | 'dislike' | 'superlike'; index: number; match: Match }>>([]);
  const mountedRef = useRef(true);

  // simple mock: when a swipe is recorded, remove the head and append a regenerated match
  const recordSwipe = useCallback((id: string, action: 'like' | 'dislike' | 'superlike', index = 0) => {
    setSwipeHistory((prev) => {
      const head = matches[0];
      if (!head) return prev;
      return [...prev, { id, action, index, match: head }];
    });
    setMatches((prev: Match[]) => {
      const next = prev.slice(1);
      // append a regenerated match to keep list length stable (mock behavior)
      const generated: Match = {
        id: String(Date.now()),
        name: `New-${Math.floor(Math.random() * 1000)}`,
        age: 20 + Math.floor(Math.random() * 12),
        interests: ['Music', 'Movies'],
        avatar_url: prev[0]?.avatar_url,
        distance: '',
      } as Match;
      return [...next, generated];
    });
    // Persist the swipe to Supabase if configured and we have a userId
    (async () => {
      try {
        if (!userId) return;
        // insert swipe record
        const { error: insertErr } = await supabase
          .from('swipes')
          .insert([{
            swiper_id: userId,
            target_id: id,
            action: action === 'superlike' ? 'SUPERLIKE' : action === 'like' ? 'LIKE' : 'DISLIKE',
            created_at: new Date().toISOString(),
          }]);
        if (insertErr) {
          console.log('[recordSwipe] failed to insert swipe', insertErr);
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
            // fetch profile for the matched user
            const { data: profileData } = await supabase.from('profiles').select('*').eq('id', id).limit(1).single();
            if (profileData) {
              // Ensure a match record exists for this pair
              try {
                const sorted = [userId, id].sort(); // enforce deterministic ordering
                const { error: upsertErr } = await supabase
                  .from('matches')
                .upsert([{
                  user1_id: sorted[0],
                  user2_id: sorted[1],
                  status: 'ACCEPTED',
                  updated_at: new Date().toISOString(),
                }], { onConflict: 'user1_id,user2_id' });
              if (upsertErr) {
                console.log('[recordSwipe] match upsert error', upsertErr);
              }

              // Also update any existing row regardless of user ordering
              const { error: updateErr } = await supabase
                .from('matches')
                .update({
                  status: 'ACCEPTED',
                  updated_at: new Date().toISOString(),
                })
                .or(`and(user1_id.eq.${sorted[0]},user2_id.eq.${sorted[1]}),and(user1_id.eq.${sorted[1]},user2_id.eq.${sorted[0]})`);
                if (updateErr) {
                  console.log('[recordSwipe] match status update error', updateErr);
                }
              } catch (e) {
                console.log('[recordSwipe] match upsert/update threw', e);
              }

              // Fetch interests for the matched profile (profile_interests table)
              let matchedInterests: string[] = [];
              try {
                const { data: piRows, error: piErr } = await supabase
                  .from('profile_interests')
                  .select('profile_id, interests ( name )')
                  .eq('profile_id', id);
                if (!piErr && Array.isArray(piRows) && piRows.length > 0) {
                  for (const r of piRows as any[]) {
                    const arr = Array.isArray(r.interests) ? r.interests.map((i: any) => i.name).filter(Boolean) : [];
                    matchedInterests = matchedInterests.concat(arr);
                  }
                }
              } catch (e) {
                // ignore interests fetch errors
              }

              const matched: Match = {
                id: profileData.id,
                name: profileData.full_name || profileData.user_id || String(profileData.id),
                age: profileData.age,
                tagline: profileData.bio || '',
                interests: matchedInterests || [],
                avatar_url: profileData.avatar_url || undefined,
                distance: profileData.location || '',
                isActiveNow: !!profileData.is_active,
                lastActive: profileData.last_active,
                verified: !!profileData.verified,
                personalityTags: profileData.personality_tags || [],
                aiScore: profileData.ai_score || 0,
                profileVideo: profileData.profile_video || undefined,
              } as Match;
              setLastMutualMatch(matched);
              setTimeout(() => setLastMutualMatch(null), 10_000);
            } else {
              // fallback: surface the swiped match from local list
              const swipeMatch = matches.find((m) => String(m.id) === String(id));
              if (swipeMatch) {
                setLastMutualMatch(swipeMatch);
                setTimeout(() => setLastMutualMatch(null), 10_000);
              }
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
  useEffect(() => {
    if (!userId) return;

    const handleMatchChange = async (payload: any) => {
      try {
        const row = payload?.new;
        if (!row) return;
        if (row.user1_id !== userId && row.user2_id !== userId) return;
        if (row.status && String(row.status).toUpperCase() !== 'ACCEPTED') return; // only surface accepted matches
        const otherId = row.user1_id === userId ? row.user2_id : row.user1_id;

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
        const { data: profileData, error: pErr } = await supabase
          .from('profiles')
          .select('id, full_name, bio, age, avatar_url, region, tribe, religion, personality_tags')
          .eq('id', otherId)
          .limit(1)
          .single();
        if (pErr || !profileData) {
          console.log('[matches realtime] profile fetch error', pErr);
          // fallback: surface the match from local list if present
          const swipeMatch = matches.find((m) => String(m.id) === String(otherId));
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
          personalityTags: Array.isArray(profileData.personality_tags)
            ? profileData.personality_tags.map((t: any) => (typeof t === 'string' ? t : t?.name || String(t)))
            : [],
          profileVideo: undefined,
          tribe: profileData.tribe,
          religion: profileData.religion,
          region: profileData.region,
        } as Match;

        console.log('[matches realtime] received accepted match', { otherId });
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, handleMatchChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, handleMatchChange);

    try { channel.subscribe(); } catch {}
    return () => {
      try { channel.unsubscribe(); } catch {}
    };
  }, [userId]);

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
      console.log('[useAIRecommendations] fetchMatchesFromServer starting', { userId });
      // If Supabase is configured and we have a user id, fetch profiles
      if (supabase && userId) {
        // The `profiles` table may vary across environments. Try an
        // extended select first (includes optional fields). If it fails
        // due to missing columns (Postgres error 42703), retry with a
        // minimal safe column list to avoid falling back to mocks.
        const extendedSelect =
          'id, user_id, full_name, age, bio, avatar_url, location, latitude, longitude, region, tribe, religion, profile_video, personality_tags, verified, is_active, last_active, ai_score';
        const minimalSelect = 'id, user_id, full_name, age, bio, avatar_url, location, latitude, longitude, region, tribe, religion';

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
              .select('profile_id, interests ( name )')
              .in('profile_id', profileIds);
            if (!piErr && Array.isArray(piData)) {
              for (const row of piData as any[]) {
                const pid = row.profile_id;
                const arr = Array.isArray(row.interests) ? row.interests.map((i: any) => i.name).filter(Boolean) : [];
                interestsMap[pid] = arr;
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
            if ((!interestsArr || interestsArr.length === 0) && (p.region || p.tribe)) {
              const fall = [p.region, p.tribe].filter(Boolean).slice(0, 3) as string[];
              interestsArr = fall;
            }

            // compute distance when we have coordinates; otherwise fall back to stored location label
            let distanceStr = '';
            if (userCoords && p.latitude != null && p.longitude != null && userCoords.latitude != null && userCoords.longitude != null) {
              try {
                const km = haversineKm(userCoords.latitude!, userCoords.longitude!, Number(p.latitude), Number(p.longitude));
                if (km < 1) distanceStr = `${Math.round(km * 1000)} m away`;
                else distanceStr = `${km.toFixed(1)} km away`;
              } catch (e) {
                distanceStr = '';
              }
            } else if (p.location) {
              distanceStr = p.location;
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
              isActiveNow: !!p.is_active,
              lastActive: p.last_active,
              verified: !!p.verified,
              personalityTags: ptags || [],
              aiScore: typeof p.ai_score === 'number' ? p.ai_score : undefined,
              profileVideo: p.profile_video || undefined,
              tribe: p.tribe,
              religion: p.religion,
              region: p.region,
              current_country: p.current_country,
              location_precision: p.location_precision,
            } as Match);
          });
          setMatches(mapped);
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
      // fall through to mocks
    }
    // If we reached here it means a server fetch was attempted and failed
    // (or returned no profiles). Use debug mocks as a fallback only in
    // that case to preserve developer QA flows.
    console.log('[useAIRecommendations] using debug mock fallback');
    setMatches(() => getDebugMockMatches());
  }, [userId]);

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
        .select('id, profile_video, personality_tags, latitude, longitude, region, tribe, religion, current_country, location_precision')
        .eq('id', profileId)
        .limit(1)
        .single();

      // fetch interests for this profile
      let interestsArr: string[] = [];
      try {
        const { data: piRows, error: piErr } = await supabase
          .from('profile_interests')
          .select('profile_id, interests ( name )')
          .eq('profile_id', profileId);
        if (!piErr && Array.isArray(piRows) && piRows.length > 0) {
          for (const r of piRows as any[]) {
            const arr = Array.isArray(r.interests) ? r.interests.map((i: any) => i.name).filter(Boolean) : [];
            interestsArr = interestsArr.concat(arr);
          }
        }
      } catch (e) {}

      // merge into existing matches
      let merged: any = null;
      setMatches((prev) => {
        const next = prev.map((m) => {
          if (String(m.id) !== String(profileId)) return m;
          const personality = Array.isArray(profileData?.personality_tags)
            ? profileData!.personality_tags.map((t: any) => (typeof t === 'string' ? t : t?.name || String(t)))
            : (m as any).personalityTags || [];
          const interestsFinal = (interestsArr && interestsArr.length > 0) ? interestsArr : ((m as any).interests && (m as any).interests.length > 0 ? (m as any).interests : [profileData?.region, profileData?.tribe].filter(Boolean));
          merged = {
            ...m,
            profileVideo: profileData?.profile_video || (m as any).profileVideo,
            personalityTags: personality,
            interests: interestsFinal,
            tribe: profileData?.tribe ?? (m as any).tribe,
            religion: profileData?.religion ?? (m as any).religion,
            region: profileData?.region ?? (m as any).region,
            current_country: profileData?.current_country ?? (m as any).current_country,
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
