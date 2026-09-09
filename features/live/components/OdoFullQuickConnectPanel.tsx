import { Activity, Bot, Check, ShieldCheck, TimerReset, UsersRound } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LiveOdoFullQuickConnectController } from '../odo/full-quick-connect/use-live-odo-full-quick-connect.ts';
import { odoFullQuickConnectStatusCopy } from '../odo/full-quick-connect/odo-full-quick-connect-contracts.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export function OdoFullQuickConnectPanel({
  controller,
}: {
  controller: LiveOdoFullQuickConnectController;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const { state } = controller;
  if (!state) return controller.loading ? <ActivityIndicator color={visual.color.purple} /> : null;
  if (!state.available && state.lifecycleState === 'off') return null;

  const running = state.enabled
    && ['preparing', 'starting', 'active', 'draining', 'closing', 'recovering']
      .includes(state.lifecycleState);
  const paused = state.lifecycleState === 'paused_by_host'
    || state.lifecycleState === 'paused_by_policy';
  const status = state.lifecycleState === 'draining' ? 'FINISHING'
    : state.lifecycleState === 'closing' ? 'CLOSING'
      : paused ? 'PAUSED'
        : state.lifecycleState === 'ended' ? 'COMPLETE'
          : running ? (state.healthState.startsWith('degraded') ? 'RUNNING · LIMITED' : 'RUNNING')
            : 'READY';

  const confirmEnable = () => Alert.alert(
    'Run Quick Connect with Odo?',
    'Odo will open and pace this Quick Connect rotation. People still choose whether to join, and Betweener remains responsible for eligibility, safety, private choices, and pairing.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start Odo', onPress: () => void controller.enable() },
    ],
  );
  const confirmFinish = () => Alert.alert(
    'Finish current conversations?',
    'Odo will stop new pairing cycles, let active conversations finish, then close Quick Connect. The Live room will remain open.',
    [
      { text: 'Keep running', style: 'cancel' },
      { text: 'Finish current', onPress: () => void controller.finishCurrent() },
    ],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}><Bot color={visual.color.purple} size={19} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ODO · QUICK CONNECT</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, running && styles.dotActive, paused && styles.dotPaused]} />
            <Text style={styles.status}>{status}</Text>
          </View>
        </View>
        <ShieldCheck color={visual.color.teal} size={20} />
      </View>

      <Text style={styles.currentLabel}>CURRENT</Text>
      <Text style={styles.currentValue}>{odoFullQuickConnectStatusCopy(state)}</Text>

      <View style={styles.metrics}>
        <Metric icon={UsersRound} label="Pool" value={state.metrics.waitingPeople} />
        <Metric icon={Check} label="Eligible pairs" value={state.metrics.eligiblePairs} />
        <Metric icon={Activity} label="Active" value={state.metrics.activePairs} />
        <Metric icon={TimerReset} label="Complete" value={state.metrics.completedRounds} />
      </View>

      <View style={styles.nextCard}>
        <Text style={styles.nextLabel}>NEXT</Text>
        <Text style={styles.nextValue}>
          {state.lifecycleState === 'draining'
            ? 'Close after every active conversation finishes'
            : state.orchestrationState === 'pair_active'
              ? 'Wait for the current round, then reconcile safely'
              : state.orchestrationState === 'low_liquidity'
                ? 'Wait for another eligible pool member'
                : 'Reconcile the pool and prepare the next legal step'}
        </Text>
      </View>

      {controller.error ? (
        <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text>
      ) : null}

      {running ? (
        <>
          {state.lifecycleState !== 'draining' && state.lifecycleState !== 'closing' ? (
            <Pressable
              accessibilityRole="button"
              disabled={controller.busyAction !== null}
              onPress={confirmFinish}
              style={[styles.secondaryButton, controller.busyAction !== null && styles.disabled]}
            >
              {controller.busyAction === 'finish'
                ? <ActivityIndicator color={visual.color.purple} size="small" />
                : <TimerReset color={visual.color.purple} size={16} />}
              <Text style={styles.secondaryButtonText}>Finish Current Connections</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={controller.busyAction !== null}
            onPress={() => void controller.takeControl()}
            style={[styles.takeoverButton, controller.busyAction !== null && styles.disabled]}
          >
            {controller.busyAction === 'takeover'
              ? <ActivityIndicator color={visual.color.dangerText} size="small" />
              : null}
            <Text style={styles.takeoverText}>Take Control</Text>
          </Pressable>
        </>
      ) : paused ? (
        <Pressable
          accessibilityRole="button"
          disabled={controller.busyAction !== null || state.lifecycleState === 'paused_by_policy'}
          onPress={() => void controller.resume()}
          style={[styles.primaryButton,
            state.lifecycleState === 'paused_by_policy' && styles.disabled]}
        >
          {controller.busyAction === 'resume'
            ? <ActivityIndicator color={visual.color.accentContrast} size="small" />
            : null}
          <Text style={styles.primaryButtonText}>Resume Odo</Text>
        </Pressable>
      ) : state.lifecycleState !== 'ended' ? (
        <Pressable
          accessibilityRole="button"
          disabled={controller.busyAction !== null || !state.available}
          onPress={confirmEnable}
          style={[styles.primaryButton, (!state.available || controller.busyAction !== null)
            && styles.disabled]}
        >
          {controller.busyAction === 'enable'
            ? <ActivityIndicator color={visual.color.accentContrast} size="small" />
            : null}
          <Text style={styles.primaryButtonText}>Start Full Quick Connect</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({ icon: Icon, label, value }: {
  icon: typeof Activity;
  label: string;
  value: number;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.metric}>
      <Icon color={visual.color.teal} size={14} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  card: { marginBottom: 18, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceRaised },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft },
  headerCopy: { flex: 1 },
  eyebrow: { color: visual.color.purple, fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  statusRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: visual.color.textMuted },
  dotActive: { backgroundColor: visual.color.success },
  dotPaused: { backgroundColor: visual.color.warning },
  status: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  currentLabel: { marginTop: 16, color: visual.color.textMuted, fontSize: 8, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  currentValue: { marginTop: 4, color: visual.color.text, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_700Bold' },
  metrics: { marginTop: 14, flexDirection: 'row', gap: 6 },
  metric: { flex: 1, minHeight: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.border },
  metricValue: { marginTop: 3, color: visual.color.text, fontSize: 17, fontFamily: 'Manrope_800ExtraBold' },
  metricLabel: { marginTop: 1, color: visual.color.textMuted, fontSize: 7, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  nextCard: { marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: visual.color.tealSoft },
  nextLabel: { color: visual.color.teal, fontSize: 8, letterSpacing: 1, fontFamily: 'Manrope_800ExtraBold' },
  nextValue: { marginTop: 4, color: visual.color.text, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
  error: { marginTop: 12, color: visual.color.danger, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_700Bold' },
  primaryButton: { marginTop: 15, minHeight: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: visual.color.purple },
  primaryButtonText: { color: visual.color.accentContrast, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  secondaryButton: { marginTop: 15, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: visual.color.borderStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButtonText: { color: visual.color.purple, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  takeoverButton: { marginTop: 9, minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: visual.color.dangerSoft, borderWidth: 1, borderColor: visual.color.danger },
  takeoverText: { color: visual.color.dangerText, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.45 },
});
