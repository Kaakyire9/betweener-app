import ExploreHeader from "@/components/ExploreHeader";
import type { ExploreStackHandle } from "@/components/ExploreStack.reanimated";
import ExploreStack from "@/components/ExploreStack.reanimated";
import MatchModal from '@/components/MatchModal';
import MomentCreateModal from '@/components/MomentCreateModal';
import MomentViewer from '@/components/MomentViewer';
import ProfileVideoModal from '@/components/ProfileVideoModal';
import { useAppFonts } from "@/constants/fonts";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import useAIRecommendations from "@/hooks/useAIRecommendations";
import { requestAndSavePreciseLocation, saveManualCityLocation } from "@/hooks/useLocationPreference";
import { useMoments, type MomentUser } from '@/hooks/useMoments';
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe, { isLinearGradientAvailable } from "@/components/NativeWrappers/LinearGradientSafe";
import { useFocusEffect } from "@react-navigation/native";
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, DeviceEventEmitter, Easing, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const DISTANCE_UNIT_KEY = 'distance_unit';
const DISTANCE_UNIT_EVENT = 'distance_unit_changed';
const KM_PER_MILE = 1.60934;
const MOMENTS_HEIGHT = 68;
const MOMENTS_COLLAPSE_START = 24;
const MOMENTS_COLLAPSE_END = 110;
const MOMENTS_MAX_USERS = 20;

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

type CompactMomentsStripProps = {
  users: MomentUser[];
  hasMyActiveMoment: boolean;
  showEmptyState: boolean;
  scrollY: Animated.Value;
  showLabels?: boolean;
  theme: typeof Colors.light;
  isDark: boolean;
  styles: ReturnType<typeof createStyles>;
  gradientColors: string[];
  onPressMyMoment: () => void;
  onPressUserMoment: (userId: string) => void;
  onPressSeeAll: () => void;
};

