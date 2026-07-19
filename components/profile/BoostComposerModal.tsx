import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  BoostAnalytics,
  BoostAudienceMode,
  BoostFocusMode,
  BoostRecommendation,
  BoostType,
  CreateBoostInput,
} from '@/lib/boosts';
import {
  formatBoostAudienceLabel,
  formatBoostFocusLabel,
  formatBoostTypeLabel,
} from '@/lib/boosts';
import type { PremiumPlan } from '@/lib/subscriptions';

export type BoostComposerFeedback = {
  tone: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
};

type BoostComposerSyncState = {
  status: 'queued' | 'failed';
  title: string;
  message: string;
  actionLabel?: string | null;
};

type Props = {
  visible: boolean;
  plan: PremiumPlan;
  activeBoostEndsAt?: string | null;
  recommendation: BoostRecommendation | null;
  analytics: BoostAnalytics | null;
  queuedDraft?: CreateBoostInput | null;
  syncState?: BoostComposerSyncState | null;
  loading: boolean;
  submitting: boolean;
  theme: {
    background: string;
    backgroundSubtle: string;
    text: string;
    textMuted: string;
    tint: string;
    accent: string;
    outline: string;
  };
  isDark: boolean;
  feedback?: BoostComposerFeedback | null;
  onClose: () => void;
  onLockedGoldPress?: (context: 'boost_type' | 'audience_mode' | 'focus', optionId?: string) => void;
  onSyncAction?: () => void;
  onSubmit: (input: CreateBoostInput) => void;
};

const formatTimeLabel = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getRemainingMs = (endsAt?: string | null) => {
  if (!endsAt) return 0;
  const ts = new Date(endsAt).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, ts - Date.now());
};

