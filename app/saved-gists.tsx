import { Colors } from '@/constants/theme';
import { RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED } from '@/features/relationship-gists/config/relationship-gist-editorial-v2-flags';
import { RELATIONSHIP_GIST_PERSPECTIVES } from '@/features/relationship-gists/domain/relationship-gist';
import {
  fetchSavedRelationshipGists,
  readSavedRelationshipGistCache,
  writeSavedRelationshipGistCache,
  type SavedRelationshipGist,
} from '@/features/relationship-gists/data/relationship-gist-saved-repository';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const formatHistory = (gist: SavedRelationshipGist) => {
  const lastActivity = gist.last_read_at ?? gist.last_opened_at ?? gist.saved_at;
  const date = Date.parse(lastActivity);
  const progress = Math.round(Math.max(0, Math.min(1, Number(gist.progress ?? 0))) * 100);
  return `${progress}% read / ${Number.isFinite(date) ? new Date(date).toLocaleDateString() : 'saved for later'}`;
};

export default function SavedRelationshipGistsScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'light') === 'dark' ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [perspective, setPerspective] = useState<string | null>(null);
  const [items, setItems] = useState<SavedRelationshipGist[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ownerUserId = user?.id;
    if (!ownerUserId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const cached = await readSavedRelationshipGistCache(ownerUserId, perspective);
    setItems(cached);
    try {
      const next = await fetchSavedRelationshipGists(supabase as any, perspective);
      setItems(next);
      setOfflineNotice(null);
      await writeSavedRelationshipGistCache(ownerUserId, perspective, next);
    } catch {
      setOfflineNotice(cached.length
        ? 'Showing your last saved library while the connection settles.'
        : 'Your saved library is unavailable offline until it has loaded once.');
    } finally {
      setLoading(false);
    }
  }, [perspective, user?.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back" style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>RELATIONSHIP GIST</Text>
          <Text style={styles.headerTitle}>Saved library</Text>
          <Text style={styles.headerBody}>Return to guidance, reading history and your last stable place.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.tint} />}
      >
        {!RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bookmark-outline" size={30} color={theme.tint} />
            <Text style={styles.emptyTitle}>Saved Library is not enabled</Text>
            <Text style={styles.summary}>Your existing Relationship Gist reader remains unchanged.</Text>
          </View>
        ) : null}
        {RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {[null, ...RELATIONSHIP_GIST_PERSPECTIVES].map((item) => {
              const active = perspective === item;
              return (
                <TouchableOpacity
                  key={item ?? 'all'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[styles.filter, active && styles.filterActive]}
                  onPress={() => setPerspective(item)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{item ?? 'all'}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {offlineNotice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{offlineNotice}</Text> : null}
        {loading && !items.length ? <ActivityIndicator color={theme.tint} /> : null}

        {items.map((gist) => {
          const available = gist.availability === 'available' && Boolean(gist.body);
          return (
            <TouchableOpacity
              key={gist.gist_id}
              disabled={!available}
              accessibilityRole="button"
              accessibilityState={{ disabled: !available }}
              style={[styles.card, !available && styles.cardUnavailable]}
              onPress={() => router.push({
                pathname: '/(tabs)/explore',
                params: {
                  openGistId: gist.gist_id,
                  gistPerspective: gist.selected_perspective,
                  gistSource: 'saved_library',
                },
              })}
            >
              <View style={styles.cardTop}>
                <Text style={styles.perspective}>{gist.selected_perspective}</Text>
                <MaterialCommunityIcons
                  name={available ? 'bookmark-check-outline' : 'bookmark-off-outline'}
                  size={20}
                  color={available ? theme.tint : theme.textMuted}
                />
              </View>
              <Text style={styles.title}>{gist.title}</Text>
              <Text style={styles.summary} numberOfLines={3}>{gist.short_body || gist.body || gist.unavailable_reason}</Text>
              <Text style={styles.history}>{formatHistory(gist)}</Text>
              {available ? (
                <Text style={styles.resume}>{gist.progress > 0 ? 'Resume reading' : 'Open Gist'}</Text>
              ) : (
                <Text style={styles.unavailable}>{gist.unavailable_reason}</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED && !loading && !items.length ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bookmark-outline" size={30} color={theme.tint} />
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Text style={styles.summary}>Save a Relationship Gist from Circles and it will appear here.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: (typeof Colors)[keyof typeof Colors]) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  headerCopy: { flex: 1 },
  eyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 11, letterSpacing: 1.5 },
  headerTitle: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 38 },
  headerBody: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 14, lineHeight: 20 },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  filters: { gap: 8, paddingVertical: 2 },
  filter: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSubtle },
  filterActive: { backgroundColor: theme.tint, borderColor: theme.tint },
  filterText: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'capitalize' },
  filterTextActive: { color: '#FFFFFF' },
  notice: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 12, lineHeight: 18 },
  card: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle, gap: 7 },
  cardUnavailable: { opacity: 0.72 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  perspective: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 27 },
  summary: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 14, lineHeight: 21 },
  history: { color: theme.textMuted, fontFamily: 'Archivo_400Regular', fontSize: 11 },
  resume: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  unavailable: { color: theme.danger, fontFamily: 'Archivo_700Bold', fontSize: 12, lineHeight: 18 },
  empty: { alignItems: 'center', padding: 28, borderRadius: 20, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle, gap: 8 },
  emptyTitle: { color: theme.text, fontFamily: 'CormorantGaramond_700Bold', fontSize: 25 },
});
