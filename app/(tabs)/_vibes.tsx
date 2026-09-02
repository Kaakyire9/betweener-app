import ExploreHeader from "@/components/ExploreHeader";
import { OnboardingArrivalCelebration } from "@/components/onboarding/OnboardingArrivalCelebration";
import type { ExploreStackHandle } from "@/components/ExploreStack.reanimated";
import ExploreStack from "@/components/ExploreStack.reanimated";
import MatchModal from '@/components/MatchModal';
import MomentViewer from '@/components/MomentViewer';
import PremiumUpsellModal from '@/components/premium/PremiumUpsellModal';
import ProfileVideoModal from '@/components/ProfileVideoModal';
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { markInboxItemsReadByCriteria, useInbox } from "@/hooks/useInbox";
import { requestAndSavePreciseLocation, saveManualCityLocation } from "@/hooks/useLocationPreference";
import { GlobalCityField } from "@/components/onboarding/steps/GlobalCityField";
import type { GlobalLocalitySuggestion } from "@/lib/location/global-locality-shared";
import { useMoments, type MomentUser } from '@/hooks/useMoments';
import { usePremiumState } from "@/hooks/use-premium-state";
import { useResolvedProfileId } from "@/hooks/useResolvedProfileId";
import useSignalAccess from "@/hooks/useSignalAccess";
import useVibesFeed, { applyVibesFilters, type VibesFilters } from "@/hooks/useVibesFeed";
import { useAuth } from "@/lib/auth-context";
import { haptics } from "@/lib/haptics";
import { cancelIntentRequestOfflineSafe } from "@/lib/intents/offline-actions";
import { cacheOfflineVideo, getOfflineVideoUri } from "@/lib/offline/video-store";
import { subscribeToNetworkRestored } from "@/lib/network-recovery";
import { fetchViewedMomentIds } from "@/lib/moments-views";
import {
  readVibesMomentContextSnapshot,
  writeVibesMomentContextSnapshot,
} from "@/lib/offline/vibes-store";
import {
  getDefaultVibesPracticeSnapshot,
  readVibesPracticeSnapshot,
  writeVibesPracticeSnapshot,
  type VibesPracticeStep,
} from "@/lib/offline/vibes-practice-store";
import { showOpenSettingsPrompt } from "@/lib/permission-prompts";
import { recordProfileSignal } from '@/lib/profile-signals';
import { RELIGION_OPTIONS, formatReligionLabel, normalizeReligionForProfile } from "@/lib/profile/religion";
import { applyDefaults as applyCompassDefaults, mapToDiscoveryFilters } from "@/lib/relationship-compass";
import { supabase } from "@/lib/supabase";
import { logVibesEvent, type VibesEventType } from "@/lib/vibes/events";
import {
  enqueueVibesExposureClose,
  enqueueVibesExposureOpen,
  type VibesExposureOutcome,
} from '@/lib/vibes/telemetry-queue';
import {
  clearPremiumVibesFilters,
  deriveActivePresetKey,
  deriveCompatibilityHint,
  derivePreviewTone,
  deriveRoomSummary,
  resolveAutoUnit,
} from "@/lib/vibes/vibes-filter-preview";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import IntentRequestSheet from "@/components/IntentRequestSheet";
import SendSignalSheet from "@/components/signal/SendSignalSheet";
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Gem } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, DeviceEventEmitter, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import VibesAllMomentsModal from "@/components/vibes/VibesAllMomentsModal";
import FloatingMomentsCapsule from "@/components/vibes/moments/FloatingMomentsCapsule";
import MomentsHeaderRow from "@/components/vibes/moments/MomentsHeaderRow";
import useMomentsCapsuleMetrics from "@/components/vibes/moments/useMomentsCapsuleMetrics";
import VibesPracticeWalkthrough, { type PracticeEvent, type PracticeStep } from "@/components/vibes/VibesPracticeWalkthrough";
import DepthBackground from "@/components/vibes/depth/DepthBackground";
import VibesActionDock from "@/components/vibes/depth/VibesActionDock";
import useVibesResponsiveMetrics from "@/components/vibes/depth/useVibesResponsiveMetrics";
import Notice from "@/components/ui/Notice";
import { ExploreStackSkeleton } from "@/components/ui/Skeleton";
import { findCountryByCode, getPrioritizedCountries, type CountryOption } from "@/lib/location/countries";
import {
  getCountryPolicyMessage,
  shouldManageProfileCountry,
} from '@/lib/location/country-lock';
import { toFlagEmoji } from "@/lib/location/location-display";
import { isLikelyNetworkError } from "@/lib/network";
import { requestOpenProfileEdit } from "@/lib/profile/edit-handoff";
import { isGhanaianDiasporaProfile } from "@/lib/profile/onboarding-experience";
import { logger } from "@/lib/telemetry/logger";
import {
  formatAgePresetLabel,
  formatAgeRangeValue,
  getAgePresetSupportCopy,
  getAgeRangeForPreset,
  resolveAgePresetMode,
  type AgePresetMode,
} from "@/lib/vibes/age-range-presets";
import type { MomentRelationshipContext } from "@/types/moment-context";
import { getMomentsInboxActivityItems } from "@/lib/inbox/badge-groups";

const DISTANCE_UNIT_KEY = 'distance_unit';
const DISTANCE_UNIT_EVENT = 'distance_unit_changed';
const KM_PER_MILE = 1.60934;
const VIBES_FILTERS_KEY = 'vibes_filters_v2';
const VIBES_INTRO_SEEN_KEY = 'vibes_intro_seen_v1';
const VIBES_PRACTICE_COMPLETE_KEY = 'vibes_practice_complete_v1';
const VIBES_MOMENTS_COLLAPSED_KEY = 'vibes:momentsCollapsed';
const VIBES_LOCATION_PROMPT_DISMISSED_KEY = 'vibes:locationPromptDismissed:v1';
const VIBES_VIEWED_MOMENT_IDS_KEY_PREFIX = 'vibes:viewedMomentIds:v1:';
const VIBES_PRACTICE_VERSION = 1;
const MOMENT_INBOX_TYPES = ['MOMENT_REACTION', 'MOMENT_COMMENT', 'MOMENT_COMMENT_REACTION'] as const;

type DistanceUnit = 'auto' | 'km' | 'mi';
type PremiumUpsellState = {
  requiredPlan: 'SILVER' | 'GOLD';
  title: string;
  message: string;
};
type VibesIntentTarget = {
  id: string;
  name?: string | null;
  deckIndex?: number;
};
type VibesSignalTarget = VibesIntentTarget & {
  match?: any | null;
};
type VibesActionHistoryEntry =
  | { kind: 'swipe'; id: string; action: 'like' | 'dislike' | 'superlike'; index: number }
  | { kind: 'intent'; id: string; requestId: string | null; index: number }
  | { kind: 'signal'; id: string; signalId: string; index: number };

