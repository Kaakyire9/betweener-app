import GiftArtwork from "@/components/gifts/GiftArtwork";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getGiftMeta } from "@/lib/gifts/gift-meta";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type GiftHeroProps = {
  giftType?: string | null;
  visible: boolean;
};

export default function GiftHero({ giftType, visible }: GiftHeroProps) {
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? "light") === "dark";
  const meta = getGiftMeta(giftType);

  const heroProgress = useSharedValue(0);
  const glowProgress = useSharedValue(0);
  const sparkleA = useSharedValue(0);
  const sparkleB = useSharedValue(0);
  const sparkleC = useSharedValue(0);
  const ambientFloat = useSharedValue(0);
  const ambientGlow = useSharedValue(0);
  const ambientOrbit = useSharedValue(0);

  useEffect(() => {
    const values = [
      heroProgress,
      glowProgress,
      sparkleA,
      sparkleB,
      sparkleC,
      ambientFloat,
      ambientGlow,
      ambientOrbit,
    ];

    values.forEach((value) => {
      cancelAnimation(value);
      value.value = 0;
    });

    if (!visible) {
      return;
    }

    heroProgress.value = withDelay(
      260,
      withTiming(1, {
        duration: 380,
        easing: Easing.out(Easing.cubic),
      }),
    );
    glowProgress.value = withDelay(
      280,
      withTiming(1, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
      }),
    );
    sparkleA.value = withDelay(
      520,
      withTiming(1, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
      }),
    );
    sparkleB.value = withDelay(
      620,
      withTiming(1, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
      }),
    );
    sparkleC.value = withDelay(
      700,
      withTiming(1, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
      }),
    );

    ambientFloat.value = withDelay(
      820,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: meta.motion.floatDuration,
            easing: Easing.inOut(Easing.cubic),
          }),
          withTiming(0, {
            duration: meta.motion.floatDuration,
            easing: Easing.inOut(Easing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );
    ambientGlow.value = withDelay(
      860,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: meta.motion.glowDuration,
            easing: Easing.inOut(Easing.cubic),
          }),
          withTiming(0, {
            duration: meta.motion.glowDuration,
            easing: Easing.inOut(Easing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );
    ambientOrbit.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: meta.motion.orbitDuration,
            easing: Easing.inOut(Easing.cubic),
          }),
          withTiming(0, {
            duration: meta.motion.orbitDuration,
            easing: Easing.inOut(Easing.cubic),
          }),
        ),
        -1,
        false,
      ),
    );
  }, [
    ambientFloat,
    ambientGlow,
    ambientOrbit,
    glowProgress,
    heroProgress,
    meta.motion.floatDuration,
    meta.motion.floatOffset,
    meta.motion.glowDuration,
    meta.motion.orbitDuration,
    sparkleA,
    sparkleB,
    sparkleC,
    visible,
  ]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroProgress.value,
    transform: [
      {
        translateY:
          (1 - heroProgress.value) * 8 - ambientFloat.value * meta.motion.floatOffset,
      },
      { scale: 0.92 + heroProgress.value * 0.08 },
    ] as const,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity:
      glowProgress.value * (isDark ? 0.92 : 0.72) * (0.9 + ambientGlow.value * 0.16),
    transform: [{ scale: 0.82 + glowProgress.value * 0.26 + ambientGlow.value * 0.06 }] as const,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.995 + ambientOrbit.value * 0.018 }] as const,
  }));

  const sparkleStyleA = useAnimatedStyle(() => ({
    opacity: interpolate(sparkleA.value, [0, 0.18, 0.78, 1], [0, 1, 0.9, 0]),
    transform: [
      { translateY: interpolate(sparkleA.value, [0, 1], [8, -10]) },
      { scale: interpolate(sparkleA.value, [0, 0.2, 0.8, 1], [0.72, 1.04, 0.98, 0.88]) },
    ] as const,
  }));

  const sparkleStyleB = useAnimatedStyle(() => ({
    opacity: interpolate(sparkleB.value, [0, 0.18, 0.78, 1], [0, 0.92, 0.85, 0]),
    transform: [
      { translateY: interpolate(sparkleB.value, [0, 1], [10, -12]) },
      { scale: interpolate(sparkleB.value, [0, 0.2, 0.8, 1], [0.68, 1.08, 1, 0.9]) },
    ] as const,
  }));

  const sparkleStyleC = useAnimatedStyle(() => ({
    opacity: interpolate(sparkleC.value, [0, 0.18, 0.78, 1], [0, 0.9, 0.84, 0]),
    transform: [
      { translateY: interpolate(sparkleC.value, [0, 1], [6, -9]) },
      { scale: interpolate(sparkleC.value, [0, 0.2, 0.8, 1], [0.7, 1, 0.96, 0.86]) },
    ] as const,
  }));

  return (
    <Animated.View style={[styles.wrap, heroStyle]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.aura,
          {
            width: meta.hero.auraSize,
            height: meta.hero.auraSize,
            borderRadius: meta.hero.auraSize / 2,
            backgroundColor: meta.glow,
          },
          glowStyle,
        ]}
      />
      <Animated.View pointerEvents="none" style={[styles.haloWrap, haloStyle]}>
        <LinearGradient
          colors={
            isDark
              ? ["rgba(255,255,255,0.07)", "rgba(255,255,255,0.02)"]
              : ["rgba(255,255,255,0.84)", "rgba(255,255,255,0.18)"]
          }
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[
            styles.halo,
            {
              width: meta.hero.haloSize,
              height: meta.hero.haloSize,
              borderRadius: meta.hero.haloSize / 2,
              borderColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.5)",
            },
          ]}
        >
          <View
            style={[
              styles.pedestal,
              {
                width: meta.hero.pedestalSize,
                height: meta.hero.pedestalSize,
                borderRadius: meta.hero.pedestalSize / 2,
                backgroundColor: isDark
                  ? "rgba(5, 10, 14, 0.52)"
                  : "rgba(16, 24, 40, 0.09)",
              },
            ]}
          >
            <GiftArtwork
              giftType={giftType}
              size={meta.hero.artworkSize}
              animate={false}
            />
          </View>
        </LinearGradient>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.sparkleA, sparkleStyleA]}>
        <MaterialCommunityIcons name="star-four-points" size={18} color={meta.accent} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.sparkleB, sparkleStyleB]}>
        <MaterialCommunityIcons name="star-four-points" size={14} color={meta.accent} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.sparkleC, sparkleStyleC]}>
        <MaterialCommunityIcons name="star-four-points" size={16} color={meta.accent} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  aura: {
    position: "absolute",
    opacity: 0,
  },
  haloWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pedestal: {
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleA: {
    position: "absolute",
    top: 28,
    right: 44,
  },
  sparkleB: {
    position: "absolute",
    top: 54,
    left: 36,
  },
  sparkleC: {
    position: "absolute",
    bottom: 30,
    left: 56,
  },
});
