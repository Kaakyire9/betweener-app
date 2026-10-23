import { AdminScreenShell } from '@/components/admin/AdminScreenShell';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getRevenueCatBackfillEnvironment, getRuntimeEnvironmentLabel } from '@/lib/admin/admin-access';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function AdminCommerceScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const styles = useMemo(() => createStyles(theme, resolvedScheme === 'dark'), [theme, resolvedScheme]);
  const [targetUserId, setTargetUserId] = useState('');
  const [revenueCatUserId, setRevenueCatUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const runtimeEnvironment = getRuntimeEnvironmentLabel();
  const revenueCatEnvironment = getRevenueCatBackfillEnvironment();

  const runBackfill = async () => {
    const target = targetUserId.trim();
    const appUserId = revenueCatUserId.trim() || target;
    if (!target) {
      Alert.alert('Membership repair', 'Enter the Supabase auth user ID.');
      return;
    }

    setLoading(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke('revenuecat-backfill-subscription', {
      body: {
        targetUserId: target,
        revenueCatAppUserId: appUserId,
        environment: revenueCatEnvironment,
        reason: 'admin_commerce_manual_backfill',
      },
    });
    setLoading(false);
    if (error) {
      setResult(`Error: ${error.message}`);
      Alert.alert('Membership repair failed', error.message);
      return;
    }

    const payload = data as any;
    const text = [
      `Plan: ${String(payload?.result?.plan || 'FREE')}`,
      `Target: ${String(payload?.result?.userId || target)}`,
      `RevenueCat ID: ${appUserId}`,
      `Environment: ${revenueCatEnvironment}`,
      `Ends at: ${payload?.result?.endsAt ? String(payload.result.endsAt) : 'n/a'}`,
    ].join('\n');
    setResult(text);
    Alert.alert('Membership repair complete', text);
  };

  return (
    <AdminScreenShell title="Commerce" subtitle="Membership and wallet operations with explicit environment provenance." capability="commerce">
      <View style={styles.environmentCard}>
        <MaterialCommunityIcons name="shield-check-outline" size={22} color={theme.tint} />
        <View style={styles.environmentCopy}>
          <Text style={styles.environmentTitle}>{runtimeEnvironment} runtime</Text>
          <Text style={styles.environmentBody}>RevenueCat repair requests are locked to {revenueCatEnvironment}.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.eyebrow}>MEMBERSHIP REPAIR</Text>
            <Text style={styles.cardTitle}>Backfill subscription mirror</Text>
          </View>
          <View style={styles.iconWrap}><MaterialCommunityIcons name="database-sync-outline" size={21} color={theme.tint} /></View>
        </View>
        <Text style={styles.body}>Use only when RevenueCat has an authoritative entitlement and Supabase has no matching subscription row.</Text>
        <TextInput value={targetUserId} onChangeText={setTargetUserId} autoCapitalize="none" autoCorrect={false} placeholder="Supabase auth user ID" placeholderTextColor={theme.textMuted} style={styles.input} />
        <TextInput value={revenueCatUserId} onChangeText={setRevenueCatUserId} autoCapitalize="none" autoCorrect={false} placeholder="RevenueCat App User ID override (optional)" placeholderTextColor={theme.textMuted} style={styles.input} />
        <TouchableOpacity disabled={loading} style={[styles.button, loading && styles.buttonDisabled]} onPress={() => void runBackfill()}>
          {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialCommunityIcons name="database-sync-outline" size={17} color="#FFFFFF" />}
          <Text style={styles.buttonText}>{loading ? 'Running repair…' : `Run ${revenueCatEnvironment.toLowerCase()} repair`}</Text>
        </TouchableOpacity>
        {result ? <View style={styles.result}><Text style={styles.resultLabel}>LAST RESULT</Text><Text style={styles.resultText}>{result}</Text></View> : null}
      </View>
    </AdminScreenShell>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  environmentCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 15, borderRadius: 18, backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : 'rgba(255,255,255,0.68)', borderWidth: 1, borderColor: isDark ? 'rgba(0,160,160,0.24)' : 'rgba(0,128,128,0.18)' },
  environmentCopy: { flex: 1, gap: 2 },
  environmentTitle: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 13 },
  environmentBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 16 },
  card: { gap: 13, padding: 18, borderRadius: 24, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: theme.outline },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 10, letterSpacing: 1.2 },
  cardTitle: { marginTop: 4, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 21 },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(0,160,160,0.12)' : 'rgba(0,128,128,0.09)' },
  body: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 19 },
  input: { minHeight: 50, paddingHorizontal: 14, borderRadius: 15, color: theme.text, backgroundColor: isDark ? theme.background : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: theme.outline, fontFamily: 'Manrope_500Medium' },
  button: { minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.tint },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontFamily: 'Archivo_700Bold', fontSize: 12 },
  result: { padding: 14, gap: 6, borderRadius: 16, backgroundColor: isDark ? theme.background : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: theme.outline },
  resultLabel: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 9, letterSpacing: 1 },
  resultText: { color: theme.text, fontFamily: 'Manrope_600SemiBold', fontSize: 11, lineHeight: 17 },
});
