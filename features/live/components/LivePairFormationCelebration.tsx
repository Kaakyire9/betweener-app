import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useReduceMotion } from '@/hooks/useReduceMotion.ts';
import {
  LIVE_PRIVATE_SPARK_MOTION,
  type LivePairPortrait,
} from '../motion/live-private-spark-motion.ts';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

type Props = {
  pair: readonly [LivePairPortrait, LivePairPortrait];
  compact?: boolean;
  eyebrow?: string;
  haptic?: boolean;
  initialProgress?: number;
  label?: string;
  onComplete?: () => void;
};

const initialFor = (name: string | null) => name?.trim().charAt(0).toUpperCase() || 'B';

const BURST_POINTS = [
  { x: -62, y: -48, size: 4 },
  { x: -78, y: 2, size: 3 },
  { x: -50, y: 50, size: 5 },
  { x: 0, y: -70, size: 3 },
  { x: 55, y: -46, size: 5 },
  { x: 78, y: 4, size: 3 },
  { x: 48, y: 53, size: 4 },
  { x: 0, y: 68, size: 3 },
] as const;

export const LivePairFormationCelebration = memo(function LivePairFormationCelebration({
  pair,
  compact = false,
  eyebrow = 'PRIVATE SPARK',
  haptic = false,
  initialProgress = 0,
  label = 'A Private Spark is opening',
  onComplete,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const reduceMotion = useReduceMotion();
  const timeline = useRef(new Animated.Value(0)).current;
  const didHapticRef = useRef(false);
  const initialTimelineProgress = useRef(Math.min(0.98, Math.max(0, initialProgress))).current;

  useEffect(() => {
    timeline.stopAnimation();
    if (reduceMotion) {
      timeline.setValue(0.76);
      const timeout = setTimeout(() => onComplete?.(), 420);
      return () => clearTimeout(timeout);
    }
    timeline.setValue(initialTimelineProgress);
    const animation = Animated.timing(timeline, {
      toValue: 1,
      duration: LIVE_PRIVATE_SPARK_MOTION.formationDurationMs * (1 - initialTimelineProgress),
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onComplete?.();
    });
    return () => animation.stop();
  }, [initialTimelineProgress, onComplete, reduceMotion, timeline]);

  useEffect(() => {
    if (!haptic || didHapticRef.current || reduceMotion) return;
    didHapticRef.current = true;
    const hapticDelay = LIVE_PRIVATE_SPARK_MOTION.fusionMomentMs
      - (LIVE_PRIVATE_SPARK_MOTION.formationDurationMs * initialTimelineProgress);
    if (hapticDelay <= 0) return;
    const timeout = setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }, hapticDelay);
    return () => clearTimeout(timeout);
  }, [haptic, initialTimelineProgress, reduceMotion]);

  const portraitWidth = compact ? 42 : 94;
  const portraitHeight = compact ? 42 : 122;
  const portraitRadius = compact ? 21 : 28;
  const travel = compact ? 58 : 112;
  const portraitOpacity = timeline.interpolate({
    inputRange: [0, 0.08, 0.68, 0.86, 1],
    outputRange: [0, 1, 1, 0.86, 0],
  });
  const portraitScale = timeline.interpolate({
    inputRange: [0, 0.54, 0.72, 1],
    outputRange: [0.82, 1, 0.88, 0.56],
  });
  const coreOpacity = timeline.interpolate({
    inputRange: [0, 0.44, 0.62, 0.85, 1],
    outputRange: [0, 0, 1, 1, 0],
  });
  const coreScale = timeline.interpolate({
    inputRange: [0, 0.48, 0.68, 0.84, 1],
    outputRange: [0.2, 0.2, 1.18, 1, 1.72],
  });
  const burstOpacity = timeline.interpolate({
    inputRange: [0, 0.54, 0.67, 0.84, 1],
    outputRange: [0, 0, 1, 0.54, 0],
  });
  const burstScale = timeline.interpolate({
    inputRange: [0, 0.54, 0.82, 1],
    outputRange: [0.25, 0.25, 1, 1.34],
  });
  const labelOpacity = timeline.interpolate({
    inputRange: [0, 0.5, 0.64, 0.9, 1],
    outputRange: [0, 0, 1, 1, 0],
  });

  return (
    <View
      accessibilityLabel={`${label}.`}
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.overlay, compact && styles.overlayCompact]}
    >
      <Animated.View style={[
        styles.veil,
        { opacity: coreOpacity, transform: [{ scale: coreScale }] },
      ]}>
        <LinearGradient
          colors={[`${visual.color.teal}00`, `${visual.color.teal}42`, `${visual.color.purple}66`, `${visual.color.purple}00`]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.veilGradient}
        />
      </Animated.View>

      {BURST_POINTS.map((point, index) => (
        <Animated.View
          key={`${point.x}:${point.y}`}
          style={[
            styles.burst,
            {
              width: point.size,
              height: point.size,
              borderRadius: point.size / 2,
              backgroundColor: index % 3 === 0 ? visual.color.oat : index % 2 === 0 ? visual.color.purple : visual.color.teal,
              opacity: burstOpacity,
              transform: [
                { translateX: point.x * (compact ? 0.62 : 1) },
                { translateY: point.y * (compact ? 0.62 : 1) },
                { scale: burstScale },
              ],
            },
          ]}
        />
      ))}

      {pair.map((person, index) => {
        const start = index === 0 ? -travel : travel;
        const settled = index === 0 ? -8 : 8;
        const translateX = timeline.interpolate({
          inputRange: [0, 0.14, 0.62, 0.8, 1],
          outputRange: [start, start, settled, 0, 0],
        });
        return (
          <Animated.View
            key={person.userId}
            style={[
              styles.portraitFrame,
              !compact && styles.portraitFrameStage,
              {
                width: portraitWidth,
                height: portraitHeight,
                borderRadius: portraitRadius,
                marginLeft: -portraitWidth / 2,
                marginTop: -portraitHeight / 2,
                opacity: portraitOpacity,
                transform: [{ translateX }, { scale: portraitScale }],
                zIndex: index + 2,
              },
            ]}
          >
            {person.avatarUrl ? (
              <Image
                contentFit="cover"
                source={{ uri: person.avatarUrl }}
                style={[styles.portrait, !compact && styles.portraitStage]}
                transition={120}
              />
            ) : (
              <View style={[styles.fallback, !compact && styles.fallbackStage]}>
                <Text style={[styles.initial, compact && styles.initialCompact]}>{initialFor(person.fullName)}</Text>
              </View>
            )}
            {!compact ? (
              <LinearGradient
                colors={['transparent', '#020A09D9']}
                pointerEvents="none"
                style={styles.identityShade}
              >
                <Text numberOfLines={1} style={styles.identityName}>
                  {person.fullName?.trim() || 'Private guest'}
                </Text>
              </LinearGradient>
            ) : null}
          </Animated.View>
        );
      })}

      <Animated.View style={[
        styles.core,
        compact && styles.coreCompact,
        { opacity: coreOpacity, transform: [{ scale: coreScale }] },
      ]}>
        <Sparkles color={visual.color.accentContrast} size={compact ? 13 : 18} strokeWidth={1.8} />
      </Animated.View>

      <Animated.View style={[
        styles.copy,
        compact && styles.copyCompact,
        {
          opacity: labelOpacity,
          transform: [{ translateY: timeline.interpolate({
            inputRange: [0, 0.56, 0.74, 1],
            outputRange: [8, 8, 0, -5],
          }) }],
        },
      ]}>
        <Text numberOfLines={1} style={[styles.eyebrow, compact && styles.eyebrowCompact]}>{eyebrow}</Text>
        <Text
          numberOfLines={compact ? 2 : 1}
          style={[styles.label, compact && styles.labelCompact]}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: visual.isDark ? '#061310A8' : '#F4F7F2B8',
  },
  overlayCompact: { backgroundColor: 'transparent' },
  veil: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    overflow: 'hidden',
  },
  veilGradient: { flex: 1, borderRadius: 95 },
  burst: {
    position: 'absolute',
    shadowColor: visual.color.oat,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  portraitFrame: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    padding: 2,
    overflow: 'hidden',
    backgroundColor: visual.color.surfaceRaised,
    borderWidth: 1,
    borderColor: `${visual.color.oat}A8`,
    shadowColor: visual.color.purple,
    shadowOpacity: 0.52,
    shadowRadius: 18,
    elevation: 10,
  },
  portraitFrameStage: {
    borderWidth: 0.75,
    borderColor: `${visual.color.teal}8C`,
    shadowOpacity: 0.42,
    shadowRadius: 24,
  },
  portrait: { width: '100%', height: '100%', borderRadius: 999 },
  portraitStage: { borderRadius: 27 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: visual.color.purpleSoft },
  fallbackStage: { borderRadius: 27 },
  initial: { color: visual.color.text, fontSize: 21, fontFamily: 'PlayfairDisplay_700Bold' },
  initialCompact: { fontSize: 14 },
  identityShade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 45,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 7,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
  },
  identityName: {
    color: '#FFFDF8',
    fontSize: 8,
    textAlign: 'center',
    fontFamily: 'Manrope_800ExtraBold',
  },
  core: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 42,
    height: 42,
    marginLeft: -21,
    marginTop: -21,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: visual.color.teal,
    borderWidth: 1,
    borderColor: `${visual.color.oat}A8`,
    shadowColor: visual.color.teal,
    shadowOpacity: 0.68,
    shadowRadius: 22,
    elevation: 12,
    zIndex: 6,
  },
  coreCompact: { width: 30, height: 30, marginLeft: -15, marginTop: -15, borderRadius: 15 },
  copy: { position: 'absolute', top: '68%', alignItems: 'center', gap: 4 },
  copyCompact: { top: '70%', left: 8, right: 8, gap: 1 },
  eyebrow: { color: visual.color.purple, fontSize: 9, letterSpacing: 2.1, fontFamily: 'Manrope_800ExtraBold' },
  eyebrowCompact: { fontSize: 6, letterSpacing: 1.35 },
  label: { color: visual.color.text, fontSize: 13, fontFamily: 'Manrope_700Bold' },
  labelCompact: { fontSize: 8, lineHeight: 10, textAlign: 'center' },
});
