import { Activity, Clock3, Pause, Play, ShieldCheck, Square } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  LiveQuickConnectConcurrency,
  LiveQuickConnectHostAction,
  LiveQuickConnectHostSnapshot,
  LiveQuickConnectRoundSeconds,
} from '../application/index.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export type LiveQuickConnectHostPanelProps = {
  snapshot: LiveQuickConnectHostSnapshot | null;
  busyAction: string | null;
  error: string | null;
  onConfigure: (roundSeconds: LiveQuickConnectRoundSeconds, maxConcurrentPairs: LiveQuickConnectConcurrency) => void;
  onControl: (action: LiveQuickConnectHostAction) => void;
};

const STATE_COPY: Record<LiveQuickConnectHostSnapshot['state'], string> = {
  closed: 'The room is private while you prepare the rotation.',
  open: 'New mutually eligible pairs can form now.',
  paused: 'Existing conversations continue; no new pairs will form.',
  draining: 'The last conversations are finishing. No new pairs will form.',
  ended: 'This rotation has ended.',
};

const roundOptions = [120, 180, 300] as const;
const concurrencyOptions = [1, 2, 4, 8] as const;

export function LiveQuickConnectHostPanel({
  snapshot,
  busyAction,
  error,
  onConfigure,
  onControl,
}: LiveQuickConnectHostPanelProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  if (!snapshot) {
    return <View style={styles.loading}><ActivityIndicator color={visual.color.teal} /></View>;
  }

  const active = snapshot.state === 'open' || snapshot.metrics.activePairs > 0;
  const configure = (
    roundSeconds = snapshot.roundSeconds,
    maxConcurrentPairs = snapshot.maxConcurrentPairs,
  ) => onConfigure(roundSeconds, maxConcurrentPairs);

  return (
    <View style={styles.shell}>
      <View style={styles.stateRow}>
        <View style={styles.stateIcon}><Activity color={visual.color.teal} size={20} /></View>
        <View style={styles.stateCopy}>
          <Text style={styles.eyebrow}>ROTATION {snapshot.state.toUpperCase()}</Text>
          <Text style={styles.stateText}>{STATE_COPY[snapshot.state]}</Text>
        </View>
        {busyAction ? <ActivityIndicator color={visual.color.teal} size="small" /> : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="Waiting" value={snapshot.metrics.waitingPeople} />
        <Metric label="Eligible" value={snapshot.metrics.eligiblePeople} />
        <Metric label="Pairs" value={`${snapshot.metrics.activePairs}/${snapshot.maxConcurrentPairs}`} />
        <Metric label="Complete" value={snapshot.metrics.completedRounds} />
      </View>

      <Text style={styles.label}>SIMULTANEOUS CONVERSATIONS</Text>
      <View style={styles.options}>
        {concurrencyOptions.map((count) => (
          <Pressable
            key={count}
            accessibilityLabel={`${count} simultaneous ${count === 1 ? 'conversation' : 'conversations'}`}
            accessibilityRole="button"
            disabled={active || busyAction != null}
            onPress={() => configure(snapshot.roundSeconds, count)}
            style={[styles.option, snapshot.maxConcurrentPairs === count && styles.optionSelected, active && styles.disabled]}
          >
            <Activity color={snapshot.maxConcurrentPairs === count ? visual.color.accentContrast : visual.color.textMuted} size={14} />
            <Text style={[styles.optionText, snapshot.maxConcurrentPairs === count && styles.optionTextSelected]}>{count}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.capacityCopy}>
        {snapshot.metrics.availablePairSlots} pairing {snapshot.metrics.availablePairSlots === 1 ? 'slot' : 'slots'} available
      </Text>
      {snapshot.metrics.reconnectingPeople > 0 ? (
        <Text style={styles.reconnecting}>{snapshot.metrics.reconnectingPeople} reconnecting safely</Text>
      ) : null}

      <Text style={styles.label}>CONVERSATION LENGTH</Text>
      <View style={styles.options}>
        {roundOptions.map((seconds) => (
          <Pressable
            key={seconds}
            accessibilityRole="button"
            disabled={active || busyAction != null}
            onPress={() => configure(seconds)}
            style={[styles.option, snapshot.roundSeconds === seconds && styles.optionSelected, active && styles.disabled]}
          >
            <Clock3 color={snapshot.roundSeconds === seconds ? visual.color.accentContrast : visual.color.textMuted} size={14} />
            <Text style={[styles.optionText, snapshot.roundSeconds === seconds && styles.optionTextSelected]}>{seconds / 60} min</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>YOUR ROLE</Text>
      <View style={styles.facilitatorNotice}>
        <ShieldCheck color={visual.color.teal} size={17} />
        <View style={styles.facilitatorCopy}>
          <Text style={styles.facilitatorTitle}>Host & safety facilitator</Text>
          <Text style={styles.facilitatorBody}>You guide rotations and remain available to the room.</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>Controls could not be updated. Please try again.</Text> : null}

      <View style={styles.actions}>
        {snapshot.state === 'closed' ? <Action icon={Play} label="Open rotations" primary onPress={() => onControl('open')} disabled={busyAction != null} /> : null}
        {snapshot.state === 'open' ? <Action icon={Pause} label="Pause pairing" primary onPress={() => onControl('pause')} disabled={busyAction != null} /> : null}
        {snapshot.state === 'paused' ? <Action icon={Play} label="Resume pairing" primary onPress={() => onControl('resume')} disabled={busyAction != null} /> : null}
        {(snapshot.state === 'open' || snapshot.state === 'paused') ? <Action icon={Square} label="Finish active pairs" onPress={() => onControl('drain')} disabled={busyAction != null} /> : null}
        {snapshot.state === 'open' || snapshot.state === 'paused' || snapshot.state === 'draining' ? (
          <Action icon={Square} label="Close entry" onPress={() => onControl('close')} disabled={busyAction != null} />
        ) : null}
        {snapshot.state !== 'ended' ? <Action icon={Square} label="End rotation" danger onPress={() => onControl('end')} disabled={busyAction != null} /> : null}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Action({ icon: Icon, label, onPress, primary = false, danger = false, disabled = false }: {
  icon: LucideIcon; label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, primary && styles.actionPrimary, danger && styles.actionDanger, disabled && styles.disabled]}><Icon color={primary ? visual.color.accentContrast : danger ? visual.color.danger : visual.color.teal} size={16} /><Text style={[styles.actionText, primary && styles.actionTextPrimary, danger && styles.actionTextDanger]}>{label}</Text></Pressable>;
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  shell: { gap: 16, borderRadius: 25, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surfaceRaised, padding: 18 },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stateIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.tealSoft },
  stateCopy: { flex: 1 },
  eyebrow: { color: visual.color.teal, fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  stateText: { marginTop: 4, color: visual.color.text, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  metrics: { flexDirection: 'row', gap: 7 },
  metric: { flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.border },
  metricValue: { color: visual.color.text, fontSize: 19, fontFamily: 'Manrope_800ExtraBold' },
  metricLabel: { marginTop: 2, color: visual.color.textMuted, fontSize: 8, fontFamily: 'Manrope_700Bold' },
  reconnecting: { color: visual.color.teal, fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  capacityCopy: { marginTop: -10, color: visual.color.textMuted, fontSize: 9, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  label: { marginTop: 4, color: visual.color.textMuted, fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 42, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.border },
  facilitatorNotice: { minHeight: 58, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.borderStrong },
  facilitatorCopy: { flex: 1 },
  facilitatorTitle: { color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  facilitatorBody: { marginTop: 2, color: visual.color.textMuted, fontSize: 9, lineHeight: 13, fontFamily: 'Manrope_500Medium' },
  optionSelected: { backgroundColor: visual.color.teal, borderColor: visual.color.teal },
  optionText: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  optionTextSelected: { color: visual.color.accentContrast },
  actions: { gap: 9 },
  action: { minHeight: 48, borderRadius: 22, borderWidth: 1, borderColor: visual.color.borderStrong, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: visual.color.teal, borderColor: visual.color.teal },
  actionDanger: { borderColor: visual.color.danger, backgroundColor: visual.color.dangerSoft },
  actionText: { color: visual.color.teal, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  actionTextPrimary: { color: visual.color.accentContrast },
  actionTextDanger: { color: visual.color.danger },
  error: { color: visual.color.danger, fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  disabled: { opacity: 0.48 },
});
