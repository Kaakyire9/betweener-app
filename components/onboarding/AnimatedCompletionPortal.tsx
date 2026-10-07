import { useEffect } from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const COMPLETION_PORTAL = require("../../assets/images/onboarding/completion-portal.png");

const BURST_SPARKS = Array.from({ length: 14 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 14 - Math.PI / 2;
  return {
    angle,
    color: ["#FFE8A3", "#8CE0DA", "#DDBBFF"][index % 3],
    distance: 72 + (index % 4) * 12,
    size: 3 + (index % 3),
  };
});

function BurstSpark({
  item,
  progress,
  size,
}: {
  item: (typeof BURST_SPARKS)[number];
  progress: SharedValue<number>;
  size: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.16, 0.72, 1], [0, 1, 0.8, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: Math.cos(item.angle) * item.distance * progress.value * (size / 280) },
      { translateY: Math.sin(item.angle) * item.distance * progress.value * (size / 280) },
      { scale: interpolate(progress.value, [0, 0.24, 1], [0.2, 1.2, 0.4], Extrapolation.CLAMP) },
    ] as ViewStyle["transform"],
  }));

  return (
    <Animated.View
      style={[
        styles.spark,
        {
          width: item.size,
          height: item.size,
          borderRadius: item.size,
          backgroundColor: item.color,
        },
        style,
      ]}
    />
  );
}

type Props = {
  size?: number;
  avatarUri?: string | null;
  celebrating?: boolean;
};

