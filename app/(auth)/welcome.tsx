// Example: Animated Get Started Button
// filepath: c:\Users\HP\OneDrive\Documents\Projects\betweener-app\app\(auth)\welcome.tsx
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

export default function WelcomeScreen() {
  const router = useRouter();
  const gradientColors = useMemo(
    () => [Colors.light.tint, Colors.light.accent, Colors.light.background] as const,
    []
  );

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 0.9, y: 0.95 }}
      style={styles.gradient}
    >
      <LinearGradient
        colors={["rgba(0,0,0,0.18)", "rgba(0,0,0,0.0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={styles.vignetteTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.25)"]}
        start={{ x: 0.5, y: 0.4 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.vignetteBottom}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topRow}>
          <View style={styles.topLeftSpacer} />
          <View style={styles.brandLockup}>
            <Image
              source={require("../../assets/images/foreground-icon.png")}
              style={styles.brandMark}
              resizeMode="contain"
            />
            <Text style={styles.brand}>Betweener</Text>
          </View>
          <View style={styles.topRightSpacer} />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroText}>
            Match the{"\n"}
            <Text style={styles.heroBold}>Vibe</Text>
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.legal}>
            By tapping "Create account" or "Sign in", you agree to our{" "}
            <Text style={styles.legalLink}>Terms</Text>. Learn how we process
            your data in our <Text style={styles.legalLink}>Privacy Policy</Text>{" "}
            and <Text style={styles.legalLink}>Cookies Policy</Text>.
          </Text>

          <Pressable
            onPress={() => router.replace("/(auth)/verify-phone")}
            style={styles.ctaButtonPrimary}
          >
            <Ionicons name="call" size={18} color="#0F172A" />
            <Text style={styles.ctaText}>Continue with phone</Text>
          </Pressable>
          <Text style={styles.ctaNote}>
            We’ll send a secure verification code. Please use a number you can access.
          </Text>

          <Pressable onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.helpText}>Already have an account? Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  vignetteTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "45%",
  },
  vignetteBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "55%",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandLockup: {
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  brandMark: {
    width: 64,
    height: 64,
  },
  topLeftSpacer: {
    width: 40,
    height: 40,
  },
  brand: {
    color: "#ffffff",
    fontFamily: "Archivo_700Bold",
    fontSize: 26,
    letterSpacing: 0.8,
  },
  topRightSpacer: {
    width: 40,
    height: 40,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  heroText: {
    color: "#ffffff",
    fontSize: 36,
    textAlign: "center",
    fontFamily: "Manrope_400Regular",
    lineHeight: 44,
  },
  heroBold: {
    fontFamily: "Archivo_700Bold",
  },
  footer: {
    gap: 14,
  },
  legal: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: "center",
    fontFamily: "Manrope_400Regular",
    paddingHorizontal: 6,
  },
  legalLink: {
    textDecorationLine: "underline",
    textDecorationStyle: "solid",
  },
  ctaButtonPrimary: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: {
    color: "#0F172A",
    fontSize: 15,
    fontFamily: "Manrope_700Bold",
  },
  helpText: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Manrope_600SemiBold",
  },
  ctaNote: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: "Manrope_400Regular",
    paddingHorizontal: 12,
  },
});
