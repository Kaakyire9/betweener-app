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
  x: 69,
  y: 159,
  width: 1100,
  height: 1004,
};

type IdentityLayerKey =
  | "ambient-glow"
  | "gold-orbit-line"
  | "teal-ribbon"
  | "purple-accent"
  | "profile-card"
  | "avatar-emboss"
  | "signature-stroke"
  | "gold-beads"
  | "sparkles";

type LayerConfig = {
  key: IdentityLayerKey;
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
  reveal?: boolean;
};

const LAYERS: LayerConfig[] = [
  {
    key: "ambient-glow",
    source: require("../../assets/images/onboarding/identity-layers/ambient-glow.optimized.png"),
    x: 168,
    y: 296,
    width: 967,
    height: 789,
    delay: 0,
    duration: 5600,
    floatX: 0,
    floatY: 1,
    scale: 0.01,
    opacity: 0.9,
  },
  {
    key: "gold-orbit-line",
    source: require("../../assets/images/onboarding/identity-layers/gold-orbit-line.optimized.png"),
    x: 69,
    y: 173,
    width: 1100,
    height: 944,
    delay: 180,
    duration: 6400,
    floatX: 0,
    floatY: 1,
    scale: 0.002,
    opacity: 0.72,
  },
  {
    key: "teal-ribbon",
    source: require("../../assets/images/onboarding/identity-layers/teal-ribbon.optimized.png"),
    x: 92,
    y: 330,
    width: 420,
    height: 860,
    delay: 220,
    duration: 6200,
    floatX: -1.6,
    floatY: 2.2,
    scale: 0.006,
    opacity: 0.86,
  },
  {
    key: "purple-accent",
    source: require("../../assets/images/onboarding/identity-layers/purple-accent.optimized.png"),
    x: 615,
    y: 315,
    width: 560,
    height: 582,
    delay: 260,
    duration: 6600,
    floatX: 1.4,
    floatY: -1.8,
    scale: 0.006,
    opacity: 0.78,
  },
  {
    key: "profile-card",
    source: require("../../assets/images/onboarding/identity-layers/profile-card.optimized.png"),
    x: 99,
    y: 225,
    width: 1045,
    height: 803,
    delay: 120,
    duration: 5600,
    floatX: 0,
    floatY: -1.4,
    scale: 0.004,
    opacity: 1,
  },
  {
    key: "avatar-emboss",
    source: require("../../assets/images/onboarding/identity-layers/avatar-emboss.optimized.png"),
    x: 288,
    y: 347,
    width: 350,
    height: 363,
    delay: 360,
    duration: 5200,
    floatX: -0.8,
    floatY: -1.2,
    scale: 0.004,
    opacity: 1,
  },
  {
    key: "signature-stroke",
    source: require("../../assets/images/onboarding/identity-layers/signature-stroke.optimized.png"),
    x: 393,
    y: 585,
    width: 688,
    height: 257,
    delay: 620,
    duration: 5200,
    floatX: 0.8,
    floatY: 0.8,
    scale: 0.003,
    opacity: 1,
    reveal: true,
  },
  {
    key: "gold-beads",
    source: require("../../assets/images/onboarding/identity-layers/gold-beads.optimized.png"),
    x: 507,
    y: 159,
    width: 334,
    height: 894,
    delay: 520,
    duration: 5800,
    floatX: 1.4,
    floatY: -2,
    scale: 0.006,
    opacity: 0.98,
  },
  {
    key: "sparkles",
    source: require("../../assets/images/onboarding/identity-layers/sparkles.optimized.png"),
    x: 167,
    y: 256,
    width: 921,
    height: 722,
    delay: 700,
    duration: 4400,
    floatX: 0,
    floatY: -1.2,
    scale: 0.006,
    opacity: 0.86,
  },
];

type AnimatedIdentityCardProps = {
  size?: number;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  personalized?: boolean;
};

type IdentityLayerProps = {
  layer: LayerConfig;
  scale: number;
  animated: boolean;
  imageStyle?: StyleProp<ImageStyle>;
};

function IdentityLayer({ layer, scale, animated, imageStyle }: IdentityLayerProps) {
  const entrance = useSharedValue(animated ? 0 : 1);
  const drift = useSharedValue(0);
  const reveal = useSharedValue(layer.reveal && animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      entrance.value = 1;
      drift.value = 0;
      reveal.value = 1;
      return;
    }

    entrance.value = withDelay(
      layer.delay,
      withTiming(1, {
        duration: 560,
        easing: Easing.out(Easing.cubic),
      }),
    );

    if (layer.reveal) {
      reveal.value = withDelay(
        layer.delay + 220,
        withTiming(1, {
          duration: 820,
          easing: Easing.out(Easing.cubic),
        }),
      );
    }

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
  }, [animated, drift, entrance, layer.delay, layer.duration, layer.reveal, reveal]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entrance.value * (layer.opacity - drift.value * (layer.key === "sparkles" ? 0.32 : 0.025)),
    transform: [
      { translateX: (1 - entrance.value) * -4 + drift.value * layer.floatX },
      { translateY: (1 - entrance.value) * 10 + drift.value * layer.floatY },
      { scale: 0.986 + entrance.value * 0.014 + drift.value * layer.scale },
    ] as const,
  }));

  const revealStyle = useAnimatedStyle(() => ({
    width: layer.width * scale * reveal.value,
  }));

  const frameStyle = {
    left: (layer.x - COMPOSITION.x) * scale,
    top: (layer.y - COMPOSITION.y) * scale,
    width: layer.width * scale,
    height: layer.height * scale,
  };

  if (layer.reveal) {
    return (
      <Animated.View style={[styles.layerFrame, frameStyle, animatedStyle]}>
        <Animated.View style={[styles.revealMask, revealStyle]}>
          <Animated.Image
            source={layer.source}
            resizeMode="contain"
            style={[styles.revealImage, { width: frameStyle.width, height: frameStyle.height }, imageStyle as any]}
          />
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.Image
      source={layer.source}
      resizeMode="contain"
      style={[styles.layer, frameStyle, animatedStyle, imageStyle as any]}
    />
  );
}

export function AnimatedIdentityCard({
  size = 280,
  animated = true,
  decorative = true,
  accessibilityLabel = "Profile identity card illustration",
  style,
  imageStyle,
  personalized = false,
}: AnimatedIdentityCardProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animated && !reduceMotion;
  const scale = size / COMPOSITION.width;
  const height = COMPOSITION.height * scale;

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[styles.root, { width: size, height, transform: [{ scale: personalized ? 1.025 : 1 }] }, style]}
    >
      {LAYERS.map((layer) => (
        <IdentityLayer key={layer.key} layer={layer} scale={scale} animated={shouldAnimate} imageStyle={imageStyle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  layer: {
    position: "absolute",
  },
  layerFrame: {
    position: "absolute",
  },
  revealMask: {
    height: "100%",
    overflow: "hidden",
  },
  revealImage: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
