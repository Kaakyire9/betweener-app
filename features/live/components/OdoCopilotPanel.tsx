import { Lightbulb, Sparkles } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LiveOdoCopilotController } from '../odo/copilot/use-live-odo-copilot.ts';
import type { OdoCopilotTask } from '../odo/copilot/odo-copilot-contracts.ts';
import { OdoCopilotSuggestionCard } from './OdoCopilotSuggestionCard.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const TASK_LABELS: Readonly<Record<OdoCopilotTask, string>> = {
  conversation_spark: 'Spark',
  audience_pulse: 'Pulse',
  pair_narration: 'Pair intro',
  scene_suggestion: 'Scene',
  transition_copy: 'Transition',
  session_welcome: 'Welcome',
  session_closing: 'Closing',
};

export function OdoCopilotPanel({ controller }: { controller: LiveOdoCopilotController }) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const { state } = controller;
  if (!state) {
    return controller.loading ? <ActivityIndicator color={visual.color.purple} /> : null;
  }
  const tasks: OdoCopilotTask[] = [
    ...(state.features.conversationSpark && controller.roundAvailable
      ? ['conversation_spark' as const] : []),
    ...(state.features.audiencePulse ? ['audience_pulse' as const] : []),
    ...(state.features.pairNarration && controller.roundAvailable
      ? ['pair_narration' as const] : []),
    ...(state.features.sceneSuggestions ? ['scene_suggestion' as const] : []),
    ...(state.features.transitionCopy
      ? ['transition_copy' as const, 'session_welcome' as const, 'session_closing' as const]
      : []),
  ];

  return (
    <View>
      <View style={styles.intro}>
        <View style={styles.introIcon}><Lightbulb color={visual.color.purple} size={20} /></View>
        <View style={styles.introCopy}>
          <Text style={styles.introTitle}>You stay in control.</Text>
          <Text style={styles.introBody}>Odo prepares private ideas. Nothing reaches the room until you choose Use.</Text>
        </View>
      </View>
      {state.temporarilyUnavailable ? (
        <Text style={styles.warning}>Odo is temporarily paused by the safety circuit breaker.</Text>
      ) : null}
      <Text style={styles.promptLabel}>ASK ODO FOR</Text>
      <View style={styles.tasks}>
        {tasks.map((task) => {
          const busy = controller.busyTask === task;
          return (
            <Pressable
              key={task}
              accessibilityRole="button"
              disabled={controller.busyTask !== null || state.temporarilyUnavailable}
              onPress={() => void controller.request(task)}
              style={[styles.task, busy && styles.taskBusy]}
            >
              {busy
                ? <ActivityIndicator color={visual.color.purple} size="small" />
                : <Sparkles color={visual.color.purple} size={13} />}
              <Text style={styles.taskText}>{TASK_LABELS[task]}</Text>
            </Pressable>
          );
        })}
      </View>
      {controller.error ? <Text accessibilityRole="alert" style={styles.error}>{controller.error}</Text> : null}
      {controller.notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Lightbulb color={visual.color.teal} size={16} />
          <Text style={styles.noticeText}>{controller.notice}</Text>
        </View>
      ) : null}
      <View style={styles.suggestions}>
        {state.suggestions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No active suggestions</Text>
            <Text style={styles.emptyBody}>Choose a prompt above when you want a little help guiding the room.</Text>
          </View>
        ) : state.suggestions.map((suggestion) => (
          <OdoCopilotSuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            busy={controller.busySuggestionId === suggestion.id}
            onUse={() => void controller.use(suggestion)}
            onAnother={() => void controller.another(suggestion)}
            onDismiss={() => void controller.dismiss(suggestion)}
          />
        ))}
      </View>
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  intro: { padding: 15, borderRadius: 20, flexDirection: 'row', gap: 11, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceRaised },
  introIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purpleSoft },
  introCopy: { flex: 1 },
  introTitle: { color: visual.color.text, fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  introBody: { marginTop: 4, color: visual.color.textMuted, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
  warning: { marginTop: 12, padding: 12, borderRadius: 13, color: visual.color.warning, backgroundColor: visual.color.warningSoft, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  promptLabel: { marginTop: 20, color: visual.color.textMuted, fontSize: 9, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  tasks: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  task: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: visual.color.border, backgroundColor: visual.color.surfaceRaised },
  taskBusy: { opacity: 0.65 },
  taskText: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  error: { marginTop: 13, color: visual.color.danger, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_700Bold' },
  notice: { marginTop: 13, padding: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: visual.color.teal, backgroundColor: visual.color.tealSoft },
  noticeText: { flex: 1, color: visual.color.text, fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_600SemiBold' },
  suggestions: { marginTop: 20 },
  empty: { paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: visual.color.border, borderStyle: 'dashed' },
  emptyTitle: { color: visual.color.text, fontSize: 13, fontFamily: 'Manrope_700Bold' },
  emptyBody: { marginTop: 6, color: visual.color.textMuted, textAlign: 'center', fontSize: 10, lineHeight: 16, fontFamily: 'Manrope_500Medium' },
});
