import ExploreHeader from "@/components/ExploreHeader";
import type { ExploreStackHandle } from "@/components/ExploreStack.reanimated";
import ExploreStack from "@/components/ExploreStack.reanimated";
import MatchModal from '@/components/MatchModal';
import MomentCreateModal from '@/components/MomentCreateModal';
import MomentViewer from '@/components/MomentViewer';
import PremiumUpsellModal from '@/components/premium/PremiumUpsellModal';
import ProfileVideoModal from '@/components/ProfileVideoModal';
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { requestAndSavePreciseLocation, saveManualCityLocation } from "@/hooks/useLocationPreference";
import { useMoments, type MomentUser } from '@/hooks/useMoments';
import { usePremiumState } from "@/hooks/use-premium-state";
import useVibesFeed, { applyVibesFilters, type VibesFilters } from "@/hooks/useVibesFeed";
import { useAuth } from "@/lib/auth-context";
import { haptics } from "@/lib/haptics";
import { canAccessInternalTools } from "@/lib/internal-tools";
import { showOpenSettingsPrompt } from "@/lib/permission-prompts";
import { recordProfileSignal } from '@/lib/profile-signals';
import { applyDefaults as applyCompassDefaults, mapToDiscoveryFilters } from "@/lib/relationship-compass";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe, { isLinearGradientAvailable } from "@/components/NativeWrappers/LinearGradientSafe";
import IntentRequestSheet from "@/components/IntentRequestSheet";
import { router, useFocusEffect } from 'expo-router';
import { CircleOff, Gem, Sparkles, Target } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, DeviceEventEmitter, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import VibesAllMomentsModal from "@/components/vibes/VibesAllMomentsModal";
import VibesMomentsStrip from "@/components/vibes/VibesMomentsStrip";
import VibesIntroModal from "@/components/vibes/VibesIntroModal";
import Notice from "@/components/ui/Notice";
import { ExploreStackSkeleton } from "@/components/ui/Skeleton";
import { isLikelyNetworkError } from "@/lib/network";
import { logger } from "@/lib/telemetry/logger";
import type { MomentRelationshipContext } from "@/types/moment-context";

const DISTANCE_UNIT_KEY = 'distance_unit';
const DISTANCE_UNIT_EVENT = 'distance_unit_changed';
const KM_PER_MILE = 1.60934;
const VIBES_FILTERS_KEY = 'vibes_filters_v2';
const VIBES_INTRO_SEEN_KEY = 'vibes_intro_seen_v1';
const VIBES_MOMENTS_COLLAPSED_KEY = 'vibes:momentsCollapsed';
const VIBES_LOCATION_PROMPT_DISMISSED_KEY = 'vibes:locationPromptDismissed:v1';

const clearPremiumVibesFilters = (filters: VibesFilters): VibesFilters => ({
  ...filters,
  verifiedOnly: false,
  hasVideoOnly: false,
  activeOnly: false,
  distanceFilterKm: null,
  minVibeScore: null,
  minSharedInterests: 0,
});

type DistanceUnit = 'auto' | 'km' | 'mi';
type PremiumUpsellState = {
  requiredPlan: 'SILVER' | 'GOLD';
  title: string;
  message: string;
};
type RoomSummary = {
  title: string;
  body: string;
};
type PreviewTone = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
};

const COUNTRY_OPTIONS = [
  { label: 'Ghana', code: 'GH' },
  { label: 'United States', code: 'US' },
  { label: 'United Kingdom', code: 'GB' },
  { label: 'Canada', code: 'CA' },
  { label: 'Germany', code: 'DE' },
  { label: 'Netherlands', code: 'NL' },
  { label: 'Italy', code: 'IT' },
  { label: 'Australia', code: 'AU' },
  { label: 'South Africa', code: 'ZA' },
  { label: 'Nigeria', code: 'NG' },
  { label: 'Ivory Coast', code: 'CI' },
  { label: 'Burkina Faso', code: 'BF' },
  { label: 'France', code: 'FR' },
  { label: 'Spain', code: 'ES' },
  { label: 'Belgium', code: 'BE' },
  { label: 'Sweden', code: 'SE' },
  { label: 'Norway', code: 'NO' },
  { label: 'UAE', code: 'AE' },
];

const resolveAutoUnit = (): 'km' | 'mi' => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return /[-_]US\b/i.test(locale) ? 'mi' : 'km';
  } catch {
    return 'km';
  }
};

const hasAnyDraftFilters = (filters: VibesFilters) =>
  Boolean(filters.verifiedOnly) ||
  Boolean(filters.hasVideoOnly) ||
  Boolean(filters.activeOnly) ||
  filters.distanceFilterKm != null ||
  filters.minVibeScore != null ||
  (filters.minSharedInterests || 0) > 0 ||
  filters.minAge !== 18 ||
  filters.maxAge !== 60 ||
  Boolean(filters.religionFilter) ||
  Boolean(filters.locationQuery?.trim());

