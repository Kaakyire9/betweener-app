import IntentRequestSheet from '@/components/IntentRequestSheet';
import ClosureRecommendationCard from '@/components/intent/ClosureRecommendationCard';
import ClosureReflectionChips from '@/components/intent/ClosureReflectionChips';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import {
  readClosureToClaritySnapshotState,
  updateClosureToClaritySnapshot,
  writeClosureToClaritySnapshot,
} from '@/lib/offline/closure-to-clarity-store';
import {
  classifyClosureRecommendations,
  getIntentReflection,
  loadClosureCandidatePool,
  saveIntentReflection,
  type ClosureCandidatePool,
  type ClosureRecommendation,
  type ClosureReflectionReason,
} from '@/lib/intents/closure-to-clarity';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const emptyPool: ClosureCandidatePool = { target: null, candidates: [] };

const readParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const formatSavedTime = (savedAt: number | null) => {
  if (!savedAt) return null;
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export default function ClosureToClarityScreen() {
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    targetProfileId?: string | string[];
    targetName?: string | string[];
    source?: string | string[];
  }>();
  const requestId = readParam(params.requestId) ?? '';
  const targetProfileId = readParam(params.targetProfileId) ?? '';
  const targetName = readParam(params.targetName)?.trim() || 'this connection';
  const source = readParam(params.source) === 'passed_profile'
    ? 'passed_profile'
    : 'expired_request';

  const { user, profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { profileId: viewerProfileId } = useResolvedProfileId(
    user?.id ?? null,
    profile?.id ?? null,
  );
  const [pool, setPool] = useState<ClosureCandidatePool>(emptyPool);
  const [selectedReasons, setSelectedReasons] = useState<ClosureReflectionReason[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] =
    useState<ClosureRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingReflection, setSavingReflection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedSnapshot, setUsingCachedSnapshot] = useState(false);
  const [cachedSnapshotSavedAt, setCachedSnapshotSavedAt] = useState<number | null>(null);
  const [cachedSnapshotStale, setCachedSnapshotStale] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (!viewerProfileId || !requestId || !targetProfileId) {
      if (viewerProfileId) {
        setError('This closed request is missing the context needed for recommendations.');
        setLoading(false);
      }
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const cached = await readClosureToClaritySnapshotState(
      viewerProfileId,
      requestId,
      targetProfileId,
    );

    if (cached.data) {
      setPool(cached.data.pool);
      setSelectedReasons(cached.data.selectedReasons ?? []);
      setUsingCachedSnapshot(true);
      setCachedSnapshotSavedAt(cached.savedAt);
      setCachedSnapshotStale(cached.isStale);
      if (!refresh) setLoading(false);
    } else {
      setUsingCachedSnapshot(false);
      setCachedSnapshotSavedAt(null);
      setCachedSnapshotStale(false);
    }

    try {
      const [nextPool, reflection] = await Promise.all([
        loadClosureCandidatePool(requestId, targetProfileId),
        getIntentReflection(requestId),
      ]);
      setPool(nextPool);
      setSelectedReasons(reflection);
      setUsingCachedSnapshot(false);
      setCachedSnapshotSavedAt(Date.now());
      setCachedSnapshotStale(false);
      await writeClosureToClaritySnapshot(viewerProfileId, requestId, targetProfileId, {
        pool: nextPool,
        selectedReasons: reflection,
      });
    } catch {
      if (!cached.data) {
        setError('Unable to prepare aligned profiles right now.');
      } else {
        setUsingCachedSnapshot(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestId, targetProfileId, viewerProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recommendations = useMemo(
    () => classifyClosureRecommendations(pool, selectedReasons),
    [pool, selectedReasons],
  );

  const recommendationTitle = useMemo(() => {
    if (recommendations.length >= 3) return 'Three thoughtful directions';
    if (recommendations.length === 2) return 'Two thoughtful directions';
    if (recommendations.length === 1) return 'A thoughtful next direction';
    return 'Aligned possibilities';
  }, [recommendations.length]);

  const recommendationSubtitle = useMemo(() => {
    if (selectedReasons.length === 0) {
      return 'Start broad, then tighten the recovery lens with two private signals.';
    }
    return `Shaped by ${selectedReasons.map((reason) => reason.replace('_', ' ')).join(' and ')}.`;
  }, [selectedReasons]);

  const cacheNotice = useMemo(() => {
    if (!usingCachedSnapshot) return null;
    const savedLabel = formatSavedTime(cachedSnapshotSavedAt);
    if (cachedSnapshotStale) {
      return savedLabel
        ? `Showing saved aligned profiles from ${savedLabel} while the connection settles.`
        : 'Showing saved aligned profiles while the connection settles.';
    }
    return savedLabel
      ? `Using your saved aligned field from ${savedLabel}. Pull to refresh when you want a live read.`
      : 'Using your saved aligned field. Pull to refresh when you want a live read.';
  }, [cachedSnapshotSavedAt, cachedSnapshotStale, usingCachedSnapshot]);

  const updateReflection = useCallback(async (next: ClosureReflectionReason[]) => {
    if (savingReflection || !requestId || !targetProfileId || !viewerProfileId) return;
    const previous = selectedReasons;
    setSelectedReasons(next);
    setSavingReflection(true);
    await updateClosureToClaritySnapshot(viewerProfileId, requestId, targetProfileId, (current) =>
      current
        ? {
            ...current,
            selectedReasons: next,
          }
        : current,
    );
    try {
      const saved = await saveIntentReflection({
        intentRequestId: requestId,
        targetProfileId,
        source,
        selectedReasons: next,
      });
      setSelectedReasons(saved);
      await updateClosureToClaritySnapshot(viewerProfileId, requestId, targetProfileId, (current) =>
        current
          ? {
              ...current,
              selectedReasons: saved,
            }
          : current,
      );
    } catch {
      setSelectedReasons(previous);
      await updateClosureToClaritySnapshot(viewerProfileId, requestId, targetProfileId, (current) =>
        current
          ? {
              ...current,
              selectedReasons: previous,
            }
          : current,
      );
      Alert.alert('Private reflection', 'We could not save that choice. Please try again.');
    } finally {
      setSavingReflection(false);
    }
  }, [
    requestId,
    savingReflection,
    selectedReasons,
    source,
    targetProfileId,
    viewerProfileId,
  ]);

  const openProfile = (profileId: string) => {
    router.push({ pathname: '/profile-view', params: { profileId } });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <LinearGradient
        colors={
          isDark
            ? ['rgba(0,160,160,0.18)', 'rgba(155,124,200,0.10)', 'transparent']
            : ['rgba(0,128,128,0.10)', 'rgba(125,91,166,0.08)', 'transparent']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.screenGlow}
      />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            {
              borderColor: theme.outline,
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
            },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Closure to Clarity</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
            Keep what felt meaningful
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={theme.tint}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={[styles.introEyebrow, { color: theme.tint }]}>A CLOSED DOOR CAN STILL TEACH YOU</Text>
          <Text style={[styles.introTitle, { color: theme.text }]}>Turn the signal into a clearer next step.</Text>
          <Text style={[styles.introText, { color: theme.textMuted }]}>
            Your request with {targetName} has closed. These suggestions preserve the
            qualities that mattered while opening new possibilities.
          </Text>
        </View>

        <View style={[styles.reflectionSection, { borderBottomColor: theme.outline, borderTopColor: theme.outline }]}>
          <ClosureReflectionChips
            selected={selectedReasons}
            theme={theme}
            isDark={isDark}
            disabled={savingReflection}
            onChange={(next) => void updateReflection(next)}
          />
          {savingReflection ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={theme.tint} />
              <Text style={[styles.savingText, { color: theme.textMuted }]}>Refining your suggestions...</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.recommendationHeader}>
          <View style={styles.recommendationHeaderCopy}>
            <Text style={[styles.sectionEyebrow, { color: theme.accent }]}>YOUR NEXT POSSIBILITY</Text>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{recommendationTitle}</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>{recommendationSubtitle}</Text>
          </View>
          <View style={[styles.compassBadge, { borderColor: theme.outline, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.62)' }]}>
            <MaterialCommunityIcons name="compass-rose" size={22} color={theme.accent} />
          </View>
        </View>

        {cacheNotice ? (
          <View style={[styles.cacheBanner, { borderColor: theme.outline, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.62)' }]}>
            <MaterialCommunityIcons
              name={cachedSnapshotStale ? 'cloud-clock-outline' : 'content-save-outline'}
              size={15}
              color={theme.tint}
            />
            <Text style={[styles.cacheBannerText, { color: theme.textMuted }]}>{cacheNotice}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={theme.tint} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>Finding aligned profiles...</Text>
          </View>
        ) : error ? (
          <View style={[styles.statePanel, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={28} color={theme.tint} />
            <Text style={[styles.stateTitle, { color: theme.text }]}>Suggestions are unavailable</Text>
            <Text style={[styles.stateText, { color: theme.textMuted }]}>{error}</Text>
            <Pressable onPress={() => void load()} style={[styles.stateButton, { backgroundColor: theme.tint }]}>
              <Text style={styles.stateButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : recommendations.length ? (
          <View style={styles.recommendations}>
            {recommendations.map((recommendation) => (
              <ClosureRecommendationCard
                key={recommendation.lane}
                recommendation={recommendation}
                theme={theme}
                isDark={isDark}
                onViewProfile={() => openProfile(recommendation.profileId)}
                onSendIntent={() => setSelectedRecommendation(recommendation)}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.statePanel, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
            <MaterialCommunityIcons name="weather-night-partly-cloudy" size={30} color={theme.tint} />
            <Text style={[styles.stateTitle, { color: theme.text }]}>We are still learning your direction</Text>
            <Text style={[styles.stateText, { color: theme.textMuted }]}>
              Explore Vibes or join a Circle while stronger aligned profiles become available.
            </Text>
            <View style={styles.emptyActions}>
              <Pressable onPress={() => router.push('/(tabs)/vibes')} style={[styles.stateButton, { backgroundColor: theme.tint }]}>
                <Text style={styles.stateButtonText}>Explore Vibes</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(tabs)/circles')} style={[styles.outlineButton, { borderColor: theme.outline }]}>
                <Text style={[styles.outlineButtonText, { color: theme.text }]}>Open Circles</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={[styles.privacyNote, { color: theme.textMuted }]}>
          Your reflection is private. It is never shown to {targetName} or recommended profiles.
        </Text>
      </ScrollView>

      <IntentRequestSheet
        visible={Boolean(selectedRecommendation)}
        onClose={() => setSelectedRecommendation(null)}
        recipientId={selectedRecommendation?.profileId}
        recipientName={selectedRecommendation?.name ?? null}
        defaultType={selectedRecommendation?.defaultIntentType}
        prefillMessage={selectedRecommendation?.opener ?? null}
        metadata={{
          source: 'closure_to_clarity',
          lane: selectedRecommendation?.lane,
          request_id: requestId,
        }}
        onSent={() => setSelectedRecommendation(null)}
      />
    </SafeAreaView>
  );
}

function createStyles(theme: typeof Colors.light, isDark: boolean) {
  return StyleSheet.create({
    safeArea: {
      backgroundColor: theme.background,
      flex: 1,
    },
    screenGlow: {
      ...StyleSheet.absoluteFillObject,
      opacity: isDark ? 1 : 0.92,
    },
    header: {
      alignItems: 'center',
      borderBottomColor: theme.outline,
      borderBottomWidth: 1,
      flexDirection: 'row',
      minHeight: 70,
      paddingHorizontal: 18,
    },
    iconButton: {
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    headerCopy: {
      alignItems: 'center',
      flex: 1,
      paddingHorizontal: 8,
    },
    headerTitle: {
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: 21,
    },
    headerSubtitle: {
      fontSize: 12,
      marginTop: 2,
    },
    headerSpacer: {
      width: 42,
    },
    content: {
      paddingBottom: 42,
      paddingHorizontal: 20,
    },
    intro: {
      paddingBottom: 26,
      paddingTop: 30,
    },
    introEyebrow: {
      fontSize: 10,
      fontFamily: 'Manrope_800ExtraBold',
      letterSpacing: 1.25,
    },
    introTitle: {
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: 31,
      lineHeight: 37,
      marginTop: 9,
    },
    introText: {
      fontSize: 15,
      lineHeight: 22,
      marginTop: 12,
    },
    reflectionSection: {
      borderBottomWidth: 1,
      borderTopWidth: 1,
      paddingVertical: 24,
    },
    savingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    savingText: {
      fontSize: 12,
    },
    recommendationHeader: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingBottom: 16,
      paddingTop: 27,
    },
    recommendationHeaderCopy: {
      flex: 1,
    },
    sectionEyebrow: {
      fontSize: 10,
      fontFamily: 'Manrope_800ExtraBold',
      letterSpacing: 1.2,
    },
    sectionTitle: {
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: 23,
      marginTop: 4,
    },
    sectionSubtitle: {
      fontSize: 13.5,
      lineHeight: 19,
      marginTop: 6,
    },
    compassBadge: {
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: 12,
    },
    cacheBanner: {
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 9,
      marginBottom: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    cacheBannerText: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 18,
    },
    recommendations: {
      gap: 14,
    },
    loadingState: {
      alignItems: 'center',
      gap: 11,
      minHeight: 220,
      paddingTop: 70,
    },
    loadingText: {
      fontSize: 14,
    },
    statePanel: {
      alignItems: 'center',
      borderRadius: 24,
      borderWidth: 1,
      paddingHorizontal: 22,
      paddingVertical: 28,
    },
    stateTitle: {
      fontSize: 17,
      fontFamily: 'Manrope_700Bold',
      marginTop: 12,
      textAlign: 'center',
    },
    stateText: {
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
      textAlign: 'center',
    },
    stateButton: {
      alignItems: 'center',
      borderRadius: 14,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 20,
    },
    stateButtonText: {
      color: Colors.light.background,
      fontSize: 13,
      fontFamily: 'Manrope_800ExtraBold',
    },
    emptyActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    outlineButton: {
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 20,
    },
    outlineButtonText: {
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
    },
    privacyNote: {
      fontSize: 11.5,
      lineHeight: 17,
      marginTop: 20,
      paddingHorizontal: 8,
      textAlign: 'center',
    },
    pressed: {
      opacity: 0.72,
    },
  });
}
