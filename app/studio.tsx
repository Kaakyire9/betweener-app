import { Colors } from '@/constants/theme';
import { RELATIONSHIP_GIST_AI_STUDIO_ENABLED } from '@/features/relationship-gists/config/relationship-gist-ai-flags';
import { StudioModuleCard } from '@/features/studio/components/StudioModuleCard';
import { STUDIO_MODULES, type StudioModuleId } from '@/features/studio/config/studio-modules';
import { useLiveSessions } from '@/features/live/hooks/index.ts';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAdminAccess } from '@/lib/admin/admin-access';
import { useAuth } from '@/lib/auth-context';
import { canCreateCircle, canCreateGathering, type CircleAccessEntitlements } from '@/lib/circles/circle-access';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BetweenerStudioScreen() {
  const { user, profile } = useAuth();
  const { profileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const access = useAdminAccess();
  const { canSchedule, loading: liveLoading } = useLiveSessions();
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? 'light') === 'dark';
  const theme = Colors[isDark ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [premiumState, setPremiumState] = useState<CircleAccessEntitlements | null>(null);
  const [entitlementsLoading, setEntitlementsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setPremiumState(null);
      setEntitlementsLoading(false);
      return;
    }
    setEntitlementsLoading(true);
    void (async () => {
      const { data } = await (supabase as any).rpc('rpc_get_my_premium_state');
      if (cancelled) return;
      setPremiumState(data ?? null);
      setEntitlementsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const circleProfile = useMemo(() => ({
    id: profileId,
    user_id: user?.id ?? null,
    is_internal_admin: access.can('community'),
  }), [access, profileId, user?.id]);

  const visibleModules = useMemo(() => {
    const visibility: Record<StudioModuleId, boolean> = {
      live: canSchedule,
      circles: canCreateCircle(premiumState, circleProfile),
      gatherings: canCreateGathering(premiumState, circleProfile),
      'relationship-gists': access.can('editorial'),
    };
    return STUDIO_MODULES.filter((module) => visibility[module.id]);
  }, [access, canSchedule, circleProfile, premiumState]);

  const loading = access.loading || entitlementsLoading || liveLoading;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={21} color={theme.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CREATE & MANAGE</Text>
            <Text style={styles.headerTitle}>Betweener Studio</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <MaterialCommunityIcons name="creation-outline" size={25} color={theme.tint} />
          <Text style={styles.heroTitle}>One place to create every Betweener experience.</Text>
          <Text style={styles.heroBody}>Start new work, manage its lifecycle, and keep review and operational controls separate.</Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.tint} />
            <Text style={styles.loadingText}>Checking your Studio access…</Text>
          </View>
        ) : visibleModules.length ? (
          <View style={styles.modules}>
            {visibleModules.map((module) => (
              <StudioModuleCard
                key={module.id}
                module={module}
                theme={theme}
                isDark={isDark}
                badge={module.id === 'relationship-gists'
                  ? RELATIONSHIP_GIST_AI_STUDIO_ENABLED ? 'AI Studio enabled' : 'AI Studio disabled'
                  : null}
                onCreate={() => router.push(module.actionHref)}
                onManage={() => router.push(module.manageHref)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="shield-lock-outline" size={25} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No Studio tools available</Text>
            <Text style={styles.emptyBody}>Studio modules appear when your membership, host role, or editorial permissions allow creation.</Text>
          </View>
        )}

        {access.isAdmin ? (
          <Pressable accessibilityRole="button" style={styles.operationsLink} onPress={() => router.push('/admin')}>
            <View style={styles.operationsCopy}>
              <Text style={styles.operationsTitle}>Review & Operations</Text>
              <Text style={styles.operationsBody}>Open approvals, safety, account, commerce, and Live system tools.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: theme.tint, fontSize: 10, letterSpacing: 1.5, fontFamily: 'Archivo_700Bold' },
  headerTitle: { color: theme.text, fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold' },
  hero: { gap: 8, padding: 20, borderRadius: 26, borderWidth: 1, borderColor: isDark ? 'rgba(19,168,168,0.26)' : 'rgba(0,128,128,0.18)', backgroundColor: isDark ? 'rgba(19,168,168,0.10)' : 'rgba(255,255,255,0.72)' },
  heroTitle: { color: theme.text, fontSize: 24, lineHeight: 30, fontFamily: 'PlayfairDisplay_700Bold' },
  heroBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontFamily: 'Manrope_500Medium' },
  modules: { gap: 12 },
  loadingCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 22, borderWidth: 1, borderColor: theme.outline },
  loadingText: { color: theme.textMuted, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  emptyCard: { alignItems: 'center', padding: 26, gap: 8, borderRadius: 22, borderWidth: 1, borderColor: theme.outline },
  emptyTitle: { color: theme.text, fontSize: 19, fontFamily: 'PlayfairDisplay_700Bold' },
  emptyBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  operationsLink: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle },
  operationsCopy: { flex: 1, gap: 3 },
  operationsTitle: { color: theme.text, fontSize: 15, fontFamily: 'Archivo_700Bold' },
  operationsBody: { color: theme.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
});
