import { useEffect } from "react";
import { ImageSourcePropType, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const COMPOSITION = {
  x: 183,
  y: 211,
  width: 905,
  height: 806,
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
};

const LAYERS: LayerConfig[] = [
  {
    key: "orbit-lines",
    source: require("../../assets/images/onboarding/lifestyle-layers/orbit-lines.png"),
    x: 360,
    y: 264,
    width: 704,
    height: 753,
    delay: 220,
    duration: 6200,
    floatX: 0,
    floatY: 1.4,
    scale: 0.002,
    opacity: 0.72,
  },
  {
    key: "sparkles",
    source: require("../../assets/images/onboarding/lifestyle-layers/sparkles.png"),
    x: 188,
    y: 327,
    width: 900,
    height: 583,
    delay: 420,
    duration: 4200,
    floatX: 0,
    floatY: -1.2,
    scale: 0.006,
    opacity: 0.76,
  },
  {
    key: "music-note",
    source: require("../../assets/images/onboarding/lifestyle-layers/music-note.png"),
    x: 206,
    y: 332,
    width: 217,
    height: 248,
    delay: 240,
    duration: 5200,
    floatX: -1.4,
    floatY: -3,
    scale: 0.006,
    opacity: 1,
  },
  {
    key: "dumbbell",
    source: require("../../assets/images/onboarding/lifestyle-layers/dumbbell.png"),
    x: 183,
    y: 546,
    width: 294,
    height: 287,
    delay: 300,
    duration: 5600,
    floatX: -2,
    floatY: 2.4,
    scale: 0.004,
    opacity: 1,
  },
  {
    key: "camera",
    source: require("../../assets/images/onboarding/lifestyle-layers/camera.png"),
    x: 513,
    y: 211,
    width: 287,
    height: 219,
    delay: 180,
    duration: 5400,
    floatX: 1.6,
    floatY: -2.6,
    scale: 0.005,
    opacity: 1,
  },
  {
    key: "plane",
    source: require("../../assets/images/onboarding/lifestyle-layers/plane.png"),
    x: 819,
    y: 393,
    width: 255,
    height: 153,
    delay: 340,
    duration: 6000,
    floatX: 3,
    floatY: -1.8,
    scale: 0.004,
    opacity: 1,
  },
  {
    key: "book",
    source: require("../../assets/images/onboarding/lifestyle-layers/book.png"),
    x: 760,
    y: 576,
    width: 320,
    height: 334,
    delay: 280,
    duration: 5800,
    floatX: 1.8,
    floatY: 2.2,
    scale: 0.004,
    opacity: 1,
  },
  {
    key: "food-bowl",
    source: require("../../assets/images/onboarding/lifestyle-layers/food-bowl.png"),
    x: 456,
    y: 790,
    width: 354,
    height: 215,
    delay: 360,
    duration: 5700,
    floatX: -1,
    floatY: 2,
    scale: 0.004,
    opacity: 1,
  },
  {
    key: "heart",
    source: require("../../assets/images/onboarding/lifestyle-layers/heart.png"),
    x: 513,
    y: 538,
    width: 230,
    height: 207,
    delay: 140,
    duration: 4600,
    floatX: 0,
    floatY: -1,
    scale: 0.018,
    opacity: 1,
  },
];

type AnimatedLifestyleOrbitProps = {
  size?: number;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

type OrbitLayerProps = {
  layer: LayerConfig;
  scale: number;
  animated: boolean;
  imageStyle?: StyleProp<ImageStyle>;
};

function OrbitLayer({ layer, scale, animated, imageStyle }: OrbitLayerProps) {
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
        duration: 520,
        easing: Easing.out(Easing.cubic),
      }),
    );

    drift.value = withDelay(
      layer.delay + 520,
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
    opacity: entrance.value * (layer.opacity - drift.value * (layer.key === "sparkles" ? 0.28 : 0.02)),
    transform: [
      { translateX: (1 - entrance.value) * layer.floatX * -1.8 + drift.value * layer.floatX },
      { translateY: (1 - entrance.value) * 9 + drift.value * layer.floatY },
      { scale: 0.986 + entrance.value * 0.014 + drift.value * layer.scale },
    ] as const,
  }));

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

export function AnimatedLifestyleOrbit({
  size = 280,
  animated = true,
  decorative = true,
  accessibilityLabel = "Lifestyle interests illustration",
  style,
  imageStyle,
}: AnimatedLifestyleOrbitProps) {
  const scale = size / COMPOSITION.width;
  const height = COMPOSITION.height * scale;
  const glow = useSharedValue(animated ? 0 : 1);
  const ring = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      glow.value = 1;
      ring.value = 0;
      return;
    }

    glow.value = withDelay(
      260,
      withRepeat(
        withTiming(1, {
          duration: 5200,
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
          duration: 6800,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [animated, glow, ring]);

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + glow.value * 0.08,
    transform: [{ scale: 0.9 + glow.value * 0.08 }],
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.16,
    transform: [{ scale: 0.72 + ring.value * 0.52 }],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[styles.root, { width: size, height }, style]}
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
        <OrbitLayer key={layer.key} layer={layer} scale={scale} animated={animated} imageStyle={imageStyle} />
      ))}
    </View>
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
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 255, 0.24)",
    backgroundColor: "rgba(19, 168, 168, 0.03)",
  },
  layer: {
    position: "absolute",
  },
});
