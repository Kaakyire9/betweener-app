import React, { memo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import type { VibesLayoutMetrics } from "../VibesResponsiveLayout";
import GlowOrb from "./GlowOrb";
import RimLight from "./RimLight";
import { getGlassShadowStyle, VIBES_DEPTH_COLORS } from "./platformGlass";

type VibesCardFrameProps = {
  children: ReactNode;
  metrics: VibesLayoutMetrics;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

function VibesCardFrame({ children, metrics, active = true, style }: VibesCardFrameProps) {
  const radius = metrics.cardBorderRadius;
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? "light") === "dark";
  const activeBorder = isDark ? "rgba(19,168,168,0.24)" : "rgba(0,128,128,0.34)";
  const inactiveBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,128,128,0.14)";

  return (
    <View
      style={[
        styles.outer,
        {
          borderRadius: radius,
          shadowOpacity: active ? (isDark ? 0.24 : 0.14) : 0.1,
        },
        getGlassShadowStyle(active ? "high" : "medium", active ? VIBES_DEPTH_COLORS.teal : "#000"),
        style,
      ]}
    >
      {active ? (
        <>
          <GlowOrb color={isDark ? "rgba(19,168,168,0.14)" : "rgba(19,168,168,0.12)"} size={metrics.cardWidth * 0.68} opacity={isDark ? 0.28 : 0.2} bottom={-76} left={metrics.cardWidth * 0.16} />
          <GlowOrb color={isDark ? "rgba(124,92,255,0.10)" : "rgba(124,92,255,0.08)"} size={metrics.cardWidth * 0.46} opacity={isDark ? 0.32 : 0.18} top={metrics.cardHeight * 0.34} right={-74} />
        </>
      ) : null}
      <View
        style={[
          styles.inner,
          {
            borderRadius: radius,
            borderColor: active ? activeBorder : inactiveBorder,
            backgroundColor: isDark ? "#071E22" : "#F3E5D8",
          },
        ]}
      >
        {children}
        <LinearGradientSafe
          pointerEvents="none"
          colors={isDark
            ? ["rgba(244,232,208,0.16)", "rgba(255,255,255,0.03)", "rgba(255,255,255,0)"]
            : ["rgba(255,255,255,0.48)", "rgba(255,255,255,0.10)", "rgba(255,255,255,0)"]}
          start={[0, 0]}
          end={[1, 0]}
          style={[styles.topMuseumSheen, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
        />
        <LinearGradientSafe
          pointerEvents="none"
          colors={["rgba(19,168,168,0)", isDark ? "rgba(19,168,168,0.22)" : "rgba(0,128,128,0.18)", "rgba(19,168,168,0)"]}
          start={[0, 0]}
          end={[0, 1]}
          style={[styles.leftPrism, { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }]}
        />
        <LinearGradientSafe
          pointerEvents="none"
          colors={[isDark ? "rgba(124,92,255,0)" : "rgba(124,92,255,0)", isDark ? "rgba(124,92,255,0.14)" : "rgba(124,92,255,0.10)", "rgba(124,92,255,0)"]}
          start={[0, 0]}
          end={[0, 1]}
          style={[styles.rightPrism, { borderTopRightRadius: radius, borderBottomRightRadius: radius }]}
        />
        <RimLight position="top" color={isDark ? "rgba(244,232,208,0.9)" : "rgba(255,255,255,0.92)"} opacity={isDark ? 0.22 : 0.34} radius={radius} thickness={1} />
        <RimLight position="left" color={VIBES_DEPTH_COLORS.teal} opacity={isDark ? 0.2 : 0.18} radius={radius} thickness={1} />
        <RimLight position="bottom" color={VIBES_DEPTH_COLORS.teal} opacity={isDark ? 0.18 : 0.14} radius={radius} thickness={1} />
      </View>
    </View>
  );
}

export default memo(VibesCardFrame);

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    overflow: "visible",
  },
  inner: {
    flex: 1,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "#071E22",
  },
  topMuseumSheen: {
    position: "absolute",
    left: 1,
    right: 1,
    top: 1,
    height: 76,
    opacity: 0.7,
  },
  leftPrism: {
    position: "absolute",
    left: 0,
    top: 34,
    bottom: 72,
    width: 2,
  },
  rightPrism: {
    position: "absolute",
    right: 0,
    top: 82,
    bottom: 104,
    width: 2,
  },
});
