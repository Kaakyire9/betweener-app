import {
  PROGRAM_SCENE_MANIFEST,
  programSceneAvailability,
  resolveAssignedProgramLayout,
  type ProgramScene,
  type ProgramTargetCanvas,
} from '@betweener/live-program-domain';
import { Check, Radio, ShieldCheck, UsersRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LiveMobileProgrammeController } from '../hooks/use-live-mobile-programme-control.ts';
import type { LiveProgramSnapshotV2 } from '../odo/show/odo-show-contracts.ts';
import { LiveStepUpSheet } from './LiveStepUpSheet.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const QUICK_SCENES = PROGRAM_SCENE_MANIFEST.filter((scene) => scene.mobileQuick);
const CANVASES: readonly { value: ProgramTargetCanvas; label: string }[] = [
  { value: 'portrait_9_16', label: 'Portrait' },
  { value: 'landscape_16_9', label: 'Landscape' },
  { value: 'square_1_1', label: 'Square' },
];

type PendingSecureAction =
  | { kind: 'take'; scene: ProgramScene; canvas: ProgramTargetCanvas }
  | { kind: 'capacity'; capacity: 4 | 6 };

const SceneMiniature = ({
  scene,
  canvas,
  programme,
}: {
  scene: ProgramScene;
  canvas: ProgramTargetCanvas;
  programme: LiveProgramSnapshotV2;
}) => {
  const visual = useLiveVisualTheme();
  const availability = programSceneAvailability(
    scene,
    canvas,
    programme.sources,
    programme.program.sourceAssignments,
  );
  const layout = resolveAssignedProgramLayout(scene, canvas, availability.assignments);
  return (
    <View style={[stylesBase.miniature, canvas === 'portrait_9_16' && stylesBase.miniaturePortrait]}>
      {layout.regions.filter((region) => region.treatment !== 'audio').map((region) => (
        <View
          key={`${scene}:${region.slot}`}
          style={{
            position: 'absolute',
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
            borderRadius: 5,
            borderWidth: 1,
            borderColor: visual.borderStrong,
            backgroundColor: visual.tealSoft,
          }}
        />
      ))}
    </View>
  );
};

export function LiveMobileProgrammePanel({
  controller,
  programme,
}: {
  controller: LiveMobileProgrammeController;
  programme: LiveProgramSnapshotV2 | null;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const [scene, setScene] = useState<ProgramScene>(programme?.program.scene ?? 'host_focus');
  const [canvas, setCanvas] = useState<ProgramTargetCanvas>(
    programme?.program.targetCanvas ?? 'portrait_9_16',
  );
  const [pending, setPending] = useState<PendingSecureAction | null>(null);

  if (!controller.access) {
    return <View style={styles.notice}><ActivityIndicator color={visual.teal} /><Text style={styles.noticeText}>Loading secure programme controls...</Text></View>;
  }
  if (!controller.access.canControl) {
    return <View style={styles.notice}><ShieldCheck color={visual.textMuted} size={22} /><Text style={styles.noticeText}>Programme control is available to assigned producers and authorized admins.</Text></View>;
  }
  if (!programme) {
    return <View style={styles.notice}><Text style={styles.noticeText}>The live Program is still connecting.</Text></View>;
  }

  const selected = programSceneAvailability(
    scene,
    canvas,
    programme.sources,
    programme.program.sourceAssignments,
  );
  const busy = controller.busyAction !== null;
  const completePending = async () => {
    if (!pending) throw new Error('live_step_up_action_missing');
    const completed = pending.kind === 'take'
      ? await controller.take(pending.scene, pending.canvas)
      : await controller.setCapacity(pending.capacity);
    if (!completed) throw new Error('live_step_up_action_failed');
    setPending(null);
  };

  return (
    <View style={styles.root}>
      <View style={styles.statusCard}>
        <Radio color={visual.teal} size={18} />
        <View style={styles.statusCopy}>
          <Text style={styles.eyebrow}>ON AIR NOW</Text>
          <Text style={styles.statusTitle}>{PROGRAM_SCENE_MANIFEST.find((item) => item.scene === programme.program.scene)?.label ?? programme.program.scene}</Text>
        </View>
        <Text style={styles.version}>V{programme.program.programVersion}</Text>
      </View>

      {controller.access.canConfigureLargePanel ? (
        <View style={styles.capacityCard}>
          <View style={styles.capacityHeading}>
            <UsersRound color={visual.teal} size={18} />
            <View style={styles.statusCopy}>
              <Text style={styles.cardTitle}>Stage size</Text>
              <Text style={styles.cardBody}>Four stays the default. Six must be enabled explicitly for this Live.</Text>
            </View>
          </View>
          <View style={styles.segmented}>
            {([4, 6] as const).map((capacity) => {
              const selectedCapacity = controller.access?.maximumPublishers === capacity;
              const disabled = busy || (capacity === 6 && !controller.access?.largePanelEnabled);
              return (
                <Pressable
                  key={capacity}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected: selectedCapacity }}
                  disabled={disabled || selectedCapacity}
                  onPress={() => setPending({ kind: 'capacity', capacity })}
                  style={[styles.segment, selectedCapacity && styles.segmentSelected, disabled && styles.disabled]}
                >
                  <Text style={[styles.segmentText, selectedCapacity && styles.segmentTextSelected]}>{capacity} people</Text>
                </Pressable>
              );
            })}
          </View>
          {!controller.access.largePanelEnabled ? <Text style={styles.helper}>Six-person panels remain behind the staging rollout flag.</Text> : null}
        </View>
      ) : null}

      <Text style={styles.groupLabel}>OUTPUT SHAPE</Text>
      <View style={styles.segmented}>
        {CANVASES.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: canvas === option.value }}
            onPress={() => setCanvas(option.value)}
            style={[styles.segment, canvas === option.value && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, canvas === option.value && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.groupLabel}>QUICK SCENES</Text>
      <View style={styles.sceneGrid}>
        {QUICK_SCENES.map((item) => {
          const availability = programSceneAvailability(
            item.scene,
            canvas,
            programme.sources,
            programme.program.sourceAssignments,
          );
          const isSelected = scene === item.scene;
          return (
            <Pressable
              key={item.scene}
              accessibilityRole="button"
              accessibilityState={{ disabled: !availability.available, selected: isSelected }}
              disabled={!availability.available}
              onPress={() => setScene(item.scene)}
              style={[styles.scene, isSelected && styles.sceneSelected, !availability.available && styles.disabled]}
            >
              <SceneMiniature canvas={canvas} programme={programme} scene={item.scene} />
              <View style={styles.sceneCopy}>
                <Text numberOfLines={1} style={styles.sceneTitle}>{item.label}</Text>
                <Text numberOfLines={2} style={styles.sceneBody}>{availability.reason ?? item.description}</Text>
              </View>
              {isSelected ? <Check color={visual.teal} size={17} /> : null}
            </Pressable>
          );
        })}
      </View>

      {controller.error ? <Text style={styles.error}>{controller.error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !selected.available }}
        disabled={busy || !selected.available}
        onPress={() => setPending({ kind: 'take', scene, canvas })}
        style={[styles.takeButton, (busy || !selected.available) && styles.disabled]}
      >
        {controller.busyAction === 'take' ? <ActivityIndicator color={visual.accentContrast} size="small" /> : <Radio color={visual.accentContrast} size={18} />}
        <Text style={styles.takeText}>TAKE {PROGRAM_SCENE_MANIFEST.find((item) => item.scene === scene)?.label.toUpperCase()}</Text>
      </Pressable>
      <Text style={styles.safety}>TAKE changes the public programme immediately. It does not alter creator ownership or private engagement data.</Text>

      <LiveStepUpSheet
        actionLabel={pending?.kind === 'capacity' ? 'Change stage capacity' : 'Take this scene live'}
        onCancel={() => setPending(null)}
        onVerified={completePending}
        visible={pending !== null}
      />
    </View>
  );
}

