import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { CommerceEmblem, useCommerceTheme } from '@/components/economy/CommerceVisuals';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import {
  resolvePremiumHeroVariant,
  type PremiumHeroVariant,
} from '@/lib/membership/premium-hero-variant';
import { Motion } from '@/lib/motion';

type Props = {
  viewerGender?: string | null;
};

const PORTRAITS: Record<Exclude<PremiumHeroVariant, 'brand'>, number> = {
  woman: require('../../assets/images/premium/premium-hero-woman-v1.png'),
  man: require('../../assets/images/premium/premium-hero-man-v1.png'),
};

export function PremiumHeroArt({ viewerGender }: Props) {
  const theme = useCommerceTheme();
  const reduceMotion = useReduceMotion();
  const variant = resolvePremiumHeroVariant(viewerGender);
  const drift = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(drift);
    cancelAnimation(halo);
    drift.value = 0;
    halo.value = 0;
    if (reduceMotion) return;
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 4400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    halo.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 6100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [drift, halo, reduceMotion]);

  const portraitStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(drift.value, [0, 1], [2, -4]) },
      { translateX: interpolate(drift.value, [0, 1], [0, 2]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.009]) },
    ] as const,
  }));
  const outerHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 1], [0.62, 1]),
    transform: [
      { rotate: `${interpolate(halo.value, [0, 1], [-2.5, 2.5])}deg` },
      { scale: interpolate(halo.value, [0, 1], [0.98, 1.035]) },
    ] as const,
  }));
  const innerHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 1], [0.88, 0.52]),
    transform: [
      { rotate: `${interpolate(halo.value, [0, 1], [2, -3])}deg` },
      { scale: interpolate(halo.value, [0, 1], [1.025, 0.985]) },
    ] as const,
  }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.container}>
      <Animated.View style={[styles.haloOuter, { borderColor: theme.lineBright }, outerHaloStyle]} />
      <Animated.View style={[styles.haloInner, { borderColor: `${theme.gold}44` }, innerHaloStyle]} />

      {variant === 'brand' ? (
        <Animated.View style={[styles.brandFallback, { backgroundColor: theme.surface, borderColor: theme.lineBright }, portraitStyle]}>
          <CommerceEmblem />
        </Animated.View>
      ) : (
        <Animated.View
          key={variant}
          entering={reduceMotion ? undefined : FadeIn.duration(Motion.duration.slow)}
          style={[styles.portraitFrame, portraitStyle]}
        >
          <Image
            source={PORTRAITS[variant]}
            resizeMode="contain"
            fadeDuration={0}
            style={styles.portrait}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  portraitFrame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  portrait: { width: '100%', height: '100%' },
  haloOuter: {
    position: 'absolute',
    width: 184,
    height: 184,
    borderRadius: 184,
    borderWidth: 1,
  },
  haloInner: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 132,
    borderWidth: 1,
  },
  brandFallback: {
    width: 112,
    height: 112,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
