import OfflineImage from '@/components/media/OfflineImage';
import ProfileInterestMetric from '@/components/profile-interest/ProfileInterestMetric';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getMyProfileInterest,
  type ProfileInterestPerson,
  type ProfileInterestSummary,
  type ProfileInterestTimelineItem,
} from '@/lib/profile-interest';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const signalCopy = (signal: string) => {
  switch (signal) {
    case 'profile_saved':
      return { icon: 'bookmark-heart', text: 'saved your profile' };
    case 'intro_played':
    case 'intro_completed':
      return { icon: 'play-circle-outline', text: 'watched your intro video' };
    case 'intent_opened':
      return { icon: 'target', text: 'opened your Intent card' };
    case 'full_profile_opened':
      return { icon: 'book-open-page-variant-outline', text: 'opened your full profile' };
    default:
      return { icon: 'eye-outline', text: 'visited your profile' };
  }
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function PersonAvatar({ person }: { person: Pick<ProfileInterestPerson, 'name' | 'avatar_url'> }) {
  const initial = person.name.trim().charAt(0).toUpperCase() || 'B';
  return person.avatar_url ? (
    <OfflineImage uri={person.avatar_url} style={styles.avatar} />
  ) : (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

export default function ProfileInterestScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const [summary, setSummary] = useState<ProfileInterestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setSummary(await getMyProfileInterest());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Profile Interest.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = summary?.metrics;
  const strongest = useMemo(
    () => (summary?.people ?? []).filter((person) => person.interest_score >= 7).slice(0, 6),
    [summary?.people],
  );
  const plan = summary?.plan ?? 'FREE';

  const openProfile = (profileId: string) => {
    router.push({ pathname: '/profile-view', params: { profileId } });
  };

  const renderPerson = (person: ProfileInterestPerson) => {
    const details = [
      person.visit_count > 1 ? `Visited ${person.visit_count} times` : 'Visited your profile',
      person.watched_intro ? 'Watched intro' : null,
      person.saved_profile ? 'Saved profile' : null,
      person.opened_intent ? 'Opened Intent' : null,
    ].filter(Boolean);

    return (
      <Pressable
        key={person.profile_id}
        onPress={() => openProfile(person.profile_id)}
        style={[styles.personRow, { borderBottomColor: theme.outline }]}
      >
        <PersonAvatar person={person} />
        <View style={styles.personCopy}>
          <View style={styles.personTitleRow}>
            <Text style={[styles.personName, { color: theme.text }]} numberOfLines={1}>
              {person.name}
            </Text>
            {plan === 'GOLD' ? (
              <View style={styles.scorePill}>
                <Text style={styles.scorePillText}>{person.interest_level}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.personSignal, { color: theme.textMuted }]} numberOfLines={2}>
            {details.join(' - ')}
          </Text>
          {plan === 'GOLD' && person.shared_values?.length ? (
            <Text style={[styles.sharedValues, { color: theme.secondary }]} numberOfLines={1}>
              Shared values: {person.shared_values.join(', ')}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.personDate, { color: theme.textMuted }]}>{formatTime(person.last_signal_at)}</Text>
      </Pressable>
    );
  };

  const renderTimeline = (item: ProfileInterestTimelineItem) => {
    const copy = signalCopy(item.signal);
    return (
      <Pressable
        key={item.id}
        onPress={() => openProfile(item.profile_id)}
        style={[styles.timelineRow, { borderBottomColor: theme.outline }]}
      >
        <View style={[styles.timelineIcon, { backgroundColor: `${theme.tint}18` }]}>
          <MaterialCommunityIcons name={copy.icon as any} size={17} color={theme.tint} />
        </View>
        <Text style={[styles.timelineText, { color: theme.text }]}>
          <Text style={styles.timelineName}>{item.name}</Text> {copy.text}
        </Text>
        <Text style={[styles.timelineDate, { color: theme.textMuted }]}>{formatTime(item.occurred_at)}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.outline }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile Interest</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>
            See how people engage with your profile.
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.tint} />
          }
        >
          <LinearGradient
            colors={isDark ? ['#102E31', '#151F28'] : ['#DDEFEA', '#EEE5F5']}
            style={[styles.hero, { borderColor: theme.outline }]}
          >
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="heart-outline" size={24} color="#EAFDFC" />
            </View>
            <Text style={[styles.heroEyebrow, { color: theme.secondary }]}>THIS WEEK</Text>
            <Text style={[styles.heroTitle, { color: theme.text }]}>
              Meaningful signals, without the surveillance.
            </Text>
            <Text style={[styles.heroBody, { color: theme.textMuted }]}>
              Profile Interest highlights the moments when someone slows down and genuinely gets to know you.
            </Text>
          </LinearGradient>

          {error ? (
            <Pressable onPress={() => void load()} style={[styles.errorCard, { borderColor: theme.danger }]}>
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              <Text style={[styles.retryText, { color: theme.textMuted }]}>Tap to retry</Text>
            </Pressable>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Engagement</Text>
            <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>Last 7 days</Text>
          </View>
          <View style={styles.metricsGrid}>
            <ProfileInterestMetric icon="eye-outline" label="Profile Visits" value={metrics?.profile_visits ?? 0} accent={theme.secondary} textColor={theme.text} mutedColor={theme.textMuted} surfaceColor={theme.backgroundSubtle} borderColor={theme.outline} />
            <ProfileInterestMetric icon="play-circle-outline" label="Intro Watches" value={metrics?.intro_watches ?? 0} accent={theme.accent} textColor={theme.text} mutedColor={theme.textMuted} surfaceColor={theme.backgroundSubtle} borderColor={theme.outline} />
            <ProfileInterestMetric icon="book-heart-outline" label="Profile Saves" value={metrics?.profile_saves ?? 0} accent="#C99734" textColor={theme.text} mutedColor={theme.textMuted} surfaceColor={theme.backgroundSubtle} borderColor={theme.outline} />
            <ProfileInterestMetric icon="book-open-page-variant-outline" label="Full Opens" value={metrics?.full_opens ?? 0} accent={theme.tint} textColor={theme.text} mutedColor={theme.textMuted} surfaceColor={theme.backgroundSubtle} borderColor={theme.outline} />
            <ProfileInterestMetric icon="repeat" label="Repeat Visits" value={metrics?.repeat_visits ?? 0} accent="#D47EA0" textColor={theme.text} mutedColor={theme.textMuted} surfaceColor={theme.backgroundSubtle} borderColor={theme.outline} />
            <ProfileInterestMetric icon="target" label="Intent Opens" value={metrics?.intent_opens ?? 0} accent="#79A870" textColor={theme.text} mutedColor={theme.textMuted} surfaceColor={theme.backgroundSubtle} borderColor={theme.outline} />
          </View>

          {plan === 'FREE' ? (
            <View style={[styles.upgradeCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
              <View style={styles.upgradeIcon}>
                <MaterialCommunityIcons name="diamond-stone" size={22} color="#C3CED2" />
              </View>
              <View style={styles.upgradeCopy}>
                <Text style={[styles.upgradeTitle, { color: theme.text }]}>See more signals with Silver</Text>
                <Text style={[styles.upgradeBody, { color: theme.textMuted }]}>
                  Reveal recent people and the type of interest they showed, while keeping the experience respectful.
                </Text>
              </View>
              <Pressable onPress={() => router.push('/premium-plans')} style={[styles.upgradeButton, { backgroundColor: theme.tint }]}>
                <Text style={styles.upgradeButtonText}>View plans</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Strong Signals</Text>
                <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>
                  {plan === 'GOLD' ? '30 days' : '7 days'}
                </Text>
              </View>
              <View style={[styles.listSurface, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                {(strongest.length ? strongest : summary?.people ?? []).map(renderPerson)}
                {(summary?.people ?? []).length === 0 ? (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="account-search-outline" size={26} color={theme.tint} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>Signals are still warming up</Text>
                    <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                      Thoughtful visits, saves, and intro watches will appear here.
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          )}

          {plan === 'GOLD' && (summary?.timeline.length ?? 0) > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Interest Timeline</Text>
                <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>Gold</Text>
              </View>
              <View style={[styles.listSurface, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
                {summary?.timeline.map(renderTimeline)}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24 },
  headerSubtitle: { marginTop: 2, fontFamily: 'Manrope_500Medium', fontSize: 11 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 44 },
  hero: { borderWidth: 1, borderRadius: 8, padding: 20, overflow: 'hidden' },
  heroIcon: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#0C7778', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  heroEyebrow: { fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1.5 },
  heroTitle: { marginTop: 8, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 26, lineHeight: 32 },
  heroBody: { marginTop: 10, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20 },
  errorCard: { marginTop: 16, borderWidth: 1, borderRadius: 8, padding: 14 },
  errorText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  retryText: { marginTop: 3, fontFamily: 'Manrope_500Medium', fontSize: 11 },
  sectionHeader: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 21 },
  sectionMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  upgradeCard: { marginTop: 24, borderWidth: 1, borderRadius: 8, padding: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  upgradeIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: 'rgba(195,206,210,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  upgradeCopy: { flex: 1, minWidth: 190 },
  upgradeTitle: { fontFamily: 'Archivo_700Bold', fontSize: 15 },
  upgradeBody: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  upgradeButton: { marginTop: 14, width: '100%', minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  upgradeButtonText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  listSurface: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  personRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#0C7778', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 17 },
  personCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  personTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName: { flexShrink: 1, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  personSignal: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16 },
  sharedValues: { marginTop: 3, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  personDate: { marginLeft: 8, fontFamily: 'Manrope_500Medium', fontSize: 10 },
  scorePill: { borderRadius: 999, backgroundColor: 'rgba(139,92,255,0.14)', paddingHorizontal: 7, paddingVertical: 3 },
  scorePillText: { color: '#A991FF', fontFamily: 'Manrope_700Bold', fontSize: 9 },
  timelineRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  timelineIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  timelineText: { flex: 1, marginHorizontal: 10, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 17 },
  timelineName: { fontFamily: 'Manrope_700Bold' },
  timelineDate: { fontFamily: 'Manrope_500Medium', fontSize: 10 },
  emptyState: { padding: 28, alignItems: 'center' },
  emptyTitle: { marginTop: 12, fontFamily: 'Archivo_700Bold', fontSize: 15 },
  emptyBody: { marginTop: 6, textAlign: 'center', fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
});
