import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export type BetweenerAlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive" | "primary";
};

export type BetweenerAlertOptions = {
  title: string;
  message?: string;
  tone?: "default" | "success" | "info" | "warning" | "error";
  icon?: ComponentProps<typeof MaterialCommunityIcons>["name"];
  buttons?: BetweenerAlertButton[];
};

type InternalAlert = BetweenerAlertOptions & {
  id: string;
};

const listeners = new Set<(alert: InternalAlert | null) => void>();

const emitAlert = (alert: InternalAlert | null) => {
  listeners.forEach((listener) => listener(alert));
};

export const showBetweenerAlert = (options: BetweenerAlertOptions) => {
  emitAlert({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...options,
  });
};

const TONE_THEME = {
  default: {
    accent: "#7C5CFF",
    icon: "message-badge-outline" as const,
    darkGradient: ["#18142C", "#111A2A"],
    lightGradient: ["#FBF7FF", "#F3ECFF"],
    darkBorder: "rgba(172, 145, 255, 0.30)",
    lightBorder: "rgba(124, 92, 255, 0.22)",
  },
  success: {
    accent: "#2ED6C2",
    icon: "check-decagram" as const,
    darkGradient: ["#0F2D31", "#111A27"],
    lightGradient: ["#EEFFFB", "#EAF8F7"],
    darkBorder: "rgba(78, 229, 209, 0.28)",
    lightBorder: "rgba(46, 214, 194, 0.24)",
  },
  info: {
    accent: "#59B7FF",
    icon: "information" as const,
    darkGradient: ["#12273B", "#111A27"],
    lightGradient: ["#F1F8FF", "#EEF5FF"],
    darkBorder: "rgba(120, 195, 255, 0.28)",
    lightBorder: "rgba(89, 183, 255, 0.22)",
  },
  warning: {
    accent: "#FFBE59",
    icon: "alert-circle" as const,
    darkGradient: ["#352611", "#19181F"],
    lightGradient: ["#FFF8ED", "#FFF3E2"],
    darkBorder: "rgba(255, 202, 121, 0.30)",
    lightBorder: "rgba(255, 190, 89, 0.26)",
  },
  error: {
    accent: "#FF7C8E",
    icon: "close-circle" as const,
    darkGradient: ["#351722", "#19151E"],
    lightGradient: ["#FFF2F5", "#FFECEF"],
    darkBorder: "rgba(255, 144, 162, 0.30)",
    lightBorder: "rgba(255, 124, 142, 0.24)",
  },
} as const;

export default function BetweenerAlertHost() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const [alert, setAlert] = useState<InternalAlert | null>(null);

  useEffect(() => {
    const listener = (nextAlert: InternalAlert | null) => {
      setAlert(nextAlert);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dismiss = () => setAlert(null);

  const resolvedButtons = useMemo(() => {
    if (!alert?.buttons?.length) {
      return [{ text: "Close", style: "primary" as const }];
    }
    return alert.buttons;
  }, [alert]);

  if (!alert) return null;

  const tone = TONE_THEME[alert.tone ?? "default"];
  const isDark = (colorScheme ?? "light") === "dark";
  const gradientColors = (isDark ? tone.darkGradient : tone.lightGradient) as unknown as string[];
  const borderColor = isDark ? tone.darkBorder : tone.lightBorder;
  const titleColor = isDark ? "#F7FBFD" : "#142128";
  const messageColor = isDark ? "rgba(231,244,246,0.82)" : "#50615E";
  const secondaryButtonTextColor = isDark ? "#E8F7F8" : "#213330";
  const secondaryButtonBackground = isDark ? "rgba(255,255,255,0.06)" : "rgba(20, 33, 40, 0.04)";
  const secondaryButtonBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(20, 33, 40, 0.08)";
  const destructiveTextColor = isDark ? "#FF9DAA" : "#C6455D";
  const destructiveBackground = isDark ? "rgba(255,124,142,0.18)" : "rgba(255,124,142,0.12)";
  const cardBackground = isDark ? theme.backgroundSubtle : "#FFFDFC";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <LinearGradientSafe
            colors={gradientColors}
            start={[0, 0]}
            end={[1, 1]}
            style={[styles.card, { borderColor, backgroundColor: cardBackground }]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.glowOrb,
                {
                  backgroundColor: `${tone.accent}${isDark ? "20" : "14"}`,
                },
              ]}
            />
            <LinearGradientSafe
              pointerEvents="none"
              colors={
                isDark
                  ? ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)", "transparent"]
                  : ["rgba(255,255,255,0.88)", "rgba(255,255,255,0.18)", "transparent"]
              }
              start={[0, 0]}
              end={[1, 0.7]}
              style={styles.sheen}
            />
            <View style={styles.headerRow}>
              <View style={[styles.iconWrap, { backgroundColor: `${tone.accent}22`, borderColor: `${tone.accent}55` }]}>
                <MaterialCommunityIcons name={alert.icon ?? tone.icon} size={20} color={tone.accent} />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.title, { color: titleColor }]}>{alert.title}</Text>
                {alert.message ? (
                  <Text style={[styles.message, { color: messageColor }]}>{alert.message}</Text>
                ) : null}
              </View>
            </View>

            <View style={[styles.actionsRow, resolvedButtons.length === 1 ? styles.actionsRowSingle : null]}>
              {resolvedButtons.map((button, index) => {
                const isPrimary = button.style === "primary" || (!button.style && index === resolvedButtons.length - 1);
                const isDestructive = button.style === "destructive";
                const textColor = isDestructive ? destructiveTextColor : isPrimary ? "#07141A" : secondaryButtonTextColor;
                const backgroundColor = isDestructive
                  ? destructiveBackground
                  : isPrimary
                    ? tone.accent
                    : secondaryButtonBackground;

                return (
                  <Pressable
                    key={`${button.text}-${index}`}
                    style={({ pressed }) => [
                      styles.actionButton,
                      resolvedButtons.length === 1 ? styles.actionButtonSingle : null,
                      {
                        backgroundColor,
                        borderColor: isPrimary ? "transparent" : secondaryButtonBorder,
                        opacity: pressed ? 0.88 : 1,
                      },
                    ]}
                    onPress={() => {
                      dismiss();
                      setTimeout(() => button.onPress?.(), 60);
                    }}
                  >
                    <Text style={[styles.actionText, { color: textColor }]}>{button.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </LinearGradientSafe>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 9, 13, 0.56)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  sheetWrap: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 26,
    elevation: 10,
  },
  glowOrb: {
    position: "absolute",
    top: -26,
    right: -18,
    width: 124,
    height: 124,
    borderRadius: 62,
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 17,
    lineHeight: 21,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Manrope_500Medium",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  actionsRowSingle: {
    justifyContent: "flex-end",
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  actionButtonSingle: {
    flexGrow: 0,
    minWidth: 96,
  },
  actionText: {
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    letterSpacing: 0.2,
  },
});
