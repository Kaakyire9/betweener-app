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
import useVibesFeed from "@/hooks/useVibesFeed";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe, { isLinearGradientAvailable } from "@/components/NativeWrappers/LinearGradientSafe";
import IntentRequestSheet from "@/components/IntentRequestSheet";
import { useFocusEffect } from "@react-navigation/native";
import { router } from 'expo-router';
import { CircleOff, Gem, Sparkles, Target } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, DeviceEventEmitter, Easing, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import VibesAllMomentsModal from "@/components/vibes/VibesAllMomentsModal";
import VibesMomentsStrip from "@/components/vibes/VibesMomentsStrip";

const DISTANCE_UNIT_KEY = 'distance_unit';
const DISTANCE_UNIT_EVENT = 'distance_unit_changed';
const KM_PER_MILE = 1.60934;

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
  const [activeWindowMinutes, setActiveWindowMinutes] = useState(15);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const vibesSegment = activeTab === 'nearby' ? 'nearby' : activeTab === 'active' ? 'activeNow' : 'forYou';
  const {
    profiles: matchList,
    recordSwipe,
    undoLastSwipe,
    refresh: refreshMatches,
    refreshing: refreshingMatches,
    smartCount,
    lastMutualMatch,
    fetchProfileDetails,
    applyFilters,
    refreshRemaining,
  } = useVibesFeed({
    userId: profile?.id,
    segment: vibesSegment,
    activeWindowMinutes,
    distanceUnit,
    momentUserIds: momentBoostIds,
  });

  const [celebrationMatch, setCelebrationMatch] = useState<any | null>(null);
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
    }
  }, [lastMutualMatch]);

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
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [distanceFilterKm, setDistanceFilterKm] = useState<number | null>(null);
  const [minAge, setMinAge] = useState<number>(18);
  const [maxAge, setMaxAge] = useState<number>(60);
  const [religionFilter, setReligionFilter] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState<string>('');
  const prefetchedDetailsRef = useRef<Set<string>>(new Set());
  const prefetchInFlightRef = useRef<Set<string>>(new Set());
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshTsRef = useRef<number>(0);
  const scrollY = useRef(new Animated.Value(0)).current;

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

  const stackRef = useRef<ExploreStackHandle | null>(null);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const superlikePulse = useRef(new Animated.Value(0)).current;
  const [superlikesLeft, setSuperlikesLeft] = useState<number>(3);
  const particles = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  // tweak this value to move the floating action card further down (positive = more downward nudge)
  const ACTION_BOTTOM_NUDGE = 40; // previously effectively 24

  // Responsive floating action card layout helper
  const getFloatingCardLayout = (w: number) => {
    // Small phones
    if (w < 480) {
      return {
        width: Math.min(Math.max(260, w - 48), 380),
        borderRadius: 36,
        paddingHorizontal: 14,
        paddingVertical: 8,
      };
    }

    // Large phones / small tablets
    if (w < 768) {
      return {
        width: Math.min(Math.max(300, w - 64), 520),
        borderRadius: 40,
        paddingHorizontal: 18,
        paddingVertical: 10,
      };
    }

    // Medium tablets
    if (w < 1000) {
      return {
        width: Math.min(720, w - 128),
        borderRadius: 48,
        paddingHorizontal: 22,
        paddingVertical: 12,
      };
    }

    // Large tablets / desktop widths
    return {
      width: Math.min(960, Math.round(w * 0.6)),
      borderRadius: 56,
      paddingHorizontal: 28,
      paddingVertical: 14,
    };
  };

  const floatingLayout = getFloatingCardLayout(windowWidth);
  // Guarded entrance animation: use Reanimated worklets when available,
  // otherwise fallback to RN Animated (already implemented above).
  let ReanimatedModule: any = null;
  let AnimatedRe: any = null;
  let canUseReanimated = false;
  try {
    // dynamic require so bundlers don't fail in environments without the native runtime
    // @ts-ignore
    ReanimatedModule = require("react-native-reanimated");
    // prefer default export if present
    AnimatedRe = ReanimatedModule.default || ReanimatedModule;
    canUseReanimated = !!(
      ReanimatedModule &&
      typeof ReanimatedModule.useSharedValue === "function" &&
      typeof ReanimatedModule.useAnimatedStyle === "function" &&
      typeof ReanimatedModule.withTiming === "function"
    );
  } catch {}

  // fallback Animated values so the existing Animated.View path works
  const fallbackEntranceTranslate = useRef(new Animated.Value(12)).current;
  const fallbackEntranceOpacity = useRef(new Animated.Value(0)).current;

  // Reanimated shared values and animated style (only created when available)
  const rTranslate = canUseReanimated
    ? ReanimatedModule.useSharedValue(12)
    : null;
  const rOpacity = canUseReanimated
    ? ReanimatedModule.useSharedValue(0)
    : null;

  const rStyle = canUseReanimated
    ? ReanimatedModule.useAnimatedStyle(() => ({
        opacity: rOpacity.value,
        transform: [{ translateY: rTranslate.value }],
      }))
    : null;

  useEffect(() => {
    if (canUseReanimated && rTranslate && rOpacity) {
      try {
        rTranslate.value = ReanimatedModule.withTiming(0, { duration: 420 });
        rOpacity.value = ReanimatedModule.withTiming(1, { duration: 360 });
        fallbackEntranceTranslate.setValue(0);
        fallbackEntranceOpacity.setValue(1);
      } catch {}
      return;
    }

    // Fallback RN Animated path (existing behavior)
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
  }, []);

  // animated wrapper component for Reanimated if available
  const AnimatedReView = canUseReanimated ? (AnimatedRe && (AnimatedRe.View || AnimatedRe)) : null;

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
  const needsLocationPrompt = !hasPreciseCoords;

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
      setManualLocationModalVisible(false);
      await refreshProfile();
      await refreshMatches();
    }
    setIsSavingLocation(false);
  };

  const openManualLocationModal = useCallback(() => {
    setLocationError(null);
    setFiltersVisible(false);
    setTimeout(() => {
      setManualLocationModalVisible(true);
    }, 150);
  }, []);

  const handleApplyFilters = () => {
    setFiltersVisible(false);
    applyFilters({
      verifiedOnly,
      distanceFilterKm,
      minAge,
      maxAge,
      religionFilter,
      locationQuery,
    });
    void refreshMatches();
    setCurrentIndex(0);
  };

  const setAgeValue = (val: string, type: 'min' | 'max') => {
    const num = Number(val.replace(/[^0-9]/g, ''));
    if (Number.isNaN(num)) return;
    if (type === 'min') setMinAge(num);
    else setMaxAge(num);
  };

  // Reset index if data changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [matchList.length, activeTab]);

  // Prefetch optional fields for the next N cards to improve perceived speed
  useEffect(() => {
    const N = 2;
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
      } catch (e) {
        // ignore prefetch errors
      }
    })();
    return () => { mounted = false; };
  }, [currentIndex, matchList, fetchProfileDetails]);

  const exhausted = currentIndex >= matchList.length;

  function NoMoreProfiles() {
    if (canUseReanimated && ReanimatedModule && AnimatedReView) {
      const noMoreTranslate = ReanimatedModule.useSharedValue(18);
      const noMoreOpacity = ReanimatedModule.useSharedValue(0);

      useEffect(() => {
        try {
          noMoreTranslate.value = ReanimatedModule.withTiming(0, { duration: 420 });
          noMoreOpacity.value = ReanimatedModule.withTiming(1, { duration: 360 });
        } catch {}
      }, []);

      const noMoreStyle = ReanimatedModule.useAnimatedStyle(() => ({
        opacity: noMoreOpacity.value,
        transform: [{ translateY: noMoreTranslate.value }],
      }));

      return (
        // @ts-ignore - conditional AnimatedReView
        <AnimatedReView style={noMoreStyle}>
          <View style={styles.emptyStateContainer}>
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
          </View>
        </AnimatedReView>
      );
    }

    // fallback Animated entrance
    const noMoreTranslate = useRef(new Animated.Value(18)).current;
    const noMoreOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(noMoreTranslate, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(noMoreOpacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, []);

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
        } catch (e) {
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


          {/* CARD STACK */}
          <View style={styles.stackWrapper}>
            {!exhausted ? (
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
          onRequestClose={() => setFiltersVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Filters</Text>
                <Text style={styles.modalSubtitle}>Refine your vibes.</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
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
                    <Text style={styles.filterLabel}>Distance</Text>
                    <Text style={styles.filterHint}>Nearby tab only</Text>
                    <View style={styles.filterChipsRow}>
                      {distanceChipOptions.map((option) => (
                        <TouchableOpacity
                          key={option.label}
                          style={[styles.filterChip, distanceFilterKm === option.km && styles.filterChipActive]}
                          onPress={() => setDistanceFilterKm(option.km)}
                        >
                          <Text style={[styles.filterChipText, distanceFilterKm === option.km && styles.filterChipTextActive]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.filterChip, distanceFilterKm == null && styles.filterChipActive]}
                        onPress={() => setDistanceFilterKm(null)}
                      >
                        <Text style={[styles.filterChipText, distanceFilterKm == null && styles.filterChipTextActive]}>Any</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Age range</Text>
                    <View style={styles.filterInputsRow}>
                      <View style={[styles.filterInputWrapper, { marginRight: 8 }]}>
                        <Text style={styles.filterHint}>Min</Text>
                        <TextInput
                          style={styles.filterInput}
                          keyboardType="numeric"
                          value={String(minAge)}
                          onChangeText={(t) => setAgeValue(t, 'min')}
                        />
                      </View>
                      <View style={styles.filterInputWrapper}>
                        <Text style={styles.filterHint}>Max</Text>
                        <TextInput
                          style={styles.filterInput}
                          keyboardType="numeric"
                          value={String(maxAge)}
                          onChangeText={(t) => setAgeValue(t, 'max')}
                        />
                      </View>
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

                  <View style={styles.modalActions}>
                    <TouchableOpacity style={[styles.locationButton, styles.locationGhost, { flex: 1 }]} onPress={() => setFiltersVisible(false)}>
                      <Text style={styles.locationGhostText}>Close</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.locationButton, styles.locationPrimary, { flex: 1 }]} onPress={handleApplyFilters}>
                      <Text style={styles.locationPrimaryText}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
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
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { router } = require('expo-router');
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
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 6 },
    modalSubtitle: { fontSize: 13, color: theme.textMuted, marginBottom: 14 },
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
    modalActions: { flexDirection: 'row', marginTop: 16 },
    filterSection: { marginTop: 12, marginBottom: 10 },
    filterLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
    filterHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    filterChipsRow: { flexDirection: 'row', marginTop: 8 },
    filterChipsRowWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: outline, marginRight: 8, backgroundColor: chipBg },
    filterChipActive: { backgroundColor: theme.tint, borderColor: theme.tint },
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
  });
}
