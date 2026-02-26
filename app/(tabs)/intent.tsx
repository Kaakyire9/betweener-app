import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIntentRequests, type IntentRequest, type IntentRequestType } from '@/hooks/useIntentRequests';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import { computeCompatibilityPercent } from '@/lib/compat/compatibility-score';
import { computeFirstReplyHours, computeInterestOverlapRatio, computeMatchScorePercent } from '@/lib/match/match-score';
import { Motion } from '@/lib/motion';
import { readCache, writeCache } from '@/lib/persisted-cache';
import { supabase } from '@/lib/supabase';
import AnimatedPressable from '@/components/motion/AnimatedPressable';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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

function CheckPulse({
  active,
  tint,
}: {
  active: boolean;
  tint: string;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    t.value = 0;
    t.value = withSequence(
      withTiming(1, { duration: Motion.duration.base, easing: Motion.easing.outCubic }),
      withTiming(0, { duration: Motion.duration.slow, easing: Motion.easing.outCubic }),
    );
  }, [active, t]);

  const style = useAnimatedStyle(() => {
    const v = t.value;
    const scale = 0.92 + v * 0.18;
    return {
      opacity: v,
      transform: [{ scale }],
    };
  }, [t]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          right: 10,
          top: '50%',
          marginTop: -12,
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.22)',
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="check" size={16} color={tint} />
    </Animated.View>
  );
}

function PillPulse({
  active,
  reduceMotion,
  color,
}: {
  active: boolean;
  reduceMotion: boolean;
  color: string;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (!active || reduceMotion) return;
    t.value = 0;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.duration.slow, easing: Motion.easing.outCubic }),
        withTiming(0, { duration: Motion.duration.slow, easing: Motion.easing.outCubic }),
      ),
      -1,
      false,
    );
  }, [active, reduceMotion, t]);

  const style = useAnimatedStyle(() => {
    const v = reduceMotion ? 0 : t.value;
    const scale = 1 + v * 0.18;
    return {
      opacity: 0.22 * v,
      transform: [{ scale }],
    };
  }, [reduceMotion, t]);

  if (!active || reduceMotion) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -3,
          bottom: -3,
          left: -6,
          right: -6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: color,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    />
  );
}

const formatDistance = (km?: number | null) => {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return null;
  if (km >= 1000) return 'Long-distance';
  if (km >= 100) return `${Math.round(km)} km away`;
  return `${km.toFixed(1)} km away`;
};

const buildMovePrompt = (item: SuggestedMove) => {
  const tags = Array.isArray(item.short_tags) ? item.short_tags : [];
  if (item.has_intro_video || tags.includes('Intro video')) return 'Open with their intro video.';
  if (tags.includes('Shared interests')) return 'Ask about something you both like.';
  if (tags.includes('Active now')) return 'Send a quick hello while they are online.';
  return 'Send a short, confident opener.';
};

const buildOpenerText = (item: SuggestedMove) => {
  const full = (item.full_name ?? '').trim();
  const first = (full.split(/\s+/)[0] || 'there').slice(0, 20);
  const tags = Array.isArray(item.short_tags) ? item.short_tags : [];

  if (item.has_intro_video || tags.includes('Intro video')) {
    return `Hi ${first} - I watched your intro video. What is something you are into lately?`;
  }
  if (tags.includes('Shared interests')) {
    return `Hi ${first} - I noticed we share some interests. What is your favorite one right now?`;
  }
  if (tags.includes('Active now')) {
    return `Hi ${first} - are you around right now? I would love to connect.`;
  }
  return `Hi ${first} - your profile stood out. What are you looking for on here?`;
};

const buildIntentType = (item: SuggestedMove): IntentRequestType => {
  const tags = Array.isArray(item.short_tags) ? item.short_tags : [];
  if (tags.includes('Shared interests')) return 'like_with_note';
  return 'connect';
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

function SegmentedToggle({
  value,
  onChange,
  reduceMotion,
  styles,
}: {
  value: Direction;
  onChange: (next: Direction) => void;
  reduceMotion: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const width = useSharedValue(0);
  const indicatorX = useSharedValue(0);
  const gap = 10;

  useEffect(() => {
    const w = width.value;
    if (!w) return;
    const pillW = (w - gap) / 2;
    const target = value === 'sent' ? pillW + gap : 0;
    if (reduceMotion) {
      indicatorX.value = target;
    } else {
      const dir = target > indicatorX.value ? 1 : -1;
      const overshoot = 2 * dir;
      indicatorX.value = withSequence(
        withTiming(target + overshoot, { duration: Motion.duration.fast, easing: Motion.easing.outCubic }),
        withSpring(target, { ...Motion.spring, damping: 22, stiffness: 210 }),
      );
    }
  }, [indicatorX, reduceMotion, value, width]);

  const indicatorStyle = useAnimatedStyle(() => {
    const w = width.value;
    const pillW = w ? (w - gap) / 2 : 0;
    return {
      width: pillW,
      transform: [{ translateX: indicatorX.value }],
    };
  }, [indicatorX, width]);

  return (
    <View
      style={styles.toggleRow}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        width.value = w;
        const pillW = (w - gap) / 2;
        const target = value === 'sent' ? pillW + gap : 0;
        indicatorX.value = reduceMotion ? target : withTiming(target, { duration: Motion.duration.base, easing: Motion.easing.outCubic });
      }}
    >
      <Animated.View pointerEvents="none" style={[styles.toggleIndicator, indicatorStyle]} />

      <AnimatedPressable
        reduceMotion={reduceMotion}
        onPress={() => {
          if (value !== 'incoming') void Haptics.selectionAsync();
          onChange('incoming');
        }}
        style={[styles.togglePill, value === 'incoming' && styles.togglePillActiveGhost]}
      >
        <Text style={[styles.toggleText, value === 'incoming' && styles.toggleTextActive]}>{'Incoming'}</Text>
      </AnimatedPressable>

      <AnimatedPressable
        reduceMotion={reduceMotion}
        onPress={() => {
          if (value !== 'sent') void Haptics.selectionAsync();
          onChange('sent');
        }}
        style={[styles.togglePill, value === 'sent' && styles.togglePillActiveGhost]}
      >
        <Text style={[styles.toggleText, value === 'sent' && styles.toggleTextActive]}>{'Sent'}</Text>
      </AnimatedPressable>
    </View>
  );
}

