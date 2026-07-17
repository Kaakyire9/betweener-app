import { Platform, StyleSheet, type ViewStyle } from "react-native";

export const VIBES_DEPTH_COLORS = {
  background: "#071E22",
  backgroundDeep: "#061719",
  backgroundRich: "#0F3D3E",
  teal: "#13A8A8",
  purple: "#7C5CFF",
  purpleSoft: "#8B5CFF",
  cream: "#F4E8D0",
  darkGlass: "rgba(7, 30, 34, 0.72)",
  darkGlassAndroid: "rgba(7, 30, 34, 0.88)",
  border: "rgba(255,255,255,0.10)",
  tealBorder: "rgba(19,168,168,0.35)",
  tealGlow: "rgba(19,168,168,0.24)",
  purpleGlow: "rgba(124,92,255,0.18)",
};

export function shouldUseBlur(intensity = 28) {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android") return intensity <= 22;
  return true;
}

export function getAndroidElevation(level: "low" | "medium" | "high" = "medium") {
  if (Platform.OS !== "android") return undefined;
  if (level === "high") return 10;
  if (level === "low") return 4;
  return 7;
}

export function getGlassSurfaceStyle({
  radius = 24,
  borderOpacity = 0.1,
  fallbackColor,
}: {
  radius?: number;
  borderOpacity?: number;
  fallbackColor?: string;
} = {}): ViewStyle {
  return {
    borderRadius: radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `rgba(255,255,255,${borderOpacity})`,
    backgroundColor: fallbackColor ?? (Platform.OS === "android" ? VIBES_DEPTH_COLORS.darkGlassAndroid : "rgba(7,30,34,0.34)"),
  };
}

export function getGlassShadowStyle(level: "low" | "medium" | "high" = "medium", color = "#000"): ViewStyle {
  const high = level === "high";
  const low = level === "low";
  return {
    shadowColor: color,
    shadowOpacity: high ? 0.28 : low ? 0.12 : 0.2,
    shadowRadius: high ? 24 : low ? 10 : 16,
    shadowOffset: { width: 0, height: high ? 14 : low ? 5 : 9 },
    elevation: getAndroidElevation(level),
  };
}
