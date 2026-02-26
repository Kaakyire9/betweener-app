import ExploreHeader from "@/components/ExploreHeader";
import type { ExploreStackHandle } from "@/components/ExploreStack.reanimated";
import ExploreStack from "@/components/ExploreStack.reanimated";
import MatchModal from '@/components/MatchModal';
import MomentCreateModal from '@/components/MomentCreateModal';
import MomentViewer from '@/components/MomentViewer';
import ProfileVideoModal from '@/components/ProfileVideoModal';
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { requestAndSavePreciseLocation, saveManualCityLocation } from "@/hooks/useLocationPreference";
import { useMoments, type MomentUser } from '@/hooks/useMoments';
import useVibesFeed, { applyVibesFilters, type VibesFilters } from "@/hooks/useVibesFeed";
import { useAuth } from "@/lib/auth-context";
import { haptics } from "@/lib/haptics";
import { recordProfileSignal } from '@/lib/profile-signals';
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
import Notice from "@/components/ui/Notice";
import { ExploreStackSkeleton } from "@/components/ui/Skeleton";
import { isLikelyNetworkError } from "@/lib/network";
import { logger } from "@/lib/telemetry/logger";

const DISTANCE_UNIT_KEY = 'distance_unit';
const DISTANCE_UNIT_EVENT = 'distance_unit_changed';
const KM_PER_MILE = 1.60934;
const VIBES_FILTERS_KEY = 'vibes_filters_v2';

