import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIntentRequests, type IntentRequest, type IntentRequestType } from '@/hooks/useIntentRequests';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import { computeFirstReplyHours, computeInterestOverlapRatio } from '@/lib/match/match-score';
import { Motion } from '@/lib/motion';
import { readCache, writeCache } from '@/lib/persisted-cache';
import { supabase } from '@/lib/supabase';
import { getViewedProfileTrustChips } from '@/lib/viewed-profile-premium';
import MatchModal from '@/components/MatchModal';
import AnimatedPressable from '@/components/motion/AnimatedPressable';
import type { Match } from '@/types/match';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
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
  shared_interest_names?: string[] | null;
  prompt_title?: string | null;
  prompt_answer?: string | null;
  bio_snippet?: string | null;
  same_region?: boolean | null;
  same_religion?: boolean | null;
  same_looking_for?: boolean | null;
  active_now?: boolean | null;
  recently_active?: boolean | null;
  candidate_tier?: number | null;
  quality_band?: number | null;
  shared_interest_count?: number | null;
};

type SuggestedMoveEventType =
  | 'impression'
  | 'preview_profile'
  | 'opener_revealed'
  | 'intent_opened'
  | 'intent_sent';

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

function RevealCue({
  active,
  reduceMotion,
  children,
}: {
  active: boolean;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const sweep = useSharedValue(-120);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!active || reduceMotion) {
      sweep.value = -120;
      glow.value = 0;
      return;
    }

    sweep.value = withRepeat(
      withSequence(
        withTiming(180, { duration: 760, easing: Motion.easing.outCubic }),
        withTiming(-120, { duration: 0 }),
        withTiming(-120, { duration: 1500 }),
      ),
      -1,
      false,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 520, easing: Motion.easing.outCubic }),
        withTiming(0, { duration: 720, easing: Motion.easing.outCubic }),
      ),
      -1,
      false,
    );
  }, [active, glow, reduceMotion, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value }],
    opacity: 0.14,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + glow.value * 0.1,
    transform: [{ scale: 1 + glow.value * 0.02 }],
  }));

  return (
    <View style={{ position: 'relative', overflow: 'hidden' }}>
      {!reduceMotion && active ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                inset: -1,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(210,255,250,0.28)',
              },
              glowStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -20,
                bottom: -20,
                width: 64,
                transform: [{ rotate: '18deg' }],
              },
              sweepStyle,
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </>
      ) : null}
      {children}
    </View>
  );
}

const formatDistance = (km?: number | null) => {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return null;
  if (km >= 1000) return 'Long-distance';
  if (km >= 100) return `${Math.round(km)} km away`;
  return `${km.toFixed(1)} km away`;
};

const cleanSnippet = (value?: string | null, max = 96) => {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
};

const buildSuggestedDisplayTags = (item: SuggestedMove, limit = 2) => {
  const tags = Array.isArray(item.short_tags) ? item.short_tags : [];
  const sharedInterests = Array.isArray(item.shared_interest_names) ? item.shared_interest_names : [];
  const distanceTag = formatDistance(item.distance_km);
  const next: string[] = [];
  const push = (value?: string | null) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return;
    if (next.some((existing) => existing.toLowerCase() === text.toLowerCase())) return;
    next.push(text);
  };

  sharedInterests.slice(0, 2).forEach(push);
  tags.filter((tag) => tag !== 'Shared interests').forEach(push);
  push(distanceTag);

  return next.slice(0, limit);
};

const buildMovePrompt = (item: SuggestedMove) => {
  const tags = Array.isArray(item.short_tags) ? item.short_tags : [];
  const sharedInterests = Array.isArray(item.shared_interest_names) ? item.shared_interest_names.filter(Boolean) : [];
  const promptTitle = cleanSnippet(item.prompt_title, 42);
  const promptAnswer = cleanSnippet(item.prompt_answer, 34);
  const bioSnippet = cleanSnippet(item.bio_snippet, 90);
  if (sharedInterests.length > 0) return `Open with your shared interest in ${sharedInterests[0]}.`;
  if (promptTitle && promptAnswer) return `Ask what inspired their "${promptAnswer}" answer.`;
  if (promptTitle) return `Ask about their answer to "${promptTitle}".`;
  if (item.has_intro_video || tags.includes('Intro video')) return 'Open with something from their intro video.';
  if (item.active_now || tags.includes('Active now')) return 'They are active now. Keep it light and timely.';
  if (item.same_looking_for && item.same_region) return 'You want the same thing and move in the same orbit.';
  if (item.same_looking_for) return 'Lead with what you both want from this app.';
  if (bioSnippet) return 'Pick one detail from their profile and ask a real question.';
  return 'Send a short, confident opener.';
};

const buildOpenerText = (item: SuggestedMove) => {
  const full = (item.full_name ?? '').trim();
  const first = (full.split(/\s+/)[0] || 'there').slice(0, 20);
  const tags = Array.isArray(item.short_tags) ? item.short_tags : [];
  const sharedInterests = Array.isArray(item.shared_interest_names) ? item.shared_interest_names.filter(Boolean) : [];
  const promptTitle = cleanSnippet(item.prompt_title, 38);
  const promptAnswer = cleanSnippet(item.prompt_answer, 34);
  const bioSnippet = cleanSnippet(item.bio_snippet, 80);

  if (sharedInterests.length > 0) {
    return `Hi ${first} - saw we're both into ${sharedInterests[0]}. What got you into it?`;
  }
  if (promptTitle) {
    if (promptAnswer) {
      return `Hi ${first} - your answer to "${promptTitle}" stood out to me, especially the part about "${promptAnswer}". What's the story behind it?`;
    }
    return `Hi ${first} - your answer to "${promptTitle}" caught my attention. What's the story behind it?`;
  }
  if (item.has_intro_video || tags.includes('Intro video')) {
    return `Hi ${first} - I watched your intro video. What is something you are into lately?`;
  }
  if (item.active_now || tags.includes('Active now')) {
    if (item.same_region) {
      return `Hi ${first} - looks like we're in the same area. How is your week going so far?`;
    }
    return `Hi ${first} - are you around right now? I would love to connect.`;
  }
  if (item.same_looking_for) {
    return `Hi ${first} - I think we may be looking for something similar here. What kind of connection are you hoping to build?`;
  }
  if (bioSnippet) {
    return `Hi ${first} - your profile stood out to me. What's something you're excited about these days?`;
  }
  return `Hi ${first} - your profile stood out. What are you looking for on here?`;
};

const buildIntentType = (item: SuggestedMove): IntentRequestType => {
  const tags = Array.isArray(item.short_tags) ? item.short_tags : [];
  if (tags.includes('Shared interests')) return 'like_with_note';
  return 'connect';
};

const buildSuggestedMoveTelemetry = (
  item: SuggestedMove,
  extra?: Record<string, unknown>,
): Record<string, unknown> => ({
  algorithm: 'moves_v2',
  candidate_tier: item.candidate_tier ?? 0,
  quality_band: item.quality_band ?? 0,
  distance_km: item.distance_km ?? null,
  shared_interest_count: item.shared_interest_count ?? item.shared_interest_names?.length ?? 0,
  same_region: item.same_region ?? false,
  same_religion: item.same_religion ?? false,
  same_looking_for: item.same_looking_for ?? false,
  active_now: item.active_now ?? false,
  recently_active: item.recently_active ?? false,
  has_intro_video: item.has_intro_video ?? false,
  has_prompt: Boolean(item.prompt_title),
  tags: item.short_tags ?? [],
  ...extra,
});

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

const typeLabel = (item: Pick<IntentRequest, 'type' | 'message' | 'metadata'>) => {
  switch (item.type) {
    case 'connect': {
      const meta = (item.metadata || {}) as any;
      if (String(meta?.source || '').toLowerCase() === 'guess_prompt') return 'Prompt';
      return 'Connect';
    }
    case 'date_request':
      return 'Date';
    case 'like_with_note': {
      const meta = (item.metadata || {}) as any;
      const swipeActionRaw = meta?.swipe_action ?? meta?.swipeAction ?? null;
      const swipeAction = swipeActionRaw ? String(swipeActionRaw).toUpperCase() : null;
      const isSwipeLike = meta?.source && String(meta.source).toLowerCase().includes('swipe');
      const hasUserNote =
        typeof item.message === 'string' &&
        item.message.trim().length > 0 &&
        !isSwipeLike &&
        // our swipe mirror sometimes uses a canned message; don't treat that as a "note"
        !/^superliked you\.?$/i.test(item.message.trim());

      if (swipeAction === 'SUPERLIKE') return 'Superlike';
      // "like_with_note" represents plain likes (from swipes) too.
      return hasUserNote ? 'Note' : 'Like';
    }
    case 'circle_intro':
      return 'Circle';
    default:
      return 'Request';
  }
};

