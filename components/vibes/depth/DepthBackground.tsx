import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { useColorScheme } from "@/hooks/use-color-scheme";
import React, { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import GlowOrb from "./GlowOrb";
import { VIBES_DEPTH_COLORS } from "./platformGlass";

type DepthBackgroundProps = {
  children?: ReactNode;
};

function DepthBackground({ children }: DepthBackgroundProps) {
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? "light") === "dark";
  const baseColors = isDark
    ? [VIBES_DEPTH_COLORS.backgroundDeep, VIBES_DEPTH_COLORS.background, "#082429", VIBES_DEPTH_COLORS.backgroundRich]
    : ["#F8EFE6", "#F3E5D8", "#EAF4F1", "#DCEBE7"];
  const tealOrb = isDark ? "rgba(19,168,168,0.18)" : "rgba(19,168,168,0.16)";
  const purpleOrb = isDark ? VIBES_DEPTH_COLORS.purpleGlow : "rgba(124,92,255,0.10)";
  const lowTealOrb = isDark ? "rgba(19,168,168,0.14)" : "rgba(19,168,168,0.12)";
  const waveColors = isDark
    ? ["rgba(255,255,255,0)", "rgba(103,232,249,0.07)", "rgba(255,255,255,0)"]
    : ["rgba(255,255,255,0)", "rgba(19,168,168,0.12)", "rgba(255,255,255,0)"];
  const bottomFade = isDark
    ? ["rgba(0,0,0,0)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.68)"]
    : ["rgba(255,255,255,0)", "rgba(243,229,216,0.44)", "rgba(230,241,237,0.86)"];

  return (
    <View style={[styles.root, { backgroundColor: isDark ? VIBES_DEPTH_COLORS.background : "#F3E5D8" }]}>
      <LinearGradientSafe
        pointerEvents="none"
        colors={baseColors}
        start={[0.2, 0]}
        end={[0.8, 1]}
        style={StyleSheet.absoluteFill}
      />
      <GlowOrb color={tealOrb} size={270} opacity={isDark ? 0.28 : 0.24} top={210} left={-124} animated />
      <GlowOrb color={purpleOrb} size={250} opacity={isDark ? 0.34 : 0.2} right={-132} top={300} animated delay={1000} />
      <GlowOrb color={lowTealOrb} size={330} opacity={isDark ? 0.3 : 0.22} bottom={28} left={42} animated delay={1800} />
      <LinearGradientSafe
        pointerEvents="none"
        colors={waveColors}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.waveOne}
      />
      <LinearGradientSafe
        pointerEvents="none"
        colors={bottomFade}
        start={[0, 0]}
        end={[0, 1]}
        style={styles.bottomFade}
      />
      {children}
    </View>
  );
}

export default memo(DepthBackground);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: VIBES_DEPTH_COLORS.background,
    overflow: "hidden",
  },
  waveOne: {
    position: "absolute",
    top: 58,
    right: -88,
    width: 390,
    height: 130,
    borderRadius: 999,
    transform: [{ rotate: "-24deg" }],
    opacity: 0.46,
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
  },
});