function AnimatedChip({
  label,
  icon,
  active,
  onPress,
  reduceMotion,
  theme,
  activeFill = true,
}: {
  label: string;
  icon?: string;
  active: boolean;
  onPress: () => void;
  reduceMotion: boolean;
  theme: typeof Colors.light;
  activeFill?: boolean;
}) {
  const t = useSharedValue(active ? 1 : 0);
  const pop = useSharedValue(1);
  const chipStyles = useMemo(() => chipBaseStyles, []);

  useEffect(() => {
    if (reduceMotion) {
      t.value = active ? 1 : 0;
      pop.value = 1;
      return;
    }

    t.value = withTiming(active ? 1 : 0, { duration: Motion.duration.base, easing: Motion.easing.outCubic });
    if (active) {
      pop.value = withSequence(
        withTiming(Motion.transform.popScale, { duration: Motion.duration.fast, easing: Motion.easing.outCubic }),
        withSpring(1, Motion.spring),
      );
    } else {
      pop.value = 1;
    }
  }, [active, pop, reduceMotion, t]);

  const chipStyle = useAnimatedStyle(() => {
    const bgFrom = theme.backgroundSubtle;
    const bgTo = activeFill ? theme.tint : theme.backgroundSubtle;
    const borderFrom = theme.outline;
    const borderTo = activeFill ? theme.tint : theme.outline;

    return {
      backgroundColor: interpolateColor(t.value, [0, 1], [bgFrom, bgTo]),
      borderColor: interpolateColor(t.value, [0, 1], [borderFrom, borderTo]),
      transform: reduceMotion ? [] : [{ scale: pop.value }],
    };
  }, [activeFill, reduceMotion, theme]);

  const textStyle = useAnimatedStyle(() => {
    const from = theme.textMuted;
    const to = Colors.light.background;
    return {
      color: interpolateColor(t.value, [0, 1], [from, to]),
    };
  }, [theme]);

  return (
    <AnimatedPressable
      reduceMotion={reduceMotion}
      onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      onPress={onPress}
    >
      <Animated.View style={[chipStyles.container, chipStyle]}>
        {icon ? (
          <MaterialCommunityIcons
            name={icon as any}
            size={16}
            color={activeFill && active ? Colors.light.background : theme.textMuted}
          />
        ) : null}
        <Animated.Text style={[chipStyles.text, textStyle]}>{label}</Animated.Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

const chipBaseStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
  },
  text: { fontSize: 12, lineHeight: 14, paddingBottom: 1, fontWeight: '600' },
});