const typeIcon = (item: Pick<IntentRequest, 'type' | 'message' | 'metadata'>) => {
  switch (item.type) {
    case 'connect': {
      const meta = (item.metadata || {}) as any;
      if (String(meta?.source || '').toLowerCase() === 'guess_prompt') return 'comment-question-outline';
      return 'message-plus-outline';
    }
    case 'date_request':
      return 'calendar-heart';
    case 'like_with_note': {
      const meta = (item.metadata || {}) as any;
      const swipeActionRaw = meta?.swipe_action ?? meta?.swipeAction ?? null;
      const swipeAction = swipeActionRaw ? String(swipeActionRaw).toUpperCase() : null;
      const isSwipeLike = meta?.source && String(meta.source).toLowerCase().includes('swipe');
      const hasUserNote =
        typeof item.message === 'string' &&
        item.message.trim().length > 0 &&
        !isSwipeLike &&
        !/^superliked you\.?$/i.test(item.message.trim());

      if (swipeAction === 'SUPERLIKE') return 'star-four-points';
      return hasUserNote ? 'text-box-plus-outline' : 'heart-outline';
    }
    case 'circle_intro':
      return 'account-group-outline';
    default:
      return 'inbox-outline';
  }
};

const getIntentConversationSignal = ({
  messageCount,
  firstReplyHours,
  bothVerified,
  interestOverlapRatio,
}: {
  messageCount?: number | null;
  firstReplyHours?: number | null;
  bothVerified?: boolean;
  interestOverlapRatio?: number;
}) => {
  const totalMessages = typeof messageCount === 'number' ? messageCount : 0;

  if (totalMessages >= 8 && bothVerified && (interestOverlapRatio ?? 0) >= 0.28 && (firstReplyHours == null || firstReplyHours <= 24)) {
    return 'Consistent chemistry';
  }

  if (totalMessages >= 6 && (firstReplyHours == null || firstReplyHours <= 36)) {
    return 'Strong momentum';
  }

  if (totalMessages >= 4 && (firstReplyHours == null || firstReplyHours <= 24)) {
    return 'Great flow';
  }

  return null;
};

const getIntentTrustSignals = ({
  verificationLevel,
  peerInterests,
  lookingFor,
}: {
  verificationLevel?: number | null;
  peerInterests: string[];
  lookingFor?: string | null;
}) =>
  getViewedProfileTrustChips({
    verificationLevel: verificationLevel ?? 0,
    verified: (verificationLevel ?? 0) >= 1,
    profileVideo: null,
    profileVideoPath: null,
    interests: peerInterests.map((name) => ({ name })),
    lookingFor: lookingFor ?? '',
    bio: '',
  } as any);

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

