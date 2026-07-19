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

const ROOTS_TREE = require("../../assets/images/onboarding/roots-tree.png");

const PARTICLES = [
  { x: 0.31, y: 0.73, size: 3 },
  { x: 0.7, y: 0.68, size: 2 },
  { x: 0.42, y: 0.58, size: 2 },
  { x: 0.61, y: 0.5, size: 3 },
  { x: 0.35, y: 0.43, size: 2 },
  { x: 0.68, y: 0.36, size: 2 },
  { x: 0.48, y: 0.28, size: 2 },
  { x: 0.57, y: 0.18, size: 3 },
] as const;

type Props = {
  size?: number;
  selectedCount?: number;
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedRootsTree({ size = 260, selectedCount = 0, decorative = true, style }: Props) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const pulse = useSharedValue(0);
  const selection = useSharedValue(Math.min(selectedCount, 3) / 3);
  const accentColor = selectedCount >= 3 ? "#8B5CFF" : selectedCount >= 2 ? "#13A8A8" : "#F6C55E";

  useEffect(() => {
    selection.value = withTiming(Math.min(selectedCount, 3) / 3, {
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
    });
    if (selectedCount > 0 && !reduceMotion) {
      pulse.value = 0;
      pulse.value = withSequence(
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 620, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [pulse, reduceMotion, selectedCount, selection]);

  useEffect(() => {
    if (reduceMotion) {
      drift.value = 0;
      shimmer.value = 0;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: 5600, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    shimmer.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [drift, reduceMotion, shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : -drift.value * 1.5 },
      { scale: 0.985 + drift.value * 0.01 + selection.value * 0.012 },
    ] as ViewStyle["transform"],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + selection.value * 0.12 + shimmer.value * 0.035,
    transform: [{ scale: 0.86 + shimmer.value * 0.1 + selection.value * 0.04 }] as ViewStyle["transform"],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.28,
    transform: [{ scale: 0.72 + pulse.value * 0.48 }] as ViewStyle["transform"],
  }));
  const particleStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.25 : 0.16 + shimmer.value * 0.42,
    transform: [{ translateY: reduceMotion ? 0 : -drift.value * 7 }] as ViewStyle["transform"],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "Tree with intertwined cultural roots"}
      style={[styles.root, { width: size, height: size }, style]}
    >
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: size * 0.31,
            left: size * 0.19,
            top: size * 0.21,
            backgroundColor: accentColor,
            shadowColor: accentColor,
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.pulseRing,
          {
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
            left: size * 0.15,
            top: size * 0.18,
            borderColor: accentColor,
          },
          pulseStyle,
        ]}
      />
      <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
        <Image source={ROOTS_TREE} resizeMode="contain" style={{ width: size, height: size }} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, particleStyle]}>
        {PARTICLES.map((particle, index) => (
          <View
            key={`${particle.x}-${particle.y}`}
            style={[
              styles.particle,
              {
                left: size * particle.x,
                top: size * particle.y,
                width: particle.size,
                height: particle.size,
                borderRadius: particle.size / 2,
                backgroundColor: index % 3 === 0 ? accentColor : "#F8D98A",
                shadowColor: index % 3 === 0 ? accentColor : "#F6C55E",
              },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    shadowOpacity: 0.48,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 1,
  },
  particle: {
    position: "absolute",
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});
