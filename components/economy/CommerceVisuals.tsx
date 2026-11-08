import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';

export const CommerceDarkColors = {
  mode: 'dark' as const,
  canvas: '#061415', canvasRaised: '#091B1D', panel: '#0C2022', panelStrong: '#10282B',
  surface: 'rgba(11,31,33,0.88)', surfaceStrong: 'rgba(7,25,27,0.92)', chip: 'rgba(255,255,255,0.06)', iconSurface: 'rgba(6,24,25,0.58)',
  line: 'rgba(149,220,214,0.15)', lineBright: 'rgba(122,238,231,0.34)',
  text: '#F7F3EA', textMuted: '#9CB5B1', cyan: '#17D8D1', cyanDeep: '#079D9B', violet: '#C47CFF', pink: '#FF73B5',
  gold: '#FFC857', goldDeep: '#A76E0A', silver: '#DCE7EA', danger: '#FF7D86', shadow: '#00A9A4', warningSurface: 'rgba(61,43,13,0.44)',
} as const;

export const CommerceLightColors = {
  mode: 'light' as const,
  canvas: '#F7F0E6', canvasRaised: '#E9F0EA', panel: '#FFFEFA', panelStrong: '#E7F2EE',
  surface: 'rgba(255,254,250,0.98)', surfaceStrong: 'rgba(244,249,245,0.98)', chip: 'rgba(0,112,107,0.10)', iconSurface: 'rgba(250,253,250,0.96)',
  line: 'rgba(6,103,98,0.24)', lineBright: 'rgba(0,130,124,0.48)',
  text: '#073F3C', textMuted: '#536D68', cyan: '#008D88', cyanDeep: '#007A76', violet: '#873FAE', pink: '#C92D74',
  gold: '#B87808', goldDeep: '#754900', silver: '#597777', danger: '#B83245', shadow: '#1C5A55', warningSurface: '#FFF4D9',
} as const;

export type CommerceTheme = typeof CommerceDarkColors | typeof CommerceLightColors;

// Stable dark accent constants for non-react module configuration.
export const CommerceColors = CommerceDarkColors;

export function useCommerceTheme(): CommerceTheme {
  return useColorScheme() === 'dark' ? CommerceDarkColors : CommerceLightColors;
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function CommerceBackdrop({ variant = 'mixed' }: { variant?: 'mixed' | 'gold' | 'sparks' }) {
  const theme = useCommerceTheme();
  const reduceMotion = useReduceMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(drift);
    drift.value = 0;
    if (reduceMotion) return;
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 7800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 7800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [drift, reduceMotion]);

  const topDriftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, -10]) },
      { translateY: interpolate(drift.value, [0, 1], [0, 7]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.025]) },
    ] as const,
  }));
  const sideDriftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, 8]) },
      { translateY: interpolate(drift.value, [0, 1], [0, -9]) },
    ] as const,
  }));
  const colors = theme.mode === 'dark'
    ? variant === 'gold'
      ? ['rgba(178,119,19,0.22)', 'rgba(6,20,21,0.04)', 'rgba(5,15,17,0.96)'] as const
      : variant === 'sparks'
        ? ['rgba(17,206,200,0.20)', 'rgba(151,70,220,0.12)', 'rgba(5,15,17,0.96)'] as const
        : ['rgba(7,153,157,0.20)', 'rgba(94,50,136,0.10)', 'rgba(5,15,17,0.96)'] as const
    : variant === 'gold'
      ? ['rgba(231,193,111,0.32)', 'rgba(255,254,250,0.94)', 'rgba(247,240,230,0.99)'] as const
      : variant === 'sparks'
        ? ['rgba(120,205,194,0.30)', 'rgba(198,163,215,0.13)', 'rgba(247,240,230,0.99)'] as const
        : ['rgba(135,211,201,0.27)', 'rgba(231,220,221,0.34)', 'rgba(247,240,230,0.99)'] as const;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.orb, styles.orbTop, theme.mode === 'light' && styles.orbTopLight, topDriftStyle]} />
      <Animated.View style={[styles.orb, styles.orbRight, theme.mode === 'light' && styles.orbRightLight, sideDriftStyle]} />
      <View style={[styles.horizon, theme.mode === 'light' && styles.horizonLight]} />
    </View>
  );
}