export function AnimatedCompletionPortal({
  size = 280,
  avatarUri = null,
  celebrating = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const orbit = useSharedValue(0);
  const success = useSharedValue(celebrating ? 1 : 0);
  const avatarReveal = useSharedValue(celebrating ? 1 : 0);
  const burst = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      breathe.value = 1;
      orbit.value = 0;
      return;
    }
    breathe.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    orbit.value = withRepeat(
      withTiming(1, { duration: 15_000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(orbit);
    };
  }, [breathe, orbit, reduceMotion]);

  useEffect(() => {
    cancelAnimation(success);
    cancelAnimation(avatarReveal);
    cancelAnimation(burst);
    if (!celebrating) {
      success.value = withTiming(0, { duration: reduceMotion ? 0 : 180 });
      avatarReveal.value = withTiming(0, { duration: reduceMotion ? 0 : 140 });
      burst.value = 0;
      return;
    }
    if (reduceMotion) {
      success.value = 1;
      avatarReveal.value = 1;
      burst.value = 1;
      return;
    }
    success.value = withSpring(1, { damping: 12, stiffness: 110, mass: 0.8 });
    avatarReveal.value = withDelay(
      260,
      withSpring(1, { damping: 13, stiffness: 125, mass: 0.72 }),
    );
    burst.value = withDelay(
      180,
      withSequence(
        withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 1 }),
      ),
    );
    return () => {
      cancelAnimation(success);
      cancelAnimation(avatarReveal);
      cancelAnimation(burst);
    };
  }, [avatarReveal, burst, celebrating, reduceMotion, success]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : -2 * breathe.value },
      { scale: (reduceMotion ? 1 : 0.985 + 0.015 * breathe.value) + success.value * 0.035 },
    ] as ViewStyle["transform"],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.32 : 0.15 + 0.15 * breathe.value + success.value * 0.3,
    transform: [
      { scale: (reduceMotion ? 1 : 0.86 + 0.18 * breathe.value) + success.value * 0.34 },
    ] as ViewStyle["transform"],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    opacity: 0.52 + success.value * 0.48,
    transform: [
      { rotate: `${orbit.value * 360}deg` },
      { scale: 1 + success.value * 0.08 },
    ] as ViewStyle["transform"],
  }));
  const avatarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(avatarReveal.value, [0, 0.18, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      { scale: 0.74 + avatarReveal.value * 0.26 },
      { translateY: 8 * (1 - avatarReveal.value) - 2 * success.value },
    ] as ViewStyle["transform"],
  }));
  const avatarAuraStyle = useAnimatedStyle(() => ({
    opacity: interpolate(avatarReveal.value, [0, 0.4, 1], [0, 0.9, 0.58], Extrapolation.CLAMP),
    transform: [{ scale: 0.68 + avatarReveal.value * 0.42 }] as ViewStyle["transform"],
  }));
  const confirmationRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(success.value, [0, 0.35, 1], [0, 0.85, 0.34], Extrapolation.CLAMP),
    transform: [{ scale: 0.62 + success.value * 0.62 }] as ViewStyle["transform"],
  }));

  const avatarSize = size * 0.35;

  return (
    <View pointerEvents="none" style={[styles.root, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.halo,
          { width: size * 0.54, height: size * 0.54, borderRadius: size },
          haloStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.confirmationRing,
          {
            width: size * 0.66,
            height: size * 0.66,
            borderRadius: size,
            left: size * 0.17,
            top: size * 0.16,
          },
          confirmationRingStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.orbit,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size,
            left: size * 0.14,
            top: size * 0.07,
          },
          orbitStyle,
        ]}
      >
        <View style={styles.goldDot} />
        <View style={styles.tealDot} />
        <View style={styles.violetDot} />
      </Animated.View>
      <Animated.View style={[styles.imageFrame, { width: size, height: size }, imageStyle]}>
        <Image source={COMPLETION_PORTAL} resizeMode="cover" style={{ width: size, height: size }} />
      </Animated.View>
      {avatarUri ? (
        <>
          <Animated.View
            style={[
              styles.avatarAura,
              {
                width: avatarSize * 1.18,
                height: avatarSize * 1.18,
                borderRadius: avatarSize,
                left: (size - avatarSize * 1.18) / 2,
                top: size * 0.326,
              },
              avatarAuraStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.avatarFrame,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                left: (size - avatarSize) / 2,
                top: size * 0.355,
              },
              avatarStyle,
            ]}
          >
            <Image source={{ uri: avatarUri }} resizeMode="cover" style={styles.avatar} />
            <View style={[styles.avatarInnerRim, { borderRadius: avatarSize / 2 }]} />
          </Animated.View>
        </>
      ) : null}
      {celebrating && !reduceMotion
        ? BURST_SPARKS.map((item, index) => (
          <BurstSpark key={index} item={item} progress={burst} size={size} />
        ))
        : null}
      <View style={styles.bottomFade} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  imageFrame: {
    borderRadius: 28,
    overflow: "hidden",
    zIndex: 1,
  },
  halo: {
    position: "absolute",
    backgroundColor: "#F8D77A",
    shadowColor: "#F8D77A",
    shadowOpacity: 0.72,
    shadowRadius: 38,
    shadowOffset: { width: 0, height: 0 },
  },
  confirmationRing: {
    position: "absolute",
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,241,187,0.88)",
    shadowColor: "#FFE9A5",
    shadowOpacity: 0.75,
    shadowRadius: 14,
  },
  orbit: {
    position: "absolute",
    zIndex: 4,
    borderWidth: 1,
    borderColor: "rgba(255,226,150,0.58)",
  },
  goldDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    top: -4,
    left: "50%",
    backgroundColor: "#FFE6A0",
    shadowColor: "#FFE6A0",
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  tealDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    right: 6,
    bottom: 22,
    backgroundColor: "#8DDAD7",
    shadowColor: "#8DDAD7",
    shadowOpacity: 1,
    shadowRadius: 7,
  },
  violetDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    left: 7,
    bottom: 38,
    backgroundColor: "#DAB8FF",
    shadowColor: "#DAB8FF",
    shadowOpacity: 1,
    shadowRadius: 7,
  },
  avatarFrame: {
    position: "absolute",
    zIndex: 3,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,238,178,0.96)",
    backgroundColor: "#EEE5D8",
    shadowColor: "#FFF0B8",
    shadowOpacity: 0.84,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 3 },
    elevation: 12,
  },
  avatarAura: {
    position: "absolute",
    zIndex: 2,
    backgroundColor: "rgba(255,224,137,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,242,198,0.76)",
    shadowColor: "#FFE39A",
    shadowOpacity: 0.92,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  avatar: { width: "100%", height: "100%" },
  avatarInnerRim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
  },
  spark: {
    position: "absolute",
    left: "50%",
    top: "49%",
    zIndex: 6,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 7,
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
    zIndex: 5,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: "rgba(250,244,237,0.12)",
  },
});
