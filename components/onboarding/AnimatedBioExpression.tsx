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
  x: 60,
  y: 55,
  width: 1145,
  height: 1143,
};

type BioLayerKey =
  | "ambient-soft-glow"
  | "bust-base"
  | "inner-gold-glow"
  | "teal-ribbon"
  | "gold-orbit-lines"
  | "gold-particles"
  | "purple-leaves"
  | "foreground-sparkles";

type LayerConfig = {
  key: BioLayerKey;
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
    key: "ambient-soft-glow",
    source: require("../../assets/images/onboarding/bio-layers/ambient-soft-glow.optimized.png"),
    x: 179,
    y: 347,
    width: 954,
    height: 698,
    delay: 0,
    duration: 7800,
    floatX: 0,
    floatY: 1.2,
    scale: 0.012,
    opacity: 0.28,
    blurRadius: 0.7,
  },
  {
    key: "bust-base",
    source: require("../../assets/images/onboarding/bio-layers/bust-base.optimized.png"),
    x: 63,
    y: 90,
    width: 496,
    height: 1108,
    delay: 120,
    duration: 6400,
    floatX: -1,
    floatY: -1.4,
    scale: 0.006,
    opacity: 1,
  },
  {
    key: "inner-gold-glow",
    source: require("../../assets/images/onboarding/bio-layers/inner-gold-glow.optimized.png"),
    x: 199,
    y: 515,
    width: 354,
    height: 475,
    delay: 360,
    duration: 4200,
    floatX: 0.3,
    floatY: -1,
    scale: 0.012,
    opacity: 0.88,
    shimmer: true,
  },
  {
    key: "teal-ribbon",
    source: require("../../assets/images/onboarding/bio-layers/teal-ribbon.optimized.png"),
    x: 337,
    y: 176,
    width: 844,
    height: 750,
    delay: 220,
    duration: 7200,
    floatX: 2.2,
    floatY: -1.2,
    scale: 0.005,
    opacity: 0.92,
    blurRadius: 0.25,
  },
  {
    key: "gold-orbit-lines",
    source: require("../../assets/images/onboarding/bio-layers/gold-orbit-lines.optimized.png"),
    x: 60,
    y: 158,
    width: 1145,
    height: 929,
    delay: 300,
    duration: 8200,
    floatX: 0,
    floatY: 1,
    scale: 0.002,
    opacity: 0.86,
  },
  {
    key: "gold-particles",
    source: require("../../assets/images/onboarding/bio-layers/gold-particles.optimized.png"),
    x: 168,
    y: 64,
    width: 1063,
    height: 979,
    delay: 620,
    duration: 5200,
    floatX: 1.4,
    floatY: -1.8,
    scale: 0.006,
    opacity: 0.78,
    shimmer: true,
  },
  {
    key: "purple-leaves",
    source: require("../../assets/images/onboarding/bio-layers/purple-leaves.optimized.png"),
    x: 380,
    y: 254,
    width: 620,
    height: 742,
    delay: 460,
    duration: 6800,
    floatX: 1.6,
    floatY: 1.6,
    scale: 0.006,
    opacity: 0.88,
  },
  {
    key: "foreground-sparkles",
    source: require("../../assets/images/onboarding/bio-layers/foreground-sparkles.optimized.png"),
    x: 162,
    y: 56,
    width: 891,
    height: 1024,
    delay: 760,
    duration: 4800,
    floatX: 0,
    floatY: -1.5,
    scale: 0.008,
    opacity: 0.72,
    shimmer: true,
  },
];

type AnimatedBioExpressionProps = {
  size?: number;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  progress?: number;
};

type BioLayerProps = {
  layer: LayerConfig;
  scale: number;
  animated: boolean;
  imageStyle?: StyleProp<ImageStyle>;
};

function BioLayer({ layer, scale, animated, imageStyle }: BioLayerProps) {
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
      layer.delay + 700,
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
    opacity: entrance.value * (layer.opacity - drift.value * (layer.shimmer ? 0.3 : 0.02)),
    transform: [
      { translateX: (1 - entrance.value) * layer.floatX * -1.7 + drift.value * layer.floatX },
      { translateY: (1 - entrance.value) * 9 + drift.value * layer.floatY },
      { scale: 0.984 + entrance.value * 0.016 + drift.value * layer.scale },
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

export function AnimatedBioExpression({
  size = 280,
  animated = true,
  decorative = true,
  accessibilityLabel = "Bio illustration",
  style,
  imageStyle,
  progress = 0,
}: AnimatedBioExpressionProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animated && !reduceMotion;
  const normalizedProgress = Math.max(0, Math.min(progress, 1));
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
      880,
      withRepeat(
        withTiming(1, {
          duration: 7800,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [aura, pulse, shouldAnimate]);

  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.06 + aura.value * 0.09,
    transform: [{ scale: 0.86 + aura.value * 0.12 }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulse.value) * 0.11,
    transform: [{ scale: 0.7 + pulse.value * 0.58 }],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[styles.root, { width: size, height, transform: [{ scale: 1 + normalizedProgress * 0.025 }] }, style]}
    >
      <Animated.View
        style={[
          styles.aura,
          {
            width: size * 0.78,
            height: size * 0.78,
            borderRadius: size * 0.39,
          },
          auraStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.pulse,
          {
            width: size * 0.86,
            height: size * 0.86,
            borderRadius: size * 0.43,
          },
          pulseStyle,
        ]}
      />
      {LAYERS.map((layer) => (
        <BioLayer key={layer.key} layer={layer} scale={scale} animated={shouldAnimate} imageStyle={imageStyle} />
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
