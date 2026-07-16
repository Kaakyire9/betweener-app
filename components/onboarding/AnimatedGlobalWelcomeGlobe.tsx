import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const GLOBAL_GLOBE = require("../../assets/images/onboarding/global-globe.png");

type Props = {
  style: StyleProp<ViewStyle>;
};

export function AnimatedGlobalWelcomeGlobe({ style }: Props) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  const sheen = useSharedValue(0);
  const horizon = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;

    drift.value = withRepeat(
      withTiming(1, { duration: 7600, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    sheen.value = withRepeat(
      withDelay(900, withTiming(1, { duration: 6200, easing: Easing.inOut(Easing.quad) })),
      -1,
      false,
    );
    horizon.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [drift, horizon, reduceMotion, sheen]);

  const globeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: reduceMotion ? 0 : interpolate(drift.value, [0, 1], [-2.5, 2.5]) },
      { rotateZ: `${reduceMotion ? 0 : interpolate(drift.value, [0, 1], [-0.65, 0.65])}deg` },
      { scaleX: reduceMotion ? 1 : interpolate(drift.value, [0, 1], [0.992, 1.008]) },
      { scaleY: reduceMotion ? 1 : interpolate(drift.value, [0, 1], [1.006, 0.996]) },
    ] as ViewStyle["transform"],
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.08 : interpolate(sheen.value, [0, 0.15, 0.72, 1], [0, 0.22, 0.11, 0]),
    transform: [
      { translateX: reduceMotion ? 0 : interpolate(sheen.value, [0, 1], [-190, 190]) },
      { rotateZ: "17deg" },
    ] as ViewStyle["transform"],
  }));

  const horizonStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.16 : interpolate(horizon.value, [0, 1], [0.09, 0.24]),
    transform: [{ scale: reduceMotion ? 1 : interpolate(horizon.value, [0, 1], [0.97, 1.025]) }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.root, style, globeStyle]}>
      <Image source={GLOBAL_GLOBE} resizeMode="contain" style={styles.image} />
      <Animated.View style={[styles.horizon, horizonStyle]} />
      <View style={styles.surfaceClip}>
        <Animated.View style={[styles.sheen, sheenStyle]}>
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.58)", "rgba(123,224,218,0.18)", "transparent"]}
            locations={[0, 0.42, 0.58, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  surfaceClip: {
    position: "absolute",
    left: "16.5%",
    top: "15%",
    width: "67.5%",
    height: "68%",
    borderRadius: 999,
    overflow: "hidden",
  },
  sheen: {
    position: "absolute",
    left: "22%",
    top: "-12%",
    width: "24%",
    height: "124%",
  },
  horizon: {
    position: "absolute",
    left: "16.5%",
    top: "15%",
    width: "67.5%",
    height: "68%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(142,239,232,0.42)",
    shadowColor: "#62E3DC",
    shadowOpacity: 0.36,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
});
