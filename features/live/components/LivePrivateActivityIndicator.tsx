import { LockKeyhole } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/hooks/useReduceMotion.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  activePairCount: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const LivePrivateActivityIndicator = memo(function LivePrivateActivityIndicator({
  activePairCount,
  compact = false,
  style,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const reduceMotion = useReduceMotion();
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion || activePairCount < 1) {
      breathe.setValue(0.5);
      return undefined;
}
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1_900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1_900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [activePairCount, breathe, reduceMotion]);

  if (activePairCount < 1) return null;
  const peopleCount = activePairCount * 2;
  return (
    <View
      accessibilityLabel={`${peopleCount} people are connecting in ${activePairCount} private ${activePairCount === 1 ? 'spark' : 'sparks'}.`}
      style={[styles.pill, compact && styles.pillCompact, style]}
    >
      <View style={styles.mark}>
        <Animated.View style={[
          styles.orb,
          styles.orbLeft,
          { transform: [{ translateX: breathe.interpolate({ inputRange: [0, 1], outputRange: [-1.5, 1.5] }) }] },
        ]} />
        <Animated.View style={[
          styles.orb,
          styles.orbRight,
          { transform: [{ translateX: breathe.interpolate({ inputRange: [0, 1], outputRange: [1.5, -1.5] }) }] },
        ]} />
        <LockKeyhole color={visual.color.oat} size={compact ? 7 : 8} strokeWidth={2.2} style={styles.lock} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.label, compact && styles.labelCompact]}>
          {activePairCount} {activePairCount === 1 ? 'PRIVATE SPARK' : 'PRIVATE SPARKS'}
        </Text>
        {!compact ? (
          <Text numberOfLines={1} style={styles.supporting}>{peopleCount} people connecting privately</Text>
        ) : null}
      </View>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  pill: {
    minHeight: 39,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: visual.isDark ? '#101E1CD9' : '#FFFDFCEB',
    borderWidth: 0.75,
    borderColor: `${visual.color.purple}5C`,
    shadowColor: visual.color.purple,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  pillCompact: { minHeight: 25, borderRadius: 13, gap: 5, paddingHorizontal: 7, paddingVertical: 3 },
  mark: { width: 29, height: 22, alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: `${visual.color.oat}42` },
  orbLeft: { left: 1, backgroundColor: `${visual.color.teal}A8` },
  orbRight: { right: 1, backgroundColor: `${visual.color.purple}A8` },
  lock: { zIndex: 2 },
  copy: { minWidth: 0, flexShrink: 1 },
  label: { color: visual.color.text, fontSize: 7, letterSpacing: 1.15, fontFamily: 'Manrope_800ExtraBold' },
  labelCompact: { fontSize: 6, letterSpacing: 0.85 },
  supporting: { marginTop: 1, color: visual.color.textMuted, fontSize: 7, fontFamily: 'Manrope_500Medium' },
});
