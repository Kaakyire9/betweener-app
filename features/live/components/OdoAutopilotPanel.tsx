import { Bot, Check, ShieldCheck } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LiveOdoAutopilotController } from '../odo/autopilot/use-live-odo-autopilot.ts';
import { odoGuardedActionLabel } from '../odo/autopilot/odo-autopilot-contracts.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-theme.ts';

const FEATURE_LABELS = [
  ['narration', 'Narration'],
  ['conversationSparks', 'Conversation Sparks'],
  ['audiencePulse', 'Audience Pulse'],
  ['scenes', 'Scenes'],
  ['timeCues', 'Time cues'],
  ['intermissions', 'Intermissions'],
] as const;

export function OdoAutopilotPanel({
  controller,
}: {
  controller: LiveOdoAutopilotController;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const { state } = controller;
  if (!state) {
    return controller.loading ? <ActivityIndicator color={visual.color.purple} /> : null;
  }
  if (!state.available && !state.enabled) return null;
  const active = state.directionMode === 'autopilot' && state.autopilotState === 'active';
  const starting = state.autopilotState === 'starting';
  const paused = state.autopilotState === 'paused_by_host'
    || state.autopilotState === 'paused_by_policy';
  const status = active ? (state.limitedMode ? 'LIMITED MODE' : 'ACTIVE')
    : starting ? 'STARTING'
      : paused ? 'PAUSED'
        : 'OFF';

  const confirmEnable = () => Alert.alert(
    'Enable Odo Autopilot?',
    'Odo can automatically manage selected Live presentation and engagement moments. Matchmaking, safety, consent and RTC remain controlled by Betweener.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Enable', onPress: () => void controller.enable() },
    ],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}><Bot color={visual.color.purple} size={18} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ODO AUTOPILOT</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, active && styles.dotActive, paused && styles.dotPaused]} />
            <Text style={styles.status}>{status}</Text>
          </View>
        </View>
        <ShieldCheck color={visual.color.teal} size={19} />
      </View>

      {active || starting || paused ? (
        <>
          <Text style={styles.currentLabel}>ODO IS</Text>
          <Text style={styles.currentValue}>
            {starting
              ? 'Reading the room before taking direction.'
              : paused
                ? 'Waiting for the Host.'
                : state.lastAction && !['NO_ACTION', 'WAIT'].includes(state.lastAction.type)
                  ? odoGuardedActionLabel(state.lastAction.type)
                  : 'Waiting for the next eligible moment.'}
          </Text>
          <View style={styles.features}>
            {FEATURE_LABELS.map(([key, label]) => (
              <View key={key} style={[styles.feature, !state.features[key] && styles.featureOff]}>
                <Check color={state.features[key] ? visual.color.teal : visual.color.textMuted} size={12} />
                <Text style={styles.featureText}>{label}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.explanation}>
          Odo can manage selected presentation, pacing, and engagement moments while you remain in control.
        </Text>
      )}

      {controller.error ? (
        <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text>
      ) : null}
      {active || starting ? (
        <Pressable
          accessibilityRole="button"
          disabled={controller.busyAction !== null}
          onPress={() => void controller.takeControl()}
          style={[styles.button, styles.takeoverButton]}
        >
          {controller.busyAction === 'takeover' ? <ActivityIndicator color={visual.color.dangerText} size="small" /> : null}
          <Text style={styles.takeoverText}>Take Control</Text>
        </Pressable>
      ) : paused ? (
        <Pressable
          accessibilityRole="button"
          disabled={controller.busyAction !== null || state.autopilotState === 'paused_by_policy'}
          onPress={() => void controller.resume()}
          style={[styles.button, state.autopilotState === 'paused_by_policy' && styles.buttonDisabled]}
        >
          {controller.busyAction === 'resume' ? <ActivityIndicator color={visual.color.accentContrast} size="small" /> : null}
          <Text style={styles.buttonText}>Resume Odo</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={controller.busyAction !== null || !state.available}
          onPress={confirmEnable}
          style={[styles.button, !state.available && styles.buttonDisabled]}
        >
          {controller.busyAction === 'enable' ? <ActivityIndicator color={visual.color.accentContrast} size="small" /> : null}
          <Text style={styles.buttonText}>Enable Guarded Autopilot</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  card: { marginBottom: 18, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceRaised },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft },
  headerCopy: { flex: 1 },
  eyebrow: { color: visual.color.purple, fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  statusRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: visual.color.textMuted },
  dotActive: { backgroundColor: visual.color.success },
  dotPaused: { backgroundColor: visual.color.warning },
  status: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  currentLabel: { marginTop: 16, color: visual.color.textMuted, fontSize: 8, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  currentValue: { marginTop: 4, color: visual.color.text, fontSize: 11, lineHeight: 17, fontFamily: 'Manrope_600SemiBold' },
  explanation: { marginTop: 14, color: visual.color.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  features: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  feature: { paddingHorizontal: 9, minHeight: 27, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: visual.color.tealSoft },
  featureOff: { opacity: 0.48 },
  featureText: { color: visual.color.text, fontSize: 8, fontFamily: 'Manrope_700Bold' },
  error: { marginTop: 12, color: visual.color.danger, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_700Bold' },
  button: { marginTop: 16, minHeight: 43, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: visual.color.purple },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: visual.color.accentContrast, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  takeoverButton: { backgroundColor: visual.color.dangerSoft, borderWidth: 1, borderColor: visual.color.danger },
  takeoverText: { color: visual.color.dangerText, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
});