export default function IntentScreen() {
  const { user, profile } = useAuth();
  const { profileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const params = useLocalSearchParams<{
    type?: string;
    requestId?: string;
    request_id?: string;
    requestType?: string;
    request_type?: string;
  }>();
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
  const listRef = useRef<FlatList<IntentRequest> | null>(null);
  const [deepLinkRequestId, setDeepLinkRequestId] = useState<string | null>(null);
  const deepLinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const suggestedBatchKeyRef = useRef<string | null>(null);
  const suggestedBatchSignatureRef = useRef('');
  const loggedSuggestedImpressionsRef = useRef<Set<string>>(new Set());
  const suggestedCacheKey = useMemo(
    () => (currentProfileId ? `cache:suggested_moves:v2:${currentProfileId}` : null),
    [currentProfileId],
  );
  const suggestedCacheLoadedKeyRef = useRef<string | null>(null);
  const [intentSheetOpen, setIntentSheetOpen] = useState(false);
  const [intentTarget, setIntentTarget] = useState<{ id: string; name?: string | null } | null>(null);
  const [intentPrefill, setIntentPrefill] = useState<string | null>(null);
  const [intentDefaultType, setIntentDefaultType] = useState<IntentRequestType>('connect');
  const [celebrationMatch, setCelebrationMatch] = useState<Match | null>(null);
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

  useEffect(() => {
    // Push reminders deep-link here with a request id so we can open the actionable inbox.
    const rawId =
      (typeof params?.requestId === 'string' ? params.requestId : null) ??
      (typeof params?.request_id === 'string' ? params.request_id : null);
    if (!rawId) return;

    const id = rawId.trim();
    if (!id) return;

    setDirection('incoming');
    setFilter('action');
    setDeepLinkRequestId(id);

    if (deepLinkTimerRef.current) clearTimeout(deepLinkTimerRef.current);
    deepLinkTimerRef.current = setTimeout(() => setDeepLinkRequestId(null), 4500);

    return () => {
      if (deepLinkTimerRef.current) clearTimeout(deepLinkTimerRef.current);
      deepLinkTimerRef.current = null;
    };
  }, [params?.requestId, params?.request_id]);

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
      if (filter === 'passed') return item.status === 'passed' || item.status === 'matched';
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

  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    // Best-effort fallback: approximate offset and try again after layout settles.
    listRef.current?.scrollToOffset({
      offset: Math.max(0, info.averageItemLength * info.index),
      animated: true,
    });
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.2 });
      } catch {
        // ignore
      }
    }, 120);
  }, []);

  useEffect(() => {
    if (!deepLinkRequestId) return;
    if (direction !== 'incoming') return;

    const idx = sortedFiltered.findIndex((item) => item.id === deepLinkRequestId);
    if (idx < 0) return;

    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.2 });
      } catch {
        // ignore (onScrollToIndexFailed handles most cases)
      }
    }, 60);
    return () => clearTimeout(t);
  }, [deepLinkRequestId, direction, sortedFiltered]);

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

  const buildIntentCelebrationMatch = useCallback(
    (item: IntentRequest): Match => {
      const actor = profiles[item.actor_id];
      const peerInterests = Array.isArray(interestsByProfile[item.actor_id]) ? interestsByProfile[item.actor_id] : [];
      const sharedInterests = myInterests.length ? peerInterests.filter((i) => myInterests.includes(i)).slice(0, 3) : [];

      return {
        id: item.actor_id,
        name: actor?.full_name || 'Someone',
        age: actor?.age ?? 0,
        avatar_url: actor?.avatar_url || undefined,
        location: actor?.city || actor?.region || actor?.location || undefined,
        interests: peerInterests,
        commonInterests: sharedInterests,
        verified: (actor?.verification_level ?? 0) > 0,
        verification_level: actor?.verification_level ?? undefined,
        region: actor?.region ?? undefined,
      };
    },
    [interestsByProfile, myInterests, profiles],
  );

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
      setCelebrationMatch(buildIntentCelebrationMatch(item));
      await refresh();
    },
    [buildIntentCelebrationMatch, ensureMatch, refresh, user],
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
      const isVerified = (profile?.verification_level ?? 0) >= 1 && (peer?.verification_level ?? 0) >= 1;
      const interestOverlapRatio = computeInterestOverlapRatio(myInterests, peerInterests) ?? undefined;
      const peerUserId = peer?.user_id;
      const matchKey = peerUserId && user?.id ? matchKeyFor(user.id, peerUserId) : null;
      const matchMetricsEntry = matchKey ? matchMetrics[matchKey] : undefined;
      const meta = (item.metadata || {}) as any;
      const guessPromptSource = String(meta?.source || '').toLowerCase() === 'guess_prompt';
      const guessPromptCorrect = String(meta?.guess_outcome || '').toLowerCase() === 'correct';
      const isGuessPromptIntent = item.type === 'connect' && guessPromptSource && guessPromptCorrect;
      const photos = Array.isArray(peer?.photos) ? peer?.photos.filter(Boolean) : [];
      const previewPhotos = photos.slice(0, 3);
      const avatarUri = peer?.avatar_url ?? previewPhotos[0] ?? null;
      const primaryPhoto = previewPhotos[0] ?? null;
      const secondaryPhotos = previewPhotos.slice(1, 3);
      const singlePhotoDuplicatesAvatar = Boolean(primaryPhoto) && Boolean(avatarUri) && secondaryPhotos.length === 0 && primaryPhoto === avatarUri;
      const hasMultiPhotoGallery = Boolean(primaryPhoto) && secondaryPhotos.length > 0;
      const hasSinglePhotoTile = Boolean(primaryPhoto) && secondaryPhotos.length === 0 && !singlePhotoDuplicatesAvatar;
      const timeLabel = timeAgo(item.created_at);
      const expiry = item.status === 'pending' && !isExpired(item) ? expiresIn(item.expires_at) : null;
      const hoursLeft = item.status === 'pending' && !isExpired(item) ? hoursUntil(item.expires_at) : null;
      const urgent = typeof hoursLeft === 'number' ? hoursLeft <= 6 : false;
      const lastChance = typeof hoursLeft === 'number' ? hoursLeft <= 0.5 : false;
      const quickReply = isGuessPromptIntent
        ? `Nice guess${name ? `, ${name}` : ''}. What made you choose that answer?`
        : buildQuickReplyText({
            name,
            itemType: item.type,
            note: item.message ?? null,
            sharedInterests,
            location: location || null,
          });

      const pendingExpired = item.status === 'pending' && isExpired(item);
      const actionable = item.status === 'pending' && !isExpired(item);
      const canMessage = item.status === 'accepted';
      const autoClosedByMatch =
        (item.status === 'matched' ||
          (item.status === 'passed' &&
            (String(((item.metadata || {}) as any)?.auto_closed_by || '').toLowerCase() === 'match' ||
              Boolean(((item.metadata || {}) as any)?.match_id)))) ||
        false;
      const canResend = !isIncoming && item.status !== 'pending' && item.status !== 'accepted' && !autoClosedByMatch;
      const canOpenChat = !actionable && (canMessage || autoClosedByMatch);
      const isClosedCard = !autoClosedByMatch && (pendingExpired || item.status === 'passed' || item.status === 'expired' || item.status === 'cancelled');
      const statusLabel =
        pendingExpired
          ? 'Expired'
          : item.status === 'pending'
            ? (isIncoming ? 'New' : 'Sent')
            : item.status === 'accepted'
              ? 'Accepted'
              : autoClosedByMatch
                ? 'Matched'
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
                : autoClosedByMatch
                  ? 'info'
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
      const conversationSignal =
        item.status === 'accepted' || autoClosedByMatch
          ? getIntentConversationSignal({
              messageCount: matchMetricsEntry?.messageCount,
              firstReplyHours: matchMetricsEntry?.firstReplyHours,
              bothVerified: isVerified,
              interestOverlapRatio,
            })
          : null;
      const trustSignals = getIntentTrustSignals({
        verificationLevel: peer?.verification_level,
        peerInterests,
        lookingFor: peer?.looking_for,
      });
      const headerSignals: { label: string; tone: 'accent' | 'tint' | 'soft' }[] = [];
      const pushHeaderSignal = (label: string | null | undefined, tone: 'accent' | 'tint' | 'soft') => {
        if (!label) return;
        if (headerSignals.some((entry) => entry.label.toLowerCase() === String(label).toLowerCase())) return;
        headerSignals.push({ label, tone });
      };
      pushHeaderSignal(conversationSignal, 'accent');
      pushHeaderSignal(trustSignals[0] ?? null, 'tint');
      if (sameGoals) pushHeaderSignal('Intent shared', 'soft');
      if (sharedValues) pushHeaderSignal('Shared values', 'soft');
      if (sameRegion) pushHeaderSignal('Same region', 'soft');
      const whyChips = [
        sharedValues ? 'Shared values' : null,
        sameGoals ? 'Same goals' : null,
        sameRegion ? 'Same region' : null,
      ].filter(Boolean).slice(0, 1) as string[];
      const displayMessage = isGuessPromptIntent
        ? isIncoming
          ? `${name} got your prompt right and would like to know more about you.`
          : `You got ${name}'s prompt right and asked to know more.`
        : typeof item.message === 'string' && item.message.trim().length > 0
          ? item.message.trim()
          : null;
      const singlePhotoChip = whyChips[0] ?? null;
      const singlePhotoHeadline = displayMessage
        ? displayMessage
        : item.status === 'accepted'
          ? 'A more intentional fit.'
          : highlightIncoming
            ? 'Worth a closer look.'
            : 'A calm, promising match.';
      const _singlePhotoSupport = sharedInterests.length > 0
        ? sharedInterests.slice(0, 2).join(' · ')
        : sharedInterests.length > 0
          ? `Common: ${sharedInterests.slice(0, 2).join(' · ')}`
          : whyChips.length > 0
            ? whyChips.join(' · ')
            : item.status === 'accepted'
              ? 'Shared signals suggest a smoother conversation.'
              : 'Shared context can make the first move easier.';

      const singlePhotoPanelChip =
        singlePhotoChip && headerSignals.some((entry) => entry.label.toLowerCase() === singlePhotoChip.toLowerCase())
          ? null
          : singlePhotoChip;
      const singlePhotoPanelSupport = sharedInterests.length > 0
        ? sharedInterests.slice(0, 2).join(' · ')
        : whyChips.length > 1
          ? whyChips.slice(1).join(' · ')
          : item.status === 'accepted'
            ? 'Shared context can make the next step easier.'
            : highlightIncoming
              ? 'Shared context can make the first move easier.'
              : 'A softer way to keep momentum going.';

      const closedPreviewUri = primaryPhoto ?? avatarUri;
      const closedStateTitle = pendingExpired
        ? 'This request expired.'
        : item.status === 'passed'
          ? 'Passed for now.'
          : item.status === 'cancelled'
            ? 'This request was cancelled.'
            : 'This request is closed.';
      const closedStateBody = canResend
        ? 'The timing can change. Reopen the door only if it still feels right.'
        : pendingExpired
          ? 'The window closed, but you can still revisit the profile or move toward fresher signals.'
          : 'Keep the profile for context, then follow the strongest momentum elsewhere.';

      return (
        <Animated.View>
          <Animated.View
            style={[
              styles.card,
              isClosedCard && styles.cardClosed,
              highlightIncoming && styles.cardIncoming,
              highlightIncoming && urgent && styles.cardIncomingUrgent,
              deepLinkRequestId && item.id === deepLinkRequestId && styles.cardDeepLinked,
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
          <View style={styles.requestHeroRow}>
            <View style={styles.requestAvatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.requestAvatarImage} />
              ) : (
                <View style={styles.requestAvatarFallback}>
                  <MaterialCommunityIcons name="account-circle" size={42} color={theme.textMuted} />
                </View>
              )}
            </View>
            <View style={styles.requestContent}>
              <View style={styles.requestHeaderRow}>
                <View style={styles.requestTitleWrap}>
                  <Text style={styles.requestName}>{name}</Text>
                  <Text style={styles.requestMeta}>{location || 'Location hidden'}</Text>
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
              <View style={styles.badgeRow}>
                <View style={styles.typeBadge}>
                  <MaterialCommunityIcons name={typeIcon(item)} size={12} color={theme.tint} />
                  <Text style={styles.typeBadgeText}>{typeLabel(item)}</Text>
                </View>
                {headerSignals.slice(0, 1).map((signal) => (
                  <View
                    key={`${item.id}-${signal.label}`}
                    style={[
                      styles.signalBadge,
                      signal.tone === 'accent' && styles.signalBadgeAccent,
                      signal.tone === 'tint' && styles.signalBadgeTint,
                      signal.tone === 'soft' && styles.signalBadgeSoft,
                    ]}
                  >
                    <Text
                      style={[
                        styles.signalBadgeText,
                        signal.tone === 'accent' && styles.signalBadgeTextAccent,
                        signal.tone === 'tint' && styles.signalBadgeTextTint,
                        signal.tone === 'soft' && styles.signalBadgeTextSoft,
                      ]}
                    >
                      {signal.label}
                    </Text>
                  </View>
                ))}
                <View style={styles.badgeRowSpacer} />
                <Text style={styles.timeLabel}>{timeLabel}</Text>
              </View>
              {expiry ? (
                <View style={styles.expiryRow}>
                  <View style={styles.pillWrap}>
                    <PillPulse active={urgent} reduceMotion={reduceMotion} color={lastChance ? '#ef4444' : theme.accent} />
                    <View style={[styles.expiryPill, urgent && styles.expiryPillUrgent]}>
                      <MaterialCommunityIcons
                        name={urgent ? 'timer-off-outline' : 'timer-outline'}
                        size={12}
                        color={urgent ? '#ef4444' : theme.accent}
                      />
                      <Text style={[styles.expiryLabel, urgent && styles.expiryLabelUrgent]}>{`Expires in ${expiry}`}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
              {displayMessage ? (
                <Text style={styles.requestMessage} numberOfLines={3}>
                  {displayMessage}
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

              {autoClosedByMatch ? (
                <View style={styles.matchedHintRow}>
                  <MaterialCommunityIcons name="chat-outline" size={14} color={theme.tint} />
                  <Text style={styles.matchedHintText}>You matched, continue in chat.</Text>
                </View>
              ) : null}
            </View>
          </View>

          {whyChips.length > 0 && !hasSinglePhotoTile ? (
            <View style={styles.whyRow}>
              {whyChips.map((tag) => (
                <View key={`${item.id}-${tag}`} style={styles.whyChip}>
                  <Text style={styles.whyChipText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {isClosedCard ? (
            <View style={styles.closedStatePanel}>
              {closedPreviewUri ? (
                <View style={styles.closedStateMediaWrap}>
                  <Image source={{ uri: closedPreviewUri }} style={styles.closedStateMedia} resizeMode="cover" />
                </View>
              ) : null}
              <View style={styles.closedStateBody}>
                <Text style={styles.closedStateTitle}>{closedStateTitle}</Text>
                <Text style={styles.closedStateText}>{closedStateBody}</Text>
              </View>
            </View>
          ) : null}

          {!isClosedCard && hasMultiPhotoGallery ? (
            <View style={styles.requestGalleryRow}>
              <View style={styles.requestGalleryPrimaryWrap}>
                <View pointerEvents="none" style={styles.requestGalleryPlate} />
                <Image source={{ uri: primaryPhoto! }} style={styles.requestGalleryPrimaryImage} resizeMode="cover" />
              </View>
              <View style={styles.requestGallerySecondaryColumn}>
                {secondaryPhotos.map((uri, idx) => (
                  <View
                    key={`${peerId}-gallery-${idx}`}
                    style={[
                      styles.requestGallerySecondaryFrame,
                      idx === 1 && styles.requestGallerySecondaryFrameOffset,
                    ]}
                  >
                    <View pointerEvents="none" style={styles.requestGallerySecondaryPlate} />
                    <ExpoImage
                      source={{ uri }}
                      style={styles.requestGallerySecondaryImage}
                      contentFit="cover"
                      contentPosition="top center"
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {!isClosedCard && hasSinglePhotoTile ? (
            <View style={styles.requestSingleFeatureRow}>
              <View style={styles.requestSingleMediaWrap}>
                <View pointerEvents="none" style={styles.requestSingleMediaPlate} />
                <Image source={{ uri: primaryPhoto! }} style={styles.requestSingleMediaImage} resizeMode="cover" />
              </View>
              <View style={styles.requestSingleDetailPanel}>
                {singlePhotoPanelChip ? (
                  <View style={styles.requestSingleChipRow}>
                    <View style={styles.requestSingleChip}>
                      <Text style={styles.requestSingleChipText}>{singlePhotoPanelChip}</Text>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.requestSingleHeadline} numberOfLines={2}>
                  {singlePhotoHeadline}
                </Text>
                <Text style={styles.requestSingleSupport} numberOfLines={2}>
                  {singlePhotoPanelSupport}
                </Text>
              </View>
            </View>
          ) : null}

          {sharedInterests.length > 0 && !hasSinglePhotoTile && !isClosedCard ? (
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

          <View style={[styles.actionsRow, hasSinglePhotoTile && styles.actionsRowSingleMedia]}>
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

            {isClosedCard ? (
              <>
                {!isIncoming && canResend ? (
                  <AnimatedPressable
                    reduceMotion={reduceMotion}
                    onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    onPress={() => resendIntent(peerId, peer?.full_name ?? null, item.type, quickReply)}
                    style={[styles.primaryButton, styles.actionWide]}
                  >
                    <Text style={styles.primaryText}>Send again</Text>
                  </AnimatedPressable>
                ) : (
                  <AnimatedPressable
                    reduceMotion={reduceMotion}
                    onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    onPress={() => router.push('/(tabs)/vibes')}
                    style={[styles.ghostButton, styles.actionWide]}
                  >
                    <Text style={styles.ghostText}>See similar people</Text>
                  </AnimatedPressable>
                )}
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => router.push({ pathname: '/profile-view', params: { profileId: String(peerId) } })}
                  style={[styles.profileButton, styles.actionWide]}
                >
                  <Text style={styles.profileText}>View profile</Text>
                </AnimatedPressable>
              </>
            ) : null}

            {!isClosedCard && canOpenChat ? (
              <>
                <AnimatedPressable
                  reduceMotion={reduceMotion}
                  onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  onPress={() => openChat(peerId, name, peer?.avatar_url, autoClosedByMatch ? quickReply : null)}
                  style={[styles.primaryButton, styles.actionWide]}
                >
                  <Text style={styles.primaryText}>{canMessage ? 'Message' : 'Open chat'}</Text>
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

            {!isClosedCard && canResend ? (
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
      deepLinkRequestId,
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
      void fireSuggestedMoveEvent(item.id, 'intent_opened', buildSuggestedMoveTelemetry(item, {
        intent_type: buildIntentType(item),
      }));
      setSuggestedSend({ id: item.id, phase: 'loading' });
      setIntentTarget({ id: item.id, name: item.full_name ?? null });
      setIntentPrefill(buildOpenerText(item));
      setIntentDefaultType(buildIntentType(item));
      setIntentSheetOpen(true);
    },
    [currentProfileId, suggestedExpanded, suggestedMoves],
  );

  const handleIntentSent = useCallback(() => {
    if (!intentTarget?.id) return;
    const sentItem = suggestedMoves.find((item) => item.id === intentTarget.id);
    void fireSuggestedMoveEvent(
      intentTarget.id,
      'intent_sent',
      sentItem ? buildSuggestedMoveTelemetry(sentItem, { source: 'intent_sheet' }) : { source: 'intent_sheet' },
    );
    void upsertSignal(intentTarget.id, { openedDelta: 1, liked: true, dwellDelta: 3 });

    // Micro delight: brief success pulse before removing the card.
    setSuggestedSend({ id: intentTarget.id, phase: 'success' });
    if (suggestedSendTimerRef.current) clearTimeout(suggestedSendTimerRef.current);
    suggestedSendTimerRef.current = setTimeout(() => {
      setSuggestedMoves((prev) => prev.filter((item) => item.id !== intentTarget.id));
      setSuggestedSend({ id: null, phase: 'idle' });
      suggestedSendTimerRef.current = null;
    }, 520);
  }, [currentProfileId, intentTarget?.id, suggestedExpanded, suggestedMoves, upsertSignal]);

  useEffect(() => {
    return () => {
      if (suggestedSendTimerRef.current) clearTimeout(suggestedSendTimerRef.current);
    };
  }, []);

  const getSuggestedEventContext = (candidateId?: string | null) => {
    const visible = suggestedExpanded ? suggestedMoves : suggestedMoves.slice(0, 3);
    const slotIndex = candidateId ? visible.findIndex((item) => item.id === candidateId) : -1;
    return {
      slotIndex: slotIndex >= 0 ? slotIndex : null,
      isHero: slotIndex === 0,
    };
  };

  const fireSuggestedMoveEvent = async (
    candidateId: string | null | undefined,
    eventType: SuggestedMoveEventType,
    metadata?: Record<string, unknown>,
  ) => {
    if (!currentProfileId || !candidateId) return;
    const { slotIndex, isHero } = getSuggestedEventContext(candidateId);
    const { error } = await supabase.rpc('rpc_log_suggested_move_event', {
      p_viewer_profile_id: currentProfileId,
      p_candidate_profile_id: candidateId,
      p_event_type: eventType,
      p_surface: 'intent_suggested',
      p_batch_key: suggestedBatchKeyRef.current ?? undefined,
      p_slot_index: slotIndex ?? undefined,
      p_is_hero: isHero,
      p_metadata: metadata ?? {},
    });
    if (error) {
      console.log('[intent] suggested move event error', eventType, error);
    }
  };

  const renderSuggestedCard = useCallback(
    ({ item }: { item: SuggestedMove }) => {
      const prompt = buildMovePrompt(item);
      const tags = buildSuggestedDisplayTags(item, 2);
      return (
        <View style={styles.suggestedCard}>
          <View pointerEvents="none" style={styles.suggestedGlow} />
          <View pointerEvents="none" style={styles.suggestedGlowSoft} />
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
            <View style={styles.suggestedMediaWrap}>
              <View pointerEvents="none" style={styles.suggestedMediaPlate} />
              <View style={styles.suggestedMediaFrame}>
                {item.avatar_url ? (
                  <ExpoImage
                    source={{ uri: item.avatar_url }}
                    style={styles.suggestedAvatar}
                    contentFit="cover"
                    contentPosition="top center"
                  />
                ) : (
                  <View style={styles.suggestedAvatarFallback}>
                    <MaterialCommunityIcons name="account-circle" size={42} color={theme.textMuted} />
                  </View>
                )}
              </View>
            </View>
            <View style={styles.suggestedInfo}>
              <View style={styles.suggestedKickerRow}>
                <MaterialCommunityIcons name="star-four-points" size={12} color={theme.tint} />
                <Text style={styles.suggestedKicker}>MORE FOR YOU</Text>
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
              <View style={styles.suggestedPrimaryIconWrap}>
                <MaterialCommunityIcons name="send" size={14} color={Colors.light.background} />
              </View>
              <Text style={styles.suggestedPrimaryText}>Send intent</Text>
              <CheckPulse active={suggestedSend.id === item.id && suggestedSend.phase === 'success'} tint={Colors.light.background} />
            </AnimatedPressable>
            <AnimatedPressable
              reduceMotion={reduceMotion}
              onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onPress={() => {
                void fireSuggestedMoveEvent(item.id, 'preview_profile', buildSuggestedMoveTelemetry(item, { source: 'suggested_card' }));
                void upsertSignal(item.id, { openedDelta: 1, dwellDelta: 5 });
                router.push({ pathname: '/profile-view', params: { profileId: String(item.id) } });
              }}
              style={styles.suggestedSecondary}
            >
              <Text style={styles.suggestedSecondaryText}>View profile</Text>
              <MaterialCommunityIcons name="arrow-top-right" size={13} color={theme.textMuted} />
            </AnimatedPressable>
          </View>
        </View>
      );
    },
    [currentProfileId, handleSuggestedRequest, reduceMotion, router, styles, suggestedExpanded, suggestedMoves, suggestedSend.id, suggestedSend.phase, theme.textMuted, upsertSignal],
  );

  const suggestedVisible = useMemo(
    () => (suggestedExpanded ? suggestedMoves : suggestedMoves.slice(0, 3)),
    [suggestedExpanded, suggestedMoves],
  );
  const shouldShowSuggested = direction === 'incoming' && suggestedVisible.length > 0;
  const suggestedPoolIsThin =
    direction === 'incoming' && !suggestedLoading && !suggestedError && suggestedMoves.length > 0 && suggestedMoves.length < 3;
  const suggestedPoolEmpty =
    direction === 'incoming' && !suggestedLoading && !suggestedError && suggestedMoves.length === 0;
  const suggestedNoticeOwnsEmptyState =
    direction === 'incoming' && sortedFiltered.length === 0 && (suggestedPoolIsThin || suggestedPoolEmpty);
  const suggestedHero = suggestedVisible.length > 0 ? suggestedVisible[0] : null;
  const suggestedRest = suggestedVisible.length > 1 ? suggestedVisible.slice(1) : [];
  const [heroOpenerRevealed, setHeroOpenerRevealed] = useState(false);

  const renderSuggestedPoolNotice = useCallback(
    (mode: 'thin' | 'empty') => (
      <View style={styles.suggestedPoolNotice}>
        <View style={styles.suggestedPoolNoticeIcon}>
          <MaterialCommunityIcons
            name={mode === 'thin' ? 'compass-outline' : 'map-search-outline'}
            size={18}
            color={theme.tint}
          />
        </View>
        <View style={styles.suggestedPoolNoticeBody}>
          <Text style={styles.suggestedPoolNoticeTitle}>
            {mode === 'thin' ? 'Fewer strong fits right now' : 'No fresh coach picks yet'}
          </Text>
          <Text style={styles.suggestedPoolNoticeText}>
            {mode === 'thin'
              ? 'You have already worked through most of the strongest matches. Check Vibes for fresh people nearby.'
              : 'Your strongest matches are tapped out for now. Browse Vibes or Explore while the pool refreshes.'}
          </Text>
          <View style={styles.suggestedPoolNoticeActions}>
            <TouchableOpacity style={styles.ghostButton} onPress={() => router.push('/(tabs)/vibes')}>
              <Text style={styles.ghostText}>Go to Vibes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(tabs)/explore')}>
              <Text style={styles.secondaryText}>Explore more</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    ),
    [router, styles, theme.tint],
  );

  useEffect(() => {
    const signature = suggestedMoves.map((item) => item.id).join(',');
    if (!signature || !currentProfileId) {
      suggestedBatchSignatureRef.current = '';
      suggestedBatchKeyRef.current = null;
      loggedSuggestedImpressionsRef.current = new Set();
      return;
    }

    if (signature !== suggestedBatchSignatureRef.current) {
      suggestedBatchSignatureRef.current = signature;
      suggestedBatchKeyRef.current = `${currentProfileId}:${Date.now()}:${suggestedRetryKey}:${suggestedMoves.length}`;
      loggedSuggestedImpressionsRef.current = new Set();
    }
  }, [currentProfileId, suggestedMoves, suggestedRetryKey]);

  useEffect(() => {
    if (!shouldShowSuggested || suggestedLoading || !currentProfileId) return;

    suggestedVisible.forEach((item) => {
      const key = `${suggestedBatchKeyRef.current ?? 'no-batch'}:${item.id}`;
      if (loggedSuggestedImpressionsRef.current.has(key)) return;
      loggedSuggestedImpressionsRef.current.add(key);
      void fireSuggestedMoveEvent(item.id, 'impression', buildSuggestedMoveTelemetry(item));
    });
  }, [currentProfileId, shouldShowSuggested, suggestedExpanded, suggestedLoading, suggestedMoves, suggestedVisible]);

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
      const prompt = buildMovePrompt(item);
      const opener = buildOpenerText(item);
      const tags = buildSuggestedDisplayTags(item, 2);
      const heroPalette: [string, string, string] = isDark
        ? ['#132324', '#1A2A2B', '#223033']
        : ['#173236', '#1D3A3E', '#28474A'];
      const heroFooterPalette: [string, string] = isDark
        ? ['rgba(0,160,160,0.84)', 'rgba(125,91,166,0.86)']
        : ['rgba(15,158,154,0.88)', 'rgba(125,91,166,0.84)'];

      return (
        <View style={styles.suggestedHeroCard}>
          <View pointerEvents="none" style={styles.suggestedHeroGlow} />
          <LinearGradient colors={heroPalette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.suggestedHeroStage}>
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
                <View style={styles.suggestedHeroEyebrow}>
                  <MaterialCommunityIcons name="star-four-points" size={12} color={theme.tint} />
                  <Text style={styles.suggestedHeroEyebrowText}>Top pick</Text>
                </View>
                <View style={styles.suggestedHeroCoachMark}>
                  <MaterialCommunityIcons
                    name="star-shooting"
                    size={12}
                    color={isDark ? 'rgba(232,240,237,0.68)' : 'rgba(255,250,245,0.88)'}
                  />
                  <Text style={styles.suggestedHeroCoachText}>Betweener select</Text>
                </View>
              </View>

              <View style={styles.suggestedHeroEditorialRow}>
                <View style={styles.suggestedHeroMediaWrap}>
                  <View pointerEvents="none" style={styles.suggestedHeroMediaPlate} />
                  <View style={styles.suggestedHeroMediaFrame}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.suggestedHeroAvatar} />
                    ) : (
                      <View style={styles.suggestedHeroAvatarFallback}>
                        <MaterialCommunityIcons name="account-circle" size={52} color={theme.textMuted} />
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.suggestedHeroInfo}>
                  <Text style={styles.suggestedHeroName}>
                    {`${item.full_name ?? 'Someone'}${item.age ? `, ${item.age}` : ''}`}
                  </Text>
                  <Text style={styles.suggestedHeroPrompt}>{prompt}</Text>
                  {tags.length ? (
                    <View style={styles.suggestedHeroMetaRow}>
                      {tags.map((tag, index) => (
                        <View key={`${item.id}-${tag}`} style={styles.suggestedHeroMetaItem}>
                          {index > 0 ? <View style={styles.suggestedHeroMetaDot} /> : null}
                          <Text style={styles.suggestedHeroMetaText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {heroOpenerRevealed ? (
                    <Text style={styles.suggestedHeroOpener} numberOfLines={3}>
                      {`"${opener}"`}
                    </Text>
                  ) : (
                    <RevealCue active={!heroOpenerRevealed} reduceMotion={reduceMotion}>
                      <AnimatedPressable
                        style={styles.suggestedHeroReveal}
                        reduceMotion={reduceMotion}
                        onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                        onPress={() => {
                          void fireSuggestedMoveEvent(item.id, 'opener_revealed', buildSuggestedMoveTelemetry(item, {
                            prompt_title: item.prompt_title ?? null,
                          }));
                          setHeroOpenerRevealed(true);
                        }}
                      >
                        <MaterialCommunityIcons
                          name="message-text-outline"
                          size={14}
                          color={isDark ? '#86D8D2' : '#CFF9F5'}
                        />
                        <Text style={styles.suggestedHeroRevealText}>Reveal opener</Text>
                      </AnimatedPressable>
                    </RevealCue>
                  )}
                </View>
              </View>
            </AnimatedPressable>
          </LinearGradient>

          <LinearGradient colors={heroFooterPalette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.suggestedHeroFooterBand}>
            <AnimatedPressable
              reduceMotion={reduceMotion}
              onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onPress={() => handleSuggestedRequest(item)}
              style={styles.suggestedHeroPrimary}
            >
              <View style={styles.suggestedHeroPrimaryIconWrap}>
                <MaterialCommunityIcons name="send" size={15} color={Colors.light.background} />
              </View>
              <Text style={styles.suggestedHeroPrimaryText}>Send intent</Text>
              <CheckPulse active={suggestedSend.id === item.id && suggestedSend.phase === 'success'} tint={Colors.light.background} />
            </AnimatedPressable>
            <AnimatedPressable
              reduceMotion={reduceMotion}
              onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onPress={() => {
                void fireSuggestedMoveEvent(item.id, 'preview_profile', buildSuggestedMoveTelemetry(item, { source: 'suggested_hero' }));
                void upsertSignal(item.id, { openedDelta: 1, dwellDelta: 7 });
                router.push({ pathname: '/profile-view', params: { profileId: String(item.id) } });
              }}
              style={styles.suggestedHeroLink}
            >
              <Text style={styles.suggestedHeroLinkText}>View profile</Text>
              <MaterialCommunityIcons name="arrow-top-right" size={14} color="rgba(255,246,236,0.9)" />
            </AnimatedPressable>
          </LinearGradient>
        </View>
      );
    },
    [
      currentProfileId,
      handleSuggestedRequest,
      heroOpenerRevealed,
      isDark,
      reduceMotion,
      router,
      suggestedExpanded,
      suggestedMoves,
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

  const activeFilterLabel = useMemo(() => {
    const found = filters.find((p) => p.key === filter);
    return found?.label ?? 'Action';
  }, [filter, filters]);

  const filterSummary = useMemo(
    () => `${activeFilterLabel} \u00B7 ${activeTypeLabel === 'All' ? 'All types' : activeTypeLabel}`,
    [activeFilterLabel, activeTypeLabel],
  );

  const nonDefaultFilterCount = useMemo(() => {
    let count = 0;
    if (filter !== 'action') count += 1;
    if (typeFilter !== 'all') count += 1;
    return count;
  }, [filter, typeFilter]);

  const incomingHeaderCopy = useMemo(() => {
    if (filter === 'passed') {
      return {
        icon: 'archive-outline' as const,
        title: 'Passed for now',
        hint: 'Signals you chose not to pursue, kept quietly for context.',
      };
    }

    if (filter === 'accepted') {
      return {
        icon: 'heart-outline' as const,
        title: 'Accepted',
        hint: 'Connections already moving forward.',
      };
    }

    if (filter === 'all') {
      return {
        icon: 'inbox-arrow-down' as const,
        title: 'Inbox',
        hint: 'See every incoming signal in one calm view.',
      };
    }

    return {
      icon: 'inbox-arrow-down' as const,
      title: 'Received',
      hint: 'Respond fast to keep the momentum.',
    };
  }, [filter]);

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

      <Animated.View entering={enterChips} style={styles.filterBar}>
        <View style={styles.filterSummaryPill}>
          <MaterialCommunityIcons name="tune-variant" size={14} color={theme.tint} />
          <Text style={styles.filterSummaryText} numberOfLines={1}>
            {filterSummary}
          </Text>
        </View>
        <AnimatedPressable
          reduceMotion={reduceMotion}
          onHaptic={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          onPress={() => setTypePickerOpen(true)}
          style={styles.filterTrigger}
        >
          <MaterialCommunityIcons name="filter-variant" size={16} color={theme.tint} />
          <Text style={styles.filterTriggerText}>Filter</Text>
          {nonDefaultFilterCount > 0 ? (
            <View style={styles.filterTriggerCount}>
              <Text style={styles.filterTriggerCountText}>{nonDefaultFilterCount}</Text>
            </View>
          ) : null}
        </AnimatedPressable>
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
            ref={listRef as any}
            data={sortedFiltered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            extraData={sortedFiltered.length}
            onScrollToIndexFailed={onScrollToIndexFailed as any}
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
                      <MaterialCommunityIcons name={incomingHeaderCopy.icon} size={16} color={theme.tint} />
                      <Text style={styles.inboxHeaderTitle}>{incomingHeaderCopy.title}</Text>
                      <View style={styles.inboxCountPill}>
                        <Text style={styles.inboxCountText}>{sortedFiltered.length}</Text>
                      </View>
                    </View>
                    <Text style={styles.inboxHeaderHint}>{incomingHeaderCopy.hint}</Text>
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
                  {suggestedPoolIsThin ? renderSuggestedPoolNotice('thin') : null}
                </Animated.View>
              ) : (
                <View style={styles.suggestedNoticeStack}>
                  {suggestedPoolEmpty ? renderSuggestedPoolNotice('empty') : null}
                  <View style={styles.suggestedMetaRow}>
                    <Text style={styles.emptyHint}>
                      {suggestedPoolEmpty ? 'Refresh after you explore a few more people.' : 'Fresh suggestions are on the way.'}
                    </Text>
                    <TouchableOpacity style={styles.ghostButton} onPress={retrySuggested}>
                      <Text style={styles.ghostText}>Refresh</Text>
                    </TouchableOpacity>
                  </View>
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
                    {suggestedPoolIsThin ? renderSuggestedPoolNotice('thin') : null}
                  </Animated.View>
                ) : (
                  <View style={styles.suggestedNoticeStack}>
                    {suggestedPoolEmpty ? renderSuggestedPoolNotice('empty') : null}
                    <View style={styles.suggestedMetaRow}>
                      <Text style={styles.emptyHint}>
                        {suggestedPoolEmpty ? 'Refresh after you explore a few more people.' : 'Fresh suggestions are on the way.'}
                      </Text>
                      <TouchableOpacity style={styles.ghostButton} onPress={retrySuggested}>
                        <Text style={styles.ghostText}>Refresh</Text>
                      </TouchableOpacity>
                    </View>
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
                  <View style={styles.emptyBadge}>
                    <Text style={styles.emptyBadgeText}>
                      {direction === 'incoming' ? 'Intent inbox' : 'Sent energy'}
                    </Text>
                  </View>
                  <Text style={styles.emptyText}>{emptyCopy}</Text>
                  {filter === 'action' && direction === 'incoming' && !hasPendingIncoming ? (
                    <Text style={styles.emptyHint}>Make the first move.</Text>
                  ) : null}
                  <View style={styles.emptyHighlights}>
                    <View style={styles.emptyHighlightCard}>
                      <MaterialCommunityIcons name="message-draw" size={18} color={theme.tint} />
                      <Text style={styles.emptyHighlightTitle}>Intent works best with clarity</Text>
                      <Text style={styles.emptyHighlightBody}>A short note or direct request feels stronger than passive waiting.</Text>
                    </View>
                    <View style={styles.emptyHighlightCard}>
                      <MaterialCommunityIcons name="star-four-points" size={18} color={theme.accent} />
                      <Text style={styles.emptyHighlightTitle}>Premium momentum</Text>
                      <Text style={styles.emptyHighlightBody}>Likes, Moments, and profile prompts give people better reasons to respond.</Text>
                    </View>
                  </View>
                  {!suggestedNoticeOwnsEmptyState ? (
                    <View style={styles.emptyActions}>
                      <TouchableOpacity style={styles.ghostButton} onPress={() => router.push('/(tabs)/vibes')}>
                        <Text style={styles.ghostText}>Go to Vibes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/(tabs)/explore')}>
                        <Text style={styles.secondaryText}>Explore Circles</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
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

      <MatchModal
        visible={!!celebrationMatch}
        match={celebrationMatch}
        onClose={() => setCelebrationMatch(null)}
        onKeepDiscovering={() => setCelebrationMatch(null)}
        onSendMessage={(match) => {
          const peerId = match?.id ?? null;
          const peerName = match?.name ?? 'Request';
          const peerAvatar = match?.avatar_url ?? null;
          const peerInterests = peerId && Array.isArray(interestsByProfile[peerId]) ? interestsByProfile[peerId] : [];
          const sharedInterests = myInterests.length ? peerInterests.filter((i) => myInterests.includes(i)).slice(0, 2) : [];
          const peerProfile = peerId ? profiles[peerId] : undefined;
          const reply = buildQuickReplyText({
            name: peerName,
            itemType: 'connect',
            note: null,
            sharedInterests,
            location: peerProfile?.city || peerProfile?.region || peerProfile?.location || null,
          });
          setCelebrationMatch(null);
          openChat(peerId, peerName, peerAvatar, reply);
        }}
      />

      <Modal visible={typePickerOpen} transparent animationType="fade" onRequestClose={() => setTypePickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={styles.pickerBackdropPress} onPress={() => setTypePickerOpen(false)} />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Filters</Text>
              <TouchableOpacity style={styles.pickerClose} onPress={() => setTypePickerOpen(false)} activeOpacity={0.85}>
                <MaterialCommunityIcons name="close" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.pickerSection}>
              <Text style={styles.pickerSectionTitle}>Status</Text>
              {filters.map((pill) => {
                const active = pill.key === filter;
                return (
                  <TouchableOpacity
                    key={pill.key}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                    onPress={() => setFilter(pill.key)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.pickerIcon, active && styles.pickerIconActive]}>
                      <MaterialCommunityIcons
                        name={
                          pill.key === 'action'
                            ? 'gesture-tap-button'
                            : pill.key === 'accepted'
                              ? 'check-circle-outline'
                              : pill.key === 'passed'
                                ? 'skip-next-circle-outline'
                                : 'layers-outline'
                        }
                        size={18}
                        color={active ? Colors.light.background : theme.tint}
                      />
                    </View>
                    <Text style={[styles.pickerRowText, active && styles.pickerRowTextActive]}>{pill.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.pickerSection}>
              <Text style={styles.pickerSectionTitle}>Type</Text>
            {typePills.map((pill) => {
              const active = pill.key === typeFilter;
              return (
                <TouchableOpacity
                  key={pill.key}
                  style={[styles.pickerRow, active && styles.pickerRowActive]}
                  onPress={() => {
                    setTypeFilter(pill.key);
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

            <View style={styles.pickerFooter}>
              <TouchableOpacity
                style={styles.pickerReset}
                onPress={() => {
                  setFilter('action');
                  setTypeFilter('all');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.pickerResetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerApply} onPress={() => setTypePickerOpen(false)} activeOpacity={0.85}>
                <Text style={styles.pickerApplyText}>Done</Text>
              </TouchableOpacity>
            </View>
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
      top: 2,
      bottom: 2,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.74)' : theme.tint,
      backgroundColor: isDark ? 'rgba(0,160,160,0.84)' : theme.tint,
    },
    togglePill: {
      flex: 1,
      minHeight: 40,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(31,42,42,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.015)' : theme.backgroundSubtle,
    },
    togglePillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    togglePillActiveGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
    toggleText: { fontSize: 12, lineHeight: 14, paddingBottom: 1, color: theme.textMuted, fontWeight: '600' },
    toggleTextActive: { color: Colors.light.background },
    filterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      gap: 10,
      marginTop: 4,
    },
    filterSummaryPill: {
      flex: 1,
      minHeight: 32,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.018)' : 'rgba(31,42,42,0.035)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.008)' : 'rgba(255,255,255,0.12)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    filterSummaryText: { flex: 1, fontSize: 11, color: theme.textMuted, fontWeight: '600' },
    filterTrigger: {
      minHeight: 36,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,128,128,0.12)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.028)' : 'rgba(255,255,255,0.30)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    filterTriggerText: { fontSize: 12, color: theme.tint, fontWeight: '700' },
    filterTriggerCount: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.tint,
    },
    filterTriggerCountText: { fontSize: 10, fontWeight: '800', color: Colors.light.background },
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
    cardClosed: {
      borderColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(31,42,42,0.05)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.018)' : 'rgba(255,250,245,0.72)',
      shadowOpacity: isDark ? 0.14 : 0.04,
      elevation: 1,
    },
    cardIncoming: {
      borderColor: isDark ? 'rgba(0,160,160,0.35)' : 'rgba(0,160,160,0.22)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.06)' : theme.backgroundSubtle,
    },
    cardIncomingUrgent: {
      borderColor: isDark ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.30)',
    },
    cardDeepLinked: {
      borderColor: isDark ? 'rgba(168, 85, 247, 0.55)' : 'rgba(124, 58, 237, 0.40)',
      shadowOpacity: isDark ? 0.34 : 0.14,
      elevation: 6,
    },
    requestHeroRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    requestAvatarWrap: {
      width: 58,
      height: 58,
      borderRadius: 29,
      padding: 2,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.22)' : 'rgba(31,42,42,0.08)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    requestAvatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 27,
      backgroundColor: theme.backgroundSubtle,
    },
    requestAvatarFallback: {
      width: '100%',
      height: '100%',
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    requestContent: {
      flex: 1,
      gap: 8,
      paddingTop: 2,
    },
    requestHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    requestTitleWrap: {
      flex: 1,
      gap: 3,
    },
    requestName: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    requestMeta: {
      fontSize: 12,
      color: theme.textMuted,
    },
    requestMessage: {
      marginTop: 2,
      fontSize: 14,
      lineHeight: 20,
      color: theme.text,
      fontWeight: '600',
    },
    requestGalleryRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      height: 164,
    },
    requestGalleryPrimaryWrap: {
      flex: 1.6,
      height: 164,
      position: 'relative',
    },
    requestGalleryPlate: {
      position: 'absolute',
      left: 10,
      top: 10,
      right: -2,
      bottom: -2,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(255,246,236,0.05)' : 'rgba(255,246,236,0.18)',
      transform: [{ rotate: '-3deg' }],
    },
    requestGalleryPrimaryImage: {
      width: '100%',
      height: '100%',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.22)' : 'rgba(31,42,42,0.08)',
      backgroundColor: theme.backgroundSubtle,
      overflow: 'hidden',
    },
    requestGallerySecondaryColumn: {
      flex: 0.78,
      gap: 10,
      height: 164,
      alignSelf: 'flex-end',
    },
    requestGallerySecondaryFrame: {
      position: 'relative',
      height: 77,
      borderRadius: 18,
      overflow: 'visible',
    },
    requestGallerySecondaryFrameOffset: {
      marginLeft: 10,
    },
    requestGallerySecondaryPlate: {
      position: 'absolute',
      left: 6,
      top: 5,
      right: -1,
      bottom: -1,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255,246,236,0.025)' : 'rgba(255,246,236,0.07)',
      transform: [{ rotate: '-1.75deg' }],
    },
    requestGallerySecondaryImage: {
      width: '100%',
      height: '100%',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.18)' : 'rgba(31,42,42,0.06)',
      backgroundColor: theme.backgroundSubtle,
      overflow: 'hidden',
    },
    requestSingleFeatureRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 14,
    },
    requestSingleMediaWrap: {
      width: 170,
      height: 196,
      position: 'relative',
    },
    requestSingleMediaPlate: {
      position: 'absolute',
      left: 9,
      top: 9,
      right: -1,
      bottom: -1,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(255,246,236,0.05)' : 'rgba(255,246,236,0.16)',
      transform: [{ rotate: '-3deg' }],
    },
    requestSingleMediaImage: {
      width: '100%',
      height: '100%',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.22)' : 'rgba(31,42,42,0.08)',
      backgroundColor: theme.backgroundSubtle,
    },
    requestSingleDetailPanel: {
      flex: 1,
      minHeight: 196,
      paddingVertical: 12,
      justifyContent: 'center',
      gap: 8,
    },
    requestSingleChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    requestSingleChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : 'rgba(0,160,160,0.06)',
    },
    requestSingleChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.tint,
    },
    requestSingleHeadline: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.text,
    },
    requestSingleSupport: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
    },
    closedStatePanel: {
      marginTop: 12,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(31,42,42,0.05)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.34)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    closedStateMediaWrap: {
      width: 72,
      height: 72,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(31,42,42,0.06)',
      backgroundColor: theme.backgroundSubtle,
    },
    closedStateMedia: {
      width: '100%',
      height: '100%',
    },
    closedStateBody: {
      flex: 1,
      gap: 4,
    },
    closedStateTitle: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.text,
    },
    closedStateText: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
    },
    actionsRowSingleMedia: {
      marginTop: 8,
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
      marginTop: 6,
    },
    badgeRowSpacer: { flex: 1 },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.18)' : 'rgba(31,42,42,0.06)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
    },
    typeBadgeText: { fontSize: 11, color: theme.tint, fontWeight: '600' },
    signalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)',
    },
    signalBadgeAccent: {
      borderColor: isDark ? 'rgba(125, 91, 166, 0.22)' : 'rgba(125, 91, 166, 0.12)',
      backgroundColor: isDark ? 'rgba(125, 91, 166, 0.10)' : 'rgba(125, 91, 166, 0.06)',
    },
    signalBadgeTint: {
      borderColor: isDark ? 'rgba(0,160,160,0.18)' : 'rgba(0,128,128,0.10)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.08)' : 'rgba(0,128,128,0.05)',
    },
    signalBadgeSoft: {
      borderColor: isDark ? 'rgba(255,246,236,0.10)' : 'rgba(31,42,42,0.06)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.54)',
    },
    signalBadgeText: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
    signalBadgeTextAccent: { color: theme.accent },
    signalBadgeTextTint: { color: theme.tint },
    signalBadgeTextSoft: { color: theme.textMuted },
    timeLabel: { fontSize: 11, color: theme.textMuted },
    expiryRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
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
    matchedHintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(14, 116, 144, 0.35)' : 'rgba(14, 116, 144, 0.25)',
      backgroundColor: isDark ? 'rgba(14, 116, 144, 0.14)' : 'rgba(14, 116, 144, 0.08)',
    },
    matchedHintText: { flex: 1, fontSize: 12, fontWeight: '800', color: theme.tint },
    whyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    whyChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.14)' : 'rgba(0,128,128,0.08)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.08)' : 'rgba(0,128,128,0.045)',
    },
    whyChipText: { fontSize: 11, fontWeight: '600', color: theme.tint },
    commonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
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
    emptyBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.35)' : 'rgba(0,160,160,0.18)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,160,160,0.08)',
    },
    emptyBadgeText: {
      fontSize: 11,
      color: theme.tint,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    emptyText: { fontSize: 13, color: theme.textMuted, textAlign: 'center' },
    emptyHint: { fontSize: 12, color: theme.textMuted, textAlign: 'center' },
    emptyHighlights: {
      width: '100%',
      gap: 10,
      marginTop: 4,
    },
    emptyHighlightCard: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      paddingHorizontal: 14,
      paddingVertical: 14,
      alignItems: 'flex-start',
    },
    emptyHighlightTitle: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: '800',
      color: theme.text,
    },
    emptyHighlightBody: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
      fontWeight: '600',
    },
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
    suggestedSection: { marginTop: 20, gap: 12 },
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
    suggestedSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
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
    suggestedNoticeStack: { gap: 10 },
    suggestedMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    suggestedPoolNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.28)' : 'rgba(0,160,160,0.16)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : 'rgba(240,253,250,0.92)',
    },
    suggestedPoolNoticeIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.30)' : 'rgba(0,160,160,0.18)',
      backgroundColor: isDark ? 'rgba(15,26,26,0.55)' : theme.background,
    },
    suggestedPoolNoticeBody: { flex: 1, gap: 6 },
    suggestedPoolNoticeTitle: { fontSize: 13, fontWeight: '800', color: theme.text },
    suggestedPoolNoticeText: { fontSize: 12, lineHeight: 18, color: theme.textMuted, fontWeight: '600' },
    suggestedPoolNoticeActions: { flexDirection: 'row', gap: 10, marginTop: 2, flexWrap: 'wrap' },
    suggestedStack: { gap: 10, paddingVertical: 6 },
    suggestedMore: { alignSelf: 'flex-start', paddingHorizontal: 2, paddingVertical: 6 },
    suggestedMoreText: { fontSize: 12, color: theme.tint, fontWeight: '700' },
    suggestedHeroCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.18)' : 'rgba(31,42,42,0.08)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.backgroundSubtle,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: isDark ? 0.24 : 0.10,
      shadowRadius: 28,
      elevation: 8,
    },
    suggestedHeroStage: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
    },
    suggestedHeroGlow: {
      position: 'absolute',
      top: -78,
      right: -56,
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor: theme.accent,
      opacity: isDark ? 0.10 : 0.08,
    },
    suggestedHeroGlow2: {
      position: 'absolute',
      bottom: -104,
      left: -92,
      width: 208,
      height: 208,
      borderRadius: 104,
      backgroundColor: theme.tint,
      opacity: isDark ? 0.06 : 0.05,
    },
    suggestedHeroMain: { gap: 14 },
    suggestedHeroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    suggestedHeroEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    suggestedHeroEyebrowText: {
      fontSize: 11,
      letterSpacing: 1.8,
      color: theme.tint,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    suggestedHeroCoachMark: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,248,241,0.10)',
    },
    suggestedHeroCoachText: {
      fontSize: 11,
      color: isDark ? 'rgba(232,240,237,0.76)' : 'rgba(255,250,245,0.9)',
      fontWeight: '700',
    },
    suggestedHeroEditorialRow: { flexDirection: 'row', alignItems: 'stretch', gap: 18 },
    suggestedHeroMediaWrap: {
      marginLeft: -10,
      marginTop: 8,
      marginBottom: -58,
    },
    suggestedHeroMediaPlate: {
      position: 'absolute',
      left: 10,
      top: 16,
      width: 152,
      height: 204,
      borderRadius: 34,
      backgroundColor: isDark ? 'rgba(255,246,236,0.08)' : 'rgba(255,246,236,0.20)',
      transform: [{ rotate: '-6deg' }],
    },
    suggestedHeroMediaFrame: {
      width: 148,
      height: 198,
      borderRadius: 30,
      padding: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(113, 221, 214, 0.26)' : 'rgba(255,255,255,0.28)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.30 : 0.18,
      shadowRadius: 24,
      elevation: 7,
    },
    suggestedHeroAvatar: { width: '100%', height: '100%', borderRadius: 26, backgroundColor: theme.backgroundSubtle },
    suggestedHeroAvatarFallback: {
      width: '100%',
      height: '100%',
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    suggestedHeroInfo: { flex: 1, gap: 9, paddingTop: 16, paddingBottom: 10 },
    suggestedHeroName: {
      fontSize: 34,
      lineHeight: 38,
      color: '#FFF6EC',
      fontFamily: 'PlayfairDisplay_700Bold',
      maxWidth: 180,
    },
    suggestedHeroPrompt: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? 'rgba(232,240,237,0.84)' : 'rgba(245,235,221,0.84)',
      fontWeight: '600',
    },
    suggestedHeroMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    suggestedHeroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    suggestedHeroMetaDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(232,240,237,0.45)' : 'rgba(245,235,221,0.45)',
    },
    suggestedHeroMetaText: {
      fontSize: 11,
      letterSpacing: 0.3,
      color: isDark ? 'rgba(232,240,237,0.66)' : 'rgba(245,235,221,0.70)',
      fontWeight: '700',
    },
    suggestedHeroOpener: {
      marginTop: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(6,12,12,0.28)' : 'rgba(255,255,255,0.10)',
      color: '#FFF6EC',
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 19,
    },
    suggestedHeroReveal: {
      marginTop: 8,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
      backgroundColor: isDark ? 'rgba(6,12,12,0.14)' : 'rgba(255,255,255,0.06)',
    },
    suggestedHeroRevealText: { color: '#D4FFFB', fontWeight: '800', fontSize: 12 },
    suggestedHeroFooterBand: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 10,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.08)',
    },
    suggestedCard: {
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(31,42,42,0.06)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.026)' : theme.backgroundSubtle,
      overflow: 'hidden',
    },
    suggestedGlow: {
      position: 'absolute',
      top: -74,
      right: -74,
      width: 164,
      height: 164,
      borderRadius: 82,
      backgroundColor: theme.accent,
      opacity: isDark ? 0.07 : 0.045,
    },
    suggestedGlowSoft: {
      position: 'absolute',
      bottom: -54,
      left: -40,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.tint,
      opacity: isDark ? 0.05 : 0.035,
    },
    suggestedMain: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
    suggestedKicker: {
      fontSize: 10,
      letterSpacing: 1.4,
      color: theme.tint,
      fontWeight: '800',
      marginBottom: 2,
    },
    suggestedKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    suggestedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    suggestedMediaWrap: {
      marginLeft: -4,
      marginTop: -2,
    },
    suggestedMediaPlate: {
      position: 'absolute',
      left: 8,
      top: 8,
      width: 94,
      height: 118,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255,246,236,0.06)' : 'rgba(255,246,236,0.18)',
      transform: [{ rotate: '-4deg' }],
    },
    suggestedMediaFrame: {
      width: 90,
      height: 114,
      borderRadius: 19,
      padding: 3,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0,160,160,0.28)' : 'rgba(31,42,42,0.08)',
      backgroundColor: isDark ? 'rgba(0,160,160,0.07)' : 'rgba(255,255,255,0.72)',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 18,
      elevation: 4,
    },
    suggestedAvatar: { width: '100%', height: '100%', borderRadius: 16, backgroundColor: theme.backgroundSubtle },
    suggestedAvatarFallback: {
      width: '100%',
      height: '100%',
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    suggestedInfo: { flex: 1, gap: 6, paddingVertical: 4 },
    suggestedName: { fontSize: 14, fontWeight: '700', color: theme.text },
    suggestedPrompt: { fontSize: 11, lineHeight: 17, color: theme.textMuted, fontWeight: '600' },
    suggestedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    suggestedTag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(31,42,42,0.05)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : theme.background,
    },
    suggestedTagText: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
    suggestedActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    suggestedCtas: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' },
    suggestedPrimary: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    suggestedPrimaryIconWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    suggestedPrimaryText: { color: Colors.light.background, fontWeight: '700', fontSize: 11 },
    suggestedSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 2,
      paddingVertical: 4,
    },
    suggestedSecondaryText: { color: theme.textMuted, fontWeight: '700', fontSize: 11 },
    suggestedHeroPrimary: {
      position: 'relative',
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(255,246,236,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,246,236,0.15)',
    },
    suggestedHeroPrimaryIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    suggestedHeroPrimaryText: { color: Colors.light.background, fontWeight: '800', fontSize: 13 },
    suggestedHeroLink: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 3,
      paddingHorizontal: 4,
    },
    suggestedHeroLinkText: {
      color: 'rgba(255,246,236,0.88)',
      fontWeight: '800',
      fontSize: 12,
    },
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
    pickerSection: { gap: 10, marginBottom: 14 },
    pickerSectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
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
    pickerFooter: { flexDirection: 'row', gap: 10, marginTop: 6 },
    pickerReset: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerResetText: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
    pickerApply: {
      flex: 1.2,
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: theme.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerApplyText: { fontSize: 14, fontWeight: '800', color: Colors.light.background },
  });
