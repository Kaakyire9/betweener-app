import { AudioLines, LockKeyhole } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

export const LiveConcealedMediaStage = memo(function LiveConcealedMediaStage({
  compact = false,
}: {
  compact?: boolean;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);

  return (
    <View
      accessibilityLabel="Private audio conversation. Pictures remain concealed."
      pointerEvents="none"
      style={styles.root}
    >
      <View style={[styles.halo, compact && styles.haloCompact]} />
      <View style={[styles.mark, compact && styles.markCompact]}>
        <AudioLines color={visual.color.teal} size={compact ? 16 : 24} strokeWidth={1.8} />
        <View style={styles.lockBadge}>
          <LockKeyhole color={visual.color.oat} size={compact ? 7 : 9} strokeWidth={2.2} />
        </View>
      </View>
      <Text style={[styles.eyebrow, compact && styles.eyebrowCompact]}>PRIVATE AUDIO</Text>
      {!compact ? <Text style={styles.copy}>Pictures stay concealed until you both choose.</Text> : null}
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: visual.color.videoChrome,
  },
  halo: {
    position: 'absolute',
    width: 184,
    height: 184,
    borderRadius: 92,
    borderWidth: 1,
    borderColor: visual.color.borderStrong,
    backgroundColor: visual.color.tealSoft,
  },
  haloCompact: { width: 92, height: 92, borderRadius: 46 },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.surfaceRaised,
    borderWidth: 1,
    borderColor: visual.color.teal,
  },
  markCompact: { width: 36, height: 36, borderRadius: 18 },
  lockBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.purple,
  },
  eyebrow: {
    marginTop: 17,
    color: visual.color.teal,
    fontSize: 9,
    letterSpacing: 2.1,
    fontFamily: 'Manrope_800ExtraBold',
  },
  eyebrowCompact: { marginTop: 8, fontSize: 6, letterSpacing: 1.35 },
  copy: {
    marginTop: 7,
    color: visual.color.textMuted,
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
  },
});
