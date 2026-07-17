import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type PremiumPlan = "SILVER" | "GOLD";

type PremiumPlanBadgeProps = {
  plan: PremiumPlan;
  style?: StyleProp<ViewStyle>;
  surface?: "default" | "overlay";
};

const BADGE_THEME = {
  GOLD: {
    gradient: ["#FFF2B8", "#E5AE35", "#9B5C05"],
    coreBackground: "rgba(84,49,7,0.20)",
    iconBackground: "rgba(255,249,223,0.92)",
    iconBorder: "rgba(126,72,6,0.28)",
    iconColor: "#5A3200",
    textColor: "#FFF7E2",
    outerBorder: "rgba(255,240,181,0.62)",
    shadowColor: "#B77400",
    iconName: "crown" as const,
  },
  SILVER: {
    gradient: ["#FFFFFF", "#DCE7ED", "#7F97A4"],
    coreBackground: "rgba(22,42,54,0.18)",
    iconBackground: "rgba(255,255,255,0.94)",
    iconBorder: "rgba(34,64,79,0.24)",
    iconColor: "#1C3544",
    textColor: "#F7FBFD",
    outerBorder: "rgba(228,241,248,0.56)",
    shadowColor: "#6C8795",
    iconName: "diamond-stone" as const,
  },
};

function PremiumPlanBadgeComponent({ plan, style, surface = "default" }: PremiumPlanBadgeProps) {
  const theme = BADGE_THEME[plan];
  const isOverlay = surface === "overlay";
  const gradientColors = isOverlay
    ? plan === "GOLD"
      ? ["#FFF6D8", "#F1BE49", "#A85B00"]
      : ["#FFFFFF", "#EAF4FA", "#8CA9B9"]
    : theme.gradient;
  const coreBackground = isOverlay
    ? plan === "GOLD"
      ? "rgba(51,28,4,0.56)"
      : "rgba(11,24,32,0.56)"
    : theme.coreBackground;
  const iconBackground = isOverlay
    ? plan === "GOLD"
      ? "rgba(255,248,223,0.98)"
      : "rgba(255,255,255,0.98)"
    : theme.iconBackground;
  const iconBorder = isOverlay
    ? plan === "GOLD"
      ? "rgba(126,72,6,0.34)"
      : "rgba(34,64,79,0.30)"
    : theme.iconBorder;
  const textColor = isOverlay
    ? plan === "GOLD"
      ? "#FFF8DE"
      : "#FFFFFF"
    : theme.textColor;
  const coreBorderColor = isOverlay ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.18)";
  const outerBorderColor = isOverlay
    ? plan === "GOLD"
      ? "rgba(255,241,191,0.84)"
      : "rgba(236,246,252,0.82)"
    : theme.outerBorder;

  return (
    <LinearGradientSafe
      colors={gradientColors}
      start={[0, 0]}
      end={[1, 1]}
      style={[
        styles.badge,
        {
          borderColor: outerBorderColor,
          shadowColor: theme.shadowColor,
          shadowOpacity: isOverlay ? 0.34 : 0.24,
          elevation: isOverlay ? 6 : 4,
        },
        style,
      ]}
    >
      <View style={[styles.badgeCore, { backgroundColor: coreBackground, borderColor: coreBorderColor }]}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: iconBackground,
              borderColor: iconBorder,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={theme.iconName}
            size={9}
            color={theme.iconColor}
          />
        </View>
        <Text style={[styles.label, { color: textColor }]}>{plan}</Text>
      </View>
    </LinearGradientSafe>
  );
}

export const PremiumPlanBadge = memo(PremiumPlanBadgeComponent);

const styles = StyleSheet.create({
  badge: {
    minHeight: 22,
    padding: 1,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 4,
  },
  badgeCore: {
    minHeight: 20,
    paddingHorizontal: 7,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  iconWrap: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 8,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.16)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
