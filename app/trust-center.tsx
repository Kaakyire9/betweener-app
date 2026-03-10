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

const LEGAL_ROWS = [
  {
    id: "privacy",
    title: "Privacy Policy",
    body: "How Betweener collects, uses, stores, and protects member data.",
    icon: "shield-lock-outline",
    url: TRUST_LINKS.privacy,
  },
  {
    id: "terms",
    title: "Terms of Service",
    body: "The rules, responsibilities, and product terms that govern membership.",
    icon: "file-document-outline",
    url: TRUST_LINKS.terms,
  },
  {
    id: "cookies",
    title: "Cookies Policy",
    body: "A simple breakdown of tracking, analytics, and browser/device storage.",
    icon: "cookie-outline",
    url: TRUST_LINKS.cookies,
  },
] as const;

export default function TrustCenterScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = createStyles(theme, isDark);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.tint, isDark ? 0.24 : 0.14), "transparent"]}
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
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>Trust Center</Text>
              </View>
              <Text style={styles.heroTitle}>Privacy, safety, and member care that feels intentional</Text>
              <Text style={styles.heroBody}>
                Betweener is built around trust. This space gives members one calm place to understand policies,
                support channels, and the safety tools that protect serious connections.
              </Text>
              <View style={styles.heroHighlights}>
                <View style={styles.heroHighlight}>
                  <MaterialCommunityIcons name="shield-check-outline" size={16} color={theme.tint} />
                  <Text style={styles.heroHighlightText}>Verification and moderation are handled with review controls.</Text>
                </View>
                <View style={styles.heroHighlight}>
                  <MaterialCommunityIcons name="lock-outline" size={16} color={theme.tint} />
                  <Text style={styles.heroHighlightText}>Sensitive verification documents are kept private and access-controlled.</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(70).duration(Motion.duration.slow)} style={styles.section}>
            <Text style={styles.sectionTitle}>Legal documents</Text>
            {LEGAL_ROWS.map((item) => (
              <Pressable key={item.id} style={styles.rowCard} onPress={() => void openExternalUrl(item.url)}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name={item.icon} size={18} color={theme.tint} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowBody}>{item.body}</Text>
                </View>
                <MaterialCommunityIcons name="open-in-new" size={18} color={theme.textMuted} />
              </Pressable>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(Motion.duration.slow)} style={styles.section}>
            <Text style={styles.sectionTitle}>Safety tools inside the app</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="flag-outline" size={18} color={theme.accent} />
                <Text style={styles.infoText}>You can report and block from chat when behavior crosses the line.</Text>
              </View>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="account-check-outline" size={18} color={theme.accent} />
                <Text style={styles.infoText}>Verification levels help reduce friction and improve member trust.</Text>
              </View>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="bell-badge-outline" size={18} color={theme.accent} />
                <Text style={styles.infoText}>Important safety and verification updates can still reach you even in a quiet inbox.</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(170).duration(Motion.duration.slow)} style={styles.section}>
            <Text style={styles.sectionTitle}>Support and escalation</Text>
            <View style={styles.infoCard}>
              <Pressable
                style={styles.actionRow}
                onPress={() =>
                  void openSupportEmail(
                    "Betweener support",
                    "Hello Betweener team,%0D%0A%0D%0AI need help with:%0D%0A"
                  )
                }
              >
                <View>
                  <Text style={styles.actionTitle}>Email support</Text>
                  <Text style={styles.actionBody}>{TRUST_LINKS.supportEmail}</Text>
                </View>
                <MaterialCommunityIcons name="email-fast-outline" size={20} color={theme.tint} />
              </Pressable>
              <Pressable style={styles.actionRow} onPress={() => void openExternalUrl(TRUST_LINKS.supportSite)}>
                <View>
                  <Text style={styles.actionTitle}>Support site</Text>
                  <Text style={styles.actionBody}>Help articles, launch updates, and future billing support</Text>
                </View>
                <MaterialCommunityIcons name="lifebuoy" size={20} color={theme.tint} />
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
      top: -80,
      left: -80,
      width: 240,
      height: 240,
      borderRadius: 240,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 28,
      gap: 18,
    },
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
      overflow: "hidden",
    },
    heroBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.2 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.4 : 0.95),
    },
    heroBadgeText: { color: theme.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
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
    heroHighlights: { gap: 10 },
    heroHighlight: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    heroHighlightText: { flex: 1, color: theme.text, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    section: { gap: 10 },
    sectionTitle: { color: theme.text, fontSize: 18, fontFamily: "Archivo_700Bold" },
    rowCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    rowCopy: { flex: 1, gap: 4 },
    rowTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    rowBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    infoCard: {
      borderRadius: 18,
      padding: 16,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    infoText: { flex: 1, color: theme.textMuted, fontSize: 12, lineHeight: 19, fontFamily: "Manrope_500Medium" },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 4,
    },
    actionTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    actionBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium", marginTop: 4 },
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
