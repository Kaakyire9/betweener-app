import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const GLOBAL_GLOBE = require("../../assets/images/onboarding/global-globe.png");

type Props = {
  size?: number;
  selected?: boolean;
};

export function AnimatedGlobalLocation({ size = 240, selected = false }: Props) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const primaryOrbit = useSharedValue(0);
  const secondaryOrbit = useSharedValue(0);
  const scan = useSharedValue(0);
  const signal = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;

    breathe.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    primaryOrbit.value = withRepeat(
      withTiming(1, { duration: 16_000, easing: Easing.linear }),
      -1,
      false,
    );
    secondaryOrbit.value = withRepeat(
      withTiming(1, { duration: 23_000, easing: Easing.linear }),
      -1,
      false,
    );
    scan.value = withRepeat(
      withTiming(1, { duration: 6800, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    signal.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    );
  }, [breathe, primaryOrbit, reduceMotion, scan, secondaryOrbit, signal]);

  const imageStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : interpolate(breathe.value, [0, 1], [0.96, 1]),
    transform: [
      { translateY: reduceMotion ? 0 : interpolate(breathe.value, [0, 1], [1.5, -2.5]) },
      { rotateZ: `${reduceMotion ? 0 : interpolate(breathe.value, [0, 1], [-0.3, 0.3])}deg` },
      {
        scale: reduceMotion
          ? selected
            ? 1.015
            : 1
          : interpolate(breathe.value, [0, 1], selected ? [1.005, 1.02] : [0.992, 1.006]),
      },
    ] as ViewStyle["transform"],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.14 : interpolate(breathe.value, [0, 1], [0.08, selected ? 0.24 : 0.18]),
    transform: [{ scale: reduceMotion ? 1 : interpolate(breathe.value, [0, 1], [0.94, 1.08]) }],
  }));

  const primaryOrbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${primaryOrbit.value * 360}deg` }] as ViewStyle["transform"],
  }));

  const secondaryOrbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${-secondaryOrbit.value * 360}deg` }] as ViewStyle["transform"],
  }));

  const scanStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.07 : interpolate(scan.value, [0, 0.12, 0.82, 1], [0, 0.13, 0.07, 0]),
    transform: [{ translateY: reduceMotion ? 0 : interpolate(scan.value, [0, 1], [-size * 0.22, size * 0.22]) }],
  }));

  const signalStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.36 : interpolate(signal.value, [0, 0.72, 1], [0.52, 0.12, 0]),
    transform: [{ scale: reduceMotion ? 1 : interpolate(signal.value, [0, 1], [0.65, 2.4]) }],
  }));

  const globeDiameter = size * 0.68;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { width: size, height: size }]}
    >
      <Animated.View
        style={[
          styles.halo,
          {
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: size,
          },
          haloStyle,
        ]}
      />

      <Animated.View
        style={[
          styles.orbit,
          styles.primaryOrbit,
          {
            width: size * 0.88,
            height: size * 0.4,
            borderRadius: size,
            left: size * 0.06,
            top: size * 0.29,
          },
          primaryOrbitStyle,
        ]}
      >
        <View style={styles.goldNode} />
        <View style={styles.tealNode} />
      </Animated.View>

      <Animated.View
        style={[
          styles.orbit,
          styles.secondaryOrbit,
          {
            width: size * 0.78,
            height: size * 0.5,
            borderRadius: size,
            left: size * 0.11,
            top: size * 0.25,
          },
          secondaryOrbitStyle,
        ]}
      >
        <View style={styles.violetNode} />
      </Animated.View>

      <Animated.View style={[styles.imageWrap, { width: size, height: size }, imageStyle]}>
        <Image source={GLOBAL_GLOBE} resizeMode="contain" style={styles.image} />
        <View
          style={[
            styles.scanClip,
            {
              width: globeDiameter,
              height: globeDiameter,
              borderRadius: globeDiameter,
              left: (size - globeDiameter) / 2,
              top: (size - globeDiameter) / 2,
            },
          ]}
        >
          <Animated.View style={[styles.scanBand, { width: globeDiameter }, scanStyle]}>
            <LinearGradient
              colors={["transparent", "rgba(126,232,226,0.42)", "rgba(183,151,255,0.2)", "transparent"]}
              locations={[0, 0.42, 0.58, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </View>
      </Animated.View>

      <View style={[styles.connectionNode, styles.connectionNodeLeft]}>
        <Animated.View style={[styles.signalRing, signalStyle]} />
      </View>
      <View style={[styles.connectionNode, styles.connectionNodeRight]}>
        <Animated.View style={[styles.signalRing, signalStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    backgroundColor: "#13A8A8",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.34,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
  },
  imageWrap: {
    zIndex: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  orbit: {
    position: "absolute",
    zIndex: 2,
    borderWidth: 1,
  },
  primaryOrbit: {
    borderColor: "rgba(244,235,221,0.24)",
  },
  secondaryOrbit: {
    borderColor: "rgba(107,211,208,0.17)",
  },
  goldNode: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    top: -4,
    left: "48%",
    backgroundColor: "#E7C36A",
    shadowColor: "#E7C36A",
    shadowOpacity: 0.7,
    shadowRadius: 7,
  },
  tealNode: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    right: 12,
    bottom: 3,
    backgroundColor: "#6BD3D0",
  },
  violetNode: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    left: 8,
    top: "62%",
    backgroundColor: "#A885FF",
    shadowColor: "#A885FF",
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },
  scanClip: {
    position: "absolute",
    overflow: "hidden",
  },
  scanBand: {
    position: "absolute",
    left: 0,
    top: "40%",
    height: "20%",
  },
  connectionNode: {
    position: "absolute",
    zIndex: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#8B5CFF",
    shadowColor: "#8B5CFF",
    shadowOpacity: 0.6,
    shadowRadius: 9,
  },
  connectionNodeLeft: {
    left: "13%",
    top: "48%",
  },
  connectionNodeRight: {
    right: "12%",
    top: "34%",
  },
  signalRing: {
    position: "absolute",
    left: -3,
    top: -3,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(168,133,255,0.76)",
  },
});
