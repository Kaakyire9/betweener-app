import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { haptics } from "@/lib/haptics";
import { ShieldCheck, Lock, MessageCircle, EyeOff, TriangleAlert, Check } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  visible: boolean;
  onGotIt: () => void;
};

export default function ChatSafetyModal({ visible, onGotIt }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const entry = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      entry.setValue(0);
      return;
    }
    Animated.timing(entry, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry, visible]);

  const handleGotIt = () => {
    void haptics.tap();
    onGotIt();
  };

  const heroStyle = {
    opacity: entry,
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  } as const;

  const contentStyle = {
    opacity: entry.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0, 0, 1],
    }),
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  } as const;

  const buttonStyle = {
    opacity: entry.interpolate({
      inputRange: [0, 0.65, 1],
      outputRange: [0, 0, 1],
    }),
    transform: [
      {
        scale: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  } as const;

  const primaryCardStyle = {
    opacity: entry.interpolate({
      inputRange: [0, 0.45, 1],
      outputRange: [0, 0, 1],
    }),
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  } as const;

  const secondaryCardStyle = {
    opacity: entry.interpolate({
      inputRange: [0, 0.58, 1],
      outputRange: [0, 0, 1],
    }),
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  } as const;

  const noteStyle = {
    opacity: entry.interpolate({
      inputRange: [0, 0.72, 1],
      outputRange: [0, 0, 1],
    }),
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  } as const;

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={handleGotIt}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <BlurViewSafe intensity={22} tint={isDark ? "dark" : "light"} style={styles.blur}>
            <Animated.View style={heroStyle}>
              <LinearGradientSafe
                colors={isDark ? ["rgba(0,170,170,0.30)", "rgba(0,95,95,0.12)", "rgba(155,124,200,0.18)"] : ["rgba(0,128,128,0.22)", "rgba(36,120,120,0.10)", "rgba(125,91,166,0.12)"]}
                start={[0, 0]}
                end={[1, 1]}
                style={styles.hero}
              >
                <View style={styles.heroGlow} />
                <View style={styles.heroGlowSoft} />
                <View style={styles.heroAccentLine} />
                <View style={styles.eyebrowRow}>
                  <View style={styles.eyebrowBadge}>
                    <ShieldCheck size={13} color={theme.tint} />
                    <Text style={styles.eyebrowText}>Safety first</Text>
                  </View>
                  <View style={styles.heroDivider} />
                  <Text style={styles.eyebrowMeta}>First message check-in</Text>
                </View>

                <View style={styles.heroRow}>
                  <View style={styles.heroIcon}>
                    <ShieldCheck size={22} color={theme.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroTitle}>Start the conversation</Text>
                    <Text style={styles.heroSubtitle}>Keep the first hello warm, private, and inside the app.</Text>
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

                <Text style={styles.heroSummary}>
                  Interest first. Personal details later.
                </Text>

                <View style={styles.heroMicroRow}>
                  <View style={styles.heroMicroDot} />
                  <Text style={styles.heroMicroText}>A short reminder before the first message leaves your screen.</Text>
                </View>
              </LinearGradientSafe>
            </Animated.View>

            <Animated.View style={[styles.content, contentStyle]}>
              <View style={styles.principles}>
                <Animated.View style={primaryCardStyle}>
                <View style={styles.primaryPrincipleCard}>
                  <View style={styles.primaryPrincipleIconWrap}>
                    <EyeOff size={16} color={theme.accent} />
                  </View>
                  <View style={styles.principleBody}>
                    <Text style={styles.primaryPrincipleTitle}>Keep private details off the table</Text>
                    <Text style={styles.principleText}>No numbers, home addresses, bank details, or off-app pressure.</Text>
                  </View>
                </View>
                </Animated.View>

                <Animated.View style={secondaryCardStyle}>
                <View style={styles.secondaryPrincipleRow}>
                  <View style={styles.secondaryPrincipleIconWrap}>
                    <TriangleAlert size={15} color={theme.accent} />
                  </View>
                  <View style={styles.principleBody}>
                    <Text style={styles.secondaryPrincipleTitle}>Slow down anything that feels off</Text>
                    <Text style={styles.secondaryPrincipleText}>Avoid explicit content and leave the app only when the conversation feels genuine.</Text>
                  </View>
                </View>
                </Animated.View>
              </View>

              <Animated.View style={noteStyle}>
                <View style={styles.notePanel}>
                  <View style={styles.noteHeaderRow}>
                    <Text style={styles.noteTitle}>Best first move</Text>
                    <View style={styles.noteAccentPill}>
                      <Text style={styles.noteAccentText}>Low pressure</Text>
                    </View>
                  </View>
                  <Text style={styles.noteText}>
                    Start with a simple question, keep the chat here, and build comfort before sharing anything personal.
                  </Text>
                </View>
              </Animated.View>

              <Animated.View style={buttonStyle}>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleGotIt} activeOpacity={0.92}>
                  <LinearGradientSafe
                    colors={isDark ? ["#12cfd0", "#0fb2ba"] : ["#11c9ca", "#0fa8b0"]}
                    start={[0, 0]}
                    end={[1, 0]}
                    style={styles.primaryBtnFill}
                  >
                    <View style={styles.primaryBtnSheen} />
                    <View style={styles.primaryBtnContent}>
                      <Check size={17} color="#ffffff" strokeWidth={2.5} />
                      <Text style={styles.primaryText}>Got it</Text>
                    </View>
                  </LinearGradientSafe>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
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
    hero: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16 },
    heroGlow: {
      position: "absolute",
      top: -34,
      right: -12,
      width: 132,
      height: 132,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(0,190,190,0.14)" : "rgba(0,150,150,0.12)",
    },
    heroGlowSoft: {
      position: "absolute",
      bottom: -56,
      left: -26,
      width: 160,
      height: 160,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(120,110,190,0.08)" : "rgba(120,110,190,0.07)",
    },
    heroAccentLine: {
      position: "absolute",
      top: 0,
      left: 18,
      right: 18,
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.42)",
    },
    eyebrowRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 14,
    },
    eyebrowBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      height: 28,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.72)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
    },
    eyebrowText: {
      color: theme.text,
      fontSize: 12,
      fontFamily: "Manrope_800ExtraBold",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    heroDivider: {
      flex: 1,
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
    },
    eyebrowMeta: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.9,
    },
    heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    heroIcon: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: isDark ? "rgba(0,160,160,0.18)" : "rgba(0,128,128,0.12)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
      alignItems: "center",
      justifyContent: "center",
    },
    heroTitle: { fontSize: 24, color: theme.text, fontFamily: "PlayfairDisplay_700Bold" },
    heroSubtitle: { marginTop: 4, color: theme.textMuted, fontFamily: "Manrope_700Bold", lineHeight: 20 },
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
    heroSummary: {
      marginTop: 14,
      color: theme.text,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: "Manrope_800ExtraBold",
      opacity: 0.92,
    },
    heroMicroRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
    },
    heroMicroDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: theme.tint,
      opacity: 0.9,
    },
    heroMicroText: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: "Manrope_700Bold",
    },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
    principles: { gap: 10 },
    primaryPrincipleCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 15,
      borderRadius: 18,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.58)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : theme.outline,
    },
    primaryPrincipleIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 13,
      backgroundColor: isDark ? "rgba(0,160,160,0.14)" : "rgba(0,128,128,0.12)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    secondaryPrincipleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    secondaryPrincipleIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 11,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.40)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    principleBody: { flex: 1 },
    primaryPrincipleTitle: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 18,
      fontFamily: "Manrope_800ExtraBold",
    },
    secondaryPrincipleTitle: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 17,
      fontFamily: "Manrope_800ExtraBold",
    },
    principleText: {
      marginTop: 4,
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Manrope_600SemiBold",
    },
    secondaryPrincipleText: {
      marginTop: 2,
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: "Manrope_700Bold",
    },
    notePanel: {
      marginTop: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: isDark ? "rgba(0,0,0,0.18)" : "rgba(15,23,42,0.04)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)",
    },
    noteHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    noteTitle: {
      color: theme.text,
      fontSize: 12,
      fontFamily: "Manrope_800ExtraBold",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    noteAccentPill: {
      height: 24,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.62)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
      alignItems: "center",
      justifyContent: "center",
    },
    noteAccentText: {
      color: theme.text,
      fontSize: 11,
      fontFamily: "Manrope_800ExtraBold",
      letterSpacing: 0.4,
    },
    noteText: {
      marginTop: 6,
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: "Manrope_700Bold",
    },
    primaryBtn: {
      marginTop: 16,
      height: 50,
      borderRadius: 16,
      backgroundColor: theme.tint,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: isDark ? "#000" : "#0f172a",
      shadowOpacity: isDark ? 0.24 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
      overflow: "hidden",
    },
    primaryBtnFill: {
      flex: 1,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnSheen: {
      position: "absolute",
      top: 0,
      left: -20,
      width: 120,
      height: "100%",
      backgroundColor: "rgba(255,255,255,0.08)",
      transform: [{ skewX: "-20deg" }],
    },
    primaryBtnContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  });
