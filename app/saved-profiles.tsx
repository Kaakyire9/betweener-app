import OfflineImage from '@/components/media/OfflineImage';
import { NewHereBadge } from '@/components/NewHereBadge';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { PremiumPlanBadge } from '@/components/PremiumPlanBadge';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { buildLocationDisplay } from '@/lib/location/location-display';
import {
  readSavedProfilesSnapshotState,
  updateSavedProfilesSnapshot,
  writeSavedProfilesSnapshot,
} from '@/lib/offline/profile-insights-store';
import { getMySavedProfiles, setProfileSaved, type SavedProfileSummary } from '@/lib/profile-interest';
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

const formatSavedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved recently';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((today - targetDay) / (24 * 60 * 60 * 1000));

  if (dayDiff <= 0) return 'Saved today';
  if (dayDiff === 1) return 'Saved yesterday';
  if (dayDiff < 7) return `Saved ${dayDiff} days ago`;
  return `Saved ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};

function SavedProfileCard({
  item,
  theme,
  removing,
  onRemove,
}: {
  item: SavedProfileSummary;
  theme: typeof Colors.light;
  removing: boolean;
  onRemove: (profileId: string) => void;
}) {
  const initial = String(item.full_name || 'B').trim().charAt(0).toUpperCase() || 'B';
  const location = buildLocationDisplay(item as any, { surface: 'vibes' }).withFlag || item.current_country || '';
  const premiumPlan =
    item.premium_plan === 'GOLD' || item.premium_plan === 'SILVER'
      ? item.premium_plan
      : null;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/profile-view', params: { profileId: item.profile_id } })}
      style={[styles.card, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
    >
      <View style={styles.mediaWrap}>
        {item.avatar_url ? (
          <OfflineImage uri={item.avatar_url} style={styles.media} />
        ) : (
          <LinearGradientSafe
            colors={['rgba(12,119,120,0.96)', 'rgba(20,33,52,0.94)']}
            start={[0, 0]}
            end={[1, 1]}
            style={styles.mediaFallback}
          >
            <Text style={styles.mediaFallbackInitial}>{initial}</Text>
          </LinearGradientSafe>
        )}

        <LinearGradientSafe
          colors={['rgba(0,0,0,0)', 'rgba(5,20,24,0.22)', 'rgba(5,20,24,0.84)']}
          start={[0.5, 0]}
          end={[0.5, 1]}
          style={styles.mediaFade}
        />

        <View style={styles.mediaTopRow}>
          <View style={styles.savedAtPill}>
            <MaterialCommunityIcons name="bookmark-check-outline" size={13} color="#EAFDFC" />
            <Text style={styles.savedAtText}>{formatSavedAt(item.saved_at)}</Text>
          </View>

          <View style={styles.mediaBadgeRow}>
            {premiumPlan ? (
              <PremiumPlanBadge
                plan={premiumPlan}
                style={styles.membershipBadgeInline}
              />
            ) : null}

            {item.is_new_here ? (
              <NewHereBadge style={styles.newHereBadgeInline} />
            ) : null}
          </View>
        </View>

        <View style={styles.mediaBottom}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.full_name || 'Saved profile'}
            </Text>
            {typeof item.age === 'number' ? (
              <Text style={styles.age}>{"\u00b7"} {item.age}</Text>
            ) : null}
          </View>

          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={14} color="#F4FFFF" />
            <Text style={styles.location} numberOfLines={1}>
              {location || 'Saved for later'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardActions}>
        <Pressable
          onPress={() => router.push({ pathname: '/profile-view', params: { profileId: item.profile_id } })}
          style={[styles.primaryAction, { backgroundColor: theme.tint }]}
        >
          <MaterialCommunityIcons name="eye-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Preview</Text>
        </Pressable>

        <Pressable
          onPress={() => onRemove(item.profile_id)}
          disabled={removing}
          style={[styles.secondaryAction, { borderColor: theme.outline }]}
        >
          <MaterialCommunityIcons name="bookmark-remove-outline" size={16} color={theme.textMuted} />
          <Text style={[styles.secondaryActionText, { color: theme.textMuted }]}>
            {removing ? 'Removing...' : 'Remove'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function SavedProfilesScreen() {
  const { profile: viewerProfile } = useAuth();
  const params = useLocalSearchParams<{ from?: string }>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profiles, setProfiles] = useState<SavedProfileSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removingProfileId, setRemovingProfileId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const nextProfiles = await getMySavedProfiles();
      setProfiles(nextProfiles);
      if (viewerProfile?.id) {
        await writeSavedProfilesSnapshot(viewerProfile.id, nextProfiles);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load saved profiles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewerProfile?.id]);

  useEffect(() => {
    if (!viewerProfile?.id) return;
    let cancelled = false;
    (async () => {
      const cached = await readSavedProfilesSnapshotState(viewerProfile.id);
      if (cancelled || !cached.data) return;
      setProfiles((current) => (current.length === 0 ? cached.data : current));
      setLoading((current) => (current ? false : current));
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerProfile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle = useMemo(() => {
    if (profiles.length === 0) return 'Profiles you want to revisit later.';
    return `${profiles.length} saved ${profiles.length === 1 ? 'profile' : 'profiles'}.`;
  }, [profiles.length]);

  const handleRemove = useCallback((profileId: string) => {
    if (!viewerProfile?.id) {
      Alert.alert('Saved profiles unavailable', 'Please refresh your profile and try again.');
      return;
    }

    Alert.alert(
      'Remove saved profile?',
      'This person will be removed from your saved list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const previousProfiles = profiles;
            const nextProfiles = previousProfiles.filter((item) => item.profile_id !== profileId);
            setRemovingProfileId(profileId);
            setProfiles(nextProfiles);
            void updateSavedProfilesSnapshot(viewerProfile.id, () => nextProfiles);
            try {
              await setProfileSaved(viewerProfile.id, profileId, false);
            } catch (removeError) {
              setProfiles(previousProfiles);
              void updateSavedProfilesSnapshot(viewerProfile.id, () => previousProfiles);
              Alert.alert(
                'Unable to remove saved profile',
                removeError instanceof Error ? removeError.message : 'Please try again.',
              );
            } finally {
              setRemovingProfileId((current) => (current === profileId ? null : current));
            }
          },
        },
      ],
    );
  }, [profiles, viewerProfile?.id]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.outline }]}>
        <Pressable
          onPress={() => router.replace(params.from === 'profile-insights' ? '/profile-insights' : '/(tabs)/profile')}
          style={styles.headerButton}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Saved Profiles</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
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
          {error ? (
            <Pressable onPress={() => void load()} style={[styles.errorCard, { borderColor: theme.danger }]}>
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
              <Text style={[styles.retryText, { color: theme.textMuted }]}>Tap to retry</Text>
            </Pressable>
          ) : null}

          {profiles.length > 0 ? (
            <View style={styles.cardList}>
              {profiles.map((item) => (
                <SavedProfileCard
                  key={item.profile_id}
                  item={item}
                  theme={theme}
                  removing={removingProfileId === item.profile_id}
                  onRemove={handleRemove}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
              <View style={[styles.emptyIcon, { backgroundColor: `${theme.tint}15` }]}>
                <MaterialCommunityIcons name="book-heart-outline" size={24} color={theme.tint} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing saved yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                When someone stands out, save their profile and come back when the timing feels right.
              </Text>
              <Pressable onPress={() => router.push('/(tabs)/_vibes')} style={[styles.cta, { backgroundColor: theme.tint }]}>
                <Text style={styles.ctaText}>Explore Vibes</Text>
              </Pressable>
            </View>
          )}
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
  cardList: { gap: 16 },
  card: { borderWidth: 1, borderRadius: 24, overflow: 'hidden' },
  mediaWrap: { height: 272, position: 'relative' },
  media: { width: '100%', height: '100%' },
  mediaFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  mediaFallbackInitial: { color: '#FFFFFF', fontFamily: 'PlayfairDisplay_700Bold', fontSize: 48 },
  mediaFade: { ...StyleSheet.absoluteFillObject },
  mediaTopRow: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  savedAtPill: { minHeight: 30, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(5,20,24,0.62)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)' },
  savedAtText: { color: '#EAFDFC', fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 0.45, textTransform: 'uppercase' },
  mediaBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, maxWidth: '58%' },
  membershipBadgeInline: { alignSelf: 'flex-start' },
  newHereBadgeInline: { alignSelf: 'flex-start' },
  mediaBottom: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  name: { color: '#FFF7EF', fontFamily: 'PlayfairDisplay_700Bold', fontSize: 28, flexShrink: 1 },
  age: { color: 'rgba(255,247,239,0.92)', fontFamily: 'Manrope_700Bold', fontSize: 20 },
  locationRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  location: { color: '#F4FFFF', fontFamily: 'Manrope_600SemiBold', fontSize: 13, flex: 1 },
  cardActions: { padding: 16, flexDirection: 'row', gap: 10 },
  primaryAction: { flex: 1, minHeight: 46, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  secondaryAction: { flex: 1, minHeight: 46, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryActionText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  errorCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  errorText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  retryText: { marginTop: 4, fontFamily: 'Manrope_500Medium', fontSize: 11 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 24, alignItems: 'center' },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 16, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24 },
  emptyBody: { marginTop: 8, textAlign: 'center', fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 20 },
  cta: { marginTop: 18, minHeight: 44, borderRadius: 999, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