const deriveActivePresetKey = (filters: VibesFilters): string | null => {
  if (filters.verifiedOnly && filters.minVibeScore === 60 && (filters.minSharedInterests || 0) >= 2) return 'real-intent';
  if (filters.minVibeScore === 70 && (filters.minSharedInterests || 0) >= 2 && filters.activeOnly) return 'high-vibe';
  if (filters.verifiedOnly && !filters.hasVideoOnly && !filters.activeOnly && filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'verified';
  if (filters.hasVideoOnly && !filters.verifiedOnly && !filters.activeOnly && filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'video';
  if (filters.activeOnly && !filters.verifiedOnly && !filters.hasVideoOnly && filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'active';
  return null;
};

const deriveRoomSummary = (filters: VibesFilters): RoomSummary => {
  const preset = deriveActivePresetKey(filters);
  if (!hasAnyDraftFilters(filters)) {
    return {
      title: 'Open room - discover freely',
      body: 'Keep the room open and let chemistry surprise you.',
    };
  }
  if (preset === 'real-intent') {
    return {
      title: 'Real-intent room',
      body: 'Biased toward trust, overlap, and people showing stronger follow-through.',
    };
  }
  if (preset === 'high-vibe') {
    return {
      title: 'High-vibe room',
      body: 'Fewer, stronger profiles ahead with better chemistry and momentum.',
    };
  }
  if (filters.verifiedOnly && filters.activeOnly) {
    return {
      title: 'Shaped around trusted, active people',
      body: 'Less noise, more visible energy, and a tighter pace.',
    };
  }
  if (filters.minVibeScore != null || (filters.minSharedInterests || 0) > 0) {
    return {
      title: 'Focused on stronger chemistry',
      body: 'You are asking for fewer matches, but better overlap and better fit.',
    };
  }
  if (filters.distanceFilterKm != null) {
    return {
      title: 'Closer, tighter room',
      body: 'Discovery is leaning toward people within an easier reach.',
    };
  }
  if (filters.religionFilter || filters.locationQuery?.trim()) {
    return {
      title: 'Gently refined room',
      body: 'A few quiet boundaries are shaping discovery without closing it down too much.',
    };
  }
  if (filters.hasVideoOnly) {
    return {
      title: 'Biased toward presence',
      body: 'The room is leaning toward people who have shown a little more of themselves.',
    };
  }
  return {
    title: 'Room taking shape',
    body: 'A calmer, more selective mix is starting to emerge.',
  };
};

const deriveCompatibilityHint = (filters: VibesFilters) => {
  if (filters.minVibeScore == null && (filters.minSharedInterests || 0) === 0) return 'Wide and open';
  if ((filters.minVibeScore || 0) >= 70 || (filters.minSharedInterests || 0) >= 3) return 'Fewer but stronger matches';
  if ((filters.minVibeScore || 0) >= 60 || (filters.minSharedInterests || 0) >= 2) return 'Tighter, higher-intent room';
  return 'Balanced chemistry';
};

const derivePreviewTone = (previewCount: number | null, filters: VibesFilters, loadedCount: number): PreviewTone => {
  if (previewCount == null) {
    return {
      eyebrow: 'Room preview',
      title: 'Shape first, then preview',
      body: 'Your count updates as the room shifts.',
      cta: 'Apply my room',
    };
  }
  if (previewCount === 0) {
    return {
      eyebrow: 'Very selective',
      title: 'No one matches this room yet',
      body: 'Ease a few controls and the room will open again.',
      cta: 'Apply my room',
    };
  }
  if (!hasAnyDraftFilters(filters)) {
    return {
      eyebrow: 'Open discovery',
      title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
      body: loadedCount > 0 ? 'Broad, relaxed, and ready for surprise chemistry.' : 'A wide-open room for freer discovery.',
      cta: 'Apply my room',
    };
  }
  if (previewCount <= 5) {
    return {
      eyebrow: 'Highly curated',
      title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
      body: 'Very selective. Fewer profiles ahead, but likely stronger fit.',
      cta: 'Apply my room',
    };
  }
  if (previewCount <= 15) {
    return {
      eyebrow: 'Focused room',
      title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
      body: 'More selective, stronger fit.',
      cta: 'Apply & preview my room',
    };
  }
  return {
    eyebrow: 'Balanced room',
    title: `Preview: ${previewCount} ${previewCount === 1 ? 'person matches this room' : 'people match this room'}`,
    body: 'A healthy mix of openness and stronger targeting.',
    cta: 'Apply my room',
  };
};

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { profile, user, refreshProfile } = useAuth();
  const { hasAccess } = usePremiumState();
  const hasAdvancedFilters = hasAccess('SILVER');
  const profileCountryCode = (profile as any)?.current_country_code as string | undefined;
  const relationshipCompass = useMemo(() => {
    const raw = (profile as any)?.relationship_compass;
    if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) return null;
    return applyCompassDefaults(raw);
  }, [profile]);

  const { momentUsers, refresh: refreshMoments } = useMoments({
    currentUserId: user?.id,
    currentUserProfile: profile,
  });
  const momentBoostIds = useMemo(
    () => new Set(momentUsers.filter((u) => u.moments.length > 0).map((u) => String(u.userId))),
    [momentUsers],
  );

  // celebration modal state

  const [activeTab, setActiveTab] = useState<
    "recommended" | "nearby" | "active"
  >("recommended");
  const [activeWindowMinutes, _setActiveWindowMinutes] = useState(15);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const [viewerInterests, setViewerInterests] = useState<string[]>([]);
  const vibesSegment = activeTab === 'nearby' ? 'nearby' : activeTab === 'active' ? 'activeNow' : 'forYou';
  const {
    profiles: matchList,
    poolProfiles,
    recordSwipe,
    undoLastSwipe,
    refresh: refreshMatches,
    refreshing: refreshingMatches,
    loading: loadingMatches,
    error: matchesError,
    smartCount,
    lastMutualMatch,
    fetchProfileDetails,
    applyFilters,
    filters: appliedFilters,
    refreshRemaining: _refreshRemaining,
  } = useVibesFeed({
    userId: profile?.id,
    segment: vibesSegment,
    activeWindowMinutes,
    distanceUnit,
    momentUserIds: momentBoostIds,
    viewerInterests,
    viewerGender: (profile as any)?.gender ?? null,
    viewerProfile: profile,
    relationshipCompass,
  });

  const [celebrationMatch, setCelebrationMatch] = useState<any | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const lastFeedErrorAtRef = useRef(0);
  const [momentViewerVisible, setMomentViewerVisible] = useState(false);
  const [momentCreateVisible, setMomentCreateVisible] = useState(false);
  const [momentStartUserId, setMomentStartUserId] = useState<string | null>(null);
  const [allMomentsVisible, setAllMomentsVisible] = useState(false);
  const [momentsCollapsed, setMomentsCollapsed] = useState(true);
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(false);
  const [momentPriorityProfileIds, setMomentPriorityProfileIds] = useState<Set<string>>(new Set());
  const [momentRelationshipContextByProfileId, setMomentRelationshipContextByProfileId] = useState<Record<string, MomentRelationshipContext>>({});
  const [intentSheetVisible, setIntentSheetVisible] = useState(false);
  const [intentTarget, setIntentTarget] = useState<{ id: string; name?: string | null } | null>(null);

  // when the hook reports a mutual match, show the celebration modal
  useEffect(() => {
    if (lastMutualMatch) {
      setCelebrationMatch(lastMutualMatch);
      void haptics.success();
    }
  }, [lastMutualMatch]);

  useEffect(() => {
    if (!matchesError) {
      setOfflineNotice(null);
      return;
    }
    // Only show a blocking notice when the feed is empty, so it doesn't get in the way
    // of swiping when data is already present.
    if (matchList.length === 0) {
      const now = Date.now();
      if (now - lastFeedErrorAtRef.current > 60_000) {
        lastFeedErrorAtRef.current = now;
        logger.error("[vibes] feed_error", matchesError, {
          segment: vibesSegment,
          isLikelyNetwork: isLikelyNetworkError(matchesError),
          hasUserId: !!profile?.id,
        });
      }

      // Keep tester UX generic; detailed error goes to Sentry.
      setOfflineNotice("Check your connection and try again.");
      return;
    }
    setOfflineNotice(null);
  }, [matchList.length, matchesError]);

  const resolvedDistanceUnit = useMemo(
    () => (distanceUnit === 'auto' ? resolveAutoUnit() : distanceUnit),
    [distanceUnit]
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [manualLocationModalVisible, setManualLocationModalVisible] = useState(false);
  const [manualLocation, setManualLocation] = useState(profile?.location || "");
  const [manualCountryCode, setManualCountryCode] = useState(profileCountryCode || "");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [premiumUpsell, setPremiumUpsell] = useState<PremiumUpsellState | null>(null);
  const [reopenFiltersAfterUpsell, setReopenFiltersAfterUpsell] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filtersPanel, setFiltersPanel] = useState<'main' | 'location'>('main');
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [hasVideoOnly, setHasVideoOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [distanceFilterKm, setDistanceFilterKm] = useState<number | null>(null);
  const [minAge, setMinAge] = useState<number>(18);
  const [maxAge, setMaxAge] = useState<number>(60);
  const [religionFilter, setReligionFilter] = useState<string | null>(null);
  const [minVibeScore, setMinVibeScore] = useState<number | null>(null);
  const [minSharedInterests, setMinSharedInterests] = useState<number>(0);
  const [locationQuery, setLocationQuery] = useState<string>('');
  const prefetchedDetailsRef = useRef<Set<string>>(new Set());
  const prefetchInFlightRef = useRef<Set<string>>(new Set());
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshTsRef = useRef<number>(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const advancedControlsAnim = useRef(new Animated.Value(0)).current;
  const filtersStorageKey = useMemo(
    () => (profile?.id ? `${VIBES_FILTERS_KEY}:${profile.id}` : null),
    [profile?.id],
  );
  const relationshipCompassFilters = useMemo(
    () => (relationshipCompass ? mapToDiscoveryFilters(relationshipCompass) : {}),
    [relationshipCompass],
  );
  const filtersLoadedKeyRef = useRef<string | null>(null);
  const introStorageKey = useMemo(
    () => (profile?.id ? `${VIBES_INTRO_SEEN_KEY}:${profile.id}` : user?.id ? `${VIBES_INTRO_SEEN_KEY}:auth:${user.id}` : null),
    [profile?.id, user?.id],
  );

  const closeIntro = useCallback(async () => {
    try {
      if (introStorageKey) await AsyncStorage.setItem(introStorageKey, '1');
    } catch {}
    setIntroVisible(false);
  }, [introStorageKey]);

  useEffect(() => {
    if (!filtersStorageKey) return;
    if (filtersLoadedKeyRef.current === filtersStorageKey) return;
    filtersLoadedKeyRef.current = filtersStorageKey;

    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(filtersStorageKey);
        if (cancelled) return;
        if (!raw) {
          if (Object.keys(relationshipCompassFilters).length === 0) return;
          const compassDrivenFilters = {
            verifiedOnly: Boolean(relationshipCompassFilters.verifiedOnly),
            hasVideoOnly: false,
            activeOnly: false,
            distanceFilterKm:
              typeof relationshipCompassFilters.distanceFilterKm === 'number'
                ? relationshipCompassFilters.distanceFilterKm
                : null,
            minAge: 18,
            maxAge: 60,
            religionFilter: null,
            minVibeScore: null,
            minSharedInterests:
              typeof relationshipCompassFilters.minSharedInterests === 'number'
                ? relationshipCompassFilters.minSharedInterests
                : 0,
            locationQuery:
              typeof relationshipCompassFilters.locationQuery === 'string'
                ? relationshipCompassFilters.locationQuery
                : '',
          };
          setVerifiedOnly(compassDrivenFilters.verifiedOnly);
          setHasVideoOnly(compassDrivenFilters.hasVideoOnly);
          setActiveOnly(compassDrivenFilters.activeOnly);
          setDistanceFilterKm(compassDrivenFilters.distanceFilterKm);
          setMinAge(compassDrivenFilters.minAge);
          setMaxAge(compassDrivenFilters.maxAge);
          setReligionFilter(compassDrivenFilters.religionFilter);
          setMinVibeScore(compassDrivenFilters.minVibeScore);
          setMinSharedInterests(compassDrivenFilters.minSharedInterests);
          setLocationQuery(compassDrivenFilters.locationQuery);
          applyFilters(compassDrivenFilters);
          return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;

        // Keep it best-effort; any missing fields just fall back to defaults.
        setVerifiedOnly(Boolean(parsed.verifiedOnly));
        setHasVideoOnly(Boolean(parsed.hasVideoOnly));
        setActiveOnly(Boolean(parsed.activeOnly));
        setDistanceFilterKm(typeof parsed.distanceFilterKm === 'number' ? parsed.distanceFilterKm : null);
        setMinAge(typeof parsed.minAge === 'number' ? parsed.minAge : 18);
        setMaxAge(typeof parsed.maxAge === 'number' ? parsed.maxAge : 60);
        setReligionFilter(typeof parsed.religionFilter === 'string' ? parsed.religionFilter : null);
        setMinVibeScore(typeof parsed.minVibeScore === 'number' ? parsed.minVibeScore : null);
        setMinSharedInterests(typeof parsed.minSharedInterests === 'number' ? parsed.minSharedInterests : 0);
        setLocationQuery(typeof parsed.locationQuery === 'string' ? parsed.locationQuery : '');

        applyFilters({
          verifiedOnly: Boolean(parsed.verifiedOnly),
          hasVideoOnly: Boolean(parsed.hasVideoOnly),
          activeOnly: Boolean(parsed.activeOnly),
          distanceFilterKm: typeof parsed.distanceFilterKm === 'number' ? parsed.distanceFilterKm : null,
          minAge: typeof parsed.minAge === 'number' ? parsed.minAge : 18,
          maxAge: typeof parsed.maxAge === 'number' ? parsed.maxAge : 60,
          religionFilter: typeof parsed.religionFilter === 'string' ? parsed.religionFilter : null,
          minVibeScore: typeof parsed.minVibeScore === 'number' ? parsed.minVibeScore : null,
          minSharedInterests: typeof parsed.minSharedInterests === 'number' ? parsed.minSharedInterests : 0,
          locationQuery: typeof parsed.locationQuery === 'string' ? parsed.locationQuery : '',
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFilters, filtersStorageKey, relationshipCompassFilters]);

  const queueRefreshMatches = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = setTimeout(() => {
      if (Date.now() - lastRefreshTsRef.current > 900) {
        lastRefreshTsRef.current = Date.now();
        refreshMatches();
      }
    }, 150);
  }, [refreshMatches]);

  useFocusEffect(
    useCallback(() => {
      if (!introStorageKey) return;
      let cancelled = false;
      (async () => {
        try {
          const seen = await AsyncStorage.getItem(introStorageKey);
          if (cancelled || seen) return;
          // Avoid showing on a cold focus while other modals might still be presenting.
          setTimeout(() => {
            if (cancelled) return;
            setIntroVisible(true);
          }, 650);
        } catch {}
      })();
      return () => {
        cancelled = true;
      };
    }, [introStorageKey]),
  );

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const loadDistanceUnit = async () => {
        try {
          const stored = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
          if (!mounted) return;
          if (stored === 'auto' || stored === 'km' || stored === 'mi') {
            setDistanceUnit((prev) => {
              if (prev !== stored) {
                queueRefreshMatches();
                return stored;
              }
              return prev;
            });
          }
        } catch {}
      };
      void loadDistanceUnit();
      return () => {
        mounted = false;
        if (refreshDebounceRef.current) {
          clearTimeout(refreshDebounceRef.current);
          refreshDebounceRef.current = null;
        }
      };
    }, [queueRefreshMatches])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DISTANCE_UNIT_EVENT, (next: DistanceUnit) => {
      if (next === 'auto' || next === 'km' || next === 'mi') {
        setDistanceUnit((prev) => {
          if (prev !== next) {
            queueRefreshMatches();
            return next;
          }
          return prev;
        });
      }
    });
    return () => {
      sub.remove();
    };
  }, [queueRefreshMatches]);

  const handleRefreshVibes = useCallback(() => {
    refreshMatches();
    refreshMoments();
  }, [refreshMatches, refreshMoments]);

  useEffect(() => {
    if (!profile?.id) {
      setViewerInterests([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profile_interests')
          .select('interests(name)')
          .eq('profile_id', profile.id);
        if (cancelled || error) return;
        const names: string[] = [];
        (data || []).forEach((row: any) => {
          const n = row?.interests?.name;
          if (typeof n === 'string' && n.trim()) names.push(n.trim());
        });
        setViewerInterests(names);
      } catch {
        if (!cancelled) setViewerInterests([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const stackRef = useRef<ExploreStackHandle | null>(null);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const superlikePulse = useRef(new Animated.Value(0)).current;
  const floatingMomentsOpacity = useRef(new Animated.Value(0)).current;
  const floatingMomentsTranslateY = useRef(new Animated.Value(-10)).current;
  const floatingMomentsScale = useRef(new Animated.Value(0.985)).current;
  const [superlikesLeft, setSuperlikesLeft] = useState<number>(3);
  const [renderFloatingMoments, setRenderFloatingMoments] = useState(false);
  const particles = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const fallbackEntranceTranslate = useRef(new Animated.Value(12)).current;
  const fallbackEntranceOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fallbackEntranceTranslate, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fallbackEntranceOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fallbackEntranceOpacity, fallbackEntranceTranslate]);

  const distanceChipOptions = useMemo(() => {
    const base = [5, 10, 25, 50, 100];
    if (resolvedDistanceUnit === 'mi') {
      return base.map((mi) => ({
        label: `${mi} mi`,
        km: Number((mi * KM_PER_MILE).toFixed(3)),
      }));
    }
    return base.map((km) => ({ label: `${km} km`, km }));
  }, [resolvedDistanceUnit]);

  const distinctReligions = useMemo(() => {
    const source = poolProfiles.length > 0 ? poolProfiles : matchList;
    const preferred = ['Christian', 'Muslim'];
    const normalizedSeen = new Set<string>();
    const collected: string[] = [];

    const pushReligion = (value: unknown) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return;
      const normalized = trimmed.toLowerCase();
      if (normalizedSeen.has(normalized)) return;
      normalizedSeen.add(normalized);
      collected.push(trimmed);
    };

    preferred.forEach(pushReligion);
    source.forEach((m) => pushReligion((m as any).religion));

    return collected.slice(0, 8);
  }, [matchList, poolProfiles]);

  const myMomentUser = useMemo(() => momentUsers.find((u) => u.isOwn), [momentUsers]);
  const prioritizedMomentUsers = useMemo(
    () =>
      momentUsers
        .filter((u) => !u.isOwn && u.moments.length > 0 && u.profileId && momentPriorityProfileIds.has(String(u.profileId))),
    [momentPriorityProfileIds, momentUsers],
  );
  const otherMomentUsers = useMemo(
    () =>
      momentUsers.filter(
        (u) =>
          !u.isOwn &&
          u.moments.length > 0 &&
          (!u.profileId || !momentPriorityProfileIds.has(String(u.profileId))),
      ),
    [momentPriorityProfileIds, momentUsers],
  );
  const momentStripUsers = useMemo(() => {
    const list: MomentUser[] = [];
    if (myMomentUser) list.push(myMomentUser);
    return [...list, ...prioritizedMomentUsers, ...otherMomentUsers];
  }, [myMomentUser, otherMomentUsers, prioritizedMomentUsers]);
  const hasMyActiveMoment = (myMomentUser?.moments?.length ?? 0) > 0;
  const hasOtherActiveMoments = prioritizedMomentUsers.length + otherMomentUsers.length > 0;
  const showMomentsEmptyState = !hasOtherActiveMoments && !hasMyActiveMoment;
  const momentUsersWithContent = useMemo(() => momentUsers.filter((u) => u.moments.length > 0), [momentUsers]);
  const shouldShowFloatingMoments = Boolean(user?.id && !showMomentsEmptyState && !momentsCollapsed);

  useEffect(() => {
    if (shouldShowFloatingMoments) {
      setRenderFloatingMoments(true);
      floatingMomentsOpacity.stopAnimation();
      floatingMomentsTranslateY.stopAnimation();
      floatingMomentsScale.stopAnimation();
      floatingMomentsOpacity.setValue(0);
      floatingMomentsTranslateY.setValue(-10);
      floatingMomentsScale.setValue(0.985);
      Animated.parallel([
        Animated.timing(floatingMomentsOpacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(floatingMomentsTranslateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(floatingMomentsScale, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!renderFloatingMoments) return;

    floatingMomentsOpacity.stopAnimation();
    floatingMomentsTranslateY.stopAnimation();
    floatingMomentsScale.stopAnimation();
    Animated.parallel([
      Animated.timing(floatingMomentsOpacity, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(floatingMomentsTranslateY, {
        toValue: -8,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(floatingMomentsScale, {
        toValue: 0.985,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setRenderFloatingMoments(false);
    });
  }, [
    floatingMomentsOpacity,
    floatingMomentsScale,
    floatingMomentsTranslateY,
    renderFloatingMoments,
    shouldShowFloatingMoments,
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadMomentsCollapsed = async () => {
      try {
        const stored = await AsyncStorage.getItem(VIBES_MOMENTS_COLLAPSED_KEY);
        if (cancelled) return;
        if (stored === 'true' || stored === 'false') {
          setMomentsCollapsed(stored === 'true');
          return;
        }
      } catch {
        // ignore
      }
      setMomentsCollapsed(true);
    };
    void loadMomentsCollapsed();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(VIBES_MOMENTS_COLLAPSED_KEY, String(momentsCollapsed)).catch(() => {});
  }, [momentsCollapsed]);

  useEffect(() => {
    let cancelled = false;
    const loadMomentPriorityProfiles = async () => {
      if (!profile?.id) {
        setMomentPriorityProfileIds(new Set());
        setMomentRelationshipContextByProfileId({});
        return;
      }

      const positiveSwipeActions = ['LIKE', 'SUPERLIKE'];
      const next = new Set<string>();
      const nextContext: Record<string, MomentRelationshipContext> = {};
      const swipeSignals = new Map<
        string,
        {
          likedYou: boolean;
          youLiked: boolean;
          likedYouAt: string | null;
          youLikedAt: string | null;
        }
      >();
      const intentSignals = new Map<string, MomentRelationshipContext>();

      const getIntentPriority = (cue: string) => {
        if (cue === 'You matched') return 3;
        if (cue === 'Door reopened') return 2;
        return 1;
      };

      const [{ data: swipeRows, error: swipeError }, { data: intentRows, error: intentError }] = await Promise.all([
        supabase
          .from('swipes')
          .select('swiper_id,target_id,action,created_at')
          .or(`swiper_id.eq.${profile.id},target_id.eq.${profile.id}`)
          .in('action', positiveSwipeActions),
        supabase
          .from('intent_requests')
          .select('actor_id,recipient_id,status,created_at')
          .or(`actor_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
          .in('status', ['pending', 'accepted', 'matched']),
      ]);

      if (swipeError) {
        console.log('[vibes] moment priority swipe fetch error', swipeError);
      }
      if (intentError) {
        console.log('[vibes] moment priority intent fetch error', intentError);
      }

      ((swipeRows as { swiper_id: string; target_id: string; action: string; created_at: string | null }[] | null) ?? []).forEach((row) => {
        const peerId = row.swiper_id === profile.id ? row.target_id : row.swiper_id;
        if (peerId) next.add(String(peerId));
        if (!peerId) return;
        const key = String(peerId);
        const current = swipeSignals.get(key) || {
          likedYou: false,
          youLiked: false,
          likedYouAt: null,
          youLikedAt: null,
        };
        if (row.target_id === profile.id) {
          current.likedYou = true;
          current.likedYouAt = row.created_at ?? current.likedYouAt;
        }
        if (row.swiper_id === profile.id) {
          current.youLiked = true;
          current.youLikedAt = row.created_at ?? current.youLikedAt;
        }
        swipeSignals.set(key, current);
      });

      ((intentRows as { actor_id: string; recipient_id: string; status: string; created_at: string | null }[] | null) ?? []).forEach((row) => {
        const peerId = row.actor_id === profile.id ? row.recipient_id : row.actor_id;
        if (peerId) next.add(String(peerId));
        if (!peerId) return;
        const key = String(peerId);
        const status = String(row.status || '').toLowerCase();
        const cue =
          status === 'matched'
            ? 'You matched'
            : status === 'accepted'
              ? 'Door reopened'
              : row.actor_id === profile.id
                ? 'You reached out'
                : 'They reached out';
        const nextSignal: MomentRelationshipContext = {
          cue,
          happenedAt: row.created_at,
          source: 'intent',
        };
        const current = intentSignals.get(key);
        if (!current) {
          intentSignals.set(key, nextSignal);
          return;
        }
        const currentPriority = getIntentPriority(current.cue);
        const nextPriority = getIntentPriority(cue);
        if (nextPriority > currentPriority) {
          intentSignals.set(key, nextSignal);
          return;
        }
        if (
          nextPriority === currentPriority &&
          row.created_at &&
          (!current.happenedAt || new Date(row.created_at).getTime() > new Date(current.happenedAt).getTime())
        ) {
          intentSignals.set(key, nextSignal);
        }
      });

      if (!cancelled) {
        setMomentPriorityProfileIds(next);
        next.forEach((profileId) => {
          const key = String(profileId);
          const intentSignal = intentSignals.get(key);
          if (intentSignal) {
            nextContext[key] = intentSignal;
            return;
          }
          const swipeSignal = swipeSignals.get(key);
          if (!swipeSignal) return;
          if (swipeSignal.likedYou && swipeSignal.youLiked) {
            nextContext[key] = {
              cue: 'You liked each other',
              happenedAt: swipeSignal.youLikedAt || swipeSignal.likedYouAt,
              source: 'swipe',
            };
            return;
          }
          if (swipeSignal.likedYou) {
            nextContext[key] = {
              cue: 'Liked you',
              happenedAt: swipeSignal.likedYouAt,
              source: 'swipe',
            };
            return;
          }
          if (swipeSignal.youLiked) {
            nextContext[key] = {
              cue: 'You liked them',
              happenedAt: swipeSignal.youLikedAt,
              source: 'swipe',
            };
          }
        });
        setMomentRelationshipContextByProfileId(nextContext);
      }
    };

    void loadMomentPriorityProfiles();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const openMomentViewer = (userId: string) => {
    setMomentStartUserId(userId);
    setMomentViewerVisible(true);
  };

  const openIntentSheet = useCallback(() => {
    const target = matchList[currentIndex];
    if (!target) return;
    setIntentTarget({ id: String(target.id), name: (target as any).name || (target as any).full_name });
    setIntentSheetVisible(true);
  }, [currentIndex, matchList]);

  const handlePressMyMoment = useCallback(() => {
    if (hasMyActiveMoment) {
      router.push('/my-moments');
      return;
    }
    setMomentCreateVisible(true);
  }, [hasMyActiveMoment, router]);

  const handlePressUserMoment = useCallback(
    (userId: string) => {
      openMomentViewer(userId);
    },
    []
  );
  const handleMomentIntent = useCallback((momentUser: MomentUser) => {
    if (!momentUser.profileId) return;
    setMomentViewerVisible(false);
    setMomentStartUserId(null);
    requestAnimationFrame(() => {
      setIntentTarget({ id: String(momentUser.profileId), name: momentUser.name });
      setIntentSheetVisible(true);
    });
  }, []);
  const handleMomentsPress = () => {
    setAllMomentsVisible(true);
  };

  const hasPreciseCoords = profile?.latitude != null && profile?.longitude != null;
  const hasCityOnly = !!profile?.location && profile?.location_precision === 'CITY';
  const needsLocationPrompt = !hasPreciseCoords && !hasCityOnly;
  const shouldShowLocationPrompt =
    needsLocationPrompt && (activeTab === 'nearby' || !locationPromptDismissed);
  const showCompactLocationPrompt = shouldShowLocationPrompt && activeTab !== 'nearby';

  useEffect(() => {
    if (typeof profile?.superlikes_left === 'number') {
      setSuperlikesLeft(Math.max(0, profile.superlikes_left));
    }
  }, [profile?.superlikes_left]);

  useEffect(() => {
    setManualLocation(profile?.location || "");
  }, [profile?.location]);
  useEffect(() => {
    setManualCountryCode(profileCountryCode || "");
  }, [profileCountryCode]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(VIBES_LOCATION_PROMPT_DISMISSED_KEY)
      .then((value) => {
        if (!cancelled) setLocationPromptDismissed(value === '1');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!needsLocationPrompt) {
      setLocationPromptDismissed(false);
      AsyncStorage.removeItem(VIBES_LOCATION_PROMPT_DISMISSED_KEY).catch(() => undefined);
    }
  }, [needsLocationPrompt]);

  // auto-show prompt once when location is missing
  useEffect(() => {
    if (needsLocationPrompt) {
      setManualLocationModalVisible(false);
    }
  }, [needsLocationPrompt]);

  const handleUseMyLocation = async () => {
    if (!profile?.id) return;
    setIsSavingLocation(true);
    setLocationError(null);
  const res = await requestAndSavePreciseLocation(profile.id);
    if (!res.ok) {
      if ('permissionDenied' in res && res.permissionDenied) {
        showOpenSettingsPrompt(
          'Location access',
          'Turn on location access in Settings so Betweener can personalize nearby profiles accurately.',
        );
      }
      setLocationError('error' in res ? res.error : 'Unable to save location');
    } else {
      setLocationPromptDismissed(false);
      AsyncStorage.removeItem(VIBES_LOCATION_PROMPT_DISMISSED_KEY).catch(() => undefined);
      await refreshProfile();
      await refreshMatches();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await refreshProfile();
      await refreshMatches();
    }
    setIsSavingLocation(false);
  };

  const closeManualLocationModal = useCallback(() => {
    setManualLocationModalVisible(false);
  }, []);

  const dismissLocationPrompt = useCallback(() => {
    setLocationPromptDismissed(true);
    AsyncStorage.setItem(VIBES_LOCATION_PROMPT_DISMISSED_KEY, '1').catch(() => undefined);
  }, []);

  const openManualLocationModal = useCallback(() => {
    setLocationError(null);
    setManualLocation(profile?.location || "");
    setManualCountryCode(profileCountryCode || manualCountryCode || "");
    setManualLocationModalVisible(true);
  }, [manualCountryCode, profile?.location, profileCountryCode]);

  const openManualLocationModalFromFilters = useCallback(() => {
    setLocationError(null);
    setManualLocation(profile?.location || "");
    setManualCountryCode(profileCountryCode || manualCountryCode || "");
    setFiltersPanel('location');
  }, [manualCountryCode, profile?.location, profileCountryCode]);

  const handleSaveManualLocation = async () => {
    if (!profile?.id) return;
    setIsSavingLocation(true);
    setLocationError(null);
    if (!manualCountryCode) {
      setLocationError('Please select a country.');
      setIsSavingLocation(false);
      return;
    }
    const res = await saveManualCityLocation(profile.id, manualLocation, manualCountryCode);
    if (!res.ok) {
      setLocationError('error' in res ? res.error : 'Unable to save location');
    } else {
      setLocationPromptDismissed(false);
      AsyncStorage.removeItem(VIBES_LOCATION_PROMPT_DISMISSED_KEY).catch(() => undefined);
      if (filtersVisible) {
        setFiltersPanel('main');
      } else {
        closeManualLocationModal();
      }
      await refreshProfile();
      await refreshMatches();
    }
    setIsSavingLocation(false);
  };

  const handleApplyFilters = () => {
    if (!hasAdvancedFilters && (verifiedOnly || hasVideoOnly || activeOnly || distanceFilterKm != null || minVibeScore != null || minSharedInterests > 0)) {
      setReopenFiltersAfterUpsell(true);
      setFiltersVisible(false);
      setTimeout(() => {
        setPremiumUpsell({
          requiredPlan: 'SILVER',
          title: 'Unlock advanced filters',
          message: 'Advanced Vibes filters are included with Silver and Gold. Upgrade to shape the room more precisely.',
        });
      }, 120);
      return;
    }
    setFiltersVisible(false);
    const next = {
      verifiedOnly,
      hasVideoOnly,
      activeOnly,
      distanceFilterKm,
      minAge,
      maxAge,
      religionFilter,
      minVibeScore,
      minSharedInterests,
      locationQuery,
    };
    applyFilters(next);
    setCurrentIndex(0);

    // Persist for a "premium" feel (your preferences stick).
    if (filtersStorageKey) {
      AsyncStorage.setItem(filtersStorageKey, JSON.stringify(next)).catch(() => {});
    }
  };

  useEffect(() => {
    if (hasAdvancedFilters || !appliedFilters) return;
    const premiumFiltersActive =
      Boolean(appliedFilters.verifiedOnly) ||
      Boolean(appliedFilters.hasVideoOnly) ||
      Boolean(appliedFilters.activeOnly) ||
      appliedFilters.distanceFilterKm != null ||
      appliedFilters.minVibeScore != null ||
      (appliedFilters.minSharedInterests || 0) > 0;

    if (!premiumFiltersActive) return;

    const cleared = clearPremiumVibesFilters(appliedFilters);
    applyFilters(cleared);
    if (filtersStorageKey) {
      AsyncStorage.setItem(filtersStorageKey, JSON.stringify(cleared)).catch(() => {});
    }
  }, [appliedFilters, applyFilters, filtersStorageKey, hasAdvancedFilters]);

  const syncFilterDraftFromApplied = useCallback(() => {
    const base = appliedFilters ?? {
      verifiedOnly: false,
      hasVideoOnly: false,
      activeOnly: false,
      distanceFilterKm: null,
      minAge: 18,
      maxAge: 60,
      religionFilter: null,
      minVibeScore: null,
      minSharedInterests: 0,
      locationQuery: '',
    };

    setVerifiedOnly(Boolean(base.verifiedOnly));
    setHasVideoOnly(Boolean(base.hasVideoOnly));
    setActiveOnly(Boolean(base.activeOnly));
    setDistanceFilterKm(base.distanceFilterKm ?? null);
    setMinAge(typeof base.minAge === 'number' ? base.minAge : 18);
    setMaxAge(typeof base.maxAge === 'number' ? base.maxAge : 60);
    setReligionFilter(typeof base.religionFilter === 'string' ? base.religionFilter : null);
    setMinVibeScore(typeof base.minVibeScore === 'number' ? base.minVibeScore : null);
    setMinSharedInterests(typeof base.minSharedInterests === 'number' ? base.minSharedInterests : 0);
    setLocationQuery(typeof base.locationQuery === 'string' ? base.locationQuery : '');
  }, [appliedFilters]);

  useEffect(() => {
    if (filtersVisible) {
      if (filtersPanel === 'main') {
        // Premium UX: treat the modal controls as "draft" until Apply is pressed.
        syncFilterDraftFromApplied();
        const shouldExpand = Boolean(
          appliedFilters?.verifiedOnly ||
          appliedFilters?.hasVideoOnly ||
          appliedFilters?.activeOnly ||
          appliedFilters?.minVibeScore != null ||
          (appliedFilters?.minSharedInterests || 0) > 0
        );
        setAdvancedExpanded(shouldExpand);
        advancedControlsAnim.setValue(shouldExpand ? 1 : 0);
      }
      return;
    }
    setFiltersPanel('main');
    setAdvancedExpanded(false);
    advancedControlsAnim.setValue(0);
  }, [advancedControlsAnim, appliedFilters, filtersPanel, filtersVisible, syncFilterDraftFromApplied]);

  useEffect(() => {
    Animated.timing(advancedControlsAnim, {
      toValue: advancedExpanded ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [advancedControlsAnim, advancedExpanded]);

  const resetAllFilters = useCallback(() => {
    setVerifiedOnly(false);
    setHasVideoOnly(false);
    setActiveOnly(false);
    setDistanceFilterKm(null);
    setMinAge(18);
    setMaxAge(60);
    setReligionFilter(null);
    setMinVibeScore(null);
    setMinSharedInterests(0);
    setLocationQuery('');

    applyFilters({
      verifiedOnly: false,
      hasVideoOnly: false,
      activeOnly: false,
      distanceFilterKm: null,
      minAge: 18,
      maxAge: 60,
      religionFilter: null,
      minVibeScore: null,
      minSharedInterests: 0,
      locationQuery: '',
    });

    if (filtersStorageKey) {
      AsyncStorage.removeItem(filtersStorageKey).catch(() => {});
    }
  }, [applyFilters, filtersStorageKey]);

  const formatDistanceLabel = useCallback(
    (km: number) => {
      if (resolvedDistanceUnit === 'mi') {
        const mi = km / KM_PER_MILE;
        return `${Math.round(mi)} mi`;
      }
      return `${Math.round(km)} km`;
    },
    [resolvedDistanceUnit],
  );

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (verifiedOnly) chips.push({ key: 'verified', label: 'Verified', onClear: () => setVerifiedOnly(false) });
    if (hasVideoOnly) chips.push({ key: 'video', label: 'Video', onClear: () => setHasVideoOnly(false) });
    if (activeOnly) chips.push({ key: 'active', label: 'Active', onClear: () => setActiveOnly(false) });
    if (minVibeScore != null) chips.push({ key: 'vibe', label: `Vibe ${minVibeScore}%+`, onClear: () => setMinVibeScore(null) });
    if (minSharedInterests > 0) chips.push({ key: 'shared', label: `${minSharedInterests}+ shared`, onClear: () => setMinSharedInterests(0) });
    if (distanceFilterKm != null) chips.push({ key: 'distance', label: `<= ${formatDistanceLabel(distanceFilterKm)}`, onClear: () => setDistanceFilterKm(null) });
    if (minAge !== 18 || maxAge !== 60) chips.push({ key: 'age', label: `${minAge}-${maxAge}`, onClear: () => { setMinAge(18); setMaxAge(60); } });
    if (religionFilter) chips.push({ key: 'religion', label: String(religionFilter), onClear: () => setReligionFilter(null) });
    if (locationQuery.trim()) chips.push({ key: 'loc', label: `City: ${locationQuery.trim()}`, onClear: () => setLocationQuery('') });
    return chips;
  }, [
    activeOnly,
    distanceFilterKm,
    formatDistanceLabel,
    hasVideoOnly,
    locationQuery,
    maxAge,
    minAge,
    minSharedInterests,
    minVibeScore,
    religionFilter,
    verifiedOnly,
  ]);

  const draftFiltersForPreview = useMemo<VibesFilters>(
    () => ({
      verifiedOnly,
      hasVideoOnly,
      activeOnly,
      distanceFilterKm,
      minAge,
      maxAge,
      religionFilter,
      minVibeScore,
      minSharedInterests,
      locationQuery,
    }),
    [
      activeOnly,
      distanceFilterKm,
      hasVideoOnly,
      locationQuery,
      maxAge,
      minAge,
      minSharedInterests,
      minVibeScore,
      religionFilter,
      verifiedOnly,
    ],
  );

  const showAdvancedFiltersUpsell = useCallback(() => {
    setReopenFiltersAfterUpsell(true);
    setFiltersVisible(false);
    setTimeout(() => {
      setPremiumUpsell({
        requiredPlan: 'SILVER',
        title: 'Unlock advanced filters',
        message: 'Advanced Vibes filters are included with Silver and Gold. Upgrade to shape the room by trust, activity, chemistry, and distance.',
      });
    }, 120);
  }, []);

  const showSharedInterestsHint = useCallback(() => {
    Alert.alert(
      'Add interests first',
      'Add interests to your profile before using shared-interest filters.',
    );
  }, []);

  const showDistanceNearbyHint = useCallback(() => {
    Alert.alert(
      'Use Nearby for distance',
      'Distance filters work inside the Nearby tab.',
    );
  }, []);

  const withAdvancedFilterGuard = useCallback((applyChange: () => void) => {
    if (!hasAdvancedFilters) {
      showAdvancedFiltersUpsell();
      return;
    }
    applyChange();
  }, [hasAdvancedFilters, showAdvancedFiltersUpsell]);

  const handleSharedInterestFilterPress = useCallback((count: number) => {
    withAdvancedFilterGuard(() => {
      if (viewerInterests.length === 0) {
        showSharedInterestsHint();
        return;
      }
      setMinSharedInterests(count);
    });
  }, [showSharedInterestsHint, viewerInterests.length, withAdvancedFilterGuard]);

  const handleDistanceFilterPress = useCallback((km: number | null) => {
    if (activeTab !== 'nearby') {
      showDistanceNearbyHint();
      return;
    }
    withAdvancedFilterGuard(() => setDistanceFilterKm(km));
  }, [activeTab, showDistanceNearbyHint, withAdvancedFilterGuard]);

  const previewBaseProfiles = useMemo(() => {
    if (poolProfiles.length > 0) return poolProfiles;
    return matchList;
  }, [matchList, poolProfiles]);

  const draftPreviewCount = useMemo(() => {
    if (!filtersVisible) return null;
    try {
      return applyVibesFilters(previewBaseProfiles ?? [], draftFiltersForPreview, {
        segment: vibesSegment,
        momentUserIds: momentBoostIds,
        viewerInterests,
        relationshipCompass,
        viewerProfile: profile,
      }).length;
    } catch {
      return null;
    }
  }, [draftFiltersForPreview, filtersVisible, momentBoostIds, previewBaseProfiles, profile, relationshipCompass, vibesSegment, viewerInterests]);

  const roomSummary = useMemo(() => deriveRoomSummary(draftFiltersForPreview), [draftFiltersForPreview]);
  const compatibilityHint = useMemo(() => deriveCompatibilityHint(draftFiltersForPreview), [draftFiltersForPreview]);
  const previewTone = useMemo(
    () => derivePreviewTone(draftPreviewCount, draftFiltersForPreview, previewBaseProfiles.length),
    [draftFiltersForPreview, draftPreviewCount, previewBaseProfiles.length],
  );
  const activePresetKey = useMemo(() => deriveActivePresetKey(draftFiltersForPreview), [draftFiltersForPreview]);

  const applyPreset = useCallback((presetKey: string) => {
    withAdvancedFilterGuard(() => {
      if (presetKey === 'high-vibe') {
        setVerifiedOnly(false);
        setHasVideoOnly(false);
        setActiveOnly(true);
        setMinVibeScore(70);
        setMinSharedInterests(2);
        return;
      }
      if (presetKey === 'verified') {
        setVerifiedOnly(true);
        setHasVideoOnly(false);
        setActiveOnly(false);
        setMinVibeScore(null);
        setMinSharedInterests(0);
        return;
      }
      if (presetKey === 'video') {
        setVerifiedOnly(false);
        setHasVideoOnly(true);
        setActiveOnly(false);
        setMinVibeScore(null);
        setMinSharedInterests(0);
        return;
      }
      if (presetKey === 'active') {
        setVerifiedOnly(false);
        setHasVideoOnly(false);
        setActiveOnly(true);
        setMinVibeScore(null);
        setMinSharedInterests(0);
        return;
      }
      if (presetKey === 'real-intent') {
        setVerifiedOnly(true);
        setHasVideoOnly(false);
        setActiveOnly(false);
        setMinVibeScore(60);
        setMinSharedInterests(2);
      }
    });
  }, [withAdvancedFilterGuard]);

  const appliedFilterCount = useMemo(() => {
    if (!appliedFilters) return 0;
    let n = 0;
    if (appliedFilters.verifiedOnly) n += 1;
    if (appliedFilters.hasVideoOnly) n += 1;
    if (appliedFilters.activeOnly) n += 1;
    if (appliedFilters.minVibeScore != null) n += 1;
    if ((appliedFilters.minSharedInterests || 0) > 0) n += 1;
    if (appliedFilters.distanceFilterKm != null) n += 1;
    if (appliedFilters.minAge !== 18 || appliedFilters.maxAge !== 60) n += 1;
    if (appliedFilters.religionFilter) n += 1;
    if (appliedFilters.locationQuery && appliedFilters.locationQuery.trim()) n += 1;
    return n;
  }, [appliedFilters]);

  // Reset index if data changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [matchList.length, activeTab]);

  // Prefetch optional fields for the next N cards to improve perceived speed
  useEffect(() => {
    const wantsMoreDetails =
      Boolean(appliedFilters?.hasVideoOnly) || (appliedFilters?.minSharedInterests || 0) > 0;
    const N = wantsMoreDetails ? 10 : 2;
    let mounted = true;
    (async () => {
      try {
        for (let i = 0; i <= N; i++) {
          const idx = currentIndex + i;
          const m = matchList[idx];
          if (!m) break;
          // skip if it already has the optional fields
          const hasVideo = !!((m as any).profileVideo);
          const hasInterests = Array.isArray((m as any).interests) && (m as any).interests.length > 0;
          const hasCountryCode = !!String((m as any).current_country_code || '').trim();
          const hasUsefulCity = !!String((m as any).city || '').trim();
          const id = String(m.id);
          if ((prefetchedDetailsRef.current.has(id) || prefetchInFlightRef.current.has(id))) continue;
          if (!hasVideo || !hasInterests || !hasCountryCode || !hasUsefulCity) {
            prefetchInFlightRef.current.add(id);
            try {
              // call fetchProfileDetails to merge optional fields into matches
              await fetchProfileDetails?.(m.id);
            } finally {
              prefetchInFlightRef.current.delete(id);
              prefetchedDetailsRef.current.add(id);
            }
          }
          if (!mounted) break;
        }
      } catch (_e) {
        // ignore prefetch errors
      }
    })();
    return () => { mounted = false; };
  }, [appliedFilters?.hasVideoOnly, appliedFilters?.minSharedInterests, currentIndex, fetchProfileDetails, matchList]);

  const exhausted = currentIndex >= matchList.length;

  function NoMoreProfiles() {
    const noMoreTranslate = useRef(new Animated.Value(18)).current;
    const noMoreOpacity = useRef(new Animated.Value(0)).current;
    const filtersAreTight = appliedFilterCount > 0;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(noMoreTranslate, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(noMoreOpacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, [noMoreOpacity, noMoreTranslate]);

    return (
      <Animated.View style={[{ transform: [{ translateY: noMoreTranslate }], opacity: noMoreOpacity }, styles.emptyStateContainer]}>
        {filtersAreTight ? (
          <View style={styles.emptyHintCard}>
            <View style={styles.emptyHintBadge}>
              <Text style={styles.emptyHintBadgeText}>{appliedFilterCount} active filters</Text>
            </View>
            <Text style={styles.emptyHintTitle}>Your room is tighter right now</Text>
            <Text style={styles.emptyHintSubtitle}>
              Open things up a little and you will likely see more people worth considering.
            </Text>
            <View style={styles.emptyHintActions}>
              <TouchableOpacity
                style={styles.emptyHintPrimary}
                onPress={() => {
                  resetAllFilters();
                  setCurrentIndex(0);
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.emptyHintPrimaryText}>Clear filters</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptyHintGhost}
                onPress={() => {
                  void refreshMatches();
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.emptyHintGhostText}>Refresh anyway</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No fresh profiles right now</Text>
            <Text style={styles.emptySubtitle}>
              You have reached the edge of this round. Refresh for a new set or browse nearby again.
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={[styles.primaryButton]}
                onPress={() => {
                  void refreshMatches();
                  setCurrentIndex(0);
                }}
              >
                <Text style={styles.primaryButtonText}>Refresh Vibes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => {
                  setActiveTab('nearby');
                }}
              >
                <Text style={styles.ghostButtonText}>Browse Nearby</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    );
  }

  // Buttons
  const animateButtonPress = (cb: () => void) => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start(cb);
  };

  const onLike = () => {
    try {
      stackRef.current?.performSwipe("right");
    } catch {
      const cm = matchList[currentIndex];
      if (cm) recordSwipe(cm.id, "like", currentIndex);
      if (currentIndex < matchList.length - 1)
        setCurrentIndex(currentIndex + 1);
    }
    try {
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );
    } catch {}
  };

  const onReject = () => {
    try {
      stackRef.current?.performSwipe("left");
    } catch {
      const cm = matchList[currentIndex];
      if (cm) recordSwipe(cm.id, "dislike", currentIndex);
      if (currentIndex < matchList.length - 1)
        setCurrentIndex(currentIndex + 1);
    }
    try {
      Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Medium
      );
    } catch {}
  };

  const onProfileTap = async (id: string) => {
    try {
      if (profile?.id && id && String(id) !== String(profile.id)) {
        void recordProfileSignal({
          profileId: profile.id,
          targetProfileId: id,
          openedDelta: 1,
        });
      }
      // fetch optional fields on demand and merge into matches
      const updated = await fetchProfileDetails?.(id);
      const videoUrl = (updated && (updated as any).profileVideo) ? String((updated as any).profileVideo) : undefined;
      // navigate to the full profile preview screen; include videoUrl param if we have it so ProfileView can auto-play
      const params: any = { profileId: String(id) };
      const m = matchList.find((x) => String(x.id) === String(id));
      if (m) {
        try {
          const compatPct = typeof (m as any).compatibility === 'number' ? (m as any).compatibility : 0;
          params.fallbackProfile = encodeURIComponent(JSON.stringify({
            id: m.id,
            name: (m as any).name,
            age: (m as any).age,
            location: (m as any).city || (m as any).location || (m as any).region || '',
            avatar_url: (m as any).avatar_url,
            photos: (m as any).photos,
            occupation: (m as any).occupation,
            education: (m as any).education,
            bio: (m as any).tagline || (m as any).bio,
            tribe: (m as any).tribe,
            religion: (m as any).religion,
            distance: (m as any).distance,
            interests: (m as any).interests,
            is_active: (m as any).isActiveNow,
            compatibility: compatPct,
            verified: (m as any).verified,
          }));
        } catch {}
      }
      if (videoUrl) params.videoUrl = videoUrl;
      router.push({ pathname: '/profile-view', params });
    } catch (e) {
      console.log('onProfileTap failed', e);
    }
  };

  const onSuperlike = () => {
    if (superlikesLeft <= 0) {
      try { Haptics.selectionAsync(); } catch {}
      Alert.alert('Superlikes', 'You have no superlikes left. Upgrade to get more!');
      return;
    }

    // decrement count in DB (best effort) and locally
    (async () => {
      if (profile?.id) {
        try {
          const { data, error } = await supabase.rpc('decrement_superlike', { p_profile_id: profile.id });
          if (!error && typeof data === 'number') {
            setSuperlikesLeft(Math.max(0, data));
          } else if (error && String(error.message || '').includes('NO_SUPERLIKES')) {
            setSuperlikesLeft(0);
            Alert.alert('Superlikes', 'You have no superlikes left. Upgrade to get more!');
            return;
          } else {
            setSuperlikesLeft((s) => Math.max(0, s - 1));
          }
        } catch (_e) {
          setSuperlikesLeft((s) => Math.max(0, s - 1));
        }
      } else {
        setSuperlikesLeft((s) => Math.max(0, s - 1));
      }
    })();

    // premium pulse + small confetti burst
    Animated.parallel([
      Animated.sequence([
        Animated.timing(superlikePulse, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(superlikePulse, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
      Animated.stagger(40, particles.map((p) => Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]))),
    ]).start();

    try {
      stackRef.current?.performSwipe("superlike");
    } catch {
      const cm = matchList[currentIndex];
      if (cm) recordSwipe(cm.id, "superlike", currentIndex);
      if (currentIndex < matchList.length - 1) setCurrentIndex(currentIndex + 1);
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
  };

  const renderSuperlikeBadge = () => (
    <View style={[styles.superlikeBadgeInline, superlikesLeft <= 0 && styles.superlikeBadgeInlineDisabled]}>
      <Text style={styles.superlikeBadgeInlineText}>{superlikesLeft} left</Text>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        {/* TOP HEADER */}
        <ExploreHeader
          title="Vibes"
          subtitle="Ghana Diaspora Connections"
          tabs={[
            { id: "recommended", label: "For You", icon: "heart" },
            { id: "nearby", label: "Nearby", icon: "map-marker" },
            { id: "active", label: "Active Now", icon: "circle" },
          ]}
          activeTab={activeTab}
          setActiveTab={(id) => setActiveTab(id as any)}
          currentIndex={currentIndex}
          total={matchList.length}
          smartCount={smartCount}
          onPressFilter={() => setFiltersVisible(true)}
          filterCount={appliedFilterCount}
          rightAccessory={(
            <TouchableOpacity
              style={styles.headerRefreshButton}
              onPress={() => setIntroVisible(true)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="star-four-points" size={16} color={theme.tint} />
            </TouchableOpacity>
          )}
        />

        <VibesIntroModal visible={introVisible} onClose={closeIntro} />

        <Animated.ScrollView
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl
              refreshing={refreshingMatches}
              onRefresh={handleRefreshVibes}
              tintColor={theme.tint}
            />
          )}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 180, 180) },
          ]}
        >
          {shouldShowLocationPrompt ? (
            <View style={[styles.locationBanner, showCompactLocationPrompt ? styles.locationBannerCompact : null]}>
              <View style={styles.locationBannerHeader}>
                <View style={styles.locationBannerCopy}>
                  <Text style={styles.locationTitle}>
                    {activeTab === 'nearby' ? 'Add your location to unlock Nearby' : 'Add your city to improve nearby matches'}
                  </Text>
                  <Text style={[styles.locationSubtitle, showCompactLocationPrompt ? styles.locationSubtitleCompact : null]}>
                    {activeTab === 'nearby'
                      ? 'Use your location or set a city so nearby discovery can work properly.'
                      : 'For You still works without it. Nearby becomes more useful once you add a location.'}
                  </Text>
                </View>
                {showCompactLocationPrompt ? (
                  <TouchableOpacity style={styles.locationDismissButton} onPress={dismissLocationPrompt} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={[styles.locationActions, showCompactLocationPrompt ? styles.locationActionsCompact : null]}>
                <TouchableOpacity
                  style={[styles.locationButton, styles.locationPrimary]}
                  onPress={handleUseMyLocation}
                  disabled={isSavingLocation}
                >
                  <Text style={styles.locationPrimaryText}>
                    {isSavingLocation ? 'Saving...' : 'Use my location'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.locationButton, styles.locationGhost]}
                  onPress={openManualLocationModal}
                  disabled={isSavingLocation}
                >
                  <Text style={styles.locationGhostText}>
                    {hasCityOnly ? 'Edit city' : 'Enter city'}
                  </Text>
                </TouchableOpacity>
                {showCompactLocationPrompt ? (
                  <TouchableOpacity
                    style={[styles.locationButton, styles.locationGhost, styles.locationNotNowButton]}
                    onPress={dismissLocationPrompt}
                    disabled={isSavingLocation}
                  >
                    <Text style={styles.locationGhostText}>Not now</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {locationError ? (
                <Text style={[styles.locationError, { marginTop: 8 }]}>{locationError}</Text>
              ) : null}
            </View>
          ) : null}
          {user?.id && (showMomentsEmptyState || momentsCollapsed) ? (
            <VibesMomentsStrip
              users={momentStripUsers}
              hasMyActiveMoment={hasMyActiveMoment}
              showEmptyState={showMomentsEmptyState}
              relationshipContextByProfileId={momentRelationshipContextByProfileId}
              onPressMyMoment={handlePressMyMoment}
              onPressUserMoment={handlePressUserMoment}
              onPressSeeAll={handleMomentsPress}
              onPressPostMoment={handlePressMyMoment}
              variant="inline"
              collapsed={momentsCollapsed}
              onCollapsedChange={setMomentsCollapsed}
            />
          ) : user?.id ? (
            <VibesMomentsStrip
              users={momentStripUsers}
              hasMyActiveMoment={hasMyActiveMoment}
              showEmptyState={showMomentsEmptyState}
              relationshipContextByProfileId={momentRelationshipContextByProfileId}
              onPressMyMoment={handlePressMyMoment}
              onPressUserMoment={handlePressUserMoment}
              onPressSeeAll={handleMomentsPress}
              onPressPostMoment={handlePressMyMoment}
              variant="inline"
              collapsed={false}
              onCollapsedChange={setMomentsCollapsed}
              expandedAsHeaderOnly
            />
          ) : null}
          {offlineNotice ? (
            <View>
              <Notice
                title="Couldn't load profiles"
                message={offlineNotice}
                actionLabel="Retry"
                onAction={() => {
                  setOfflineNotice(null);
                  handleRefreshVibes();
                }}
                icon="cloud-alert"
              />
              {canAccessInternalTools() ? (
                <TouchableOpacity
                  style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 4, paddingVertical: 4 }}
                  onPress={() => router.push('/diagnostics')}
                >
                  <Text style={{ color: '#0b6b69', fontWeight: '700' }}>Open Diagnostics</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* CARD STACK */}
          <View style={styles.stackWrapper}>
            {loadingMatches ? (
              <ExploreStackSkeleton />
            ) : offlineNotice && matchList.length === 0 ? (
              // If we failed to load, don't show the "no more profiles" empty state.
              // The blocking Notice above already provides Retry.
              <View />
            ) : !exhausted ? (
              <ExploreStack
                ref={stackRef}
                matches={matchList}
                currentIndex={currentIndex}
                setCurrentIndex={setCurrentIndex}
                recordSwipe={recordSwipe}
                onProfileTap={onProfileTap}
                onPlayPress={async (id: string) => {
                  try {
                    if (previewingId) return;
                    setPreviewingId(String(id));
                    if (profile?.id && id && String(id) !== String(profile.id)) {
                      void recordProfileSignal({
                        profileId: profile.id,
                        targetProfileId: id,
                        introVideoStarted: true,
                      });
                    }
                    const updated = await fetchProfileDetails?.(id);
                    const videoUrl = (updated && (updated as any).profileVideo) ? String((updated as any).profileVideo) : undefined;
                    if (videoUrl) {
                      setVideoModalUrl(videoUrl);
                      setVideoModalVisible(true);
                    }
                  } catch (e) {
                    console.log('video preview failed', e);
                  }
                }}
                previewingId={previewingId ?? undefined}
              />
            ) : (
              <NoMoreProfiles />
            )}
            {shouldShowFloatingMoments || renderFloatingMoments ? (
              <Animated.View
                pointerEvents="box-none"
                style={[
                  styles.momentsFloatingOverlay,
                  {
                    opacity: floatingMomentsOpacity,
                    transform: [
                      { translateY: floatingMomentsTranslateY },
                      { scale: floatingMomentsScale },
                    ],
                  },
                ]}
              >
                <VibesMomentsStrip
                  users={momentStripUsers}
                  hasMyActiveMoment={hasMyActiveMoment}
                  showEmptyState={showMomentsEmptyState}
                  relationshipContextByProfileId={momentRelationshipContextByProfileId}
                  onPressMyMoment={handlePressMyMoment}
                  onPressUserMoment={handlePressUserMoment}
                  onPressSeeAll={handleMomentsPress}
                  onPressPostMoment={handlePressMyMoment}
                  variant="floating"
                  collapsed={false}
                  onCollapsedChange={setMomentsCollapsed}
                  bodyOnly
                />
              </Animated.View>
            ) : null}
          </View>
        </Animated.ScrollView>

        <View style={styles.actionButtons} pointerEvents="box-none">
          <Animated.View
            style={[
              {
                transform: [
                  { translateY: fallbackEntranceTranslate },
                  { scale: buttonScale },
                ],
                opacity: fallbackEntranceOpacity,
              },
            ]}
          >
            <BlurViewSafe
              intensity={24}
              tint={isDark ? 'dark' : 'light'}
              style={styles.actionFloatingCard}
            >
              <View style={styles.actionSecondaryCluster}>
                <LinearGradientSafe
                  colors={[theme.backgroundSubtle, theme.background]}
                  style={styles.rejectRing}
                >
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => animateButtonPress(onReject)}
                    activeOpacity={0.85}
                  >
                    <CircleOff size={21} color={theme.textMuted} style={{ marginTop: 1 }} />
                  </TouchableOpacity>
                </LinearGradientSafe>

                <TouchableOpacity
                  style={styles.infoButton}
                  onPress={() => {
                    try {
                      stackRef.current?.rewind();
                    } catch {}
                    const prev = undoLastSwipe?.();
                    if (prev) setCurrentIndex(Math.max(0, prev.index));
                    try { Haptics.selectionAsync(); } catch {}
                  }}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="undo-variant" size={18} color={theme.tint} />
                </TouchableOpacity>
              </View>

              <View style={styles.actionPrimaryCluster}>
                <LinearGradientSafe
                  colors={[theme.tint, theme.accent]}
                  style={styles.requestRing}
                >
                  <TouchableOpacity
                    style={styles.requestButton}
                    onPress={openIntentSheet}
                    activeOpacity={0.85}
                  >
                    <Target size={24} color={theme.text} strokeWidth={2.6} />
                  </TouchableOpacity>
                </LinearGradientSafe>

                <View style={styles.superlikeWrap}>
                  {renderSuperlikeBadge()}
                  <LinearGradientSafe
                    colors={[theme.accent, theme.backgroundSubtle]}
                    style={[styles.superlikeButton, !isLinearGradientAvailable() && styles.superlikeFallback]}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => animateButtonPress(onSuperlike)}
                      activeOpacity={0.85}
                    >
                      <Gem size={20} color="#fff" style={{ marginTop: 1 }} />
                    </TouchableOpacity>
                  </LinearGradientSafe>
                </View>

                <LinearGradientSafe
                  colors={[theme.secondary, theme.tint]}
                  style={styles.likeRing}
                >
                  <TouchableOpacity
                    style={styles.likeButton}
                    onPress={() => animateButtonPress(onLike)}
                    activeOpacity={0.85}
                  >
                    <Sparkles size={23} color="#fff" style={{ marginTop: 1 }} />
                  </TouchableOpacity>
                </LinearGradientSafe>
              </View>
            </BlurViewSafe>
          </Animated.View>
        </View>

        <Modal
          visible={filtersVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (filtersPanel === 'location') {
              setFiltersPanel('main');
              return;
            }
            syncFilterDraftFromApplied();
            setFiltersVisible(false);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={[styles.modalBackdrop, { paddingTop: Math.max(insets.top + 12, 16) }]}>
              <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 16, 20), marginTop: 8 }]}>
                <View style={styles.modalTitleRow}>
                  <View style={styles.modalTitleCopy}>
                    <Text style={styles.modalEyebrow}>BETWEENER VIBES</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalResetButton}
                    onPress={filtersPanel === 'location' ? () => setFiltersPanel('main') : resetAllFilters}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalResetText}>{filtersPanel === 'location' ? 'Back' : 'Reset'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>
                  {filtersPanel === 'location'
                    ? 'Keep your city private, or use precise location when you want distance to do the work.'
                    : 'Set a mood, tighten the pool, and preview the shift before you apply it.'}
                </Text>
                <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
                  {filtersPanel === 'location' ? (
                    <>
                      <View style={styles.filterSectionCard}>
                        <View style={styles.filterSectionHeader}>
                          <Text style={styles.filterSectionEyebrow}>Location</Text>
                          <Text style={styles.filterSectionTitle}>Set your city</Text>
                          <Text style={styles.filterSectionBody}>
                            City-only keeps your location private. You can switch back to precise location any time.
                          </Text>
                        </View>

                        <View style={styles.filterFieldGroup}>
                          <Text style={styles.modalLabel}>Country</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryChips}>
                            {COUNTRY_OPTIONS.map((c) => {
                              const active = manualCountryCode === c.code;
                              return (
                                <TouchableOpacity
                                  key={c.code}
                                  style={[styles.countryChip, active && styles.countryChipActive]}
                                  onPress={() => setManualCountryCode(c.code)}
                                  activeOpacity={0.85}
                                >
                                  <Text style={[styles.countryChipText, active && styles.countryChipTextActive]}>{c.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>

                        <View style={styles.filterFieldGroup}>
                          <Text style={styles.modalLabel}>City</Text>
                          <TextInput
                            style={styles.modalInput}
                            placeholder="e.g., Bristol"
                            placeholderTextColor={theme.textMuted}
                            value={manualLocation}
                            onChangeText={setManualLocation}
                            autoCapitalize="words"
                          />
                          {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}
                        </View>
                      </View>

                      <View style={styles.modalActions}>
                        <TouchableOpacity
                          style={[styles.locationButton, styles.locationGhost, { flex: 1 }]}
                          onPress={() => setFiltersPanel('main')}
                        >
                          <Text style={styles.locationGhostText}>Back to filters</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.locationButton, styles.locationPrimary, { flex: 1 }]}
                          onPress={handleSaveManualLocation}
                          disabled={isSavingLocation}
                        >
                          <Text style={styles.locationPrimaryText}>{isSavingLocation ? 'Saving...' : 'Save city'}</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                  <LinearGradientSafe
                    colors={
                      isDark
                        ? ['rgba(20,33,46,0.98)', 'rgba(14,23,34,0.98)', 'rgba(10,16,26,0.98)']
                        : ['#fbf4ec', '#f5eadf', '#efe2d6']
                    }
                    start={[0, 0]}
                    end={[1, 1]}
                    style={styles.filterHeroCard}
                  >
                    <View style={styles.filterHeroGlowPrimary} />
                    <View style={styles.filterHeroGlowSecondary} />
                    <View style={styles.filterHeroBadge}>
                      <Gem size={14} color={theme.tint} />
                      <Text style={styles.filterHeroBadgeText}>Free + Silver+ filters</Text>
                    </View>
                    <Text style={styles.filterHeroTitle}>Shape the room before you swipe.</Text>
                    <Text style={styles.filterHeroBody}>
                      Tune chemistry, trust, and momentum so the next people feel closer to your pace.
                    </Text>
                    <View style={styles.filterLegendStack}>
                      <View style={[styles.filterLegendRow, styles.filterLegendRowPremium]}>
                        <View style={[styles.filterTierPill, styles.filterTierPillPremium]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextPremium]}>Silver+</Text>
                        </View>
                        <Text style={styles.filterLegendText}>Verified, video, active, vibe, shared-interest, and distance filters</Text>
                      </View>
                      <View style={[styles.filterLegendRow, styles.filterLegendRowFree]}>
                        <View style={[styles.filterTierPill, styles.filterTierPillFree]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextFree]}>Free</Text>
                        </View>
                        <Text style={styles.filterLegendText}>Age range, religion, and city filters</Text>
                      </View>
                    </View>
                  </LinearGradientSafe>

                  <View style={styles.activeFiltersCard}>
                    <View style={styles.filterSectionHeader}>
                      <Text style={styles.filterSectionEyebrow}>Current mood</Text>
                      <Text style={styles.filterSectionTitle}>Active filters</Text>
                    </View>
                    <Text style={styles.activeFiltersSummaryTitle}>{roomSummary.title}</Text>
                    <Text style={styles.activeFiltersSummaryBody}>{roomSummary.body}</Text>
                    {activeFilterChips.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersRow}>
                        {activeFilterChips.map((chip) => (
                          <TouchableOpacity
                            key={chip.key}
                            style={styles.activeFilterChip}
                            onPress={chip.onClear}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.activeFilterChipText}>{chip.label}</Text>
                            <MaterialCommunityIcons name="close" size={14} color={theme.textMuted} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.activeFiltersEmpty}>Keep it open, or shape the room below.</Text>
                    )}
                  </View>

                  <View style={[styles.filterSectionCard, styles.filterSectionCardPremium]}>
                    <View style={styles.filterSectionHeader}>
                      <Text style={styles.filterSectionEyebrow}>Premium presets</Text>
                      <View style={styles.filterSectionTitleRow}>
                        <Text style={styles.filterSectionTitle}>One tap moods</Text>
                        <View style={[styles.filterTierPill, styles.filterTierPillPremium]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextPremium]}>Silver+</Text>
                        </View>
                      </View>
                      <Text style={styles.filterSectionBody}>Fast ways to bias the room toward trust, energy, or richer chemistry.</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.filterPresetRail}
                    >
                      <TouchableOpacity
                        style={[styles.filterChip, styles.filterPresetChip, styles.filterPresetChipRich, activePresetKey === 'high-vibe' && styles.filterChipActive]}
                        onPress={() => applyPreset('high-vibe')}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="star-four-points-outline" size={15} color={activePresetKey === 'high-vibe' ? '#fff' : theme.tint} />
                        <Text style={[styles.filterChipText, activePresetKey === 'high-vibe' && styles.filterChipTextActive]}>High Vibe</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.filterChip, styles.filterPresetChip, styles.filterPresetChipRich, activePresetKey === 'verified' && styles.filterChipActive]}
                        onPress={() => applyPreset('verified')}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="shield-check-outline" size={15} color={activePresetKey === 'verified' ? '#fff' : theme.tint} />
                        <Text style={[styles.filterChipText, activePresetKey === 'verified' && styles.filterChipTextActive]}>Verified</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.filterChip, styles.filterPresetChip, styles.filterPresetChipRich, activePresetKey === 'video' && styles.filterChipActive]}
                        onPress={() => applyPreset('video')}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="video-outline" size={15} color={activePresetKey === 'video' ? '#fff' : theme.tint} />
                        <Text style={[styles.filterChipText, activePresetKey === 'video' && styles.filterChipTextActive]}>Video</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.filterChip, styles.filterPresetChip, styles.filterPresetChipRich, activePresetKey === 'active' && styles.filterChipActive]}
                        onPress={() => applyPreset('active')}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="lightning-bolt-outline" size={15} color={activePresetKey === 'active' ? '#fff' : theme.tint} />
                        <Text style={[styles.filterChipText, activePresetKey === 'active' && styles.filterChipTextActive]}>Active</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.filterChip, styles.filterPresetChip, styles.filterPresetChipRich, activePresetKey === 'real-intent' && styles.filterChipActive]}
                        onPress={() => applyPreset('real-intent')}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="handshake-outline" size={15} color={activePresetKey === 'real-intent' ? '#fff' : theme.tint} />
                        <Text style={[styles.filterChipText, activePresetKey === 'real-intent' && styles.filterChipTextActive]}>Real Intent</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>

                  <TouchableOpacity
                    style={styles.expandAdvancedButton}
                    onPress={() => setAdvancedExpanded((value) => !value)}
                    activeOpacity={0.88}
                  >
                    <View>
                      <Text style={styles.expandAdvancedEyebrow}>More control</Text>
                      <Text style={styles.expandAdvancedTitle}>{advancedExpanded ? 'Keep it lighter' : 'Refine more'}</Text>
                    </View>
                    <View style={styles.expandAdvancedMeta}>
                      <Text style={styles.expandAdvancedMetaText}>{advancedExpanded ? 'Less' : 'More controls'}</Text>
                      <MaterialCommunityIcons name={advancedExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.tint} />
                    </View>
                  </TouchableOpacity>

                  <Animated.View
                    style={[
                      styles.advancedSectionWrap,
                      {
                        opacity: advancedControlsAnim,
                        maxHeight: advancedControlsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 820] }),
                        transform: [
                          {
                            translateY: advancedControlsAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
                          },
                        ],
                      },
                    ]}
                  >
                  <View style={[styles.filterSectionCard, styles.filterSectionCardPremium]}>
                    <View style={styles.filterSectionHeader}>
                      <Text style={styles.filterSectionEyebrow}>Trust signals</Text>
                      <View style={styles.filterSectionTitleRow}>
                        <Text style={styles.filterSectionTitle}>Who should rise first?</Text>
                        <View style={[styles.filterTierPill, styles.filterTierPillPremium]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextPremium]}>Silver+</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.filterToggleStack}>
                    <TouchableOpacity
                      style={[styles.filterToggle, verifiedOnly && styles.filterToggleActive]}
                      onPress={() => withAdvancedFilterGuard(() => setVerifiedOnly((v) => !v))}
                      activeOpacity={0.85}
                    >
                      <View style={styles.filterToggleCopy}>
                        <Text style={styles.filterLabel}>Show only verified</Text>
                        <Text style={styles.filterHint}>Keep the room tighter around trusted profiles.</Text>
                      </View>
                      <View style={styles.filterToggleMeta}>
                        <Text style={[styles.filterToggleText, verifiedOnly && styles.filterToggleTextActive]}>{verifiedOnly ? 'On' : 'Off'}</Text>
                        <View style={[styles.filterToggleKnob, verifiedOnly && styles.filterToggleKnobActive]} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.filterToggle, hasVideoOnly && styles.filterToggleActive]}
                      onPress={() => withAdvancedFilterGuard(() => setHasVideoOnly((v) => !v))}
                      activeOpacity={0.85}
                    >
                      <View style={styles.filterToggleCopy}>
                        <Text style={styles.filterLabel}>Intro video</Text>
                        <Text style={styles.filterHint}>Surface people who have shown a little more presence.</Text>
                      </View>
                      <View style={styles.filterToggleMeta}>
                        <Text style={[styles.filterToggleText, hasVideoOnly && styles.filterToggleTextActive]}>{hasVideoOnly ? 'On' : 'Off'}</Text>
                        <View style={[styles.filterToggleKnob, hasVideoOnly && styles.filterToggleKnobActive]} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.filterToggle, activeOnly && styles.filterToggleActive]}
                      onPress={() => withAdvancedFilterGuard(() => setActiveOnly((v) => !v))}
                      activeOpacity={0.85}
                    >
                      <View style={styles.filterToggleCopy}>
                        <Text style={styles.filterLabel}>Active recently</Text>
                        <Text style={styles.filterHint}>Prioritize people who are online or recently active.</Text>
                      </View>
                      <View style={styles.filterToggleMeta}>
                        <Text style={[styles.filterToggleText, activeOnly && styles.filterToggleTextActive]}>{activeOnly ? 'On' : 'Off'}</Text>
                        <View style={[styles.filterToggleKnob, activeOnly && styles.filterToggleKnobActive]} />
                      </View>
                    </TouchableOpacity>
                    </View>
                  </View>

                  <View style={[styles.filterSectionCard, styles.filterSectionCardPremium]}>
                    <View style={styles.filterSectionHeader}>
                      <Text style={styles.filterSectionEyebrow}>Compatibility</Text>
                      <View style={styles.filterSectionTitleRow}>
                        <Text style={styles.filterSectionTitle}>Raise the bar</Text>
                        <View style={[styles.filterTierPill, styles.filterTierPillPremium]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextPremium]}>Silver+</Text>
                        </View>
                      </View>
                      <Text style={styles.filterSectionBody}>{compatibilityHint}</Text>
                    </View>
                    <View style={styles.filterFieldGroup}>
                    <Text style={styles.filterLabel}>Vibe level</Text>
                    <Text style={styles.filterHint}>Minimum compatibility score.</Text>
                    <View style={styles.filterChipsRowWrap}>
                      {[50, 60, 70, 80].map((score) => (
                        <TouchableOpacity
                          key={`vibe-${score}`}
                          style={[styles.filterChip, minVibeScore === score && styles.filterChipActive]}
                          onPress={() => withAdvancedFilterGuard(() => setMinVibeScore(score))}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.filterChipText, minVibeScore === score && styles.filterChipTextActive]}>{`${score}%+`}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.filterChip, minVibeScore == null && styles.filterChipActive]}
                        onPress={() => withAdvancedFilterGuard(() => setMinVibeScore(null))}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, minVibeScore == null && styles.filterChipTextActive]}>Any</Text>
                      </TouchableOpacity>
                    </View>
                    </View>
                    <View style={styles.filterFieldGroup}>
                    <Text style={styles.filterLabel}>Shared interests</Text>
                    <Text style={styles.filterHint}>
                      {viewerInterests.length > 0 ? 'Match on common interests.' : 'Add interests in your profile to use this.'}
                    </Text>
                    <View style={styles.filterChipsRowWrap}>
                      {[1, 2, 3].map((n) => (
                        <TouchableOpacity
                          key={`shared-${n}`}
                          style={[styles.filterChip, minSharedInterests === n && styles.filterChipActive]}
                          onPress={() => handleSharedInterestFilterPress(n)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.filterChipText, minSharedInterests === n && styles.filterChipTextActive]}>{`${n}+`}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.filterChip, minSharedInterests === 0 && styles.filterChipActive]}
                        onPress={() => withAdvancedFilterGuard(() => setMinSharedInterests(0))}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, minSharedInterests === 0 && styles.filterChipTextActive]}>Any</Text>
                      </TouchableOpacity>
                    </View>
                    </View>
                  </View>
                  </Animated.View>

                  <View style={[styles.filterSectionCard, styles.filterSectionCardMixed]}>
                    <View style={styles.filterSectionHeader}>
                      <Text style={styles.filterSectionEyebrow}>Reach</Text>
                      <View style={styles.filterSectionTitleRow}>
                        <Text style={styles.filterSectionTitle}>Distance and age</Text>
                        <View style={[styles.filterTierPill, styles.filterTierPillMixed]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextMixed]}>Mixed</Text>
                        </View>
                      </View>
                      <Text style={styles.filterSectionBody}>Distance is Silver+. Age range stays free.</Text>
                    </View>
                    <View style={styles.filterFieldGroup}>
                    <Text style={styles.filterLabel}>Distance</Text>
                    <Text style={styles.filterHint}>{activeTab === 'nearby' ? 'Nearby tab only' : 'Switch to Nearby to use distance'}</Text>
                    <View style={styles.filterChipsRowWrap}>
                      {distanceChipOptions.map((option) => (
                        <TouchableOpacity
                          key={option.label}
                          style={[
                            styles.filterChip,
                            distanceFilterKm === option.km && styles.filterChipActive,
                            activeTab !== 'nearby' && styles.filterChipDisabled,
                          ]}
                          onPress={() => handleDistanceFilterPress(option.km)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.filterChipText, distanceFilterKm === option.km && styles.filterChipTextActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[
                          styles.filterChip,
                          distanceFilterKm == null && styles.filterChipActive,
                          activeTab !== 'nearby' && styles.filterChipDisabled,
                        ]}
                        onPress={() => handleDistanceFilterPress(null)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, distanceFilterKm == null && styles.filterChipTextActive]}>Any</Text>
                      </TouchableOpacity>
                    </View>
                    </View>
                    <View style={styles.filterFieldGroup}>
                    <Text style={styles.filterLabel}>Age range</Text>
                    <View style={styles.ageTopRow}>
                      <View style={styles.ageRangePill}>
                        <Text style={styles.ageRangeText}>{minAge} - {maxAge}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.filterChip, styles.ageAnyChip]}
                        onPress={() => {
                          setMinAge(18);
                          setMaxAge(60);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.filterChipText}>Any</Text>
                      </TouchableOpacity>
                    </View>

                    <PremiumRangeSlider
                      min={18}
                      max={99}
                      step={1}
                      valueMin={minAge}
                      valueMax={maxAge}
                      onChange={(nextMin, nextMax) => {
                        setMinAge(nextMin);
                        setMaxAge(nextMax);
                      }}
                      theme={theme}
                      isDark={isDark}
                    />
                    <View style={styles.filterChipsRowWrap}>
                      {[
                        { label: '18-25', min: 18, max: 25 },
                        { label: '26-35', min: 26, max: 35 },
                        { label: '36-45', min: 36, max: 45 },
                        { label: '46+', min: 46, max: 99 },
                      ].map((p) => {
                        const active = minAge === p.min && maxAge === p.max;
                        return (
                          <TouchableOpacity
                            key={p.label}
                            style={[styles.filterChip, active && styles.filterChipActive]}
                            onPress={() => {
                              setMinAge(p.min);
                              setMaxAge(p.max);
                            }}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{p.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    </View>
                  </View>

                  <View style={[styles.filterSectionCard, styles.filterSectionCardFree]}>
                    <View style={styles.filterSectionHeader}>
                      <Text style={styles.filterSectionEyebrow}>Preferences</Text>
                      <View style={styles.filterSectionTitleRow}>
                        <Text style={styles.filterSectionTitle}>Religion</Text>
                        <View style={[styles.filterTierPill, styles.filterTierPillFree]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextFree]}>Free</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.filterChipsRowWrap}>
                      {distinctReligions.length === 0 ? <Text style={styles.filterHint}>No data yet</Text> : null}
                      {distinctReligions.map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={[styles.filterChip, religionFilter === r && styles.filterChipActive]}
                          onPress={() => setReligionFilter((curr) => (curr === r ? null : r))}
                        >
                          <Text style={[styles.filterChipText, religionFilter === r && styles.filterChipTextActive]}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                      {distinctReligions.length > 0 && (
                        <TouchableOpacity
                          style={[styles.filterChip, !religionFilter && styles.filterChipActive]}
                          onPress={() => setReligionFilter(null)}
                        >
                          <Text style={[styles.filterChipText, !religionFilter && styles.filterChipTextActive]}>Any</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <View style={[styles.filterSectionCard, styles.filterSectionCardFree]}>
                    <View style={styles.filterSectionHeader}>
                    <Text style={styles.filterSectionEyebrow}>Location</Text>
                    <View style={styles.filterSectionTitleRow}>
                      <Text style={styles.filterSectionTitle}>Where should we look?</Text>
                      <View style={[styles.filterTierPill, styles.filterTierPillFree]}>
                        <Text style={[styles.filterTierPillText, styles.filterTierPillTextFree]}>Free</Text>
                      </View>
                    </View>
                    <Text style={styles.filterSectionBody}>
                      {hasPreciseCoords
                        ? 'Using precise location for distance.'
                        : hasCityOnly
                        ? 'City-only location is set.'
                        : 'Location not set yet.'}
                    </Text>
                    </View>
                    <View style={[styles.locationActions, { marginTop: 10 }]}
                    >
                      <TouchableOpacity
                        style={[styles.locationButton, styles.locationPrimary]}
                        onPress={handleUseMyLocation}
                        disabled={isSavingLocation}
                      >
                        <Text style={styles.locationPrimaryText}>
                          {isSavingLocation ? 'Saving...' : 'Use my location'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.locationButton, styles.locationGhost]}
                        onPress={openManualLocationModalFromFilters}
                        disabled={isSavingLocation}
                      >
                        <Text style={styles.locationGhostText}>
                          {hasCityOnly ? 'Edit city' : 'Enter city'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {locationError ? (
                      <Text style={[styles.locationError, { marginTop: 8 }]}>{locationError}</Text>
                    ) : null}
                    <View style={styles.filterFieldGroup}>
                    <Text style={styles.filterLabel}>Type a city</Text>
                    <Text style={styles.filterHint}>e.g., Accra, Ghana</Text>
                    <TextInput
                      style={[styles.filterInput, { marginTop: 8 }]}
                      placeholder="e.g., Accra, Ghana"
                      value={locationQuery}
                      onChangeText={setLocationQuery}
                    />
                    </View>
                  </View>

                  <View style={styles.modalPreviewRow}>
                    <Text style={styles.modalPreviewEyebrow}>{previewTone.eyebrow}</Text>
                    <Text style={styles.modalPreviewTitle}>{previewTone.title}</Text>
                    <Text style={styles.modalPreviewBody}>
                      {previewTone.body}
                      {previewBaseProfiles.length ? ` From ${previewBaseProfiles.length} loaded right now.` : ''}
                    </Text>
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.locationButton, styles.locationGhost, styles.modalFooterSecondary]}
                      onPress={() => {
                        syncFilterDraftFromApplied();
                        setFiltersVisible(false);
                      }}
                    >
                      <Text style={styles.locationGhostText}>Close</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.locationButton, styles.locationPrimary, styles.modalApplyButton, styles.modalFooterPrimary]} onPress={handleApplyFilters}>
                      <Text style={styles.locationPrimaryText}>{previewTone.cta}</Text>
                    </TouchableOpacity>
                  </View>
                    </>
                  )}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <PremiumUpsellModal
          visible={Boolean(premiumUpsell)}
          requiredPlan={premiumUpsell?.requiredPlan ?? 'SILVER'}
          title={premiumUpsell?.title ?? 'Unlock premium'}
          message={premiumUpsell?.message ?? ''}
          onClose={() => {
            setPremiumUpsell(null);
            if (reopenFiltersAfterUpsell) {
              setReopenFiltersAfterUpsell(false);
              setFiltersVisible(true);
            }
          }}
          onViewPlan={() => {
            setPremiumUpsell(null);
            setReopenFiltersAfterUpsell(false);
            router.push('/premium-plans');
          }}
        />

        {/* Manual city entry should not kick users out of Filters (premium UX). */}
        <Modal
          visible={manualLocationModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeManualLocationModal}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.modalTitleRow}>
                  <Text style={styles.modalTitle}>Set your city</Text>
                  <TouchableOpacity
                    style={styles.modalResetButton}
                    onPress={closeManualLocationModal}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalResetText}>Close</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>City-only keeps your location private (no GPS required).</Text>

                <Text style={styles.modalLabel}>Country</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryChips}>
                  {COUNTRY_OPTIONS.map((c) => {
                    const active = manualCountryCode === c.code;
                    return (
                      <TouchableOpacity
                        key={c.code}
                        style={[styles.countryChip, active && styles.countryChipActive]}
                        onPress={() => setManualCountryCode(c.code)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.countryChipText, active && styles.countryChipTextActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={styles.modalLabel}>City</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Accra"
                  placeholderTextColor={theme.textMuted}
                  value={manualLocation}
                  onChangeText={setManualLocation}
                  autoCapitalize="words"
                  autoCorrect={false}
                />

                {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.locationButton, styles.locationGhost, { flex: 1 }]}
                    onPress={closeManualLocationModal}
                    activeOpacity={0.85}
                    disabled={isSavingLocation}
                  >
                    <Text style={styles.locationGhostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.locationButton, styles.locationPrimary, { flex: 1 }]}
                    onPress={handleSaveManualLocation}
                    activeOpacity={0.85}
                    disabled={isSavingLocation}
                  >
                    <Text style={styles.locationPrimaryText}>{isSavingLocation ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
          <VibesAllMomentsModal
            visible={allMomentsVisible}
            onClose={() => setAllMomentsVisible(false)}
            users={momentUsersWithContent}
            currentUserId={user?.id}
            onPressUser={(userId) => {
              setAllMomentsVisible(false);
              openMomentViewer(userId);
            }}
          />

          <MomentViewer
            visible={momentViewerVisible}
            users={momentUsersWithContent}
            startUserId={momentStartUserId}
            relationshipContextByProfileId={momentRelationshipContextByProfileId}
            onPressIntent={handleMomentIntent}
            onClose={() => {
              setMomentViewerVisible(false);
              setMomentStartUserId(null);
            }}
          />
          <MomentCreateModal
            visible={momentCreateVisible}
            onClose={() => setMomentCreateVisible(false)}
            onCreated={() => {
              setMomentCreateVisible(false);
              void refreshMoments();
            }}
          />
          <IntentRequestSheet
            visible={intentSheetVisible}
            onClose={() => setIntentSheetVisible(false)}
            recipientId={intentTarget?.id}
            recipientName={intentTarget?.name ?? null}
            metadata={{ source: 'vibes' }}
            onSent={() => {
              // Sending an intent should advance the deck just like a swipe.
              setCurrentIndex((i) => i + 1);
            }}
          />
          {/* Match celebration modal */}
        <MatchModal
          visible={!!celebrationMatch}
          match={celebrationMatch}
          onClose={() => setCelebrationMatch(null)}
          onKeepDiscovering={() => setCelebrationMatch(null)}
          onSendMessage={(m) => {
            // Navigate into the chat flow and open a conversation for the matched user
            try {
              // use expo-router's router to open the chat conversation screen
              // use matched id as conversation id for QA/testing
               
              if (m?.id) {
                router.push({ pathname: '/chat/[id]', params: { id: String(m.id), userName: m.name, userAvatar: m.avatar_url, isOnline: String(!!m.isActiveNow) } });
              } else {
                router.push('/(tabs)/chat');
              }
            } catch (e) {
              console.log('Navigation to chat failed', e);
            }
            setCelebrationMatch(null);
          }}
        />
        <ProfileVideoModal
          visible={videoModalVisible}
          videoUrl={videoModalUrl ?? undefined}
          onClose={() => {
            setVideoModalVisible(false);
            setVideoModalUrl(null);
            setPreviewingId(null);
          }}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function PremiumRangeSlider({
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChange,
  theme,
  isDark,
}: {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChange: (nextMin: number, nextMax: number) => void;
  theme: typeof Colors.light;
  isDark: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const boundsRef = useRef({ min, max });
  const stepRef = useRef(step);
  const valuesRef = useRef({ valueMin, valueMax });
  const startRef = useRef({ valueMin, valueMax });
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    trackWidthRef.current = trackWidth;
  }, [trackWidth]);

  useEffect(() => {
    boundsRef.current = { min, max };
  }, [min, max]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    valuesRef.current = { valueMin, valueMax };
  }, [valueMin, valueMax]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const snap = (v: number) => {
    const { min: bMin, max: bMax } = boundsRef.current;
    const s = Math.max(1, Math.floor(stepRef.current || 1));
    const steps = Math.round((v - bMin) / s);
    return clamp(bMin + steps * s, bMin, bMax);
  };

  const snapClamp = (v: number, lo: number, hi: number) => clamp(snap(v), lo, hi);

  const minPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { ...valuesRef.current };
      },
      onPanResponderMove: (_evt, gesture) => {
        const w = trackWidthRef.current;
        const { min: bMin, max: bMax } = boundsRef.current;
        if (!w || bMax <= bMin) return;
        const pxPerValue = w / (bMax - bMin);
        const delta = gesture.dx / pxPerValue;
        const nextMin = startRef.current.valueMin + delta;
        const maxAllowed = valuesRef.current.valueMax;
        onChangeRef.current(snapClamp(nextMin, bMin, maxAllowed), maxAllowed);
      },
    }),
  ).current;

  const maxPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { ...valuesRef.current };
      },
      onPanResponderMove: (_evt, gesture) => {
        const w = trackWidthRef.current;
        const { min: bMin, max: bMax } = boundsRef.current;
        if (!w || bMax <= bMin) return;
        const pxPerValue = w / (bMax - bMin);
        const delta = gesture.dx / pxPerValue;
        const nextMax = startRef.current.valueMax + delta;
        const minAllowed = valuesRef.current.valueMin;
        onChangeRef.current(minAllowed, snapClamp(nextMax, minAllowed, bMax));
      },
    }),
  ).current;

  const range = Math.max(1, max - min);
  const minPos = trackWidth > 0 ? ((valueMin - min) / range) * trackWidth : 0;
  const maxPos = trackWidth > 0 ? ((valueMax - min) / range) * trackWidth : 0;
  const clampedMinPos = clamp(minPos, 0, trackWidth);
  const clampedMaxPos = clamp(maxPos, 0, trackWidth);

  const thumbSize = 28;
  const trackH = 6;
  const trackBg = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';
  const activeBg = theme.tint;
  const thumbBg = isDark ? '#0b1220' : '#fff';
  const thumbBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)';

  return (
    <View style={{ marginTop: 10 }}>
      <View
        style={{ paddingHorizontal: thumbSize / 2, paddingVertical: 8 }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width - thumbSize; // remove padding on both sides
          setTrackWidth(Math.max(0, Math.round(w)));
        }}
      >
        <View style={{ height: Math.max(thumbSize, 34), justifyContent: 'center' }}>
          <View
            style={{
              height: trackH,
              borderRadius: 999,
              backgroundColor: trackBg,
              width: trackWidth,
              alignSelf: 'center',
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: thumbSize / 2 + Math.min(clampedMinPos, clampedMaxPos),
              width: Math.max(0, Math.abs(clampedMaxPos - clampedMinPos)),
              height: trackH,
              borderRadius: 999,
              backgroundColor: activeBg,
            }}
          />

          <View
            {...minPan.panHandlers}
            style={{
              position: 'absolute',
              left: thumbSize / 2 + clampedMinPos - thumbSize / 2,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              backgroundColor: thumbBg,
              borderWidth: 1,
              borderColor: thumbBorder,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.25 : 0.12,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: activeBg, opacity: 0.9 }} />
          </View>

          <View
            {...maxPan.panHandlers}
            style={{
              position: 'absolute',
              left: thumbSize / 2 + clampedMaxPos - thumbSize / 2,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              backgroundColor: thumbBg,
              borderWidth: 1,
              borderColor: thumbBorder,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.25 : 0.12,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: activeBg, opacity: 0.9 }} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted }}>{min}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted }}>{max}+</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: typeof Colors.light, isDark: boolean) {
  const surface = isDark ? '#111827' : '#fff';
  const surfaceSubtle = isDark ? theme.backgroundSubtle : '#f8fafc';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const outline = isDark ? 'rgba(255,255,255,0.12)' : '#e5e7eb';
  const shadowColor = isDark ? '#000' : '#0f172a';
  const overlayCard = isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.62)';
  const overlayBorder = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)';
  const infoButtonBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.95)';
  const infoButtonBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)';
  const placeholderBg = isDark ? '#1f2937' : '#e2e8f0';
  const placeholderText = isDark ? '#cbd5e1' : '#64748b';
  const pillBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';
  const chipBg = isDark ? 'rgba(255,255,255,0.04)' : '#fff';
  const chipActiveBg = isDark ? 'rgba(255,107,107,0.14)' : '#eef2ff';
  const toggleKnob = isDark ? '#1f2937' : '#e5e7eb';
  const modalBackdrop = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
  const badgeBg = isDark ? '#0b1220' : '#111827';
  const ghostBg = isDark ? 'rgba(255,255,255,0.04)' : '#fff';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: surfaceSubtle },
    scrollContent: { flexGrow: 1, paddingTop: 8 },
    stackWrapper: {
      flex: 1,
      position: 'relative',
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      marginTop: -2,
      // leave room at the bottom for action buttons
      paddingBottom: 154,
    },
    momentsFloatingOverlay: {
      position: 'absolute',
      top: -1,
      left: 20,
      right: 20,
      zIndex: 60,
      elevation: 24,
    },
    momentsStripContainer: {
      overflow: 'hidden',
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    momentsStripInner: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 5,
      shadowColor,
      shadowOpacity: isDark ? 0.12 : 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: isDark ? 2 : 6,
    },
    momentsStripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    momentsStripTitle: { fontSize: 14, fontWeight: '800', color: theme.text },
    momentsInlineRow: { flexDirection: 'row', alignItems: 'center' },
    momentsInlineList: { flex: 1, marginHorizontal: 2 },
    momentsListInlineContent: { alignItems: 'center', paddingRight: 12 },
    momentsSeeAllPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginLeft: 6,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: pillBg,
    },
    momentsStripSeeAll: { fontSize: 12, fontWeight: '700', color: theme.tint },
    momentsListWrap: { flex: 1 },
    momentsListContent: { paddingRight: 18 },
    momentsAvatarItem: { width: 62, alignItems: 'center', marginRight: 12 },
    momentsAvatarOuter: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 3,
      borderColor: 'rgba(240,210,160,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    momentsAvatarActive: { borderColor: '#f3c784' },
    momentsAvatarImage: { width: 46, height: 46, borderRadius: 23 },
    momentsAvatarPlaceholder: { width: 46, height: 46, borderRadius: 23, backgroundColor: placeholderBg, alignItems: 'center', justifyContent: 'center' },
    momentsAvatarInitial: { fontSize: 14, fontWeight: '700', color: placeholderText },
    momentsAvatarLabel: { fontSize: 11, color: theme.text, marginTop: 4, textAlign: 'center' },
    momentsPlusBadge: {
      position: 'absolute',
      right: 0,
      top: 30,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#f59e0b',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: surface,
    },
    momentsEmptyInlineCopy: {
      fontSize: 12,
      color: theme.textMuted,
      marginLeft: 2,
      marginRight: 18,
      flexShrink: 1,
    },
    momentsRightFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 34 },
    actionButtons: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 8, // keep the rail clear of the card copy while staying above the tab bar
      flexDirection: "row",
      justifyContent: "center",
      paddingHorizontal: 36,
      paddingVertical: 8,
      backgroundColor: "transparent",
      // Ensure action buttons sit above the card stack
      zIndex: 10000,
      elevation: 40,
    },
    actionFloatingCard: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 30,
      backgroundColor: overlayCard,
      borderWidth: 1,
      borderColor: overlayBorder,
      shadowColor,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.26 : 0.16,
      shadowRadius: 28,
      elevation: 12,
    },
    actionSecondaryCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 10,
      paddingRight: 10,
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    },
    actionPrimaryCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rejectRing: {
      width: 48,
      height: 48,
      borderRadius: 24,
      padding: 2,
      marginRight: 6,
    },
    rejectButton: {
      flex: 1,
      borderRadius: 20,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: outline,
      shadowColor,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.18 : 0.12,
      shadowRadius: 12,
      elevation: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    infoButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: infoButtonBg,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: infoButtonBorder,
      shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: 10,
      elevation: 4,
      marginHorizontal: 0,
    },
    requestRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      padding: 2,
      marginHorizontal: 0,
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.25 : 0.2,
      shadowRadius: 12,
      elevation: 6,
    },
    requestButton: {
      flex: 1,
      borderRadius: 24,
      backgroundColor: theme.background,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    likeRing: {
      width: 58,
      height: 58,
      borderRadius: 29,
      padding: 2,
      marginLeft: 2,
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.24 : 0.16,
      shadowRadius: 14,
      elevation: 9,
    },
    likeButton: {
      flex: 1,
      borderRadius: 27,
      backgroundColor: theme.tint,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    superlikeButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      // background will be a gradient via LinearGradientSafe
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      shadowColor,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.12 : 0.08,
      shadowRadius: 12,
      elevation: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    superlikeWrap: { alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
    superlikeFallback: {
      backgroundColor: theme.accent,
    },
    superlikeBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: badgeBg,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    superlikeBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    superlikeBadgeInline: {
      position: 'absolute',
      top: -18,
      right: -8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.08)' : 'rgba(196, 181, 253, 0.2)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(196, 181, 253, 0.3)' : 'rgba(168, 85, 247, 0.25)',
      zIndex: 12000,
      shadowColor: theme.accent,
      shadowOpacity: isDark ? 0.12 : 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    superlikeBadgeInlineDisabled: { opacity: 0.7 },
    superlikeBadgeInlineText: { color: theme.accent, fontSize: 11, fontWeight: '700' },
    headerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc',
      borderWidth: 1,
      borderColor: outline,
    },
    headerBadgeDisabled: { opacity: 0.7 },
    headerBadgeText: { color: theme.tint, fontSize: 12, fontWeight: '700' },
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyHintCard: {
      width: '88%',
      borderRadius: 22,
      paddingHorizontal: 18,
      paddingVertical: 18,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.16 : 0.07,
      shadowRadius: 18,
      elevation: 8,
      gap: 10,
    },
    emptyHintBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(17,197,198,0.12)' : 'rgba(17,197,198,0.09)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(17,197,198,0.22)' : 'rgba(11,107,105,0.12)',
    },
    emptyHintBadgeText: {
      color: theme.tint,
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    emptyHintTitle: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '800',
      color: theme.text,
    },
    emptyHintSubtitle: {
      fontSize: 13.5,
      lineHeight: 19,
      color: theme.textMuted,
    },
    emptyHintActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },
    emptyHintPrimary: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.tint,
    },
    emptyHintPrimaryText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '800',
    },
    emptyHintGhost: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: ghostBg,
    },
    emptyHintGhostText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    emptyCard: {
      width: '86%',
      backgroundColor: surface,
      borderRadius: 18,
      padding: 20,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 18,
      elevation: 10,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    emptyBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,107,105,0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,107,105,0.12)',
      marginBottom: 12,
    },
    emptyBadgeText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 14, color: theme.textMuted, textAlign: 'center', marginBottom: 16 },
    emptyActions: { flexDirection: 'row', width: '100%', justifyContent: 'center' },
    primaryButton: { backgroundColor: theme.tint, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginRight: 8 },
    primaryButtonText: { color: '#fff', fontWeight: '700' },
    ghostButton: { borderWidth: 1, borderColor: outline, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: ghostBg },
    ghostButtonText: { color: theme.text, fontWeight: '600' },
    locationBanner: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : '#f8fafc',
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    },
    locationBannerCompact: {
      paddingVertical: 12,
      marginBottom: 10,
    },
    locationBannerHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    locationBannerCopy: {
      flex: 1,
    },
    locationTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
    locationSubtitle: { fontSize: 13, color: theme.textMuted, marginBottom: 10 },
    locationSubtitleCompact: {
      marginBottom: 8,
    },
    locationActions: { flexDirection: 'row', alignItems: 'center' },
    locationActionsCompact: {
      flexWrap: 'wrap',
      gap: 8,
    },
    locationButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
    locationPrimary: { backgroundColor: theme.tint, marginRight: 8 },
    locationPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13.5, lineHeight: 16, textAlign: 'center' },
    locationGhost: { borderWidth: 1, borderColor: outline, backgroundColor: ghostBg },
    locationGhostText: { color: theme.text, fontWeight: '600' },
    locationDismissButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
      borderWidth: 1,
      borderColor: outline,
    },
    locationNotNowButton: {
      marginLeft: 0,
      marginRight: 0,
    },
    locationError: { color: '#b91c1c', marginTop: 6, fontSize: 12 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: modalBackdrop,
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 20,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: cardBorder,
    },
    modalTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    modalTitleCopy: { flex: 1, gap: 4 },
    modalEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: theme.tint },
    modalTitle: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: theme.text },
    modalResetButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: chipBg,
    },
    modalResetText: { fontSize: 12, fontWeight: '800', color: theme.text },
    modalSubtitle: { fontSize: 13, lineHeight: 19, color: theme.textMuted, marginTop: 10, marginBottom: 16 },
    modalScroll: { marginHorizontal: -2 },
    modalScrollContent: { paddingBottom: 6, gap: 14 },
    filterHeroCard: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(243,199,132,0.18)' : 'rgba(214,178,132,0.28)',
      shadowColor: isDark ? '#000' : '#b98555',
      shadowOpacity: isDark ? 0.22 : 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    filterHeroGlowPrimary: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 999,
      right: -48,
      top: -70,
      backgroundColor: isDark ? 'rgba(17,197,198,0.12)' : 'rgba(255,255,255,0.42)',
    },
    filterHeroGlowSecondary: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 999,
      left: -34,
      bottom: -52,
      backgroundColor: isDark ? 'rgba(243,199,132,0.10)' : 'rgba(255,255,255,0.26)',
    },
    filterHeroBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.58)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(214,178,132,0.24)',
      marginBottom: 10,
    },
    filterHeroBadgeText: { fontSize: 11.5, fontWeight: '800', color: theme.text },
    filterHeroTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: theme.text, marginBottom: 6, maxWidth: '88%' },
    filterHeroBody: { fontSize: 13.5, lineHeight: 19, color: theme.textMuted, maxWidth: '94%' },
    filterLegendStack: { marginTop: 12, gap: 8 },
    filterLegendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 16,
      borderWidth: 1,
    },
    filterLegendRowPremium: {
      backgroundColor: isDark ? 'rgba(17,197,198,0.10)' : 'rgba(255,255,255,0.52)',
      borderColor: isDark ? 'rgba(17,197,198,0.18)' : 'rgba(214,178,132,0.22)',
    },
    filterLegendRowFree: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.38)',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
    },
    filterLegendText: { flex: 1, fontSize: 12, lineHeight: 17, color: theme.textMuted },
    activeFiltersCard: {
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(214,178,132,0.16)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : '#fffaf6',
      shadowColor,
      shadowOpacity: isDark ? 0.12 : 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    activeFiltersRow: { paddingTop: 4, paddingBottom: 4, gap: 8, paddingRight: 6 },
    activeFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(214,178,132,0.18)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
    },
    activeFilterChipText: { fontSize: 12, fontWeight: '700', color: theme.text },
    activeFiltersSummaryTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: theme.text, marginTop: 4 },
    activeFiltersSummaryBody: { fontSize: 12.5, lineHeight: 18, color: theme.textMuted, marginTop: 2 },
    activeFiltersEmpty: { fontSize: 12.5, lineHeight: 18, color: theme.textMuted, marginTop: 6 },
    modalInput: {
      borderWidth: 1,
      borderColor: outline,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text,
      backgroundColor: isDark ? '#0b1220' : '#fff',
    },
    modalLabel: { fontSize: 13, fontWeight: '700', color: theme.text, marginTop: 14, marginBottom: 8 },
    countryChips: { paddingBottom: 2 },
    countryChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: chipBg,
      marginRight: 8,
    },
    countryChipActive: { backgroundColor: chipActiveBg, borderColor: theme.tint },
    countryChipText: { fontSize: 13, fontWeight: '600', color: theme.text },
    countryChipTextActive: { color: theme.tint },
    modalPreviewRow: {
      marginTop: 2,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(17,197,198,0.14)' : 'rgba(214,178,132,0.18)',
      backgroundColor: isDark ? 'rgba(12,27,34,0.56)' : '#fffaf5',
    },
    modalPreviewEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1, color: theme.tint, textTransform: 'uppercase', textAlign: 'center' },
    modalPreviewTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: theme.text, textAlign: 'center', marginTop: 4 },
    modalPreviewBody: { fontSize: 12.5, lineHeight: 18, fontWeight: '600', color: theme.textMuted, textAlign: 'center', marginTop: 4 },
    modalActions: { flexDirection: 'row', marginTop: 4, gap: 10 },
    filterSection: { marginTop: 12, marginBottom: 10 },
    filterSectionCard: {
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
      gap: 12,
      shadowColor,
      shadowOpacity: isDark ? 0.1 : 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    filterSectionCardPremium: {
      borderColor: isDark ? 'rgba(17,197,198,0.15)' : 'rgba(214,178,132,0.22)',
      backgroundColor: isDark ? 'rgba(18,36,43,0.34)' : '#fffaf5',
    },
    filterSectionCardMixed: {
      borderColor: isDark ? 'rgba(243,199,132,0.16)' : 'rgba(229,190,138,0.26)',
      backgroundColor: isDark ? 'rgba(52,44,28,0.30)' : '#fffaf2',
    },
    filterSectionCardFree: {
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : '#fffefd',
    },
    filterSectionHeader: { gap: 3 },
    filterSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    filterSectionEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: theme.tint, textTransform: 'uppercase' },
    filterSectionTitle: { fontSize: 17, lineHeight: 21, fontWeight: '800', color: theme.text },
    filterSectionBody: { fontSize: 12.5, lineHeight: 18, color: theme.textMuted },
    filterTierPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      alignSelf: 'flex-start',
    },
    filterTierPillPremium: {
      backgroundColor: isDark ? 'rgba(17,197,198,0.16)' : 'rgba(255,255,255,0.72)',
      borderColor: isDark ? 'rgba(17,197,198,0.28)' : 'rgba(214,178,132,0.28)',
    },
    filterTierPillFree: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.06)',
    },
    filterTierPillMixed: {
      backgroundColor: isDark ? 'rgba(246,196,83,0.14)' : 'rgba(255,250,241,0.88)',
      borderColor: isDark ? 'rgba(246,196,83,0.24)' : 'rgba(229,190,138,0.28)',
    },
    filterTierPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
    filterTierPillTextPremium: { color: isDark ? '#7fe4dc' : '#0b6b69' },
    filterTierPillTextFree: { color: theme.text },
    filterTierPillTextMixed: { color: isDark ? '#f3c784' : '#8a5a09' },
    filterFieldGroup: { gap: 6 },
    filterLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
    filterHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    filterChipsRow: { flexDirection: 'row', marginTop: 8 },
    filterChipsRowWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 8 },
    filterPresetRail: { paddingTop: 6, paddingBottom: 2, paddingRight: 8, gap: 10 },
    filterChip: {
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
      marginRight: 0,
      backgroundColor: chipBg,
      shadowColor: shadowColor,
      shadowOpacity: isDark ? 0.05 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    filterPresetChip: { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff' },
    filterPresetChipRich: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      minHeight: 42,
      borderColor: isDark ? 'rgba(127,228,220,0.16)' : 'rgba(11,107,105,0.10)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : '#fffdfb',
    },
    filterChipActive: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.18 : 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    filterChipDisabled: { opacity: 0.5 },
    filterChipText: { fontWeight: '700', color: theme.text },
    filterChipTextActive: { color: '#fff' },
    filterToggleStack: { gap: 10 },
    filterToggle: {
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.07)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.88)',
      gap: 12,
      shadowColor,
      shadowOpacity: isDark ? 0.06 : 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    filterToggleActive: {
      borderColor: theme.tint,
      backgroundColor: isDark ? 'rgba(17,197,198,0.14)' : 'rgba(232,249,246,0.95)',
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.16 : 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    filterToggleCopy: { flex: 1, gap: 2 },
    filterToggleMeta: { alignItems: 'center', gap: 8, minWidth: 48 },
    filterToggleKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: toggleKnob,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
    },
    filterToggleKnobActive: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
    },
    filterToggleText: { fontWeight: '700', color: theme.textMuted },
    filterToggleTextActive: { color: theme.tint },
    advancedSectionWrap: { overflow: 'hidden', gap: 14 },
    expandAdvancedButton: {
      marginTop: 2,
      marginBottom: 2,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : '#fff',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor,
      shadowOpacity: isDark ? 0.08 : 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    expandAdvancedEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: theme.tint },
    expandAdvancedTitle: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: theme.text, marginTop: 3 },
    expandAdvancedMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    expandAdvancedMetaText: { fontSize: 12.5, fontWeight: '700', color: theme.textMuted },
    filterInputsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    filterInputWrapper: { flex: 1 },
    filterInput: { borderWidth: 1, borderColor: outline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontWeight: '700', color: theme.text, backgroundColor: isDark ? '#0b1220' : '#fff', marginTop: 4 },
    ageTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    ageRangePill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(214,178,132,0.18)',
      backgroundColor: isDark ? pillBg : '#fff8f1',
    },
    ageRangeText: { fontSize: 13, fontWeight: '800', color: theme.text },
    ageAnyChip: { marginRight: 0 },
    modalApplyButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.2 : 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    modalFooterSecondary: {
      flex: 0.84,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalFooterPrimary: {
      flex: 1.16,
      paddingHorizontal: 16,
    },
    headerRefreshButton: {
      width: 40,
      height: 40,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: outline,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(248,250,252,0.96)',
      shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.1 : 0.06,
      shadowRadius: 8,
      elevation: 4,
    },
  });
}
