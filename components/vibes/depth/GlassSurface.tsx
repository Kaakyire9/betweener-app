import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import React, { memo, type ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { getGlassShadowStyle, getGlassSurfaceStyle, shouldUseBlur, VIBES_DEPTH_COLORS } from "./platformGlass";

type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: "dark" | "light" | "default";
  borderOpacity?: number;
  glow?: boolean;
  glowColor?: string;
  fallbackColor?: string;
  radius?: number;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
};

function GlassSurface({
  children,
  style,
  contentStyle,
  intensity = 28,
  tint = "dark",
  borderOpacity = 0.1,
  glow = false,
  glowColor = VIBES_DEPTH_COLORS.teal,
  fallbackColor,
  radius = 24,
  pointerEvents,
}: GlassSurfaceProps) {
  const Surface: any = shouldUseBlur(intensity) ? BlurViewSafe : View;

  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        styles.outer,
        getGlassShadowStyle(glow ? "high" : "medium", glowColor),
        glow ? { shadowOpacity: Platform.OS === "android" ? 0.12 : 0.22 } : null,
        style,
      ]}
    >
      {glow ? <View pointerEvents="none" style={[styles.glow, { backgroundColor: glowColor, borderRadius: radius + 8 }]} /> : null}
      <Surface
        intensity={intensity}
        tint={tint}
        style={[
          styles.surface,
          getGlassSurfaceStyle({ radius, borderOpacity, fallbackColor }),
          { borderRadius: radius },
          contentStyle,
        ]}
      >
        <LinearGradientSafe
          pointerEvents="none"
          colors={["rgba(255,255,255,0.075)", "rgba(255,255,255,0.018)", "rgba(0,0,0,0.12)"]}
          start={[0, 0]}
          end={[0.85, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
        {children}
      </Surface>
    </View>
  );
}

export default memo(GlassSurface);

const styles = StyleSheet.create({
  outer: {
    position: "relative",
  },
  glow: {
    position: "absolute",
    left: -8,
    right: -8,
    top: -8,
    bottom: -8,
    opacity: 0.12,
  },
  surface: {
    overflow: "hidden",
  },
});
