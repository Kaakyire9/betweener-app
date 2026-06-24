import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type NewHereBadgeProps = {
  style?: StyleProp<ViewStyle>;
  surface?: "default" | "overlay";
};

function NewHereBadgeComponent({ style, surface = "default" }: NewHereBadgeProps) {
  const isOverlay = surface === "overlay";

  return (
    <LinearGradientSafe
      colors={isOverlay ? ["#A05CFF", "#6D35DA"] : ["#B97BFF", "#7F43EA"]}
      start={[0, 0]}
      end={[1, 1]}
      style={[styles.badge, isOverlay ? styles.badgeOverlay : null, style]}
    >
      <View style={[styles.badgeCore, isOverlay ? styles.badgeCoreOverlay : null]}>
        <MaterialCommunityIcons
          name="creation"
          size={10}
          color={isOverlay ? "#F8EFFF" : "#FFE8FF"}
        />
        <Text style={styles.label}>New Here</Text>
      </View>
    </LinearGradientSafe>
  );
}

export const NewHereBadge = memo(NewHereBadgeComponent);

const styles = StyleSheet.create({
  badge: {
    minHeight: 22,
    padding: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(224, 186, 255, 0.46)",
    shadowColor: "#7F43EA",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  badgeOverlay: {
    borderColor: "rgba(232, 206, 255, 0.60)",
    shadowOpacity: 0.28,
  },
  badgeCore: {
    minHeight: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(58, 18, 90, 0.42)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  badgeCoreOverlay: {
    backgroundColor: "rgba(38, 11, 64, 0.54)",
    borderColor: "rgba(255,255,255,0.24)",
  },
  label: {
    color: "#FFF1FF",
    fontSize: 8.5,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.75,
    textTransform: "uppercase",
  },
});
