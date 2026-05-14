import React, { memo, useEffect } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { vibesMotion } from "./motionPresets";

type GlowOrbProps = {
  color: string;
  size: number;
  opacity: number;
  softness?: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  animated?: boolean;
  delay?: number;
  style?: ViewStyle;
};

function GlowOrb({
  color,
  size,
  opacity,
  softness = 0.54,
  top,
  left,
  right,
  bottom,
  animated = false,
  delay = 0,
  style,
}: GlowOrbProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: vibesMotion.ambient.maxDuration, easing: vibesMotion.ambient.easing }),
          withTiming(0, { duration: vibesMotion.ambient.minDuration, easing: vibesMotion.ambient.easing }),
        ),
        -1,
        false,
      ),
    );
  }, [animated, delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity * (animated ? 0.68 + progress.value * 0.22 : 1),
    transform: [
      { translateX: animated ? (progress.value - 0.5) * 8 : 0 },
      { translateY: animated ? (progress.value - 0.5) * -10 : 0 },
      { scale: animated ? 1 + progress.value * 0.025 : 1 },
    ],
  }) as any);

  const baseStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    top,
    left,
    right,
    bottom,
  };

  return (
    <Animated.View pointerEvents="none" style={[styles.orb, baseStyle, animatedStyle, style]}>
      <View
        style={[
          styles.inner,
          {
            margin: size * (1 - softness) * 0.24,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: Platform.OS === "android" ? 0.42 : 0.34,
          },
        ]}
      />
    </Animated.View>
  );
}

export default memo(GlowOrb);

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
  },
  inner: {
    flex: 1,
  },
});
