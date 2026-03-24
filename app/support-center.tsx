import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Motion } from "@/lib/motion";
import { TRUST_LINKS, openExternalUrl, openSupportEmail } from "@/lib/trust-links";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SUPPORT_TOPICS = [
  {
    id: "account",
    icon: "account-cog-outline",
    title: "Account and access",
    body: "Help with login, email changes, onboarding issues, or a stuck verification step.",
  },
  {
    id: "safety",
    icon: "shield-alert-outline",
    title: "Safety and reporting",
    body: "For harmful behavior, suspicious activity, blocking, and moderation-related concerns.",
  },
  {
    id: "premium",
    icon: "crown-outline",
    title: "Premium and billing",
    body: "Support for upcoming subscription plans, boosts, and premium member benefits.",
  },
] as const;

export default function SupportCenterScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = createStyles(theme, isDark);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.accent, isDark ? 0.24 : 0.14), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGlow}
      />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(Motion.duration.slow)}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={theme.text} />
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>

            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Help & Support</Text>
              <Text style={styles.heroTitle}>Premium member support starts with clarity and fast next steps</Text>
              <Text style={styles.heroBody}>
                Give members one trusted place to resolve product issues, ask about billing, or escalate safety concerns without friction.
              </Text>
              <View style={styles.heroActions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() =>
                    void openSupportEmail(
                      "Betweener support request",
                      "Hello Betweener team,%0D%0A%0D%0AHere is what I need help with:%0D%0A"
                    )
                  }
                >
                  <MaterialCommunityIcons name="email-fast-outline" size={18} color={Colors.light.background} />
                  <Text style={styles.primaryButtonText}>Email support</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => router.push("/trust-center")}>
                  <Text style={styles.secondaryButtonText}>Open Trust Center</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(70).duration(Motion.duration.slow)} style={styles.section}>
            {SUPPORT_TOPICS.map((topic) => (
              <View key={topic.id} style={styles.topicCard}>
                <View style={styles.topicIcon}>
                  <MaterialCommunityIcons name={topic.icon} size={18} color={theme.tint} />
                </View>
                <View style={styles.topicCopy}>
                  <Text style={styles.topicTitle}>{topic.title}</Text>
                  <Text style={styles.topicBody}>{topic.body}</Text>
                </View>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(Motion.duration.slow)} style={styles.section}>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Support channels</Text>
              <Pressable style={styles.linkRow} onPress={() => void openSupportEmail("Betweener support")}>
                <View>
                  <Text style={styles.linkTitle}>Email</Text>
                  <Text style={styles.linkBody}>{TRUST_LINKS.supportEmail}</Text>
                </View>
                <MaterialCommunityIcons name="arrow-top-right" size={18} color={theme.textMuted} />
              </Pressable>
              <Pressable style={styles.linkRow} onPress={() => void openExternalUrl(TRUST_LINKS.supportSite)}>
                <View>
                  <Text style={styles.linkTitle}>Support page</Text>
                  <Text style={styles.linkBody}>Status notes, help articles, and premium member updates</Text>
                </View>
                <MaterialCommunityIcons name="open-in-new" size={18} color={theme.textMuted} />
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    safeArea: { flex: 1 },
    bgGlow: {
      position: "absolute",
      top: -100,
      right: -90,
      width: 260,
      height: 260,
      borderRadius: 260,
    },
    content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 18 },
    backButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
      marginBottom: 14,
    },
    backLabel: { color: theme.text, fontSize: 12, fontWeight: "600" },
    heroCard: {
      borderRadius: 24,
      padding: 20,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.74),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    heroEyebrow: { color: theme.tint, fontSize: 11, fontFamily: "Archivo_700Bold", letterSpacing: 0.6, textTransform: "uppercase" },
    heroTitle: {
      color: theme.text,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: "PlayfairDisplay_700Bold",
    },
    heroBody: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 21,
      fontFamily: "Manrope_500Medium",
    },
    heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    primaryButtonText: { color: Colors.light.background, fontSize: 12, fontWeight: "700" },
    secondaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
    },
    secondaryButtonText: { color: theme.text, fontSize: 12, fontWeight: "600" },
    section: { gap: 10 },
    topicCard: {
      flexDirection: "row",
      gap: 12,
      padding: 16,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    topicIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    topicCopy: { flex: 1, gap: 4 },
    topicTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    topicBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    panel: {
      borderRadius: 18,
      padding: 16,
      gap: 8,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    panelTitle: { color: theme.text, fontSize: 18, fontFamily: "Archivo_700Bold", marginBottom: 6 },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 10,
    },
    linkTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    linkBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium", marginTop: 4 },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};
