import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import React, { memo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { VIBES_DEPTH_COLORS } from "./platformGlass";

type RimLightProps = {
  position?: "top" | "bottom" | "left" | "right" | "all";
  color?: string;
  opacity?: number;
  radius?: number;
  thickness?: number;
  style?: ViewStyle;
};

function RimLight({
  position = "top",
  color = VIBES_DEPTH_COLORS.teal,
  opacity = 0.26,
  radius = 28,
  thickness = 1,
  style,
}: RimLightProps) {
  if (position === "all") {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.all,
          {
            borderRadius: radius,
            borderColor: color,
            borderWidth: thickness,
            opacity,
          },
          style,
        ]}
      />
    );
  }

  const edgeStyle =
    position === "top"
      ? { left: 0, right: 0, top: 0, height: Math.max(2, thickness * 2), borderTopLeftRadius: radius, borderTopRightRadius: radius }
      : position === "bottom"
        ? { left: 0, right: 0, bottom: 0, height: Math.max(2, thickness * 2), borderBottomLeftRadius: radius, borderBottomRightRadius: radius }
        : position === "left"
          ? { left: 0, top: 0, bottom: 0, width: Math.max(2, thickness * 2), borderTopLeftRadius: radius, borderBottomLeftRadius: radius }
          : { right: 0, top: 0, bottom: 0, width: Math.max(2, thickness * 2), borderTopRightRadius: radius, borderBottomRightRadius: radius };

  const start = position === "left" || position === "right" ? [0, 0] as [number, number] : [0, 0] as [number, number];
  const end = position === "left" || position === "right" ? [0, 1] as [number, number] : [1, 0] as [number, number];

  return (
    <LinearGradientSafe
      pointerEvents="none"
      colors={["rgba(255,255,255,0)", color, "rgba(255,255,255,0)"]}
      start={start}
      end={end}
      style={[styles.edge, edgeStyle, { opacity }, style]}
    />
  );
}

export default memo(RimLight);

const styles = StyleSheet.create({
  all: {
    opacity: 0.22,
  },
  edge: {
    position: "absolute",
  },
});