export function CommerceHeader({ title, onBack, trailing }: { title: string; onBack: () => void; trailing?: ReactNode }) {
  const theme = useCommerceTheme();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={10}
        onPress={onBack}
        style={({ pressed }) => [styles.headerButton, { borderColor: theme.line, backgroundColor: theme.surface }, theme.mode === 'light' && styles.lightShadow, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" size={25} color={theme.text} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.headerTrailing}>{trailing}</View>
    </View>
  );
}

export function CommercePill({
  icon, label, tone = 'cyan', compact = false,
}: {
  icon: IconName;
  label: string;
  tone?: 'cyan' | 'gold' | 'violet' | 'neutral';
  compact?: boolean;
}) {
  const theme = useCommerceTheme();
  const color = tone === 'gold' ? theme.gold : tone === 'violet' ? theme.violet : tone === 'neutral' ? theme.silver : theme.cyan;
  return (
    <View style={[styles.pill, { borderColor: theme.line, backgroundColor: theme.surface }, compact && styles.pillCompact, theme.mode === 'light' && styles.lightShadowSoft]}>
      <MaterialCommunityIcons name={icon} size={compact ? 13 : 15} color={color} />
      <Text adjustsFontSizeToFit={compact} minimumFontScale={0.84} numberOfLines={1} style={[styles.pillText, { color: theme.text }, compact && styles.pillTextCompact]}>
        {label}
      </Text>
    </View>
  );
}

export function RevenueCatVerifiedBadge({ stale = false }: { stale?: boolean }) {
  const theme = useCommerceTheme();
  return (
    <View style={[styles.verified, { borderColor: theme.lineBright, backgroundColor: theme.surfaceStrong }, theme.mode === 'light' && styles.lightShadowSoft]}>
      <MaterialCommunityIcons name={stale ? 'clock-outline' : 'check-decagram'} size={15} color={stale ? theme.gold : theme.cyan} />
      <Text style={[styles.verifiedText, { color: theme.text }]}>{stale ? 'Last verified balance' : 'RevenueCat verified'}</Text>
    </View>
  );
}

export function CommerceEmblem({ compact = false }: { compact?: boolean }) {
  const theme = useCommerceTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(0.46);

  useEffect(() => {
    cancelAnimation(pulse);
    if (reduceMotion) {
      pulse.value = 0.58;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.82, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.46, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse, reduceMotion]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.92 + pulse.value * 0.10 }] }));
  const size = compact ? 49 : 72;
  return (
    <View accessibilityElementsHidden style={{ width: size, height: size }}>
      <Animated.View style={[styles.emblemGlow, { backgroundColor: theme.mode === 'dark' ? 'rgba(39,218,210,0.32)' : 'rgba(24,126,121,0.20)' }, glowStyle]} />
      <Image source={require('../../assets/images/premium/betweener-glass-emblem-v1.png')} resizeMode="contain" fadeDuration={0} style={styles.emblemImage} />
    </View>
  );
}

