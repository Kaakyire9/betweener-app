import { Activity, Clock3, Pause, Play, ShieldCheck, Square, UsersRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  LiveQuickConnectCreatorMode,
  LiveQuickConnectHostAction,
  LiveQuickConnectHostSnapshot,
  LiveQuickConnectRoundSeconds,
} from '../application/index.ts';

export type LiveQuickConnectHostPanelProps = {
  snapshot: LiveQuickConnectHostSnapshot | null;
  busyAction: string | null;
  error: string | null;
  onConfigure: (roundSeconds: LiveQuickConnectRoundSeconds, creatorMode: LiveQuickConnectCreatorMode) => void;
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

export function LiveQuickConnectHostPanel({
  snapshot,
  busyAction,
  error,
  onConfigure,
  onControl,
}: LiveQuickConnectHostPanelProps) {
  if (!snapshot) {
    return <View style={styles.loading}><ActivityIndicator color="#D7B56D" /></View>;
  }

  const active = snapshot.state === 'open' || snapshot.metrics.activePairs > 0;
  const configure = (
    roundSeconds = snapshot.roundSeconds,
    creatorMode = snapshot.creatorMode,
  ) => onConfigure(roundSeconds, creatorMode);

  return (
    <View style={styles.shell}>
      <View style={styles.stateRow}>
        <View style={styles.stateIcon}><Activity color="#D7B56D" size={20} /></View>
        <View style={styles.stateCopy}>
          <Text style={styles.eyebrow}>ROTATION {snapshot.state.toUpperCase()}</Text>
          <Text style={styles.stateText}>{STATE_COPY[snapshot.state]}</Text>
        </View>
        {busyAction ? <ActivityIndicator color="#D7B56D" size="small" /> : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="Waiting" value={snapshot.metrics.waitingPeople} />
        <Metric label="Eligible" value={snapshot.metrics.eligiblePeople} />
        <Metric label="Pairs" value={snapshot.metrics.activePairs} />
        <Metric label="Complete" value={snapshot.metrics.completedRounds} />
      </View>
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
            <Clock3 color={snapshot.roundSeconds === seconds ? '#102522' : '#A9BAB5'} size={14} />
            <Text style={[styles.optionText, snapshot.roundSeconds === seconds && styles.optionTextSelected]}>{seconds / 60} min</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>YOUR ROLE</Text>
      <View style={styles.options}>
        <Pressable
          accessibilityRole="button"
          disabled={active || busyAction != null}
          onPress={() => configure(snapshot.roundSeconds, 'facilitator')}
          style={[styles.roleOption, snapshot.creatorMode === 'facilitator' && styles.optionSelected, active && styles.disabled]}
        >
          <ShieldCheck color={snapshot.creatorMode === 'facilitator' ? '#102522' : '#A9BAB5'} size={16} />
          <Text style={[styles.optionText, snapshot.creatorMode === 'facilitator' && styles.optionTextSelected]}>Facilitate</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={active || busyAction != null}
          onPress={() => configure(snapshot.roundSeconds, 'participant')}
          style={[styles.roleOption, snapshot.creatorMode === 'participant' && styles.optionSelected, active && styles.disabled]}
        >
          <UsersRound color={snapshot.creatorMode === 'participant' ? '#102522' : '#A9BAB5'} size={16} />
          <Text style={[styles.optionText, snapshot.creatorMode === 'participant' && styles.optionTextSelected]}>Join rotations</Text>
        </Pressable>
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

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Action({ icon: Icon, label, onPress, primary = false, danger = false, disabled = false }: {
  icon: LucideIcon; label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, primary && styles.actionPrimary, danger && styles.actionDanger, disabled && styles.disabled]}><Icon color={primary ? '#102522' : danger ? '#F2B6B6' : '#D7B56D'} size={16} /><Text style={[styles.actionText, primary && styles.actionTextPrimary, danger && styles.actionTextDanger]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  shell: { gap: 16, borderRadius: 25, borderWidth: 1, borderColor: '#D7B56D45', backgroundColor: '#102522', padding: 18 },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stateIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D18' },
  stateCopy: { flex: 1 },
  eyebrow: { color: '#D7B56D', fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  stateText: { marginTop: 4, color: '#D3DFDB', fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_500Medium' },
  metrics: { flexDirection: 'row', gap: 7 },
  metric: { flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#091714', borderWidth: 1, borderColor: '#29413B' },
  metricValue: { color: '#FFF7EC', fontSize: 19, fontFamily: 'Manrope_800ExtraBold' },
  metricLabel: { marginTop: 2, color: '#8FA39D', fontSize: 8, fontFamily: 'Manrope_700Bold' },
  reconnecting: { color: '#D7B56D', fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  label: { marginTop: 4, color: '#8FA39D', fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 42, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#091714', borderWidth: 1, borderColor: '#29413B' },
  roleOption: { flex: 1, minHeight: 47, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#091714', borderWidth: 1, borderColor: '#29413B' },
  optionSelected: { backgroundColor: '#D7B56D', borderColor: '#D7B56D' },
  optionText: { color: '#A9BAB5', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  optionTextSelected: { color: '#102522' },
  actions: { gap: 9 },
  action: { minHeight: 48, borderRadius: 22, borderWidth: 1, borderColor: '#D7B56D65', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: '#D7B56D', borderColor: '#D7B56D' },
  actionDanger: { borderColor: '#7A3B3B', backgroundColor: '#4A2424' },
  actionText: { color: '#D7B56D', fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  actionTextPrimary: { color: '#102522' },
  actionTextDanger: { color: '#F2B6B6' },
  error: { color: '#F2B6B6', fontSize: 10, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  disabled: { opacity: 0.48 },
});
