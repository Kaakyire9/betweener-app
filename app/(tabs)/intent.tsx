import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIntentRequests, type IntentRequest, type IntentRequestType } from '@/hooks/useIntentRequests';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import { computeCompatibilityPercent } from '@/lib/compat/compatibility-score';
import { computeFirstReplyHours, computeInterestOverlapRatio, computeMatchScorePercent } from '@/lib/match/match-score';
import { readCache, writeCache } from '@/lib/persisted-cache';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IntentRequestSheet from '@/components/IntentRequestSheet';

type Direction = 'incoming' | 'sent';
type Filter = 'action' | 'all' | 'accepted' | 'passed';
type TypeFilter = 'all' | IntentRequestType;

type ProfileSnippet = {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  photos?: string[] | null;
  age?: number | null;
  location?: string | null;
  city?: string | null;
  region?: string | null;
  looking_for?: string | null;
  love_language?: string | null;
  personality_type?: string | null;
  religion?: string | null;
  wants_children?: string | null;
  smoking?: string | null;
  verification_level?: number | null;
};

type SuggestedMove = {
  id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  short_tags?: string[] | null;
  has_intro_video?: boolean | null;
  distance_km?: number | null;
};

const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const expiresIn = (iso?: string | null) => {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMs = Math.max(0, ts - Date.now());
  const hours = Math.ceil(diffMs / 3600000);
  return `${hours}h`;
};

const hoursUntil = (iso?: string | null) => {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return (ts - Date.now()) / 3600000;
};

const buildQuickReplyText = (opts: {
  name: string;
  itemType: IntentRequest['type'];
  note?: string | null;
  sharedInterests?: string[];
  location?: string | null;
}) => {
  const name = (opts.name || 'there').split(' ')[0];
  const shared = Array.isArray(opts.sharedInterests) ? opts.sharedInterests.filter(Boolean) : [];

  if (opts.itemType === 'date_request') {
    return `Hey ${name}! That sounds nice. When works for you?`;
  }

  if (opts.itemType === 'circle_intro') {
    if (shared[0]) return `Hey ${name}! I saw you in the circle. What's your vibe around ${shared[0]}?`;
    return `Hey ${name}! I saw you in the circle. What brought you here?`;
  }

  if (opts.itemType === 'like_with_note' && opts.note && opts.note.trim()) {
    return `Hey ${name}! Thanks for the note - ${opts.note.trim()}`;
  }

  if (shared[0]) {
    return `Hey ${name}! We both like ${shared[0]} - what's your favorite thing about it?`;
  }

  if (opts.location) {
    return `Hey ${name}! How's ${opts.location} treating you?`;
  }

  return `Hey ${name}! Nice to meet you - what are you looking for here?`;
};

const isExpired = (item: IntentRequest) => {
  if (item.status !== 'pending') return false;
  const ts = Date.parse(item.expires_at);
  return Number.isNaN(ts) ? false : ts < Date.now();
};

const typeLabel = (type: IntentRequest['type']) => {
  switch (type) {
    case 'connect':
      return 'Connect';
    case 'date_request':
      return 'Date';
    case 'like_with_note':
      return 'Note';
    case 'circle_intro':
      return 'Circle';
    default:
      return 'Request';
  }
};

const typeIcon = (type: IntentRequest['type']) => {
  switch (type) {
    case 'connect':
      return 'message-plus-outline';
    case 'date_request':
      return 'calendar-heart';
    case 'like_with_note':
      return 'text-box-plus-outline';
    case 'circle_intro':
      return 'account-group-outline';
    default:
      return 'inbox-outline';
  }
};

