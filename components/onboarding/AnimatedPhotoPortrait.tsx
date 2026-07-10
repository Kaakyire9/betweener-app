import { useEffect } from "react";
import { ImageSourcePropType, ImageStyle, StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const COMPOSITION = {
  x: 120,
  y: 66,
  width: 1038,
  height: 1042,
};

type LayerConfig = {
  key: string;
  source: ImageSourcePropType;
  x: number;
  y: number;
  width: number;
  height: number;
  delay: number;
  duration: number;
  floatX: number;
  floatY: number;
  scale: number;
  opacity: number;
  shimmer?: boolean;
};

const LAYERS: LayerConfig[] = [
  {
    key: "ambient-soft-glow",
    source: require("../../assets/images/onboarding/photo-layers/ambient-soft-glow.png"),
    x: 176,
    y: 280,
    width: 922,
    height: 712,
    delay: 0,
    duration: 7400,
    floatX: 0,
    floatY: 1.3,
    scale: 0.012,
    opacity: 0.28,
  },
  {
    key: "mirror-glow",
    source: require("../../assets/images/onboarding/photo-layers/mirror-glow.png"),
    x: 312,
    y: 102,
    width: 600,
    height: 862,
    delay: 140,
    duration: 6200,
    floatX: 0.6,
    floatY: -1.2,
    scale: 0.008,
    opacity: 0.92,
  },
  {
    key: "gold-orbit-lines",
    source: require("../../assets/images/onboarding/photo-layers/gold-orbit-lines.png"),
    x: 120,
    y: 198,
    width: 1038,
    height: 736,
    delay: 240,
    duration: 8200,
    floatX: 0,
    floatY: 1.1,
    scale: 0.002,
    opacity: 0.84,
  },
  {
    key: "teal-ribbon",
    source: require("../../assets/images/onboarding/photo-layers/teal-ribbon.png"),
    x: 356,
    y: 232,
    width: 716,
    height: 676,
    delay: 320,
    duration: 7000,
    floatX: 1.9,
    floatY: -1.6,
    scale: 0.005,
    opacity: 0.9,
  },
  {
    key: "mirror-bust",
    source: require("../../assets/images/onboarding/photo-layers/mirror-bust.png"),
    x: 276,
    y: 142,
    width: 658,
    height: 930,
    delay: 120,
    duration: 6000,
    floatX: -0.6,
    floatY: -1.1,
    scale: 0.006,
    opacity: 1,
  },
  {
    key: "gold-particles",
    source: require("../../assets/images/onboarding/photo-layers/gold-particles.png"),
    x: 214,
    y: 104,
    width: 876,
    height: 920,
    delay: 560,
    duration: 5200,
    floatX: 1.3,
    floatY: -1.7,
    scale: 0.007,
    opacity: 0.78,
    shimmer: true,
  },
  {
    key: "foreground-sparkles",
    source: require("../../assets/images/onboarding/photo-layers/foreground-sparkles.png"),
    x: 198,
    y: 84,
    width: 908,
    height: 948,
    delay: 720,
    duration: 4400,
    floatX: 0,
    floatY: -1.4,
    scale: 0.008,
    opacity: 0.74,
    shimmer: true,
  },
];

type AnimatedPhotoPortraitProps = {
  size?: number;
  animated?: boolean;
  decorative?: boolean;
  settled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

type PhotoLayerProps = {
  layer: LayerConfig;
  scale: number;
  animated: boolean;
  settled: boolean;
  imageStyle?: StyleProp<ImageStyle>;
};

function PhotoLayer({ layer, scale, animated, settled, imageStyle }: PhotoLayerProps) {
  const entrance = useSharedValue(animated ? 0 : 1);
  const drift = useSharedValue(0);

  useEffect(() => {
    if (!animated) {
      entrance.value = 1;
      drift.value = 0;
      return;
    }

    entrance.value = withDelay(
      layer.delay,
      withTiming(1, {
        duration: 560,
        easing: Easing.out(Easing.cubic),
      }),
    );

    drift.value = withDelay(
      layer.delay + 620,
      withRepeat(
        withTiming(1, {
          duration: layer.duration,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        true,
      ),
    );
  }, [animated, drift, entrance, layer.delay, layer.duration]);

  const animatedStyle = useAnimatedStyle(() => {
    const motionMultiplier = settled ? 0.32 : 1;
    const baseOpacity = settled ? layer.opacity * 0.68 : layer.opacity;
    const shimmerDrop = layer.shimmer ? 0.28 : 0.025;
    return {
      opacity: entrance.value * (baseOpacity - drift.value * shimmerDrop * motionMultiplier),
      transform: [
        { translateX: (1 - entrance.value) * layer.floatX * -1.7 + drift.value * layer.floatX * motionMultiplier },
        { translateY: (1 - entrance.value) * 10 + drift.value * layer.floatY * motionMultiplier },
        { scale: 0.985 + entrance.value * 0.015 + drift.value * layer.scale * motionMultiplier },
      ] as const,
    };
  });

  return (
    <Animated.Image
      source={layer.source}
      resizeMode="contain"
      style={[
        styles.layer,
        {
          left: (layer.x - COMPOSITION.x) * scale,
          top: (layer.y - COMPOSITION.y) * scale,
          width: layer.width * scale,
          height: layer.height * scale,
        },
        animatedStyle,
        imageStyle as any,
      ]}
    />
  );
}

export function AnimatedPhotoPortrait({
  size = 224,
  animated = true,
  decorative = true,
  settled = false,
  accessibilityLabel = "Profile photo illustration",
  style,
  imageStyle,
}: AnimatedPhotoPortraitProps) {
  const scale = size / COMPOSITION.width;
  const height = COMPOSITION.height * scale;
  const reveal = useSharedValue(animated ? 0 : 1);
  const glow = useSharedValue(animated ? 0 : 1);
  const ring = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      reveal.value = 1;
      glow.value = 1;
      ring.value = 0;
      return;
    }

    reveal.value = withTiming(1, {
      duration: 720,
      easing: Easing.out(Easing.cubic),
    });

    glow.value = withDelay(
      220,
      withRepeat(
        withTiming(1, {
          duration: settled ? 6200 : 5200,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        true,
      ),
    );

    ring.value = withDelay(
      680,
      withRepeat(
        withTiming(1, {
          duration: settled ? 7600 : 6600,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [animated, glow, reveal, ring, settled]);

  const revealAnimatedStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: (1 - reveal.value) * 16 },
      { scale: 0.92 + reveal.value * 0.08 },
    ] as ViewStyle["transform"],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: settled ? 0.06 + glow.value * 0.025 : 0.12 + glow.value * 0.08,
    transform: [
      { scale: settled ? 0.96 + glow.value * 0.025 : 0.9 + glow.value * 0.08 },
    ] as ViewStyle["transform"],
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * (settled ? 0.06 : 0.18),
    transform: [{ scale: 0.74 + ring.value * 0.5 }] as ViewStyle["transform"],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[styles.root, { width: size, height }, revealAnimatedStyle, style]}
    >
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size * 0.36,
          },
          glowAnimatedStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.82,
            height: size * 0.82,
            borderRadius: size * 0.41,
          },
          ringAnimatedStyle,
        ]}
      />
      {LAYERS.map((layer) => (
        <PhotoLayer
          key={layer.key}
          layer={layer}
          scale={scale}
          animated={animated}
          settled={settled}
          imageStyle={imageStyle}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(19, 168, 168, 0.14)",
    shadowColor: "#8B5CFF",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(244, 235, 221, 0.18)",
    backgroundColor: "rgba(139, 92, 255, 0.03)",
  },
  layer: {
    position: "absolute",
  },
});