const stylesBase = StyleSheet.create({
  miniature: { width: 66, aspectRatio: 16 / 9, overflow: 'hidden' },
  miniaturePortrait: { width: 34, aspectRatio: 9 / 16 },
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: { gap: 15 },
  notice: { minHeight: 120, padding: 22, gap: 12, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surfaceSoft, borderWidth: 1, borderColor: visual.border },
  noticeText: { textAlign: 'center', color: visual.textMuted, fontSize: 12, lineHeight: 18, fontFamily: 'Manrope_600SemiBold' },
  statusCard: { minHeight: 66, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: visual.surfaceRaised, borderWidth: 1, borderColor: visual.borderStrong },
  statusCopy: { flex: 1 },
  eyebrow: { color: visual.teal, fontSize: 8, letterSpacing: 1.3, fontFamily: 'Manrope_800ExtraBold' },
  statusTitle: { marginTop: 3, color: visual.text, fontSize: 17, fontFamily: 'PlayfairDisplay_700Bold' },
  version: { color: visual.textMuted, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  capacityCard: { padding: 15, gap: 12, borderRadius: 22, backgroundColor: visual.surfaceSoft, borderWidth: 1, borderColor: visual.border },
  capacityHeading: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cardTitle: { color: visual.text, fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  cardBody: { marginTop: 3, color: visual.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  groupLabel: { marginTop: 3, color: visual.teal, fontSize: 9, letterSpacing: 1.4, fontFamily: 'Manrope_800ExtraBold' },
  segmented: { flexDirection: 'row', gap: 7 },
  segment: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.surface, borderWidth: 1, borderColor: visual.border },
  segmentSelected: { backgroundColor: visual.tealSoft, borderColor: visual.teal },
  segmentText: { color: visual.textMuted, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  segmentTextSelected: { color: visual.teal },
  helper: { color: visual.warning, fontSize: 9, lineHeight: 14, fontFamily: 'Manrope_600SemiBold' },
  sceneGrid: { gap: 8 },
  scene: { minHeight: 82, padding: 10, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: visual.surfaceRaised, borderWidth: 1, borderColor: visual.border },
  sceneSelected: { borderColor: visual.teal, backgroundColor: visual.tealSoft },
  sceneCopy: { flex: 1 },
  sceneTitle: { color: visual.text, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  sceneBody: { marginTop: 3, color: visual.textMuted, fontSize: 9, lineHeight: 13, fontFamily: 'Manrope_500Medium' },
  disabled: { opacity: 0.42 },
  error: { padding: 11, borderRadius: 14, color: visual.dangerText, backgroundColor: visual.dangerSoft, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_600SemiBold' },
  takeButton: { minHeight: 51, marginTop: 4, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: visual.teal },
  takeText: { color: visual.accentContrast, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  safety: { textAlign: 'center', color: visual.textMuted, fontSize: 9, lineHeight: 14, fontFamily: 'Manrope_500Medium' },
});
