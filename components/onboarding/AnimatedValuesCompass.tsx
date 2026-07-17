import { useEffect } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const VALUES_COMPASS = require("../../assets/images/onboarding/values-compass.png");

type Props = {
  size?: number;
  selected?: boolean;
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedValuesCompass({ size = 224, selected = false, decorative = true, style }: Props) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const orbit = useSharedValue(0);
  const pulse = useSharedValue(0);
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: reduceMotion ? 0 : 460,
      easing: Easing.out(Easing.cubic),
    });
    if (selected && !reduceMotion) {
      pulse.value = 0;
      pulse.value = withSequence(
        withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 760, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [pulse, reduceMotion, selected, selectedProgress]);

  useEffect(() => {
    if (reduceMotion) {
      breathe.value = 0;
      orbit.value = 0;
      return;
    }
    breathe.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    orbit.value = withRepeat(
      withTiming(1, { duration: 18_000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [breathe, orbit, reduceMotion]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : -breathe.value * 1.5 },
      { scale: 0.99 + breathe.value * 0.012 + selectedProgress.value * 0.01 },
    ] as ViewStyle["transform"],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + breathe.value * 0.06 + selectedProgress.value * 0.12,
    transform: [{ scale: 0.84 + breathe.value * 0.12 + selectedProgress.value * 0.05 }] as ViewStyle["transform"],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.28 : 0.34 + breathe.value * 0.18,
    transform: [{ rotate: `${orbit.value * 360}deg` }] as ViewStyle["transform"],
  }));
  const reverseOrbitStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.2 : 0.24 + breathe.value * 0.14,
    transform: [{ rotate: `${orbit.value * -250}deg` }] as ViewStyle["transform"],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.32,
    transform: [{ scale: 0.68 + pulse.value * 0.48 }] as ViewStyle["transform"],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "Luminous compass representing personal values"}
      style={[styles.root, { width: size, height: size }, style]}
    >
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 0.68,
            height: size * 0.68,
            borderRadius: size * 0.34,
            left: size * 0.16,
            top: size * 0.16,
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.pulse,
          {
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
            left: size * 0.15,
            top: size * 0.15,
          },
          pulseStyle,
        ]}
      />
      <Animated.View style={[styles.orbit, { width: size * 0.78, height: size * 0.78, left: size * 0.11, top: size * 0.11 }, orbitStyle]}>
        <View style={[styles.orbitDot, { top: -3, left: "50%" }]} />
        <View style={[styles.orbitDotSmall, { bottom: 8, right: 12 }]} />
      </Animated.View>
      <Animated.View
        style={[
          styles.reverseOrbit,
          { width: size * 0.58, height: size * 0.58, left: size * 0.21, top: size * 0.21 },
          reverseOrbitStyle,
        ]}
      >
        <View style={[styles.orbitDotTeal, { top: "48%", left: -3 }]} />
      </Animated.View>
      <Animated.View style={[{ width: size, height: size }, imageStyle]}>
        <Image source={VALUES_COMPASS} resizeMode="contain" style={{ width: size, height: size }} />
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
  glow: {
    position: "absolute",
    backgroundColor: "#F6C55E",
    shadowColor: "#F6C55E",
    shadowOpacity: 0.55,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  pulse: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(246,197,94,0.9)",
  },
  orbit: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(246,197,94,0.18)",
    borderRadius: 999,
  },
  reverseOrbit: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(19,168,168,0.14)",
    borderRadius: 999,
  },
  orbitDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F6C55E",
    shadowColor: "#F6C55E",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 3,
  },
  orbitDotSmall: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFF4D0",
  },
  orbitDotTeal: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#65D1D0",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 3,
  },
});
