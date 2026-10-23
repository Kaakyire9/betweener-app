import { AdminScreenShell } from '@/components/admin/AdminScreenShell';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

type LiveConfiguration = {
  betweener_studio_enabled: boolean;
  betweener_studio_control_enabled: boolean;
  studio_session_discovery_enabled: boolean;
  studio_media_publishing_enabled: boolean;
  screen_share_enabled: boolean;
  studio_screen_audio_enabled: boolean;
  studio_external_audio_enabled: boolean;
  studio_closed_beta: boolean;
  large_panel_enabled: boolean;
  updated_at: string;
};

const FLAGS: { key: keyof LiveConfiguration; label: string; detail: string }[] = [
  { key: 'betweener_studio_enabled', label: 'Studio foundation', detail: 'Master gate for advanced Live control.' },
  { key: 'studio_session_discovery_enabled', label: 'Session discovery', detail: 'Allows authorized operators to discover Studio sessions.' },
  { key: 'betweener_studio_control_enabled', label: 'Control room', detail: 'Allows program control operations.' },
  { key: 'studio_media_publishing_enabled', label: 'Media publishing', detail: 'Allows authorized program publishing.' },
  { key: 'screen_share_enabled', label: 'Screen sharing', detail: 'Allows screen-share media admission.' },
  { key: 'studio_external_audio_enabled', label: 'External audio', detail: 'Allows external program audio sources.' },
  { key: 'large_panel_enabled', label: 'Six-person panels', detail: 'Allows AAL2 operators to opt individual Lives into a six-person stage.' },
];