export default function IntentScreen() {
  const { user, profile } = useAuth();
  const { profileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const params = useLocalSearchParams<{ type?: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const currentProfileId = profileId;
  const { incoming, sent, loading, refresh } = useIntentRequests(currentProfileId);
  const [direction, setDirection] = useState<Direction>('incoming');
  const [filter, setFilter] = useState<Filter>('action');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [profiles, setProfiles] = useState<Record<string, ProfileSnippet>>({});
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [interestsByProfile, setInterestsByProfile] = useState<Record<string, string[]>>({});
  const [myProfile, setMyProfile] = useState<ProfileSnippet | null>(null);
  const [matchMetrics, setMatchMetrics] = useState<Record<string, { messageCount: number; firstReplyHours: number | null }>>({});
  const [suggestedMoves, setSuggestedMoves] = useState<SuggestedMove[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const suggestedLoadedRef = useRef(false);
  const suggestedCacheKey = useMemo(
    () => (currentProfileId ? `cache:suggested_moves:v1:${currentProfileId}` : null),
    [currentProfileId],
  );
  const suggestedCacheLoadedKeyRef = useRef<string | null>(null);
  const [intentSheetOpen, setIntentSheetOpen] = useState(false);
  const [intentTarget, setIntentTarget] = useState<{ id: string; name?: string | null } | null>(null);

  const upsertSignal = useCallback(
    async (targetId: string, opts?: { openedDelta?: number; liked?: boolean; dwellDelta?: number }) => {
      if (!currentProfileId || !targetId) return;
      const openedDelta = opts?.openedDelta ?? 0;
      const dwellDelta = opts?.dwellDelta ?? 0;
      const liked = opts?.liked === true ? true : null;
      await supabase.rpc('rpc_upsert_profile_signal', {
        p_profile_id: currentProfileId,
        p_target_profile_id: targetId,
        p_opened_delta: openedDelta,
        p_liked: liked,
        p_dwell_delta: dwellDelta,
      });
    },
    [currentProfileId],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    // Allow other screens to deep-link into a specific intent type.
    // Example: `router.push('/(tabs)/intent?type=like_with_note')`
    const raw = params?.type;
    if (typeof raw !== 'string' || raw.length === 0) return;
    const normalized = raw.trim();
    const allowed: TypeFilter[] = ['all', 'connect', 'date_request', 'like_with_note', 'circle_intro'];
    if ((allowed as string[]).includes(normalized)) {
      setTypeFilter(normalized as TypeFilter);
      return;
    }
    if (normalized === 'likes') setTypeFilter('like_with_note');
    if (normalized === 'dates') setTypeFilter('date_request');
    if (normalized === 'circles') setTypeFilter('circle_intro');
  }, [params?.type]);

  const relevantIds = useMemo(() => {
    const list = direction === 'incoming' ? incoming : sent;
    const ids = new Set<string>();
    list.forEach((item) => {
      const id = direction === 'incoming' ? item.actor_id : item.recipient_id;
      if (id) ids.add(String(id));
    });
    return Array.from(ids);
  }, [direction, incoming, sent]);

  useEffect(() => {
    let cancelled = false;
    const fetchProfiles = async () => {
      if (relevantIds.length === 0) {
        setProfiles({});
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id,user_id,full_name,avatar_url,photos,age,location,city,region,looking_for,love_language,personality_type,religion,wants_children,smoking,verification_level')
        .in('id', relevantIds);
      if (cancelled) return;
      const map: Record<string, ProfileSnippet> = {};
      (data || []).forEach((row: any) => {
        if (!row?.id) return;
        map[row.id] = row;
      });
      setProfiles(map);
    };
    void fetchProfiles();
    return () => {
      cancelled = true;
    };
  }, [relevantIds]);

  useEffect(() => {
    let cancelled = false;
    const fetchMyProfile = async () => {
      if (!currentProfileId) {
        setMyProfile(null);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id,looking_for,love_language,personality_type,religion,wants_children,smoking')
        .eq('id', currentProfileId)
        .maybeSingle();
      if (cancelled) return;
      setMyProfile((data as ProfileSnippet) || null);
    };
    void fetchMyProfile();
    return () => {
      cancelled = true;
    };
  }, [currentProfileId]);

  useEffect(() => {
    let cancelled = false;
    const fetchInterests = async () => {
      if (!currentProfileId && relevantIds.length === 0) {
        setInterestsByProfile({});
        setMyInterests([]);
        return;
      }
      const ids = Array.from(new Set([...(relevantIds || []), ...(currentProfileId ? [currentProfileId] : [])]));
      const { data } = await supabase
        .from('profile_interests')
        .select('profile_id, interests!inner(name)')
        .in('profile_id', ids);
      if (cancelled) return;
      const map: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        const pid = row?.profile_id;
        if (!pid) return;
        let names: string[] = [];
        if (Array.isArray(row.interests)) {
          names = row.interests.map((i: any) => i?.name).filter(Boolean);
        } else if (row.interests?.name) {
          names = [row.interests.name];
        }
        if (!map[pid]) map[pid] = [];
        map[pid] = [...map[pid], ...names];
      });
      setInterestsByProfile(map);
      if (currentProfileId && map[currentProfileId]) {
        setMyInterests(map[currentProfileId]);
      }
    };
    void fetchInterests();
    return () => {
      cancelled = true;
    };
  }, [currentProfileId, relevantIds]);

  const acceptedItems = useMemo(
    () => [...incoming, ...sent].filter((item) => item.status === 'accepted'),
    [incoming, sent],
  );

  const matchKeyFor = useCallback((a: string, b: string) => [a, b].sort().join('|'), []);

  const pendingMatchPairs = useMemo(() => {
    if (!user?.id || !currentProfileId) return [];
    const pairs: { key: string; peerUserId: string }[] = [];
    acceptedItems.forEach((item) => {
      const peerProfileId = item.actor_id === currentProfileId ? item.recipient_id : item.actor_id;
      const peer = profiles[peerProfileId];
      const peerUserId = peer?.user_id;
      if (!peerUserId) return;
      const key = matchKeyFor(user.id, peerUserId);
      if (matchMetrics[key]) return;
      pairs.push({ key, peerUserId });
    });
    return pairs;
  }, [acceptedItems, currentProfileId, matchKeyFor, matchMetrics, profiles, user?.id]);

  useEffect(() => {
    if (!user?.id || pendingMatchPairs.length === 0) return;
    let cancelled = false;
    const fetchMetrics = async () => {
      const updates: Record<string, { messageCount: number; firstReplyHours: number | null }> = {};
      for (const pair of pendingMatchPairs) {
        const { data, count } = await supabase
          .from('messages')
          .select('created_at,sender_id', { count: 'exact' })
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${pair.peerUserId}),and(sender_id.eq.${pair.peerUserId},receiver_id.eq.${user.id})`,
          )
          .order('created_at', { ascending: true })
          .limit(50);
        const messageRows = (data as any[] | null) ?? [];
        const messageCount = typeof count === 'number' ? count : messageRows.length;
        const firstReplyHours = computeFirstReplyHours(messageRows as any, user.id, pair.peerUserId);
        updates[pair.key] = { messageCount, firstReplyHours };
      }
      if (cancelled || Object.keys(updates).length === 0) return;
      setMatchMetrics((prev) => ({ ...prev, ...updates }));
    };
    void fetchMetrics();
    return () => {
      cancelled = true;
    };
  }, [pendingMatchPairs, user?.id]);

  const filtered = useMemo(() => {
    const list = direction === 'incoming' ? incoming : sent;
    if (direction === 'sent' && filter === 'action') return [];
    return list.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (filter === 'action') {
        return item.status === 'pending' && !isExpired(item);
      }
      if (filter === 'accepted') return item.status === 'accepted';
      if (filter === 'passed') return item.status === 'passed';
      return true;
    });
  }, [direction, filter, incoming, sent, typeFilter]);

  const sortedFiltered = useMemo(() => {
    const list = [...filtered];
    // Premium feel: "actionable" inbox prioritizes what will expire soonest.
    if (direction === 'incoming' && filter === 'action') {
      list.sort((a, b) => {
        const ha = hoursUntil(a.expires_at);
        const hb = hoursUntil(b.expires_at);
        const aKey = typeof ha === 'number' ? ha : Number.POSITIVE_INFINITY;
        const bKey = typeof hb === 'number' ? hb : Number.POSITIVE_INFINITY;
        if (aKey !== bKey) return aKey - bKey;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      });
      return list;
    }

    // Otherwise keep "newest first" as a reasonable default.
    list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return list;
  }, [direction, filter, filtered]);

  const hasPendingIncoming = useMemo(
    () => incoming.some((item) => item.status === 'pending' && !isExpired(item)),
    [incoming],
  );

  useEffect(() => {
    if (!currentProfileId || loading || suggestedLoadedRef.current) return;
    let cancelled = false;
    const loadSuggested = async () => {
      setSuggestedLoading(true);
      try {
        const { data, error } = await supabase.rpc('rpc_get_suggested_moves', {
          p_profile_id: currentProfileId,
          p_limit: 6,
        });
        if (cancelled) return;
        if (error) {
          console.log('[intent] suggested moves error', error);
        } else {
          const next = ((data as SuggestedMove[]) || []);
          setSuggestedMoves(next);
          if (suggestedCacheKey) void writeCache(suggestedCacheKey, next);
        }
        suggestedLoadedRef.current = true;
      } finally {
        if (!cancelled) setSuggestedLoading(false);
      }
    };
    void loadSuggested();
    return () => {
      cancelled = true;
    };
  }, [currentProfileId, loading, suggestedCacheKey]);

  // Cached-first: show last suggested moves immediately, then refresh in background.
  useEffect(() => {
    if (!suggestedCacheKey) return;
    if (suggestedCacheLoadedKeyRef.current === suggestedCacheKey) return;
    suggestedCacheLoadedKeyRef.current = suggestedCacheKey;

    let cancelled = false;
    (async () => {
      const cached = await readCache<SuggestedMove[]>(suggestedCacheKey, 10 * 60_000);
      if (cancelled || !cached || !Array.isArray(cached)) return;
      setSuggestedMoves((prev) => (prev.length === 0 ? cached : prev));
    })();

    return () => {
      cancelled = true;
    };
  }, [suggestedCacheKey]);

  const openChat = useCallback((peerId?: string | null, name?: string, avatar?: string | null, prefill?: string | null) => {
    if (!peerId) return;
    router.push({
      pathname: '/chat/[id]',
      params: { id: peerId, userName: name ?? '', userAvatar: avatar ?? '', prefill: prefill ?? '' },
    });
  }, []);

  const ensureMatch = useCallback(async (actorId: string, recipientId: string) => {
    const { data } = await supabase
      .from('matches')
      .select('id,status')
      .or(
        `and(user1_id.eq.${actorId},user2_id.eq.${recipientId}),and(user1_id.eq.${recipientId},user2_id.eq.${actorId})`,
      )
      .limit(1);

    if (data && data.length > 0) {
      const match = data[0];
      if (match.status !== 'ACCEPTED') {
        await supabase.from('matches').update({ status: 'ACCEPTED' }).eq('id', match.id);
      }
      return match.id;
    }

    const [user1, user2] = [actorId, recipientId].sort();
    const { data: inserted } = await supabase
      .from('matches')
      .insert({ user1_id: user1, user2_id: user2, status: 'ACCEPTED' })
      .select('id')
      .single();
    return inserted?.id;
  }, []);

  const acceptRequest = useCallback(
    async (item: IntentRequest) => {
      if (!user?.id) return;
      const expired = isExpired(item);
      if (expired) {
        return;
      }
      const { error: decideError } = await supabase.rpc('rpc_decide_intent_request', {
        p_request_id: item.id,
        p_decision: 'accept',
      });
      if (decideError) {
        console.log('[intent] accept request error', decideError);
        return;
      }
      const { error: systemError } = await supabase.rpc('rpc_insert_request_acceptance_system_messages', {
        p_request_id: item.id,
      });
      if (systemError) {
        console.log('[intent] system message error', systemError);
      }
      await ensureMatch(item.actor_id, item.recipient_id);
      const actor = profiles[item.actor_id];
      const peerInterests = Array.isArray(interestsByProfile[item.actor_id]) ? interestsByProfile[item.actor_id] : [];
      const shared = myInterests.length ? peerInterests.filter((i) => myInterests.includes(i)).slice(0, 2) : [];
      const reply = buildQuickReplyText({
        name: actor?.full_name || 'Someone',
        itemType: item.type,
        note: item.message ?? null,
        sharedInterests: shared,
        location: actor?.city || actor?.region || actor?.location || null,
      });
      openChat(item.actor_id, actor?.full_name || 'Request', actor?.avatar_url || null, reply);
      await refresh();
    },
    [ensureMatch, interestsByProfile, myInterests, openChat, profiles, refresh, user],
  );

  const passRequest = useCallback(async (item: IntentRequest) => {
    await supabase.rpc('rpc_decide_intent_request', { p_request_id: item.id, p_decision: 'pass' });
    await refresh();
  }, [refresh]);

  const cancelRequest = useCallback(async (item: IntentRequest) => {
    await supabase.rpc('rpc_cancel_intent_request', { p_request_id: item.id });
    await refresh();
  }, [refresh]);

  const renderItem = useCallback(
    ({ item }: { item: IntentRequest }) => {
      const isIncoming = direction === 'incoming';
      const peerId = isIncoming ? item.actor_id : item.recipient_id;
      const peer = profiles[peerId];
      const name = peer?.full_name || 'Someone';
      const location = peer?.city || peer?.region || peer?.location || '';
      const peerInterests = Array.isArray(interestsByProfile[peerId]) ? interestsByProfile[peerId] : [];
      const sharedInterests = myInterests.length
        ? peerInterests.filter((i) => myInterests.includes(i)).slice(0, 3)
        : [];
      const compatPct = myProfile
        ? computeCompatibilityPercent(
            {
              interests: myInterests,
              lookingFor: myProfile.looking_for,
              loveLanguage: myProfile.love_language,
              personalityType: myProfile.personality_type,
              religion: myProfile.religion,
              wantsChildren: myProfile.wants_children,
              smoking: myProfile.smoking,
            },
            {
              interests: peerInterests,
              lookingFor: peer?.looking_for,
              loveLanguage: peer?.love_language,
              personalityType: peer?.personality_type,
              religion: peer?.religion,
              wantsChildren: peer?.wants_children,
              smoking: peer?.smoking,
            },
          )
        : undefined;
      const isVerified = (profile?.verification_level ?? 0) >= 1 && (peer?.verification_level ?? 0) >= 1;
      const interestOverlapRatio = computeInterestOverlapRatio(myInterests, peerInterests) ?? undefined;
      const peerUserId = peer?.user_id;
      const matchKey = peerUserId && user?.id ? matchKeyFor(user.id, peerUserId) : null;
      const matchMetricsEntry = matchKey ? matchMetrics[matchKey] : undefined;
      const matchPct =
        item.status === 'accepted'
          ? computeMatchScorePercent({
              messageCount: matchMetricsEntry?.messageCount,
              firstReplyHours: matchMetricsEntry?.firstReplyHours,
              bothVerified: isVerified,
              interestOverlapRatio,
            })
          : null;
      const photos = Array.isArray(peer?.photos) ? peer?.photos.filter(Boolean) : [];
      const previewPhotos = photos.slice(0, 3);
      const timeLabel = timeAgo(item.created_at);
      const expiry = item.status === 'pending' && !isExpired(item) ? expiresIn(item.expires_at) : null;
      const hoursLeft = item.status === 'pending' && !isExpired(item) ? hoursUntil(item.expires_at) : null;
      const urgent = typeof hoursLeft === 'number' ? hoursLeft <= 6 : false;
      const quickReply = buildQuickReplyText({
        name,
        itemType: item.type,
        note: item.message ?? null,
        sharedInterests,
        location: location || null,
      });

      return (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            {peer?.avatar_url ? (
              <Image source={{ uri: peer.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <MaterialCommunityIcons name="account-circle" size={40} color={theme.textMuted} />
              </View>
            )}
            <View style={styles.rowInfo}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.meta}>{location || 'Location hidden'}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.typeBadge}>
                  <MaterialCommunityIcons name={typeIcon(item.type)} size={12} color={theme.tint} />
                  <Text style={styles.typeBadgeText}>{typeLabel(item.type)}</Text>
                </View>
                {typeof matchPct === 'number' ? (
                  <View style={styles.compatBadge}>
                    <MaterialCommunityIcons name="heart" size={12} color={theme.accent} />
                    <Text style={styles.compatBadgeText}>{`${matchPct}% Match`}</Text>
                  </View>
                ) : typeof compatPct === 'number' ? (
                  <View style={styles.compatBadge}>
                    <MaterialCommunityIcons name="star-four-points" size={12} color={theme.accent} />
                    <Text style={styles.compatBadgeText}>{`${compatPct}% Vibe`}</Text>
                  </View>
                ) : null}
                <Text style={styles.timeLabel}>{timeLabel}</Text>
                {expiry ? (
                  <View style={[styles.expiryPill, urgent && styles.expiryPillUrgent]}>
                    <MaterialCommunityIcons name={urgent ? 'timer-off-outline' : 'timer-outline'} size={12} color={urgent ? '#ef4444' : theme.accent} />
                    <Text style={[styles.expiryLabel, urgent && styles.expiryLabelUrgent]}>{`Expires in ${expiry}`}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>

          {item.message ? (
            <Text style={styles.message} numberOfLines={2}>
              {item.message}
            </Text>
          ) : null}

          {sharedInterests.length > 0 ? (
            <View style={styles.commonRow}>
              <Text style={styles.commonLabel}>Common:</Text>
              <View style={styles.commonChips}>
                {sharedInterests.map((tag) => (
                  <View key={tag} style={styles.commonChip}>
                    <Text style={styles.commonChipText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {previewPhotos.length > 0 ? (
            <View style={styles.photoRow}>
              {previewPhotos.map((uri, idx) => (
                <Image key={`${peerId}-${idx}`} source={{ uri }} style={styles.photoThumb} />
              ))}
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            {isIncoming && item.status === 'pending' && !isExpired(item) ? (
              <>
                <TouchableOpacity style={styles.primaryButton} onPress={() => acceptRequest(item)}>
                  <Text style={styles.primaryText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => passRequest(item)}>
                  <Text style={styles.secondaryText}>Pass</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostButton} onPress={() => openChat(peerId, name, peer?.avatar_url, quickReply)}>
                  <Text style={styles.ghostText}>Quick reply</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileButton}
                  onPress={() => router.push({ pathname: '/profile-view', params: { profileId: String(peerId) } })}
                >
                  <Text style={styles.profileText}>View Profile</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {!isIncoming && item.status === 'pending' && !isExpired(item) ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => cancelRequest(item)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
            ) : null}

            {item.status !== 'pending' ? (
              <TouchableOpacity style={styles.ghostButton} onPress={() => openChat(peerId, name, peer?.avatar_url)}>
                <Text style={styles.ghostText}>Message</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    },
    [
      acceptRequest,
      cancelRequest,
      direction,
      interestsByProfile,
      matchKeyFor,
      matchMetrics,
      myInterests,
      openChat,
      passRequest,
      profile?.verification_level,
      profiles,
      styles,
      theme.textMuted,
      user?.id,
    ],
  );

  const filters: { key: Filter; label: string }[] = [
    { key: 'action', label: 'Action' },
    { key: 'all', label: 'All' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'passed', label: 'Passed' },
  ];

  const emptyCopy = useMemo(() => {
    if (filter === 'action') return 'No requests right now.';
    if (filter === 'all') return 'Your requests feed is quiet.';
    return 'Nothing here yet.';
  }, [filter]);

  const handleSuggestedRequest = useCallback(
    (item: SuggestedMove) => {
      setIntentTarget({ id: item.id, name: item.full_name ?? null });
      setIntentSheetOpen(true);
    },
    [],
  );

  const handleIntentSent = useCallback(() => {
    if (!intentTarget?.id) return;
    void upsertSignal(intentTarget.id, { openedDelta: 1, liked: true, dwellDelta: 3 });
    setSuggestedMoves((prev) => prev.filter((item) => item.id !== intentTarget.id));
  }, [intentTarget?.id, upsertSignal]);

  const renderSuggestedCard = useCallback(
    ({ item }: { item: SuggestedMove }) => {
      const tags = Array.isArray(item.short_tags) ? item.short_tags.filter(Boolean).slice(0, 2) : [];
      return (
        <Pressable
          style={styles.suggestedCard}
          onPress={() => {
            void upsertSignal(item.id, { openedDelta: 0, dwellDelta: 1 });
          }}
        >
          <View style={styles.suggestedHeader}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.suggestedAvatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <MaterialCommunityIcons name="account-circle" size={40} color={theme.textMuted} />
              </View>
            )}
            <View style={styles.suggestedInfo}>
              <Text style={styles.suggestedName}>
                {`${item.full_name ?? 'Someone'}${item.age ? `, ${item.age}` : ''}`}
              </Text>
              {tags.length ? (
                <View style={styles.suggestedTags}>
                  {tags.map((tag) => (
                    <View key={`${item.id}-${tag}`} style={styles.suggestedTag}>
                      <Text style={styles.suggestedTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.suggestedActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => handleSuggestedRequest(item)}>
              <Text style={styles.primaryText}>Request</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                void upsertSignal(item.id, { openedDelta: 1, dwellDelta: 5 });
                router.push({ pathname: '/profile-view', params: { profileId: String(item.id) } });
              }}
            >
              <Text style={styles.secondaryText}>View profile</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      );
    },
    [handleSuggestedRequest, router, styles, theme.textMuted],
  );

  const shouldShowSuggested = direction === 'incoming' && suggestedMoves.length > 0;

  const typePills = useMemo(
    () =>
      [
        { key: 'all' as const, label: 'All', icon: 'layers-outline' },
        { key: 'like_with_note' as const, label: 'Likes', icon: 'heart-outline' },
        { key: 'connect' as const, label: 'Connect', icon: 'message-plus-outline' },
        { key: 'date_request' as const, label: 'Dates', icon: 'calendar-heart' },
        { key: 'circle_intro' as const, label: 'Circles', icon: 'account-group-outline' },
      ] as const,
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Intent</Text>
          <Text style={styles.headerSubtitle}>Likes, requests, and introductions.</Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.togglePill, direction === 'incoming' && styles.togglePillActive]}
          onPress={() => setDirection('incoming')}
        >
          <Text style={[styles.toggleText, direction === 'incoming' && styles.toggleTextActive]}>Incoming</Text>
        </Pressable>
        <Pressable
          style={[styles.togglePill, direction === 'sent' && styles.togglePillActive]}
          onPress={() => setDirection('sent')}
        >
          <Text style={[styles.toggleText, direction === 'sent' && styles.toggleTextActive]}>Sent</Text>
        </Pressable>
      </View>

      <View style={styles.typeRow}>
        {typePills.map((pill) => {
          const active = pill.key === typeFilter;
          return (
            <Pressable
              key={pill.key}
              style={[styles.typePill, active && styles.typePillActive]}
              onPress={() => setTypeFilter(pill.key)}
            >
              <MaterialCommunityIcons
                name={pill.icon as any}
                size={16}
                color={active ? Colors.light.background : theme.textMuted}
              />
              <Text style={[styles.typeText, active && styles.typeTextActive]}>{pill.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filterRow}>
        {filters.map((pill) => {
          const active = pill.key === filter;
          return (
            <Pressable
              key={pill.key}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => setFilter(pill.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{pill.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={sortedFiltered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        extraData={sortedFiltered.length}
        ListFooterComponent={
          shouldShowSuggested ? (
            <View style={styles.suggestedSection}>
              <View style={styles.suggestedTitleRow}>
                <Text style={styles.suggestedTitle}>Suggested moves</Text>
                <Text style={styles.suggestedSubtitle}>Based on what you have been exploring</Text>
              </View>
              <FlatList
                data={suggestedMoves}
                keyExtractor={(item) => item.id}
                renderItem={renderSuggestedCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestedList}
                removeClippedSubviews
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <Text style={styles.emptyText}>Loading requests...</Text>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{emptyCopy}</Text>
              {filter === 'action' && direction === 'incoming' && !hasPendingIncoming ? (
                <Text style={styles.emptyHint}>Make the first move.</Text>
              ) : null}
              <View style={styles.emptyActions}>
                <TouchableOpacity style={styles.ghostButton} onPress={() => router.push('/(tabs)/vibes')}>
                  <Text style={styles.ghostText}>Go to Vibes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(tabs)/explore')}>
                  <Text style={styles.secondaryText}>Explore Circles</Text>
                </TouchableOpacity>
              </View>
              {!loading && direction === 'incoming' && !hasPendingIncoming && suggestedMoves.length === 0 && !suggestedLoading ? (
                <View style={styles.emptyStateMuted}>
                  <Text style={styles.emptyText}>Nothing yet -- but you are early.</Text>
                  <Text style={styles.emptyHint}>Post a Moment or explore Vibes to spark new requests.</Text>
                </View>
              ) : null}
            </View>
          )
        }
      />

      <IntentRequestSheet
        visible={intentSheetOpen}
        onClose={() => setIntentSheetOpen(false)}
        recipientId={intentTarget?.id}
        recipientName={intentTarget?.name ?? null}
        onSent={handleIntentSent}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
    headerTitle: { fontSize: 30, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { marginTop: 6, fontSize: 12, color: theme.textMuted },
    toggleRow: { flexDirection: 'row', paddingHorizontal: 18, gap: 10, marginTop: 10 },
    togglePill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    togglePillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    toggleText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    toggleTextActive: { color: Colors.light.background },
    typeRow: { flexDirection: 'row', paddingHorizontal: 18, gap: 10, marginTop: 12, flexWrap: 'wrap' },
    typePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    typePillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    typeText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    typeTextActive: { color: Colors.light.background },
    filterRow: { flexDirection: 'row', paddingHorizontal: 18, gap: 10, marginTop: 10 },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    filterPillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    filterText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    filterTextActive: { color: Colors.light.background },
    listContent: { padding: 18, paddingBottom: 40, gap: 12 },
    card: {
      padding: 14,
      borderRadius: 18,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundSubtle },
    avatarFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    rowInfo: { flex: 1 },
    name: { fontSize: 14, fontWeight: '700', color: theme.text },
    meta: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      rowGap: 6,
      flexWrap: 'wrap',
      marginTop: 6,
    },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
    },
    typeBadgeText: { fontSize: 11, color: theme.tint, fontWeight: '600' },
    compatBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(125, 91, 166, 0.12)' : 'rgba(125, 91, 166, 0.08)',
    },
    compatBadgeText: { fontSize: 11, color: theme.accent, fontWeight: '600' },
    timeLabel: { fontSize: 11, color: theme.textMuted },
    expiryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(125, 91, 166, 0.10)' : 'rgba(125, 91, 166, 0.07)',
    },
    expiryPillUrgent: {
      borderColor: 'rgba(239, 68, 68, 0.55)',
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
    },
    expiryLabel: { fontSize: 11, color: theme.accent, fontWeight: '600' },
    expiryLabelUrgent: { color: '#ef4444' },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    statusText: { fontSize: 10, color: theme.textMuted, textTransform: 'capitalize' },
    message: { marginTop: 10, fontSize: 13, color: theme.text },
    commonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    commonLabel: { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
    commonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    commonChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    commonChipText: { fontSize: 11, color: theme.text },
    photoRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    photoThumb: {
      width: 52,
      height: 52,
      borderRadius: 10,
      backgroundColor: theme.backgroundSubtle,
    },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
    primaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    primaryText: { color: Colors.light.background, fontWeight: '700' },
    secondaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    secondaryText: { color: theme.text, fontWeight: '600' },
    ghostButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    ghostText: { color: theme.tint, fontWeight: '600' },
    profileButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.tint,
      backgroundColor: theme.background,
    },
    profileText: { color: theme.tint, fontWeight: '700' },
    emptyState: { marginTop: 20, gap: 12, alignItems: 'center' },
    emptyText: { fontSize: 13, color: theme.textMuted, textAlign: 'center' },
    emptyHint: { fontSize: 12, color: theme.textMuted, textAlign: 'center' },
    emptyActions: { flexDirection: 'row', gap: 10 },
    emptyStateMuted: { marginTop: 12, gap: 6, alignItems: 'center' },
    suggestedSection: { marginTop: 16, gap: 12 },
    suggestedTitleRow: { gap: 4, paddingHorizontal: 2 },
    suggestedTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    suggestedSubtitle: { fontSize: 11, color: theme.textMuted },
    suggestedList: { paddingVertical: 4, gap: 12 },
    suggestedCard: {
      width: 240,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      marginRight: 12,
    },
    suggestedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    suggestedAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundSubtle },
    suggestedInfo: { flex: 1, gap: 6 },
    suggestedName: { fontSize: 13, fontWeight: '700', color: theme.text },
    suggestedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    suggestedTag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    suggestedTagText: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
    suggestedActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  });
