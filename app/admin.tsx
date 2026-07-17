import { AdminVerificationDashboard } from '@/components/AdminVerificationDashboard';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { canAccessAdminTools } from '@/lib/internal-tools';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminScreen() {
  const { user } = useAuth();
  const isAllowed = canAccessAdminTools(user?.email ?? null);
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = createStyles(theme, isDark);
  const [backfillUserId, setBackfillUserId] = useState('');
  const [backfillRevenueCatUserId, setBackfillRevenueCatUserId] = useState('');
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  if (!isAllowed) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const goBackSafe = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/explore');
    }
  };

  const runRevenueCatBackfill = async () => {
    const targetUserId = backfillUserId.trim();
    const revenueCatAppUserId = backfillRevenueCatUserId.trim() || targetUserId;

    if (!targetUserId) {
      Alert.alert('RevenueCat backfill', 'Enter the Supabase auth user id first.');
      return;
    }

    setBackfillLoading(true);
    setBackfillResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('revenuecat-backfill-subscription', {
        body: {
          targetUserId,
          revenueCatAppUserId,
          environment: 'PRODUCTION',
          reason: 'admin_screen_manual_backfill',
        },
      });

      if (error) {
        throw new Error(error.message || 'Backfill failed.');
      }

      const plan = String((data as any)?.result?.plan || 'FREE');
      const endsAt = (data as any)?.result?.endsAt ? String((data as any).result.endsAt) : 'n/a';
      const syncedUserId = String((data as any)?.result?.userId || targetUserId);
      const resultText = `Plan: ${plan}\nTarget: ${syncedUserId}\nRevenueCat App User ID: ${revenueCatAppUserId}\nEnds at: ${endsAt}`;

      setBackfillResult(resultText);
      Alert.alert('RevenueCat backfill complete', resultText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backfill failed.';
      setBackfillResult(`Error: ${message}`);
      Alert.alert('RevenueCat backfill failed', message);
    } finally {
      setBackfillLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.tint, isDark ? 0.22 : 0.14), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGlow}
      />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Internal Admin</Text>
        <View style={styles.placeholder} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Restricted access</Text>
          </View>
          <Text style={styles.heroTitle}>Operations dashboard for moderation, verification, and premium health</Text>
          <Text style={styles.heroBody}>
            This surface is limited to explicitly allowed internal accounts and backed by secure admin RPCs.
          </Text>
        </View>

        <View style={styles.toolCard}>
          <View style={styles.toolHeaderRow}>
            <View>
              <Text style={styles.toolEyebrow}>RevenueCat repair</Text>
              <Text style={styles.toolTitle}>Backfill subscription row</Text>
            </View>
            <View style={styles.toolIconWrap}>
              <MaterialCommunityIcons name="refresh-circle" size={20} color={theme.tint} />
            </View>
          </View>
          <Text style={styles.toolBody}>
            Use this when RevenueCat shows an active entitlement but `public.subscriptions` has no matching row.
          </Text>

          <TextInput
            value={backfillUserId}
            onChangeText={setBackfillUserId}
            placeholder="Target Supabase user id"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <TextInput
            value={backfillRevenueCatUserId}
            onChangeText={setBackfillRevenueCatUserId}
            placeholder="RevenueCat App User ID override (optional)"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <TouchableOpacity
            style={[styles.primaryButton, backfillLoading ? styles.primaryButtonDisabled : null]}
            disabled={backfillLoading}
            activeOpacity={0.88}
            onPress={runRevenueCatBackfill}
          >
            {backfillLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="database-sync-outline" size={16} color="#FFFFFF" />
            )}
            <Text style={styles.primaryButtonText}>
              {backfillLoading ? 'Running backfill...' : 'Run subscription backfill'}
            </Text>
          </TouchableOpacity>

          {backfillResult ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Last result</Text>
              <Text style={styles.resultText}>{backfillResult}</Text>
            </View>
          ) : null}
        </View>

        <AdminVerificationDashboard />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: 18,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: 28,
    },
    bgGlow: {
      position: 'absolute',
      top: -80,
      right: -80,
      width: 240,
      height: 240,
      borderRadius: 240,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 6,
      paddingBottom: 12,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    headerTitle: {
      fontSize: 18,
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
    },
    placeholder: {
      width: 38,
    },
    hero: {
      borderRadius: 22,
      padding: 18,
      gap: 8,
      marginBottom: 16,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.74),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    heroBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
    },
    heroBadgeText: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    heroTitle: {
      color: theme.text,
      fontSize: 24,
      lineHeight: 30,
      fontFamily: 'PlayfairDisplay_700Bold',
    },
    heroBody: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: 'Manrope_500Medium',
    },
    toolCard: {
      borderRadius: 22,
      padding: 18,
      gap: 12,
      marginBottom: 16,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.74),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    toolHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    toolEyebrow: {
      color: theme.tint,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    toolTitle: {
      marginTop: 4,
      color: theme.text,
      fontSize: 18,
      fontFamily: 'Archivo_700Bold',
    },
    toolIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.12),
    },
    toolBody: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: 'Manrope_500Medium',
    },
    input: {
      minHeight: 48,
      borderRadius: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.94),
      color: theme.text,
      fontSize: 14,
      fontFamily: 'Manrope_600SemiBold',
    },
    primaryButton: {
      minHeight: 46,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.tint,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontFamily: 'Archivo_700Bold',
    },
    resultCard: {
      borderRadius: 16,
      padding: 14,
      gap: 6,
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.22 : 0.14),
    },
    resultLabel: {
      color: theme.tint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    resultText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: 'Manrope_600SemiBold',
    },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};
