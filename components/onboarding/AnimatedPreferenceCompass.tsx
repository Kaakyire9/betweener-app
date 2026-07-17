import { useEffect } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const PREFERENCE_COMPASS = require("../../assets/images/onboarding/preference-compass.png");

type Props = {
  size?: number;
  minAge: number;
  maxAge: number;
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedPreferenceCompass({ size = 224, minAge, maxAge, decorative = true, style }: Props) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const orbit = useSharedValue(0);
  const rangeProgress = useSharedValue(Math.min(Math.max((maxAge - minAge) / 40, 0), 1));

  useEffect(() => {
    rangeProgress.value = withTiming(Math.min(Math.max((maxAge - minAge) / 40, 0), 1), {
      duration: reduceMotion ? 0 : 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [maxAge, minAge, rangeProgress, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      breathe.value = 0;
      orbit.value = 0;
      return;
    }
    breathe.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.cubic) }), -1, true);
    orbit.value = withRepeat(withTiming(1, { duration: 16_000, easing: Easing.linear }), -1, false);
  }, [breathe, orbit, reduceMotion]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : -breathe.value * 1.5 },
      { scale: 0.988 + breathe.value * 0.012 + rangeProgress.value * 0.008 },
    ] as ViewStyle["transform"],
  }));
  const heartGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.11 + breathe.value * 0.06 + rangeProgress.value * 0.1,
    transform: [{ scale: 0.76 + breathe.value * 0.14 + rangeProgress.value * 0.06 }] as ViewStyle["transform"],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.24 : 0.24 + breathe.value * 0.16,
    transform: [{ rotate: `${orbit.value * 360}deg` }] as ViewStyle["transform"],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : `Preferred age range ${minAge} to ${maxAge}`}
      style={[styles.root, { width: size, height: size }, style]}
    >
      <View style={[styles.tealGlow, { width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19 }]} />
      <View style={[styles.purpleGlow, { width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19 }]} />
      <Animated.View
        style={[
          styles.heartGlow,
          { width: size * 0.27, height: size * 0.27, borderRadius: size * 0.135, left: size * 0.365, top: size * 0.29 },
          heartGlowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.orbit,
          { width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36, left: size * 0.14, top: size * 0.1 },
          orbitStyle,
        ]}
      >
        <View style={styles.orbitDotGold} />
        <View style={styles.orbitDotTeal} />
      </Animated.View>
      <Animated.View style={[{ width: size, height: size }, imageStyle]}>
        <Image source={PREFERENCE_COMPASS} resizeMode="contain" style={{ width: size, height: size }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tealGlow: {
    position: "absolute",
    left: "8%",
    bottom: "5%",
    backgroundColor: "rgba(19,168,168,0.09)",
  },
  purpleGlow: {
    position: "absolute",
    right: "8%",
    bottom: "5%",
    backgroundColor: "rgba(139,92,255,0.09)",
  },
  heartGlow: {
    position: "absolute",
    backgroundColor: "#F6C55E",
    shadowColor: "#F6C55E",
    shadowOpacity: 0.6,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  orbit: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(246,197,94,0.2)",
  },
  orbitDotGold: {
    position: "absolute",
    top: -3,
    left: "50%",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F6C55E",
  },
  orbitDotTeal: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#65D1D0",
  },
});
