import ProfileVideoModal from '@/components/ProfileVideoModal';
import { VerificationBadge } from '@/components/VerificationBadge';
import Notice from '@/components/ui/Notice';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { computeCompatibilityPercent } from '@/lib/compat/compatibility-score';
import { computeFirstReplyHours, computeInterestOverlapRatio, computeMatchScorePercent } from '@/lib/match/match-score';
import { parseDistanceKmFromLabel } from '@/lib/profile/distance';
import { fetchViewedProfile } from '@/lib/profile/fetch-viewed-profile';
import { getInterestEmoji } from '@/lib/profile/interest-emoji';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import type { UserProfile } from '@/types/user-profile';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ViewToken } from '@shopify/flash-list';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router, useLocalSearchParams } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View, type ImageStyle, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    Extrapolate,
    interpolate,
    interpolateColor,
    runOnJS,
    runOnUI,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type ProfileImageTag = 'intro' | 'lifestyle' | 'prompts' | 'values';

type PremiumImage = {
  id: string;
  uri: string;
  tag: ProfileImageTag;
};

type PremiumSection = {
  id: string;
  tag: ProfileImageTag;
  title: string;
  body: string;
  chips?: string[];
};

type LightboxItem = {
  uri: string;
  tag?: ProfileImageTag;
  title?: string;
  body?: string;
  chips?: string[];
};

type PremiumProfile = {
  id: string;
  name: string;
  age: number;
  location: string;
  verified: boolean;
  distanceKm?: number;
  images: PremiumImage[];
  sections: PremiumSection[];
};

const IMAGE_ITEM_HEIGHT = Math.max(220, Math.min(280, Math.round(screenHeight * 0.26)));
const IMAGE_ITEM_GAP = 12;
const COLUMN_GAP = 14;
const REACTION_ICONS = ['heart', 'fire', 'star', 'emoticon-happy-outline'] as const;

const ACTIVE_VISIBLE_PERCENT_THRESHOLD = 70;
const RIGHT_SCROLL_HOLD_MS = 600;
const ACTIVE_TAG_MIN_INTERVAL_MS = 120;
const ACTIVE_NOW_MS = 3 * 60 * 1000;

// Content heuristics for empty-state branching.
// Goal: "images-only" should trigger unless the profile has real narrative/intent content.
const BIO_MEANINGFUL_MIN_CHARS = 40;
const BIO_MIN_PUBLIC_CHARS = 20;
const LOOKING_FOR_MEANINGFUL_MIN_CHARS = 10;
const INTERESTS_MEANINGFUL_MIN_COUNT = 3;

function formatHeaderTitle(name: string, age: number) {
  if (!name) return '';
  if (!age) return name;
  return `${name}, ${age}`;
}

function toFlagEmoji(code?: string | null) {
  if (!code) return '';
  const normalized = String(code).trim().toUpperCase();
  if (normalized.length !== 2) return '';
  const first = normalized.charCodeAt(0);
  const second = normalized.charCodeAt(1);
  if (first < 65 || first > 90 || second < 65 || second > 90) return '';
  return String.fromCodePoint(0x1f1e6 + (first - 65), 0x1f1e6 + (second - 65));
}

