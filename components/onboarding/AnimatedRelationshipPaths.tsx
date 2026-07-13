import { useEffect } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const RELATIONSHIP_PATHS = require("../../assets/images/onboarding/relationship-paths.png");

type Props = {
  size?: number;
  selected?: boolean;
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedRelationshipPaths({ size = 230, selected = false, decorative = true, style }: Props) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const converge = useSharedValue(0);
  const pulse = useSharedValue(0);
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: reduceMotion ? 0 : 440,
      easing: Easing.out(Easing.cubic),
    });
    if (selected && !reduceMotion) {
      pulse.value = 0;
      pulse.value = withSequence(
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 720, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [pulse, reduceMotion, selected, selectedProgress]);

  useEffect(() => {
    if (reduceMotion) {
      breathe.value = 0;
      converge.value = 0.72;
      return;
    }
    breathe.value = withRepeat(
      withTiming(1, { duration: 5400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    converge.value = withDelay(
      600,
      withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.cubic) }), -1, false),
    );
  }, [breathe, converge, reduceMotion]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : -breathe.value * 1.5 },
      { scale: 0.988 + breathe.value * 0.012 + selectedProgress.value * 0.012 },
    ] as ViewStyle["transform"],
  }));
  const centreGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + breathe.value * 0.06 + selectedProgress.value * 0.14,
    transform: [{ scale: 0.78 + breathe.value * 0.12 + selectedProgress.value * 0.08 }] as ViewStyle["transform"],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.34,
    transform: [{ scale: 0.55 + pulse.value * 0.72 }] as ViewStyle["transform"],
  }));
  const tealParticleStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.42 : 0.22 + Math.sin(converge.value * Math.PI) * 0.62,
    transform: [
      { translateX: converge.value * size * 0.34 },
      { translateY: converge.value * size * -0.2 },
      { scale: 0.72 + converge.value * 0.28 },
    ] as ViewStyle["transform"],
  }));
  const purpleParticleStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.42 : 0.22 + Math.sin(converge.value * Math.PI) * 0.62,
    transform: [
      { translateX: converge.value * size * -0.31 },
      { translateY: converge.value * size * 0.25 },
      { scale: 0.72 + converge.value * 0.28 },
    ] as ViewStyle["transform"],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "Two luminous paths converging at a shared centre"}
      style={[styles.root, { width: size, height: size }, style]}
    >
      <View style={[styles.tealAura, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21 }]} />
      <View style={[styles.purpleAura, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21 }]} />
      <Animated.View
        style={[
          styles.centreGlow,
          { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14, left: size * 0.36, top: size * 0.39 },
          centreGlowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.pulseRing,
          { width: size * 0.36, height: size * 0.36, borderRadius: size * 0.18, left: size * 0.32, top: size * 0.35 },
          pulseStyle,
        ]}
      />
      <Animated.View style={[{ width: size, height: size }, imageStyle]}>
        <Image source={RELATIONSHIP_PATHS} resizeMode="contain" style={{ width: size, height: size }} />
      </Animated.View>
      <Animated.View style={[styles.tealParticle, { left: size * 0.12, top: size * 0.72 }, tealParticleStyle]} />
      <Animated.View style={[styles.purpleParticle, { left: size * 0.82, top: size * 0.25 }, purpleParticleStyle]} />
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
  tealAura: {
    position: "absolute",
    left: "4%",
    bottom: "8%",
    backgroundColor: "rgba(19,168,168,0.08)",
  },
  purpleAura: {
    position: "absolute",
    right: "4%",
    top: "8%",
    backgroundColor: "rgba(139,92,255,0.08)",
  },
  centreGlow: {
    position: "absolute",
    backgroundColor: "#F6C55E",
    shadowColor: "#F6C55E",
    shadowOpacity: 0.6,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(246,197,94,0.9)",
  },
  tealParticle: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#65D1D0",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 3,
  },
  purpleParticle: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#C6A7FF",
    shadowColor: "#8B5CFF",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 3,
  },
});
