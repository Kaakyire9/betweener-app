// Example: Animated Get Started Button
// filepath: c:\Users\HP\OneDrive\Documents\Projects\betweener-app\app\(auth)\welcome.tsx
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TRUST_LINKS, openExternalUrl } from "@/lib/trust-links";

export default function WelcomeScreen() {
  const router = useRouter();
  const gradientColors = useMemo(
    () => ["#0B2324", "#176A6A", "#886CB8", "#F4E0D0"] as const,
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
        colors={["rgba(97,224,218,0.22)", "rgba(97,224,218,0.0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.orbTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["rgba(213,164,255,0.32)", "rgba(213,164,255,0.02)"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.orbBottom}
        pointerEvents="none"
      />
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
          <View style={styles.brandLockup}>
            <View style={styles.brandMarkFrame}>
              <View style={styles.brandHaloPrimary} />
              <View style={styles.brandHaloSecondary} />
              <Image
                source={require("../../assets/images/foreground-icon.png")}
                style={styles.brandMark}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brand}>Betweener</Text>
            <Text style={styles.brandCaption}>Intentional dating with trust and chemistry.</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroText}>Meet with more context.{"\n"}Match the <Text style={styles.heroBold}>Vibe</Text>.</Text>
          <Text style={styles.heroSubtext}>
            Verified profiles.{"\n"}Real context.{"\n"}Better chemistry.
          </Text>
        </View>

        <View style={styles.footerWrap}>
          <LinearGradient
            colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0.08)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.footerCard}
          >
            <View style={styles.signalRow}>
              <View style={styles.signalPill}>
                <Text style={styles.signalText}>Verified profiles</Text>
              </View>
              <View style={styles.signalPill}>
                <Text style={styles.signalText}>Circles</Text>
              </View>
              <View style={styles.signalPill}>
                <Text style={styles.signalText}>Moments</Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.replace("/(auth)/signup-options")}
              style={styles.ctaButtonPrimary}
            >
              <Ionicons name="sparkles" size={18} color="#0F172A" />
              <Text style={styles.ctaText}>Create account</Text>
            </Pressable>

            <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Already have an account? Sign in</Text>
            </Pressable>

            <Text style={styles.legal}>
              {"By tapping \"Create account\" or \"Sign in\", you agree to our "}
              <Text style={styles.legalLink} onPress={() => void openExternalUrl(TRUST_LINKS.terms)}>Terms</Text>.
              {" "}Learn how we process your data in our{" "}
              <Text style={styles.legalLink} onPress={() => void openExternalUrl(TRUST_LINKS.privacy)}>Privacy Policy</Text>
              {" "}and{" "}
              <Text style={styles.legalLink} onPress={() => void openExternalUrl(TRUST_LINKS.cookies)}>Cookies Policy</Text>.
            </Text>
          </LinearGradient>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  orbTop: {
    position: "absolute",
    top: 40,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  orbBottom: {
    position: "absolute",
    right: -96,
    bottom: 154,
    width: 228,
    height: 228,
    borderRadius: 114,
    opacity: 0.52,
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
    paddingTop: 10,
    paddingBottom: 18,
  },
  topRow: {
    paddingTop: 12,
    paddingBottom: 18,
  },
  brandLockup: {
    alignItems: "center",
    gap: 8,
  },
  brandMarkFrame: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  brandHaloPrimary: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(97,224,218,0.20)",
    shadowColor: "#61E0DA",
    shadowOpacity: 0.32,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  brandHaloSecondary: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(213,164,255,0.16)",
  },
  brandMark: {
    width: 76,
    height: 76,
  },
  brand: {
    color: "#ffffff",
    fontFamily: "Archivo_700Bold",
    fontSize: 31,
    letterSpacing: 0.4,
  },
  brandCaption: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
    paddingHorizontal: 28,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    gap: 12,
  },
  heroText: {
    color: "#ffffff",
    fontSize: 38,
    textAlign: "center",
    fontFamily: "Manrope_400Regular",
    lineHeight: 45,
  },
  heroBold: {
    fontFamily: "Archivo_700Bold",
  },
  heroSubtext: {
    color: "rgba(255,255,255,0.84)",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 26,
    fontFamily: "Archivo_700Bold",
    paddingHorizontal: 18,
  },
  signalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 10,
  },
  signalPill: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  signalText: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Manrope_600SemiBold",
  },
  footerWrap: {
    paddingBottom: 2,
  },
  footerCard: {
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    gap: 9,
    overflow: "hidden",
  },
  legal: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: "center",
    fontFamily: "Manrope_400Regular",
    paddingHorizontal: 4,
    marginTop: 1,
  },
  legalLink: {
    textDecorationLine: "underline",
    textDecorationStyle: "solid",
  },
  ctaButtonPrimary: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaText: {
    color: "#0F172A",
    fontSize: 16,
    fontFamily: "Manrope_700Bold",
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryText: {
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Manrope_600SemiBold",
  },
});
