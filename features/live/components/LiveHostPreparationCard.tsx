import { Camera, Check, Mic, Settings2, Share2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveSessionSummary } from '../application/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export function LiveHostPreparationCard({
  session,
  onOpenBackstage,
  onManage,
  onShare,
  now = Date.now(),
}: {
  session: LiveSessionSummary;
  onOpenBackstage: () => void;
  onManage: () => void;
  onShare: () => void;
  now?: number;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const scheduledStart = session.scheduledStart ? Date.parse(session.scheduledStart) : 0;
  const isDue = !scheduledStart || scheduledStart <= now;

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>HOST PREPARATION</Text>
          <Text style={styles.title}>{isDue ? 'It’s time to go live.' : 'Prepare privately.'}</Text>
        </View>
        <View style={styles.ready}><Check size={13} color={visual.accentContrast} /><Text style={styles.readyText}>{isDue ? 'READY' : 'SCHEDULED'}</Text></View>
      </View>
      <Text style={styles.copy}>{isDue
        ? 'Open backstage for one final camera, microphone, and connection check—then open the public stage when you are ready.'
        : 'Backstage is available now for a private rehearsal. The public stage stays locked until the scheduled time.'}</Text>
      <View style={styles.readiness}>
        <View style={styles.readinessItem}><Camera size={16} color={visual.teal} /><Text style={styles.readinessText}>Private camera preview</Text></View>
        <View style={styles.readinessItem}><Mic size={16} color={visual.teal} /><Text style={styles.readinessText}>Mic and connection check</Text></View>
      </View>
      {session.scheduleRevision > 0 ? <Text style={styles.revision}>Schedule revision {session.scheduleRevision} · Guests were asked to reconfirm.</Text> : null}
      <Pressable onPress={onOpenBackstage} style={styles.primary}><Text style={styles.primaryText}>{isDue ? 'Open backstage & go live' : 'Open private backstage'}</Text></Pressable>
      <View style={styles.actions}>
        <Pressable onPress={onShare} style={styles.secondary}><Share2 size={16} color={visual.teal} /><Text style={styles.secondaryText}>Share</Text></Pressable>
        <Pressable onPress={onManage} style={styles.secondary}><Settings2 size={16} color={visual.teal} /><Text style={styles.secondaryText}>Manage</Text></Pressable>
      </View>
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  card: { borderRadius: 25, padding: 18, backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.borderStrong },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1 },
  eyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.5, fontFamily: 'Manrope_800ExtraBold' },
  title: { color: visual.text, fontSize: 23, marginTop: 3, fontFamily: 'PlayfairDisplay_700Bold' },
  ready: { minHeight: 26, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: visual.teal },
  readyText: { color: visual.accentContrast, fontSize: 7, letterSpacing: 0.8, fontFamily: 'Manrope_800ExtraBold' },
  copy: { color: visual.textMuted, fontSize: 10, lineHeight: 17, marginTop: 10, fontFamily: 'Manrope_500Medium' },
  readiness: { borderRadius: 17, padding: 13, marginTop: 14, gap: 10, backgroundColor: visual.surfaceSoft },
  readinessItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  readinessText: { color: visual.text, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  revision: { color: visual.purple, fontSize: 9, lineHeight: 14, marginTop: 11, fontFamily: 'Manrope_700Bold' },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 15, backgroundColor: visual.teal },
  primaryText: { color: visual.accentContrast, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 9 },
  secondary: { flex: 1, minHeight: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: visual.border },
  secondaryText: { color: visual.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
});
