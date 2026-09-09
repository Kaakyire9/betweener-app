import {
  BarChart3,
  Clock3,
  Heart,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveSessionRecap } from '../application/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const formatDuration = (seconds: number) => {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.metric}>
      {icon}
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function LiveSessionRecapCard({
  recap,
  loading,
  error,
  onRetry,
}: {
  recap: LiveSessionRecap | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);

  if (loading && !recap) {
    return <View style={styles.state}><ActivityIndicator color={visual.teal} /><Text style={styles.stateText}>Preparing your Live report…</Text></View>;
  }
  if (!recap) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>Your report needs a moment.</Text>
        <Text style={styles.stateText}>The room has ended safely. Refresh to load its final statistics.</Text>
        <Pressable onPress={onRetry} style={styles.retry}><RefreshCw size={15} color={visual.accentContrast} /><Text style={styles.retryText}>Refresh report</Text></Pressable>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>Report temporarily unavailable</Text> : null}
      </View>
    );
  }

  const privateMoments = recap.privateSparks + recap.quickConnectRounds;
  const myPrivateMoments = recap.myPrivateSparks + recap.myQuickConnectRounds;

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{recap.isHost ? 'HOST REPORT' : 'YOUR LIVE RECAP'}</Text>
          <Text style={styles.title}>{recap.isHost ? 'How the room moved.' : 'Your part in the room.'}</Text>
        </View>
        <View style={styles.reportBadge}><BarChart3 size={18} color={visual.purple} /></View>
      </View>
      <Text style={styles.copy}>
        {recap.isHost
          ? 'A clear, privacy-safe view of the room you hosted.'
          : 'Your contribution, alongside the room’s shared moments.'}
      </Text>

      <View style={styles.metrics}>
        <Metric icon={<Clock3 size={17} color={visual.teal} />} label="duration" value={formatDuration(recap.durationSeconds)} />
        <Metric icon={<Users size={17} color={visual.teal} />} label="attended" value={recap.totalAttendees} />
        <Metric icon={<MessageCircle size={17} color={visual.teal} />} label="Pulse notes" value={recap.roomPulseNotes} />
        <Metric icon={<Heart size={17} color={visual.teal} />} label="reactions" value={recap.reactions} />
        <Metric icon={<Sparkles size={17} color={visual.teal} />} label="introductions" value={recap.hostedIntroductions} />
        <Metric icon={<Sparkles size={17} color={visual.purple} />} label="private moments" value={privateMoments} />
      </View>

      {!recap.isHost ? (
        <View style={styles.personal}>
          <Text style={styles.personalEyebrow}>YOUR PARTICIPATION</Text>
          <View style={styles.personalRow}><Text style={styles.personalLabel}>Room Pulse</Text><Text style={styles.personalValue}>{recap.myRoomPulseNotes} notes · {recap.myReactions} reactions</Text></View>
          <View style={styles.personalRow}><Text style={styles.personalLabel}>Introductions</Text><Text style={styles.personalValue}>{recap.myHostedIntroductions}</Text></View>
          <View style={styles.personalRow}><Text style={styles.personalLabel}>Private connections</Text><Text style={styles.personalValue}>{myPrivateMoments}</Text></View>
        </View>
      ) : (
        <View style={styles.personal}>
          <Text style={styles.personalEyebrow}>AUDIENCE PARTICIPATION</Text>
          <View style={styles.personalRow}><Text style={styles.personalLabel}>Polls opened</Text><Text style={styles.personalValue}>{recap.audiencePolls}</Text></View>
          <View style={styles.personalRow}><Text style={styles.personalLabel}>Poll responses</Text><Text style={styles.personalValue}>{recap.pollResponses}</Text></View>
          <View style={styles.personalRow}><Text style={styles.personalLabel}>Quick Connect rounds</Text><Text style={styles.personalValue}>{recap.quickConnectRounds}</Text></View>
        </View>
      )}
      <Text style={styles.privacy}>Only aggregate room totals and your own participation are shown. Private choices and identities remain private.</Text>
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  card: { borderRadius: 26, padding: 19, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.borderStrong },
  state: { minHeight: 170, borderRadius: 25, padding: 22, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  stateTitle: { color: visual.text, fontSize: 18, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold' },
  stateText: { color: visual.textMuted, fontSize: 11, lineHeight: 18, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1 },
  eyebrow: { color: visual.teal, fontSize: 9, letterSpacing: 1.7, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: visual.text, fontSize: 25, marginTop: 4, fontFamily: 'PlayfairDisplay_700Bold' },
  reportBadge: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.purpleSoft },
  copy: { color: visual.textMuted, fontSize: 11, lineHeight: 18, marginTop: 8, fontFamily: 'Manrope_500Medium' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 17 },
  metric: { width: '31%', minHeight: 98, borderRadius: 18, padding: 12, backgroundColor: visual.surfaceSoft, borderWidth: 1, borderColor: visual.border },
  metricValue: { color: visual.text, fontSize: 19, marginTop: 8, fontFamily: 'PlayfairDisplay_700Bold' },
  metricLabel: { color: visual.textMuted, fontSize: 8, marginTop: 2, fontFamily: 'Manrope_700Bold' },
  personal: { marginTop: 17, borderRadius: 19, padding: 14, gap: 10, backgroundColor: visual.tealSoft },
  personalEyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  personalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  personalLabel: { flex: 1, color: visual.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  personalValue: { color: visual.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  privacy: { color: visual.textMuted, fontSize: 8, lineHeight: 13, marginTop: 14, fontFamily: 'Manrope_500Medium' },
  retry: { minHeight: 42, borderRadius: 21, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: visual.teal },
  retryText: { color: visual.accentContrast, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  error: { color: visual.danger, fontSize: 9, fontFamily: 'Manrope_700Bold' },
});
