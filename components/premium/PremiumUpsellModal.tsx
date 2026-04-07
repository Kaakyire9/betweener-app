import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type RequiredPlan = "SILVER" | "GOLD";

type PremiumUpsellModalProps = {
  visible: boolean;
  requiredPlan: RequiredPlan;
  title: string;
  message: string;
  onClose: () => void;
  onViewPlan: () => void;
};

const PLAN_META: Record<
  RequiredPlan,
  {
    label: string;
    eyebrow: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    accent: string;
    glow: [string, string];
  }
> = {
  SILVER: {
    label: "Silver",
    eyebrow: "Silver feature",
    icon: "star-four-points-circle-outline",
    accent: "#14B8D4",
    glow: ["rgba(20,184,212,0.22)", "rgba(20,184,212,0.04)"],
  },
  GOLD: {
    label: "Gold",
    eyebrow: "Gold feature",
    icon: "crown-outline",
    accent: "#EAB308",
    glow: ["rgba(234,179,8,0.24)", "rgba(234,179,8,0.04)"],
  },
};

export default function PremiumUpsellModal({
  visible,
  requiredPlan,
  title,
  message,
  onClose,
  onViewPlan,
}: PremiumUpsellModalProps) {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = createStyles(theme, isDark);
  const meta = PLAN_META[requiredPlan];

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.card}>
          <LinearGradient colors={meta.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardGlow} />
          <BlurView intensity={28} tint={isDark ? "dark" : "light"} style={styles.blur} />

          <View style={styles.header}>
            <View style={[styles.iconShell, { borderColor: `${meta.accent}55`, backgroundColor: `${meta.accent}18` }]}>
              <MaterialCommunityIcons name={meta.icon} size={18} color={meta.accent} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.eyebrow, { color: meta.accent }]}>{meta.eyebrow}</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.body}>{message}</Text>
            </View>
          </View>

          <View style={styles.valueRow}>
            <View style={styles.valueChip}>
              <MaterialCommunityIcons name="star-four-points-outline" size={14} color={meta.accent} />
              <Text style={styles.valueText}>Designed to move the energy forward</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.9}>
              <Text style={styles.secondaryButtonText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onViewPlan} activeOpacity={0.92} style={styles.primaryButtonWrap}>
              <LinearGradient
                colors={[meta.accent, isDark ? `${meta.accent}DD` : `${meta.accent}F2`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>View {meta.label}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(4,10,16,0.56)",
    },
    sheetWrap: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    card: {
      overflow: "hidden",
      borderRadius: 26,
      backgroundColor: isDark ? "rgba(10,20,24,0.92)" : "rgba(255,255,255,0.96)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(8,20,24,0.08)",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.34 : 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 14,
    },
    cardGlow: {
      ...StyleSheet.absoluteFillObject,
    },
    blur: {
      ...StyleSheet.absoluteFillObject,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 20,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },
    iconShell: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    copy: {
      flex: 1,
      gap: 5,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    title: {
      color: theme.text,
      fontSize: 24,
      lineHeight: 28,
      fontFamily: "PlayfairDisplay_700Bold",
    },
    body: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "Manrope_500Medium",
    },
    valueRow: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 10,
    },
    valueChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(8,20,24,0.04)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(8,20,24,0.06)",
    },
    valueText: {
      color: theme.text,
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 20,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(8,20,24,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(8,20,24,0.04)",
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: {
      color: theme.text,
      fontSize: 14,
      fontFamily: "Manrope_700Bold",
    },
    primaryButtonWrap: {
      flex: 1,
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      color: Colors.light.background,
      fontSize: 14,
      fontFamily: "Manrope_800ExtraBold",
    },
  });
