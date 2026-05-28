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
    ? ["#031318", "#071E22", "#0A2A2D", "#07171B"]
    : ["#F7EFE4", "#F1E4D6", "#E4F0EB", "#D8E8E2"];
  const tealOrb = isDark ? "rgba(19,168,168,0.14)" : "rgba(19,168,168,0.14)";
  const purpleOrb = isDark ? "rgba(126,92,255,0.18)" : "rgba(124,92,255,0.08)";
  const lowTealOrb = isDark ? "rgba(19,168,168,0.09)" : "rgba(19,168,168,0.10)";
  const topMist = isDark ? "rgba(108,228,230,0.07)" : "rgba(19,168,168,0.08)";
  const waveColors = isDark
    ? ["rgba(255,255,255,0)", "rgba(103,232,249,0.05)", "rgba(255,255,255,0)"]
    : ["rgba(255,255,255,0)", "rgba(19,168,168,0.10)", "rgba(255,255,255,0)"];
  const bottomFade = isDark
    ? ["rgba(0,0,0,0)", "rgba(0,0,0,0.28)", "rgba(0,0,0,0.62)"]
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
      <LinearGradientSafe
        pointerEvents="none"
        colors={["rgba(255,255,255,0)", topMist, "rgba(255,255,255,0)"]}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.topSweep}
      />
      <GlowOrb color={tealOrb} size={228} opacity={isDark ? 0.2 : 0.18} top={228} left={-92} animated />
      <GlowOrb color={purpleOrb} size={214} opacity={isDark ? 0.22 : 0.14} right={-116} top={352} animated delay={1000} />
      <GlowOrb color={lowTealOrb} size={278} opacity={isDark ? 0.18 : 0.16} bottom={44} left={24} animated delay={1800} />
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
  topSweep: {
    position: "absolute",
    top: 22,
    right: -72,
    width: 320,
    height: 112,
    borderRadius: 999,
    transform: [{ rotate: "-18deg" }],
    opacity: 0.82,
  },
  waveOne: {
    position: "absolute",
    top: 94,
    right: -76,
    width: 342,
    height: 112,
    borderRadius: 999,
    transform: [{ rotate: "-20deg" }],
    opacity: 0.34,
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
  },
});