export default function AdminLiveScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const styles = useMemo(() => createStyles(theme, resolvedScheme === 'dark'), [theme, resolvedScheme]);
  const [configuration, setConfiguration] = useState<LiveConfiguration | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [configurationResult, sessionsResult] = await Promise.all([
      (supabase as any).from('live_odo_configuration').select('betweener_studio_enabled,betweener_studio_control_enabled,studio_session_discovery_enabled,studio_media_publishing_enabled,screen_share_enabled,studio_screen_audio_enabled,studio_external_audio_enabled,studio_closed_beta,large_panel_enabled,updated_at').eq('id', true).maybeSingle(),
      (supabase as any).rpc('rpc_list_live_studio_control_sessions_v1', { p_limit: 30 }),
    ]);
    setLoading(false);
    const error = configurationResult.error || sessionsResult.error;
    if (error) {
      Alert.alert('Live Operations', error.message || 'Unable to read Live status.');
      return;
    }
    setConfiguration(configurationResult.data as LiveConfiguration | null);
    setSessionCount(Array.isArray(sessionsResult.data) ? sessionsResult.data.length : 0);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const masterEnabled = configuration?.betweener_studio_enabled === true;

  return (
    <AdminScreenShell title="Live Operations" subtitle="Read-only rollout health and control-room readiness." capability="live" refreshing={loading} onRefresh={() => void load()}>
      <View style={[styles.safetyCard, masterEnabled ? styles.safetyEnabled : styles.safetyDisabled]}>
        <View style={styles.safetyIcon}>
          <MaterialCommunityIcons name={masterEnabled ? 'broadcast' : 'shield-lock-outline'} size={24} color={masterEnabled ? theme.tint : theme.textMuted} />
        </View>
        <View style={styles.safetyCopy}>
          <Text style={styles.safetyEyebrow}>STAGING ROLLOUT</Text>
          <Text style={styles.safetyTitle}>{masterEnabled ? 'Live Control Room enabled' : 'Live Control Room safely disabled'}</Text>
          <Text style={styles.safetyBody}>This screen intentionally cannot change rollout flags. Enablement remains a separate, audited staging operation.</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metric}><Text style={styles.metricValue}>{sessionCount}</Text><Text style={styles.metricLabel}>Visible control sessions</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{configuration?.studio_closed_beta ? 'ON' : 'OFF'}</Text><Text style={styles.metricLabel}>Closed beta</Text></View>
      </View>

      <View style={styles.hostCard}>
        <View style={styles.hostIcon}>
          <MaterialCommunityIcons name="video-plus-outline" size={24} color={theme.tint} />
        </View>
        <View style={styles.hostCopy}>
          <Text style={styles.hostEyebrow}>HOST EXPERIENCE</Text>
          <Text style={styles.hostTitle}>Ready to host a Live?</Text>
          <Text style={styles.hostBody}>Creation, preparation, and scheduled rooms live in the Live Host Dashboard. Rollout controls remain read-only here.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/live')} style={styles.hostButton}>
            <Text style={styles.hostButtonText}>Open Live Host Dashboard</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color={theme.background} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Rollout gates</Text>
      <View style={styles.flagsCard}>
        {FLAGS.map((flag, index) => {
          const enabled = configuration?.[flag.key] === true;
          return (
            <View key={flag.key} style={[styles.flagRow, index > 0 && styles.flagDivider]}>
              <View style={[styles.flagDot, enabled && styles.flagDotEnabled]} />
              <View style={styles.flagCopy}>
                <Text style={styles.flagTitle}>{flag.label}</Text>
                <Text style={styles.flagDetail}>{flag.detail}</Text>
              </View>
              <Text style={[styles.flagValue, enabled && styles.flagValueEnabled]}>{enabled ? 'ENABLED' : 'DISABLED'}</Text>
            </View>
          );
        })}
      </View>

      {configuration?.updated_at ? <Text style={styles.updated}>Configuration updated {new Date(configuration.updated_at).toLocaleString()}</Text> : null}
    </AdminScreenShell>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  safetyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 18, borderRadius: 24, borderWidth: 1 },
  safetyDisabled: { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.68)', borderColor: theme.outline },
  safetyEnabled: { backgroundColor: isDark ? 'rgba(0,160,160,0.10)' : 'rgba(0,128,128,0.08)', borderColor: isDark ? 'rgba(0,160,160,0.28)' : 'rgba(0,128,128,0.22)' },
  safetyIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.76)' },
  safetyCopy: { flex: 1, gap: 4 },
  safetyEyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 9, letterSpacing: 1.2 },
  safetyTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, lineHeight: 25 },
  safetyBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 17 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, padding: 16, gap: 3, borderRadius: 19, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: theme.outline },
  metricValue: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 25 },
  metricLabel: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 10, lineHeight: 14 },
  hostCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 18, borderRadius: 24, backgroundColor: isDark ? 'rgba(0,160,160,0.08)' : 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: isDark ? 'rgba(0,160,160,0.24)' : 'rgba(0,128,128,0.20)' },
  hostIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSubtle },
  hostCopy: { flex: 1, gap: 4 },
  hostEyebrow: { color: theme.tint, fontFamily: 'Archivo_700Bold', fontSize: 9, letterSpacing: 1.2 },
  hostTitle: { color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, lineHeight: 25 },
  hostBody: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 11, lineHeight: 17 },
  hostButton: { alignSelf: 'flex-start', minHeight: 42, marginTop: 8, paddingHorizontal: 15, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: theme.tint },
  hostButtonText: { color: theme.background, fontFamily: 'Manrope_800ExtraBold', fontSize: 10 },
  sectionTitle: { marginTop: 4, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20 },
  flagsCard: { paddingHorizontal: 16, borderRadius: 22, backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: theme.outline },
  flagRow: { minHeight: 75, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  flagDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.outline },
  flagDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.textMuted },
  flagDotEnabled: { backgroundColor: theme.tint },
  flagCopy: { flex: 1, gap: 2 },
  flagTitle: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 12 },
  flagDetail: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 10, lineHeight: 14 },
  flagValue: { color: theme.textMuted, fontFamily: 'Archivo_700Bold', fontSize: 8, letterSpacing: 0.6 },
  flagValueEnabled: { color: theme.tint },
  updated: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', fontSize: 10, textAlign: 'center' },
});