const formatCountdown = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatAudienceCount = (count: number, singular: string, plural = `${singular}s`) => {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural}`;
};

const formatRecipeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const AUDIENCE_FALLBACK: { id: BoostAudienceMode; label: string; description: string }[] = [
  { id: 'for_you', label: 'For you', description: 'Balanced visibility across your strongest fit lane.' },
  { id: 'nearby', label: 'Nearby', description: 'Bias toward local discovery and close distance.' },
  { id: 'active_now', label: 'Active now', description: 'Bias toward people who are currently around.' },
  { id: 'intent_match', label: 'Intent match', description: 'Favor people who look aligned with your intent.' },
  { id: 'second_look', label: 'Second look', description: 'Quietly resurface to earlier curious viewers.' },
];

const FOCUS_FALLBACK: { id: BoostFocusMode; label: string; description: string }[] = [
  { id: 'profile', label: 'Profile', description: 'Lead with your full profile story.' },
  { id: 'intro', label: 'Intro', description: 'Lean into people likely to open your intro.' },
  { id: 'intent', label: 'Intent', description: 'Lean into deeper fit evaluation.' },
];

const LOCKED_TINT = 'rgba(255,255,255,0.08)';

export default function BoostComposerModal({
  visible,
  plan,
  activeBoostEndsAt,
  recommendation,
  analytics,
  queuedDraft,
  syncState,
  loading,
  submitting,
  theme,
  isDark,
  feedback,
  onClose,
  onLockedGoldPress,
  onSyncAction,
  onSubmit,
}: Props) {
  const { width } = useWindowDimensions();
  const isCompactWidth = width <= 390;
  const isGold = plan === 'GOLD';
  const resolvedActiveBoostEndsAt =
    activeBoostEndsAt ?? recommendation?.active_boost_ends_at ?? analytics?.boost?.ends_at ?? null;
  const activeBoostTimeLabel = formatTimeLabel(resolvedActiveBoostEndsAt);
  const recommendedStartLabel = formatTimeLabel(recommendation?.recommended_start_at);
  const [boostType, setBoostType] = useState<BoostType>(isGold ? 'smart' : 'manual');
  const [audienceMode, setAudienceMode] = useState<BoostAudienceMode>(isGold ? 'intent_match' : 'for_you');
  const [focusMode, setFocusMode] = useState<BoostFocusMode>('profile');
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(resolvedActiveBoostEndsAt));
  const feedbackOpacity = useState(() => new Animated.Value(0))[0];
  const feedbackTranslateY = useState(() => new Animated.Value(-8))[0];
  const rocketTravel = useState(() => new Animated.Value(0))[0];
  const countdownPulse = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    if (!visible) return;
    setBoostType(
      queuedDraft?.boostType ??
        recommendation?.best_recent_recipe?.boost_type ??
        (isGold ? 'smart' : 'manual'),
    );
    setAudienceMode(
      queuedDraft?.audienceMode ??
        recommendation?.recommended_audience_mode ??
        recommendation?.best_recent_recipe?.audience_mode ??
        (isGold ? 'intent_match' : 'for_you'),
    );
    setFocusMode(
      queuedDraft?.focusMode ??
        recommendation?.recommended_focus_mode ??
        recommendation?.best_recent_recipe?.focus_mode ??
        (isGold ? 'intro' : 'profile'),
    );
  }, [
    isGold,
    queuedDraft?.audienceMode,
    queuedDraft?.boostType,
    queuedDraft?.focusMode,
    recommendation?.best_recent_recipe?.audience_mode,
    recommendation?.best_recent_recipe?.boost_type,
    recommendation?.best_recent_recipe?.focus_mode,
    recommendation?.recommended_audience_mode,
    recommendation?.recommended_focus_mode,
    visible,
  ]);

  useEffect(() => {
    if (!visible) {
      setRemainingMs(0);
      return;
    }
    setRemainingMs(getRemainingMs(resolvedActiveBoostEndsAt));
    if (!resolvedActiveBoostEndsAt) return;

    const timer = setInterval(() => {
      setRemainingMs(getRemainingMs(resolvedActiveBoostEndsAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [resolvedActiveBoostEndsAt, visible]);

  useEffect(() => {
    feedbackOpacity.stopAnimation();
    feedbackTranslateY.stopAnimation();
    if (!feedback || !visible) {
      feedbackOpacity.setValue(0);
      feedbackTranslateY.setValue(-8);
      return;
    }

    Animated.parallel([
      Animated.timing(feedbackOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(feedbackTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [feedback, feedbackOpacity, feedbackTranslateY, visible]);

  useEffect(() => {
    rocketTravel.stopAnimation();
    if (!submitting) {
      rocketTravel.setValue(0);
      return;
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(rocketTravel, {
          toValue: 1,
          duration: 950,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(rocketTravel, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    return () => {
      rocketTravel.stopAnimation();
      rocketTravel.setValue(0);
    };
  }, [rocketTravel, submitting]);

  useEffect(() => {
    countdownPulse.stopAnimation();
    if (!(visible && remainingMs > 0)) {
      countdownPulse.setValue(1);
      return;
    }

    Animated.loop(
      Animated.sequence([
        Animated.timing(countdownPulse, {
          toValue: 1.03,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(countdownPulse, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    return () => {
      countdownPulse.stopAnimation();
      countdownPulse.setValue(1);
    };
  }, [countdownPulse, remainingMs, visible]);

  const audienceOptions = useMemo(() => {
    if (!recommendation?.audience_options?.length) return AUDIENCE_FALLBACK;
    const mapped = new Map(
      recommendation.audience_options.map((option) => [String(option.id), option]),
    );
    return AUDIENCE_FALLBACK.map((fallback) => mapped.get(fallback.id) ?? fallback);
  }, [recommendation?.audience_options]);

  const focusOptions = useMemo(() => {
    if (!recommendation?.focus_options?.length) return FOCUS_FALLBACK;
    const mapped = new Map(
      recommendation.focus_options.map((option) => [String(option.id), option]),
    );
    return FOCUS_FALLBACK.map((fallback) => mapped.get(fallback.id) ?? fallback);
  }, [recommendation?.focus_options]);

  const isAudienceUnlocked = useMemo(
    () => (mode: BoostAudienceMode) => isGold || mode === 'for_you' || mode === 'nearby',
    [isGold],
  );

  const isFocusUnlocked = useMemo(
    () => (mode: BoostFocusMode) => isGold || mode === 'profile',
    [isGold],
  );

  const latestBoostLabel = useMemo(() => {
    if (!analytics?.boost) return null;
    return `${formatBoostTypeLabel(analytics.boost.boost_type)} for ${formatBoostAudienceLabel(
      analytics.boost.audience_mode,
    )} with ${formatBoostFocusLabel(analytics.boost.focus_mode)} focus`;
  }, [analytics?.boost]);

  const bestRecipeDateLabel = formatRecipeDate(recommendation?.best_recent_recipe?.created_at);
  const lastRecipeDateLabel = formatRecipeDate(recommendation?.last_used_recipe?.created_at);
  const bestRecipeAccent = useMemo(() => {
    switch (recommendation?.best_recent_recipe?.confidence) {
      case 'proven':
        return '#2ED6C2';
      case 'emerging':
        return '#F6C453';
      default:
        return theme.textMuted;
    }
  }, [recommendation?.best_recent_recipe?.confidence, theme.textMuted]);
  const isLastUsedSameAsBestRecent = useMemo(() => {
    if (!recommendation?.best_recent_recipe || !recommendation?.last_used_recipe) return false;
    return (
      recommendation.best_recent_recipe.boost_type === recommendation.last_used_recipe.boost_type &&
      recommendation.best_recent_recipe.audience_mode === recommendation.last_used_recipe.audience_mode &&
      recommendation.best_recent_recipe.focus_mode === recommendation.last_used_recipe.focus_mode
    );
  }, [recommendation?.best_recent_recipe, recommendation?.last_used_recipe]);

  const outcomeQuality = useMemo(() => {
    const metrics = analytics?.metrics;
    if (!metrics) return null;
    const reach = Math.max(metrics.unique_viewers, 0);
    const saveRate = reach > 0 ? Math.round((metrics.unique_savers / reach) * 100) : 0;
    const intentRate = reach > 0 ? Math.round((metrics.unique_intent_viewers / reach) * 100) : 0;
    const matchRate = reach > 0 ? Math.round((metrics.accepted_matches / reach) * 100) : 0;
    return {
      saveRate,
      intentRate,
      matchRate,
    };
  }, [analytics?.metrics]);

  const audienceQualityItems = useMemo(() => {
    if (!analytics?.metrics) return [];
    return [
      {
        key: 'saves',
        icon: 'bookmark-check-outline' as const,
        label: 'Trusted saves',
        detail: formatAudienceCount(analytics.metrics.unique_savers, 'person'),
      },
      {
        key: 'intent',
        icon: 'compass-outline' as const,
        label: 'Intent viewers',
        detail: formatAudienceCount(analytics.metrics.unique_intent_viewers, 'person'),
      },
      {
        key: 'matches',
        icon: 'hand-heart-outline' as const,
        label: 'Match conversion',
        detail: formatAudienceCount(analytics.metrics.accepted_matches, 'match'),
      },
    ];
  }, [analytics?.metrics]);

  const activeBoostProgress = useMemo(() => {
    if (!analytics?.boost?.starts_at || !resolvedActiveBoostEndsAt) return 0;
    const startsAt = new Date(analytics.boost.starts_at).getTime();
    const endsAt = new Date(resolvedActiveBoostEndsAt).getTime();
    const now = Date.now();
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || endsAt <= startsAt) return 0;
    return Math.max(0, Math.min(1, (now - startsAt) / (endsAt - startsAt)));
  }, [analytics?.boost?.starts_at, resolvedActiveBoostEndsAt, remainingMs]);

  const liveOutcomeRead = useMemo(() => {
    const metrics = analytics?.metrics;
    if (!metrics || !analytics?.boost?.is_active) return null;

    const reach = Math.max(metrics.unique_viewers, 0);
    const saves = Math.max(metrics.unique_savers, 0);
    const intents = Math.max(metrics.unique_intent_viewers, 0);
    const matches = Math.max(metrics.accepted_matches, 0);
    const intros = Math.max(metrics.intro_opens, 0);
    const saveRate = reach > 0 ? (saves / reach) * 100 : 0;
    const intentRate = reach > 0 ? (intents / reach) * 100 : 0;

    if (matches >= 1) {
      return {
        label: 'Converting',
        tone: 'success' as const,
        message: 'This boost is already turning trusted visibility into real match outcomes.',
        nextStep: 'Keep this audience and focus recipe. It is producing real downstream action, not just exposure.',
        futurePlay: 'Reuse this exact combination in a similar active window later.',
      };
    }

    if (intents >= 2 || intentRate >= 12) {
      return {
        label: 'High intent',
        tone: 'accent' as const,
        message: 'Trusted viewers are moving beyond curiosity. Stay visible and be ready for deeper action.',
        nextStep: 'Stay available on chat-ready surfaces and avoid changing the recipe mid-window.',
        futurePlay: 'This audience and focus mix is a strong candidate for your next precision session.',
      };
    }

    if (saves >= 2 || saveRate >= 14 || (reach >= 12 && intros >= 3)) {
      return {
        label: 'Strong fit',
        tone: 'tint' as const,
        message: 'The audience quality looks healthy. People are saving or leaning deeper into the profile.',
        nextStep: 'Let the boost keep running. The quality is good enough that forcing changes now would add noise.',
        futurePlay: 'Use the same lane again when you want dependable quality over raw volume.',
      };
    }

    if (saves >= 1 || intents >= 1 || reach >= 6 || activeBoostProgress >= 0.35) {
      return {
        label: 'Early signal',
        tone: 'warning' as const,
        message: 'Curiosity is starting to form. Let the window keep working before judging the result too early.',
        nextStep: 'Hold the line for now. Reassess after more trusted reach lands instead of reacting to the first few signals.',
        futurePlay: 'If this stabilizes into saves or intent, this recipe is worth repeating later.',
      };
    }

    return {
      label: 'Warming up',
      tone: 'muted' as const,
      message: 'Trusted reach is still building. The first few minutes are usually about exposure, not conversion.',
      nextStep: 'Do nothing yet. This stage is about letting the audience accumulate before reading quality.',
      futurePlay: 'Too early to judge the recipe. Wait for more trusted reach before changing strategy.',
    };
  }, [activeBoostProgress, analytics?.boost?.is_active, analytics?.metrics]);

  const hasSyncBlock = syncState?.status === 'queued' || syncState?.status === 'failed';
  const canSubmit = !submitting && !hasSyncBlock && !(recommendation?.has_active_boost || resolvedActiveBoostEndsAt);
  const countdownLabel = formatCountdown(remainingMs);
  const feedbackAccent = useMemo(() => {
    switch (feedback?.tone) {
      case 'success':
        return '#2ED6C2';
      case 'warning':
        return '#FFBE59';
      case 'error':
        return '#FF7C8E';
      default:
        return theme.tint;
    }
  }, [feedback?.tone, theme.tint]);
  const liveReadAccent = useMemo(() => {
    switch (liveOutcomeRead?.tone) {
      case 'success':
        return '#2ED6C2';
      case 'accent':
        return theme.accent;
      case 'warning':
        return '#FFBE59';
      case 'muted':
        return theme.textMuted;
      default:
        return theme.tint;
    }
  }, [liveOutcomeRead?.tone, theme.accent, theme.textMuted, theme.tint]);
  const applyBestRecentRecipe = () => {
    const recipe = recommendation?.best_recent_recipe;
    if (!recipe) return;
    applyRecipe(recipe.boost_type, recipe.audience_mode, recipe.focus_mode);
  };
  const applyLastUsedRecipe = () => {
    const recipe = recommendation?.last_used_recipe;
    if (!recipe) return;
    applyRecipe(recipe.boost_type, recipe.audience_mode, recipe.focus_mode);
  };
  const applyRecipe = (
    nextBoostType: BoostType,
    nextAudienceMode: BoostAudienceMode,
    nextFocusMode: BoostFocusMode,
  ) => {
    if (!isGold && nextBoostType === 'smart') {
      onLockedGoldPress?.('boost_type', nextBoostType);
      return;
    }

    if (!isGold && !isAudienceUnlocked(nextAudienceMode)) {
      onLockedGoldPress?.('audience_mode', nextAudienceMode);
      return;
    }

    if (!isGold && !isFocusUnlocked(nextFocusMode)) {
      onLockedGoldPress?.('focus', nextFocusMode);
      return;
    }

    setBoostType(nextBoostType);
    setAudienceMode(nextAudienceMode);
    setFocusMode(nextFocusMode);
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <View
            style={[
              styles.sheet,
              isCompactWidth ? styles.sheetCompact : null,
              {
                backgroundColor: theme.background,
                borderColor: theme.outline,
              },
            ]}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(20,184,212,0.16)', 'rgba(125,124,243,0.08)', 'transparent']
                  : ['rgba(20,184,212,0.12)', 'rgba(125,124,243,0.06)', 'transparent']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGlow}
            />
            <View style={[styles.header, isCompactWidth ? styles.headerCompact : null]}>
              <View style={[styles.headerCopy, isCompactWidth ? styles.headerCopyCompact : null]}>
                <Text style={[styles.eyebrow, { color: theme.tint }]}>
                  Precision Boosts
                </Text>
                <Text style={[styles.title, isCompactWidth ? styles.titleCompact : null, { color: theme.text }]}>
                  Boost the right moment of visibility
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>

            {feedback ? (
              <Animated.View
                style={[
                  styles.feedbackWrap,
                  {
                    opacity: feedbackOpacity,
                    transform: [{ translateY: feedbackTranslateY }],
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    `${feedbackAccent}28`,
                    isDark ? 'rgba(9,16,18,0.94)' : 'rgba(255,255,255,0.94)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.feedbackCard,
                    {
                      borderColor: `${feedbackAccent}55`,
                      backgroundColor: theme.backgroundSubtle,
                    },
                  ]}
                >
                  <View style={[styles.feedbackDot, { backgroundColor: feedbackAccent }]} />
                  <View style={styles.feedbackCopy}>
                    <Text style={[styles.feedbackTitle, { color: theme.text }]}>{feedback.title}</Text>
                    <Text style={[styles.feedbackBody, { color: theme.textMuted }]}>{feedback.message}</Text>
                  </View>
                </LinearGradient>
              </Animated.View>
            ) : null}

            {syncState ? (
              <View style={styles.syncStateWrap}>
                <LinearGradient
                  colors={[
                    syncState.status === 'failed' ? 'rgba(255,124,142,0.16)' : 'rgba(46,214,194,0.14)',
                    isDark ? 'rgba(9,16,18,0.92)' : 'rgba(255,255,255,0.94)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.syncStateCard,
                    {
                      borderColor:
                        syncState.status === 'failed' ? 'rgba(255,124,142,0.4)' : 'rgba(46,214,194,0.32)',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.syncStateIconWrap,
                      {
                        backgroundColor:
                          syncState.status === 'failed' ? 'rgba(255,124,142,0.14)' : 'rgba(46,214,194,0.12)',
                        borderColor:
                          syncState.status === 'failed' ? 'rgba(255,124,142,0.28)' : 'rgba(46,214,194,0.2)',
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={syncState.status === 'failed' ? 'alert-circle-outline' : 'cloud-upload-outline'}
                      size={16}
                      color={syncState.status === 'failed' ? '#FF7C8E' : theme.tint}
                    />
                  </View>
                  <View style={styles.syncStateCopy}>
                    <Text style={[styles.syncStateTitle, { color: theme.text }]}>{syncState.title}</Text>
                    <Text style={[styles.syncStateBody, { color: theme.textMuted }]}>{syncState.message}</Text>
                  </View>
                  {syncState.actionLabel && onSyncAction ? (
                    <Pressable
                      onPress={onSyncAction}
                      style={[styles.syncStateAction, { borderColor: theme.outline, backgroundColor: theme.background }]}
                    >
                      <Text style={[styles.syncStateActionText, { color: theme.tint }]}>{syncState.actionLabel}</Text>
                    </Pressable>
                  ) : null}
                </LinearGradient>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={[styles.content, isCompactWidth ? styles.contentCompact : null]} showsVerticalScrollIndicator={false}>
              <View
                style={[
                  styles.callout,
                  {
                    backgroundColor: theme.backgroundSubtle,
                    borderColor: theme.outline,
                  },
                ]}
              >
                <Text style={[styles.calloutTitle, { color: theme.text }]}>
                  {loading
                    ? 'Preparing boost insight...'
                    : recommendedStartLabel
                      ? `Best next window: ${recommendedStartLabel}`
                      : 'Best next window is ready'}
                </Text>
                <Text style={[styles.calloutBody, { color: theme.textMuted }]}>
                  {recommendation?.recommendation_reason ??
                    'Boosting works best when attention is already warm and the profile is fresh.'}
                </Text>
              </View>

              {recommendation?.best_recent_recipe ? (
                <View
                  style={[
                    styles.recipeCard,
                    {
                      backgroundColor: theme.backgroundSubtle,
                      borderColor:
                        recommendation.best_recent_recipe.confidence === 'thin_sample'
                          ? `${bestRecipeAccent}44`
                          : theme.outline,
                    },
                  ]}
                >
                  <View style={styles.recipeHeader}>
                    <View style={styles.recipeCopy}>
                      <View style={styles.recipeEyebrowRow}>
                        <Text style={[styles.recipeEyebrow, { color: theme.tint }]}>Best recent recipe</Text>
                        <View
                          style={[
                            styles.recipeConfidencePill,
                            {
                              backgroundColor: `${bestRecipeAccent}18`,
                              borderColor: `${bestRecipeAccent}44`,
                            },
                          ]}
                        >
                          <Text style={[styles.recipeConfidenceText, { color: bestRecipeAccent }]}>
                            {recommendation.best_recent_recipe.confidence_label}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.recipeTitle, { color: theme.text }]}>
                        {recommendation.best_recent_recipe.headline}
                      </Text>
                    </View>
                    <Pressable
                      onPress={applyBestRecentRecipe}
                      style={[
                        styles.recipeApplyButton,
                        {
                          backgroundColor: `${theme.tint}14`,
                          borderColor: `${theme.tint}40`,
                        },
                      ]}
                    >
                      <Text style={[styles.recipeApplyText, { color: theme.tint }]}>Use recipe</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.recipeBody, { color: theme.textMuted }]}>
                    {recommendation.best_recent_recipe.summary}
                  </Text>
                  <Text style={[styles.recipeConfidenceNote, { color: theme.textMuted }]}>
                    {recommendation.best_recent_recipe.confidence_note}
                  </Text>
                  <View style={styles.recipeMetaRow}>
                    <View style={[styles.recipeMetaPill, { backgroundColor: theme.background }]}>
                      <Text style={[styles.recipeMetaText, { color: theme.text }]}>
                        {formatBoostTypeLabel(recommendation.best_recent_recipe.boost_type)}
                      </Text>
                    </View>
                    <View style={[styles.recipeMetaPill, { backgroundColor: theme.background }]}>
                      <Text style={[styles.recipeMetaText, { color: theme.text }]}>
                        {formatBoostAudienceLabel(recommendation.best_recent_recipe.audience_mode)}
                      </Text>
                    </View>
                    <View style={[styles.recipeMetaPill, { backgroundColor: theme.background }]}>
                      <Text style={[styles.recipeMetaText, { color: theme.text }]}>
                        {formatBoostFocusLabel(recommendation.best_recent_recipe.focus_mode)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recipeStatsRow}>
                    <Text style={[styles.recipeStatsText, { color: theme.textMuted }]}>
                      {formatAudienceCount(recommendation.best_recent_recipe.trusted_reach, 'trusted viewer')}
                    </Text>
                    <Text style={[styles.recipeStatsText, { color: theme.textMuted }]}>
                      {formatAudienceCount(recommendation.best_recent_recipe.unique_savers, 'save')}
                    </Text>
                    <Text style={[styles.recipeStatsText, { color: theme.textMuted }]}>
                      {formatAudienceCount(recommendation.best_recent_recipe.unique_intent_viewers, 'intent viewer')}
                    </Text>
                    {bestRecipeDateLabel ? (
                      <Text style={[styles.recipeStatsText, { color: theme.textMuted }]}>
                        {bestRecipeDateLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {recommendation?.last_used_recipe && !isLastUsedSameAsBestRecent ? (
                <View
                  style={[
                    styles.recipeCard,
                    {
                      backgroundColor: theme.backgroundSubtle,
                      borderColor: theme.outline,
                    },
                  ]}
                >
                  <View style={styles.recipeHeader}>
                    <View style={styles.recipeCopy}>
                      <Text style={[styles.recipeEyebrow, { color: theme.textMuted }]}>Last used recipe</Text>
                      <Text style={[styles.recipeTitle, { color: theme.text }]}>
                        {recommendation.last_used_recipe.headline}
                      </Text>
                    </View>
                    <Pressable
                      onPress={applyLastUsedRecipe}
                      style={[
                        styles.recipeApplyButton,
                        {
                          backgroundColor: `${theme.tint}14`,
                          borderColor: `${theme.tint}40`,
                        },
                      ]}
                    >
                      <Text style={[styles.recipeApplyText, { color: theme.tint }]}>Use recipe</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.recipeBody, { color: theme.textMuted }]}>
                    {recommendation.last_used_recipe.summary}
                  </Text>
                  <View style={styles.recipeMetaRow}>
                    <View style={[styles.recipeMetaPill, { backgroundColor: theme.background }]}>
                      <Text style={[styles.recipeMetaText, { color: theme.text }]}>
                        {formatBoostTypeLabel(recommendation.last_used_recipe.boost_type)}
                      </Text>
                    </View>
                    <View style={[styles.recipeMetaPill, { backgroundColor: theme.background }]}>
                      <Text style={[styles.recipeMetaText, { color: theme.text }]}>
                        {formatBoostAudienceLabel(recommendation.last_used_recipe.audience_mode)}
                      </Text>
                    </View>
                    <View style={[styles.recipeMetaPill, { backgroundColor: theme.background }]}>
                      <Text style={[styles.recipeMetaText, { color: theme.text }]}>
                        {formatBoostFocusLabel(recommendation.last_used_recipe.focus_mode)}
                      </Text>
                    </View>
                  </View>
                  {lastRecipeDateLabel ? (
                    <Text style={[styles.recipeStatsText, { color: theme.textMuted }]}>
                      {lastRecipeDateLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {recommendation?.has_active_boost || resolvedActiveBoostEndsAt ? (
                <View
                  style={[
                    styles.activeCard,
                    {
                      backgroundColor: theme.backgroundSubtle,
                      borderColor: theme.outline,
                    },
                  ]}
                >
                  <Text style={[styles.activeTitle, { color: theme.text }]}>Boost live now</Text>
                  <Text style={[styles.activeBody, { color: theme.textMuted }]}>
                    {activeBoostTimeLabel
                      ? `Your current boost is running until ${activeBoostTimeLabel}.`
                      : 'Your current boost is still running.'}
                  </Text>
                  {remainingMs > 0 ? (
                    <>
                      <Animated.View
                        style={[
                          styles.countdownCard,
                          {
                            borderColor: `${theme.tint}44`,
                            backgroundColor: isDark ? 'rgba(13,26,29,0.84)' : 'rgba(255,255,255,0.86)',
                            transform: [{ scale: countdownPulse }],
                          },
                        ]}
                      >
                        <Text style={[styles.countdownEyebrow, { color: theme.textMuted }]}>Time remaining</Text>
                        <Text style={[styles.countdownValue, { color: theme.text }]}>{countdownLabel}</Text>
                        <Text style={[styles.countdownHint, { color: theme.textMuted }]}>
                          Live outcome updates refresh automatically while this window is open.
                        </Text>
                      </Animated.View>
                      <View style={[styles.progressTrack, { backgroundColor: theme.outline }]}>
                        <LinearGradient
                          colors={['#20D4C3', '#7D7CF3', '#F6C453']}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={[styles.progressFill, { width: `${Math.max(activeBoostProgress * 100, 6)}%` }]}
                        />
                      </View>
                      {liveOutcomeRead ? (
                        <View
                          style={[
                            styles.liveReadCard,
                            {
                              backgroundColor: isDark ? 'rgba(10,22,27,0.88)' : 'rgba(255,255,255,0.9)',
                              borderColor: `${liveReadAccent}44`,
                            },
                          ]}
                        >
                          <View style={styles.liveReadHeader}>
                            <View style={[styles.liveReadDot, { backgroundColor: liveReadAccent }]} />
                            <Text style={[styles.liveReadEyebrow, { color: liveReadAccent }]}>Live read</Text>
                            <Text style={[styles.liveReadLabel, { color: theme.text }]}>{liveOutcomeRead.label}</Text>
                          </View>
                          <Text style={[styles.liveReadBody, { color: theme.textMuted }]}>
                            {liveOutcomeRead.message}
                          </Text>
                          <View style={[styles.liveReadActionCard, { borderColor: theme.outline }]}>
                            <Text style={[styles.liveReadActionLabel, { color: theme.text }]}>What to do now</Text>
                            <Text style={[styles.liveReadActionBody, { color: theme.textMuted }]}>
                              {liveOutcomeRead.nextStep}
                            </Text>
                          </View>
                          <View style={[styles.liveReadActionCard, { borderColor: theme.outline }]}>
                            <Text style={[styles.liveReadActionLabel, { color: theme.text }]}>Next session</Text>
                            <Text style={[styles.liveReadActionBody, { color: theme.textMuted }]}>
                              {liveOutcomeRead.futurePlay}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.metricRow, isCompactWidth ? styles.metricRowCompact : null]}>
                <MetricPill
                  staggerIndex={0}
                  label="Reach"
                  value={recommendation?.recent_metrics?.unique_viewers_7d ?? 0}
                  caption="unique"
                  theme={theme}
                  compact={isCompactWidth}
                />
                <MetricPill
                  staggerIndex={1}
                  label="Opens"
                  value={recommendation?.recent_metrics?.views_7d ?? 0}
                  caption="total"
                  theme={theme}
                  compact={isCompactWidth}
                />
                <MetricPill
                  staggerIndex={2}
                  label="Intro"
                  value={recommendation?.recent_metrics?.intro_opens_7d ?? 0}
                  theme={theme}
                  compact={isCompactWidth}
                />
                <MetricPill
                  staggerIndex={3}
                  label="Saves"
                  value={recommendation?.recent_metrics?.saves_7d ?? 0}
                  theme={theme}
                  compact={isCompactWidth}
                />
                <MetricPill
                  staggerIndex={4}
                  label="Intent"
                  value={recommendation?.recent_metrics?.intent_opens_7d ?? 0}
                  theme={theme}
                  compact={isCompactWidth}
                />
              </View>

              <View style={styles.section}>
                <View style={[styles.sectionHeader, isCompactWidth ? styles.sectionHeaderCompact : null]}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Boost type</Text>
                  {!isGold ? (
                    <View style={[styles.lockPill, isCompactWidth ? styles.lockPillCompact : null, { backgroundColor: LOCKED_TINT, borderColor: theme.outline }]}>
                      <MaterialCommunityIcons name="lock-outline" size={12} color={theme.textMuted} />
                      <Text style={[styles.lockPillText, { color: theme.textMuted }]}>Gold for precision</Text>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.inlineOptions, isCompactWidth ? styles.inlineOptionsCompact : null]}>
                  {(['manual', 'smart'] as BoostType[]).map((item) => {
                    const selected = item === boostType;
                    const locked = !isGold && item === 'smart';
                    return (
                      <Pressable
                        key={item}
                        onPress={() => {
                          if (locked) {
                            onLockedGoldPress?.('boost_type', item);
                            return;
                          }
                          setBoostType(item);
                        }}
                        style={[
                          styles.inlineOption,
                          isCompactWidth ? styles.inlineOptionCompact : null,
                          {
                            borderColor: selected ? theme.tint : theme.outline,
                            backgroundColor: selected ? `${theme.tint}16` : theme.backgroundSubtle,
                            opacity: locked ? 0.58 : 1,
                          },
                        ]}
                      >
                        <View style={styles.optionHeaderRow}>
                          <Text style={[styles.inlineOptionTitle, { color: theme.text }]}>
                            {formatBoostTypeLabel(item)}
                          </Text>
                          {locked ? <LockedGoldBadge theme={theme} /> : null}
                        </View>
                        <Text style={[styles.inlineOptionBody, { color: theme.textMuted }]}>
                          {item === 'smart'
                            ? 'Use a stronger audience and focus signal.'
                            : 'Start a clean visibility lift right now.'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <View style={[styles.sectionHeader, isCompactWidth ? styles.sectionHeaderCompact : null]}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Audience mode</Text>
                  {!isGold ? (
                    <Text style={[styles.sectionMeta, isCompactWidth ? styles.sectionMetaCompact : null, { color: theme.textMuted }]}>Gold unlocks advanced targeting</Text>
                  ) : null}
                </View>
                <View style={styles.optionStack}>
                  {audienceOptions.map((option) => {
                    const selected = option.id === audienceMode;
                    const locked = !isAudienceUnlocked(option.id as BoostAudienceMode);
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          if (locked) {
                            onLockedGoldPress?.('audience_mode', String(option.id));
                            return;
                          }
                          setAudienceMode(option.id as BoostAudienceMode);
                        }}
                        style={[
                          styles.optionCard,
                          {
                            borderColor: selected ? theme.tint : theme.outline,
                            backgroundColor: selected ? `${theme.tint}14` : theme.backgroundSubtle,
                            opacity: locked ? 0.58 : 1,
                          },
                        ]}
                      >
                        <View style={styles.optionHeaderRow}>
                          <Text style={[styles.optionTitle, { color: theme.text }]}>{option.label}</Text>
                          {locked ? <LockedGoldBadge theme={theme} /> : null}
                        </View>
                        <Text style={[styles.optionBody, { color: theme.textMuted }]}>
                          {option.description}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <View style={[styles.sectionHeader, isCompactWidth ? styles.sectionHeaderCompact : null]}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Focus</Text>
                  {!isGold ? (
                    <Text style={[styles.sectionMeta, isCompactWidth ? styles.sectionMetaCompact : null, { color: theme.textMuted }]}>Gold unlocks intro and intent focus</Text>
                  ) : null}
                </View>
                <View style={styles.optionStack}>
                  {focusOptions.map((option) => {
                    const selected = option.id === focusMode;
                    const locked = !isFocusUnlocked(option.id as BoostFocusMode);
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          if (locked) {
                            onLockedGoldPress?.('focus', String(option.id));
                            return;
                          }
                          setFocusMode(option.id as BoostFocusMode);
                        }}
                        style={[
                          styles.optionCard,
                          {
                            borderColor: selected ? theme.accent : theme.outline,
                            backgroundColor: selected ? `${theme.accent}14` : theme.backgroundSubtle,
                            opacity: locked ? 0.58 : 1,
                          },
                        ]}
                      >
                        <View style={styles.optionHeaderRow}>
                          <Text style={[styles.optionTitle, { color: theme.text }]}>{option.label}</Text>
                          {locked ? <LockedGoldBadge theme={theme} /> : null}
                        </View>
                        <Text style={[styles.optionBody, { color: theme.textMuted }]}>
                          {option.description}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {analytics?.boost?.is_active ? (
                <View
                  style={[
                    styles.analyticsCard,
                    {
                      backgroundColor: theme.backgroundSubtle,
                      borderColor: theme.outline,
                    },
                  ]}
                >
                  <View style={styles.analyticsHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Latest boost outcome</Text>
                    {analytics.analytics_meta.is_trust_filtered ? (
                      <View
                        style={[
                          styles.trustBadge,
                          {
                            backgroundColor: `${theme.tint}18`,
                            borderColor: `${theme.tint}44`,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons name="shield-check-outline" size={12} color={theme.tint} />
                        <Text style={[styles.trustBadgeText, { color: theme.tint }]}>Trusted live</Text>
                      </View>
                    ) : null}
                  </View>
                  {latestBoostLabel ? (
                    <Text style={[styles.analyticsLead, { color: theme.textMuted }]}>
                      {latestBoostLabel}
                    </Text>
                  ) : null}
                  <Text style={[styles.analyticsMeta, { color: theme.textMuted }]}>
                    {analytics.analytics_meta.is_trust_filtered
                      ? 'Reach counts distinct trusted people. Opens and follow-on signals count total actions from that filtered audience.'
                      : 'Reach counts distinct people. Opens and follow-on signals count total actions.'}
                  </Text>
                  <View style={styles.analyticsGrid}>
                    <AnalyticsMetric
                      staggerIndex={0}
                      label="Reach"
                      value={analytics.metrics.unique_viewers}
                      caption={analytics.analytics_meta.is_trust_filtered ? 'trusted' : 'unique'}
                      theme={theme}
                    />
                    <AnalyticsMetric
                      staggerIndex={1}
                      label="Opens"
                      value={analytics.metrics.views}
                      caption="total"
                      theme={theme}
                    />
                    <AnalyticsMetric
                      staggerIndex={2}
                      label="Intro"
                      value={analytics.metrics.intro_opens}
                      theme={theme}
                    />
                    <AnalyticsMetric
                      staggerIndex={3}
                      label="Saves"
                      value={analytics.metrics.saves}
                      theme={theme}
                    />
                    <AnalyticsMetric
                      staggerIndex={4}
                      label="Intent"
                      value={analytics.metrics.intent_opens}
                      theme={theme}
                    />
                  </View>
                  {analytics.analytics_meta.is_trust_filtered ? (
                    <View style={styles.audienceQualitySection}>
                      <Text style={[styles.qualityTitle, { color: theme.text }]}>Audience quality</Text>
                      <Text style={[styles.audienceQualityMeta, { color: theme.textMuted }]}>
                        These are the strongest trust-filtered outcomes from the people this boost actually reached.
                      </Text>
                      <View style={styles.audienceQualityRow}>
                        {audienceQualityItems.map((item) => (
                          <View
                            key={item.key}
                            style={[
                              styles.audienceQualityCard,
                              {
                                backgroundColor: theme.background,
                                borderColor: theme.outline,
                              },
                            ]}
                          >
                            <MaterialCommunityIcons name={item.icon} size={14} color={theme.tint} />
                            <Text style={[styles.audienceQualityLabel, { color: theme.text }]}>
                              {item.label}
                            </Text>
                            <Text style={[styles.audienceQualityDetail, { color: theme.textMuted }]}>
                              {item.detail}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {isGold && outcomeQuality ? (
                    <View style={styles.qualitySection}>
                      <Text style={[styles.qualityTitle, { color: theme.text }]}>Outcome quality</Text>
                      <View style={styles.analyticsGrid}>
                        <AnalyticsMetric
                          staggerIndex={0}
                          label="Save rate"
                          value={outcomeQuality.saveRate}
                          caption={`${analytics.metrics.unique_savers} people`}
                          suffix="%"
                          theme={theme}
                        />
                        <AnalyticsMetric
                          staggerIndex={1}
                          label="Intent rate"
                          value={outcomeQuality.intentRate}
                          caption={`${analytics.metrics.unique_intent_viewers} people`}
                          suffix="%"
                          theme={theme}
                        />
                        <AnalyticsMetric
                          staggerIndex={2}
                          label="Match rate"
                          value={outcomeQuality.matchRate}
                          caption={`${analytics.metrics.accepted_matches} matches`}
                          suffix="%"
                          theme={theme}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={[styles.footer, isCompactWidth ? styles.footerCompact : null]}>
              <Pressable
                onPress={() =>
                  onSubmit({
                    boostType,
                    audienceMode,
                    focusMode,
                    metadata: {
                      source: 'profile_preview',
                      recommendedStartAt: recommendation?.recommended_start_at ?? null,
                    },
                  })
                }
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.primaryCtaWrap,
                  !canSubmit ? styles.primaryCtaDisabled : null,
                  pressed && canSubmit ? styles.primaryCtaPressed : null,
                ]}
              >
                <LinearGradient
                  colors={canSubmit ? ['#F6C453', '#C68B1E'] : ['#8B8B8B', '#6D6D6D']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.primaryCta}
                >
                  <Animated.View
                    style={{
                      transform: [
                        {
                          translateX: rocketTravel.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 20],
                          }),
                        },
                        {
                          translateY: rocketTravel.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -8],
                          }),
                        },
                        {
                          rotate: rocketTravel.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-14deg'],
                          }),
                        },
                        {
                          scale: rocketTravel.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.08, 1],
                          }),
                        },
                      ],
                    }}
                  >
                    <MaterialCommunityIcons name="rocket-launch-outline" size={18} color="#091012" />
                  </Animated.View>
                  <Text style={[styles.primaryCtaText, isCompactWidth ? styles.primaryCtaTextCompact : null]}>
                    {submitting
                      ? 'Launching boost...'
                      : syncState?.status === 'queued'
                        ? 'Boost queued for launch'
                        : syncState?.status === 'failed'
                          ? 'Resolve queued boost first'
                      : isGold && boostType === 'smart'
                        ? 'Start precision boost'
                        : 'Start 30-minute boost'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function AnimatedMetricValue({
  value,
  suffix,
  style,
  staggerIndex = 0,
}: {
  value: number;
  suffix?: string;
  style: any;
  staggerIndex?: number;
}) {
  const animatedValue = useState(() => new Animated.Value(value))[0];
  const scale = useState(() => new Animated.Value(1))[0];
  const [displayValue, setDisplayValue] = useState(Math.round(value));
  const previousValueRef = useRef(value);

  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value: nextValue }) => {
      setDisplayValue(Math.round(nextValue));
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [animatedValue]);

  useEffect(() => {
    const nextValue = Number.isFinite(value) ? value : 0;
    if (previousValueRef.current === nextValue) return;
    previousValueRef.current = nextValue;

    Animated.sequence([
      Animated.delay(staggerIndex * 65),
      Animated.parallel([
        Animated.timing(animatedValue, {
          toValue: nextValue,
          duration: 720,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 170,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 6,
            tension: 90,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [animatedValue, scale, staggerIndex, value]);

  return (
    <Animated.Text style={[style, { transform: [{ scale }] }]}>
      {`${displayValue}${suffix ?? ''}`}
    </Animated.Text>
  );
}

function MetricPill({
  label,
  value,
  caption,
  theme,
  staggerIndex = 0,
  compact = false,
}: {
  label: string;
  value: number;
  caption?: string;
  theme: Props['theme'];
  staggerIndex?: number;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.metricPill,
        compact ? styles.metricPillCompact : null,
        {
          backgroundColor: theme.backgroundSubtle,
          borderColor: theme.outline,
        },
      ]}
    >
      <AnimatedMetricValue
        value={value}
        staggerIndex={staggerIndex}
        style={[styles.metricValue, compact ? styles.metricValueCompact : null, { color: theme.text }]}
      />
      <Text style={[styles.metricLabel, compact ? styles.metricLabelCompact : null, { color: theme.textMuted }]}>{label}</Text>
      {caption ? <Text style={[styles.metricCaption, compact ? styles.metricCaptionCompact : null, { color: theme.textMuted }]}>{caption}</Text> : null}
    </View>
  );
}

function AnalyticsMetric({
  label,
  value,
  caption,
  suffix,
  theme,
  staggerIndex = 0,
}: {
  label: string;
  value: number;
  caption?: string;
  suffix?: string;
  theme: Props['theme'];
  staggerIndex?: number;
}) {
  return (
    <View
      style={[
        styles.analyticsMetric,
        {
          backgroundColor: theme.backgroundSubtle,
          borderColor: theme.outline,
        },
      ]}
    >
      <AnimatedMetricValue
        value={value}
        suffix={suffix}
        staggerIndex={staggerIndex}
        style={[styles.analyticsMetricValue, { color: theme.text }]}
      />
      <Text style={[styles.analyticsMetricLabel, { color: theme.textMuted }]}>{label}</Text>
      {caption ? <Text style={[styles.analyticsMetricCaption, { color: theme.textMuted }]}>{caption}</Text> : null}
    </View>
  );
}

function LockedGoldBadge({ theme }: { theme: Props['theme'] }) {
  return (
    <View style={[styles.goldBadge, { borderColor: theme.outline }]}>
      <MaterialCommunityIcons name="lock-outline" size={11} color="#091012" />
      <Text style={styles.goldBadgeText}>Gold</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetCompact: {
    maxHeight: '94%',
  },
  heroGlow: {
    ...StyleSheet.absoluteFill,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  headerCompact: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerCopyCompact: {
    paddingRight: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 6,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  titleCompact: {
    fontSize: 19,
    lineHeight: 24,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 16,
  },
  contentCompact: {
    paddingHorizontal: 14,
    gap: 14,
  },
  feedbackWrap: {
    paddingHorizontal: 18,
    paddingBottom: 2,
  },
  feedbackCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  feedbackDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  feedbackCopy: {
    flex: 1,
    gap: 2,
  },
  feedbackTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  feedbackBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  syncStateWrap: {
    paddingHorizontal: 18,
    paddingBottom: 2,
  },
  syncStateCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  syncStateIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncStateCopy: {
    flex: 1,
    gap: 2,
  },
  syncStateTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  syncStateBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  syncStateAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  syncStateActionText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  callout: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  calloutBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  recipeCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  recipeCopy: {
    flex: 1,
    gap: 4,
  },
  recipeEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  recipeEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  recipeConfidencePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recipeConfidenceText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  recipeTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  recipeApplyButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  recipeApplyText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  recipeBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  recipeConfidenceNote: {
    fontSize: 11,
    lineHeight: 16,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recipeMetaPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  recipeMetaText: {
    fontSize: 11,
    fontWeight: '800',
  },
  recipeStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  recipeStatsText: {
    fontSize: 11,
    fontWeight: '600',
  },
  activeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  activeTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  activeBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  countdownCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  countdownEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  countdownValue: {
    marginTop: 5,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  countdownHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  liveReadCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 6,
  },
  liveReadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  liveReadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveReadEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  liveReadLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  liveReadBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  liveReadActionCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  liveReadActionLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  liveReadActionBody: {
    fontSize: 11,
    lineHeight: 16,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricRowCompact: {
    gap: 6,
  },
  metricPill: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  metricPillCompact: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  metricValueCompact: {
    fontSize: 15,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  metricLabelCompact: {
    fontSize: 10.5,
  },
  metricCaption: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricCaptionCompact: {
    fontSize: 8,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHeaderCompact: {
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionMeta: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionMetaCompact: {
    width: '100%',
    marginTop: 2,
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockPillCompact: {
    marginTop: 2,
  },
  lockPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  inlineOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineOptionsCompact: {
    flexDirection: 'column',
    gap: 8,
  },
  inlineOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  inlineOptionCompact: {
    flexBasis: 'auto',
  },
  inlineOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  inlineOptionBody: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  optionStack: {
    gap: 10,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
  },
  optionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  goldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: '#F6C453',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  goldBadgeText: {
    color: '#091012',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  optionBody: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  analyticsCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  analyticsLead: {
    fontSize: 13,
    lineHeight: 18,
  },
  analyticsMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trustBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  analyticsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  qualitySection: {
    gap: 10,
  },
  qualityTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  audienceQualitySection: {
    gap: 10,
  },
  audienceQualityMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  audienceQualityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  audienceQualityCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  audienceQualityLabel: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  audienceQualityDetail: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  analyticsMetric: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  analyticsMetricValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  analyticsMetricLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  analyticsMetricCaption: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
  },
  footerCompact: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  primaryCtaWrap: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryCtaPressed: {
    opacity: 0.92,
  },
  primaryCtaDisabled: {
    opacity: 0.62,
  },
  primaryCta: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
  },
  primaryCtaText: {
    color: '#091012',
    fontSize: 15,
    fontWeight: '900',
  },
  primaryCtaTextCompact: {
    fontSize: 14,
  },
});