export default function ExploreScreen() {
  const { onboardingCelebration } = useLocalSearchParams<{ onboardingCelebration?: string }>();
  const [showOnboardingCelebration, setShowOnboardingCelebration] = useState(false);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const layoutMetrics = useVibesResponsiveMetrics();
  const vibesActionRailGap = layoutMetrics.device.compactHeight ? 18 : 24;

  useEffect(() => {
    if (onboardingCelebration !== "1") return;
    setShowOnboardingCelebration(true);
    router.setParams({ onboardingCelebration: undefined });
  }, [onboardingCelebration]);
  const vibesStackVisualReserve = layoutMetrics.device.compactHeight ? 18 : 22;
  const momentsCapsuleMetrics = useMomentsCapsuleMetrics();
  const { profile, user, refreshProfile, authRecoveryPending, usingPersistedSessionFallback } = useAuth();
  const showingRecoveredSnapshot = authRecoveryPending || usingPersistedSessionFallback;
  const { profileId: resolvedProfileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const isGhanaianDiaspora = isGhanaianDiasporaProfile(profile);
  const vibesSubtitle = isGhanaianDiaspora
    ? 'Ghanaian Diaspora Connections'
    : 'Where worlds apart feel closer';
  const { hasAccess } = usePremiumState();
  const { access: signalAccess, refresh: refreshSignalAccess } = useSignalAccess(Boolean(resolvedProfileId));
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
  const viewedMomentIdsStorageKey = useMemo(
    () => (user?.id ? `${VIBES_VIEWED_MOMENT_IDS_KEY_PREFIX}${user.id}` : null),
    [user?.id],
  );
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
  const savedMinAgePreference = useMemo(() => {
    const raw = Number((profile as any)?.min_age_interest);
    if (!Number.isFinite(raw)) return 18;
    return Math.max(18, Math.min(99, Math.round(raw)));
  }, [profile]);
  const savedMaxAgePreference = useMemo(() => {
    const raw = Number((profile as any)?.max_age_interest);
    if (!Number.isFinite(raw)) return 35;
    return Math.max(savedMinAgePreference, Math.min(99, Math.round(raw)));
  }, [profile, savedMinAgePreference]);
  const savedAgeRangeLabel = formatAgeRangeValue({
    min: savedMinAgePreference,
    max: savedMaxAgePreference,
  });
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
    userId: resolvedProfileId,
    snapshotOwnerIds: [resolvedProfileId, profile?.id, user?.id, (profile as any)?.user_id],
    segment: vibesSegment,
    activeWindowMinutes,
    distanceUnit,
    liveFetchEnabled: !showingRecoveredSnapshot,
    momentUserIds: momentBoostIds,
    viewerInterests,
    viewerGender: (profile as any)?.gender ?? null,
    viewerProfile: profile,
    relationshipCompass,
    initialFilters: {
      minAge: savedMinAgePreference,
      maxAge: savedMaxAgePreference,
    },
  });

  const [celebrationMatch, setCelebrationMatch] = useState<any | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const lastFeedErrorAtRef = useRef(0);
  const [momentViewerVisible, setMomentViewerVisible] = useState(false);
  const [momentStartUserId, setMomentStartUserId] = useState<string | null>(null);
  const [allMomentsVisible, setAllMomentsVisible] = useState(false);
  const [momentsCollapsed, setMomentsCollapsed] = useState(true);
  const [viewedMomentIds, setViewedMomentIds] = useState<Set<string>>(new Set());
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(false);
  const [momentPriorityProfileIds, setMomentPriorityProfileIds] = useState<Set<string>>(new Set());
  const [momentRelationshipContextByProfileId, setMomentRelationshipContextByProfileId] = useState<Record<string, MomentRelationshipContext>>({});
  const [intentSheetVisible, setIntentSheetVisible] = useState(false);
  const [intentTarget, setIntentTarget] = useState<VibesIntentTarget | null>(null);
  const [signalSheetVisible, setSignalSheetVisible] = useState(false);
  const [signalTarget, setSignalTarget] = useState<VibesSignalTarget | null>(null);
  const [intentQueueBadge, setIntentQueueBadge] = useState<{ waiting: number; endingSoon: number } | null>(null);
  // when the hook reports a mutual match, show the celebration modal
  useEffect(() => {
    if (lastMutualMatch) {
      setCelebrationMatch(lastMutualMatch);
      void haptics.success();
    }
  }, [lastMutualMatch]);

  const { items: inboxItems } = useInbox(user?.id ?? null);
  const momentAttentionProfileIds = useMemo(() => {
    const next = new Set<string>();
    getMomentsInboxActivityItems(inboxItems).forEach((item) => {
      if (typeof item.actor_id === "string" && item.actor_id.trim().length > 0) {
        next.add(item.actor_id.trim());
      }
    });
    return next;
  }, [inboxItems]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      void markInboxItemsReadByCriteria(user.id, {
        types: [...MOMENT_INBOX_TYPES],
        clearActionRequired: true,
      });
    }, [user?.id]),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const loadIntentQueueBadge = async () => {
        if (!resolvedProfileId) {
          setIntentQueueBadge(null);
          return;
        }
        const nowIso = new Date().toISOString();
        const [signalsResult, requestsResult] = await Promise.all([
          (supabase as any)
            .from('profile_signal_gestures')
            .select('id,expires_at')
            .eq('receiver_profile_id', resolvedProfileId)
            .in('status', ['sent', 'seen'])
            .gt('expires_at', nowIso)
            .limit(20),
          supabase
            .from('intent_requests')
            .select('id,expires_at')
            .eq('recipient_id', resolvedProfileId)
            .eq('status', 'pending')
            .gt('expires_at', nowIso)
            .limit(20),
        ]);
        if (cancelled || signalsResult.error || requestsResult.error) return;
        const rows = [
          ...(((signalsResult.data as { expires_at: string }[] | null) ?? []).filter(Boolean)),
          ...(((requestsResult.data as { expires_at: string }[] | null) ?? []).filter(Boolean)),
        ];
        const endingSoon = rows.filter((item) => {
          const ts = Date.parse(item.expires_at);
          if (Number.isNaN(ts)) return false;
          return (ts - Date.now()) / 3600000 <= 6;
        }).length;
        setIntentQueueBadge(rows.length > 0 ? { waiting: rows.length, endingSoon } : null);
      };
      void loadIntentQueueBadge();
      return () => {
        cancelled = true;
      };
    }, [resolvedProfileId]),
  );

  useEffect(() => {
    if (showingRecoveredSnapshot) {
      setOfflineNotice(null);
      return;
    }
    if (!matchesError) {
      setOfflineNotice(null);
      return;
    }
    // Only show a blocking notice when the feed is empty, so it doesn't get in the way
    // of swiping when data is already present.
    if (matchList.length === 0) {
      const now = Date.now();
      const networkLikeError = isLikelyNetworkError(matchesError);
      if (now - lastFeedErrorAtRef.current > 60_000) {
        lastFeedErrorAtRef.current = now;
        const ctx = {
          segment: vibesSegment,
          isLikelyNetwork: networkLikeError,
          hasUserId: !!profile?.id,
        };
        if (networkLikeError) {
          logger.warn("[vibes] feed_warning", {
            ...ctx,
            error: String((matchesError as any)?.message || matchesError || "unknown"),
          });
        } else {
          logger.error("[vibes] feed_error", matchesError, ctx);
        }
      }

      // Keep tester UX generic; detailed error goes to Sentry.
      setOfflineNotice("Check your connection and try again.");
      return;
    }
    setOfflineNotice(null);
  }, [matchList.length, matchesError, showingRecoveredSnapshot]);

  const resolvedDistanceUnit = useMemo(
    () => (distanceUnit === 'auto' ? resolveAutoUnit() : distanceUnit),
    [distanceUnit]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [vibesScreenFocused, setVibesScreenFocused] = useState(false);

  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [videoModalTitle, setVideoModalTitle] = useState<string | null>(null);
  const [videoModalSubtitle, setVideoModalSubtitle] = useState<string | null>(null);
  const [videoModalProfileId, setVideoModalProfileId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [manualLocationModalVisible, setManualLocationModalVisible] = useState(false);
  const [manualLocation, setManualLocation] = useState((profile as any)?.city || profile?.location || "");
  const [manualRegion, setManualRegion] = useState<string | null>((profile as any)?.region || null);
  const [manualLocality, setManualLocality] = useState<GlobalLocalitySuggestion | null>(null);
  const [manualCountryCode, setManualCountryCode] = useState(profileCountryCode || "");
  const [manualCountryPickerOpen, setManualCountryPickerOpen] = useState(false);
  const [manualCountrySearch, setManualCountrySearch] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [premiumUpsell, setPremiumUpsell] = useState<PremiumUpsellState | null>(null);
  const [reopenFiltersAfterUpsell, setReopenFiltersAfterUpsell] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filtersPanel, setFiltersPanel] = useState<'main' | 'location'>('main');
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [practiceLoaded, setPracticeLoaded] = useState(false);
  const [practiceComplete, setPracticeComplete] = useState(true);
  const [practiceReplayVisible, setPracticeReplayVisible] = useState(false);
  const [practiceDismissed, setPracticeDismissed] = useState(false);
  const [practiceStep, setPracticeStep] = useState<VibesPracticeStep>('intro');
  const [practiceGestureLocked, setPracticeGestureLocked] = useState(false);
  const [deckGestureLocked, setDeckGestureLocked] = useState(false);
  const showPracticeWalkthrough = practiceLoaded && ((!practiceComplete && !practiceDismissed) || practiceReplayVisible);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [hasVideoOnly, setHasVideoOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [distanceFilterKm, setDistanceFilterKm] = useState<number | null>(null);
  const [minAge, setMinAge] = useState<number>(savedMinAgePreference);
  const [maxAge, setMaxAge] = useState<number>(savedMaxAgePreference);
  const [religionFilter, setReligionFilter] = useState<string | null>(null);
  const [minVibeScore, setMinVibeScore] = useState<number | null>(null);
  const [minSharedInterests, setMinSharedInterests] = useState<number>(0);
  const [locationQuery, setLocationQuery] = useState<string>('');
  const scrollViewRef = useRef<any>(null);
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
  const baseDiscoveryFilters = useMemo<VibesFilters>(
    () => ({
      verifiedOnly: false,
      hasVideoOnly: false,
      activeOnly: false,
      distanceFilterKm: null,
      minAge: savedMinAgePreference,
      maxAge: savedMaxAgePreference,
      religionFilter: null,
      minVibeScore: null,
      minSharedInterests: 0,
      locationQuery: '',
    }),
    [savedMaxAgePreference, savedMinAgePreference],
  );
  const ageFilterBaseline = useMemo(
    () => ({
      minAge: baseDiscoveryFilters.minAge,
      maxAge: baseDiscoveryFilters.maxAge,
    }),
    [baseDiscoveryFilters.maxAge, baseDiscoveryFilters.minAge],
  );
  const agePresetModes = useMemo<Exclude<AgePresetMode, 'custom'>[]>(
    () => ['focused', 'balanced', 'open'],
    [],
  );
  const previousBaseAgeRef = useRef<{ minAge: number; maxAge: number }>({
    minAge: baseDiscoveryFilters.minAge,
    maxAge: baseDiscoveryFilters.maxAge,
  });
  const buildPersistedFiltersPayload = useCallback(
    (next: VibesFilters) => ({
      ...next,
      __baseMinAge: baseDiscoveryFilters.minAge,
      __baseMaxAge: baseDiscoveryFilters.maxAge,
    }),
    [baseDiscoveryFilters.maxAge, baseDiscoveryFilters.minAge],
  );
  const normalizePersistedFilters = useCallback(
    (parsed: any): VibesFilters => {
      const rawMinAge =
        typeof parsed?.minAge === 'number' ? parsed.minAge : baseDiscoveryFilters.minAge;
      const rawMaxAge =
        typeof parsed?.maxAge === 'number' ? parsed.maxAge : baseDiscoveryFilters.maxAge;
      const persistedBaseMinAge =
        typeof parsed?.__baseMinAge === 'number' ? parsed.__baseMinAge : null;
      const persistedBaseMaxAge =
        typeof parsed?.__baseMaxAge === 'number' ? parsed.__baseMaxAge : null;
      const matchesPersistedBase =
        persistedBaseMinAge != null &&
        persistedBaseMaxAge != null &&
        rawMinAge === persistedBaseMinAge &&
        rawMaxAge === persistedBaseMaxAge;
      const looksLikeLegacyDefault =
        persistedBaseMinAge == null &&
        persistedBaseMaxAge == null &&
        rawMinAge === 18 &&
        rawMaxAge === 60 &&
        (baseDiscoveryFilters.minAge !== 18 || baseDiscoveryFilters.maxAge !== 60);
      const shouldRebaseAge =
        (matchesPersistedBase &&
          (persistedBaseMinAge !== baseDiscoveryFilters.minAge ||
            persistedBaseMaxAge !== baseDiscoveryFilters.maxAge)) ||
        looksLikeLegacyDefault;

      return {
        ...baseDiscoveryFilters,
        verifiedOnly: Boolean(parsed?.verifiedOnly),
        hasVideoOnly: Boolean(parsed?.hasVideoOnly),
        activeOnly: Boolean(parsed?.activeOnly),
        distanceFilterKm:
          typeof parsed?.distanceFilterKm === 'number' ? parsed.distanceFilterKm : null,
        minAge: shouldRebaseAge ? baseDiscoveryFilters.minAge : rawMinAge,
        maxAge: shouldRebaseAge ? baseDiscoveryFilters.maxAge : rawMaxAge,
        religionFilter: typeof parsed?.religionFilter === 'string' ? parsed.religionFilter : null,
        minVibeScore: typeof parsed?.minVibeScore === 'number' ? parsed.minVibeScore : null,
        minSharedInterests:
          typeof parsed?.minSharedInterests === 'number' ? parsed.minSharedInterests : 0,
        locationQuery: typeof parsed?.locationQuery === 'string' ? parsed.locationQuery : '',
      };
    },
    [baseDiscoveryFilters],
  );
  const filtersLoadedKeyRef = useRef<string | null>(null);
  const introStorageKey = useMemo(
    () => (profile?.id ? `${VIBES_INTRO_SEEN_KEY}:${profile.id}` : user?.id ? `${VIBES_INTRO_SEEN_KEY}:auth:${user.id}` : null),
    [profile?.id, user?.id],
  );
  const selectedManualCountry = useMemo(
    () => findCountryByCode(manualCountryCode),
    [manualCountryCode],
  );
  const manualCountryOptions = useMemo(
    () => getPrioritizedCountries(manualCountrySearch),
    [manualCountrySearch],
  );
  const selectedManualCountryFlag = selectedManualCountry ? toFlagEmoji(selectedManualCountry.code) : '';
  const manualSelectedGeonameId = manualLocality?.geonameId ?? (
    manualLocation === (profile as any)?.city && manualCountryCode === profileCountryCode
      ? (profile as any)?.locality_geoname_id ?? null
      : null
  );
  const manualCityStyles = useMemo(() => ({
    citySection: { gap: 8, marginTop: 14 },
    fieldLabelRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    fieldLabel: { fontSize: 13, fontWeight: '700' as const, color: theme.text },
    optionalLabel: { fontSize: 11, fontWeight: '700' as const, color: theme.tint },
    input: styles.modalInput,
    inputError: { borderColor: '#C94C4C' },
    selectBox: styles.countrySelectButton,
    selectBoxSelected: { borderColor: theme.tint },
    selectValueWrap: { flex: 1, gap: 2 },
    selectText: { fontSize: 15, fontWeight: '700' as const, color: theme.text },
    selectPlaceholder: { color: theme.textMuted, fontWeight: '500' as const },
    selectMetaText: { fontSize: 12, color: theme.textMuted },
    helperText: { fontSize: 12, lineHeight: 17, color: theme.textMuted },
    subtleNote: { fontSize: 12, fontWeight: '700' as const },
    errorText: styles.locationError,
    tokens: { muted: { color: theme.textMuted }, accent: { color: theme.tint } },
  }), [styles, theme]);
  const practiceProfileId = useMemo(
    () => resolvedProfileId ?? profile?.id ?? null,
    [profile?.id, resolvedProfileId],
  );
  const practiceSnapshotOwnerId = useMemo(
    () => practiceProfileId ?? user?.id ?? null,
    [practiceProfileId, user?.id],
  );
  const backendPracticeCompletedVersion = useMemo(
    () => Number((profile as any)?.vibes_practice_completed_version ?? 0),
    [profile],
  );
  const backendPracticeCompletedAt = useMemo(
    () => (typeof (profile as any)?.vibes_practice_completed_at === 'string'
      ? String((profile as any)?.vibes_practice_completed_at)
      : null),
    [profile],
  );
  const legacyPracticeStorageKey = useMemo(
    () => (profile?.id ? `${VIBES_PRACTICE_COMPLETE_KEY}:${profile.id}` : user?.id ? `${VIBES_PRACTICE_COMPLETE_KEY}:auth:${user.id}` : null),
    [profile?.id, user?.id],
  );
  const scrollVibesToTop = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        scrollViewRef.current?.scrollTo?.({ y: 0, animated: true });
      } catch {}
    });
  }, []);

  const syncPracticeCompletionToBackend = useCallback(async (completedAtIso: string) => {
    if (!practiceProfileId) return false;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          vibes_practice_completed_at: completedAtIso,
          vibes_practice_completed_version: VIBES_PRACTICE_VERSION,
        } as any)
        .eq('id', practiceProfileId);
      return !error;
    } catch {
      return false;
    }
  }, [practiceProfileId]);

  const completePractice = useCallback(async () => {
    if (practiceReplayVisible) {
      setPracticeReplayVisible(false);
      setPracticeDismissed(false);
      setPracticeStep('intro');
      setPracticeGestureLocked(false);
      setDeckGestureLocked(false);
      scrollVibesToTop();
      return;
    }
    const completedAtIso = new Date().toISOString();
    setPracticeComplete(true);
    setPracticeDismissed(false);
    setPracticeStep('intentPrompt');
    setPracticeGestureLocked(false);
    setDeckGestureLocked(false);
    scrollVibesToTop();
    try {
      if (legacyPracticeStorageKey) await AsyncStorage.setItem(legacyPracticeStorageKey, '1');
      if (introStorageKey) await AsyncStorage.setItem(introStorageKey, '1');
    } catch {}
    if (practiceSnapshotOwnerId) {
      await writeVibesPracticeSnapshot(practiceSnapshotOwnerId, {
        completedAt: completedAtIso,
        completedVersion: VIBES_PRACTICE_VERSION,
        completionSyncPending: Boolean(practiceProfileId),
        currentStep: 'intro',
        updatedAt: completedAtIso,
      });
    }
    const synced = await syncPracticeCompletionToBackend(completedAtIso);
    if (synced && practiceSnapshotOwnerId) {
      await writeVibesPracticeSnapshot(practiceSnapshotOwnerId, {
        completedAt: completedAtIso,
        completedVersion: VIBES_PRACTICE_VERSION,
        completionSyncPending: false,
        currentStep: 'intro',
        updatedAt: completedAtIso,
      });
    }
  }, [introStorageKey, legacyPracticeStorageKey, practiceProfileId, practiceReplayVisible, practiceSnapshotOwnerId, scrollVibesToTop, syncPracticeCompletionToBackend]);

  useEffect(() => {
    let cancelled = false;
    setPracticeLoaded(false);

    if (!practiceSnapshotOwnerId) {
      setPracticeStep('intro');
      setPracticeComplete(true);
      setPracticeLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const localSnapshot = (await readVibesPracticeSnapshot(practiceSnapshotOwnerId)) ?? getDefaultVibesPracticeSnapshot();
        const legacyPracticeComplete = legacyPracticeStorageKey
          ? (await AsyncStorage.getItem(legacyPracticeStorageKey)) === '1'
          : false;
        let resolvedBackendCompletedVersion = backendPracticeCompletedVersion;
        let resolvedBackendCompletedAt = backendPracticeCompletedAt;

        if (practiceProfileId) {
          const { data, error } = await supabase
            .from('profiles')
            .select('vibes_practice_completed_version,vibes_practice_completed_at')
            .eq('id', practiceProfileId)
            .maybeSingle();
          if (!error && data) {
            resolvedBackendCompletedVersion = Number((data as any)?.vibes_practice_completed_version ?? 0);
            resolvedBackendCompletedAt = typeof (data as any)?.vibes_practice_completed_at === 'string'
              ? String((data as any)?.vibes_practice_completed_at)
              : resolvedBackendCompletedAt;
          }
        }

        const localCompleted =
          localSnapshot.completedVersion >= VIBES_PRACTICE_VERSION || legacyPracticeComplete;

        if (
          practiceProfileId &&
          localCompleted &&
          resolvedBackendCompletedVersion < VIBES_PRACTICE_VERSION
        ) {
          const localCompletedAtIso = localSnapshot.completedAt ?? new Date().toISOString();
          const synced = await syncPracticeCompletionToBackend(localCompletedAtIso);
          if (synced) {
            resolvedBackendCompletedVersion = VIBES_PRACTICE_VERSION;
            resolvedBackendCompletedAt = localCompletedAtIso;
          }
        }
        if (cancelled) return;

        const effectiveCompleted =
          resolvedBackendCompletedVersion >= VIBES_PRACTICE_VERSION ||
          localCompleted;
        const effectiveStep = effectiveCompleted ? 'intro' : localSnapshot.currentStep;

        setPracticeComplete(effectiveCompleted);
        setPracticeDismissed(false);
        setPracticeStep(effectiveStep);

        const needsSnapshotRefresh =
          effectiveCompleted !== (localSnapshot.completedVersion >= VIBES_PRACTICE_VERSION) ||
          localSnapshot.currentStep !== effectiveStep ||
          localSnapshot.completionSyncPending;

        if (needsSnapshotRefresh) {
          await writeVibesPracticeSnapshot(practiceSnapshotOwnerId, {
            completedAt: effectiveCompleted ? (resolvedBackendCompletedAt ?? localSnapshot.completedAt ?? new Date().toISOString()) : null,
            completedVersion: effectiveCompleted ? VIBES_PRACTICE_VERSION : 0,
            completionSyncPending: effectiveCompleted ? false : localSnapshot.completionSyncPending,
            currentStep: effectiveStep,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        if (!cancelled) {
          setPracticeStep('intro');
        }
      } finally {
        if (!cancelled) setPracticeLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    backendPracticeCompletedAt,
    backendPracticeCompletedVersion,
    legacyPracticeStorageKey,
    practiceProfileId,
    practiceSnapshotOwnerId,
    syncPracticeCompletionToBackend,
  ]);

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
          const compassDrivenFilters = Object.keys(relationshipCompassFilters).length === 0
            ? baseDiscoveryFilters
            : {
                ...baseDiscoveryFilters,
                verifiedOnly: Boolean(relationshipCompassFilters.verifiedOnly),
                distanceFilterKm:
                  typeof relationshipCompassFilters.distanceFilterKm === 'number'
                    ? relationshipCompassFilters.distanceFilterKm
                    : null,
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
        const normalizedFilters = normalizePersistedFilters(parsed);

        // Keep it best-effort; any missing fields just fall back to defaults.
        setVerifiedOnly(normalizedFilters.verifiedOnly);
        setHasVideoOnly(normalizedFilters.hasVideoOnly);
        setActiveOnly(normalizedFilters.activeOnly);
        setDistanceFilterKm(normalizedFilters.distanceFilterKm);
        setMinAge(normalizedFilters.minAge);
        setMaxAge(normalizedFilters.maxAge);
        setReligionFilter(normalizedFilters.religionFilter);
        setMinVibeScore(normalizedFilters.minVibeScore);
        setMinSharedInterests(normalizedFilters.minSharedInterests);
        setLocationQuery(normalizedFilters.locationQuery);

        applyFilters(normalizedFilters);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFilters, baseDiscoveryFilters, filtersStorageKey, normalizePersistedFilters, relationshipCompassFilters]);

  useEffect(() => {
    if (!filtersStorageKey) return;
    let cancelled = false;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(filtersStorageKey);
        if (cancelled || raw) return;
        setMinAge(baseDiscoveryFilters.minAge);
        setMaxAge(baseDiscoveryFilters.maxAge);
        applyFilters(baseDiscoveryFilters);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFilters, baseDiscoveryFilters, filtersStorageKey]);

  useEffect(() => {
    const previousBaseAge = previousBaseAgeRef.current;
    if (
      previousBaseAge.minAge === baseDiscoveryFilters.minAge &&
      previousBaseAge.maxAge === baseDiscoveryFilters.maxAge
    ) {
      return;
    }

    previousBaseAgeRef.current = {
      minAge: baseDiscoveryFilters.minAge,
      maxAge: baseDiscoveryFilters.maxAge,
    };

    if (!appliedFilters) return;

    const wasUsingPreviousBaseAge =
      appliedFilters.minAge === previousBaseAge.minAge &&
      appliedFilters.maxAge === previousBaseAge.maxAge;

    if (!wasUsingPreviousBaseAge) return;

    const nextFilters: VibesFilters = {
      ...appliedFilters,
      minAge: baseDiscoveryFilters.minAge,
      maxAge: baseDiscoveryFilters.maxAge,
    };

    setMinAge(nextFilters.minAge);
    setMaxAge(nextFilters.maxAge);
    applyFilters(nextFilters);

    if (filtersStorageKey) {
      AsyncStorage.setItem(filtersStorageKey, JSON.stringify(buildPersistedFiltersPayload(nextFilters))).catch(() => {});
    }
  }, [
    appliedFilters,
    applyFilters,
    baseDiscoveryFilters.maxAge,
    baseDiscoveryFilters.minAge,
    buildPersistedFiltersPayload,
    filtersStorageKey,
  ]);

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

  useEffect(() => {
    return subscribeToNetworkRestored(() => {
      queueRefreshMatches();
      void refreshMoments();
      void refreshSignalAccess();
    });
  }, [queueRefreshMatches, refreshMoments, refreshSignalAccess]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const loadDistanceUnit = async () => {
        try {
          const stored = await AsyncStorage.getItem(DISTANCE_UNIT_KEY);
          if (!mounted) return;
          if (stored === 'auto' || stored === 'km' || stored === 'mi') {
            setDistanceUnit((prev) => {
              return prev !== stored ? stored : prev;
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
    }, [])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DISTANCE_UNIT_EVENT, (next: DistanceUnit) => {
      if (next === 'auto' || next === 'km' || next === 'mi') {
        setDistanceUnit((prev) => {
          return prev !== next ? next : prev;
        });
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

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
  const vibesActionHistoryRef = useRef<VibesActionHistoryEntry[]>([]);
  const seenVibesCardKeysRef = useRef<Set<string>>(new Set());
  const matchListRef = useRef(matchList);
  const activeCardDwellRef = useRef<{
    profileId: string;
    startedAt: number;
    recommendationId: string | null;
  } | null>(null);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const intentBadgePulse = useRef(new Animated.Value(0)).current;
  const floatingMomentsOpacity = useRef(new Animated.Value(0)).current;
  const floatingMomentsTranslateY = useRef(new Animated.Value(-10)).current;
  const floatingMomentsScale = useRef(new Animated.Value(0.985)).current;
  const [renderFloatingMoments, setRenderFloatingMoments] = useState(false);
  const fallbackEntranceTranslate = useRef(new Animated.Value(12)).current;
  const fallbackEntranceOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    matchListRef.current = matchList;
  }, [matchList]);

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

  const recordVibesEvent = useCallback(
    (
      targetProfileId: string | null | undefined,
      eventType: VibesEventType,
      opts?: { position?: number | null; dwellMs?: number | null; metadata?: Record<string, unknown> },
    ) => {
      if (!profile?.id || !targetProfileId) return;
      const target = matchListRef.current.find(
        (match) => String(match.id) === String(targetProfileId),
      ) as any;
      const reasons = target?.recommendationReasons ?? {};
      void logVibesEvent({
        viewerProfileId: profile.id,
        targetProfileId: String(targetProfileId),
        segment: vibesSegment,
        eventType,
        position: opts?.position ?? null,
        dwellMs: opts?.dwellMs ?? null,
        sessionId: typeof reasons.session_id === 'string' ? reasons.session_id : null,
        requestId: typeof reasons.request_id === 'string' ? reasons.request_id : null,
        recommendationId:
          typeof reasons.recommendation_id === 'string' ? reasons.recommendation_id : null,
        metadata: opts?.metadata ?? {},
      });
    },
    [profile?.id, vibesSegment],
  );

  const getActiveCardDwellMs = useCallback((targetProfileId?: string | null) => {
    const activeCard = activeCardDwellRef.current;
    if (!activeCard || !targetProfileId || activeCard.profileId !== String(targetProfileId)) {
      return null;
    }
    return Math.max(0, Date.now() - activeCard.startedAt);
  }, []);

  const closeActiveVibesExposure = useCallback((outcome?: VibesExposureOutcome | null) => {
    const activeCard = activeCardDwellRef.current;
    if (!activeCard?.recommendationId) return;
    void enqueueVibesExposureClose({
      recommendationId: activeCard.recommendationId,
      dwellMs: Math.max(0, Date.now() - activeCard.startedAt),
      outcome: outcome ?? null,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setVibesScreenFocused(true);
      return () => {
        closeActiveVibesExposure(null);
        activeCardDwellRef.current = null;
        setVibesScreenFocused(false);
      };
    }, [closeActiveVibesExposure]),
  );

  const activeRecommendation = matchList[currentIndex] as any;
  const activeRecommendationId =
    typeof activeRecommendation?.recommendationReasons?.recommendation_id === 'string'
      ? activeRecommendation.recommendationReasons.recommendation_id
      : null;
  const activeRecommendationKey = activeRecommendation?.id
    ? `${String(activeRecommendation.id)}:${activeRecommendationId ?? 'legacy'}`
    : null;

  useEffect(() => {
    const current = matchListRef.current[currentIndex];
    if (!vibesScreenFocused || !current?.id) {
      activeCardDwellRef.current = null;
      return;
    }

    activeCardDwellRef.current = {
      profileId: String(current.id),
      startedAt: Date.now(),
      recommendationId: activeRecommendationId,
    };

    if (!profile?.id || showPracticeWalkthrough) return;

    void enqueueVibesExposureOpen(activeRecommendationId);

    const key = activeRecommendationId ?? `${vibesSegment}:${String(current.id)}`;
    if (seenVibesCardKeysRef.current.has(key)) return;
    seenVibesCardKeysRef.current.add(key);

    recordVibesEvent(String(current.id), 'card_seen', {
      position: currentIndex,
      metadata: {
        deck_size: matchList.length,
        compatibility: (current as any).compatibility ?? null,
        distance_km: (current as any).distanceKm ?? null,
        recommendation_version: (current as any).recommendationVersion ?? null,
      },
    });

    return () => {
      const activeCard = activeCardDwellRef.current;
      if (activeCard?.profileId !== String(current.id)) return;
      closeActiveVibesExposure(null);
      activeCardDwellRef.current = null;
    };
  }, [
    activeRecommendationId,
    activeRecommendationKey,
    closeActiveVibesExposure,
    currentIndex,
    profile?.id,
    recordVibesEvent,
    showPracticeWalkthrough,
    vibesScreenFocused,
    vibesSegment,
  ]);

  useEffect(() => {
    if (!intentQueueBadge) {
      intentBadgePulse.stopAnimation();
      intentBadgePulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(intentBadgePulse, {
          toValue: 1,
          duration: intentQueueBadge.endingSoon > 0 ? 950 : 1400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(intentBadgePulse, {
          toValue: 0,
          duration: intentQueueBadge.endingSoon > 0 ? 950 : 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [intentBadgePulse, intentQueueBadge]);

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
    const preferred = RELIGION_OPTIONS.map((option) => option.value);
    const normalizedSeen = new Set<string>();
    const collected: string[] = [];

    const pushReligion = (value: unknown) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return;
      const normalizedValue = normalizeReligionForProfile(trimmed);
      const normalized = normalizedValue.toLowerCase();
      if (normalizedSeen.has(normalized)) return;
      normalizedSeen.add(normalized);
      collected.push(normalizedValue);
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
  const hasMomentsHeaderOnly = Boolean(user?.id) && momentUsersWithContent.length === 0;
  const hasCompactMomentRail = momentUsersWithContent.length > 0 && momentUsersWithContent.length <= 3;
  const shouldShowFloatingMoments = Boolean(user?.id && !showPracticeWalkthrough && momentUsersWithContent.length > 0);

  useEffect(() => {
    if (!viewedMomentIdsStorageKey) return;
    const activeMomentIds = new Set(
      momentUsers.flatMap((entry) => entry.moments.map((moment) => String(moment.id))).filter(Boolean),
    );
    setViewedMomentIds((prev) => {
      const nextIds = Array.from(prev).filter((id) => activeMomentIds.has(id));
      if (nextIds.length === prev.size) return prev;
      const next = new Set(nextIds);
      AsyncStorage.setItem(viewedMomentIdsStorageKey, JSON.stringify(nextIds)).catch(() => {});
      return next;
    });
  }, [momentUsers, viewedMomentIdsStorageKey]);

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
    if (!viewedMomentIdsStorageKey) {
      setViewedMomentIds(new Set());
      return;
    }
    AsyncStorage.getItem(viewedMomentIdsStorageKey)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setViewedMomentIds(new Set());
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          const ids = Array.isArray(parsed) ? parsed.map((value) => String(value)).filter(Boolean) : [];
          setViewedMomentIds(new Set(ids));
        } catch {
          setViewedMomentIds(new Set());
        }
      })
      .catch(() => {
        if (!cancelled) setViewedMomentIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [viewedMomentIdsStorageKey]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;

    const visibleMomentIds = Array.from(
      new Set(
        momentUsersWithContent.flatMap((entry) => entry.moments.map((moment) => String(moment.id))).filter(Boolean),
      ),
    );

    if (visibleMomentIds.length === 0) return;

    const syncViewedMoments = async () => {
      const remoteViewedIds = await fetchViewedMomentIds(visibleMomentIds);
      if (cancelled || remoteViewedIds.size === 0) return;

      setViewedMomentIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        remoteViewedIds.forEach((momentId) => {
          if (!next.has(momentId)) {
            next.add(momentId);
            changed = true;
          }
        });
        if (!changed) return prev;
        if (viewedMomentIdsStorageKey) {
          AsyncStorage.setItem(viewedMomentIdsStorageKey, JSON.stringify(Array.from(next))).catch(() => {});
        }
        return next;
      });
    };

    void syncViewedMoments();

    return () => {
      cancelled = true;
    };
  }, [momentUsersWithContent, user?.id, viewedMomentIdsStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const loadMomentPriorityProfiles = async () => {
      if (!profile?.id) {
        setMomentPriorityProfileIds(new Set());
        setMomentRelationshipContextByProfileId({});
        return;
      }

      const cachedSnapshot = await readVibesMomentContextSnapshot(profile.id);
      if (!cancelled && cachedSnapshot) {
        setMomentPriorityProfileIds(new Set((cachedSnapshot.priorityProfileIds || []).map(String)));
        setMomentRelationshipContextByProfileId(cachedSnapshot.contextByProfileId || {});
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
      if (swipeError && intentError) {
        return;
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
        void writeVibesMomentContextSnapshot(profile.id, {
          priorityProfileIds: Array.from(next),
          contextByProfileId: nextContext,
        });
      }
    };

    void loadMomentPriorityProfiles();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const openMomentViewer = useCallback((userId: string) => {
    setMomentStartUserId(userId);
    setMomentViewerVisible(true);
  }, []);

  const openIntentSheet = useCallback(() => {
    const target = matchList[currentIndex];
    if (!target) return;
    recordVibesEvent(String(target.id), 'intent_opened', {
      position: currentIndex,
      dwellMs: getActiveCardDwellMs(String(target.id)),
    });
    setIntentTarget({
      id: String(target.id),
      name: (target as any).name || (target as any).full_name,
      deckIndex: currentIndex,
    });
    setIntentSheetVisible(true);
  }, [currentIndex, getActiveCardDwellMs, matchList, recordVibesEvent]);

  const openSignalSheet = useCallback(() => {
    const target = matchList[currentIndex];
    if (!target) return;
    recordVibesEvent(String(target.id), 'signal_opened', {
      position: currentIndex,
      dwellMs: getActiveCardDwellMs(String(target.id)),
    });
    setSignalTarget({
      id: String(target.id),
      name: (target as any).name || (target as any).full_name,
      deckIndex: currentIndex,
      match: target,
    });
    setSignalSheetVisible(true);
  }, [currentIndex, getActiveCardDwellMs, matchList, recordVibesEvent]);

  const pushVibesAction = useCallback((entry: VibesActionHistoryEntry) => {
    vibesActionHistoryRef.current = [...vibesActionHistoryRef.current, entry].slice(-24);
  }, []);

  const popVibesAction = useCallback(() => {
    const last = vibesActionHistoryRef.current[vibesActionHistoryRef.current.length - 1] ?? null;
    if (last) vibesActionHistoryRef.current = vibesActionHistoryRef.current.slice(0, -1);
    return last;
  }, []);

  const recordVibesSwipe = useCallback(
    (id: string, action: 'like' | 'dislike' | 'superlike', index = currentIndex) => {
      const swipedProfile = matchList.find((match) => String(match.id) === String(id));
      pushVibesAction({ kind: 'swipe', id: String(id), action, index });
      recordVibesEvent(String(id), action === 'dislike' ? 'pass' : action === 'superlike' ? 'signal_sent' : 'like', {
        position: index,
        dwellMs: getActiveCardDwellMs(String(id)),
        metadata: {
          swipe_action: action,
          recommendation_version: (swipedProfile as any)?.recommendationVersion ?? null,
        },
      });
      closeActiveVibesExposure(
        action === 'dislike' ? 'pass' : action === 'superlike' ? 'signal' : 'like',
      );
      recordSwipe(id, action, index);
    },
    [closeActiveVibesExposure, currentIndex, getActiveCardDwellMs, matchList, pushVibesAction, recordSwipe, recordVibesEvent],
  );

  const cancelDirectIntentRequest = useCallback(async (entry: Extract<VibesActionHistoryEntry, { kind: 'intent' }>) => {
    try {
      let requestId = entry.requestId;
      if (!requestId && profile?.id) {
        const { data } = await supabase
          .from('intent_requests')
          .select('id')
          .eq('actor_id', profile.id)
          .eq('recipient_id', entry.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1);
        requestId = Array.isArray(data) ? data[0]?.id ?? null : null;
      }
      if (!requestId) return;
      await cancelIntentRequestOfflineSafe(requestId, {
        snapshotOwnerIds: [profile?.id ?? null, user?.id ?? null],
      });
    } catch (error) {
      logger.warn('[vibes] undo_intent_cancel_failed', { error: String((error as any)?.message || error) });
    }
  }, [profile?.id]);

  const cancelSignal = useCallback(async (entry: Extract<VibesActionHistoryEntry, { kind: 'signal' }>) => {
    try {
      const { error } = await supabase.rpc('rpc_cancel_signal', { p_signal_id: entry.signalId });
      if (error) logger.warn('[vibes] undo_signal_cancel_failed', { error: String(error.message || error) });
      void refreshSignalAccess();
    } catch (error) {
      logger.warn('[vibes] undo_signal_cancel_failed', { error: String((error as any)?.message || error) });
    }
  }, [refreshSignalAccess]);

  const undoLastVibesAction = useCallback(() => {
    const last = popVibesAction();
    if (last) {
      recordVibesEvent(last.id, 'undo', {
        position: last.index,
        metadata: { action_kind: last.kind },
      });
    }

    try {
      stackRef.current?.rewind();
    } catch {}

    if (last?.kind === 'intent') {
      void cancelDirectIntentRequest(last);
      setCurrentIndex(Math.max(0, last.index));
      try { Haptics.selectionAsync(); } catch {}
      return;
    }

    if (last?.kind === 'signal') {
      void cancelSignal(last);
      setCurrentIndex(Math.max(0, last.index));
      try { Haptics.selectionAsync(); } catch {}
      return;
    }

    const prev = undoLastSwipe?.();
    if (prev) {
      setCurrentIndex(Math.max(0, prev.index));
    } else if (last?.kind === 'swipe') {
      setCurrentIndex(Math.max(0, last.index));
    }
    try { Haptics.selectionAsync(); } catch {}
  }, [cancelDirectIntentRequest, cancelSignal, popVibesAction, recordVibesEvent, undoLastSwipe]);

  const handlePressMyMoment = useCallback(() => {
    if (hasMyActiveMoment) {
      router.push('/my-moments');
      return;
    }
    router.push('/moments/create');
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

  const profileLocationPrecision = String(profile?.location_precision || '').toUpperCase();
  const hasPreciseCoords =
    profileLocationPrecision === 'EXACT' &&
    profile?.latitude != null &&
    profile?.longitude != null;
  const hasCityOnly =
    Boolean((profile as any)?.city || profile?.location) &&
    profileLocationPrecision === 'CITY';
  const isCountryManaged = shouldManageProfileCountry(profile as any);
  const countryPolicyMessage = getCountryPolicyMessage(profile?.country_lock_policy)
    || (isCountryManaged
      ? 'Your current country is protected. Use precise location to securely verify a move.'
      : '');
  const needsNearbyPreciseLocation = !hasPreciseCoords;
  const needsLocationPrompt = !hasPreciseCoords && !hasCityOnly;
  const shouldShowLocationPrompt =
    (activeTab === 'nearby' ? needsNearbyPreciseLocation : needsLocationPrompt)
    && (activeTab === 'nearby' || !locationPromptDismissed);
  const shouldShowLocationBanner =
    shouldShowLocationPrompt && !(activeTab === 'nearby' && matchList.length === 0);
  const showCompactLocationPrompt = shouldShowLocationPrompt && activeTab !== 'nearby';

  useEffect(() => {
    setManualLocation((profile as any)?.city || profile?.location || "");
  }, [(profile as any)?.city, profile?.location]);
  useEffect(() => {
    setManualCountryCode(profileCountryCode || '');
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
      if (res.verification?.message) {
        Alert.alert(
          res.verification.status === 'pending'
            ? 'First location check confirmed'
            : res.verification.status === 'verified'
              ? 'Country verified'
              : 'Location refreshed',
          res.verification.message,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await refreshProfile();
      await refreshMatches();
    }
    setIsSavingLocation(false);
  };

  const closeManualLocationModal = useCallback(() => {
    setManualCountryPickerOpen(false);
    setManualCountrySearch('');
    setManualLocationModalVisible(false);
  }, []);

  const dismissLocationPrompt = useCallback(() => {
    setLocationPromptDismissed(true);
    AsyncStorage.setItem(VIBES_LOCATION_PROMPT_DISMISSED_KEY, '1').catch(() => undefined);
  }, []);

  const openManualLocationModal = useCallback(() => {
    setLocationError(null);
    setManualLocation((profile as any)?.city || profile?.location || "");
    setManualRegion((profile as any)?.region || null);
    setManualLocality(null);
    setManualCountryCode(profileCountryCode || manualCountryCode || '');
    setManualCountryPickerOpen(false);
    setManualCountrySearch('');
    setManualLocationModalVisible(true);
  }, [manualCountryCode, profile?.location, (profile as any)?.city, (profile as any)?.region, profileCountryCode]);

  const openManualLocationModalFromFilters = useCallback(() => {
    setLocationError(null);
    setManualLocation((profile as any)?.city || profile?.location || "");
    setManualRegion((profile as any)?.region || null);
    setManualLocality(null);
    setManualCountryCode(profileCountryCode || manualCountryCode || '');
    setManualCountryPickerOpen(false);
    setManualCountrySearch('');
    setFiltersPanel('location');
  }, [manualCountryCode, profile?.location, (profile as any)?.city, (profile as any)?.region, profileCountryCode]);

  const handleSaveManualLocation = async () => {
    if (!profile?.id) return;
    setIsSavingLocation(true);
    setLocationError(null);
    if (!manualCountryCode) {
      setLocationError('Please select a country.');
      setManualCountryPickerOpen(true);
      setIsSavingLocation(false);
      return;
    }
    const res = await saveManualCityLocation(profile.id, {
      countryCode: manualCountryCode,
      countryName: selectedManualCountry?.label,
      city: manualLocation,
      region: manualRegion,
      localityGeonameId: manualSelectedGeonameId,
      localityAdmin1Code: manualLocality?.admin1Code ?? (
        manualLocation === (profile as any)?.city && manualCountryCode === profileCountryCode
          ? (profile as any)?.locality_admin1_code ?? null
          : null
      ),
      latitude: manualLocality?.latitude ?? null,
      longitude: manualLocality?.longitude ?? null,
    });
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

  const handleSelectManualCountry = useCallback((country: CountryOption) => {
    if (country.code !== manualCountryCode) {
      setManualLocation('');
      setManualRegion(null);
      setManualLocality(null);
    }
    setManualCountryCode(country.code);
    setManualCountrySearch('');
    setManualCountryPickerOpen(false);
    setLocationError(null);
  }, [manualCountryCode]);

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
      AsyncStorage.setItem(filtersStorageKey, JSON.stringify(buildPersistedFiltersPayload(next))).catch(() => {});
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
    const base = appliedFilters ?? baseDiscoveryFilters;

    setVerifiedOnly(Boolean(base.verifiedOnly));
    setHasVideoOnly(Boolean(base.hasVideoOnly));
    setActiveOnly(Boolean(base.activeOnly));
    setDistanceFilterKm(base.distanceFilterKm ?? null);
    setMinAge(typeof base.minAge === 'number' ? base.minAge : baseDiscoveryFilters.minAge);
    setMaxAge(typeof base.maxAge === 'number' ? base.maxAge : baseDiscoveryFilters.maxAge);
    setReligionFilter(typeof base.religionFilter === 'string' ? base.religionFilter : null);
    setMinVibeScore(typeof base.minVibeScore === 'number' ? base.minVibeScore : null);
    setMinSharedInterests(typeof base.minSharedInterests === 'number' ? base.minSharedInterests : 0);
    setLocationQuery(typeof base.locationQuery === 'string' ? base.locationQuery : '');
  }, [appliedFilters, baseDiscoveryFilters]);

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
    setMinAge(baseDiscoveryFilters.minAge);
    setMaxAge(baseDiscoveryFilters.maxAge);
    setReligionFilter(null);
    setMinVibeScore(null);
    setMinSharedInterests(0);
    setLocationQuery('');

    applyFilters(baseDiscoveryFilters);

    if (filtersStorageKey) {
      AsyncStorage.removeItem(filtersStorageKey).catch(() => {});
    }
  }, [applyFilters, baseDiscoveryFilters, filtersStorageKey]);

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
    if (minAge !== baseDiscoveryFilters.minAge || maxAge !== baseDiscoveryFilters.maxAge) {
      chips.push({
        key: 'age',
        label: `${minAge}-${maxAge}`,
        onClear: () => {
          setMinAge(baseDiscoveryFilters.minAge);
          setMaxAge(baseDiscoveryFilters.maxAge);
        },
      });
    }
    if (religionFilter) chips.push({ key: 'religion', label: formatReligionLabel(religionFilter), onClear: () => setReligionFilter(null) });
    if (locationQuery.trim()) chips.push({ key: 'loc', label: `City: ${locationQuery.trim()}`, onClear: () => setLocationQuery('') });
    return chips;
  }, [
    activeOnly,
    baseDiscoveryFilters.maxAge,
    baseDiscoveryFilters.minAge,
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

  const showSignalUpsell = useCallback(() => {
    setSignalSheetVisible(false);
    setPremiumUpsell({
      requiredPlan: 'SILVER',
      title: 'Send Signals that stand out',
      message: 'Signals let you show what you noticed, with priority for 48 hours. Silver includes 3 Signals each week; Gold includes 7.',
    });
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

  const roomSummary = useMemo(
    () => deriveRoomSummary(draftFiltersForPreview, ageFilterBaseline),
    [ageFilterBaseline, draftFiltersForPreview],
  );
  const compatibilityHint = useMemo(() => deriveCompatibilityHint(draftFiltersForPreview), [draftFiltersForPreview]);
  const previewTone = useMemo(
    () => derivePreviewTone(draftPreviewCount, draftFiltersForPreview, previewBaseProfiles.length, ageFilterBaseline),
    [ageFilterBaseline, draftFiltersForPreview, draftPreviewCount, previewBaseProfiles.length],
  );
  const currentAgeRange = useMemo(
    () => ({ min: minAge, max: maxAge }),
    [maxAge, minAge],
  );
  const savedAgeRange = useMemo(
    () => ({
      min: baseDiscoveryFilters.minAge,
      max: baseDiscoveryFilters.maxAge,
    }),
    [baseDiscoveryFilters.maxAge, baseDiscoveryFilters.minAge],
  );
  const agePresetMode = useMemo(
    () =>
      resolveAgePresetMode({
        value: currentAgeRange,
        userAge: typeof (profile as any)?.age === 'number' ? (profile as any).age : null,
        savedRange: savedAgeRange,
        absoluteMin: savedAgeRange.min,
        absoluteMax: savedAgeRange.max,
      }),
    [currentAgeRange, profile, savedAgeRange],
  );
  const ageSupportCopy = useMemo(() => getAgePresetSupportCopy(agePresetMode), [agePresetMode]);
  const activePresetKey = useMemo(() => deriveActivePresetKey(draftFiltersForPreview), [draftFiltersForPreview]);

  const handleAgePresetPress = useCallback(
    (mode: Exclude<AgePresetMode, 'custom'>) => {
      const nextRange = getAgeRangeForPreset({
        mode,
        userAge: typeof (profile as any)?.age === 'number' ? (profile as any).age : null,
        savedRange: savedAgeRange,
        absoluteMin: savedAgeRange.min,
        absoluteMax: savedAgeRange.max,
      });
      setMinAge(nextRange.min);
      setMaxAge(nextRange.max);
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [profile, savedAgeRange],
  );

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
    if (appliedFilters.minAge !== baseDiscoveryFilters.minAge || appliedFilters.maxAge !== baseDiscoveryFilters.maxAge) n += 1;
    if (appliedFilters.religionFilter) n += 1;
    if (appliedFilters.locationQuery && appliedFilters.locationQuery.trim()) n += 1;
    return n;
  }, [appliedFilters, baseDiscoveryFilters.maxAge, baseDiscoveryFilters.minAge]);

  // Reset only when the tab changes. For ordinary feed refreshes, preserve the
  // user's position and only clamp when the list shrinks past the current card.
  useEffect(() => {
    setCurrentIndex(0);
    scrollVibesToTop();
  }, [activeTab, scrollVibesToTop]);

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (matchList.length <= 0) return 0;
      return Math.min(prev, Math.max(0, matchList.length - 1));
    });
  }, [matchList.length]);

  // Prefetch optional fields for the next N cards to improve perceived speed
  useEffect(() => {
    const wantsMoreDetails =
      Boolean(appliedFilters?.hasVideoOnly) || (appliedFilters?.minSharedInterests || 0) > 0;
    const N = wantsMoreDetails ? 10 : 2;
    let mounted = true;
      (async () => {
        try {
          for (let i = 1; i <= N; i++) {
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
                // Keep enrichment off the visible card to avoid mid-gesture rewrites.
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

  useEffect(() => {
    if (!showPracticeWalkthrough && practiceGestureLocked) {
      setPracticeGestureLocked(false);
    }
  }, [practiceGestureLocked, showPracticeWalkthrough]);

  const handlePracticeStepChange = useCallback(async (nextStep: PracticeStep) => {
    setPracticeStep(nextStep);
    if (practiceReplayVisible || practiceComplete || !practiceSnapshotOwnerId) return;
    const existingSnapshot = (await readVibesPracticeSnapshot(practiceSnapshotOwnerId)) ?? getDefaultVibesPracticeSnapshot();
    await writeVibesPracticeSnapshot(practiceSnapshotOwnerId, {
      ...existingSnapshot,
      currentStep: nextStep,
      updatedAt: new Date().toISOString(),
    });
  }, [practiceComplete, practiceReplayVisible, practiceSnapshotOwnerId]);

  const handlePracticeEvent = useCallback((event: PracticeEvent, step: PracticeStep, method?: 'gesture' | 'button') => {
    logger.info('[vibes] practice_event', {
      event,
      step,
      method: method ?? null,
      replay: practiceReplayVisible,
      version: VIBES_PRACTICE_VERSION,
    });
  }, [practiceReplayVisible]);

  const closePracticeWalkthrough = useCallback(() => {
    logger.info('[vibes] practice_event', {
      event: 'closed',
      step: practiceStep,
      replay: practiceReplayVisible,
      version: VIBES_PRACTICE_VERSION,
    });
    if (practiceReplayVisible || practiceComplete) {
      setPracticeReplayVisible(false);
      setPracticeDismissed(false);
      setPracticeStep('intro');
    } else {
      setPracticeDismissed(true);
    }
    setPracticeGestureLocked(false);
    setDeckGestureLocked(false);
    scrollVibesToTop();
  }, [practiceComplete, practiceReplayVisible, practiceStep, scrollVibesToTop]);

  const openPracticeReplay = useCallback(() => {
    logger.info('[vibes] practice_event', {
      event: 'replay_opened',
      step: practiceComplete ? 'intro' : practiceStep,
      replay: practiceComplete,
      version: VIBES_PRACTICE_VERSION,
    });
    if (!practiceComplete) {
      setPracticeDismissed(false);
      setPracticeReplayVisible(false);
    } else {
      setPracticeStep('intro');
      setPracticeReplayVisible(true);
    }
    setPracticeGestureLocked(false);
    setDeckGestureLocked(false);
    setRenderFloatingMoments(false);
    floatingMomentsOpacity.setValue(0);
    floatingMomentsTranslateY.setValue(-10);
    floatingMomentsScale.setValue(0.985);
    scrollVibesToTop();
  }, [floatingMomentsOpacity, floatingMomentsScale, floatingMomentsTranslateY, practiceComplete, practiceStep, scrollVibesToTop]);

  const handleVibesHeaderTabChange = useCallback((id: string) => {
    if (showPracticeWalkthrough) return;
    setActiveTab(id as any);
    scrollVibesToTop();
  }, [scrollVibesToTop, showPracticeWalkthrough]);

  const handleOpenVibesFilters = useCallback(() => {
    if (showPracticeWalkthrough) return;
    setFiltersVisible(true);
  }, [showPracticeWalkthrough]);

  useEffect(() => {
    vibesActionHistoryRef.current = [];
    setDeckGestureLocked(false);
  }, [activeTab]);

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
          <View style={[styles.emptyCard, layoutMetrics.isCompactWidth ? styles.emptyCardCompact : null]}>
            <Text style={[styles.emptyTitle, layoutMetrics.isCompactWidth ? styles.emptyTitleCompact : null]}>
              {activeTab === 'nearby'
                ? (hasPreciseCoords ? 'Nearby feels quiet right now' : 'Turn on precise location for Nearby')
                : 'No fresh profiles right now'}
            </Text>
            <Text style={[styles.emptySubtitle, layoutMetrics.isCompactWidth ? styles.emptySubtitleCompact : null]}>
              {activeTab === 'nearby'
                ? (
                  hasPreciseCoords
                    ? "We'll show people close to you when more verified locations are available. Explore For You for strong matches beyond distance."
                    : 'Nearby uses your precise coordinates. Without them, you will not see nearby profiles even if other people have location turned on.'
                )
                : 'You have reached the edge of this round. Refresh for a new set or browse nearby again.'}
            </Text>
            <View style={[styles.emptyActions, layoutMetrics.isCompactWidth ? styles.emptyActionsCompact : null]}>
              <TouchableOpacity
                style={[styles.primaryButton, layoutMetrics.isCompactWidth ? styles.primaryButtonCompact : null]}
                onPress={() => {
                  if (activeTab === 'nearby') {
                    if (hasPreciseCoords) {
                      setActiveTab('recommended');
                      setCurrentIndex(0);
                      return;
                    }

                    void handleUseMyLocation();
                    return;
                  }

                  void refreshMatches();
                  setCurrentIndex(0);
                }}
              >
                <Text style={[styles.primaryButtonText, layoutMetrics.isCompactWidth ? styles.primaryButtonTextCompact : null]}>
                  {activeTab === 'nearby'
                    ? (hasPreciseCoords ? 'Explore For You' : 'Use precise location')
                    : 'Refresh Vibes'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghostButton, layoutMetrics.isCompactWidth ? styles.ghostButtonCompact : null]}
                onPress={() => {
                  if (activeTab === 'nearby') {
                    if (hasPreciseCoords) {
                      void refreshMatches();
                      setCurrentIndex(0);
                      return;
                    }

                    setActiveTab('recommended');
                    setCurrentIndex(0);
                    return;
                  }

                  setActiveTab('nearby');
                }}
              >
                <Text style={[styles.ghostButtonText, layoutMetrics.isCompactWidth ? styles.ghostButtonTextCompact : null]}>
                  {activeTab === 'nearby'
                    ? (hasPreciseCoords ? 'Refresh Nearby' : 'Explore For You')
                    : 'Browse Nearby'}
                </Text>
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
      if (cm) recordVibesSwipe(cm.id, "like", currentIndex);
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
      if (cm) recordVibesSwipe(cm.id, "dislike", currentIndex);
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
        recordVibesEvent(id, 'profile_opened', {
          position: currentIndex,
          dwellMs: getActiveCardDwellMs(id),
        });
        closeActiveVibesExposure('profile_open');
      }
      // fetch optional fields on demand and merge into matches
      const updated = await fetchProfileDetails?.(id);
      const m = matchList.find((x) => String(x.id) === String(id));
      const sourceProfile = (updated as any) ?? m;
      const videoUrl = (sourceProfile && (sourceProfile as any).profileVideo) ? String((sourceProfile as any).profileVideo) : undefined;
      // navigate to the full profile preview screen; include videoUrl param if we have it so ProfileView can auto-play
      const params: any = { profileId: String(id), source: 'vibes' };
      if (m) {
        try {
          const fallbackSource = sourceProfile ?? m;
          const recommendationReasons = (m as any).recommendationReasons ?? {};
          params.vibesSegment = vibesSegment;
          params.vibesSessionId = recommendationReasons.session_id ?? undefined;
          params.vibesRequestId = recommendationReasons.request_id ?? undefined;
          params.vibesRecommendationId = recommendationReasons.recommendation_id ?? undefined;
          const compatPct = typeof (fallbackSource as any).compatibility === 'number' ? (fallbackSource as any).compatibility : 0;
          params.fallbackProfile = encodeURIComponent(JSON.stringify({
            id: fallbackSource.id,
            name: (fallbackSource as any).name,
            age: (fallbackSource as any).age,
            location: (fallbackSource as any).city || (fallbackSource as any).location || (fallbackSource as any).region || '',
            city: (fallbackSource as any).city,
            region: (fallbackSource as any).region,
            avatar_url: (fallbackSource as any).avatar_url,
            photos: Array.isArray((fallbackSource as any).photos) ? (fallbackSource as any).photos : undefined,
            occupation: (fallbackSource as any).occupation,
            education: (fallbackSource as any).education,
            bio: (fallbackSource as any).tagline || (fallbackSource as any).bio,
            tribe: (fallbackSource as any).tribe,
            religion: (fallbackSource as any).religion,
            distance: (fallbackSource as any).distance,
            interests: (fallbackSource as any).interests,
            is_active: (fallbackSource as any).isActiveNow,
            compatibility: compatPct,
            verified: (fallbackSource as any).verified,
            verification_level: (fallbackSource as any).verification_level,
            current_country: (fallbackSource as any).current_country,
            current_country_code: (fallbackSource as any).current_country_code,
            location_precision: (fallbackSource as any).location_precision,
            profileVideo: (fallbackSource as any).profileVideo,
            profile_video: (fallbackSource as any).profileVideoPath,
          }));
        } catch {}
      }
      if (videoUrl) params.videoUrl = videoUrl;
      router.push({ pathname: '/profile-view', params });
    } catch (e) {
      console.log('onProfileTap failed', e);
    }
  };

  const renderSignalBadge = () => (
    <View style={[styles.superlikeBadgeInline, signalAccess.remaining <= 0 && styles.superlikeBadgeInlineDisabled]}>
      <Text style={styles.superlikeBadgeInlineText}>
        {`${Math.max(signalAccess.remaining, 0)} left`}
      </Text>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DepthBackground>
      <SafeAreaView style={styles.container}>
        {/* TOP HEADER */}
        <ExploreHeader
          title="Vibes"
          subtitle={vibesSubtitle}
          subtitleEmblem={isGhanaianDiaspora ? 'ghana' : 'global'}
          tabs={[
            { id: "recommended", label: "For You", icon: "heart" },
            { id: "nearby", label: "Nearby", icon: "map-marker" },
            { id: "active", label: "Active Now", icon: "circle" },
          ]}
          activeTab={activeTab}
          setActiveTab={handleVibesHeaderTabChange}
          currentIndex={currentIndex}
          total={matchList.length}
          smartCount={smartCount}
          onPressFilter={showPracticeWalkthrough ? undefined : handleOpenVibesFilters}
          filterCount={appliedFilterCount}
          rightAccessory={!showPracticeWalkthrough ? (
            <>
              {intentQueueBadge ? (
                <TouchableOpacity
                  style={[styles.headerIntentBadge, intentQueueBadge.endingSoon > 0 && styles.headerIntentBadgeUrgent]}
                  onPress={() => router.push({ pathname: '/(tabs)/intent', params: { filter: 'action' } } as never)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`${intentQueueBadge.waiting} waiting in Intent`}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.headerIntentBadgePulse,
                      intentQueueBadge.endingSoon > 0 && styles.headerIntentBadgePulseUrgent,
                      {
                        opacity: intentBadgePulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.22, intentQueueBadge.endingSoon > 0 ? 0.72 : 0.46],
                        }),
                        transform: [
                          {
                            scale: intentBadgePulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.92, 1.18],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <MaterialCommunityIcons
                    name={intentQueueBadge.endingSoon > 0 ? 'timer-sand' : 'message-badge-outline'}
                    size={18}
                    color={intentQueueBadge.endingSoon > 0 ? theme.accent : theme.tint}
                  />
                  <View style={[styles.headerIntentBadgeCount, intentQueueBadge.endingSoon > 0 && styles.headerIntentBadgeCountUrgent]}>
                    <Text style={styles.headerIntentBadgeText}>{intentQueueBadge.waiting > 9 ? '9+' : intentQueueBadge.waiting}</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.headerRefreshButton}
                onPress={openPracticeReplay}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Practice Vibes actions"
                accessibilityHint="Opens the interactive Intent, Notice, Pass, and Undo walkthrough"
              >
                <Text style={styles.headerPracticeText}>Practice</Text>
              </TouchableOpacity>
            </>
          ) : null}
        />

        <Animated.ScrollView
          ref={scrollViewRef}
          scrollEnabled={!showPracticeWalkthrough && !practiceGestureLocked && !deckGestureLocked}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={
            showPracticeWalkthrough
              ? undefined
              : (
                <RefreshControl
                  refreshing={refreshingMatches}
                  onRefresh={handleRefreshVibes}
                  tintColor={theme.tint}
                />
              )
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + layoutMetrics.stackBottomReserve + 92, 180) },
          ]}
        >
          {shouldShowLocationBanner ? (
            <View style={[styles.locationBanner, showCompactLocationPrompt ? styles.locationBannerCompact : null]}>
              <View style={styles.locationBannerHeader}>
                <View style={styles.locationBannerCopy}>
                  <Text style={styles.locationTitle}>
                    {activeTab === 'nearby' ? 'Use precise location to unlock Nearby' : 'Add your city to improve nearby matches'}
                  </Text>
                  <Text style={[styles.locationSubtitle, showCompactLocationPrompt ? styles.locationSubtitleCompact : null]}>
                    {activeTab === 'nearby'
                      ? 'Nearby only works with precise location. City-only location still works for For You and profile display.'
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
          {user?.id && momentUsersWithContent.length === 0 ? (
            <MomentsHeaderRow
              momentCount={momentUsersWithContent.length}
              isEmpty={showMomentsEmptyState}
              expanded={!momentsCollapsed}
              onToggle={() => setMomentsCollapsed((current) => !current)}
              onPressSeeAll={handleMomentsPress}
              onPressShare={handlePressMyMoment}
              theme={theme}
              isDark={isDark}
              metrics={momentsCapsuleMetrics}
            />
          ) : null}
          {!showPracticeWalkthrough && renderFloatingMoments && user?.id ? (
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.momentsCapsuleFlow,
                layoutMetrics.isCompactWidth ? styles.momentsCapsuleFlowCompact : null,
                {
                  marginTop: momentsCapsuleMetrics.capsuleMarginTop,
                  marginBottom: hasCompactMomentRail
                    ? Platform.OS === 'android' && (layoutMetrics.device.compactHeight || layoutMetrics.device.compactWidth)
                      ? 24
                      : 10
                    : momentsCapsuleMetrics.capsuleMarginBottom,
                  opacity: floatingMomentsOpacity,
                  transform: [
                    { translateY: floatingMomentsTranslateY },
                    { scale: floatingMomentsScale },
                  ],
                },
              ]}
            >
                <FloatingMomentsCapsule
                  users={momentStripUsers}
                  attentionProfileIds={momentAttentionProfileIds}
                  relationshipContextByProfileId={momentRelationshipContextByProfileId}
                  viewedMomentIds={viewedMomentIds}
                  onPressMyMoment={handlePressMyMoment}
                  onPressUserMoment={handlePressUserMoment}
                  onPressSeeAll={handleMomentsPress}
                onPressPostMoment={handlePressMyMoment}
                theme={theme}
                isDark={isDark}
                metrics={momentsCapsuleMetrics}
              />
            </Animated.View>
          ) : null}
          {!showPracticeWalkthrough && offlineNotice ? (
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
          ) : null}

          {/* CARD STACK */}
          <View
            style={[
              styles.stackWrapper,
              {
                width: layoutMetrics.cardWidth,
                height: layoutMetrics.cardHeight + vibesStackVisualReserve,
                paddingHorizontal: 0,
                paddingBottom: vibesStackVisualReserve,
                marginTop:
                  !showPracticeWalkthrough && renderFloatingMoments && user?.id
                    ? hasCompactMomentRail
                      ? 0
                      : -momentsCapsuleMetrics.capsuleOverlapAmount
                    : hasMomentsHeaderOnly && Platform.OS === 'android' && (layoutMetrics.device.compactHeight || layoutMetrics.device.compactWidth)
                      ? 14
                      : layoutMetrics.device.compactHeight
                        ? -12
                      : layoutMetrics.device.tallHeight
                        ? 4
                        : -6,
              },
            ]}
          >
            {!practiceLoaded ? (
              <ExploreStackSkeleton />
            ) : showPracticeWalkthrough ? (
              <VibesPracticeWalkthrough
                metrics={layoutMetrics}
                onComplete={completePractice}
                onGestureLockChange={setPracticeGestureLocked}
                initialStep={practiceStep}
                onStepChange={handlePracticeStepChange}
                onPracticeEvent={handlePracticeEvent}
                allowClose
                onClose={closePracticeWalkthrough}
              />
            ) : loadingMatches && matchList.length === 0 ? (
              <ExploreStackSkeleton />
            ) : offlineNotice && matchList.length === 0 ? (
              // If we failed to load, don't show the "no more profiles" empty state.
              // The retry Notice above already provides recovery.
              <ExploreStackSkeleton />
            ) : !exhausted ? (
              <ExploreStack
                ref={stackRef}
                matches={matchList}
                currentIndex={currentIndex}
                setCurrentIndex={setCurrentIndex}
                recordSwipe={recordVibesSwipe}
                onProfileTap={onProfileTap}
                layoutMetrics={layoutMetrics}
                onIntentSwipeUp={openIntentSheet}
                onGestureLockChange={setDeckGestureLocked}
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
                      recordVibesEvent(id, 'intro_played', {
                        position: currentIndex,
                        dwellMs: getActiveCardDwellMs(id),
                      });
                    }
                      const updated = await fetchProfileDetails?.(id);
                      const videoSource = (updated && ((updated as any).profileVideoPath || (updated as any).profileVideo))
                        ? String((updated as any).profileVideoPath || (updated as any).profileVideo)
                        : undefined;
                      const cachedVideoUrl = videoSource ? await getOfflineVideoUri(videoSource) : null;
                      const videoUrl = cachedVideoUrl || ((updated && (updated as any).profileVideo) ? String((updated as any).profileVideo) : undefined);
                      if (videoUrl) {
                        const display = updated || matchList.find((entry) => String(entry.id) === String(id));
                        const age = typeof (display as any)?.age === 'number' ? (display as any).age : null;
                        setVideoModalTitle(display?.name ? `${display.name}${age ? `, ${age}` : ''}` : null);
                        setVideoModalSubtitle('Intro video');
                        setVideoModalProfileId(String(id));
                        setVideoModalUrl(videoUrl);
                        setVideoModalVisible(true);
                        if (!cachedVideoUrl && videoSource && String(videoUrl).startsWith('http')) {
                          void cacheOfflineVideo(videoSource, videoUrl).then((localUri) => {
                            if (localUri) setVideoModalUrl(localUri);
                          });
                        }
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

        {!showPracticeWalkthrough && practiceLoaded ? (
          <View
            style={[
              styles.actionButtons,
              {
                bottom: Math.max(layoutMetrics.dockBottom, layoutMetrics.bottomNavReserve + vibesActionRailGap),
              },
            ]}
            pointerEvents="box-none"
          >
            <VibesActionDock
              metrics={layoutMetrics}
              onPass={() => animateButtonPress(onReject)}
              onUndo={undoLastVibesAction}
              onLike={() => animateButtonPress(onLike)}
              onPremium={() => animateButtonPress(openSignalSheet)}
              onIntent={openIntentSheet}
              superlikeBadge={renderSignalBadge()}
              entranceStyle={{
                transform: [
                  { translateY: fallbackEntranceTranslate },
                  { scale: buttonScale },
                ],
                opacity: fallbackEntranceOpacity,
              }}
            />
          </View>
        ) : null}

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
              <BlurViewSafe
                intensity={34}
                tint={isDark ? 'dark' : 'light'}
                style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 16, 20), marginTop: 8 }]}
              >
                <View style={styles.modalHandle} />
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
                    ? 'Share only your chosen city, or use precise location when you want distance to do the work.'
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
                            City-only shares the city you choose while keeping exact coordinates private. You can switch back any time.
                          </Text>
                        </View>

                        <View style={styles.filterFieldGroup}>
                          <Text style={styles.modalLabel}>Country</Text>
                          {isCountryManaged ? (
                            <Text style={styles.filterHint}>
                              {countryPolicyMessage}
                            </Text>
                          ) : null}
                          <TouchableOpacity
                            style={[styles.countrySelectButton, isCountryManaged && styles.countrySelectButtonDisabled]}
                            onPress={() => {
                              if (isCountryManaged) return;
                              setManualCountrySearch('');
                              setManualCountryPickerOpen((current) => !current);
                            }}
                            activeOpacity={0.85}
                            disabled={isCountryManaged}
                          >
                            <View style={styles.countrySelectValue}>
                              <Text style={[styles.countrySelectFlag, !selectedManualCountryFlag && styles.countrySelectFlagPlaceholder]}>
                                {selectedManualCountryFlag || '--'}
                              </Text>
                              <View style={styles.countrySelectCopy}>
                                <Text style={manualCountryCode ? styles.countrySelectLabel : styles.countrySelectPlaceholder}>
                                  {selectedManualCountry?.label || 'Select country'}
                                </Text>
                                <Text style={styles.countrySelectMeta}>
                                  {selectedManualCountry
                                    ? `${selectedManualCountry.dial} • ${selectedManualCountry.code}`
                                    : 'Used for local matching first'}
                                </Text>
                              </View>
                            </View>
                            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                          </TouchableOpacity>
                          {manualCountryPickerOpen ? (
                            <View style={styles.inlineCountryPickerPanel}>
                              <View style={styles.countrySearchWrap}>
                                <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
                                <TextInput
                                  value={manualCountrySearch}
                                  onChangeText={setManualCountrySearch}
                                  placeholder="Search country or code"
                                  placeholderTextColor={theme.textMuted}
                                  autoCapitalize="words"
                                  autoCorrect={false}
                                  style={styles.countrySearchInput}
                                />
                              </View>
                              <ScrollView
                                style={styles.inlineCountryPickerList}
                                contentContainerStyle={styles.countryPickerListContent}
                                keyboardShouldPersistTaps="handled"
                                nestedScrollEnabled
                              >
                                {manualCountryOptions.map((country) => {
                                  const isSelected = manualCountryCode === country.code;
                                  return (
                                    <TouchableOpacity
                                      key={country.code}
                                      style={[styles.countryPickerItem, isSelected && styles.countryPickerItemSelected]}
                                      onPress={() => handleSelectManualCountry(country)}
                                      activeOpacity={0.85}
                                    >
                                      <View style={styles.countryPickerItemRow}>
                                        <Text style={styles.countryPickerItemFlag}>{toFlagEmoji(country.code) || '--'}</Text>
                                        <View style={styles.countryPickerItemCopy}>
                                          <Text style={[styles.countryPickerItemLabel, isSelected && styles.countryPickerItemLabelSelected]}>
                                            {country.label}
                                          </Text>
                                          <Text style={styles.countryPickerItemMeta}>{`${country.dial} • ${country.code}`}</Text>
                                        </View>
                                      </View>
                                      {isSelected ? (
                                        <MaterialCommunityIcons name="check" size={20} color={theme.tint} />
                                      ) : null}
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.filterFieldGroup}>
                          <GlobalCityField
                            countryCode={manualCountryCode}
                            countryName={selectedManualCountry?.label || 'your country'}
                            value={manualLocation}
                            region={manualRegion}
                            selectedGeonameId={manualSelectedGeonameId}
                            dark={isDark}
                            styles={manualCityStyles}
                            error={locationError || undefined}
                            required
                            onSelect={(place) => {
                              setManualLocality(place);
                              setManualLocation(place?.name || '');
                              setManualRegion(place?.admin1Name || null);
                              setLocationError(null);
                            }}
                          />
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
                      <Text style={styles.filterSectionEyebrow}>Discovery range</Text>
                      <View style={styles.filterSectionTitleRow}>
                        <Text style={styles.filterSectionTitle}>Set reach, then shape compatibility</Text>
                        <View style={[styles.filterTierPill, styles.filterTierPillMixed]}>
                          <Text style={[styles.filterTierPillText, styles.filterTierPillTextMixed]}>Flexible</Text>
                        </View>
                      </View>
                      <Text style={styles.filterSectionBody}>Distance stays practical. Age range stays personal.</Text>
                    </View>
                    <View style={styles.filterFieldGroup}>
                    <Text style={styles.filterSubsectionEyebrow}>Reach</Text>
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
                    <View style={styles.filterSubsectionDivider} />
                    <View style={[styles.filterFieldGroup, styles.ageFieldGroup]}>
                    <Text style={styles.filterSubsectionEyebrow}>Compatibility</Text>
                    <View style={styles.ageTitleRow}>
                      <Text style={styles.ageSectionTitle}>Age range</Text>
                      <TouchableOpacity
                        style={styles.ageEditAction}
                        onPress={() => {
                          setFiltersVisible(false);
                          setFiltersPanel('main');
                          requestOpenProfileEdit();
                          router.navigate({
                            pathname: '/(tabs)/profile',
                            params: { openEdit: String(Date.now()) },
                          });
                        }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Edit saved age preference"
                      >
                        <Text style={styles.ageEditActionText}>Edit</Text>
                        <MaterialCommunityIcons name="chevron-right" size={15} color={theme.tint} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.ageHeroPanel}>
                      <Text style={styles.ageHeroValue}>{formatAgeRangeValue(currentAgeRange)}</Text>
                      <Text style={styles.ageHeroSupport}>{ageSupportCopy}</Text>
                    </View>

                    <PremiumRangeSlider
                      min={baseDiscoveryFilters.minAge}
                      max={baseDiscoveryFilters.maxAge}
                      step={1}
                      valueMin={minAge}
                      valueMax={maxAge}
                      onChange={(nextMin, nextMax) => {
                        setMinAge(nextMin);
                        setMaxAge(nextMax);
                      }}
                      theme={theme}
                      isDark={isDark}
                      minLabel={String(minAge)}
                      maxLabel={String(maxAge)}
                    />
                    <View style={styles.agePresetRow}>
                      {agePresetModes.map((mode) => {
                        const active = agePresetMode === mode;
                        return (
                          <TouchableOpacity
                            key={mode}
                            style={[styles.agePresetChip, active && styles.agePresetChipActive]}
                            onPress={() => handleAgePresetPress(mode)}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${formatAgePresetLabel(mode)} age range${active ? ', selected' : ''}`}
                          >
                            <Text style={[styles.agePresetChipText, active && styles.agePresetChipTextActive]}>
                              {formatAgePresetLabel(mode)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {agePresetMode === 'custom' ? (
                      <Text style={styles.agePresetMeta}>Custom range inside your saved preference {savedAgeRangeLabel}.</Text>
                    ) : (
                      <Text style={styles.agePresetMeta}>Saved preference {savedAgeRangeLabel}.</Text>
                    )}
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
                          <Text style={[styles.filterChipText, religionFilter === r && styles.filterChipTextActive]}>
                            {formatReligionLabel(r)}
                          </Text>
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
                    <Text style={styles.filterLabel}>Filter loaded cards by place</Text>
                    <Text style={styles.filterHint}>Use a city, region, or country. This does not set your own location.</Text>
                    <TextInput
                      style={[styles.filterInput, { marginTop: 8 }]}
                      placeholder="e.g., Bristol or United Kingdom"
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
              </BlurViewSafe>
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
                <Text style={styles.modalSubtitle}>Share a verified city while keeping exact coordinates private. No GPS required.</Text>

                <Text style={styles.modalLabel}>Country</Text>
                {isCountryManaged ? (
                  <Text style={styles.filterHint}>
                    {countryPolicyMessage}
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.countrySelectButton, isCountryManaged && styles.countrySelectButtonDisabled]}
                  onPress={() => {
                    if (isCountryManaged) return;
                    setManualCountrySearch('');
                    setManualCountryPickerOpen((current) => !current);
                  }}
                  activeOpacity={0.85}
                  disabled={isCountryManaged}
                >
                  <View style={styles.countrySelectValue}>
                    <Text style={[styles.countrySelectFlag, !selectedManualCountryFlag && styles.countrySelectFlagPlaceholder]}>
                      {selectedManualCountryFlag || '--'}
                    </Text>
                    <View style={styles.countrySelectCopy}>
                      <Text style={manualCountryCode ? styles.countrySelectLabel : styles.countrySelectPlaceholder}>
                        {selectedManualCountry?.label || 'Select country'}
                      </Text>
                      <Text style={styles.countrySelectMeta}>
                        {selectedManualCountry
                          ? `${selectedManualCountry.dial} • ${selectedManualCountry.code}`
                          : 'Used for local matching first'}
                      </Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textMuted} />
                </TouchableOpacity>
                {manualCountryPickerOpen ? (
                  <View style={styles.inlineCountryPickerPanel}>
                    <View style={styles.countrySearchWrap}>
                      <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
                      <TextInput
                        value={manualCountrySearch}
                        onChangeText={setManualCountrySearch}
                        placeholder="Search country or code"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="words"
                        autoCorrect={false}
                        style={styles.countrySearchInput}
                      />
                    </View>
                    <ScrollView
                      style={styles.inlineCountryPickerList}
                      contentContainerStyle={styles.countryPickerListContent}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {manualCountryOptions.map((country) => {
                        const isSelected = manualCountryCode === country.code;
                        return (
                          <TouchableOpacity
                            key={country.code}
                            style={[styles.countryPickerItem, isSelected && styles.countryPickerItemSelected]}
                            onPress={() => handleSelectManualCountry(country)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.countryPickerItemRow}>
                              <Text style={styles.countryPickerItemFlag}>{toFlagEmoji(country.code) || '--'}</Text>
                              <View style={styles.countryPickerItemCopy}>
                                <Text style={[styles.countryPickerItemLabel, isSelected && styles.countryPickerItemLabelSelected]}>
                                  {country.label}
                                </Text>
                                <Text style={styles.countryPickerItemMeta}>{`${country.dial} • ${country.code}`}</Text>
                              </View>
                            </View>
                            {isSelected ? (
                              <MaterialCommunityIcons name="check" size={20} color={theme.tint} />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                <GlobalCityField
                  countryCode={manualCountryCode}
                  countryName={selectedManualCountry?.label || 'your country'}
                  value={manualLocation}
                  region={manualRegion}
                  selectedGeonameId={manualSelectedGeonameId}
                  dark={isDark}
                  styles={manualCityStyles}
                  error={locationError || undefined}
                  required
                  onSelect={(place) => {
                    setManualLocality(place);
                    setManualLocation(place?.name || '');
                    setManualRegion(place?.admin1Name || null);
                    setLocationError(null);
                  }}
                />

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
            onMomentViewed={(momentId) => {
              const normalizedMomentId = String(momentId || '').trim();
              if (!normalizedMomentId) return;
              setViewedMomentIds((prev) => {
                if (prev.has(normalizedMomentId)) return prev;
                const next = new Set(prev);
                next.add(normalizedMomentId);
                if (viewedMomentIdsStorageKey) {
                  AsyncStorage.setItem(viewedMomentIdsStorageKey, JSON.stringify(Array.from(next))).catch(() => {});
                }
                return next;
              });
            }}
            onClose={() => {
              setMomentViewerVisible(false);
              setMomentStartUserId(null);
            }}
          />
          <IntentRequestSheet
            visible={intentSheetVisible}
            onClose={() => {
              setIntentSheetVisible(false);
              setIntentTarget(null);
            }}
            recipientId={intentTarget?.id}
            recipientName={intentTarget?.name ?? null}
            metadata={{ source: 'vibes' }}
            onSent={(requestId) => {
              if (intentTarget?.id) {
                recordVibesEvent(intentTarget.id, 'intent_sent', {
                  position: intentTarget.deckIndex ?? currentIndex,
                  metadata: { request_id: requestId ?? null },
                });
                closeActiveVibesExposure('intent');
              }
              if (intentTarget?.deckIndex != null) {
                pushVibesAction({
                  kind: 'intent',
                  id: intentTarget.id,
                  requestId,
                  index: intentTarget.deckIndex,
                });
                setCurrentIndex((i) => Math.max(i, intentTarget.deckIndex! + 1));
              }
            }}
          />
          <SendSignalSheet
            visible={signalSheetVisible}
            receiverProfileId={signalTarget?.id}
            receiverName={signalTarget?.name ?? null}
            match={signalTarget?.match ?? null}
            source="vibes_card"
            onClose={() => {
              setSignalSheetVisible(false);
              setSignalTarget(null);
            }}
            onPaywall={showSignalUpsell}
            onSent={({ signalId }) => {
              if (signalTarget?.id) {
                recordVibesEvent(signalTarget.id, 'signal_sent', {
                  position: signalTarget.deckIndex ?? currentIndex,
                  metadata: { signal_id: signalId },
                });
                closeActiveVibesExposure('signal');
              }
              if (signalTarget?.deckIndex != null) {
                pushVibesAction({
                  kind: 'signal',
                  id: signalTarget.id,
                  signalId,
                  index: signalTarget.deckIndex,
                });
                setCurrentIndex((i) => Math.max(i, signalTarget.deckIndex! + 1));
              }
              void refreshSignalAccess();
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
               
              const chatPeerId = m?.user_id ?? m?.id;
              if (chatPeerId) {
                router.push({ pathname: '/chat/[id]', params: { id: String(chatPeerId), userName: m?.name, userAvatar: m?.avatar_url, isOnline: String(!!m?.isActiveNow) } });
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
          title={videoModalTitle ?? undefined}
          subtitle={videoModalSubtitle ?? undefined}
          onCompleted={() => {
            if (!videoModalProfileId) return;
            recordVibesEvent(videoModalProfileId, 'intro_completed', {
              position: currentIndex,
              dwellMs: getActiveCardDwellMs(videoModalProfileId),
            });
            closeActiveVibesExposure('intro_complete');
          }}
          onClose={() => {
            setVideoModalVisible(false);
            setVideoModalUrl(null);
            setVideoModalTitle(null);
            setVideoModalSubtitle(null);
            setVideoModalProfileId(null);
            setPreviewingId(null);
          }}
        />
        <OnboardingArrivalCelebration
          visible={showOnboardingCelebration}
          onDismiss={() => setShowOnboardingCelebration(false)}
        />
      </SafeAreaView>
      </DepthBackground>
    </GestureHandlerRootView>
  );
}

function PremiumRangeSlider({
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  minLabel,
  maxLabel,
  onChange,
  theme,
  isDark,
}: {
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  minLabel?: string;
  maxLabel?: string;
  onChange: (nextMin: number, nextMax: number) => void;
  theme: typeof Colors.light;
  isDark: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);
  const trackWidthRef = useRef(0);
  const boundsRef = useRef({ min, max });
  const stepRef = useRef(step);
  const valuesRef = useRef({ valueMin, valueMax });
  const startRef = useRef({ valueMin, valueMax });
  const onChangeRef = useRef(onChange);
  const bubbleAnim = useRef(new Animated.Value(0)).current;
  const lastHapticRef = useRef({ min: valueMin, max: valueMax });

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
    lastHapticRef.current = { min: valueMin, max: valueMax };
  }, [valueMax, valueMin]);

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

  const showBubble = useCallback((thumb: 'min' | 'max') => {
    setActiveThumb(thumb);
    Animated.timing(bubbleAnim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [bubbleAnim]);

  const hideBubble = useCallback(() => {
    Animated.timing(bubbleAnim, {
      toValue: 0,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setActiveThumb(null);
    });
  }, [bubbleAnim]);

  const emitSelectionHaptic = useCallback((thumb: 'min' | 'max', nextValue: number) => {
    if (lastHapticRef.current[thumb] === nextValue) return;
    lastHapticRef.current[thumb] = nextValue;
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const minPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { ...valuesRef.current };
        showBubble('min');
      },
      onPanResponderMove: (_evt, gesture) => {
        const w = trackWidthRef.current;
        const { min: bMin, max: bMax } = boundsRef.current;
        if (!w || bMax <= bMin) return;
        const pxPerValue = w / (bMax - bMin);
        const delta = gesture.dx / pxPerValue;
        const nextMin = startRef.current.valueMin + delta;
        const maxAllowed = valuesRef.current.valueMax;
        const snappedMin = snapClamp(nextMin, bMin, maxAllowed);
        emitSelectionHaptic('min', snappedMin);
        onChangeRef.current(snappedMin, maxAllowed);
      },
      onPanResponderRelease: hideBubble,
      onPanResponderTerminate: hideBubble,
    }),
  ).current;

  const maxPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { ...valuesRef.current };
        showBubble('max');
      },
      onPanResponderMove: (_evt, gesture) => {
        const w = trackWidthRef.current;
        const { min: bMin, max: bMax } = boundsRef.current;
        if (!w || bMax <= bMin) return;
        const pxPerValue = w / (bMax - bMin);
        const delta = gesture.dx / pxPerValue;
        const nextMax = startRef.current.valueMax + delta;
        const minAllowed = valuesRef.current.valueMin;
        const snappedMax = snapClamp(nextMax, minAllowed, bMax);
        emitSelectionHaptic('max', snappedMax);
        onChangeRef.current(minAllowed, snappedMax);
      },
      onPanResponderRelease: hideBubble,
      onPanResponderTerminate: hideBubble,
    }),
  ).current;

  const range = Math.max(1, max - min);
  const minPos = trackWidth > 0 ? ((valueMin - min) / range) * trackWidth : 0;
  const maxPos = trackWidth > 0 ? ((valueMax - min) / range) * trackWidth : 0;
  const clampedMinPos = clamp(minPos, 0, trackWidth);
  const clampedMaxPos = clamp(maxPos, 0, trackWidth);

  const thumbSize = 32;
  const trackH = 4;
  const trackBg = isDark ? 'rgba(244,235,221,0.10)' : 'rgba(7,30,34,0.10)';
  const activeBg = theme.tint;
  const thumbBg = isDark ? '#0c1d22' : '#fffaf6';
  const thumbBorder = isDark ? 'rgba(127,228,220,0.24)' : 'rgba(19,168,168,0.24)';
  const bubbleX = activeThumb === 'min' ? clampedMinPos : clampedMaxPos;
  const bubbleValue = activeThumb === 'min' ? valueMin : valueMax;
  const bubbleTranslateY = bubbleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const bubbleScale = bubbleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <View style={{ marginTop: 6 }}>
      <View
        style={{ paddingHorizontal: thumbSize / 2, paddingVertical: 6 }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width - thumbSize; // remove padding on both sides
          setTrackWidth(Math.max(0, Math.round(w)));
        }}
      >
        <View style={{ height: Math.max(thumbSize, 34), justifyContent: 'center' }}>
          {activeThumb ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: thumbSize / 2 + bubbleX - 24,
                top: -38,
                minWidth: 48,
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: 13,
                backgroundColor: isDark ? 'rgba(19,168,168,0.92)' : '#0d6f72',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(244,235,221,0.12)' : 'rgba(255,255,255,0.22)',
                shadowColor: theme.tint,
                shadowOpacity: 0.18,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 5 },
                elevation: 3,
                opacity: bubbleAnim,
                transform: [{ translateY: bubbleTranslateY }, { scale: bubbleScale }],
              }}
            >
              <Text style={{ color: '#F4EBDD', fontSize: 13, fontWeight: '800', textAlign: 'center' }}>
                {bubbleValue}
              </Text>
            </Animated.View>
          ) : null}
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
              shadowColor: theme.tint,
              shadowOpacity: isDark ? 0.18 : 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
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
              shadowColor: theme.tint,
              shadowOpacity: activeThumb === 'min' ? (isDark ? 0.18 : 0.12) : (isDark ? 0.06 : 0.04),
              shadowRadius: activeThumb === 'min' ? 12 : 8,
              shadowOffset: { width: 0, height: activeThumb === 'min' ? 7 : 4 },
              elevation: activeThumb === 'min' ? 7 : 4,
            }}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Minimum age, ${valueMin}`}
            accessibilityValue={{ min, max, now: valueMin }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: activeBg, opacity: 0.96 }} />
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
              shadowColor: theme.tint,
              shadowOpacity: activeThumb === 'max' ? (isDark ? 0.18 : 0.12) : (isDark ? 0.06 : 0.04),
              shadowRadius: activeThumb === 'max' ? 12 : 8,
              shadowOffset: { width: 0, height: activeThumb === 'max' ? 7 : 4 },
              elevation: activeThumb === 'max' ? 7 : 4,
            }}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Maximum age, ${valueMax}`}
            accessibilityValue={{ min, max, now: valueMax }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: activeBg, opacity: 0.96 }} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.textMuted, opacity: 0.92 }}>{minLabel ?? valueMin}</Text>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.textMuted, opacity: 0.92 }}>{maxLabel ?? valueMax}</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: typeof Colors.light, isDark: boolean) {
  const surface = isDark ? '#111827' : '#fff';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const outline = isDark ? 'rgba(255,255,255,0.12)' : '#e5e7eb';
  const shadowColor = isDark ? '#000' : '#0f172a';
  const infoButtonBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.95)';
  const infoButtonBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.35)';
  const placeholderBg = isDark ? '#1f2937' : '#e2e8f0';
  const placeholderText = isDark ? '#cbd5e1' : '#64748b';
  const pillBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';
  const chipBg = isDark ? 'rgba(255,255,255,0.04)' : '#fff';
  const toggleKnob = isDark ? '#1f2937' : '#e5e7eb';
  const modalBackdrop = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
  const badgeBg = isDark ? '#0b1220' : '#111827';
  const ghostBg = isDark ? 'rgba(255,255,255,0.04)' : '#fff';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    scrollContent: { flexGrow: 1, paddingTop: 4 },
    stackWrapper: {
      position: 'relative',
      alignItems: "center",
      justifyContent: "flex-start",
      marginTop: -2,
      alignSelf: 'center',
    },
    momentsCapsuleFlow: {
      marginHorizontal: 20,
      zIndex: 8,
      elevation: 8,
    },
    momentsCapsuleFlowCompact: {
      marginHorizontal: 14,
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
      backgroundColor: isDark ? 'rgba(9,18,22,0.58)' : 'rgba(255,255,255,0.58)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
      shadowColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.22 : 0.12,
      shadowRadius: 24,
      elevation: 12,
      overflow: 'hidden',
    },
    actionSecondaryCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 10,
      paddingRight: 10,
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)',
      opacity: 0.86,
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
      shadowOpacity: isDark ? 0.12 : 0.08,
      shadowRadius: 10,
      elevation: 5,
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
      shadowOpacity: isDark ? 0.1 : 0.06,
      shadowRadius: 8,
      elevation: 3,
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
      shadowOpacity: isDark ? 0.22 : 0.16,
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
      shadowOpacity: isDark ? 0.28 : 0.2,
      shadowRadius: 18,
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
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc',
      borderWidth: 1,
      borderColor: outline,
    },
    headerBadgeDisabled: { opacity: 0.7 },
    headerBadgeText: { color: theme.tint, fontSize: 12, fontWeight: '700' },
    headerIntentBadge: {
      position: 'relative',
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(19,168,168,0.22)' : 'rgba(19,128,128,0.14)',
      backgroundColor: isDark ? 'rgba(19,168,168,0.06)' : 'rgba(255,255,255,0.62)',
      overflow: 'visible',
    },
    headerIntentBadgeUrgent: {
      borderColor: isDark ? 'rgba(244,232,208,0.18)' : 'rgba(139,92,255,0.15)',
      backgroundColor: isDark ? 'rgba(244,232,208,0.055)' : 'rgba(255,248,241,0.70)',
      shadowColor: theme.accent,
      shadowOpacity: isDark ? 0.14 : 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    headerIntentBadgePulse: {
      position: 'absolute',
      left: -3,
      right: -3,
      top: -3,
      bottom: -3,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(19,168,168,0.16)' : 'rgba(19,168,168,0.12)',
    },
    headerIntentBadgePulseUrgent: {
      backgroundColor: isDark ? 'rgba(244,232,208,0.16)' : 'rgba(139,92,255,0.13)',
    },
    headerIntentBadgeCount: {
      position: 'absolute',
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#071E22' : '#F7EFE3',
      backgroundColor: theme.tint,
    },
    headerIntentBadgeCountUrgent: {
      backgroundColor: theme.accent,
    },
    headerIntentBadgeText: { color: Colors.light.background, fontSize: 10, lineHeight: 12, fontWeight: '900' },
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
    emptyCardCompact: {
      width: '92%',
      paddingHorizontal: 16,
      paddingVertical: 18,
      borderRadius: 16,
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
    emptyTitleCompact: { fontSize: 17, lineHeight: 22 },
    emptySubtitle: { fontSize: 14, color: theme.textMuted, textAlign: 'center', marginBottom: 16 },
    emptySubtitleCompact: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
    emptyActions: { flexDirection: 'row', width: '100%', justifyContent: 'center' },
    emptyActionsCompact: { flexDirection: 'column', gap: 10 },
    primaryButton: { backgroundColor: theme.tint, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginRight: 8 },
    primaryButtonCompact: { width: '100%', marginRight: 0, paddingVertical: 13 },
    primaryButtonText: { color: '#fff', fontWeight: '700' },
    primaryButtonTextCompact: { fontSize: 14, textAlign: 'center' },
    ghostButton: { borderWidth: 1, borderColor: outline, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: ghostBg },
    ghostButtonCompact: { width: '100%', paddingVertical: 13 },
    ghostButtonText: { color: theme.text, fontWeight: '600' },
    ghostButtonTextCompact: { fontSize: 14, textAlign: 'center' },
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
      backgroundColor: isDark ? 'rgba(8,18,28,0.82)' : 'rgba(252,247,241,0.84)',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 20,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(214,178,132,0.24)',
      overflow: 'hidden',
      shadowColor,
      shadowOpacity: isDark ? 0.22 : 0.10,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    modalHandle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.14)',
      marginBottom: 14,
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
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(214,178,132,0.18)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.48)',
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
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(214,178,132,0.16)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,250,246,0.68)',
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
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(214,178,132,0.18)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.76)',
    },
    activeFilterChipText: { fontSize: 12, fontWeight: '700', color: theme.text },
    activeFiltersSummaryTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: theme.text, marginTop: 4 },
    activeFiltersSummaryBody: { fontSize: 12.5, lineHeight: 18, color: theme.textMuted, marginTop: 2 },
    activeFiltersEmpty: { fontSize: 12.5, lineHeight: 18, color: theme.textMuted, marginTop: 6 },
    modalInput: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(214,178,132,0.20)',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text,
      backgroundColor: isDark ? 'rgba(8,18,28,0.68)' : 'rgba(255,255,255,0.74)',
    },
    modalLabel: { fontSize: 13, fontWeight: '700', color: theme.text, marginTop: 14, marginBottom: 8 },
    countrySelectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: outline,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 11,
      backgroundColor: chipBg,
      gap: 12,
    },
    countrySelectButtonDisabled: {
      opacity: 0.72,
    },
    countrySelectValue: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    countrySelectFlag: {
      fontSize: 20,
      width: 28,
      textAlign: 'center',
    },
    countrySelectFlagPlaceholder: {
      color: theme.textMuted,
    },
    countrySelectCopy: {
      flex: 1,
      gap: 2,
    },
    countrySelectLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    countrySelectPlaceholder: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textMuted,
    },
    countrySelectMeta: {
      fontSize: 12,
      color: theme.textMuted,
    },
    inlineCountryPickerPanel: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: outline,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(8,18,28,0.72)' : 'rgba(255,255,255,0.82)',
      overflow: 'hidden',
    },
    countryPickerContainer: {
      flex: 1,
    },
    countryPickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: outline,
    },
    countryPickerHeaderAction: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.tint,
      width: 56,
    },
    countryPickerHeaderTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.text,
    },
    countrySearchWrap: {
      marginHorizontal: 18,
      marginTop: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: outline,
      borderRadius: 14,
      paddingHorizontal: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.78)',
    },
    countrySearchInput: {
      flex: 1,
      minHeight: 44,
      fontSize: 15,
      color: theme.text,
    },
    countryPickerList: {
      flex: 1,
    },
    inlineCountryPickerList: {
      maxHeight: 240,
    },
    countryPickerListContent: {
      paddingHorizontal: 18,
      paddingBottom: 32,
    },
    countryPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: outline,
      gap: 12,
    },
    countryPickerItemSelected: {
      backgroundColor: isDark ? 'rgba(17,197,198,0.06)' : 'rgba(255,248,241,0.9)',
    },
    countryPickerItemRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    countryPickerItemFlag: {
      fontSize: 22,
      width: 28,
      textAlign: 'center',
    },
    countryPickerItemCopy: {
      flex: 1,
      gap: 2,
    },
    countryPickerItemLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    countryPickerItemLabelSelected: {
      color: theme.tint,
    },
    countryPickerItemMeta: {
      fontSize: 12,
      color: theme.textMuted,
    },
    modalPreviewRow: {
      marginTop: 2,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(17,197,198,0.16)' : 'rgba(214,178,132,0.18)',
      backgroundColor: isDark ? 'rgba(12,27,34,0.62)' : 'rgba(255,250,245,0.74)',
    },
    modalPreviewEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1, color: theme.tint, textTransform: 'uppercase', textAlign: 'center' },
    modalPreviewTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: theme.text, textAlign: 'center', marginTop: 4 },
    modalPreviewBody: { fontSize: 12.5, lineHeight: 18, fontWeight: '600', color: theme.textMuted, textAlign: 'center', marginTop: 4 },
    modalActions: { flexDirection: 'row', marginTop: 4, gap: 10 },
    filterSection: { marginTop: 12, marginBottom: 10 },
    filterSectionCard: {
      borderRadius: 20,
      paddingHorizontal: 15,
      paddingVertical: 15,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.72)',
      gap: 10,
      shadowColor,
      shadowOpacity: isDark ? 0.08 : 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    filterSectionCardPremium: {
      borderColor: isDark ? 'rgba(17,197,198,0.15)' : 'rgba(214,178,132,0.22)',
      backgroundColor: isDark ? 'rgba(18,36,43,0.40)' : 'rgba(255,250,245,0.76)',
    },
    filterSectionCardMixed: {
      borderColor: isDark ? 'rgba(214,184,120,0.14)' : 'rgba(229,190,138,0.20)',
      backgroundColor: isDark ? 'rgba(34,30,23,0.28)' : 'rgba(255,251,245,0.70)',
    },
    filterSectionCardFree: {
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,254,253,0.74)',
    },
    filterSectionHeader: { gap: 3 },
    filterSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    filterSectionEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: theme.tint, textTransform: 'uppercase' },
    filterSectionTitle: { fontSize: 17, lineHeight: 21, fontWeight: '800', color: theme.text },
    filterSectionBody: { fontSize: 12.5, lineHeight: 18, color: theme.textMuted },
    filterTierPill: {
      paddingHorizontal: 9,
      paddingVertical: 3,
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
      backgroundColor: isDark ? 'rgba(246,196,83,0.10)' : 'rgba(255,249,238,0.88)',
      borderColor: isDark ? 'rgba(246,196,83,0.18)' : 'rgba(214,184,120,0.22)',
    },
    filterTierPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.45 },
    filterTierPillTextPremium: { color: isDark ? '#7fe4dc' : '#0b6b69' },
    filterTierPillTextFree: { color: theme.text },
    filterTierPillTextMixed: { color: isDark ? '#e6c28a' : '#8a5a09' },
    filterFieldGroup: { gap: 6 },
    filterSubsectionEyebrow: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.15,
      color: theme.tint,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    filterSubsectionDivider: {
      height: 1,
      backgroundColor: isDark ? 'rgba(244,235,221,0.06)' : 'rgba(7,30,34,0.07)',
      marginVertical: 6,
    },
    filterLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
    filterHelperText: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    filterHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    filterChipsRow: { flexDirection: 'row', marginTop: 8 },
    filterChipsRowWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 8 },
    filterPresetRail: { paddingTop: 6, paddingBottom: 2, paddingRight: 8, gap: 10 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
      marginRight: 0,
      backgroundColor: chipBg,
      shadowColor: shadowColor,
      shadowOpacity: isDark ? 0.04 : 0.03,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
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
      shadowOpacity: isDark ? 0.14 : 0.10,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
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
    filterInput: { borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(214,178,132,0.20)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontWeight: '700', color: theme.text, backgroundColor: isDark ? 'rgba(8,18,28,0.68)' : 'rgba(255,255,255,0.74)', marginTop: 4 },
    ageFieldGroup: {
      gap: 9,
      paddingTop: 4,
    },
    ageTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    ageSectionTitle: {
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '800',
      color: theme.text,
    },
    ageEditAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 1,
      minHeight: 34,
      paddingHorizontal: 0,
      alignSelf: 'flex-start',
    },
    ageEditActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.tint,
    },
    ageHeroPanel: {
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(244,235,221,0.06)' : 'rgba(7,30,34,0.07)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.48)',
      gap: 4,
    },
    ageHeroValue: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      letterSpacing: -0.8,
      color: theme.text,
    },
    ageHeroSupport: {
      fontSize: 12.5,
      lineHeight: 17,
      color: theme.textMuted,
    },
    agePresetRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
    },
    agePresetChip: {
      flex: 1,
      minHeight: 40,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(244,235,221,0.10)' : 'rgba(7,30,34,0.10)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.56)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    agePresetChipActive: {
      backgroundColor: isDark ? 'rgba(19,168,168,0.10)' : 'rgba(19,168,168,0.08)',
      borderColor: isDark ? 'rgba(19,168,168,0.24)' : 'rgba(19,168,168,0.20)',
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.08 : 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
    },
    agePresetChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textMuted,
    },
    agePresetChipTextActive: {
      color: theme.tint,
    },
    agePresetMeta: {
      fontSize: 11,
      lineHeight: 15,
      color: theme.textMuted,
      marginTop: 1,
    },
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
      minWidth: 40,
      height: 40,
      paddingHorizontal: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: outline,
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(248,250,252,0.96)',
      shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.1 : 0.06,
      shadowRadius: 8,
      elevation: 4,
    },
    headerPracticeText: {
      color: theme.tint,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 11,
    },
  });
}