export function SparkEmblem({ compact = false }: { compact?: boolean }) {
  const theme = useCommerceTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(0.42);
  const sheen = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);
    cancelAnimation(sheen);
    if (reduceMotion) {
      pulse.value = 0.56;
      sheen.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.76, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.42, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    sheen.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 2600 }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [pulse, reduceMotion, sheen]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.90 + pulse.value * 0.12 }] }));
  const size = compact ? 47 : 70;
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheen.value, [0, 0.18, 0.72, 1], [0, 0.54, 0.20, 0]),
    transform: [
      { translateX: interpolate(sheen.value, [0, 1], [-size * 0.82, size * 0.82]) },
      { rotate: '-18deg' },
    ] as const,
  }));
  return (
    <View accessibilityElementsHidden style={[styles.emblemClip, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.emblemGlow,
          { backgroundColor: theme.mode === 'dark' ? 'rgba(177,83,241,0.42)' : 'rgba(116,45,158,0.22)' },
          glowStyle,
        ]}
      />
      <Image source={require('../../assets/images/premium/spark-glass-heart-v1.png')} resizeMode="contain" fadeDuration={0} style={styles.emblemImage} />
      <Animated.View pointerEvents="none" style={[styles.emblemSheen, sheenStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function SparkOrb({ compact = false, showCore = true }: { compact?: boolean; showCore?: boolean }) {
  const theme = useCommerceTheme();
  const reduceMotion = useReduceMotion();
  const outerOrbit = useSharedValue(0);
  const innerOrbit = useSharedValue(0);
  const float = useSharedValue(0);
  const size = compact ? 104 : 184;

  useEffect(() => {
    [outerOrbit, innerOrbit, float].forEach(cancelAnimation);
    outerOrbit.value = 0;
    innerOrbit.value = 0;
    float.value = 0;
    if (reduceMotion) return;
    outerOrbit.value = withRepeat(withTiming(1, { duration: 26000, easing: Easing.linear }), -1, false);
    innerOrbit.value = withRepeat(withTiming(1, { duration: 19000, easing: Easing.linear }), -1, false);
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [float, innerOrbit, outerOrbit, reduceMotion]);

  const outerOrbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${outerOrbit.value * 360}deg` }],
  }));
  const innerOrbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${innerOrbit.value * -360}deg` }],
  }));
  const coreFloatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(float.value, [0, 1], [2, -3]) },
      { rotate: '-3deg' },
      { scale: interpolate(float.value, [0, 1], [0.985, 1.015]) },
    ] as const,
  }));

  return (
    <View accessibilityElementsHidden style={[styles.sparkOrb, { width: size, height: size, borderRadius: size / 2, borderColor: theme.lineBright, shadowColor: theme.shadow }]}>
      <LinearGradient
        colors={theme.mode === 'dark'
          ? ['rgba(14,220,214,0.06)', 'rgba(123,72,190,0.30)', 'rgba(255,105,181,0.12)']
          : ['rgba(33,145,139,0.07)', 'rgba(130,84,158,0.12)', 'rgba(204,126,164,0.08)']}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      <Animated.View style={[styles.orbitLayer, outerOrbitStyle]}>
        <View style={[styles.sparkRing, { width: size * 0.78, height: size * 0.78, borderRadius: size, borderColor: theme.lineBright }]} />
        <MaterialCommunityIcons name="diamond-stone" size={compact ? 12 : 17} color={theme.cyan} style={styles.sparkStarA} />
        <MaterialCommunityIcons name="star-four-points" size={compact ? 10 : 14} color={theme.gold} style={styles.sparkStarC} />
      </Animated.View>
      <Animated.View style={[styles.orbitLayer, innerOrbitStyle]}>
        <View style={[styles.sparkRingInner, { width: size * 0.56, height: size * 0.56, borderRadius: size, borderColor: `${theme.violet}66` }]} />
        <MaterialCommunityIcons name="heart" size={compact ? 10 : 15} color={theme.pink} style={styles.sparkStarB} />
      </Animated.View>
      {showCore ? (
        <Animated.View style={[styles.sparkCore, compact && styles.sparkCoreCompact, { borderColor: theme.line, backgroundColor: theme.surface }, coreFloatStyle]}>
          <SparkEmblem compact={compact} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', borderWidth: 1 },
  orbTop: { width: 310, height: 310, borderRadius: 310, top: -190, right: -90, borderColor: 'rgba(28,218,211,0.16)', backgroundColor: 'rgba(7,111,116,0.08)' },
  orbTopLight: { borderColor: 'rgba(8,112,108,0.14)', backgroundColor: 'rgba(28,144,139,0.05)' },
  orbRight: { width: 230, height: 230, borderRadius: 230, top: 250, left: -170, borderColor: 'rgba(180,107,245,0.13)', backgroundColor: 'rgba(112,58,157,0.06)' },
  orbRightLight: { borderColor: 'rgba(126,70,155,0.10)', backgroundColor: 'rgba(126,70,155,0.035)' },
  horizon: { position: 'absolute', top: 210, right: -80, width: 260, height: 1, backgroundColor: 'rgba(55,232,221,0.16)', transform: [{ rotate: '-18deg' }] },
  horizonLight: { backgroundColor: 'rgba(9,105,102,0.12)' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22 },
  headerTrailing: { width: 76, alignItems: 'flex-end' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  pill: { minHeight: 34, paddingHorizontal: 11, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1 },
  pillCompact: { flex: 1, minWidth: 0, minHeight: 33, paddingHorizontal: 6, gap: 4, justifyContent: 'center' },
  pillText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  pillTextCompact: { flexShrink: 1, fontSize: 10 },
  verified: { alignSelf: 'center', minHeight: 34, paddingHorizontal: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1 },
  verifiedText: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  sparkOrb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 7 },
  orbitLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  sparkRing: { borderWidth: 1 },
  sparkRingInner: { borderWidth: 1 },
  sparkCore: { width: 88, height: 88, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sparkCoreCompact: { width: 60, height: 60, borderRadius: 21 },
  sparkStarA: { position: 'absolute', top: '12%', right: '17%' },
  sparkStarB: { position: 'absolute', bottom: '17%', left: '12%' },
  sparkStarC: { position: 'absolute', top: '23%', left: '8%' },
  emblemGlow: { position: 'absolute', top: 2, right: 2, bottom: 2, left: 2, borderRadius: 999 },
  emblemClip: { overflow: 'hidden', borderRadius: 999 },
  emblemImage: { width: '100%', height: '100%' },
  emblemSheen: { position: 'absolute', top: -8, bottom: -8, width: 15 },
  lightShadow: { shadowColor: '#294D48', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  lightShadowSoft: { shadowColor: '#294D48', shadowOpacity: 0.09, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});