export default function IntentScreen() {
  const { user, profile } = useAuth();
  const { profileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const params = useLocalSearchParams<{ type?: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const reduceMotion = useReduceMotion();

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
  const [suggestedError, setSuggestedError] = useState<string | null>(null);
  const [suggestedRetryKey, setSuggestedRetryKey] = useState(0);
  const [suggestedExpanded, setSuggestedExpanded] = useState(false);
  const suggestedEnter = useSharedValue(0);
  const emptyBreath = useSharedValue(1);
  const suggestedLoadedRef = useRef(false);
  const suggestedCacheKey = useMemo(
    () => (currentProfileId ? `cache:suggested_moves:v2:${currentProfileId}` : null),
    [currentProfileId],
  );
  const suggestedCacheLoadedKeyRef = useRef<string | null>(null);
  const [intentSheetOpen, setIntentSheetOpen] = useState(false);
  const [intentTarget, setIntentTarget] = useState<{ id: string; name?: string | null } | null>(null);
  const [intentPrefill, setIntentPrefill] = useState<string | null>(null);
  const [intentDefaultType, setIntentDefaultType] = useState<IntentRequestType>('connect');
  const [suggestedSend, setSuggestedSend] = useState<{ id: string | null; phase: 'idle' | 'loading' | 'success' }>({
    id: null,
    phase: 'idle',
  });
  const suggestedSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

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

  const showEmpty = !loading && sortedFiltered.length === 0;
  const [loadingStuck, setLoadingStuck] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingStuck(false);
      return;
    }
    const t = setTimeout(() => setLoadingStuck(true), 9000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!showEmpty || reduceMotion) {
      emptyBreath.value = 1;
      return;
    }
    emptyBreath.value = 0.85;
    emptyBreath.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Motion.easing.outCubic }),
      -1,
      true,
    );
  }, [emptyBreath, reduceMotion, showEmpty]);

  useEffect(() => {
    if (!currentProfileId || loading || suggestedLoadedRef.current) return;
    let cancelled = false;
    const loadSuggested = async () => {
      setSuggestedLoading(true);
      setSuggestedError(null);
      try {
        const { data, error } = await supabase.rpc('rpc_get_suggested_moves', {
          p_profile_id: currentProfileId,
          p_limit: 6,
        });
        if (cancelled) return;
        if (error) {
          console.log('[intent] suggested moves error', error);
          setSuggestedError(error.message || 'Could not load suggestions.');
        } else {
          const next = ((data as SuggestedMove[]) || []);
          setSuggestedMoves(next);
          if (suggestedCacheKey) void writeCache(suggestedCacheKey, next);
        }
        // Prevent retry loops; the UI provides an explicit retry/refresh action.
        suggestedLoadedRef.current = true;
      } finally {
        if (!cancelled) setSuggestedLoading(false);
      }
    };
    void loadSuggested();
    return () => {
      cancelled = true;
    };
  }, [currentProfileId, loading, suggestedCacheKey, suggestedRetryKey]);

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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const resendIntent = useCallback(
    (peerId: string, peerName: string | null, intentType: IntentRequestType, prefill: string | null) => {
      setIntentTarget({ id: peerId, name: peerName });
      setIntentDefaultType(intentType);
      setIntentPrefill(prefill);
      setIntentSheetOpen(true);
    },
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: IntentRequest; index: number }) => {
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
      const lastChance = typeof hoursLeft === 'number' ? hoursLeft <= 0.5 : false;
      const quickReply = buildQuickReplyText({
        name,
        itemType: item.type,
        note: item.message ?? null,
        sharedInterests,
        location: location || null,
      });

      const pendingExpired = item.status === 'pending' && isExpired(item);
      const actionable = item.status === 'pending' && !isExpired(item);
      const canMessage = item.status === 'accepted';
      const canResend = !isIncoming && item.status !== 'pending' && item.status !== 'accepted';
      const statusLabel =
        pendingExpired
          ? 'Expired'
          : item.status === 'pending'
            ? (isIncoming ? 'New' : 'Sent')
            : item.status === 'accepted'
              ? 'Accepted'
              : item.status;
      const statusTone =
        item.status === 'accepted'
          ? 'good'
          : pendingExpired
            ? 'warn'
            : item.status === 'pending'
            ? 'info'
            : item.status === 'expired'
              ? 'warn'
              : item.status === 'cancelled'
                ? 'muted'
                : item.status === 'passed'
                  ? 'muted'
                  : 'muted';

      const highlightIncoming = isIncoming && actionable;
      const sameGoals =
        Boolean(myProfile?.looking_for) &&
        Boolean(peer?.looking_for) &&
        String(myProfile?.looking_for ?? '').trim().toLowerCase() === String(peer?.looking_for ?? '').trim().toLowerCase();
      const sameRegion = Boolean(myProfile?.region) && Boolean(peer?.region) && String(myProfile?.region) === String(peer?.region);
      const sharedValues =
        Boolean(myProfile?.religion) && Boolean(peer?.religion) && String(myProfile?.religion) === String(peer?.religion);
      const whyChips = [
        sharedValues ? 'Shared values' : null,
        sameGoals ? 'Same goals' : null,
        sameRegion ? 'Same region' : null,
      ].filter(Boolean).slice(0, 2) as string[];

      return (
        <Animated.View>
          <Animated.View
            style={[
              styles.card,
              highlightIncoming && styles.cardIncoming,
              highlightIncoming && urgent && styles.cardIncomingUrgent,
            ]}
            entering={
              reduceMotion
                ? FadeIn.duration(Motion.duration.base)
                : FadeInDown.duration(Motion.duration.base)
                    .delay(Math.min(index, 6) * 45)
                    .easing(Motion.easing.outCubic)
                    .withInitialValues({
                      transform: [{ translateY: 8 }, { scale: highlightIncoming ? 0.985 : 1 }],
                      opacity: 0,
                    })
            }
          >
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
                  <View style={[styles.pillWrap]}>
                    <PillPulse active={urgent} reduceMotion={reduceMotion} color={lastChance ? '#ef4444' : theme.accent} />
                    <View style={[styles.expiryPill, urgent && styles.expiryPillUrgent]}>
                    <MaterialCommunityIcons name={urgent ? 'timer-off-outline' : 'timer-outline'} size={12} color={urgent ? '#ef4444' : theme.accent} />
                    <Text style={[styles.expiryLabel, urgent && styles.expiryLabelUrgent]}>{`Expires in ${expiry}`}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.pillWrap}>
              <PillPulse active={highlightIncoming} reduceMotion={reduceMotion} color={theme.tint} />
              <View
                style={[
                  styles.statusPill,
                  statusTone === 'good' && styles.statusPillGood,
                  statusTone === 'info' && styles.statusPillInfo,
                  statusTone === 'warn' && styles.statusPillWarn,
                  statusTone === 'muted' && styles.statusPillMuted,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    statusTone === 'good' && styles.statusTextGood,
                    statusTone === 'info' && styles.statusTextInfo,
                    statusTone === 'warn' && styles.statusTextWarn,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>

          {item.message ? (
            <Text style={styles.message} numberOfLines={2}>
              {item.message}
            </Text>
          ) : null}

          {highlightIncoming ? (
            <View style={styles.replyHintRow}>
              <MaterialCommunityIcons name="star-four-points" size={14} color={theme.tint} />
              <Text style={styles.replyHintLabel}>Suggested reply:</Text>
              <Text style={styles.replyHintText} numberOfLines={1}>
                {quickReply}
              </Text>
            </View>
          ) : null}

          {whyChips.length > 0 ? (
            <View style={styles.whyRow}>
              {whyChips.map((tag) => (
                <View key={`${item.id}-${tag}`} style={styles.whyChip}>
                  <Text style={styles.whyChipText}>{tag}</Text>
                </View>
              ))}
            </View>
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
            {isIncoming && actionable ? (
              <>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => acceptRequest(item)}
                  style={[styles.primaryButton, styles.actionWide]}
                >
                  <Text style={styles.primaryText}>Accept</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => passRequest(item)}
                  style={[styles.secondaryButton, styles.actionWide]}
                >
                  <Text style={styles.secondaryText}>Pass</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => openChat(peerId, name, peer?.avatar_url, quickReply)}
                  style={[styles.ghostButton, styles.actionWide]}
                >
                  <Text style={styles.ghostText}>Quick reply</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => router.push({ pathname: '/profile-view', params: { profileId: String(peerId) } })}
                  style={[styles.profileButton, styles.actionWide]}
                >
                  <Text style={styles.profileText}>View Profile</Text>
                </AnimatedPressable>
              </>
            ) : null}

            {!isIncoming && actionable ? (
              <>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => cancelRequest(item)}
                  style={[styles.secondaryButton, styles.actionWide]}
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => router.push({ pathname: '/profile-view', params: { profileId: String(peerId) } })}
                  style={[styles.profileButton, styles.actionWide]}
                >
                  <Text style={styles.profileText}>Preview profile</Text>
                </AnimatedPressable>
              </>
            ) : null}

            {canMessage ? (
              <>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => openChat(peerId, name, peer?.avatar_url)}
                  style={[styles.primaryButton, styles.actionWide]}
                >
                  <Text style={styles.primaryText}>Message</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => router.push({ pathname: '/profile-view', params: { profileId: String(peerId) } })}
                  style={[styles.profileButton, styles.actionWide]}
                >
                  <Text style={styles.profileText}>Preview profile</Text>
                </AnimatedPressable>
              </>
            ) : null}

            {canResend ? (
              <>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => resendIntent(peerId, peer?.full_name ?? null, item.type, quickReply)}
                  style={[styles.primaryButton, styles.actionWide]}
                >
                  <Text style={styles.primaryText}>Send again</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => router.push({ pathname: '/profile-view', params: { profileId: String(peerId) } })}
                  style={[styles.profileButton, styles.actionWide]}
                >
                  <Text style={styles.profileText}>Preview profile</Text>
                </AnimatedPressable>
              </>
            ) : null}
          </View>
          </Animated.View>
        </Animated.View>
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
      resendIntent,
      reduceMotion,
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
    if (direction === 'sent') {
      if (filter === 'all') return 'No sent intents yet.';
      if (filter === 'accepted') return 'No accepted intents yet.';
      if (filter === 'passed') return 'No passed intents yet.';
      return 'Nothing to take action on yet.';
    }
    if (filter === 'action') return 'No requests right now.';
    if (filter === 'all') return 'Your requests feed is quiet.';
    return 'Nothing here yet.';
  }, [direction, filter]);

  const handleSuggestedRequest = useCallback(
    (item: SuggestedMove) => {
      setSuggestedSend({ id: item.id, phase: 'loading' });
      setIntentTarget({ id: item.id, name: item.full_name ?? null });
      setIntentPrefill(buildOpenerText(item));
      setIntentDefaultType(buildIntentType(item));
      setIntentSheetOpen(true);
    },
    [],
  );

  const handleIntentSent = useCallback(() => {
    if (!intentTarget?.id) return;
    void upsertSignal(intentTarget.id, { openedDelta: 1, liked: true, dwellDelta: 3 });

    // Micro delight: brief success pulse before removing the card.
    setSuggestedSend({ id: intentTarget.id, phase: 'success' });
    if (suggestedSendTimerRef.current) clearTimeout(suggestedSendTimerRef.current);
    suggestedSendTimerRef.current = setTimeout(() => {
      setSuggestedMoves((prev) => prev.filter((item) => item.id !== intentTarget.id));
      setSuggestedSend({ id: null, phase: 'idle' });
      suggestedSendTimerRef.current = null;
    }, 520);
  }, [intentTarget?.id, upsertSignal]);

  useEffect(() => {
    return () => {
      if (suggestedSendTimerRef.current) clearTimeout(suggestedSendTimerRef.current);
    };
  }, []);

  const renderSuggestedCard = useCallback(
    ({ item }: { item: SuggestedMove }) => {
      const baseTags = Array.isArray(item.short_tags) ? item.short_tags.filter(Boolean) : [];
      const distanceTag = formatDistance(item.distance_km);
      const prompt = buildMovePrompt(item);
      const tags = [...baseTags, ...(distanceTag ? [distanceTag] : [])].slice(0, 2);
      return (
        <View style={styles.suggestedCard}>
          <View pointerEvents="none" style={styles.suggestedGlow} />
          <AnimatedPressable
            style={styles.suggestedMain}
            reduceMotion={reduceMotion}
            liftY={reduceMotion ? 0 : Motion.transform.cardLiftY}
            liftScale={reduceMotion ? 1 : 1.01}
            onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            onPress={() => {
              void upsertSignal(item.id, { openedDelta: 0, dwellDelta: 1 });
            }}
          >
            <View style={styles.suggestedAvatarRing}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.suggestedAvatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <MaterialCommunityIcons name="account-circle" size={40} color={theme.textMuted} />
                </View>
              )}
            </View>
            <View style={styles.suggestedInfo}>
              <View style={styles.suggestedKickerRow}>
                <MaterialCommunityIcons name="star-four-points" size={12} color={theme.tint} />
                <Text style={styles.suggestedKicker}>NEXT MOVE</Text>
              </View>
              <Text style={styles.suggestedName}>
                {`${item.full_name ?? 'Someone'}${item.age ? `, ${item.age}` : ''}`}
              </Text>
              <Text style={styles.suggestedPrompt} numberOfLines={1}>
                {prompt}
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
          </AnimatedPressable>

          <View style={styles.suggestedCtas}>
            <AnimatedPressable
              reduceMotion={reduceMotion}
              onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onPress={() => handleSuggestedRequest(item)}
              style={styles.suggestedPrimary}
            >
              <MaterialCommunityIcons name="send" size={16} color={Colors.light.background} />
              <Text style={styles.suggestedPrimaryText}>Send intent</Text>
              <CheckPulse active={suggestedSend.id === item.id && suggestedSend.phase === 'success'} tint={Colors.light.background} />
            </AnimatedPressable>
            <AnimatedPressable
              reduceMotion={reduceMotion}
              onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onPress={() => {
                void upsertSignal(item.id, { openedDelta: 1, dwellDelta: 5 });
                router.push({ pathname: '/profile-view', params: { profileId: String(item.id) } });
              }}
              style={styles.suggestedSecondary}
            >
              <Text style={styles.suggestedSecondaryText}>Preview</Text>
            </AnimatedPressable>
          </View>
        </View>
      );
    },
    [handleSuggestedRequest, reduceMotion, router, styles, suggestedSend.id, suggestedSend.phase, theme.textMuted, upsertSignal],
  );

  const suggestedVisible = useMemo(
    () => (suggestedExpanded ? suggestedMoves : suggestedMoves.slice(0, 3)),
    [suggestedExpanded, suggestedMoves],
  );
  const shouldShowSuggested = direction === 'incoming' && suggestedVisible.length > 0;
  const suggestedHero = suggestedVisible.length > 0 ? suggestedVisible[0] : null;
  const suggestedRest = suggestedVisible.length > 1 ? suggestedVisible.slice(1) : [];
  const [heroOpenerRevealed, setHeroOpenerRevealed] = useState(false);

  useEffect(() => {
    // Reset reveal state when the hero changes so the section stays clean and "coach-like".
    setHeroOpenerRevealed(false);
  }, [suggestedHero?.id]);

  useEffect(() => {
    // Premium feel: subtle entrance motion for suggested moves.
    if (direction !== 'incoming') return;
    if (suggestedLoading) return;
    suggestedEnter.value = 0;
    suggestedEnter.value = reduceMotion
      ? withTiming(1, { duration: Motion.duration.slow })
      : withTiming(1, { duration: 420, easing: Motion.easing.outCubic });
  }, [direction, reduceMotion, suggestedEnter, suggestedLoading, suggestedRetryKey, suggestedMoves.length]);

  const renderSuggestedHero = useCallback(
    (item: SuggestedMove) => {
      const baseTags = Array.isArray(item.short_tags) ? item.short_tags.filter(Boolean) : [];
      const distanceTag = formatDistance(item.distance_km);
      const prompt = buildMovePrompt(item);
      const opener = buildOpenerText(item);
      const tags = [...baseTags, ...(distanceTag ? [distanceTag] : [])].slice(0, 2);

      return (
        <View style={styles.suggestedHeroCard}>
          <View pointerEvents="none" style={styles.suggestedHeroGlow} />
          <View pointerEvents="none" style={styles.suggestedHeroGlow2} />

          <AnimatedPressable
            style={styles.suggestedHeroMain}
            reduceMotion={reduceMotion}
            liftY={reduceMotion ? 0 : Motion.transform.cardLiftY}
            liftScale={reduceMotion ? 1 : 1.01}
            onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            onPress={() => {
              void upsertSignal(item.id, { openedDelta: 0, dwellDelta: 2 });
            }}
          >
            <View style={styles.suggestedHeroTopRow}>
              <View style={styles.suggestedKickerRow}>
                <MaterialCommunityIcons name="star-four-points" size={12} color={theme.tint} />
                <Text style={styles.suggestedKicker}>TODAY{"'"}S MOVE</Text>
              </View>
              <View style={styles.suggestedHeroBadge}>
                <MaterialCommunityIcons name="target" size={12} color={theme.textMuted} />
                <Text style={styles.suggestedHeroBadgeText}>Intent coach</Text>
              </View>
            </View>

            <View style={styles.suggestedHeroIdentityRow}>
              <View style={styles.suggestedHeroAvatarRing}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.suggestedHeroAvatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <MaterialCommunityIcons name="account-circle" size={46} color={theme.textMuted} />
                  </View>
                )}
              </View>
              <View style={styles.suggestedHeroInfo}>
                <Text style={styles.suggestedHeroName}>
                  {`${item.full_name ?? 'Someone'}${item.age ? `, ${item.age}` : ''}`}
                </Text>
                <Text style={styles.suggestedHeroPrompt}>{prompt}</Text>
                {heroOpenerRevealed ? (
                  <Text style={styles.suggestedHeroOpener} numberOfLines={2}>
                    {`"${opener}"`}
                  </Text>
                ) : (
                  <AnimatedPressable
                    style={styles.suggestedHeroReveal}
                    reduceMotion={reduceMotion}
                    onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    onPress={() => setHeroOpenerRevealed(true)}
                  >
                    <MaterialCommunityIcons name="message-text-outline" size={14} color={theme.tint} />
                    <Text style={styles.suggestedHeroRevealText}>Reveal opener</Text>
                  </AnimatedPressable>
                )}
              </View>
            </View>

            {tags.length ? (
              <View style={styles.suggestedTags}>
                {tags.map((tag) => (
                  <View key={`${item.id}-${tag}`} style={styles.suggestedTag}>
                    <Text style={styles.suggestedTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </AnimatedPressable>

          <View style={styles.suggestedHeroCtas}>
            <AnimatedPressable
              reduceMotion={reduceMotion}
              onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onPress={() => handleSuggestedRequest(item)}
              style={styles.suggestedHeroPrimary}
            >
              <MaterialCommunityIcons name="send" size={16} color={Colors.light.background} />
              <Text style={styles.suggestedHeroPrimaryText}>Send intent</Text>
              <CheckPulse active={suggestedSend.id === item.id && suggestedSend.phase === 'success'} tint={Colors.light.background} />
            </AnimatedPressable>
            <AnimatedPressable
              reduceMotion={reduceMotion}
              onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onPress={() => {
                void upsertSignal(item.id, { openedDelta: 1, dwellDelta: 7 });
                router.push({ pathname: '/profile-view', params: { profileId: String(item.id) } });
              }}
              style={styles.suggestedHeroLink}
            >
              <Text style={styles.suggestedHeroLinkText}>Preview profile</Text>
            </AnimatedPressable>
          </View>
        </View>
      );
    },
    [
      handleSuggestedRequest,
      heroOpenerRevealed,
      reduceMotion,
      router,
      styles,
      suggestedSend.id,
      suggestedSend.phase,
      theme.textMuted,
      theme.tint,
      upsertSignal,
    ],
  );

  const retrySuggested = useCallback(() => {
    suggestedLoadedRef.current = false;
    setSuggestedRetryKey((k) => k + 1);
  }, []);

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

  const activeTypeLabel = useMemo(() => {
    const found = typePills.find((p) => p.key === typeFilter);
    return found?.label ?? 'All';
  }, [typeFilter, typePills]);

  const suggestedStackStyle = useAnimatedStyle(() => {
    const v = suggestedEnter.value;
    return {
      opacity: v,
      transform: reduceMotion ? [] : [{ translateY: (1 - v) * 10 }],
    };
  }, [reduceMotion, suggestedEnter]);

  const emptyBreathStyle = useAnimatedStyle(() => {
    return { opacity: emptyBreath.value };
  }, [emptyBreath]);

  const enterHeader = useMemo(
    () =>
      reduceMotion
        ? FadeIn.duration(Motion.duration.slow)
        : FadeInDown.duration(Motion.duration.slow)
            .easing(Motion.easing.outCubic)
            .withInitialValues({ transform: [{ translateY: Motion.transform.enterTranslateY }], opacity: 0 }),
    [reduceMotion],
  );
  const enterToggle = useMemo(
    () =>
      reduceMotion
        ? FadeIn.duration(Motion.duration.base).delay(60)
        : FadeInDown.duration(Motion.duration.base)
            .delay(60)
            .easing(Motion.easing.outCubic)
            .withInitialValues({ transform: [{ translateY: Motion.transform.enterTranslateY }], opacity: 0 }),
    [reduceMotion],
  );
  const enterChips = useMemo(
    () =>
      reduceMotion
        ? FadeIn.duration(Motion.duration.base).delay(120)
        : FadeInDown.duration(Motion.duration.base)
            .delay(120)
            .easing(Motion.easing.outCubic)
            .withInitialValues({ transform: [{ translateY: Motion.transform.enterTranslateY }], opacity: 0 }),
    [reduceMotion],
  );

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View entering={enterHeader} style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Intent</Text>
          <Text style={styles.headerSubtitle}>Likes, requests, and introductions.</Text>
        </View>
      </Animated.View>

      <Animated.View entering={enterToggle}>
        <SegmentedToggle
          value={direction}
          reduceMotion={reduceMotion}
          styles={styles}
          onChange={(next) => {
            if (next !== direction) setDirection(next);
          }}
        />
      </Animated.View>

      <Animated.View entering={enterChips}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="handled"
        >
          {filters.map((pill) => {
            const active = pill.key === filter;
            return (
              <AnimatedChip
                key={pill.key}
                label={pill.label}
                active={active}
                reduceMotion={reduceMotion}
                theme={theme}
                onPress={() => {
                  if (!active) void Haptics.selectionAsync();
                  if (!active) setFilter(pill.key);
                }}
              />
            );
          })}

          <AnimatedChip
            label={`Type: ${activeTypeLabel}`}
            icon="filter-variant"
            active={typeFilter !== 'all'}
            reduceMotion={reduceMotion}
            theme={theme}
            onPress={() => {
              void Haptics.selectionAsync();
              setTypePickerOpen(true);
            }}
          />
        </ScrollView>
      </Animated.View>

        <Animated.View key={direction} style={{ flex: 1 }}>
          <Animated.View
            style={{ flex: 1 }}
            entering={
              reduceMotion
                ? FadeIn.duration(Motion.duration.base)
              : FadeInDown.duration(Motion.duration.base)
                  .easing(Motion.easing.outCubic)
                  .withInitialValues({ transform: [{ translateY: 6 }], opacity: 0 })
          }
          exiting={
            reduceMotion
              ? FadeOut.duration(Motion.duration.fast)
              : FadeOutUp.duration(Motion.duration.fast).easing(Motion.easing.outCubic)
          }
        >
          <FlatList
            data={sortedFiltered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            extraData={sortedFiltered.length}
            ListHeaderComponent={
              direction === 'incoming' ? (
                sortedFiltered.length > 0 ? (
                  <Animated.View
                    entering={
                      reduceMotion
                        ? FadeIn.duration(Motion.duration.base)
                        : FadeInDown.duration(Motion.duration.base)
                            .easing(Motion.easing.outCubic)
                            .withInitialValues({ transform: [{ translateY: 6 }], opacity: 0 })
                    }
                    style={styles.inboxHeader}
                  >
                    <View style={styles.inboxHeaderLine}>
                      <MaterialCommunityIcons name="inbox-arrow-down" size={16} color={theme.tint} />
                      <Text style={styles.inboxHeaderTitle}>Received</Text>
                      <View style={styles.inboxCountPill}>
                        <Text style={styles.inboxCountText}>{sortedFiltered.length}</Text>
                      </View>
                    </View>
                    <Text style={styles.inboxHeaderHint}>Respond fast to keep the momentum.</Text>
                  </Animated.View>
                ) : (
                  <View style={styles.suggestedSection}>
              <View style={styles.suggestedTitleRow}>
                <View style={styles.suggestedTitleLine}>
                  <MaterialCommunityIcons name="target" size={16} color={theme.tint} />
                  <Text style={styles.suggestedTitle}>Suggested moves</Text>
                </View>
                <Text style={styles.suggestedSubtitle}>3 smart ways to turn curiosity into connection.</Text>
              </View>

              {suggestedLoading ? (
                <View style={styles.suggestedSkeletonWrap}>
                  <View style={styles.suggestedSkeletonHero} />
                  <View style={styles.suggestedSkeletonCard} />
                  <View style={styles.suggestedSkeletonCard} />
                </View>
              ) : suggestedError ? (
                <View style={styles.suggestedMetaRow}>
                  <Text style={styles.emptyHint}>{suggestedError}</Text>
                  <TouchableOpacity style={styles.ghostButton} onPress={retrySuggested}>
                    <Text style={styles.ghostText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : shouldShowSuggested ? (
                <Animated.View style={[styles.suggestedStack, suggestedStackStyle]}>
                  {suggestedHero ? (
                    <Animated.View key={suggestedHero.id}>
                      <Animated.View
                        entering={
                          reduceMotion
                            ? FadeIn.duration(Motion.duration.base)
                            : FadeInDown.duration(Motion.duration.base)
                                .easing(Motion.easing.outCubic)
                                .withInitialValues({ transform: [{ translateY: 8 }], opacity: 0 })
                        }
                      >
                        {renderSuggestedHero(suggestedHero)}
                      </Animated.View>
                    </Animated.View>
                  ) : null}
                  {suggestedRest.map((item, idx) => (
                    <Animated.View key={item.id}>
                      <Animated.View
                        entering={
                          reduceMotion
                            ? FadeIn.duration(Motion.duration.base).delay(70 + idx * 80)
                            : FadeInDown.duration(Motion.duration.base)
                                .delay(70 + idx * 85)
                                .easing(Motion.easing.outCubic)
                                .withInitialValues({ transform: [{ translateY: 10 }], opacity: 0 })
                        }
                      >
                        {renderSuggestedCard({ item })}
                      </Animated.View>
                    </Animated.View>
                  ))}
                  {suggestedMoves.length > 3 ? (
                    <TouchableOpacity
                      style={styles.suggestedMore}
                      onPress={() => setSuggestedExpanded((prev) => !prev)}
                    >
                    <Text style={styles.ghostText}>
                      {suggestedExpanded ? 'Show less' : `Show all (${suggestedMoves.length})`}
                    </Text>
                    </TouchableOpacity>
                  ) : null}
                </Animated.View>
              ) : (
                <View style={styles.suggestedMetaRow}>
                  <Text style={styles.emptyHint}>No suggestions yet.</Text>
                  <TouchableOpacity style={styles.ghostButton} onPress={retrySuggested}>
                    <Text style={styles.ghostText}>Refresh</Text>
                  </TouchableOpacity>
                </View>
              )}
              </View>
                )
              ) : null
          }
          ListFooterComponent={
            direction === 'incoming' && sortedFiltered.length > 0 ? (
              <View style={styles.suggestedSectionFooter}>
                <View style={styles.suggestedTitleRow}>
                  <View style={styles.suggestedTitleLine}>
                    <MaterialCommunityIcons name="target" size={16} color={theme.tint} />
                    <Text style={styles.suggestedTitle}>Suggested moves</Text>
                  </View>
                  <Text style={styles.suggestedSubtitle}>3 smart ways to turn curiosity into connection.</Text>
                </View>

                {suggestedLoading ? (
                  <View style={styles.suggestedSkeletonWrap}>
                    <View style={styles.suggestedSkeletonHero} />
                    <View style={styles.suggestedSkeletonCard} />
                    <View style={styles.suggestedSkeletonCard} />
                  </View>
                ) : suggestedError ? (
                  <View style={styles.suggestedMetaRow}>
                    <Text style={styles.emptyHint}>{suggestedError}</Text>
                    <TouchableOpacity style={styles.ghostButton} onPress={retrySuggested}>
                      <Text style={styles.ghostText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : shouldShowSuggested ? (
                  <Animated.View style={[styles.suggestedStack, suggestedStackStyle]}>
                    {suggestedHero ? (
                      <Animated.View key={suggestedHero.id}>
                        <Animated.View
                          entering={
                            reduceMotion
                              ? FadeIn.duration(Motion.duration.base)
                              : FadeInDown.duration(Motion.duration.base)
                                  .easing(Motion.easing.outCubic)
                                  .withInitialValues({ transform: [{ translateY: 8 }], opacity: 0 })
                          }
                        >
                          {renderSuggestedHero(suggestedHero)}
                        </Animated.View>
                      </Animated.View>
                    ) : null}
                    {suggestedRest.map((item, idx) => (
                      <Animated.View key={item.id}>
                        <Animated.View
                          entering={
                            reduceMotion
                              ? FadeIn.duration(Motion.duration.base)
                              : FadeInDown.duration(Motion.duration.base)
                                  .delay((idx + 1) * 70)
                                  .easing(Motion.easing.outCubic)
                                  .withInitialValues({ transform: [{ translateY: 8 }], opacity: 0 })
                          }
                        >
                          {renderSuggestedCard({ item })}
                        </Animated.View>
                      </Animated.View>
                    ))}

                    {suggestedMoves.length > 2 ? (
                      <TouchableOpacity
                        style={styles.suggestedMore}
                        onPress={() => setSuggestedExpanded((v) => !v)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.suggestedMoreText}>
                          {suggestedExpanded ? 'Show less' : `Show all (${suggestedMoves.length})`}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </Animated.View>
                ) : (
                  <View style={styles.suggestedMetaRow}>
                    <Text style={styles.emptyHint}>No suggestions yet.</Text>
                    <TouchableOpacity style={styles.ghostButton} onPress={retrySuggested}>
                      <Text style={styles.ghostText}>Refresh</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.skeletonWrap}>
                <View style={styles.skeletonCard} />
                <View style={styles.skeletonCard} />
                <View style={styles.skeletonCard} />
                {loadingStuck ? (
                  <AnimatedPressable
                    reduceMotion={reduceMotion}
                    onHaptic={() => void Haptics.selectionAsync()}
                    onPress={() => void refresh()}
                    style={styles.skeletonRetry}
                  >
                    <Text style={styles.ghostText}>Tap to retry</Text>
                  </AnimatedPressable>
                ) : null}
              </View>
            ) : (
              <Animated.View
                entering={
                  reduceMotion
                    ? FadeIn.duration(Motion.duration.base)
                    : FadeInDown.duration(Motion.duration.base).easing(Motion.easing.outCubic)
                }
                style={styles.emptyState}
              >
                <Animated.View style={emptyBreathStyle}>
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
                  {!loading &&
                  direction === 'incoming' &&
                  !hasPendingIncoming &&
                  suggestedMoves.length === 0 &&
                  !suggestedLoading ? (
                    <View style={styles.emptyStateMuted}>
                      <Text style={styles.emptyText}>Nothing yet -- but you are early.</Text>
                      <Text style={styles.emptyHint}>Post a Moment or explore Vibes to spark new requests.</Text>
                    </View>
                  ) : null}
                </Animated.View>
              </Animated.View>
            )
          }
        />
      </Animated.View>
      </Animated.View>

      <IntentRequestSheet
        visible={intentSheetOpen}
        onClose={() => {
          setIntentSheetOpen(false);
          setIntentPrefill(null);
          setIntentDefaultType('connect');
          setSuggestedSend((prev) => (prev.phase === 'loading' ? { id: null, phase: 'idle' } : prev));
        }}
        recipientId={intentTarget?.id}
        recipientName={intentTarget?.name ?? null}
        defaultType={intentDefaultType}
        prefillMessage={intentPrefill}
        metadata={{ source: 'intent_suggested', algorithm: 'moves_v1' }}
        onSent={handleIntentSent}
      />

      <Modal visible={typePickerOpen} transparent animationType="fade" onRequestClose={() => setTypePickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={styles.pickerBackdropPress} onPress={() => setTypePickerOpen(false)} />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Filter type</Text>
              <TouchableOpacity style={styles.pickerClose} onPress={() => setTypePickerOpen(false)} activeOpacity={0.85}>
                <MaterialCommunityIcons name="close" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>

            {typePills.map((pill) => {
              const active = pill.key === typeFilter;
              return (
                <TouchableOpacity
                  key={pill.key}
                  style={[styles.pickerRow, active && styles.pickerRowActive]}
                  onPress={() => {
                    setTypeFilter(pill.key);
                    setTypePickerOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.pickerIcon, active && styles.pickerIconActive]}>
                    <MaterialCommunityIcons name={pill.icon as any} size={18} color={active ? Colors.light.background : theme.tint} />
                  </View>
                  <Text style={[styles.pickerRowText, active && styles.pickerRowTextActive]}>{pill.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
    headerTitle: { fontSize: 30, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { marginTop: 6, fontSize: 12, color: theme.textMuted },
    toggleRow: { flexDirection: 'row', paddingHorizontal: 18, gap: 10, marginTop: 10, position: 'relative' },
    toggleIndicator: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.tint,
      backgroundColor: theme.tint,
    },
    togglePill: {
      flex: 1,
      minHeight: 40,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    togglePillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    togglePillActiveGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
    toggleText: { fontSize: 12, lineHeight: 14, paddingBottom: 1, color: theme.textMuted, fontWeight: '600' },
    toggleTextActive: { color: Colors.light.background },
    // Keep spacing on the scroll view itself so the content container can't get clipped.
    filterScroll: { marginTop: 10 },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      gap: 10,
      paddingRight: 18,
    },
    filterPill: {
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    filterPillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    filterText: { fontSize: 12, lineHeight: 14, paddingBottom: 1, color: theme.textMuted, fontWeight: '600' },
    filterTextActive: { color: Colors.light.background },
    listContent: { padding: 18, paddingBottom: 40, gap: 12 },
    inboxHeader: { marginTop: 6, gap: 4, paddingHorizontal: 2 },
    inboxHeaderLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inboxHeaderTitle: { fontSize: 14, fontWeight: '800', color: theme.text },
    inboxHeaderHint: { fontSize: 11, color: theme.textMuted },
    inboxCountPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : theme.background,
    },
    inboxCountText: { fontSize: 11, fontWeight: '800', color: theme.tint },
    card: {
      padding: 14,
      borderRadius: 18,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    cardIncoming: {
      borderColor: isDark ? 'rgba(0,160,160,0.35)' : 'rgba(0,160,160,0.22)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.06)' : theme.backgroundSubtle,
    },
    cardIncomingUrgent: {
      borderColor: isDark ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.30)',
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
    pillWrap: { position: 'relative' },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    statusPillInfo: {
      borderColor: 'rgba(14, 116, 144, 0.35)',
      backgroundColor: isDark ? 'rgba(14, 116, 144, 0.18)' : 'rgba(14, 116, 144, 0.10)',
    },
    statusPillGood: {
      borderColor: 'rgba(16, 185, 129, 0.35)',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.10)',
    },
    statusPillWarn: {
      borderColor: 'rgba(245, 158, 11, 0.40)',
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.10)',
    },
    statusPillMuted: {
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    statusText: { fontSize: 10, color: theme.textMuted, textTransform: 'capitalize' },
    statusTextInfo: { color: theme.tint, fontWeight: '700' },
    statusTextGood: { color: '#10b981', fontWeight: '700' },
    statusTextWarn: { color: '#f59e0b', fontWeight: '700' },
    message: { marginTop: 10, fontSize: 13, color: theme.text },
    replyHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    replyHintLabel: { fontSize: 11, fontWeight: '800', color: theme.textMuted },
    replyHintText: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.text },
    whyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    whyChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : 'rgba(0,160,160,0.06)',
    },
    whyChipText: { fontSize: 11, fontWeight: '700', color: theme.tint },
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
    actionWide: { flexGrow: 1, minWidth: '48%' },
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
    skeletonWrap: { paddingHorizontal: 18, paddingTop: 18, gap: 12 },
    skeletonCard: {
      height: 118,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      opacity: isDark ? 0.35 : 0.55,
    },
    skeletonRetry: {
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      marginTop: 2,
    },
    suggestedSection: { marginTop: 16, gap: 12 },
    suggestedSectionFooter: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : theme.outline,
      gap: 12,
    },
    suggestedTitleRow: { gap: 4, paddingHorizontal: 2 },
    suggestedTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    suggestedTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    suggestedSubtitle: { fontSize: 11, color: theme.textMuted },
    suggestedSkeletonWrap: { gap: 10, paddingVertical: 6 },
    suggestedSkeletonHero: {
      height: 158,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      opacity: isDark ? 0.35 : 0.55,
    },
    suggestedSkeletonCard: {
      height: 110,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      opacity: isDark ? 0.35 : 0.55,
    },
    suggestedList: { paddingVertical: 4, gap: 12 },
    suggestedMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    suggestedStack: { gap: 10, paddingVertical: 6 },
    suggestedMore: { alignSelf: 'flex-start', paddingHorizontal: 2, paddingVertical: 6 },
    suggestedMoreText: { fontSize: 12, color: theme.tint, fontWeight: '700' },
    suggestedHeroCard: {
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.25)' : theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.backgroundSubtle,
      overflow: 'hidden',
    },
    suggestedHeroGlow: {
      position: 'absolute',
      top: -120,
      right: -100,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: theme.accent,
      opacity: isDark ? 0.18 : 0.10,
    },
    suggestedHeroGlow2: {
      position: 'absolute',
      bottom: -160,
      left: -140,
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: theme.tint,
      opacity: isDark ? 0.10 : 0.06,
    },
    suggestedHeroMain: { gap: 12 },
    suggestedHeroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    suggestedHeroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(15,26,26,0.65)' : theme.background,
    },
    suggestedHeroBadgeText: { fontSize: 11, color: theme.textMuted, fontWeight: '700' },
    suggestedHeroIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    suggestedHeroAvatarRing: {
      width: 62,
      height: 62,
      borderRadius: 31,
      padding: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.45)' : theme.outline,
      backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : theme.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    suggestedHeroAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.backgroundSubtle },
    suggestedHeroInfo: { flex: 1, gap: 4 },
    suggestedHeroName: { fontSize: 16, fontWeight: '800', color: theme.text },
    suggestedHeroPrompt: { fontSize: 12, color: theme.textMuted, fontWeight: '700' },
    suggestedHeroOpener: {
      marginTop: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(15,26,26,0.55)' : theme.background,
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    suggestedHeroReveal: {
      marginTop: 8,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(15,26,26,0.50)' : theme.background,
    },
    suggestedHeroRevealText: { color: theme.tint, fontWeight: '800', fontSize: 12 },
    suggestedCard: {
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : theme.backgroundSubtle,
      overflow: 'hidden',
    },
    suggestedGlow: {
      position: 'absolute',
      top: -80,
      right: -80,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: theme.accent,
      opacity: isDark ? 0.14 : 0.08,
    },
    suggestedMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    suggestedKicker: {
      fontSize: 10,
      letterSpacing: 1,
      color: theme.tint,
      fontWeight: '800',
      marginBottom: 2,
    },
    suggestedKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    suggestedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    suggestedAvatarRing: {
      width: 48,
      height: 48,
      borderRadius: 24,
      padding: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.35)' : theme.outline,
      backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : theme.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    suggestedAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundSubtle },
    suggestedInfo: { flex: 1, gap: 6 },
    suggestedName: { fontSize: 13, fontWeight: '700', color: theme.text },
    suggestedPrompt: { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
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
    suggestedCtas: { flexDirection: 'row', gap: 8, marginTop: 12 },
    suggestedPrimary: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    suggestedPrimaryText: { color: Colors.light.background, fontWeight: '700', fontSize: 12 },
    suggestedSecondary: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    suggestedSecondaryText: { color: theme.textMuted, fontWeight: '700', fontSize: 12 },
    suggestedHeroCtas: { marginTop: 12, gap: 10 },
    suggestedHeroPrimary: {
      position: 'relative',
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: theme.tint,
    },
    suggestedHeroPrimaryText: { color: Colors.light.background, fontWeight: '800', fontSize: 13 },
    suggestedHeroLink: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8 },
    suggestedHeroLinkText: { color: theme.textMuted, fontWeight: '800', fontSize: 12 },
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    pickerBackdropPress: { flex: 1 },
    pickerSheet: {
      backgroundColor: theme.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 18,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    pickerTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
    pickerClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      marginTop: 10,
    },
    pickerRowActive: { borderColor: theme.tint, backgroundColor: isDark ? 'rgba(15,26,26,0.65)' : 'rgba(236, 253, 245, 0.7)' },
    pickerIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.outline,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    pickerIconActive: { borderColor: theme.tint, backgroundColor: theme.tint },
    pickerRowText: { fontSize: 14, fontWeight: '700', color: theme.text },
    pickerRowTextActive: { color: theme.text },
  });
