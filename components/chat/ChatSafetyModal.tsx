import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { haptics } from "@/lib/haptics";
import { ShieldCheck, Lock, MessageCircle } from "lucide-react-native";
import { useMemo } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  visible: boolean;
  onGotIt: () => void;
};

export default function ChatSafetyModal({ visible, onGotIt }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const handleGotIt = () => {
    void haptics.tap();
    onGotIt();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleGotIt}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <BlurViewSafe intensity={22} tint={isDark ? "dark" : "light"} style={styles.blur}>
            <LinearGradientSafe
              colors={isDark ? ["rgba(0,160,160,0.28)", "rgba(155,124,200,0.20)"] : ["rgba(0,128,128,0.22)", "rgba(125,91,166,0.16)"]}
              start={[0, 0]}
              end={[1, 1]}
              style={styles.hero}
            >
              <View style={styles.heroRow}>
                <View style={styles.heroIcon}>
                  <ShieldCheck size={22} color={theme.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Start the conversation</Text>
                  <Text style={styles.heroSubtitle}>A quick safety note before you say hi.</Text>
                </View>
              </View>

              <View style={styles.heroPills}>
                <View style={styles.pill}>
                  <Lock size={14} color={theme.accent} />
                  <Text style={styles.pillText}>Keep it private</Text>
                </View>
                <View style={styles.pill}>
                  <MessageCircle size={14} color={theme.accent} />
                  <Text style={styles.pillText}>Stay on-app</Text>
                </View>
              </View>
            </LinearGradientSafe>

            <View style={styles.content}>
              <Text style={styles.body}>
                Excited you’re about to start a conversation. For your safety, keep personal details private (phone number,
                bank info, addresses) and avoid sharing explicit content. Take time to get to know each other here before
                moving off the app.
              </Text>

              <View style={styles.bullets}>
                <View style={styles.bulletRow}>
                  <View style={styles.dot} />
                  <Text style={styles.bulletText}>No phone numbers, bank details, or addresses.</Text>
                </View>
                <View style={styles.bulletRow}>
                  <View style={styles.dot} />
                  <Text style={styles.bulletText}>Avoid sharing explicit photos or content.</Text>
                </View>
                <View style={styles.bulletRow}>
                  <View style={styles.dot} />
                  <Text style={styles.bulletText}>Chat here until you feel confident.</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleGotIt} activeOpacity={0.9}>
                <Text style={styles.primaryText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </BlurViewSafe>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      backgroundColor: isDark ? "rgba(0,0,0,0.66)" : "rgba(15,23,42,0.36)",
    },
    card: {
      width: "100%",
      maxWidth: 520,
      borderRadius: 22,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : theme.outline,
      backgroundColor: isDark ? "rgba(15,26,26,0.94)" : "rgba(247,236,226,0.92)",
      shadowColor: isDark ? "#000" : "#0f172a",
      shadowOpacity: isDark ? 0.22 : 0.14,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    blur: { borderRadius: 22, overflow: "hidden" },
    hero: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
    heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    heroIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: isDark ? "rgba(0,160,160,0.18)" : "rgba(0,128,128,0.12)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
      alignItems: "center",
      justifyContent: "center",
    },
    heroTitle: { fontSize: 20, color: theme.text, fontFamily: "PlayfairDisplay_700Bold" },
    heroSubtitle: { marginTop: 4, color: theme.textMuted, fontFamily: "Manrope_600SemiBold" },
    heroPills: { flexDirection: "row", gap: 10, marginTop: 12 },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      height: 32,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : theme.outline,
    },
    pillText: { color: theme.text, fontWeight: "900", fontSize: 12 },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
    body: { color: theme.textMuted, fontSize: 14, lineHeight: 20, fontFamily: "Manrope_600SemiBold" },
    bullets: { marginTop: 14, gap: 10 },
    bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: theme.accent },
    bulletText: { flex: 1, color: theme.text, fontSize: 13, lineHeight: 18 },
    primaryBtn: {
      marginTop: 16,
      height: 46,
      borderRadius: 14,
      backgroundColor: theme.tint,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: isDark ? "#000" : "#0f172a",
      shadowOpacity: isDark ? 0.24 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  });

