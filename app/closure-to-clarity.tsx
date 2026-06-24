import IntentRequestSheet from '@/components/IntentRequestSheet';
import ClosureRecommendationCard from '@/components/intent/ClosureRecommendationCard';
import ClosureReflectionChips from '@/components/intent/ClosureReflectionChips';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
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
    try {
      const [nextPool, reflection] = await Promise.all([
        loadClosureCandidatePool(viewerProfileId, targetProfileId),
        getIntentReflection(requestId),
      ]);
      setPool(nextPool);
      setSelectedReasons(reflection);
    } catch {
      setError('Unable to prepare aligned profiles right now.');
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

  const updateReflection = useCallback(async (next: ClosureReflectionReason[]) => {
    if (savingReflection || !requestId || !targetProfileId) return;
    const previous = selectedReasons;
    setSelectedReasons(next);
    setSavingReflection(true);
    try {
      const saved = await saveIntentReflection({
        intentRequestId: requestId,
        targetProfileId,
        source,
        selectedReasons: next,
      });
      setSelectedReasons(saved);
    } catch {
      setSelectedReasons(previous);
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
  ]);

  const openProfile = (profileId: string) => {
    router.push({ pathname: '/profile-view', params: { profileId } });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F6EFE3" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Closure to Clarity</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
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
            tintColor="#63D7D3"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introEyebrow}>A CLOSED DOOR CAN STILL TEACH YOU</Text>
          <Text style={styles.introTitle}>Turn the signal into a clearer next step.</Text>
          <Text style={styles.introText}>
            Your request with {targetName} has closed. These suggestions preserve the
            qualities that mattered while opening new possibilities.
          </Text>
        </View>

        <View style={styles.reflectionSection}>
          <ClosureReflectionChips
            selected={selectedReasons}
            disabled={savingReflection}
            onChange={(next) => void updateReflection(next)}
          />
          {savingReflection ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color="#63D7D3" />
              <Text style={styles.savingText}>Refining your suggestions...</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.recommendationHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>YOUR NEXT POSSIBILITY</Text>
            <Text style={styles.sectionTitle}>Three thoughtful directions</Text>
          </View>
          <MaterialCommunityIcons name="compass-rose" size={24} color="#8B5CFF" />
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#63D7D3" />
            <Text style={styles.loadingText}>Finding aligned profiles...</Text>
          </View>
        ) : error ? (
          <View style={styles.statePanel}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={28} color="#63D7D3" />
            <Text style={styles.stateTitle}>Suggestions are unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.stateButton}>
              <Text style={styles.stateButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : recommendations.length ? (
          <View style={styles.recommendations}>
            {recommendations.map((recommendation) => (
              <ClosureRecommendationCard
                key={recommendation.lane}
                recommendation={recommendation}
                onViewProfile={() => openProfile(recommendation.profileId)}
                onSendIntent={() => setSelectedRecommendation(recommendation)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.statePanel}>
            <MaterialCommunityIcons name="weather-night-partly-cloudy" size={30} color="#63D7D3" />
            <Text style={styles.stateTitle}>We are still learning your direction</Text>
            <Text style={styles.stateText}>
              Explore Vibes or join a Circle while stronger aligned profiles become available.
            </Text>
            <View style={styles.emptyActions}>
              <Pressable onPress={() => router.push('/(tabs)/vibes')} style={styles.stateButton}>
                <Text style={styles.stateButtonText}>Explore Vibes</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(tabs)/circles')} style={styles.outlineButton}>
                <Text style={styles.outlineButtonText}>Open Circles</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.privacyNote}>
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

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#061A1D',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: 'rgba(99,215,211,0.14)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 70,
    paddingHorizontal: 18,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(246,239,227,0.1)',
    borderRadius: 8,
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
    color: '#F6EFE3',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 21,
  },
  headerSubtitle: {
    color: 'rgba(246,239,227,0.55)',
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
    color: '#63D7D3',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
  },
  introTitle: {
    color: '#F6EFE3',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 31,
    lineHeight: 37,
    marginTop: 9,
  },
  introText: {
    color: 'rgba(246,239,227,0.68)',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  reflectionSection: {
    borderBottomColor: 'rgba(99,215,211,0.14)',
    borderBottomWidth: 1,
    borderTopColor: 'rgba(99,215,211,0.14)',
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
    color: 'rgba(246,239,227,0.56)',
    fontSize: 12,
  },
  recommendationHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingTop: 27,
  },
  sectionEyebrow: {
    color: '#8B5CFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: '#F6EFE3',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 23,
    marginTop: 4,
  },
  recommendations: {
    gap: 13,
  },
  loadingState: {
    alignItems: 'center',
    gap: 11,
    minHeight: 220,
    paddingTop: 70,
  },
  loadingText: {
    color: 'rgba(246,239,227,0.62)',
    fontSize: 14,
  },
  statePanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(9,42,45,0.74)',
    borderColor: 'rgba(99,215,211,0.18)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  stateTitle: {
    color: '#F6EFE3',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  stateText: {
    color: 'rgba(246,239,227,0.62)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  stateButton: {
    alignItems: 'center',
    backgroundColor: '#63D7D3',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 43,
    paddingHorizontal: 20,
  },
  stateButtonText: {
    color: '#061E22',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  outlineButton: {
    alignItems: 'center',
    borderColor: 'rgba(99,215,211,0.36)',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 43,
    paddingHorizontal: 20,
  },
  outlineButtonText: {
    color: '#F6EFE3',
    fontSize: 13,
    fontWeight: '700',
  },
  privacyNote: {
    color: 'rgba(246,239,227,0.42)',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 20,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