function formatDistanceKm(distanceKm?: number) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) return '';
  if (distanceKm < 1) return '<1 km away';
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`;
  return `${Math.round(distanceKm)} km away`;
}

function buildLocationLine(profile: UserProfile) {
  const distanceLabel = profile.distance?.trim() || '';
  const distanceFromKm = formatDistanceKm(profile.distanceKm);
  const distance = distanceFromKm || distanceLabel;

  const base = (profile.location || profile.city || profile.region || '').trim();
  const combined = distance
    ? base && distance !== base
      ? `${distance} - ${base}`
      : distance
    : base;

  const flag = toFlagEmoji(profile.currentCountryCode);
  return flag ? `${combined} ${flag}` : combined;
}

function isActiveNowFromLastActive(lastActive?: string | null) {
  if (!lastActive) return false;
  const then = new Date(lastActive).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then <= ACTIVE_NOW_MS;
}

function hasMeaningfulText(profile: UserProfile) {
  const bio = (profile.bio || '').trim();
  const lookingFor = (profile.lookingFor || '').trim();
  const interestCount = Array.isArray(profile.interests) ? profile.interests.filter((i) => i?.name).length : 0;

  // Treat these as "meaningful" because they create real conversational/narrative content.
  // Do NOT count basic attributes (work/height/religion/etc.) as meaningful text; those are
  // handled by the auto-generated cards in the images-only path.
  return (
    bio.length >= BIO_MEANINGFUL_MIN_CHARS ||
    lookingFor.length >= LOOKING_FOR_MEANINGFUL_MIN_CHARS ||
    interestCount >= INTERESTS_MEANINGFUL_MIN_COUNT
  );
}

function shouldGateProfile(profile: UserProfile) {
  const hasAnyPhoto =
    (Array.isArray(profile.photos) && profile.photos.some(Boolean)) ||
    !!profile.profilePicture;
  const hasBio = (profile.bio || '').trim().length >= BIO_MIN_PUBLIC_CHARS;
  const hasPrompt = (profile.lookingFor || '').trim().length >= LOOKING_FOR_MEANINGFUL_MIN_CHARS;
  return !(hasAnyPhoto || hasBio || hasPrompt);
}

function parseFallbackProfile(rawParam?: string | string[]): UserProfile | null {
  const raw = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  if (!raw) return null;

  const candidates = [raw, (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })()];

  for (const cand of candidates) {
    try {
      const parsed = JSON.parse(cand || '{}');
      const photos = Array.isArray(parsed.photos) ? parsed.photos : parsed.avatar_url ? [parsed.avatar_url] : [];
      return {
        id: parsed.id || 'preview',
        userId: parsed.user_id || parsed.userId || undefined,
        name: parsed.name || parsed.full_name || 'Profile',
        age: parsed.age || 0,
        location: parsed.location || parsed.region || '',
        city: parsed.city,
        region: parsed.region,
        latitude: typeof parsed.latitude === 'number' ? parsed.latitude : undefined,
        longitude: typeof parsed.longitude === 'number' ? parsed.longitude : undefined,
        profilePicture: parsed.avatar_url || photos[0] || '',
        photos,
        profileVideo: typeof parsed.profileVideo === 'string' ? parsed.profileVideo : undefined,
        profileVideoPath: typeof parsed.profile_video === 'string' ? parsed.profile_video : undefined,
        occupation: parsed.occupation || '',
        education: parsed.education || '',
        verified: !!(parsed.verified || parsed.verification_level),
        bio: parsed.bio || '',
        distance: parsed.distance || '',
        distanceKm:
          typeof parsed.distanceKm === 'number'
            ? parsed.distanceKm
            : typeof parsed.distance_km === 'number'
              ? parsed.distance_km
              : parseDistanceKmFromLabel(parsed.distance),
        isActiveNow: !!(parsed.is_active || parsed.online),
        tribe: parsed.tribe,
        religion: parsed.religion,
        personalityType: parsed.personality_type,
        height: parsed.height,
        lookingFor: parsed.looking_for,
        loveLanguage: parsed.love_language,
        languages: Array.isArray(parsed.languages_spoken) ? parsed.languages_spoken : undefined,
        currentCountry: parsed.current_country,
        currentCountryCode: parsed.current_country_code,
        exerciseFrequency: parsed.exercise_frequency,
        smoking: parsed.smoking,
        drinking: parsed.drinking,
        hasChildren: parsed.has_children,
        wantsChildren: parsed.wants_children,
        locationPrecision: parsed.location_precision,
        compatibility: typeof parsed.compatibility === 'number' ? parsed.compatibility : 0,
        verificationLevel:
          typeof parsed.verification_level === 'number'
            ? parsed.verification_level
            : typeof parsed.verificationLevel === 'number'
            ? parsed.verificationLevel
            : undefined,
        interests: Array.isArray(parsed.interests)
          ? parsed.interests
              .map((raw: any) => {
                if (typeof raw === 'string') return raw;
                if (raw && typeof raw === 'object' && typeof raw.name === 'string') return raw.name;
                return null;
              })
              .filter((n: string | null): n is string => !!n)
              .map((name: string, idx: number) => ({
                id: `int-${idx}`,
                name,
                category: 'Interest',
                emoji: '*',
              }))
          : [],
      };
    } catch {
      // ignore
    }
  }

  return null;
}

function pickTaggedImages(profile: UserProfile): PremiumImage[] {
  const tags: ProfileImageTag[] = ['intro', 'lifestyle', 'prompts', 'values'];
  const uris = Array.isArray(profile.photos) ? profile.photos.filter(Boolean) : [];
  const safeUris = uris.length ? uris : profile.profilePicture ? [profile.profilePicture] : [];

  return safeUris.map((uri, index) => ({
    id: `img-${index}`,
    uri,
    tag: tags[index % tags.length],
  }));
}

function buildSections(profile: UserProfile): PremiumSection[] {
  const chipsFromInterests = (profile.interests || []).slice(0, 6).map((i) => i.name);
  const lifestyleChips = [profile.exerciseFrequency, profile.smoking, profile.drinking]
    .filter(Boolean)
    .map(String);

  const premiumCopy = {
    aboutEmpty: "This section hasn't been filled yet - ask something thoughtful.",
    lifestyleEmpty: 'Lifestyle details coming soon.',
    promptsEmpty: 'Conversation starters coming soon.',
    valuesEmpty: 'Intentions will appear here once shared.',
  };

  const sections: PremiumSection[] = [
    {
      id: 'sec-intro',
      tag: 'intro',
      title: `About ${profile.name}`,
      body: (profile.bio || '').trim() ? profile.bio : premiumCopy.aboutEmpty,
      chips: chipsFromInterests.length ? chipsFromInterests : undefined,
    },
    {
      id: 'sec-lifestyle',
      tag: 'lifestyle',
      title: 'Lifestyle',
      body: (() => {
        const text = [
        profile.occupation ? `Work: ${profile.occupation}` : null,
        profile.education ? `Education: ${profile.education}` : null,
        profile.height ? `Height: ${profile.height}` : null,
        profile.exerciseFrequency ? `Exercise: ${profile.exerciseFrequency}` : null,
        profile.smoking ? `Smoking: ${profile.smoking}` : null,
        profile.drinking ? `Drinking: ${profile.drinking}` : null,
      ]
        .filter(Boolean)
        .join('\n');
        return text || premiumCopy.lifestyleEmpty;
      })(),
      chips: lifestyleChips.length ? lifestyleChips : undefined,
    },
    {
      id: 'sec-prompts',
      tag: 'prompts',
      title: 'Prompts',
      body: (() => {
        const text = [
        profile.personalityType ? `Personality: ${profile.personalityType}` : null,
        profile.languages?.length ? `Languages: ${profile.languages.join(', ')}` : null,
        profile.tribe ? `Tribe: ${profile.tribe}` : null,
        profile.religion ? `Religion: ${profile.religion}` : null,
      ]
        .filter(Boolean)
        .join('\n');
        return text || premiumCopy.promptsEmpty;
      })(),
    },
    {
      id: 'sec-values',
      tag: 'values',
      title: 'Looking For',
      body: (() => {
        const text = [
        profile.lookingFor ? profile.lookingFor : null,
        profile.hasChildren ? `Has children: ${profile.hasChildren}` : null,
        profile.wantsChildren ? `Wants children: ${profile.wantsChildren}` : null,
      ]
        .filter(Boolean)
        .join('\n');
        return text || premiumCopy.valuesEmpty;
      })(),
    },
  ];

  return sections;
}

function buildAutoSectionsIfNeeded(profile: UserProfile, existing: PremiumSection[]): PremiumSection[] {
  if (existing.length > 0) return existing;

  const basics = [
    profile.height ? `Height: ${profile.height}` : null,
    profile.occupation ? `Work: ${profile.occupation}` : null,
    profile.education ? `Education: ${profile.education}` : null,
    profile.religion ? `Religion: ${profile.religion}` : null,
    profile.tribe ? `Tribe: ${profile.tribe}` : null,
    profile.personalityType ? `Personality: ${profile.personalityType}` : null,
  ].filter(Boolean);

  const intentions = [
    profile.lookingFor ? `Looking for: ${profile.lookingFor}` : null,
    profile.hasChildren ? `Has children: ${profile.hasChildren}` : null,
    profile.wantsChildren ? `Wants children: ${profile.wantsChildren}` : null,
  ].filter(Boolean);

  const lifestyle = [
    profile.exerciseFrequency ? `Exercise: ${profile.exerciseFrequency}` : null,
    profile.smoking ? `Smoking: ${profile.smoking}` : null,
    profile.drinking ? `Drinking: ${profile.drinking}` : null,
  ].filter(Boolean);

  const interests = (profile.interests || []).map((i) => i.name).filter(Boolean);

  const generated: PremiumSection[] = [
    {
      id: 'auto-basics',
      tag: 'intro',
      title: 'Basics',
      body: basics.length ? basics.join('\n') : 'Key details will appear here once added.',
    },
    {
      id: 'auto-intentions',
      tag: 'values',
      title: 'Intentions',
      body: intentions.length ? intentions.join('\n') : 'Intentions will appear here once shared.',
      chips: interests.slice(0, 6),
    },
    {
      id: 'auto-lifestyle',
      tag: 'lifestyle',
      title: 'Lifestyle',
      body: lifestyle.length ? lifestyle.join('\n') : 'Lifestyle details coming soon.',
    },
    {
      id: 'auto-ask',
      tag: 'prompts',
      title: 'Ask Me Anything',
      body: 'Start with something specific - a thoughtful question goes a long way.',
    },
  ];

  return generated;
}

function adaptToPremiumProfile(profile: UserProfile): PremiumProfile {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    location: profile.location,
    verified: profile.verified,
    distanceKm: profile.distanceKm,
    images: pickTaggedImages(profile),
    sections: buildSections(profile),
  };
}

export default function ProfileViewPremiumV2Screen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = Colors[colorScheme ?? 'light'];
  const { profile: currentProfile, user } = useAuth();

  const params = useLocalSearchParams();
  const profileId = String((params as any)?.id ?? (params as any)?.profileId ?? 'preview');

  const fallbackProfile = useMemo(() => parseFallbackProfile((params as any)?.fallbackProfile), [params]);
  const [fetchedProfile, setFetchedProfile] = useState<UserProfile | null>(null);
  const [presenceState, setPresenceState] = useState<{
    online: boolean;
    last_active: string | null;
  } | null>(null);
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchWatchdogError, setFetchWatchdogError] = useState<Error | null>(null);
  const [fetchRetryNonce, setFetchRetryNonce] = useState(0);
  const [matchAccepted, setMatchAccepted] = useState(false);
  const [matchPercent, setMatchPercent] = useState<number | null>(null);
  const [myInterests, setMyInterests] = useState<string[]>([]);

  // Fetch using the same logic extracted from app/profile-view.tsx.
  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!profileId || profileId === 'preview') {
        setFetchedProfile(null);
        return;
      }
      setFetching(true);
      setFetchWatchdogError(null);
      const watchdog = setTimeout(() => {
        if (!mounted) return;
        // If this ever triggers, it means we got stuck before the network layer (common culprit: auth/storage).
        setFetchWatchdogError(new Error('profile_view_timeout'));
        setFetching(false);
        logger.warn('[profile-view-premium] fetch timeout', { profileId });
      }, 12_000);
      try {
        const mapped = await fetchViewedProfile({
          viewedProfileId: profileId,
          fallbackDistanceLabel: fallbackProfile?.distance,
          fallbackDistanceKm: fallbackProfile?.distanceKm,
        });
        if (mounted) {
          setFetchedProfile(mapped);
          setFetchWatchdogError(null);
        }
      } catch {
        if (mounted) setFetchedProfile(null);
      } finally {
        clearTimeout(watchdog);
        if (mounted) setFetching(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [profileId, fallbackProfile?.distance, fallbackProfile?.distanceKm, fetchRetryNonce]);

  const resolvedProfile: UserProfile = useMemo(() => {
    if (fetchedProfile) return fetchedProfile;
    if (fallbackProfile) return fallbackProfile;
    return {
      id: profileId,
      name: 'Profile',
      age: 0,
      location: '',
      profilePicture: '',
      photos: [],
      occupation: '',
      education: '',
      verified: false,
      bio: '',
      distance: '',
      distanceKm: undefined,
      isActiveNow: false,
      interests: [],
      compatibility: 0,
    };
  }, [fallbackProfile, fetchedProfile, profileId]);

  useEffect(() => {
    let mounted = true;
    const resolveHeroVideo = async () => {
      const source =
        resolvedProfile.profileVideoPath || resolvedProfile.profileVideo;
      if (!source) {
        if (mounted) setHeroVideoUrl(null);
        return;
      }
      if (source.startsWith('http')) {
        if (mounted) setHeroVideoUrl(source);
        return;
      }
      const { data, error } = await supabase.storage
        .from('profile-videos')
        .createSignedUrl(source, 3600);
      if (!mounted) return;
      if (error || !data?.signedUrl) {
        setHeroVideoUrl(null);
        return;
      }
      setHeroVideoUrl(data.signedUrl);
    };
    void resolveHeroVideo();
    return () => {
      mounted = false;
    };
  }, [resolvedProfile.profileVideo, resolvedProfile.profileVideoPath]);

  useEffect(() => {
    if (!resolvedProfile.id || resolvedProfile.id === 'preview') {
      setPresenceState(null);
      return;
    }
    let cancelled = false;
    const fetchPresence = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('online,last_active')
          .eq('id', resolvedProfile.id)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) return;
        setPresenceState({
          online: !!data.online,
          last_active: data.last_active ?? null,
        });
      } catch {
        // ignore presence fetch errors
      }
    };
    void fetchPresence();
    const intervalId = setInterval(fetchPresence, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [resolvedProfile.id]);

  const presenceProfile = useMemo(() => {
    const online = presenceState?.online ?? (resolvedProfile as any).online;
    const lastActive =
      presenceState?.last_active ?? (resolvedProfile as any).last_active;
    const is_active =
      isActiveNowFromLastActive(lastActive) ||
      !!(resolvedProfile as any).is_active;
    return { ...(resolvedProfile as any), online, is_active } as UserProfile;
  }, [presenceState, resolvedProfile]);

  useEffect(() => {
    let cancelled = false;
    const loadMyInterests = async () => {
      if (!currentProfile?.id) {
        setMyInterests([]);
        return;
      }
      const { data } = await supabase
        .from('profile_interests')
        .select('interests!inner(name)')
        .eq('profile_id', currentProfile.id);
      if (cancelled) return;
      const names = (data || [])
        .flatMap((row: any) =>
          Array.isArray(row.interests)
            ? row.interests.map((i: any) => i?.name).filter(Boolean)
            : row.interests?.name
            ? [row.interests.name]
            : [],
        )
        .filter(Boolean);
      setMyInterests(names);
    };
    void loadMyInterests();
    return () => {
      cancelled = true;
    };
  }, [currentProfile?.id]);

  useEffect(() => {
    let cancelled = false;
    const checkAccepted = async () => {
      if (!currentProfile?.id || !resolvedProfile.id) {
        setMatchAccepted(false);
        return;
      }
      const { data } = await supabase
        .from('matches')
        .select('id')
        .or(
          `and(user1_id.eq.${currentProfile.id},user2_id.eq.${resolvedProfile.id},status.eq.ACCEPTED),and(user1_id.eq.${resolvedProfile.id},user2_id.eq.${currentProfile.id},status.eq.ACCEPTED)`,
        )
        .limit(1);
      if (cancelled) return;
      setMatchAccepted(!!(data && data.length > 0));
    };
    void checkAccepted();
    return () => {
      cancelled = true;
    };
  }, [currentProfile?.id, resolvedProfile.id]);

  useEffect(() => {
    if (!matchAccepted || !user?.id || !resolvedProfile.userId) {
      setMatchPercent(null);
      return;
    }
    let cancelled = false;
    const fetchMatchScore = async () => {
      const { data, count } = await supabase
        .from('messages')
        .select('created_at,sender_id', { count: 'exact' })
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${resolvedProfile.userId}),and(sender_id.eq.${resolvedProfile.userId},receiver_id.eq.${user.id})`,
        )
        .order('created_at', { ascending: true })
        .limit(50);
      if (cancelled) return;
      const messageRows = (data as any[] | null) ?? [];
      const messageCount = typeof count === 'number' ? count : messageRows.length;
      const firstReplyHours = computeFirstReplyHours(messageRows as any, user.id, resolvedProfile.userId);
      const peerNames = resolvedProfile.interests.map((item) => item.name).filter(Boolean);
      const interestOverlapRatio = computeInterestOverlapRatio(myInterests, peerNames) ?? undefined;
      const bothVerified =
        (currentProfile?.verification_level ?? 0) >= 1 && !!resolvedProfile.verified;
      const score = computeMatchScorePercent({
        messageCount,
        firstReplyHours,
        bothVerified,
        interestOverlapRatio,
      });
      setMatchPercent(score);
    };
    void fetchMatchScore();
    return () => {
      cancelled = true;
    };
  }, [
    currentProfile?.verification_level,
    matchAccepted,
    myInterests,
    resolvedProfile.interests,
    resolvedProfile.userId,
    user?.id,
  ]);

  const hasGalleryImages = useMemo(
    () => Array.isArray(resolvedProfile.photos) && resolvedProfile.photos.some(Boolean),
    [resolvedProfile.photos],
  );
  const hasAvatarOnly = useMemo(
    () => !hasGalleryImages && !!resolvedProfile.profilePicture,
    [hasGalleryImages, resolvedProfile.profilePicture],
  );
  const meaningfulText = useMemo(() => hasMeaningfulText(resolvedProfile), [resolvedProfile]);
  const gated = useMemo(() => shouldGateProfile(resolvedProfile), [resolvedProfile]);

  const profile: PremiumProfile = useMemo(() => {
    const adapted = adaptToPremiumProfile(resolvedProfile);
    const sections = buildAutoSectionsIfNeeded(resolvedProfile, adapted.sections);
    return { ...adapted, sections };
  }, [resolvedProfile]);

  const isLoading = fetching && !fetchedProfile && !fallbackProfile && !fetchWatchdogError;
  const locationLine = useMemo(() => buildLocationLine(resolvedProfile), [resolvedProfile]);
  const hasIntro = !!(resolvedProfile.profileVideo || resolvedProfile.profileVideoPath);
  const compatibilityPercent = useMemo(() => {
    if (!currentProfile || !resolvedProfile) return resolvedProfile.compatibility;
    const targetInterests = resolvedProfile.interests.map((item) => item.name).filter(Boolean);
    const computed = computeCompatibilityPercent(
      {
        interests: myInterests,
        lookingFor: (currentProfile as any)?.looking_for,
        loveLanguage: (currentProfile as any)?.love_language,
        personalityType: (currentProfile as any)?.personality_type,
        religion: (currentProfile as any)?.religion,
        wantsChildren: (currentProfile as any)?.wants_children,
        smoking: (currentProfile as any)?.smoking,
      },
      {
        interests: targetInterests,
        lookingFor: resolvedProfile.lookingFor,
        loveLanguage: resolvedProfile.loveLanguage,
        personalityType: resolvedProfile.personalityType,
        religion: resolvedProfile.religion,
        wantsChildren: resolvedProfile.wantsChildren,
        smoking: resolvedProfile.smoking,
      },
    );
    return typeof computed === 'number' ? computed : resolvedProfile.compatibility;
  }, [
    currentProfile,
    myInterests,
    resolvedProfile.compatibility,
    resolvedProfile.interests,
    resolvedProfile.lookingFor,
    resolvedProfile.personalityType,
    resolvedProfile.religion,
    resolvedProfile.smoking,
    resolvedProfile.wantsChildren,
  ]);
  const matchBadgeValue =
    matchAccepted && typeof matchPercent === 'number'
      ? matchPercent
      : compatibilityPercent;
  const matchBadgeLabel =
    matchAccepted && typeof matchPercent === 'number' ? 'Match' : 'Vibes';

  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isOwnProfile = useMemo(
    () => Boolean(currentUserId && profileId && currentUserId === profileId),
    [currentUserId, profileId],
  );

  const isTextOnlyStory = !hasGalleryImages && meaningfulText && (hasAvatarOnly || !!resolvedProfile.profilePicture);

  // --- Soft Sync state ---
  // Stored on UI thread to avoid re-rendering the whole right list.
  const activeTag = useSharedValue<ProfileImageTag>('intro');
  const heroScrollY = useSharedValue(0);

  // When user scrolls RIGHT column, we freeze highlight to avoid fighting user attention.
  const highlightEnabled = useSharedValue(1);
  const frozenTag = useSharedValue<ProfileImageTag>('intro');

  // JS mirror is only used for haptics gating and left-rail UI that isn't reanimated.
  const [activeTagJs, setActiveTagJs] = useState<ProfileImageTag>('intro');
  const lastHapticTagRef = useRef<ProfileImageTag>('intro');

  const lastActiveTagUpdateAtRef = useRef(0);

  const rightScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [heroOverrideUri, setHeroOverrideUri] = useState<string | null>(null);
  const lastTapRef = useRef<{ id: string; ts: number } | null>(null);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [activeReactionImageId, setActiveReactionImageId] = useState<string | null>(null);
  const [imageReactions, setImageReactions] = useState<Record<string, string>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, { count: number; topEmoji: string | null }>>({});

  useEffect(() => {
    return () => {
      if (rightScrollTimeoutRef.current) clearTimeout(rightScrollTimeoutRef.current);
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setCurrentUserId(data.session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadImageReactions = useCallback(async () => {
    if (!resolvedProfile.id) return;
    const { data, error } = await supabase
      .from('profile_image_reactions')
      .select('image_url,emoji,reactor_user_id')
      .eq('profile_id', resolvedProfile.id);
    if (error) {
      console.log('[profile] reactions fetch error', error);
      return;
    }
    const counts: Record<string, { count: number; topEmoji: string | null }> = {};
    const mine: Record<string, string> = {};
    (data || []).forEach((row) => {
      const imageUrl = row.image_url as string;
      const emoji = row.emoji as string;
      const reactorId = row.reactor_user_id as string;
      if (!counts[imageUrl]) {
        counts[imageUrl] = { count: 0, topEmoji: null };
      }
      counts[imageUrl].count += 1;
      counts[imageUrl].topEmoji = emoji;
      if (currentUserId && reactorId === currentUserId) {
        mine[imageUrl] = emoji;
      }
    });
    setReactionCounts(counts);
    setImageReactions(mine);
  }, [currentUserId, resolvedProfile.id]);

  useEffect(() => {
    if (!resolvedProfile.id) return;
    void loadImageReactions();
    const channel = supabase
      .channel(`profile_image_reactions:${resolvedProfile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profile_image_reactions', filter: `profile_id=eq.${resolvedProfile.id}` },
        () => {
          void loadImageReactions();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadImageReactions, resolvedProfile.id]);

  useEffect(() => {
    // Reset any pinned hero image when switching profiles.
    setHeroOverrideUri(null);
    lastTapRef.current = null;

    if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
    setLightboxOpen(false);
    setLightboxIndex(0);
  }, [resolvedProfile.id]);

  const lightboxItems: LightboxItem[] = useMemo(() => {
    // Prefer the premium-tagged images so we can show the right section text.
    if (profile.images.length) {
      return profile.images.map((img) => {
        const sec = profile.sections.find((s) => s.tag === img.tag);
        return {
          uri: img.uri,
          tag: img.tag,
          title: sec?.title,
          body: sec?.body,
          chips: sec?.chips,
        };
      });
    }

    const photos = Array.isArray(resolvedProfile.photos) ? resolvedProfile.photos.filter(Boolean) : [];
    const uris = photos.length ? photos : resolvedProfile.profilePicture ? [resolvedProfile.profilePicture] : [];
    return uris.map((uri) => ({ uri }));
  }, [profile.images, profile.sections, resolvedProfile.photos, resolvedProfile.profilePicture]);

  const openLightboxAtIndex = useCallback(
    (nextIndex: number) => {
      if (!lightboxItems.length) return;
      const clamped = Math.max(0, Math.min(lightboxItems.length - 1, nextIndex));
      setLightboxIndex(clamped);
      setLightboxOpen(true);
    },
    [lightboxItems.length],
  );

  const openLightboxForUri = useCallback(
    (uri: string) => {
      if (!uri || !lightboxItems.length) return;
      const idx = lightboxItems.findIndex((p) => p.uri === uri);
      openLightboxAtIndex(idx >= 0 ? idx : 0);
    },
    [lightboxItems, openLightboxAtIndex],
  );

  const openIntroVideo = useCallback(async () => {
    const source = resolvedProfile.profileVideoPath || resolvedProfile.profileVideo;
    if (!source) return;

    if (source.startsWith('http')) {
      setVideoModalUrl(source);
      setVideoModalVisible(true);
      return;
    }

    const { data, error } = await supabase.storage.from('profile-videos').createSignedUrl(source, 3600);
    if (error || !data?.signedUrl) return;
    setVideoModalUrl(data.signedUrl);
    setVideoModalVisible(true);
  }, [resolvedProfile.profileVideo, resolvedProfile.profileVideoPath]);

  const setActiveTagSafely = useCallback(
    (nextTag: ProfileImageTag) => {
      const now = Date.now();
      if (now - lastActiveTagUpdateAtRef.current < ACTIVE_TAG_MIN_INTERVAL_MS) return;
      lastActiveTagUpdateAtRef.current = now;

      // Avoid repeated updates (flicker + repeated haptics)
      if (nextTag === activeTag.value) return;

      runOnUI((tag: ProfileImageTag) => {
        'worklet';
        activeTag.value = tag;
      })(nextTag);

      setActiveTagJs(nextTag);
      if (lastHapticTagRef.current !== nextTag) {
        lastHapticTagRef.current = nextTag;
        Haptics.selectionAsync().catch(() => undefined);
      }
    },
    [activeTag],
  );

  useEffect(() => {
    if (!lightboxOpen) return;
    const item = lightboxItems[lightboxIndex];
    if (!item?.tag) return;
    setActiveTagSafely(item.tag);
  }, [lightboxIndex, lightboxItems, lightboxOpen, setActiveTagSafely]);

  // --- Left rail viewability logic ---
  // Preferred approach: viewability callback instead of measuring offsets.
  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: ACTIVE_VISIBLE_PERCENT_THRESHOLD }),
    [],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<PremiumImage>[] }) => {
      if (!viewableItems || viewableItems.length === 0) return;

      // Prefer highest visible percent when available.
      let bestByPercent: { tag: ProfileImageTag; percent: number } | null = null;
      for (const token of viewableItems) {
        const item = token.item as PremiumImage | undefined;
        if (!item?.tag) continue;
        const pct =
          typeof (token as any).itemVisiblePercent === 'number'
            ? (token as any).itemVisiblePercent
            : typeof (token as any).percentVisible === 'number'
              ? (token as any).percentVisible
              : undefined;
        if (typeof pct === 'number') {
          if (!bestByPercent || pct > bestByPercent.percent) bestByPercent = { tag: item.tag, percent: pct };
        }
      }

      if (bestByPercent && bestByPercent.percent >= ACTIVE_VISIBLE_PERCENT_THRESHOLD) {
        setActiveTagSafely(bestByPercent.tag);
        return;
      }

      // FlashList view tokens may not always expose a percent, depending on version;
      // so we (a) trust itemVisiblePercentThreshold for membership, then
      // (b) choose the item closest to the center of visible indices.
      const indices = viewableItems
        .map((t) => (typeof t.index === 'number' ? t.index : null))
        .filter((i): i is number => i != null);
      if (indices.length === 0) return;

      const minIndex = Math.min(...indices);
      const maxIndex = Math.max(...indices);
      const approxCenter = (minIndex + maxIndex) / 2;

      let best: ViewToken<PremiumImage> | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const token of viewableItems) {
        const idx = typeof token.index === 'number' ? token.index : null;
        if (idx == null) continue;
        const score = Math.abs(idx - approxCenter);
        if (score < bestScore) {
          best = token;
          bestScore = score;
        }
      }

      const item = best?.item as PremiumImage | undefined;
      if (!item?.tag) return;

      // Only update if the item is considered viewable by the threshold.
      // If fast scrolling yields no qualifying items, keep previous activeTag.
      if ((best as any)?.isViewable === false) return;

      setActiveTagSafely(item.tag);
    },
    [setActiveTagSafely],
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  const onRightScrollBegin = useCallback(() => {
    if (rightScrollTimeoutRef.current) clearTimeout(rightScrollTimeoutRef.current);
    runOnUI(() => {
      'worklet';
      frozenTag.value = activeTag.value;
      highlightEnabled.value = 0;
    })();
  }, [activeTag, frozenTag, highlightEnabled]);

  const onRightScrollEnd = useCallback(() => {
    if (rightScrollTimeoutRef.current) clearTimeout(rightScrollTimeoutRef.current);
    rightScrollTimeoutRef.current = setTimeout(() => {
      runOnUI(() => {
        'worklet';
        highlightEnabled.value = 1;
      })();
    }, RIGHT_SCROLL_HOLD_MS);
  }, [highlightEnabled]);

  const storyViewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    [],
  );

  const onRightViewableItemsChangedForStory = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<PremiumSection>[] }) => {
      if (!viewableItems || viewableItems.length === 0) return;
      // Pick the most visible item when available.
      let best: { tag: ProfileImageTag; percent: number } | null = null;
      for (const token of viewableItems) {
        const item = token.item as PremiumSection | undefined;
        if (!item?.tag) continue;
        const pct =
          typeof (token as any).itemVisiblePercent === 'number'
            ? (token as any).itemVisiblePercent
            : typeof (token as any).percentVisible === 'number'
              ? (token as any).percentVisible
              : 100;
        if (!best || pct > best.percent) best = { tag: item.tag, percent: pct };
      }
      if (best && best.percent >= 60) setActiveTagSafely(best.tag);
    },
    [setActiveTagSafely],
  );

  const onImageTap = useCallback(
    (item: PremiumImage) => {
      const now = Date.now();
      const prev = lastTapRef.current;

      // Timer-based single vs double tap:
      // - First tap: arm a short timer; when it fires, open the lightbox.
      // - Second tap within the window: cancel single-tap action, pin to hero.
      if (prev && prev.id === item.id && now - prev.ts <= 260) {
        lastTapRef.current = null;
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current);
          singleTapTimeoutRef.current = null;
        }
        setHeroOverrideUri((cur) => (cur === item.uri ? null : item.uri));
        Haptics.selectionAsync().catch(() => undefined);
        return;
      }

      lastTapRef.current = { id: item.id, ts: now };
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      const index = profile.images.findIndex((img) => img.id === item.id);
      singleTapTimeoutRef.current = setTimeout(() => {
        singleTapTimeoutRef.current = null;
        lastTapRef.current = null;
        openLightboxAtIndex(index >= 0 ? index : 0);
      }, 260);
    },
    [openLightboxAtIndex, profile.images],
  );

  const renderSectionItem = useCallback(
    ({ item }: { item: PremiumSection }) => (
      <SectionBlock theme={theme} section={item} activeTag={activeTag} highlightEnabled={highlightEnabled} frozenTag={frozenTag} />
    ),
    [activeTag, frozenTag, highlightEnabled, theme],
  );

  const toggleImageReactions = useCallback((item: PremiumImage) => {
    setActiveReactionImageId((prev) => (prev === item.id ? null : item.id));
    Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const handleSelectReaction = useCallback(async (item: PremiumImage, icon: string) => {
    if (!currentUserId || !resolvedProfile.id) return;
    const existing = imageReactions[item.uri];
    setActiveReactionImageId(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageReactions((prev) => {
      const next = { ...prev };
      if (existing === icon) {
        delete next[item.uri];
      } else {
        next[item.uri] = icon;
      }
      return next;
    });
    const rollback = () => {
      setImageReactions((prev) => {
        const next = { ...prev };
        if (existing) {
          next[item.uri] = existing;
        } else {
          delete next[item.uri];
        }
        return next;
      });
      setActiveReactionImageId(item.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    };
    if (existing === icon) {
      try {
        const { error } = await supabase
          .from('profile_image_reactions')
          .delete()
          .eq('profile_id', resolvedProfile.id)
          .eq('image_url', item.uri)
          .eq('reactor_user_id', currentUserId);
        if (error) {
          console.log('[profile] reaction delete error', error);
          rollback();
        }
      } catch (error) {
        console.log('[profile] reaction delete error', error);
        rollback();
      }
      return;
    }
    try {
      const { error } = await supabase
        .from('profile_image_reactions')
        .upsert(
          {
            profile_id: resolvedProfile.id,
            image_url: item.uri,
            reactor_user_id: currentUserId,
            emoji: icon,
          },
          { onConflict: 'profile_id,image_url,reactor_user_id' },
        );
      if (error) {
        console.log('[profile] reaction upsert error', error);
        rollback();
      }
    } catch (error) {
      console.log('[profile] reaction upsert error', error);
      rollback();
    }
  }, [currentUserId, imageReactions, resolvedProfile.id]);

  const onRightScroll = useCallback(
    (event: any) => {
      heroScrollY.value = event?.nativeEvent?.contentOffset?.y ?? 0;
    },
    [heroScrollY],
  );

  if (gated) {
    return (
      <View style={[styles.screen, { paddingHorizontal: 16, paddingTop: 18 }]}>
      <Header
        theme={theme}
        profile={presenceProfile}
        title={'Complete your profile'}
        locationLine={''}
        hasIntro={false}
        heroOverrideUri={null}
        heroVideoUrl={null}
        heroScrollY={heroScrollY}
        isDark={isDark}
        matchBadgeValue={matchBadgeValue}
        matchBadgeLabel={matchBadgeLabel}
        onBack={() => router.back()}
        onClose={() => router.back()}
      />

        <View style={[stylesStatic.gateCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
          <Text style={[stylesStatic.gateTitle, { color: theme.text }]}>Complete your profile to be seen</Text>
          <Text style={[stylesStatic.gateBody, { color: theme.textMuted }]}>Add at least one of the following:</Text>
          <Text style={[stylesStatic.gateBody, { color: theme.textMuted }]}>- A photo</Text>
          <Text style={[stylesStatic.gateBody, { color: theme.textMuted }]}>- A short bio</Text>
          <Text style={[stylesStatic.gateBody, { color: theme.textMuted }]}>- An intention / prompt</Text>

          <View style={[stylesStatic.progressTrack, { backgroundColor: theme.outline }]}>
            <View style={[stylesStatic.progressFill, { width: '20%', backgroundColor: theme.tint }]} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        theme={theme}
        profile={presenceProfile}
        title={formatHeaderTitle(profile.name, profile.age)}
        locationLine={locationLine}
        hasIntro={hasIntro}
        heroOverrideUri={heroOverrideUri}
        heroVideoUrl={heroVideoUrl}
        heroScrollY={heroScrollY}
        isDark={isDark}
        matchBadgeValue={matchBadgeValue}
        matchBadgeLabel={matchBadgeLabel}
        onHeroPress={openLightboxForUri}
        onIntroPress={() => {
          void openIntroVideo();
        }}
        onBack={() => router.back()}
        onClose={() => router.back()}
      />

      <PhotoLightboxModal
        theme={theme}
        open={lightboxOpen}
        items={lightboxItems}
        startIndex={lightboxIndex}
        index={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />

      <ProfileVideoModal
        visible={videoModalVisible}
        videoUrl={videoModalUrl || undefined}
        onClose={() => {
          setVideoModalVisible(false);
          setVideoModalUrl(null);
        }}
      />

      {fetchWatchdogError && !fetchedProfile && !fallbackProfile ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <Notice
            title="Couldn't load profile"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => setFetchRetryNonce((n) => n + 1)}
            icon="cloud-alert"
          />
        </View>
      ) : isLoading ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ color: theme.textMuted }}>Loading...</Text>
        </View>
      ) : null}

      <View style={styles.columnsRow}>
        {!isTextOnlyStory ? (
          <View style={styles.leftCol}>
            <FlashList
              data={profile.images}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              contentContainerStyle={styles.leftListContent}
              renderItem={({ item }) => (
                <ImageCard
                  theme={theme}
                  item={item}
                  isActive={item.tag === activeTagJs}
                  height={IMAGE_ITEM_HEIGHT}
                  onTap={onImageTap}
                  reactionIcon={imageReactions[item.uri] ?? reactionCounts[item.uri]?.topEmoji ?? null}
                  reactionCount={reactionCounts[item.uri]?.count ?? 0}
                  reactionsOpen={activeReactionImageId === item.id}
                  onToggleReactions={toggleImageReactions}
                  onSelectReaction={handleSelectReaction}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ height: IMAGE_ITEM_GAP }} />}
            />
          </View>
        ) : null}

        {!isTextOnlyStory ? <View style={{ width: COLUMN_GAP }} /> : null}

        <View style={styles.rightCol}>
          {isTextOnlyStory ? (
            <FlashList
              data={profile.sections}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              viewabilityConfig={storyViewabilityConfig}
              onViewableItemsChanged={onRightViewableItemsChangedForStory}
              onScroll={onRightScroll}
              scrollEventThrottle={16}
              contentContainerStyle={styles.rightListContent}
              renderItem={renderSectionItem}
              ListHeaderComponent={
                <StoryHeader theme={theme} profile={presenceProfile} locationLine={locationLine} />
              }
            />
          ) : (
            <FlashList
              data={profile.sections}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={onRightScrollBegin}
              onMomentumScrollBegin={onRightScrollBegin}
              onScrollEndDrag={onRightScrollEnd}
              onMomentumScrollEnd={onRightScrollEnd}
              onScroll={onRightScroll}
              scrollEventThrottle={16}
              contentContainerStyle={styles.rightListContent}
              renderItem={renderSectionItem}
            />
          )}
        </View>
      </View>

      <FloatingActions
        theme={theme}
        profileId={profileId}
        currentUserId={currentUserId}
        isOwnProfile={isOwnProfile}
      />
    </View>
  );
}

function Header({
  theme,
  profile,
  title,
  locationLine,
  hasIntro,
  heroOverrideUri,
  heroVideoUrl,
  heroScrollY,
  isDark,
  matchBadgeValue,
  matchBadgeLabel,
  onHeroPress,
  onIntroPress,
  onBack,
  onClose,
}: {
  theme: typeof Colors.light;
  profile: UserProfile;
  title: string;
  locationLine: string;
  hasIntro: boolean;
  heroOverrideUri: string | null;
  heroVideoUrl?: string | null;
  heroScrollY: SharedValue<number>;
  isDark: boolean;
  matchBadgeValue: number | null;
  matchBadgeLabel: string;
  onHeroPress?: (heroUri: string) => void;
  onIntroPress?: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const heroUri =
    heroOverrideUri ||
    (Array.isArray(profile.photos) && profile.photos.find(Boolean)) ||
    profile.profilePicture ||
    '';
  const isOnlineNow = !!(profile as any).online;
  const isActiveNow = profile.isActiveNow || !!(profile as any).is_active;
  const showPresence = isOnlineNow || isActiveNow;
  const presenceLabel = isOnlineNow ? 'Online' : 'Active now';
  const showHeroVideo = !!heroVideoUrl;
  const [heroMuted, setHeroMuted] = useState(true);
  const heroHeight = Math.max(280, Math.min(420, Math.round(screenHeight * 0.38)));
  const HeroVideo = ({ uri, muted }: { uri: string; muted: boolean }) => {
    const player = useVideoPlayer(uri, (p) => {
      p.loop = true;
      p.muted = muted;
      try {
        p.play();
      } catch {}
    });

    useEffect(() => {
      try {
        player.muted = muted;
      } catch {}
    }, [player, muted]);

    useEffect(() => {
      try {
        player.play();
      } catch {}
      return () => {
        try {
          player.pause();
        } catch {}
      };
    }, [player]);

    return (
      <VideoView
        style={StyleSheet.absoluteFillObject}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
    );
  };
  const heroImageStyle = useAnimatedStyle<ImageStyle>(() => {
    const translateY = interpolate(
      heroScrollY.value,
      [0, heroHeight],
      [0, -24],
      Extrapolate.CLAMP,
    );
    const scale = interpolate(
      heroScrollY.value,
      [0, heroHeight],
      [1.02, 1.08],
      Extrapolate.CLAMP,
    );
    const transform: ImageStyle['transform'] = [{ translateY }, { scale }];
    return {
      transform,
    };
  }, [heroHeight]);

  return (
    <View style={[stylesStatic.header, { borderBottomColor: theme.outline, backgroundColor: theme.background }]}>
      <View style={stylesStatic.headerTopRow}>
        <Pressable onPress={onBack} hitSlop={12} style={stylesStatic.headerBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text} />
        </Pressable>

        <Text numberOfLines={1} style={[stylesStatic.headerTitle, { color: theme.text }]}>
          {title || 'Profile'}
        </Text>

        <Pressable onPress={onClose} hitSlop={12} style={stylesStatic.headerBtn}>
          <MaterialCommunityIcons name="close" size={22} color={theme.text} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => {
          if (!heroUri) return;
          onHeroPress?.(heroUri);
        }}
        style={[stylesStatic.heroWrap, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle, height: heroHeight }]}
      >
        {showHeroVideo ? (
          <View style={StyleSheet.absoluteFillObject}>
            <HeroVideo uri={heroVideoUrl!} muted={heroMuted} />
          </View>
        ) : heroUri ? (
          <Animated.Image
            source={{ uri: heroUri }}
            style={[stylesStatic.heroImage, heroImageStyle]}
            resizeMode="cover"
          />
        ) : null}

        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'transparent']}
          style={stylesStatic.heroTopGradient}
        />

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.68)']}
          style={stylesStatic.heroBottomGradient}
        />

        {showHeroVideo ? (
          <Pressable
            style={stylesStatic.heroAudioPill}
            onPress={() => {
              setHeroMuted((prev) => !prev);
              Haptics.selectionAsync().catch(() => undefined);
            }}
            hitSlop={10}
          >
            <MaterialCommunityIcons
              name={heroMuted ? 'volume-off' : 'volume-high'}
              size={18}
              color="#fff"
            />
          </Pressable>
        ) : null}

        {hasIntro ? (
          <Pressable
            onPress={onIntroPress}
            hitSlop={10}
            style={[
              stylesStatic.introBadge,
              {
                backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.78)',
                borderColor: theme.outline,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="play"
              size={14}
              color={isDark ? Colors.light.background : Colors.dark.background}
            />
            <Text style={[stylesStatic.introText, { color: isDark ? Colors.light.background : Colors.dark.background }]}>
              Intro
            </Text>
          </Pressable>
        ) : null}

        <View style={stylesStatic.heroOverlay}>
          <View style={stylesStatic.heroNameRow}>
            <View style={stylesStatic.heroNamePill}>
              <Text numberOfLines={1} style={stylesStatic.heroName}>
                {formatHeaderTitle(profile.name, profile.age)}
              </Text>
            </View>
            {(profile.verificationLevel ?? (profile.verified ? 1 : 0)) > 0 ? (
              <VerificationBadge
                level={profile.verificationLevel ?? (profile.verified ? 1 : 0)}
                size="small"
              />
            ) : null}
            {showPresence ? (
              <View
                style={[
                  stylesStatic.activeBadgeHero,
                  {
                    backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.82)',
                    borderColor: theme.outline,
                  },
                ]}
              >
                <View style={[stylesStatic.activeDot, { backgroundColor: theme.tint }]} />
                <Text style={[stylesStatic.activeText, { color: isDark ? Colors.light.background : Colors.dark.background }]}>
                  {presenceLabel}
                </Text>
              </View>
            ) : null}
          </View>

          {locationLine ? (
            <View style={stylesStatic.heroSubRow}>
              <MaterialCommunityIcons name="map-marker" size={14} color={'rgba(255,255,255,0.92)'} />
              <Text numberOfLines={1} style={stylesStatic.heroSubText}>
                {locationLine}
              </Text>
            </View>
          ) : null}

          {profile.occupation ? <Text numberOfLines={1} style={stylesStatic.heroOccupation}>{profile.occupation}</Text> : null}

          {typeof matchBadgeValue === 'number' ? (
            <View style={[stylesStatic.matchBadge, { backgroundColor: theme.tint }]}>
              <MaterialCommunityIcons name="heart" size={14} color={Colors.light.background} />
              <Text style={stylesStatic.matchBadgeText}>{`${Math.round(matchBadgeValue)}% ${matchBadgeLabel}`}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function PhotoLightboxModal({
  theme: _theme,
  open,
  items,
  startIndex,
  index,
  onClose,
  onIndexChange,
}: {
  theme: typeof Colors.light;
  open: boolean;
  items: LightboxItem[];
  startIndex: number;
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const listRef = useRef<FlatList<LightboxItem> | null>(null);
  const insets = useSafeAreaInsets();

  const headerHeight = 48;
  const viewportHeight = Math.max(1, screenHeight - insets.top - insets.bottom - headerHeight);

  const dragY = useSharedValue(0);
  const captionProgress = useSharedValue(0);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          // Only capture when it is clearly a vertical gesture.
          return dy > 8 && dy > dx;
        },
        onPanResponderMove: (_evt, gesture) => {
          dragY.value = gesture.dy;
        },
        onPanResponderRelease: (_evt, gesture) => {
          const dy = gesture.dy;
          const vy = gesture.vy;
          const shouldDismiss = Math.abs(dy) > 140 || Math.abs(vy) > 1.25;

          if (shouldDismiss) {
            const direction = dy >= 0 ? 1 : -1;
            dragY.value = withTiming(direction * screenHeight, { duration: 160 }, () => {
              runOnJS(onClose)();
            });
            return;
          }

          dragY.value = withTiming(0, { duration: 160 });
        },
        onPanResponderTerminate: () => {
          dragY.value = withTiming(0, { duration: 160 });
        },
      }),
    [dragY, onClose],
  );

  const backdropStyle = useAnimatedStyle(() => {
    const t = Math.min(Math.abs(dragY.value), 220);
    const opacity = interpolate(t, [0, 220], [1, 0.35]);
    return { opacity };
  });

  const contentStyle = useAnimatedStyle(() => {
    const t = Math.min(Math.abs(dragY.value), 220);
    const scale = interpolate(t, [0, 220], [1, 0.94]);
    const transform: ViewStyle['transform'] = [{ translateY: dragY.value }, { scale }];
    return { transform };
  });

  const captionStyle = useAnimatedStyle(() => {
    const t = Math.min(Math.abs(dragY.value), 180);
    const dragFade = interpolate(t, [0, 180], [1, 0.4]);

    const opacity = captionProgress.value * dragFade;
    const translateY = interpolate(captionProgress.value, [0, 1], [14, 0]);

    const transform: ViewStyle['transform'] = [{ translateY }];
    return { opacity, transform };
  });

  useEffect(() => {
    if (!open) return;
    if (!items.length) return;
    dragY.value = 0;
    const clamped = Math.max(0, Math.min(items.length - 1, startIndex));

    captionProgress.value = 0;
    captionProgress.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });

    // Next tick so the Modal + list mount first.
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: clamped, animated: false });
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, [open, items.length, startIndex]);

  useEffect(() => {
    if (!open) return;
    captionProgress.value = 0;
    captionProgress.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [index, open]);

  const getItemLayout = useCallback((_: ArrayLike<LightboxItem> | null | undefined, index: number) => {
    return { length: screenWidth, offset: screenWidth * index, index };
  }, []);

  const navigateToIndex = useCallback(
    (nextIndex: number) => {
      if (!items.length) return;
      const clamped = Math.max(0, Math.min(items.length - 1, nextIndex));
      if (clamped === index) return;
      try {
        onIndexChange(clamped);
      } catch {
        // ignore
      }
      try {
        listRef.current?.scrollToIndex({ index: clamped, animated: true });
      } catch {
        // ignore
      }
      try {
        Haptics.selectionAsync();
      } catch {
        // ignore
      }
    },
    [index, items.length, onIndexChange],
  );

  const onTapNavigate = useCallback(
    (x: number) => {
      if (!items.length) return;
      const leftEdge = screenWidth * 0.33;
      const rightEdge = screenWidth * 0.67;
      if (x <= leftEdge) {
        const prev = index - 1;
        navigateToIndex(prev < 0 ? items.length - 1 : prev);
        return;
      }
      if (x >= rightEdge) {
        const next = index + 1;
        navigateToIndex(next > items.length - 1 ? 0 : next);
      }
    },
    [index, items.length, navigateToIndex],
  );

  const tapGesture = useMemo(() => {
    // Stories-style taps: left third = previous, right third = next.
    // `maxDistance` keeps it from hijacking horizontal swipes.
    return Gesture.Tap()
      .maxDistance(12)
      .onEnd((e, success) => {
        if (!success) return;
        runOnJS(onTapNavigate)(e.x);
      });
  }, [onTapNavigate]);

  return (
    <Modal
      visible={open}
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[stylesStatic.lightboxContainer, { backgroundColor: '#000' }]}>
        <Animated.View style={[StyleSheet.absoluteFillObject, backdropStyle]} />

        <Animated.View style={[stylesStatic.lightboxSafe, contentStyle]} {...panResponder.panHandlers}>
          {/* SafeAreaView inside Modal can be flaky across devices; use explicit insets. */}
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <View style={stylesStatic.lightboxHeader}>
              <Pressable
                onPress={onClose}
                hitSlop={14}
                style={[stylesStatic.lightboxCloseBtn, { backgroundColor: 'rgba(255,255,255,0.10)' }]}
              >
                <MaterialCommunityIcons name="close" size={26} color="#fff" />
              </Pressable>

              <Text style={[stylesStatic.lightboxCounter, { color: '#fff' }]}>
                {items.length ? `${Math.max(0, Math.min(items.length - 1, index)) + 1} of ${items.length}` : ''}
              </Text>

              <View style={{ width: 40, height: 40 }} />
            </View>

            {items.length > 1 ? (
              <View style={stylesStatic.lightboxStoryProgressRow}>
                {items.map((_, idx) => {
                  const active = idx === index;
                  const done = idx < index;
                  return (
                    <View
                      key={`p-${idx}`}
                      style={[
                        stylesStatic.lightboxStorySegment,
                        {
                          backgroundColor: done || active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.22)',
                          opacity: active ? 1 : done ? 0.85 : 0.6,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ) : null}

            <GestureDetector gesture={tapGesture}>
              <View style={{ flex: 1 }}>
                <FlatList
                  ref={(r) => {
                    listRef.current = r;
                  }}
                  data={items}
                  keyExtractor={(it, idx) => `${it.uri}-${idx}`}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  initialScrollIndex={Math.max(0, Math.min(items.length - 1, startIndex))}
                  getItemLayout={getItemLayout}
                  onScrollToIndexFailed={() => undefined}
                  onMomentumScrollEnd={(e) => {
                    const x = e.nativeEvent.contentOffset.x;
                    const next = Math.round(x / screenWidth);
                    onIndexChange(Math.max(0, Math.min(items.length - 1, next)));
                  }}
                  renderItem={({ item }) => {
                    const showText = !!((item.title || '').trim() || (item.body || '').trim());
                    const chips = Array.isArray(item.chips) ? item.chips.filter(Boolean).slice(0, 6) : [];
                    return (
                      <View style={{ width: screenWidth, height: viewportHeight, justifyContent: 'center' }}>
                        <Image source={{ uri: item.uri }} resizeMode="contain" style={stylesStatic.lightboxImage} />

                        {showText ? (
                          <Animated.View style={[stylesStatic.lightboxCaptionWrap, captionStyle]} pointerEvents="none">
                            <LinearGradient
                              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
                              style={StyleSheet.absoluteFillObject}
                            />

                            {item.title ? (
                              <Text style={[stylesStatic.lightboxCaptionTitle, { color: Colors.dark.text }]} numberOfLines={2}>
                                {item.title}
                              </Text>
                            ) : null}

                            <View style={stylesStatic.lightboxCaptionUnderlineWrap}>
                              <LinearGradient
                                colors={[Colors.dark.tint, Colors.dark.accent]}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={stylesStatic.lightboxCaptionUnderline}
                              />
                            </View>

                            {chips.length ? (
                              <View style={stylesStatic.lightboxInterestsRow}>
                                {chips.map((name) => {
                                  const emoji = getInterestEmoji(name);
                                  return (
                                    <View
                                      key={name}
                                      style={[
                                        stylesStatic.lightboxInterestPill,
                                        { borderColor: Colors.dark.outline, backgroundColor: Colors.dark.backgroundSubtle },
                                      ]}
                                    >
                                      <Text style={[stylesStatic.lightboxInterestEmoji, { color: Colors.dark.text }]}>{emoji}</Text>
                                      <Text
                                        style={[stylesStatic.lightboxInterestLabel, { color: Colors.dark.text }]}
                                        numberOfLines={1}
                                      >
                                        {name}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : null}

                            {item.body ? (
                              <Text style={[stylesStatic.lightboxCaptionBody, { color: Colors.dark.textMuted }]} numberOfLines={6}>
                                {item.body}
                              </Text>
                            ) : null}
                          </Animated.View>
                        ) : null}
                      </View>
                    );
                  }}
                />
              </View>
            </GestureDetector>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const ImageCard = memo(function ImageCard({
  theme,
  item,
  isActive,
  height,
  onTap,
  reactionIcon,
  reactionCount = 0,
  reactionsOpen,
  onToggleReactions,
  onSelectReaction,
}: {
  theme: typeof Colors.light;
  item: PremiumImage;
  isActive: boolean;
  height: number;
  onTap?: (item: PremiumImage) => void;
  reactionIcon?: string | null;
  reactionCount?: number;
  reactionsOpen?: boolean;
  onToggleReactions?: (item: PremiumImage) => void;
  onSelectReaction?: (item: PremiumImage, icon: string) => void;
}) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    if (isActive) {
      shimmer.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      shimmer.value = withTiming(0, { duration: 300 });
    }
  }, [isActive, shimmer]);

  const progress = useDerivedValue(() =>
    withTiming(isActive ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) }),
  );

  const cardStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [1, 1.015]);
    return {
      transform: [{ scale }],
    };
  });

  const railStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0, 1]);
    return { opacity };
  });
  const overlayStyle = useAnimatedStyle(() => {
    // Brightness effect by reducing dark overlay.
    const opacity = interpolate(progress.value, [0, 1], [0.18, 0.06]);
    return { opacity };
  });

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shimmer.value, [0, 1], [-60, 140]);
    const opacity = interpolate(shimmer.value, [0, 0.5, 1], [0, 0.35, 0]);
    return {
      opacity,
      transform: [{ translateX }],
    };
  });

  return (
    <Pressable onPress={() => onTap?.(item)}>
      <Animated.View
      style={[
        {
          height,
          borderRadius: 18,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.outline,
          backgroundColor: theme.backgroundSubtle,
        },
        cardStyle,
      ]}
    >
      <Image source={{ uri: item.uri }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }, overlayStyle]}
      />

      <View style={stylesStatic.reactionPillWrap} pointerEvents="box-none">
        <Pressable
          onPress={() => onToggleReactions?.(item)}
          style={[stylesStatic.reactionPill, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
        >
          <MaterialCommunityIcons
            name={(reactionIcon || 'emoticon-outline') as any}
            size={18}
            color={reactionIcon ? theme.tint : theme.textMuted}
          />
          {reactionCount > 0 ? (
            <Text style={[stylesStatic.reactionCount, { color: theme.textMuted }]}>
              {reactionCount}
            </Text>
          ) : null}
        </Pressable>

        {reactionsOpen ? (
          <View style={[stylesStatic.reactionRow, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}>
            {REACTION_ICONS.map((icon) => (
              <Pressable key={icon} onPress={() => onSelectReaction?.(item, icon)}>
                <MaterialCommunityIcons name={icon} size={20} color={theme.tint} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={stylesStatic.filmStripEdge} pointerEvents="none">
        <View style={[stylesStatic.filmStripHole, { backgroundColor: theme.background }]} />
        <View style={[stylesStatic.filmStripHole, { backgroundColor: theme.background }]} />
        <View style={[stylesStatic.filmStripHole, { backgroundColor: theme.background }]} />
      </View>

      <Animated.View style={[stylesStatic.shimmerOverlay, shimmerStyle]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={stylesStatic.shimmerGradient}
        />
      </Animated.View>

      {/* Premium active rail */}
      <Animated.View style={[stylesStatic.activeRailWrap, railStyle]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(0,0,0,0)', `${theme.tint}8C`, 'rgba(0,0,0,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={stylesStatic.activeRail}
        />
      </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const StoryHeader = memo(function StoryHeader({
  theme,
  profile,
  locationLine,
}: {
  theme: typeof Colors.light;
  profile: UserProfile;
  locationLine: string;
}) {
  const avatarUri = profile.profilePicture || '';
  const isOnlineNow = !!(profile as any).online;
  const isActiveNow = profile.isActiveNow || !!(profile as any).is_active;
  const showPresence = isOnlineNow || isActiveNow;
  const presenceLabel = isOnlineNow ? 'Online' : 'Active now';
  return (
    <View style={[stylesStatic.storyHeader, { backgroundColor: theme.background }]}>
      <View
        style={[
          stylesStatic.storyAvatarWrap,
          { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
        ]}
      >
        {avatarUri ? <Image source={{ uri: avatarUri }} style={stylesStatic.storyAvatar} /> : null}
      </View>

      <View style={stylesStatic.storyTextCol}>
        <View style={stylesStatic.storyNameRow}>
          <Text style={[stylesStatic.storyName, { color: theme.text }]} numberOfLines={1}>
            {formatHeaderTitle(profile.name, profile.age) || 'Profile'}
          </Text>
          {(profile.verificationLevel ?? (profile.verified ? 1 : 0)) > 0 ? (
            <VerificationBadge
              level={profile.verificationLevel ?? (profile.verified ? 1 : 0)}
              size="small"
            />
          ) : null}
          {showPresence ? (
            <View
              style={[
                stylesStatic.activeBadgeHero,
                { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
              ]}
            >
              <View style={[stylesStatic.activeDot, { backgroundColor: theme.tint }]} />
              <Text style={[stylesStatic.activeText, { color: theme.textMuted }]}>{presenceLabel}</Text>
            </View>
          ) : null}
        </View>

        {locationLine ? (
          <View style={stylesStatic.storySubRow}>
            <MaterialCommunityIcons name="map-marker" size={14} color={theme.textMuted} />
            <Text style={[stylesStatic.storySubText, { color: theme.textMuted }]} numberOfLines={1}>
              {locationLine}
            </Text>
          </View>
        ) : null}

        <View style={stylesStatic.storyChipsRow}>
          {[profile.lookingFor, profile.exerciseFrequency, profile.smoking, profile.drinking]
            .filter(Boolean)
            .slice(0, 4)
            .map((chip, idx) => (
              <View
                key={`${String(chip)}-${idx}`}
                style={[
                  stylesStatic.storyChip,
                  { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
                ]}
              >
                <Text style={[stylesStatic.storyChipText, { color: theme.textMuted }]}>{String(chip)}</Text>
              </View>
            ))}
        </View>
      </View>
    </View>
  );
});

const SectionBlock = memo(function SectionBlock({
  theme,
  section,
  activeTag,
  highlightEnabled,
  frozenTag,
}: {
  theme: typeof Colors.light;
  section: PremiumSection;
  activeTag: SharedValue<ProfileImageTag>;
  highlightEnabled: SharedValue<number>;
  frozenTag: SharedValue<ProfileImageTag>;
}) {
  // Compare on the UI thread.
  const isActive = useDerivedValue(() => {
    const effectiveTag = highlightEnabled.value === 1 ? activeTag.value : frozenTag.value;
    return effectiveTag === section.tag ? 1 : 0;
  });

  const titleColorStyle = useAnimatedStyle(() => {
    const color = interpolateColor(isActive.value, [0, 1], [theme.textMuted, theme.tint]);
    return { color };
  });

  const title500Opacity = useAnimatedStyle(() => ({ opacity: 1 - isActive.value }));
  const title600Opacity = useAnimatedStyle(() => ({ opacity: isActive.value }));

  const underlineStyle = useAnimatedStyle(() => {
    const opacity = interpolate(isActive.value, [0, 1], [0, 1]);
    const scaleX = interpolate(isActive.value, [0, 1], [0.6, 1]);
    return { opacity, transform: [{ scaleX }] };
  });

  const bodyStyle = useAnimatedStyle(() => {
    const opacity = interpolate(isActive.value, [0, 1], [0.85, 1]);
    return { opacity };
  });

  return (
    <View style={[stylesStatic.sectionCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
      <View style={stylesStatic.sectionHeader}>
        <View style={{ flex: 1 }}>
          {/*
            Title weight transition without layout shift:
            - Render two titles in the same position (500 and 600)
            - Crossfade opacities on the UI thread.
          */}
          <View style={{ position: 'relative' }}>
            <Animated.Text
              numberOfLines={1}
              style={[
                stylesStatic.sectionTitle,
                { color: theme.textMuted, fontWeight: '500' },
                titleColorStyle,
                title500Opacity,
              ]}
            >
              {section.title}
            </Animated.Text>
            <Animated.Text
              numberOfLines={1}
              style={[
                stylesStatic.sectionTitle,
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  color: theme.tint,
                  fontWeight: '600',
                },
                titleColorStyle,
                title600Opacity,
              ]}
            >
              {section.title}
            </Animated.Text>
          </View>

          <Animated.View style={[stylesStatic.underlineWrap, underlineStyle]}>
            <LinearGradient
              colors={[theme.tint, theme.accent]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={stylesStatic.underline}
            />
          </Animated.View>
        </View>
      </View>

      <Animated.Text style={[stylesStatic.sectionBody, { color: theme.text }, bodyStyle]}>
        {section.body}
      </Animated.Text>

      {section.chips?.length ? (
        <View style={stylesStatic.chipsRow}>
          {section.chips.map((chip, idx) => (
            <View key={`${chip}-${idx}`} style={[stylesStatic.chip, { borderColor: theme.outline }]}>
              <View style={stylesStatic.chipInnerRow}>
                {section.tag === 'intro' || section.tag === 'values' ? (
                  <Text style={[stylesStatic.chipEmoji, { color: theme.textMuted }]}>{getInterestEmoji(chip)}</Text>
                ) : null}
                <Text style={[stylesStatic.chipText, { color: theme.textMuted }]}>{chip}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

function FloatingActions({
  theme,
  profileId,
  currentUserId,
  isOwnProfile,
}: {
  theme: typeof Colors.light;
  profileId: string;
  currentUserId: string | null;
  isOwnProfile: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [giftOpen, setGiftOpen] = useState(false);
  const [selectedGift, setSelectedGift] = useState<string | null>(null);
  const [giftSending, setGiftSending] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const noteOpenAtRef = useRef(0);
  const [boostSending, setBoostSending] = useState(false);
  const giftOptions = useMemo(
    () => [
      { id: 'rose', label: 'Rose', icon: 'flower', note: 'Classic and elegant' },
      { id: 'teddy', label: 'Teddy Bear', icon: 'teddy-bear', note: 'Sweet and safe' },
      { id: 'ring', label: 'Ring', icon: 'ring', note: 'Bold and premium' },
    ],
    [],
  );

  const canSendToProfile = Boolean(currentUserId && profileId && currentUserId !== profileId);
  const noteLength = noteText.trim().length;

  const openNote = () => {
    if (!canSendToProfile) {
      Alert.alert('Note unavailable', 'Notes can only be sent to other profiles.');
      return;
    }
    Haptics.selectionAsync().catch(() => undefined);
    noteOpenAtRef.current = Date.now();
    setNoteOpen(true);
  };
  const openGift = () => {
    if (!canSendToProfile) {
      Alert.alert('Gift unavailable', 'Gifts can only be sent to other profiles.');
      return;
    }
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedGift(null);
    setGiftOpen(true);
  };
  const closeGift = () => setGiftOpen(false);
  const sendGift = async () => {
    if (!selectedGift || !currentUserId) return;
    setGiftSending(true);
    const { error } = await supabase.from('profile_gifts').insert({
      profile_id: profileId,
      sender_id: currentUserId,
      gift_type: selectedGift,
    });
    setGiftSending(false);
    if (error) {
      logger.error('[profile-view-premium] send_gift_failed', error);
      Alert.alert('Unable to send gift', (typeof __DEV__ !== 'undefined' && __DEV__) ? error.message : 'Please try again.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setGiftOpen(false);
  };

  const closeNote = () => setNoteOpen(false);

  const sendNote = async () => {
    const note = noteText.trim();
    if (!note || !currentUserId) return;
    setNoteSending(true);
    const { error } = await supabase.from('profile_notes').insert({
      profile_id: profileId,
      sender_id: currentUserId,
      note,
    });
    setNoteSending(false);
    if (error) {
      logger.error('[profile-view-premium] send_note_failed', error);
      Alert.alert('Unable to send note', (typeof __DEV__ !== 'undefined' && __DEV__) ? error.message : 'Please try again.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setNoteText('');
    setNoteOpen(false);
  };

  const sendBoost = async () => {
    if (!currentUserId) return;
    setBoostSending(true);
    const endsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error } = await supabase.from('profile_boosts').insert({
      user_id: currentUserId,
      ends_at: endsAt,
    });
    setBoostSending(false);
    if (error) {
      logger.error('[profile-view-premium] send_boost_failed', error);
      Alert.alert('Unable to boost', (typeof __DEV__ !== 'undefined' && __DEV__) ? error.message : 'Please try again.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Alert.alert('Boost active', 'Your profile is boosted for 30 minutes.');
  };

  return (
    <>
      <View
        style={[stylesStatic.fabStack, { bottom: 18 + Math.max(0, insets.bottom) }]}
        pointerEvents="box-none"
      >
        {!isOwnProfile ? (
          <Fab
            theme={theme}
            label="Note"
            icon="message-text-outline"
            colors={[theme.tint, '#0C6E7A'] as const}
            onPress={openNote}
          />
        ) : null}
        {isOwnProfile ? (
          <Fab
            theme={theme}
            label={boostSending ? 'Boosting' : 'Boost'}
            icon="rocket-launch-outline"
            colors={['#F6C453', '#C68B1E'] as const}
            onPress={sendBoost}
          />
        ) : (
          <Fab
            theme={theme}
            label="Gift"
            icon="gift-outline"
            colors={['#F3A0B4', '#C6607E'] as const}
            onPress={openGift}
          />
        )}
      </View>
      <Modal
        visible={noteOpen}
        transparent
        animationType="fade"
        onRequestClose={closeNote}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -20 : 0}
        >
          <Pressable
            style={stylesStatic.giftBackdrop}
            onPress={() => {
              if (Date.now() - noteOpenAtRef.current < 250) return;
              closeNote();
            }}
          >
            <Pressable
              style={[
                stylesStatic.giftSheet,
                { backgroundColor: theme.background, marginBottom: 0 },
              ]}
              onPress={() => undefined}
            >
            <View style={stylesStatic.giftHandle} />
            <Text style={[stylesStatic.giftTitle, { color: theme.text }]}>Send a Note</Text>
            <Text style={[stylesStatic.giftSubtitle, { color: theme.textMuted }]}>
              Keep it short and personal.
            </Text>
            <View style={[stylesStatic.noteInputWrap, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Write a short opener..."
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={280}
                autoFocus
                textAlignVertical="top"
                style={[stylesStatic.noteInput, { color: theme.text }]}
              />
            </View>
            <Text style={[stylesStatic.noteCounter, { color: theme.textMuted }]}>{noteLength}/280</Text>
            <Pressable
              onPress={sendNote}
              disabled={!noteLength || noteSending}
              style={[
                stylesStatic.giftSendButton,
                {
                  backgroundColor: noteLength ? theme.tint : theme.outline,
                  opacity: noteLength ? 1 : 0.6,
                },
              ]}
            >
              <Text style={[stylesStatic.giftSendText, { color: Colors.light.background }]}>
                {noteSending ? 'Sending...' : 'Send Note'}
              </Text>
            </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={giftOpen}
        transparent
        animationType="fade"
        onRequestClose={closeGift}
      >
        <Pressable style={stylesStatic.giftBackdrop} onPress={closeGift} />
        <View style={[stylesStatic.giftSheet, { backgroundColor: theme.background }]}>
          <View style={stylesStatic.giftHandle} />
          <Text style={[stylesStatic.giftTitle, { color: theme.text }]}>Send a Gift</Text>
          <Text style={[stylesStatic.giftSubtitle, { color: theme.textMuted }]}>
            Pick a gesture to stand out.
          </Text>
          <View style={stylesStatic.giftGrid}>
            {giftOptions.map((gift) => {
              const isSelected = selectedGift === gift.id;
              return (
                <Pressable
                  key={gift.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setSelectedGift(gift.id);
                  }}
                  style={[
                    stylesStatic.giftCard,
                    {
                      borderColor: isSelected ? theme.tint : theme.outline,
                      backgroundColor: theme.backgroundSubtle,
                    },
                  ]}
                >
                  <View style={isSelected ? stylesStatic.giftIconGlow : undefined}>
                    <MaterialCommunityIcons
                      name={gift.icon as any}
                      size={26}
                      color={isSelected ? theme.tint : theme.textMuted}
                    />
                  </View>
                  <Text style={[stylesStatic.giftLabel, { color: theme.text }]}>{gift.label}</Text>
                  <Text style={[stylesStatic.giftNote, { color: theme.textMuted }]}>{gift.note}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={sendGift}
            disabled={!selectedGift || giftSending}
            style={[
              stylesStatic.giftSendButton,
              {
                backgroundColor: selectedGift ? theme.tint : theme.outline,
                opacity: selectedGift ? 1 : 0.6,
              },
            ]}
          >
            <Text style={[stylesStatic.giftSendText, { color: Colors.light.background }]}>
              {giftSending ? 'Sending...' : 'Send Gift'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function Fab({
  theme: _theme,
  label,
  icon,
  colors,
  onPress,
}: {
  theme: typeof Colors.light;
  label: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  colors: readonly [string, string, ...string[]];
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={stylesStatic.fabWrap}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={stylesStatic.fab}>
        <MaterialCommunityIcons name={icon} size={18} color={Colors.light.background} />
        <Text style={[stylesStatic.fabLabel, { color: Colors.light.background }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function createStyles(theme: typeof Colors.light) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    columnsRow: {
      flex: 1,
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 18,
    },
    leftCol: {
      flexBasis: '40%',
      flexGrow: 0,
      flexShrink: 0,
    },
    rightCol: {
      flex: 1,
      minWidth: 0,
    },
    leftListContent: {
      paddingBottom: 120,
    },
    rightListContent: {
      paddingBottom: 160,
    },
  });
}

const stylesStatic = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  heroWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroTopGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 120,
  },

  lightboxContainer: {
    flex: 1,
  },
  lightboxSafe: {
    flex: 1,
  },
  lightboxHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  lightboxStoryProgressRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  lightboxStorySegment: {
    flex: 1,
    height: 3,
    borderRadius: 999,
  },
  lightboxCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCounter: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxCaptionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 36,
    paddingBottom: 22,
  },
  lightboxCaptionTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  lightboxCaptionUnderlineWrap: {
    marginTop: 10,
    marginBottom: 10,
    width: 54,
  },
  lightboxCaptionUnderline: {
    height: 3,
    borderRadius: 999,
  },
  lightboxCaptionBody: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
  },

  lightboxInterestsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  lightboxInterestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  lightboxInterestEmoji: {
    fontSize: 14,
  },
  lightboxInterestLabel: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 150,
  },
  heroBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  heroOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroNamePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroName: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  heroSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  heroSubText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
  },
  heroOccupation: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.86)',
  },

  activeBadgeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  introBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  introText: {
    fontSize: 12,
    fontWeight: '800',
  },
  heroAudioPill: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 6,
    elevation: 6,
  },

  matchBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  matchBadgeText: {
    color: Colors.light.background,
    fontSize: 12,
    fontWeight: '800',
  },

  imageTagPill: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  imageTagText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  activeRailWrap: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  activeRail: {
    width: 2,
    height: '60%',
    borderRadius: 999,
  },
  reactionPillWrap: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    alignItems: 'flex-end',
    gap: 8,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  filmStripEdge: {
    position: 'absolute',
    left: 8,
    top: 10,
    bottom: 10,
    width: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  filmStripHole: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  shimmerGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 90,
  },

  gateCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  gateTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
  },
  gateBody: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
  },

  storyHeader: {
    paddingBottom: 12,
  },
  storyAvatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  storyAvatar: {
    width: 88,
    height: 88,
  },
  storyTextCol: {
    paddingHorizontal: 8,
  },
  storyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  storyName: {
    fontSize: 18,
    fontWeight: '900',
    maxWidth: '75%',
  },
  storySubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: 6,
  },
  storySubText: {
    fontSize: 12,
    fontWeight: '600',
  },
  storyChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
  },
  storyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  storyChipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  underlineWrap: {
    marginTop: 6,
    width: 28,
    height: 2,
  },
  underline: {
    width: 28,
    height: 2,
    borderRadius: 999,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipEmoji: {
    fontSize: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  fabStack: {
    position: 'absolute',
    right: 14,
    gap: 10,
  },
  fabWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  fab: {
    minWidth: 104,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  fabLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  giftBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  giftSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 12,
  },
  giftHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginBottom: 10,
  },
  giftTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  giftSubtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  giftGrid: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  noteInputWrap: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: {
    minHeight: 88,
    fontSize: 14,
    lineHeight: 20,
  },
  noteCounter: {
    marginTop: 6,
    fontSize: 11,
    textAlign: 'right',
  },
  giftCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  giftLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
  },
  giftIconGlow: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    padding: 6,
    backgroundColor: 'rgba(186,155,255,0.22)',
    shadowColor: '#9b7bff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  giftNote: {
    fontSize: 11,
  },
  giftSendButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  giftSendText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
