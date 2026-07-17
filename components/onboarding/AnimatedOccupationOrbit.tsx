import { useEffect } from "react";
import { ImageSourcePropType, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";

const COMPOSITION = {
  width: 1254,
  height: 1120,
};

type OccupationLayerKey =
  | "soft-glow"
  | "gold-orbit-line"
  | "gold-beads"
  | "quill-pen"
  | "camera-lens"
  | "laptop"
  | "compass"
  | "plant"
  | "central-sculpture"
  | "sparkles";

type LayerConfig = {
  key: OccupationLayerKey;
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
  blurRadius?: number;
  shimmer?: boolean;
};

const LAYERS: LayerConfig[] = [
  {
    key: "soft-glow",
    source: require("../../assets/images/onboarding/occupation-layers/soft-glow.optimized.png"),
    x: 58,
    y: 76,
    width: 1128,
    height: 980,
    delay: 0,
    duration: 7600,
    floatX: 0,
    floatY: 1.4,
    scale: 0.012,
    opacity: 0.3,
    blurRadius: 0.7,
  },
  {
    key: "gold-orbit-line",
    source: require("../../assets/images/onboarding/occupation-layers/gold-orbit-line.optimized.png"),
    x: 46,
    y: 178,
    width: 1168,
    height: 736,
    delay: 120,
    duration: 8200,
    floatX: 0,
    floatY: 1,
    scale: 0.002,
    opacity: 0.84,
  },
  {
    key: "gold-beads",
    source: require("../../assets/images/onboarding/occupation-layers/gold-beads.optimized.png"),
    x: 150,
    y: 92,
    width: 1024,
    height: 958,
    delay: 520,
    duration: 7200,
    floatX: 1.2,
    floatY: -1.6,
    scale: 0.004,
    opacity: 0.95,
    shimmer: true,
  },
  {
    key: "quill-pen",
    source: require("../../assets/images/onboarding/occupation-layers/quill-pen.optimized.png"),
    x: 214,
    y: 54,
    width: 318,
    height: 590,
    delay: 260,
    duration: 6600,
    floatX: -1.8,
    floatY: -2.4,
    scale: 0.006,
    opacity: 1,
  },
  {
    key: "camera-lens",
    source: require("../../assets/images/onboarding/occupation-layers/camera-lens.optimized.png"),
    x: 812,
    y: 170,
    width: 338,
    height: 424,
    delay: 340,
    duration: 6400,
    floatX: 2.2,
    floatY: -1.7,
    scale: 0.006,
    opacity: 1,
  },
  {
    key: "laptop",
    source: require("../../assets/images/onboarding/occupation-layers/laptop.optimized.png"),
    x: 892,
    y: 520,
    width: 330,
    height: 312,
    delay: 430,
    duration: 7000,
    floatX: 2,
    floatY: 1.8,
    scale: 0.005,
    opacity: 1,
  },
  {
    key: "compass",
    source: require("../../assets/images/onboarding/occupation-layers/compass.optimized.png"),
    x: 102,
    y: 540,
    width: 250,
    height: 438,
    delay: 500,
    duration: 7100,
    floatX: -2.1,
    floatY: 1.6,
    scale: 0.005,
    opacity: 0.98,
  },
  {
    key: "plant",
    source: require("../../assets/images/onboarding/occupation-layers/plant.optimized.png"),
    x: 492,
    y: 850,
    width: 288,
    height: 344,
    delay: 620,
    duration: 6800,
    floatX: 0.6,
    floatY: 2.2,
    scale: 0.007,
    opacity: 1,
  },
  {
    key: "central-sculpture",
    source: require("../../assets/images/onboarding/occupation-layers/central-sculpture.optimized.png"),
    x: 326,
    y: 292,
    width: 620,
    height: 614,
    delay: 180,
    duration: 6000,
    floatX: 0,
    floatY: -1.4,
    scale: 0.006,
    opacity: 1,
  },
  {
    key: "sparkles",
    source: require("../../assets/images/onboarding/occupation-layers/sparkles.optimized.png"),
    x: 82,
    y: 112,
    width: 1088,
    height: 980,
    delay: 740,
    duration: 4600,
    floatX: 0,
    floatY: -1.2,
    scale: 0.008,
    opacity: 0.82,
    shimmer: true,
  },
];

type AnimatedOccupationOrbitProps = {
  size?: number;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  selected?: boolean;
};

type OccupationLayerProps = {
  layer: LayerConfig;
  scale: number;
  animated: boolean;
  imageStyle?: StyleProp<ImageStyle>;
};

function OccupationLayer({ layer, scale, animated, imageStyle }: OccupationLayerProps) {
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
        duration: 640,
        easing: Easing.out(Easing.cubic),
      }),
    );

    drift.value = withDelay(
      layer.delay + 720,
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

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entrance.value * (layer.opacity - drift.value * (layer.shimmer ? 0.28 : 0.02)),
    transform: [
      { translateX: (1 - entrance.value) * layer.floatX * -1.8 + drift.value * layer.floatX },
      { translateY: (1 - entrance.value) * 10 + drift.value * layer.floatY },
      { scale: 0.982 + entrance.value * 0.018 + drift.value * layer.scale },
    ] as const,
  }));

  return (
    <Animated.Image
      source={layer.source}
      resizeMode="contain"
      blurRadius={layer.blurRadius}
      style={[
        styles.layer,
        {
          left: layer.x * scale,
          top: layer.y * scale,
          width: layer.width * scale,
          height: layer.height * scale,
        },
        animatedStyle,
        imageStyle as any,
      ]}
    />
  );
}

export function AnimatedOccupationOrbit({
  size = 280,
  animated = true,
  decorative = true,
  accessibilityLabel = "Occupation illustration",
  style,
  imageStyle,
  selected = false,
}: AnimatedOccupationOrbitProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animated && !reduceMotion;
  const scale = size / COMPOSITION.width;
  const height = COMPOSITION.height * scale;
  const aura = useSharedValue(shouldAnimate ? 0 : 1);
  const pulse = useSharedValue(shouldAnimate ? 0 : 1);

  useEffect(() => {
    if (!shouldAnimate) {
      aura.value = 1;
      pulse.value = 0;
      return;
    }

    aura.value = withDelay(
      280,
      withRepeat(
        withTiming(1, {
          duration: 6200,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        true,
      ),
    );

    pulse.value = withDelay(
      900,
      withRepeat(
        withTiming(1, {
          duration: 8600,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [aura, pulse, shouldAnimate]);

  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + aura.value * 0.1,
    transform: [{ scale: 0.86 + aura.value * 0.1 }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulse.value) * 0.12,
    transform: [{ scale: 0.72 + pulse.value * 0.58 }],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[styles.root, { width: size, height, transform: [{ scale: selected ? 1.025 : 1 }] }, style]}
    >
      <Animated.View
        style={[
          styles.aura,
          {
            width: size * 0.76,
            height: size * 0.76,
            borderRadius: size * 0.38,
          },
          auraStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.pulse,
          {
            width: size * 0.84,
            height: size * 0.84,
            borderRadius: size * 0.42,
          },
          pulseStyle,
        ]}
      />
      {LAYERS.map((layer) => (
        <OccupationLayer key={layer.key} layer={layer} scale={scale} animated={shouldAnimate} imageStyle={imageStyle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  aura: {
    position: "absolute",
    backgroundColor: "rgba(246, 197, 94, 0.10)",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  },
  pulse: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(246, 197, 94, 0.24)",
    backgroundColor: "rgba(139, 92, 255, 0.025)",
  },
  layer: {
    position: "absolute",
  },
});
