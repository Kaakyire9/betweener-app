import { useEffect } from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const COMPLETION_PORTAL = require("../../assets/images/onboarding/completion-portal.png");

export function AnimatedCompletionPortal({ size = 280 }: { size?: number }) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const orbit = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.cubic) }), -1, true);
    orbit.value = withRepeat(withTiming(1, { duration: 15_000, easing: Easing.linear }), -1, false);
  }, [breathe, orbit, reduceMotion]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : -2 * breathe.value },
      { scale: reduceMotion ? 1 : 0.985 + 0.015 * breathe.value },
    ] as ViewStyle["transform"],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.2 : 0.15 + 0.15 * breathe.value,
    transform: [{ scale: reduceMotion ? 1 : 0.86 + 0.18 * breathe.value }] as ViewStyle["transform"],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 360}deg` }] as ViewStyle["transform"],
  }));

  return (
    <View pointerEvents="none" style={[styles.root, { width: size, height: size }]}>
      <Animated.View style={[styles.halo, { width: size * 0.54, height: size * 0.54, borderRadius: size }, haloStyle]} />
      <Animated.View
        style={[
          styles.orbit,
          { width: size * 0.72, height: size * 0.72, borderRadius: size, left: size * 0.14, top: size * 0.07 },
          orbitStyle,
        ]}
      >
        <View style={styles.goldDot} />
        <View style={styles.tealDot} />
      </Animated.View>
      <Animated.View style={[styles.imageFrame, { width: size, height: size }, imageStyle]}>
        <Image source={COMPLETION_PORTAL} resizeMode="cover" style={{ width: size, height: size }} />
      </Animated.View>
      <View style={styles.bottomFade} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "relative", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 28 },
  imageFrame: { borderRadius: 28, overflow: "hidden" },
  halo: {
    position: "absolute",
    backgroundColor: "#F8D77A",
    shadowColor: "#F8D77A",
    shadowOpacity: 0.65,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
  },
  orbit: { position: "absolute", zIndex: 2, borderWidth: 1, borderColor: "rgba(255,226,150,0.45)" },
  goldDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, top: -4, left: "50%", backgroundColor: "#FFE6A0" },
  tealDot: { position: "absolute", width: 5, height: 5, borderRadius: 3, right: 6, bottom: 22, backgroundColor: "#8DDAD7" },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 28, backgroundColor: "rgba(250,244,237,0.16)" },
});
