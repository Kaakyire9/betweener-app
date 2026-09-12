import { UserRoundPlus } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  busy: boolean;
  onRespond: (accept: boolean) => void;
};

export const LiveStageInvitationPrompt = memo(function LiveStageInvitationPrompt({
  busy,
  onRespond,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <UserRoundPlus color={visual.color.teal} size={18} />
        <View style={styles.textGroup}>
          <Text style={styles.title}>You’re invited to the stage</Text>
          <Text numberOfLines={1} style={styles.body}>Join only when you’re ready.</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Decline stage invitation"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onRespond(false)}
          style={[styles.secondary, busy && styles.disabled]}
        >
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Moves you onto the public stage and enables your media controls"
          accessibilityLabel="Accept stage invitation"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onRespond(true)}
          style={[styles.primary, busy && styles.disabled]}
        >
          <Text style={styles.primaryText}>{busy ? 'Joining…' : 'Join stage'}</Text>
        </Pressable>
      </View>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  copy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  textGroup: { flex: 1, minWidth: 0 },
  title: { color: visual.color.text, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  body: { marginTop: 1, color: visual.color.textMuted, fontSize: 8, fontFamily: 'Manrope_500Medium' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secondary: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
  secondaryText: { color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_700Bold' },
  primary: {
    minHeight: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.teal,
  },
  primaryText: { color: visual.color.accentContrast, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  disabled: { opacity: 0.5 },
});
