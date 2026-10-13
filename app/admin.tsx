import { AdminScreenShell } from '@/components/admin/AdminScreenShell';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type AdminCapability, useAdminAccess } from '@/lib/admin/admin-access';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type OperationsModule = {
  capability: AdminCapability;
  title: string;
  detail: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  tone: 'teal' | 'violet' | 'gold' | 'rose';
};

const MODULES: OperationsModule[] = [
  { capability: 'community', title: 'Community', detail: 'Review Circle and Gathering requests.', icon: 'account-group-outline', route: '/admin-community', tone: 'teal' },
  { capability: 'editorial', title: 'Editorial', detail: 'Draft and publish Relationship Gists.', icon: 'book-edit-outline', route: '/admin-editorial', tone: 'violet' },
  { capability: 'live', title: 'Live Operations', detail: 'Inspect rollout gates and active sessions.', icon: 'broadcast', route: '/admin-live', tone: 'rose' },
  { capability: 'trust', title: 'Trust & Safety', detail: 'Verification, reports, and policy review.', icon: 'shield-check-outline', route: '/admin-trust', tone: 'teal' },
  { capability: 'accounts', title: 'Members & Accounts', detail: 'Recovery requests and account merge cases.', icon: 'account-cog-outline', route: '/admin-accounts', tone: 'violet' },
  { capability: 'commerce', title: 'Commerce', detail: 'Environment-safe membership repair tools.', icon: 'wallet-outline', route: '/admin-commerce', tone: 'gold' },
];

export default function AdminScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const styles = useMemo(() => createStyles(theme, resolvedScheme === 'dark'), [theme, resolvedScheme]);
  const access = useAdminAccess();

  return (
    <AdminScreenShell title="Betweener Operations" subtitle="Focused tools for community, safety, Live, accounts, and commerce.">
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="view-dashboard-outline" size={24} color={theme.tint} />
        </View>
        <Text style={styles.heroEyebrow}>OPERATIONS CONSOLE</Text>
        <Text style={styles.heroTitle}>One clear place to run Betweener.</Text>
        <Text style={styles.heroBody}>Each workspace loads independently, so one unavailable service cannot block the rest of the console.</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Workspaces</Text>
        <Text style={styles.sectionHint}>Choose a focused task</Text>
      </View>

      <View style={styles.grid}>
        {MODULES.filter((module) => access.can(module.capability)).map((module) => (
          <Pressable
            key={module.capability}
            accessibilityRole="button"
            accessibilityLabel={`Open ${module.title}`}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => router.push(module.route as any)}
          >
            <View style={[styles.cardIcon, styles[`${module.tone}Icon`]]}>
              <MaterialCommunityIcons name={module.icon} size={22} color={styles[`${module.tone}Text`].color} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{module.title}</Text>
              <Text style={styles.cardDetail}>{module.detail}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.notice}>
        <MaterialCommunityIcons name="shield-lock-outline" size={20} color={theme.tint} />
        <Text style={styles.noticeText}>Access is verified against Supabase on every console entry. Production and staging remain separate.</Text>
      </View>
    </AdminScreenShell>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    hero: { padding: 20, borderRadius: 26, gap: 8, backgroundColor: isDark ? 'rgba(0,128,128,0.12)' : 'rgba(255,255,255,0.68)', borderWidth: 1, borderColor: isDark ? 'rgba(91,193,187,0.22)' : 'rgba(0,128,128,0.18)' },
    heroIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,128,128,0.10)' },
    heroEyebrow: { color: theme.tint, fontSize: 10, letterSpacing: 1.5, fontFamily: 'Archivo_700Bold' },
    heroTitle: { color: theme.text, fontSize: 26, lineHeight: 32, fontFamily: 'PlayfairDisplay_700Bold' },
    heroBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontFamily: 'Manrope_500Medium' },
    sectionHeader: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    sectionTitle: { color: theme.text, fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
    sectionHint: { color: theme.textMuted, fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
    grid: { gap: 10 },
    card: { minHeight: 88, padding: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: theme.outline },
    cardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
    cardIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    tealIcon: { backgroundColor: isDark ? 'rgba(0,160,160,0.13)' : 'rgba(0,128,128,0.10)' },
    violetIcon: { backgroundColor: isDark ? 'rgba(155,124,200,0.14)' : 'rgba(125,91,166,0.10)' },
    goldIcon: { backgroundColor: isDark ? 'rgba(223,179,72,0.14)' : 'rgba(164,111,0,0.10)' },
    roseIcon: { backgroundColor: isDark ? 'rgba(240,96,128,0.14)' : 'rgba(190,48,86,0.09)' },
    tealText: { color: theme.tint },
    violetText: { color: theme.accent },
    goldText: { color: isDark ? '#F0C55E' : '#916300' },
    roseText: { color: isDark ? '#F28AA2' : '#B63158' },
    cardCopy: { flex: 1, gap: 3 },
    cardTitle: { color: theme.text, fontSize: 16, fontFamily: 'Archivo_700Bold' },
    cardDetail: { color: theme.textMuted, fontSize: 12, lineHeight: 17, fontFamily: 'Manrope_500Medium' },
    notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 15, borderRadius: 18, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: theme.outline },
    noticeText: { flex: 1, color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  });
