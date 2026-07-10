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
  x: 61,
  y: 112,
  width: 1143,
  height: 1031,
};

type AboutLayerKey =
  | "soft-glow"
  | "gold-orbit-line"
  | "left-teal-profile"
  | "back-gold-profile"
  | "right-purple-profile"
  | "center-person"
  | "segmented-arc"
  | "sparkles";

type LayerConfig = {
  key: AboutLayerKey;
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
    source: require("../../assets/images/onboarding/about-layers/soft-glow.png"),
    x: 214,
    y: 146,
    width: 825,
    height: 1010,
    delay: 0,
    duration: 6800,
    floatX: 0,
    floatY: 1.2,
    scale: 0.012,
    opacity: 0.24,
    blurRadius: 0.8,
  },
  {
    key: "gold-orbit-line",
    source: require("../../assets/images/onboarding/about-layers/gold-orbit-line.png"),
    x: 61,
    y: 589,
    width: 1143,
    height: 438,
    delay: 220,
    duration: 7200,
    floatX: 0,
    floatY: 1.2,
    scale: 0.002,
    opacity: 0.88,
  },
  {
    key: "left-teal-profile",
    source: require("../../assets/images/onboarding/about-layers/left-teal-profile.png"),
    x: 252,
    y: 218,
    width: 397,
    height: 797,
    delay: 280,
    duration: 6200,
    floatX: -2.4,
    floatY: 1.2,
    scale: 0.004,
    opacity: 0.92,
    blurRadius: 0.45,
  },
  {
    key: "back-gold-profile",
    source: require("../../assets/images/onboarding/about-layers/back-gold-profile.png"),
    x: 281,
    y: 135,
    width: 691,
    height: 1008,
    delay: 180,
    duration: 6600,
    floatX: 0.8,
    floatY: -1.4,
    scale: 0.005,
    opacity: 0.82,
    blurRadius: 0.35,
  },
  {
    key: "right-purple-profile",
    source: require("../../assets/images/onboarding/about-layers/right-purple-profile.png"),
    x: 531,
    y: 225,
    width: 389,
    height: 749,
    delay: 340,
    duration: 6400,
    floatX: 2.2,
    floatY: 1.4,
    scale: 0.004,
    opacity: 0.9,
    blurRadius: 0.45,
  },
  {
    key: "center-person",
    source: require("../../assets/images/onboarding/about-layers/center-person.png"),
    x: 312,
    y: 153,
    width: 613,
    height: 907,
    delay: 120,
    duration: 5600,
    floatX: 0,
    floatY: -1.2,
    scale: 0.006,
    opacity: 1,
  },
  {
    key: "segmented-arc",
    source: require("../../assets/images/onboarding/about-layers/segmented-arc.png"),
    x: 119,
    y: 112,
    width: 980,
    height: 704,
    delay: 420,
    duration: 7600,
    floatX: 0,
    floatY: -1.6,
    scale: 0.003,
    opacity: 0.98,
  },
  {
    key: "sparkles",
    source: require("../../assets/images/onboarding/about-layers/sparkles.png"),
    x: 166,
    y: 195,
    width: 898,
    height: 881,
    delay: 620,
    duration: 4600,
    floatX: 0,
    floatY: -1.4,
    scale: 0.007,
    opacity: 0.82,
    shimmer: true,
  },
];

type AnimatedAboutIdentityProps = {
  size?: number;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

type AboutLayerProps = {
  layer: LayerConfig;
  scale: number;
  animated: boolean;
  imageStyle?: StyleProp<ImageStyle>;
};

function AboutLayer({ layer, scale, animated, imageStyle }: AboutLayerProps) {
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
        duration: 620,
        easing: Easing.out(Easing.cubic),
      }),
    );

    drift.value = withDelay(
      layer.delay + 680,
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
    opacity: entrance.value * (layer.opacity - drift.value * (layer.shimmer ? 0.34 : 0.025)),
    transform: [
      { translateX: (1 - entrance.value) * layer.floatX * -1.6 + drift.value * layer.floatX },
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

export function AnimatedAboutIdentity({
  size = 280,
  animated = true,
  decorative = true,
  accessibilityLabel = "Profile details illustration",
  style,
  imageStyle,
}: AnimatedAboutIdentityProps) {
  const scale = size / COMPOSITION.width;
  const height = COMPOSITION.height * scale;
  const aura = useSharedValue(animated ? 0 : 1);
  const pulse = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      aura.value = 1;
      pulse.value = 0;
      return;
    }

    aura.value = withDelay(
      260,
      withRepeat(
        withTiming(1, {
          duration: 5600,
          easing: Easing.inOut(Easing.cubic),
        }),
        -1,
        true,
      ),
    );

    pulse.value = withDelay(
      760,
      withRepeat(
        withTiming(1, {
          duration: 7400,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [animated, aura, pulse]);

  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + aura.value * 0.08,
    transform: [{ scale: 0.9 + aura.value * 0.08 }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulse.value) * 0.12,
    transform: [{ scale: 0.7 + pulse.value * 0.56 }],
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
        <AboutLayer key={layer.key} layer={layer} scale={scale} animated={animated} imageStyle={imageStyle} />
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
    backgroundColor: "rgba(139, 92, 255, 0.10)",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  },
  pulse: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(246, 197, 94, 0.26)",
    backgroundColor: "rgba(19, 168, 168, 0.025)",
  },
  layer: {
    position: "absolute",
  },
});