type DistanceUnit = 'auto' | 'km' | 'mi';

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

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { profile, user, refreshProfile } = useAuth();
  const profileCountryCode = (profile as any)?.current_country_code as string | undefined;

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
  });

  const [celebrationMatch, setCelebrationMatch] = useState<any | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const lastFeedErrorAtRef = useRef(0);
  const [momentViewerVisible, setMomentViewerVisible] = useState(false);
  const [momentCreateVisible, setMomentCreateVisible] = useState(false);
  const [momentStartUserId, setMomentStartUserId] = useState<string | null>(null);
  const [allMomentsVisible, setAllMomentsVisible] = useState(false);
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
  const [filtersVisible, setFiltersVisible] = useState(false);
  // Some platforms behave inconsistently when stacking multiple RN <Modal />s.
  // If the user opens manual city entry from within the Filters modal, we close Filters first,
  // show the manual modal, then optionally reopen Filters afterward (keeping draft state).
  const reopenFiltersAfterManualLocationRef = useRef(false);
  const suppressDraftSyncOnNextFiltersOpenRef = useRef(false);
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
  const filtersStorageKey = useMemo(
    () => (profile?.id ? `${VIBES_FILTERS_KEY}:${profile.id}` : null),
    [profile?.id],
  );
  const filtersLoadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filtersStorageKey) return;
    if (filtersLoadedKeyRef.current === filtersStorageKey) return;
    filtersLoadedKeyRef.current = filtersStorageKey;

    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(filtersStorageKey);
        if (cancelled || !raw) return;
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
  }, [applyFilters, filtersStorageKey]);

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
  const [superlikesLeft, setSuperlikesLeft] = useState<number>(3);
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
    const set = new Set<string>();
    matchList.forEach((m) => {
      if ((m as any).religion) set.add(String((m as any).religion));
    });
    set.add('Muslim'); // ensure common option is always available
    return Array.from(set).slice(0, 8);
  }, [matchList]);

  const myMomentUser = useMemo(() => momentUsers.find((u) => u.isOwn), [momentUsers]);
  const momentUserIdSet = useMemo(() => new Set(matchList.map((m) => String(m.id))), [matchList]);
  const otherMomentUsers = useMemo(
    () => momentUsers.filter((u) => !u.isOwn && u.moments.length > 0 && momentUserIdSet.has(String(u.userId))),
    [momentUsers, momentUserIdSet],
  );
  const momentStripUsers = useMemo(() => {
    const list: MomentUser[] = [];
    if (myMomentUser) list.push(myMomentUser);
    return [...list, ...otherMomentUsers];
  }, [myMomentUser, otherMomentUsers]);
  const hasMyActiveMoment = (myMomentUser?.moments?.length ?? 0) > 0;
  const showMomentsEmptyState = otherMomentUsers.length === 0 && !hasMyActiveMoment;
  const momentUsersWithContent = useMemo(() => momentUsers.filter((u) => u.moments.length > 0), [momentUsers]);

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
  const handleMomentsPress = () => {
    setAllMomentsVisible(true);
  };

  const hasPreciseCoords = profile?.latitude != null && profile?.longitude != null;
  const hasCityOnly = !!profile?.location && profile?.location_precision === 'CITY';
  const needsLocationPrompt = !hasPreciseCoords && !hasCityOnly;

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
      setLocationError('error' in res ? res.error : 'Unable to save location');
    } else {
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
    if (reopenFiltersAfterManualLocationRef.current) {
      reopenFiltersAfterManualLocationRef.current = false;
      // Let the first modal dismiss cleanly before re-opening Filters.
      setTimeout(() => setFiltersVisible(true), 250);
    }
  }, []);

  const openManualLocationModal = useCallback(() => {
    setLocationError(null);
    setManualLocation(profile?.location || "");
    setManualCountryCode(profileCountryCode || manualCountryCode || "");
    setManualLocationModalVisible(true);
  }, [manualCountryCode, profile?.location, profileCountryCode]);

  const openManualLocationModalFromFilters = useCallback(() => {
    // Preserve current draft values on reopen by skipping the "sync from applied" step once.
    suppressDraftSyncOnNextFiltersOpenRef.current = true;
    reopenFiltersAfterManualLocationRef.current = true;
    setFiltersVisible(false);
    setTimeout(() => openManualLocationModal(), 250);
  }, [openManualLocationModal]);

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
      closeManualLocationModal();
      await refreshProfile();
      await refreshMatches();
    }
    setIsSavingLocation(false);
  };

  const handleApplyFilters = () => {
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
      // Premium UX: treat the modal controls as "draft" until Apply is pressed.
      if (suppressDraftSyncOnNextFiltersOpenRef.current) {
        suppressDraftSyncOnNextFiltersOpenRef.current = false;
        return;
      }
      syncFilterDraftFromApplied();
    }
  }, [filtersVisible, syncFilterDraftFromApplied]);

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

  const draftPreviewCount = useMemo(() => {
    if (!filtersVisible) return null;
    try {
      return applyVibesFilters(poolProfiles ?? [], draftFiltersForPreview, {
        segment: vibesSegment,
        momentUserIds: momentBoostIds,
        viewerInterests,
      }).length;
    } catch {
      return null;
    }
  }, [draftFiltersForPreview, filtersVisible, momentBoostIds, poolProfiles, vibesSegment, viewerInterests]);

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

  const commitFilters = useCallback(
    (patch: Partial<{
      verifiedOnly: boolean;
      hasVideoOnly: boolean;
      activeOnly: boolean;
      distanceFilterKm: number | null;
      minAge: number;
      maxAge: number;
      religionFilter: string | null;
      minVibeScore: number | null;
      minSharedInterests: number;
      locationQuery: string;
    }>) => {
      const base = appliedFilters ?? {
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
      const next = { ...base, ...patch };

      setVerifiedOnly(Boolean(next.verifiedOnly));
      setHasVideoOnly(Boolean(next.hasVideoOnly));
      setActiveOnly(Boolean(next.activeOnly));
      setDistanceFilterKm(next.distanceFilterKm ?? null);
      setMinAge(typeof next.minAge === 'number' ? next.minAge : 18);
      setMaxAge(typeof next.maxAge === 'number' ? next.maxAge : 60);
      setReligionFilter(typeof next.religionFilter === 'string' ? next.religionFilter : null);
      setMinVibeScore(typeof next.minVibeScore === 'number' ? next.minVibeScore : null);
      setMinSharedInterests(typeof next.minSharedInterests === 'number' ? next.minSharedInterests : 0);
      setLocationQuery(typeof next.locationQuery === 'string' ? next.locationQuery : '');

      applyFilters(next);
      setCurrentIndex(0);
      if (filtersStorageKey) {
        AsyncStorage.setItem(filtersStorageKey, JSON.stringify(next)).catch(() => {});
      }
    },
    [
      activeOnly,
      appliedFilters,
      applyFilters,
      distanceFilterKm,
      filtersStorageKey,
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

  const appliedFilterChips = useMemo(() => {
    if (!appliedFilters) return [];
    const chips: { key: string; label: string; onClear: () => void }[] = [];

    if (appliedFilters.verifiedOnly) chips.push({ key: 'verified', label: 'Verified', onClear: () => commitFilters({ verifiedOnly: false }) });
    if (appliedFilters.hasVideoOnly) chips.push({ key: 'video', label: 'Video', onClear: () => commitFilters({ hasVideoOnly: false }) });
    if (appliedFilters.activeOnly) chips.push({ key: 'active', label: 'Active', onClear: () => commitFilters({ activeOnly: false }) });
    if (appliedFilters.minVibeScore != null) chips.push({ key: 'vibe', label: `Vibe ${appliedFilters.minVibeScore}%+`, onClear: () => commitFilters({ minVibeScore: null }) });
    if ((appliedFilters.minSharedInterests || 0) > 0) chips.push({ key: 'shared', label: `${appliedFilters.minSharedInterests}+ shared`, onClear: () => commitFilters({ minSharedInterests: 0 }) });
    if (appliedFilters.distanceFilterKm != null) chips.push({ key: 'distance', label: `<= ${formatDistanceLabel(appliedFilters.distanceFilterKm)}`, onClear: () => commitFilters({ distanceFilterKm: null }) });
    if (appliedFilters.minAge !== 18 || appliedFilters.maxAge !== 60) chips.push({ key: 'age', label: `${appliedFilters.minAge}-${appliedFilters.maxAge}`, onClear: () => commitFilters({ minAge: 18, maxAge: 60 }) });
    if (appliedFilters.religionFilter) chips.push({ key: 'religion', label: String(appliedFilters.religionFilter), onClear: () => commitFilters({ religionFilter: null }) });
    if (appliedFilters.locationQuery && appliedFilters.locationQuery.trim()) {
      chips.push({ key: 'loc', label: `City: ${appliedFilters.locationQuery.trim()}`, onClear: () => commitFilters({ locationQuery: '' }) });
    }

    return chips;
  }, [appliedFilters, commitFilters, formatDistanceLabel]);

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
          const hasPersonality = Array.isArray((m as any).personalityTags) && (m as any).personalityTags.length > 0;
          const hasInterests = Array.isArray((m as any).interests) && (m as any).interests.length > 0;
          const id = String(m.id);
          if ((prefetchedDetailsRef.current.has(id) || prefetchInFlightRef.current.has(id))) continue;
          if (!hasVideo || !hasPersonality || !hasInterests) {
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

    useEffect(() => {
      Animated.parallel([
        Animated.timing(noMoreTranslate, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(noMoreOpacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, [noMoreOpacity, noMoreTranslate]);

    return (
      <Animated.View style={[{ transform: [{ translateY: noMoreTranslate }], opacity: noMoreOpacity }, styles.emptyStateContainer]}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No new profiles right now</Text>
          <Text style={styles.emptySubtitle}>Check back later or refresh for a new set.</Text>
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
            location: (m as any).region || (m as any).location || '',
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
              onPress={handleRefreshVibes}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="refresh" size={18} color={theme.tint} />
            </TouchableOpacity>
          )}
        />

        {appliedFilterChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.appliedFiltersBar}
          >
            {appliedFilterChips.map((chip) => (
              <TouchableOpacity
                key={chip.key}
                style={styles.appliedFilterChip}
                onPress={chip.onClear}
                activeOpacity={0.85}
              >
                <Text style={styles.appliedFilterChipText}>{chip.label}</Text>
                <MaterialCommunityIcons name="close" size={14} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.appliedFilterChipEdit}
              onPress={() => setFiltersVisible(true)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="tune-vertical" size={14} color={theme.tint} />
              <Text style={styles.appliedFilterChipEditText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.appliedFilterChipEdit}
              onPress={resetAllFilters}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="refresh" size={14} color={theme.tint} />
              <Text style={styles.appliedFilterChipEditText}>Clear</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

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
          {needsLocationPrompt ? (
            <View style={styles.locationBanner}>
              <Text style={styles.locationTitle}>Set your location</Text>
              <Text style={styles.locationSubtitle}>
                Enable location to see nearby matches and more accurate distance. You can also set
                your city anytime from Filters.
              </Text>
              <View style={styles.locationActions}>
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
              </View>
              {locationError ? (
                <Text style={[styles.locationError, { marginTop: 8 }]}>{locationError}</Text>
              ) : null}
            </View>
          ) : null}
          {user?.id ? (
            <VibesMomentsStrip
              users={momentStripUsers}
              hasMyActiveMoment={hasMyActiveMoment}
              showEmptyState={showMomentsEmptyState}
              onPressMyMoment={handlePressMyMoment}
              onPressUserMoment={handlePressUserMoment}
              onPressSeeAll={handleMomentsPress}
              onPressPostMoment={handlePressMyMoment}
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
              {(typeof __DEV__ !== 'undefined' && __DEV__) || user?.id === 'f2e418eb-2535-4671-9588-6f2aa0ae0a36' ? (
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
            <LinearGradientSafe
              colors={[theme.backgroundSubtle, theme.background]}
              style={styles.rejectRing}
            >
              <TouchableOpacity
                style={styles.rejectButton}
                onPress={() => animateButtonPress(onReject)}
                activeOpacity={0.85}
              >
                <CircleOff size={24} color={theme.textMuted} style={{ marginTop: 1 }} />
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
              <MaterialCommunityIcons name="undo-variant" size={20} color={theme.tint} />
            </TouchableOpacity>

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
                style={[styles.superlikeButton, !isLinearGradientAvailable && styles.superlikeFallback]}
              >
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => animateButtonPress(onSuperlike)}
                  activeOpacity={0.85}
                >
                  <Gem size={22} color="#fff" style={{ marginTop: 1 }} />
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
                <Sparkles size={22} color="#fff" style={{ marginTop: 1 }} />
              </TouchableOpacity>
            </LinearGradientSafe>
            </BlurViewSafe>
          </Animated.View>
        </View>

        <Modal
          visible={filtersVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            syncFilterDraftFromApplied();
            setFiltersVisible(false);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.modalTitleRow}>
                  <Text style={styles.modalTitle}>Filters</Text>
                  <TouchableOpacity style={styles.modalResetButton} onPress={resetAllFilters} activeOpacity={0.85}>
                    <Text style={styles.modalResetText}>Reset</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>Refine your vibes.</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
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
                    <Text style={styles.activeFiltersEmpty}>No filters applied.</Text>
                  )}

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Premium presets</Text>
                    <Text style={styles.filterHint}>One tap to set a mood.</Text>
                    <View style={styles.filterChipsRowWrap}>
                      <TouchableOpacity
                        style={[styles.filterChip, minVibeScore === 70 && minSharedInterests === 2 && styles.filterChipActive]}
                        onPress={() => {
                          setMinVibeScore(70);
                          setMinSharedInterests(2);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, minVibeScore === 70 && minSharedInterests === 2 && styles.filterChipTextActive]}>High Vibe</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.filterChip, verifiedOnly && styles.filterChipActive]}
                        onPress={() => setVerifiedOnly(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, verifiedOnly && styles.filterChipTextActive]}>Verified</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.filterChip, hasVideoOnly && styles.filterChipActive]}
                        onPress={() => setHasVideoOnly(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, hasVideoOnly && styles.filterChipTextActive]}>Video</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.filterChip, activeOnly && styles.filterChipActive]}
                        onPress={() => setActiveOnly(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, activeOnly && styles.filterChipTextActive]}>Active</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Show only verified</Text>
                    <TouchableOpacity
                      style={[styles.filterToggle, verifiedOnly && styles.filterToggleActive]}
                      onPress={() => setVerifiedOnly((v) => !v)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.filterToggleKnob, verifiedOnly && styles.filterToggleKnobActive]} />
                      <Text style={[styles.filterToggleText, verifiedOnly && styles.filterToggleTextActive]}>{verifiedOnly ? 'On' : 'Off'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Intro video</Text>
                    <Text style={styles.filterHint}>Show profiles that have a video.</Text>
                    <TouchableOpacity
                      style={[styles.filterToggle, hasVideoOnly && styles.filterToggleActive]}
                      onPress={() => setHasVideoOnly((v) => !v)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.filterToggleKnob, hasVideoOnly && styles.filterToggleKnobActive]} />
                      <Text style={[styles.filterToggleText, hasVideoOnly && styles.filterToggleTextActive]}>{hasVideoOnly ? 'On' : 'Off'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Active recently</Text>
                    <Text style={styles.filterHint}>Prioritize people who are online or recently active.</Text>
                    <TouchableOpacity
                      style={[styles.filterToggle, activeOnly && styles.filterToggleActive]}
                      onPress={() => setActiveOnly((v) => !v)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.filterToggleKnob, activeOnly && styles.filterToggleKnobActive]} />
                      <Text style={[styles.filterToggleText, activeOnly && styles.filterToggleTextActive]}>{activeOnly ? 'On' : 'Off'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Vibe level</Text>
                    <Text style={styles.filterHint}>Minimum compatibility score.</Text>
                    <View style={styles.filterChipsRowWrap}>
                      {[50, 60, 70, 80].map((score) => (
                        <TouchableOpacity
                          key={`vibe-${score}`}
                          style={[styles.filterChip, minVibeScore === score && styles.filterChipActive]}
                          onPress={() => setMinVibeScore(score)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.filterChipText, minVibeScore === score && styles.filterChipTextActive]}>{`${score}%+`}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.filterChip, minVibeScore == null && styles.filterChipActive]}
                        onPress={() => setMinVibeScore(null)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, minVibeScore == null && styles.filterChipTextActive]}>Any</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Shared interests</Text>
                    <Text style={styles.filterHint}>
                      {viewerInterests.length > 0 ? 'Match on common interests.' : 'Add interests in your profile to use this.'}
                    </Text>
                    <View style={styles.filterChipsRowWrap}>
                      {[1, 2, 3].map((n) => (
                        <TouchableOpacity
                          key={`shared-${n}`}
                          style={[styles.filterChip, minSharedInterests === n && styles.filterChipActive]}
                          onPress={() => setMinSharedInterests(n)}
                          activeOpacity={0.85}
                          disabled={viewerInterests.length === 0}
                        >
                          <Text style={[styles.filterChipText, minSharedInterests === n && styles.filterChipTextActive]}>{`${n}+`}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.filterChip, minSharedInterests === 0 && styles.filterChipActive]}
                        onPress={() => setMinSharedInterests(0)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterChipText, minSharedInterests === 0 && styles.filterChipTextActive]}>Any</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Distance</Text>
                    <Text style={styles.filterHint}>{activeTab === 'nearby' ? 'Nearby tab only' : 'Switch to Nearby to use distance'}</Text>
                    <View style={styles.filterChipsRow}>
                      {distanceChipOptions.map((option) => (
                        <TouchableOpacity
                          key={option.label}
                          style={[
                            styles.filterChip,
                            distanceFilterKm === option.km && styles.filterChipActive,
                            activeTab !== 'nearby' && styles.filterChipDisabled,
                          ]}
                          onPress={() => {
                            if (activeTab !== 'nearby') return;
                            setDistanceFilterKm(option.km);
                          }}
                          activeOpacity={0.85}
                          disabled={activeTab !== 'nearby'}
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
                        onPress={() => {
                          if (activeTab !== 'nearby') return;
                          setDistanceFilterKm(null);
                        }}
                        activeOpacity={0.85}
                        disabled={activeTab !== 'nearby'}
                      >
                        <Text style={[styles.filterChipText, distanceFilterKm == null && styles.filterChipTextActive]}>Any</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.filterSection}>
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

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Religion</Text>
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

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Location settings</Text>
                    <Text style={styles.filterHint}>
                      {hasPreciseCoords
                        ? 'Using precise location for distance.'
                        : hasCityOnly
                        ? 'City-only location is set.'
                        : 'Location not set yet.'}
                    </Text>
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
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Location</Text>
                    <Text style={styles.filterHint}>Type a city (e.g., Accra, Ghana)</Text>
                    <TextInput
                      style={[styles.filterInput, { marginTop: 8 }]}
                      placeholder="e.g., Accra, Ghana"
                      value={locationQuery}
                      onChangeText={setLocationQuery}
                    />
                  </View>

                  <View style={styles.modalPreviewRow}>
                    <Text style={styles.modalPreviewText}>
                      Preview: {draftPreviewCount ?? 0} result{(draftPreviewCount ?? 0) === 1 ? '' : 's'}
                      {poolProfiles?.length ? ` (from ${poolProfiles.length} loaded)` : ''}
                    </Text>
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.locationButton, styles.locationGhost, { flex: 1 }]}
                      onPress={() => {
                        syncFilterDraftFromApplied();
                        setFiltersVisible(false);
                      }}
                    >
                      <Text style={styles.locationGhostText}>Close</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.locationButton, styles.locationPrimary, { flex: 1 }]} onPress={handleApplyFilters}>
                      <Text style={styles.locationPrimaryText}>
                        Apply{draftPreviewCount != null ? ` (${draftPreviewCount})` : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

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
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      // leave room at the bottom for action buttons
      paddingBottom: 120,
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
      bottom: 0, // sit the buttons down in the gap above the tab bar
      flexDirection: "row",
      justifyContent: "center",
      paddingHorizontal: 36,
      paddingVertical: 20,
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
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 40,
      backgroundColor: overlayCard,
      borderWidth: 1,
      borderColor: overlayBorder,
      shadowColor,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.26 : 0.16,
      shadowRadius: 28,
      elevation: 12,
    },
    rejectRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      padding: 2,
      marginRight: 12,
    },
    rejectButton: {
      flex: 1,
      borderRadius: 28,
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
      width: 54,
      height: 54,
      borderRadius: 27,
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
      marginHorizontal: 4,
    },
    requestRing: {
      width: 56,
      height: 56,
      borderRadius: 28,
      padding: 2,
      marginHorizontal: 4,
      shadowColor: theme.tint,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.25 : 0.2,
      shadowRadius: 12,
      elevation: 6,
    },
    requestButton: {
      flex: 1,
      borderRadius: 26,
      backgroundColor: theme.background,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    likeRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      padding: 2,
      marginLeft: 12,
    },
    likeButton: {
      flex: 1,
      borderRadius: 28,
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
      width: 64,
      height: 64,
      borderRadius: 32,
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
    superlikeWrap: { alignItems: 'center', justifyContent: 'center' },
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
      top: -20,
      right: -6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(34, 197, 94, 0.08)' : 'rgba(196, 181, 253, 0.2)',
      paddingHorizontal: 10,
      paddingVertical: 5,
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
    superlikeBadgeInlineText: { color: theme.accent, fontSize: 12, fontWeight: '700' },
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
    emptyTitle: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 14, color: theme.textMuted, textAlign: 'center', marginBottom: 16 },
    emptyActions: { flexDirection: 'row', width: '100%', justifyContent: 'center' },
    primaryButton: { backgroundColor: theme.tint, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginRight: 8 },
    primaryButtonText: { color: '#fff', fontWeight: '700' },
    ghostButton: { borderWidth: 1, borderColor: outline, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: ghostBg },
    ghostButtonText: { color: theme.text, fontWeight: '600' },
    locationBanner: {
      backgroundColor: isDark ? 'rgba(255,107,107,0.08)' : '#eef2ff',
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,107,107,0.2)' : '#e0e7ff',
    },
    locationTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
    locationSubtitle: { fontSize: 13, color: theme.textMuted, marginBottom: 10 },
    locationActions: { flexDirection: 'row', alignItems: 'center' },
    locationButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
    locationPrimary: { backgroundColor: theme.tint, marginRight: 8 },
    locationPrimaryText: { color: '#fff', fontWeight: '700' },
    locationGhost: { borderWidth: 1, borderColor: outline, backgroundColor: ghostBg },
    locationGhostText: { color: theme.text, fontWeight: '600' },
    locationError: { color: '#b91c1c', marginTop: 6, fontSize: 12 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: modalBackdrop,
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 6 },
    modalResetButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: chipBg,
    },
    modalResetText: { fontSize: 12, fontWeight: '800', color: theme.text },
    modalSubtitle: { fontSize: 13, color: theme.textMuted, marginBottom: 14 },
    activeFiltersRow: { paddingBottom: 4, gap: 8, paddingRight: 6 },
    activeFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: ghostBg,
    },
    activeFilterChipText: { fontSize: 12, fontWeight: '700', color: theme.text },
    activeFiltersEmpty: { fontSize: 12, color: theme.textMuted, marginTop: -6, marginBottom: 6 },
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
    modalPreviewRow: { marginTop: 14, paddingHorizontal: 2 },
    modalPreviewText: { fontSize: 12, fontWeight: '700', color: theme.textMuted, textAlign: 'center' },
    modalActions: { flexDirection: 'row', marginTop: 16 },
    filterSection: { marginTop: 12, marginBottom: 10 },
    filterLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
    filterHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    filterChipsRow: { flexDirection: 'row', marginTop: 8 },
    filterChipsRowWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: outline, marginRight: 8, backgroundColor: chipBg },
    filterChipActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    filterChipDisabled: { opacity: 0.5 },
    filterChipText: { fontWeight: '700', color: theme.text },
    filterChipTextActive: { color: '#fff' },
    filterToggle: { marginTop: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: outline, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: chipBg },
    filterToggleActive: { borderColor: theme.tint, backgroundColor: chipActiveBg },
    filterToggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: toggleKnob },
    filterToggleKnobActive: { backgroundColor: theme.tint },
    filterToggleText: { marginLeft: 10, fontWeight: '700', color: theme.text },
    filterToggleTextActive: { color: theme.tint },
    filterInputsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    filterInputWrapper: { flex: 1 },
    filterInput: { borderWidth: 1, borderColor: outline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontWeight: '700', color: theme.text, backgroundColor: isDark ? '#0b1220' : '#fff', marginTop: 4 },
    ageTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    ageRangePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: outline, backgroundColor: pillBg },
    ageRangeText: { fontSize: 13, fontWeight: '800', color: theme.text },
    ageAnyChip: { marginRight: 0 },
    headerRefreshButton: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: outline,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
    },
    appliedFiltersBar: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 2,
      gap: 8,
    },
    appliedFilterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: ghostBg,
    },
    appliedFilterChipText: { fontSize: 12, fontWeight: '700', color: theme.text },
    appliedFilterChipEdit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: chipBg,
    },
    appliedFilterChipEditText: { fontSize: 12, fontWeight: '800', color: theme.text },
  });
}
