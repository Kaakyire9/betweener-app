import {
  Bot, Music2, Pause, Play, Radio, ShieldCheck, SkipForward, Square,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LiveOdoShowDirectorController } from '../odo/show/use-live-odo-show-director.ts';
import type { OdoShowScene } from '../odo/show/odo-show-contracts.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const SCENES: readonly { scene: OdoShowScene; label: string }[] = [
  { scene: 'host_focus', label: 'Host' },
  { scene: 'host_plus_pool', label: 'Room' },
  { scene: 'pool_focus', label: 'Pool' },
  { scene: 'odo_stage', label: 'Odo Stage' },
  { scene: 'branded_intermission', label: 'Intermission' },
  { scene: 'session_closing', label: 'Closing' },
];

export function OdoShowDirectorPanel({
  controller,
}: {
  controller: LiveOdoShowDirectorController;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const { state } = controller;
  if (!state) return controller.loading ? <ActivityIndicator color={visual.color.purple} /> : null;
  if (!state.available && !state.enabled) return null;
  const running = state.enabled && !state.pausedByHost
    && state.showState !== 'paused_by_policy';
  const programmeLabel = state.showState === 'pair_forming'
    ? 'Forming the next eligible pair'
    : state.showState === 'low_liquidity'
      ? 'Waiting for another eligible member'
      : state.showState === 'pair_active'
        ? 'A private connection is in progress'
        : state.showState === 'recovering'
          ? 'Restoring the programme safely'
          : state.currentScene.replaceAll('_', ' ');

  const confirmEnable = () => Alert.alert(
    'Let Odo direct the show?',
    'Odo will pace public scenes and approved programme moments. Quick Connect, consent, Safety, and private conversations keep their existing authority.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start Show Director', onPress: () => void controller.enable() },
    ],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}><Bot color={visual.color.purple} size={19} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ODO · SHOW DIRECTOR</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, running && styles.dotActive]} />
            <Text style={styles.status}>{running ? 'DIRECTING' : state.pausedByHost ? 'HOST CONTROL' : 'READY'}</Text>
          </View>
        </View>
        <ShieldCheck color={visual.color.teal} size={20} />
      </View>

      <View style={styles.currentCard}>
        <View style={styles.currentIcon}><Radio color={visual.color.teal} size={16} /></View>
        <View style={styles.currentCopy}>
          <Text style={styles.currentLabel}>ON PROGRAMME</Text>
          <Text style={styles.currentValue}>{programmeLabel}</Text>
          <Text style={styles.currentMeta}>{state.energyMode} energy · {state.programSource}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="In room" value={state.metrics.participants} />
        <Metric label="Audience" value={state.metrics.audience} />
        <Metric label="Active pairs" value={state.metrics.activePairs} />
        <Metric label="Rounds" value={state.metrics.completedRounds} />
      </View>

      {state.enabled ? (
        <>
          <Text style={styles.controlLabel}>HOST SCENE OVERRIDE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneRow}>
            {SCENES.map(({ scene, label }) => (
              <Pressable
                key={scene}
                accessibilityRole="button"
                disabled={controller.busyAction !== null}
                onPress={() => void controller.setScene(scene)}
                style={[styles.sceneChip, state.currentScene === scene && styles.sceneChipSelected]}
              >
                <Text style={[styles.sceneText, state.currentScene === scene && styles.sceneTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      <View style={styles.musicCard}>
        <Music2 color={visual.color.purple} size={17} />
        <View style={styles.musicCopy}>
          <Text style={styles.musicTitle}>{state.music.title ?? 'Approved programme music'}</Text>
          <Text style={styles.musicMeta}>{state.music.title
            ? `${state.music.artist ?? 'Betweener'} · ${state.music.status}`
            : state.music.enabled
              ? 'No approved track is selected'
              : 'Music is disabled'}</Text>
        </View>
        {state.music.trackId ? (
          <View style={styles.musicActions}>
            <Pressable
              accessibilityLabel={state.music.status === 'paused' ? 'Resume music' : 'Pause music'}
              accessibilityRole="button"
              onPress={() => void controller.controlMusic(
                state.music.status === 'paused' ? 'resume' : 'pause',
              )}
              style={styles.musicButton}
            >
              {state.music.status === 'paused'
                ? <Play color={visual.color.purple} size={14} />
                : <Pause color={visual.color.purple} size={14} />}
            </Pressable>
            {state.music.playlistId ? (
              <Pressable accessibilityLabel="Next track" accessibilityRole="button" onPress={() => void controller.controlMusic('next')} style={styles.musicButton}>
                <SkipForward color={visual.color.purple} size={14} />
              </Pressable>
            ) : null}
            <Pressable accessibilityLabel="Stop music" accessibilityRole="button" onPress={() => void controller.controlMusic('stop')} style={styles.musicButton}>
              <Square color={visual.color.purple} size={13} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {controller.error ? <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text> : null}

      {!state.enabled ? (
        <Pressable accessibilityRole="button" disabled={controller.busyAction !== null || !state.available} onPress={confirmEnable} style={[styles.primaryButton, (!state.available || controller.busyAction !== null) && styles.disabled]}>
          {controller.busyAction === 'enable' ? <ActivityIndicator color={visual.color.accentContrast} size="small" /> : null}
          <Text style={styles.primaryText}>Start Show Director</Text>
        </Pressable>
      ) : state.pausedByHost ? (
        <Pressable accessibilityRole="button" disabled={controller.busyAction !== null} onPress={() => void controller.resume()} style={[styles.primaryButton, controller.busyAction !== null && styles.disabled]}>
          {controller.busyAction === 'resume' ? <ActivityIndicator color={visual.color.accentContrast} size="small" /> : <Play color={visual.color.accentContrast} size={15} />}
          <Text style={styles.primaryText}>Return Direction to Odo</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" disabled={controller.busyAction !== null} onPress={() => void controller.takeControl()} style={[styles.takeoverButton, controller.busyAction !== null && styles.disabled]}>
          <Text style={styles.takeoverText}>Take Control</Text>
        </Pressable>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return <View style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
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
  status: { color: visual.color.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  currentCard: { marginTop: 15, padding: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: visual.color.tealSoft },
  currentIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised },
  currentCopy: { flex: 1, marginLeft: 10 },
  currentLabel: { color: visual.color.teal, fontSize: 8, letterSpacing: 1, fontFamily: 'Manrope_800ExtraBold' },
  currentValue: { marginTop: 2, color: visual.color.text, fontSize: 13, textTransform: 'capitalize', fontFamily: 'Manrope_800ExtraBold' },
  currentMeta: { marginTop: 2, color: visual.color.textMuted, fontSize: 9, textTransform: 'capitalize', fontFamily: 'Manrope_600SemiBold' },
  metrics: { marginTop: 12, flexDirection: 'row', gap: 6 },
  metric: { flex: 1, minHeight: 55, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.border },
  metricValue: { color: visual.color.text, fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  metricLabel: { marginTop: 1, color: visual.color.textMuted, fontSize: 7, textAlign: 'center', fontFamily: 'Manrope_700Bold' },
  controlLabel: { marginTop: 16, color: visual.color.textMuted, fontSize: 8, letterSpacing: 1.1, fontFamily: 'Manrope_800ExtraBold' },
  sceneRow: { paddingTop: 8, paddingBottom: 3, gap: 7 },
  sceneChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surface },
  sceneChipSelected: { backgroundColor: visual.color.purple, borderColor: visual.color.purple },
  sceneText: { color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  sceneTextSelected: { color: visual.color.accentContrast },
  musicCard: { marginTop: 14, minHeight: 58, padding: 11, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: visual.color.surface, borderWidth: 1, borderColor: visual.color.border },
  musicCopy: { flex: 1 },
  musicTitle: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  musicMeta: { marginTop: 2, color: visual.color.textMuted, fontSize: 8, textTransform: 'capitalize', fontFamily: 'Manrope_500Medium' },
  musicActions: { flexDirection: 'row', gap: 5 },
  musicButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.borderStrong },
  error: { marginTop: 12, color: visual.color.danger, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_700Bold' },
  primaryButton: { marginTop: 15, minHeight: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: visual.color.purple },
  primaryText: { color: visual.color.accentContrast, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  takeoverButton: { marginTop: 15, minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.dangerSoft, borderWidth: 1, borderColor: visual.color.danger },
  takeoverText: { color: visual.color.dangerText, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.45 },
});
