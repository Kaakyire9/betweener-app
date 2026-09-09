import { RefreshCw, Sparkles, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  odoCopilotUseLabel,
  type OdoCopilotSuggestion,
} from '../odo/copilot/odo-copilot-contracts.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const suggestionBody = (suggestion: OdoCopilotSuggestion): string => {
  switch (suggestion.type) {
    case 'conversation_spark':
      return `${suggestion.payload.context}\n${suggestion.payload.question}`;
    case 'audience_pulse':
      return `${suggestion.payload.prompt}\n${suggestion.payload.options.join('  •  ')}`;
    case 'scene_suggestion':
      return `Switch to ${suggestion.payload.scene.replaceAll('_', ' ')}.`;
    case 'pair_introduction':
    case 'transition_copy':
    case 'session_welcome':
    case 'session_closing':
      return suggestion.payload.copy;
    case 'no_action':
      return suggestion.rationale;
  }
};

export type OdoCopilotSuggestionCardProps = {
  suggestion: OdoCopilotSuggestion;
  busy: boolean;
  onUse: () => void;
  onAnother: () => void;
  onDismiss: () => void;
};

export function OdoCopilotSuggestionCard({
  suggestion,
  busy,
  onUse,
  onAnother,
  onDismiss,
}: OdoCopilotSuggestionCardProps) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.mark}><Sparkles color={visual.color.accentContrast} size={15} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{suggestion.title}</Text>
          <Text style={styles.rationale}>{suggestion.rationale}</Text>
        </View>
        {suggestion.fallbackUsed ? <Text style={styles.safeBadge}>SAFE FALLBACK</Text> : null}
      </View>
      <Text style={styles.body}>{suggestionBody(suggestion)}</Text>
      <Text style={styles.expiry}>Short-lived suggestion · Host approval required</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={`${odoCopilotUseLabel(suggestion.type)} Odo suggestion`}
          accessibilityRole="button"
          disabled={busy}
          onPress={onUse}
          style={[styles.primaryButton, busy && styles.disabled]}
        >
          {busy ? <ActivityIndicator color={visual.color.accentContrast} size="small" /> : null}
          <Text style={styles.primaryText}>{odoCopilotUseLabel(suggestion.type)}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Ask Odo for another suggestion" accessibilityRole="button" disabled={busy} onPress={onAnother} style={styles.secondaryButton}>
          <RefreshCw color={visual.color.purple} size={14} />
          <Text style={styles.secondaryText}>Another</Text>
        </Pressable>
        <Pressable accessibilityLabel="Dismiss suggestion" accessibilityRole="button" disabled={busy} onPress={onDismiss} style={styles.dismissButton}>
          <X color={visual.color.textMuted} size={17} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  card: { marginBottom: 14, padding: 16, borderRadius: 21, borderWidth: 1, borderColor: visual.color.borderStrong, backgroundColor: visual.color.surfaceRaised },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mark: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.purple },
  headingCopy: { flex: 1 },
  title: { color: visual.color.text, fontSize: 15, fontFamily: 'Manrope_800ExtraBold' },
  rationale: { marginTop: 3, color: visual.color.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  safeBadge: { color: visual.color.teal, fontSize: 7, letterSpacing: 0.7, fontFamily: 'Manrope_800ExtraBold' },
  body: { marginTop: 15, color: visual.color.text, fontSize: 14, lineHeight: 21, fontFamily: 'Manrope_600SemiBold' },
  expiry: { marginTop: 12, color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  actions: { marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryButton: { minHeight: 38, minWidth: 102, paddingHorizontal: 15, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: visual.color.purple },
  primaryText: { color: visual.color.accentContrast, fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  secondaryButton: { minHeight: 38, paddingHorizontal: 13, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: visual.color.borderStrong },
  secondaryText: { color: visual.color.purple, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  dismissButton: { marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: visual.color.border },
  disabled: { opacity: 0.55 },
});