function CompactMomentsStrip({
  users,
  hasMyActiveMoment,
  showEmptyState,
  scrollY,
  showLabels = false,
  theme,
  isDark,
  styles,
  gradientColors,
  onPressMyMoment,
  onPressUserMoment,
  onPressSeeAll,
}: CompactMomentsStripProps) {
  const height = scrollY.interpolate({
    inputRange: [0, MOMENTS_COLLAPSE_START, MOMENTS_COLLAPSE_END],
    outputRange: [MOMENTS_HEIGHT, MOMENTS_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  const opacity = scrollY.interpolate({
    inputRange: [0, MOMENTS_COLLAPSE_START, MOMENTS_COLLAPSE_END],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const translateY = scrollY.interpolate({
    inputRange: [0, MOMENTS_COLLAPSE_START, MOMENTS_COLLAPSE_END],
    outputRange: [0, 0, -10],
    extrapolate: 'clamp',
  });

  const renderItem = ({ item }: { item: MomentUser }) => {
    const label = item.isOwn ? 'Your Moment' : item.name;
    const hasMoment = item.moments.length > 0;
    const showPlus = item.isOwn && !hasMoment;
    const initial = label ? label[0]?.toUpperCase() : 'M';

    return (
      <TouchableOpacity
        style={styles.momentsAvatarItem}
        activeOpacity={0.85}
        onPress={() => (item.isOwn ? onPressMyMoment() : onPressUserMoment(item.userId))}
      >
        <View style={[styles.momentsAvatarOuter, hasMoment && styles.momentsAvatarActive]}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.momentsAvatarImage} />
          ) : (
            <View style={styles.momentsAvatarPlaceholder}>
              <Text style={styles.momentsAvatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
        {showPlus ? (
          <View style={styles.momentsPlusBadge}>
            <MaterialCommunityIcons name="plus" size={12} color="#fff" />
          </View>
        ) : null}
        {showLabels ? (
          <Text style={styles.momentsAvatarLabel} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const myUser = users.find((u) => u.isOwn);

  return (
    <Animated.View style={[styles.momentsStripContainer, { height, opacity, transform: [{ translateY }] }]} pointerEvents="box-none">
      <View style={styles.momentsStripInner}>
        {showEmptyState ? (
          <View>
            <View style={styles.momentsInlineRow}>
              <Text style={styles.momentsStripTitle}>Moments</Text>
              <View style={styles.momentsInlineList}>
                {myUser ? (
                  <TouchableOpacity style={styles.momentsAvatarItem} activeOpacity={0.85} onPress={onPressMyMoment}>
                    <View style={styles.momentsAvatarOuter}>
                      {myUser.avatarUrl ? (
                        <Image source={{ uri: myUser.avatarUrl }} style={styles.momentsAvatarImage} />
                      ) : (
                        <View style={styles.momentsAvatarPlaceholder}>
                          <Text style={styles.momentsAvatarInitial}>Y</Text>
                        </View>
                      )}
                    </View>
                    {!hasMyActiveMoment ? (
                      <View style={styles.momentsPlusBadge}>
                        <MaterialCommunityIcons name="plus" size={12} color="#fff" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.momentsEmptyInlineCopy} numberOfLines={1}>
                Post a Moment
              </Text>
              <TouchableOpacity onPress={onPressSeeAll} activeOpacity={0.85} style={styles.momentsSeeAllPill}>
                <MaterialCommunityIcons name="send" size={14} color={theme.tint} style={{ marginRight: 6 }} />
                <Text style={styles.momentsStripSeeAll}>See all</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.momentsInlineRow}>
            <Text style={styles.momentsStripTitle}>Moments</Text>
            <View style={styles.momentsInlineList}>
              <FlatList
                data={users}
                keyExtractor={(item) => item.userId}
                renderItem={renderItem}
                horizontal
                showsHorizontalScrollIndicator={false}
                initialNumToRender={8}
                windowSize={5}
                maxToRenderPerBatch={8}
                removeClippedSubviews
                contentContainerStyle={styles.momentsListInlineContent}
              />
              {users.length > 6 ? (
                <LinearGradientSafe
                  colors={gradientColors}
                  start={[0, 0]}
                  end={[1, 0]}
                  style={styles.momentsRightFade}
                />
              ) : null}
            </View>
            <TouchableOpacity onPress={onPressSeeAll} activeOpacity={0.85} style={styles.momentsSeeAllPill}>
              <MaterialCommunityIcons name="send" size={14} color={theme.tint} style={{ marginRight: 6 }} />
              <Text style={styles.momentsStripSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const fontsLoaded = useAppFonts();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const momentsFade = useMemo(
    () => (isDark ? ['rgba(11,18,32,0)', 'rgba(11,18,32,1)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,1)']),
    [isDark]
  );
  const { profile, user, refreshProfile } = useAuth();
  const profileCountryCode = (profile as any)?.current_country_code as string | undefined;

  // For QA/dev: deterministic mutual-match list — replace with IDs you want to test
  const QA_MUTUAL_IDS = typeof __DEV__ !== 'undefined' && __DEV__ ? ['m-001'] : undefined;


  // celebration modal state


  const [activeTab, setActiveTab] = useState<
    "recommended" | "nearby" | "active"
  >("recommended");
  const [activeWindowMinutes, setActiveWindowMinutes] = useState(15);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('auto');
  const mode = activeTab === 'nearby' ? 'nearby' : activeTab === 'active' ? 'active' : 'forYou';
  const { matches, recordSwipe, undoLastSwipe, refreshMatches, smartCount, lastMutualMatch, fetchProfileDetails } =
    useAIRecommendations(profile?.id, { mutualMatchTestIds: QA_MUTUAL_IDS, mode, activeWindowMinutes, distanceUnit });

  const [celebrationMatch, setCelebrationMatch] = useState<any | null>(null);
  const { momentUsers, refresh: refreshMoments } = useMoments({
    currentUserId: user?.id,
    currentUserProfile: profile,
  });
  const [momentViewerVisible, setMomentViewerVisible] = useState(false);
  const [momentCreateVisible, setMomentCreateVisible] = useState(false);
  const [momentStartUserId, setMomentStartUserId] = useState<string | null>(null);

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

  // Use real server-provided matches by default. Fallback to mocks only
  // when the server couldn't provide any profiles. Apply client-side filters (e.g., verified).
  const parseDistanceKm = (d?: string | null) => {
    if (!d) return null;
    const lower = d.toLowerCase();
    if (/<\s*1\s*(km|mi|mile|miles)\b/.test(lower)) {
      return /<\s*1\s*(mi|mile|miles)\b/.test(lower) ? KM_PER_MILE : 1;
    }
    const kmMatch = lower.match(/([\d.]+)\s*km\b/);
    if (kmMatch) return Number(kmMatch[1]);
    const miMatch = lower.match(/([\d.]+)\s*(mi|mile|miles)\b/);
    if (miMatch) return Number(miMatch[1]) * KM_PER_MILE;
    const mMatch = lower.match(/([\d.]+)\s*m\b/);
    if (mMatch) return Number(mMatch[1]) / 1000;
    return null;
  };

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
    matches.forEach((m) => {
      if ((m as any).religion) set.add(String((m as any).religion));
    });
    set.add('Muslim'); // ensure common option is always available
    return Array.from(set).slice(0, 8);
  }, [matches]);

  const matchList = useMemo(() => {
    let list = matches;
    if (verifiedOnly) list = list.filter((m) => m.verified);
    if (distanceFilterKm != null) {
      list = list.filter((m) => {
        const km = parseDistanceKm((m as any).distance);
        if (km == null) return false;
        return km <= distanceFilterKm;
      });
    }
    if (minAge || maxAge) {
      list = list.filter((m) => {
        const age = (m as any).age;
        if (age == null) return true;
        return age >= (minAge || 0) && age <= (maxAge || 200);
      });
    }
    if (religionFilter) {
      list = list.filter((m) => String((m as any).religion || '').toLowerCase() === religionFilter.toLowerCase());
    }
    if (locationQuery.trim()) {
      const q = locationQuery.trim().toLowerCase();
      list = list.filter((m) => {
        const loc = String((m as any).location || (m as any).region || '').toLowerCase();
        return loc.includes(q);
      });
    }
    return list;
  }, [matches, verifiedOnly, distanceFilterKm, minAge, maxAge, religionFilter, locationQuery]);

  const myMomentUser = useMemo(() => momentUsers.find((u) => u.isOwn), [momentUsers]);
  const otherMomentUsers = useMemo(
    () => momentUsers.filter((u) => !u.isOwn && u.moments.length > 0).slice(0, MOMENTS_MAX_USERS),
    [momentUsers]
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

  const handlePressMyMoment = useCallback(() => {
    if (hasMyActiveMoment && myMomentUser?.userId) {
      openMomentViewer(myMomentUser.userId);
      return;
    }
    setMomentCreateVisible(true);
  }, [hasMyActiveMoment, myMomentUser?.userId]);

  const handlePressUserMoment = useCallback(
    (userId: string) => {
      openMomentViewer(userId);
    },
    []
  );
  const handleMomentsPress = () => {
    router.push('/moments');
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
              <Text style={styles.emptyTitle}>You’re all caught up</Text>
              <Text style={styles.emptySubtitle}>No new profiles right now — check back later or refresh for a new set.</Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity
                  style={[styles.primaryButton]}
                  onPress={() => {
                    void refreshMatches();
                    setCurrentIndex(0);
                  }}
                >
                  <Text style={styles.primaryButtonText}>Refresh</Text>
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
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptySubtitle}>No new profiles right now — check back later or refresh for a new set.</Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity
              style={[styles.primaryButton]}
              onPress={() => {
                void refreshMatches();
                setCurrentIndex(0);
              }}
            >
              <Text style={styles.primaryButtonText}>Refresh</Text>
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

  if (!fontsLoaded)
    return <SafeAreaView style={styles.container} />;

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
            compatibility: (m as any).aiScore ?? (m as any).compatibility ?? 85,
            verified: (m as any).verified,
            aiScore: (m as any).aiScore,
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
    <View style={styles.superlikeBadgeInline}>
      <MaterialCommunityIcons name="star" size={14} color="#fff" style={{ marginRight: 6 }} />
      <Text style={styles.superlikeBadgeInlineText}>{superlikesLeft} left</Text>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        {/* TOP HEADER */}
        <ExploreHeader
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
        />

        <Animated.ScrollView
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 180, 180) },
          ]}
        >
          {user?.id ? (
            <CompactMomentsStrip
              users={momentStripUsers}
              hasMyActiveMoment={hasMyActiveMoment}
              showEmptyState={showMomentsEmptyState}
              scrollY={scrollY}
              theme={theme}
              isDark={isDark}
              styles={styles}
              gradientColors={momentsFade}
              onPressMyMoment={handlePressMyMoment}
              onPressUserMoment={handlePressUserMoment}
              onPressSeeAll={handleMomentsPress}
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
                    const updated = await fetchProfileDetails?.(id);
                    const effective = updated ?? matchList.find((x) => String(x.id) === String(id));
                    if (effective && (effective as any).profileVideo) {
                      setPreviewingId(String(id));
                      setVideoModalUrl((effective as any).profileVideo as string);
                      setVideoModalVisible(true);
                      return;
                    }
                    // fallback: open profile view if no video
                    router.push({ pathname: '/profile-view', params: { profileId: String(id) } });
                  } catch (e) {
                    console.log('onPlayPress failed', e);
                  }
                }}
                previewingId={previewingId ?? undefined}
              />
            ) : (
              <NoMoreProfiles />
            )}
          </View>
        </Animated.ScrollView>

        {/* ACTION BUTTONS (floating card above tabs; safe-area aware) */}
        <View style={[styles.actionButtons, { bottom: Math.max(Math.max(insets.bottom, 6) - ACTION_BOTTOM_NUDGE, 0) }]} pointerEvents="box-none">
            {/* Animated wrapper provides a subtle slide+fade entrance */}
            {canUseReanimated && AnimatedReView && !exhausted ? (
              // Reanimated worklet-driven entrance
              // @ts-ignore
              <AnimatedReView style={[{ width: floatingLayout.width }, rStyle]} pointerEvents="box-none">
                <BlurViewSafe
                  intensity={60}
                  tint={isDark ? 'dark' : 'light'}
                  style={[
                    styles.actionFloatingCard,
                    {
                      width: floatingLayout.width,
                      borderRadius: floatingLayout.borderRadius,
                      paddingHorizontal: floatingLayout.paddingHorizontal,
                      paddingVertical: floatingLayout.paddingVertical,
                    },
                  ]}
                  pointerEvents="box-none"
                >
                  {renderSuperlikeBadge()}
                    <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                      <TouchableOpacity
                        style={styles.rejectRing}
                        onPress={() => animateButtonPress(onReject)}
                        activeOpacity={0.9}
                      >
                        <LinearGradientSafe
                          colors={['#fecaca', '#ef4444', '#b91c1c']}
                          start={[0, 0]}
                          end={[1, 1]}
                          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
                        />
                        <View style={styles.rejectButton}>
                          <MaterialCommunityIcons name="close" size={28} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>

                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={styles.infoButton}
                      onPress={() => {
                        const cm = matchList[currentIndex];
                        if (cm) {
                          router.push({ pathname: '/profile-view', params: { profileId: String(cm.id) } });
                        }
                      }}
                    >
                      <MaterialCommunityIcons
                        name="information"
                        size={24}
                        color={theme.tint}
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Rewind button */}
                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <TouchableOpacity
                      style={[styles.infoButton, { marginHorizontal: 4 }]}
                      onPress={() => {
                        animateButtonPress(() => {
                          try {
                            const restored = undoLastSwipe();
                            if (!restored) {
                              try { Haptics.selectionAsync(); } catch {}
                              return;
                            }
                            // move to the restored index and trigger the stack reveal
                            setCurrentIndex(restored.index);
                            // slight delay to ensure stack has rendered the restored card
                            setTimeout(() => {
                              try { stackRef.current?.rewind(); } catch {}
                            }, 60);
                          } catch (e) {
                            try { Haptics.selectionAsync(); } catch {}
                          }
                        });
                      }}
                      activeOpacity={0.9}
                    >
                      <MaterialCommunityIcons
                        name="rewind"
                        size={22}
                        color={theme.tint}
                      />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Superlike button */}
                  <Animated.View style={{ alignItems: 'center', marginHorizontal: 4 }}>
                    <Animated.View
                      style={{
                          position: 'absolute',
                          width: 76,
                          height: 76,
                          borderRadius: 38,
                        backgroundColor: 'rgba(59,130,246,0.14)',
                        opacity: superlikePulse,
                        transform: [{ scale: superlikePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                      }}
                    />
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => animateButtonPress(onSuperlike)}
                      >
                        <LinearGradientSafe
                          colors={["#f59e0b", "#fbbf24"]}
                          start={[0, 0]}
                          end={[1, 1]}
                          style={[styles.superlikeButton, !isLinearGradientAvailable && styles.superlikeFallback]}
                        >
                            <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                              <MaterialCommunityIcons
                                name="star"
                                size={32}
                                color="rgba(0,0,0,0.18)"
                                style={{ position: 'absolute' }}
                              />
                              <MaterialCommunityIcons name="star" size={28} color="#fff" />
                            </View>
                          <View style={styles.superlikeBadge} pointerEvents="none">
                            <Animated.Text style={styles.superlikeBadgeText}>{superlikesLeft}</Animated.Text>
                          </View>
                        </LinearGradientSafe>
                      </TouchableOpacity>
                      {/* particle/confetti render */}
                      {particles.map((p, idx) => (
                        <Animated.View
                          key={`sp-${idx}`}
                          style={{
                            position: 'absolute',
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: idx === 0 ? '#f59e0b' : idx === 1 ? '#60a5fa' : '#93c5fd',
                            transform: [
                              { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -48 - idx * 8] }) },
                              { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, (idx - 1) * 18] }) },
                              { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) },
                            ],
                            opacity: p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 0] }),
                          }}
                        />
                      ))}
                  </Animated.View>

                    <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                      <TouchableOpacity
                        style={styles.likeRing}
                        onPress={() => animateButtonPress(onLike)}
                        activeOpacity={0.9}
                      >
                        <LinearGradientSafe
                          colors={['#bbf7d0', '#10b981', '#047857']}
                          start={[0, 0]}
                          end={[1, 1]}
                          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
                        />
                        <View style={styles.likeButton}>
                          <MaterialCommunityIcons name="heart" size={28} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                </BlurViewSafe>
              </AnimatedReView>
            ) : (
              // Fallback Animated entrance
              <Animated.View
                style={{
                  width: floatingLayout.width,
                  opacity: fallbackEntranceOpacity,
                  transform: [{ translateY: fallbackEntranceTranslate }],
                }}
                pointerEvents="box-none"
              >
                <BlurViewSafe
                  intensity={60}
                  tint={isDark ? 'dark' : 'light'}
                  style={[
                    styles.actionFloatingCard,
                    {
                      width: floatingLayout.width,
                      borderRadius: floatingLayout.borderRadius,
                      paddingHorizontal: floatingLayout.paddingHorizontal,
                      paddingVertical: floatingLayout.paddingVertical,
                    },
                  ]}
                  pointerEvents="box-none"
                >
                  {renderSuperlikeBadge()}
                    <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                      <TouchableOpacity
                        style={styles.rejectRing}
                        onPress={() => animateButtonPress(onReject)}
                        activeOpacity={0.9}
                      >
                        <LinearGradientSafe
                          colors={['#fecaca', '#ef4444', '#b91c1c']}
                          start={[0, 0]}
                          end={[1, 1]}
                          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
                        />
                        <View style={styles.rejectButton}>
                          <MaterialCommunityIcons name="close" size={28} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>

                  <TouchableOpacity
                    style={styles.infoButton}
                    onPress={() => {
                      const cm = matchList[currentIndex];
                      if (cm) {
                        router.push({ pathname: '/profile-view', params: { profileId: String(cm.id) } });
                      }
                    }}
                  >
                    <MaterialCommunityIcons
                      name="information"
                      size={24}
                      color={theme.tint}
                    />
                  </TouchableOpacity>

                  {/* Superlike button (fallback branch) */}
                  <Animated.View style={{ alignItems: 'center', marginHorizontal: 4 }}>
                    <Animated.View
                      style={{
                          position: 'absolute',
                          width: 76,
                          height: 76,
                          borderRadius: 38,
                        backgroundColor: 'rgba(59,130,246,0.14)',
                        opacity: superlikePulse,
                        transform: [{ scale: superlikePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                      }}
                    />
                    <TouchableOpacity
                      style={[styles.superlikeButton, !isLinearGradientAvailable && styles.superlikeFallback]}
                      onPress={() => animateButtonPress(onSuperlike)}
                      activeOpacity={0.9}
                    >
                        <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons
                            name="star"
                            size={32}
                            color="rgba(0,0,0,0.18)"
                            style={{ position: 'absolute' }}
                          />
                          <MaterialCommunityIcons name="star" size={28} color="#fff" />
                        </View>
                    </TouchableOpacity>
                  </Animated.View>

                    <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                      <TouchableOpacity
                        style={styles.likeRing}
                        onPress={() => animateButtonPress(onLike)}
                        activeOpacity={0.9}
                      >
                        <LinearGradientSafe
                          colors={['#bbf7d0', '#10b981', '#047857']}
                          start={[0, 0]}
                          end={[1, 1]}
                          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
                        />
                        <View style={styles.likeButton}>
                          <MaterialCommunityIcons name="heart" size={28} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                </BlurViewSafe>
              </Animated.View>
            )}
        </View>

        {/* Manual city entry modal */}
          <Modal
            visible={manualLocationModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setManualLocationModalVisible(false)}
          >
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 24 : 24}
            >
              <View style={styles.modalBackdrop}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setManualLocationModalVisible(false)} />
                <View style={styles.modalCard}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: Math.max(12, insets.bottom + 24) }}
                  >
                    <Text style={styles.modalTitle}>Set your city</Text>
                    <Text style={styles.modalSubtitle}>We'll use this for distance until you enable precise location.</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="e.g., Kumasi"
                      value={manualLocation}
                      onChangeText={setManualLocation}
                    />
                    <Text style={styles.modalLabel}>Country</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryChips}>
                      {COUNTRY_OPTIONS.map((item) => {
                        const selected = manualCountryCode === item.code;
                        return (
                          <TouchableOpacity
                            key={item.code}
                            style={[styles.countryChip, selected && styles.countryChipActive]}
                            onPress={() => {
                              setManualCountryCode(item.code);
                              setLocationError(null);
                            }}
                          >
                            <Text style={[styles.countryChipText, selected && styles.countryChipTextActive]}>
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={[styles.locationButton, styles.locationGhost, { flex: 1 }]}
                        onPress={() => {
                          setManualLocationModalVisible(false);
                          setLocationError(null);
                        }}
                        disabled={isSavingLocation}
                      >
                        <Text style={styles.locationGhostText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.locationButton, styles.locationPrimary, { flex: 1 }]}
                        onPress={handleSaveManualLocation}
                        disabled={isSavingLocation}
                      >
                        <Text style={styles.locationPrimaryText}>{isSavingLocation ? 'Saving...' : 'Save'}</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Filters modal */}
          <Modal
            visible={filtersVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setFiltersVisible(false)}
          >
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 24 : 0}
            >
              <View style={styles.modalBackdrop}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFiltersVisible(false)} />
                <View style={styles.modalCard}>
                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
                    <Text style={styles.modalTitle}>Filters</Text>
                    <Text style={styles.modalSubtitle}>Refine recommendations quickly.</Text>

                    <View style={styles.filterSection}>
                      <Text style={styles.filterLabel}>Active window</Text>
                      <Text style={styles.filterHint}>Only applies to Active tab</Text>
                      <View style={styles.filterChipsRow}>
                        {[15, 30, 60].map((m) => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.filterChip, activeWindowMinutes === m && styles.filterChipActive]}
                            onPress={() => setActiveWindowMinutes(m)}
                          >
                            <Text style={[styles.filterChipText, activeWindowMinutes === m && styles.filterChipTextActive]}>{m}m</Text>
                          </TouchableOpacity>
                        ))}
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
                    <View style={[styles.locationActions, { marginTop: 10 }]}>
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
                        <Text style={styles.locationGhostText}>{hasCityOnly ? 'Edit city' : 'Enter city'}</Text>
                      </TouchableOpacity>
                    </View>
                    {locationError ? <Text style={[styles.locationError, { marginTop: 8 }]}>{locationError}</Text> : null}
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
  const overlayCard = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.78)';
  const overlayBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)';
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
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 24,
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
      backgroundColor: "#ef4444",
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.4)',
      shadowColor: '#ef4444',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
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
      backgroundColor: "#10b981",
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.4)',
      shadowColor: '#10b981',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.26,
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
      borderColor: 'rgba(255,255,255,0.4)',
      shadowColor: '#f59e0b',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.26,
      shadowRadius: 12,
      elevation: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    superlikeFallback: {
      backgroundColor: '#f59e0b',
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
      top: -26,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: badgeBg,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      zIndex: 12000,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    superlikeBadgeInlineText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  });
}
