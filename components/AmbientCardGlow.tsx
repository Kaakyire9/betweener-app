import { Colors } from "@/constants/theme";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";

type AmbientCardGlowProps = {
  theme: typeof Colors.light;
  hasIntroVideo?: boolean;
  isActiveNow?: boolean;
  isPressed?: boolean;
  isPremium?: boolean;
  disabled?: boolean;
  compactMode?: boolean;
  style?: ViewStyle;
};

const BREATH_DURATION_MS = 3200;

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => value + value)
          .join("")
      : normalized;
  const bigint = parseInt(expanded, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

function resolveGlowProfile({
  theme,
  hasIntroVideo,
  isActiveNow,
  isPressed,
  isPremium,
}: Omit<AmbientCardGlowProps, "disabled" | "compactMode" | "style">) {
  const primary = hasIntroVideo || isActiveNow ? theme.tint : theme.outline;
  const secondary = isPremium ? theme.accent : theme.secondary;

  const baseOpacity = hasIntroVideo ? 0.14 : 0.05;
  const pulseOpacity = isActiveNow ? 0.11 : 0;
  const pressedBoost = isPressed ? 0.08 : 0;

  return {
    primary,
    secondary,
    baseOpacity: Math.min(0.22, baseOpacity + pressedBoost),
    pulseOpacity: Math.min(0.18, pulseOpacity + (isPressed ? 0.04 : 0)),
    secondaryOpacity: isPremium ? 0.1 : hasIntroVideo ? 0.06 : 0,
  };
}

export default function AmbientCardGlow({
  theme,
  hasIntroVideo = false,
  isActiveNow = false,
  isPressed = false,
  isPremium = false,
  disabled = false,
  compactMode = false,
  style,
}: AmbientCardGlowProps) {
  const breath = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  const profile = useMemo(
    () =>
      resolveGlowProfile({
        theme,
        hasIntroVideo,
        isActiveNow,
        isPressed,
        isPremium,
      }),
    [theme, hasIntroVideo, isActiveNow, isPressed, isPremium],
  );

  useEffect(() => {
    if (disabled || !isActiveNow) {
      breath.stopAnimation();
      breath.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: BREATH_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: BREATH_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      breath.setValue(0);
    };
  }, [breath, disabled, isActiveNow]);

  useEffect(() => {
    Animated.timing(press, {
      toValue: disabled ? 0 : isPressed ? 1 : 0,
      duration: isPressed ? 140 : 220,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [disabled, isPressed, press]);

  if (disabled || (!hasIntroVideo && !isActiveNow && !isPressed && !isPremium)) {
    return null;
  }

  const compactInset = compactMode ? 8 : 14;
  const compactBottomInset = compactMode ? 6 : 12;

  const primaryOpacity = Animated.add(
    breath.interpolate({
      inputRange: [0, 1],
      outputRange: [profile.baseOpacity, Math.min(0.28, profile.baseOpacity + profile.pulseOpacity)],
    }),
    press.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.05],
    }),
  );

  const primaryScale = Animated.add(
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
    press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.02] }),
  );

  const secondaryOpacity = press.interpolate({
    inputRange: [0, 1],
    outputRange: [profile.secondaryOpacity, Math.min(0.18, profile.secondaryOpacity + 0.03)],
  });

  const secondaryScale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });

  return (
    <View pointerEvents="none" style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.primaryHalo,
          {
            left: -compactInset,
            right: -compactInset,
            top: -compactInset,
            bottom: -compactBottomInset,
            shadowColor: profile.primary,
            backgroundColor: withAlpha(profile.primary, compactMode ? 0.04 : 0.05),
          },
          { opacity: primaryOpacity, transform: [{ scale: primaryScale }] },
        ]}
      />
      {(hasIntroVideo || isPremium) && (
        <Animated.View
          style={[
            styles.secondaryHalo,
            {
              top: compactMode ? 18 : 14,
              right: compactMode ? 18 : 22,
              backgroundColor: withAlpha(profile.secondary, compactMode ? 0.05 : 0.06),
              shadowColor: profile.secondary,
            },
            { opacity: secondaryOpacity, transform: [{ scale: secondaryScale }] },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  primaryHalo: {
    position: "absolute",
    borderRadius: 36,
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
  },
  secondaryHalo: {
    position: "absolute",
    width: "52%",
    height: "36%",
    borderRadius: 999,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
