import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

type Props = {
  size?: number;
  animated?: boolean;
  decorative?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

const COMPOSITION_SIZE = 1158;
const FINAL_COMPOSITE = require("../../assets/images/onboarding/ghana-place-clean/base-composite-oath-tight.png");
const HOTSPOT_CENTER_X = 650 / COMPOSITION_SIZE;
const HOTSPOT_CENTER_Y = 603 / COMPOSITION_SIZE;
const HOTSPOT_WINDOW_SIZE = 0.125;

export function AnimatedGhanaPlaceIllustration({
  size = 220,
  animated = true,
  decorative = true,
  accessibilityLabel = "Choose your place within Ghana illustration",
  style,
  imageStyle,
}: Props) {
  const entrance = useRef(new Animated.Value(animated ? 0 : 1)).current;
  const heartbeat = useRef(new Animated.Value(animated ? 0.14 : 0.3)).current;

  useEffect(() => {
    if (!animated) {
      entrance.setValue(1);
      heartbeat.setValue(0.3);
      return;
    }

    entrance.setValue(0);
    const intro = Animated.timing(entrance, {
      toValue: 1,
      duration: 820,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    intro.start();

    return () => {
      intro.stop();
    };
  }, [animated, entrance, heartbeat]);

  useEffect(() => {
    if (!animated) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(heartbeat, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(heartbeat, {
          toValue: 0.18,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [animated, heartbeat]);

  const hotspotWindow = size * HOTSPOT_WINDOW_SIZE;
  const hotspotLeft = size * HOTSPOT_CENTER_X - hotspotWindow / 2;
  const hotspotTop = size * HOTSPOT_CENTER_Y - hotspotWindow / 2;

  const compositeStyle = useMemo(
    () =>
      ({
        opacity: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        }),
        transform: [
          {
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
          {
            scale: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [0.94, 1],
            }),
          },
        ],
      }) as any,
    [entrance],
  );

  const hotspotAuraStyle = useMemo(
    () => ({
      opacity: heartbeat.interpolate({
        inputRange: [0, 1],
        outputRange: [0.08, 0.28],
      }),
      transform: [
        {
          scale: heartbeat.interpolate({
            inputRange: [0, 1],
            outputRange: [0.92, 1.18],
          }),
        },
      ],
    }),
    [heartbeat],
  );

  const hotspotRingStyle = useMemo(
    () => ({
      opacity: heartbeat.interpolate({
        inputRange: [0, 1],
        outputRange: [0.36, 0.9],
      }),
      transform: [
        {
          scale: heartbeat.interpolate({
            inputRange: [0, 1],
            outputRange: [0.84, 1.18],
          }),
        },
      ],
    }),
    [heartbeat],
  );

  const hotspotCoreStyle = useMemo(
    () => ({
      opacity: heartbeat.interpolate({
        inputRange: [0, 1],
        outputRange: [0.82, 1],
      }),
      transform: [
        {
          scale: heartbeat.interpolate({
            inputRange: [0, 1],
            outputRange: [0.94, 1.08],
          }),
        },
      ],
    }),
    [heartbeat],
  );

  return (
    <View
      pointerEvents="none"
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[styles.root, { width: size, height: size }, style]}
    >
      <Animated.Image
        source={FINAL_COMPOSITE}
        resizeMode="contain"
        style={[styles.composite, { width: size, height: size }, compositeStyle, imageStyle]}
      />

      <View
        style={[
          styles.hotspotWindow,
          {
            left: hotspotLeft,
            top: hotspotTop,
            width: hotspotWindow,
            height: hotspotWindow,
            borderRadius: hotspotWindow / 2,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.hotspotAura,
            {
              left: hotspotWindow * 0.12,
              top: hotspotWindow * 0.12,
              width: hotspotWindow * 0.76,
              height: hotspotWindow * 0.76,
              borderRadius: hotspotWindow * 0.38,
            },
            hotspotAuraStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.hotspotRing,
            {
              left: hotspotWindow * 0.22,
              top: hotspotWindow * 0.22,
              width: hotspotWindow * 0.56,
              height: hotspotWindow * 0.56,
              borderRadius: hotspotWindow * 0.28,
            },
            hotspotRingStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.hotspotCore,
            {
              left: hotspotWindow * 0.39,
              top: hotspotWindow * 0.39,
              width: hotspotWindow * 0.22,
              height: hotspotWindow * 0.22,
              borderRadius: hotspotWindow * 0.11,
            },
            hotspotCoreStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: "#FFF9F1",
  },
  composite: {
    position: "absolute",
  },
  hotspotWindow: {
    position: "absolute",
    overflow: "hidden",
  },
  hotspotAura: {
    position: "absolute",
    backgroundColor: "rgba(86, 198, 203, 0.16)",
    shadowColor: "#8B5CFF",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  hotspotRing: {
    position: "absolute",
    borderWidth: 1.8,
    borderColor: "rgba(139, 92, 255, 0.84)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  hotspotCore: {
    position: "absolute",
    backgroundColor: "rgba(255, 251, 246, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(255, 201, 92, 0.92)",
    shadowColor: "#FFC95C",
    shadowOpacity: 0.54,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
