import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import SignalIcon from "@/components/icons/SignalIcon";
import { haptics } from "@/lib/haptics";
import { type ResponsiveMetrics, useResponsiveMetrics } from "@/lib/responsive";
import { beginSignupSession } from "@/lib/signup-tracking";
import { TRUST_LINKS, openExternalUrl } from "@/lib/trust-links";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const getWelcomeMetrics = (responsive: ResponsiveMetrics) => {
  return {
    compactHeight: responsive.compactHeight,
    mediumHeight: responsive.mediumHeight,
    compactWidth: responsive.compactWidth,
    safePaddingHorizontal: responsive.compactWidth ? 20 : 24,
    safePaddingTop: responsive.compactHeight ? 4 : 10,
    safePaddingBottom: responsive.compactHeight ? 12 : 18,
    logoFrame: responsive.compactHeight ? 74 : 82,
    brandFontSize: responsive.compactHeight ? 29 : 32,
    brandGap: responsive.compactHeight ? 5 : 11,
    topPadding: responsive.compactHeight ? 4 : 10,
    topBottomPadding: responsive.compactHeight ? 4 : 8,
    heroGap: responsive.compactHeight ? 10 : 13,
    headlineFontSize: responsive.compactWidth ? 34 : responsive.compactHeight ? 35 : 36,
    headlineLineHeight: responsive.compactWidth ? 39 : responsive.compactHeight ? 40 : 41,
    subtitleFontSize: responsive.compactHeight ? 13 : 14,
    subtitleLineHeight: responsive.compactHeight ? 20 : 22,
    signalPaddingVertical: responsive.compactHeight ? 9 : 11,
    footerPaddingTop: responsive.compactHeight ? 13 : 15,
    footerPaddingBottom: responsive.compactHeight ? 10 : 12,
    ctaPaddingVertical: responsive.compactHeight ? 13 : 14,
    secondaryPaddingVertical: responsive.compactHeight ? 10 : 11,
    legalFontSize: responsive.compactHeight ? 10 : 10.5,
    legalLineHeight: responsive.compactHeight ? 14 : 15,
  };
};

export default function WelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const responsive = useResponsiveMetrics();
  const metrics = useMemo(() => getWelcomeMetrics(responsive), [responsive]);
  const variantParam = (() => {
    const raw = params?.variant;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0];
    return null;
  })();
  const gradientColors = useMemo(
    () => ["#061719", "#0B2A2D", "#165E63", "#7C5C9F", "#F0D9C7"] as const,
    []
  );
  const entrance = useSharedValue(0);
  const ambient = useSharedValue(0);

  useEffect(() => {
    entrance.value = withTiming(1, { duration: 680, easing: Easing.out(Easing.cubic) });
    ambient.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 9000, easing: Easing.inOut(Easing.cubic) })
      ),
      -1,
      false
    );
  }, [ambient, entrance]);

  const topGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.62 + ambient.value * 0.14,
    transform: [
      { translateX: ambient.value * 8 },
      { translateY: ambient.value * 5 },
    ] as const,
  }));

  const bottomGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.36 + ambient.value * 0.1,
    transform: [
      { translateX: -ambient.value * 7 },
      { translateY: -ambient.value * 5 },
    ] as const,
  }));

  const brandEntranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 10 },
      { scale: 0.96 + entrance.value * 0.04 },
    ] as const,
  }));

  const heroEntranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 14 }] as const,
  }));

  const signalEntranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 18 }] as const,
  }));

  const footerEntranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 22 }] as const,
  }));

  const handleCreateAccount = async () => {
    await haptics.light();
    await beginSignupSession(variantParam);
    router.replace(
      variantParam
        ? { pathname: "/(auth)/signup-options", params: { variant: variantParam } }
        : "/(auth)/signup-options"
    );
  };

  const handleSignIn = async () => {
    await haptics.light();
    router.replace(
      variantParam
        ? { pathname: "/(auth)/login", params: { variant: variantParam } }
        : "/(auth)/login"
    );
  };

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 0.9, y: 0.95 }}
      style={styles.gradient}
    >
      <Animated.View style={[styles.orbTop, topGlowStyle]} pointerEvents="none">
        <LinearGradient
          colors={["rgba(19,168,168,0.22)", "rgba(19,168,168,0.0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.orbBottom, bottomGlowStyle]} pointerEvents="none">
        <LinearGradient
          colors={["rgba(139,92,255,0.28)", "rgba(244,232,208,0.08)"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
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
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            paddingHorizontal: metrics.safePaddingHorizontal,
            paddingTop: metrics.safePaddingTop,
            paddingBottom: metrics.safePaddingBottom,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.topRow,
            brandEntranceStyle,
            { paddingTop: metrics.topPadding, paddingBottom: metrics.topBottomPadding },
          ]}
        >
          <View style={styles.brandLockup}>
            <View style={[styles.brandMarkFrame, { width: metrics.logoFrame, height: metrics.logoFrame }]}>
              <View
                style={[
                  styles.brandHaloPrimary,
                  {
                    width: metrics.logoFrame * 0.88,
                    height: metrics.logoFrame * 0.88,
                    borderRadius: metrics.logoFrame * 0.44,
                  },
                ]}
              />
              <View
                style={[
                  styles.brandHaloSecondary,
                  {
                    width: metrics.logoFrame * 0.7,
                    height: metrics.logoFrame * 0.7,
                    borderRadius: metrics.logoFrame * 0.35,
                  },
                ]}
              />
              <Image
                source={require("../../assets/images/foreground-icon.png")}
                style={[
                  styles.brandMark,
                  { width: metrics.logoFrame * 0.8, height: metrics.logoFrame * 0.8 },
                ]}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.brand, { fontSize: metrics.brandFontSize, marginTop: metrics.brandGap }]}>Betweener</Text>
            <Text style={styles.brandCaption}>Intentional dating with trust and chemistry.</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.hero, heroEntranceStyle, { gap: metrics.heroGap }]}>
          <View style={styles.heroKickerPill}>
            <View style={styles.heroKickerDot} />
            <Text style={styles.heroKicker}>Intentional discovery</Text>
          </View>
          <Text
            style={[
              styles.heroText,
              { fontSize: metrics.headlineFontSize, lineHeight: metrics.headlineLineHeight },
            ]}
          >
            Find the <Text style={styles.heroBold}>signal</Text>{"\n"}beyond the swipe.
          </Text>
          <Text
            style={[
              styles.heroSubtext,
              { fontSize: metrics.subtitleFontSize, lineHeight: metrics.subtitleLineHeight },
            ]}
          >
            Verified profiles, shared moments, and clear intent before the first message.
          </Text>
          <Animated.View
            style={[
              styles.intentArtifact,
              signalEntranceStyle,
              { paddingVertical: metrics.signalPaddingVertical },
            ]}
          >
            <BlurViewSafe
              intensity={Platform.OS === "ios" ? 24 : 0}
              tint="dark"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["rgba(7,30,34,0.68)", "rgba(42,24,62,0.30)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.intentIconWrap}>
              <SignalIcon size={24} color="#13A8A8" accentColor="#8B5CFF" active strokeWidth={2} />
            </View>
            <View style={styles.intentCopy}>
              <Text style={styles.intentLabel}>SIGNAL · 48H</Text>
              <Text style={styles.intentText}>They noticed your energy.</Text>
            </View>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.footerWrap, footerEntranceStyle]}>
          <LinearGradient
            colors={
              Platform.OS === "ios"
                ? ["rgba(255,255,255,0.13)", "rgba(255,255,255,0.055)"]
                : ["rgba(7,30,34,0.44)", "rgba(7,30,34,0.24)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.footerCard,
              {
                paddingTop: metrics.footerPaddingTop,
                paddingBottom: metrics.footerPaddingBottom,
              },
            ]}
          >
            <BlurViewSafe
              intensity={Platform.OS === "ios" ? 28 : 0}
              tint="dark"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.footerRim} pointerEvents="none" />
            <View style={styles.signalRow}>
              <View style={styles.signalPill}>
                <Ionicons name="shield-checkmark" size={13} color="#F4E8D0" />
                <Text style={styles.signalText}>Verified</Text>
              </View>
              <View style={styles.signalPill}>
                <Ionicons name="people" size={13} color="#F4E8D0" />
                <Text style={styles.signalText}>Circles</Text>
              </View>
              <View style={styles.signalPill}>
                <Ionicons name="sparkles" size={13} color="#F4E8D0" />
                <Text style={styles.signalText}>Moments</Text>
              </View>
            </View>

            <Pressable
              onPress={() => void handleCreateAccount()}
              style={({ pressed }) => [
                styles.ctaButtonPrimary,
                { paddingVertical: metrics.ctaPaddingVertical },
                pressed && styles.ctaButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              <Ionicons name="sparkles" size={16} color="#0F172A" />
              <Text style={styles.ctaText}>Create account</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleSignIn()}
              style={({ pressed }) => [
                styles.secondaryButton,
                { paddingVertical: metrics.secondaryPaddingVertical },
                pressed && styles.secondaryButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.secondaryText}>Already have an account? Sign in</Text>
            </Pressable>

            <Text
              style={[
                styles.legal,
                { fontSize: metrics.legalFontSize, lineHeight: metrics.legalLineHeight },
              ]}
            >
              {"By tapping \"Create account\" or \"Sign in\", you agree to our "}
              <Text style={styles.legalLink} onPress={() => void openExternalUrl(TRUST_LINKS.terms)}>Terms</Text>.
              {" "}Learn how we process your data in our{" "}
              <Text style={styles.legalLink} onPress={() => void openExternalUrl(TRUST_LINKS.privacy)}>Privacy Policy</Text>
              {" "}and{" "}
              <Text style={styles.legalLink} onPress={() => void openExternalUrl(TRUST_LINKS.cookies)}>Cookies Policy</Text>.
            </Text>
          </LinearGradient>
        </Animated.View>
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
    top: 34,
    left: -72,
    width: 226,
    height: 226,
    borderRadius: 113,
    opacity: 0.74,
    overflow: "hidden",
  },
  orbBottom: {
    position: "absolute",
    right: -112,
    bottom: 142,
    width: 236,
    height: 236,
    borderRadius: 118,
    opacity: 0.42,
    overflow: "hidden",
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
  },
  topRow: {
  },
  brandLockup: {
    alignItems: "center",
    gap: 7,
  },
  brandMarkFrame: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  brandHaloPrimary: {
    position: "absolute",
    backgroundColor: "rgba(19,168,168,0.16)",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.28,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  brandHaloSecondary: {
    position: "absolute",
    backgroundColor: "rgba(244,232,208,0.13)",
  },
  brandMark: {
  },
  brand: {
    color: "#F8F3E9",
    fontFamily: "Archivo_700Bold",
    letterSpacing: 0,
  },
  brandCaption: {
    color: "rgba(248,243,233,0.78)",
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
    paddingHorizontal: 28,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  heroKickerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(7,30,34,0.22)",
    borderWidth: 1,
    borderColor: "rgba(244,232,208,0.16)",
  },
  heroKickerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#13A8A8",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.65,
    shadowRadius: 8,
  },
  heroKicker: {
    color: "rgba(248,243,233,0.86)",
    fontSize: 11,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroText: {
    color: "#FFF8EF",
    textAlign: "center",
    fontFamily: "Manrope_400Regular",
  },
  heroBold: {
    fontFamily: "Archivo_700Bold",
  },
  heroSubtext: {
    color: "rgba(248,243,233,0.80)",
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    paddingHorizontal: 24,
    maxWidth: 350,
  },
  intentArtifact: {
    marginTop: 2,
    width: "78%",
    minWidth: 286,
    maxWidth: 330,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 24,
    paddingHorizontal: 14,
    backgroundColor: Platform.OS === "ios" ? "rgba(7,30,34,0.18)" : "rgba(7,30,34,0.62)",
    borderWidth: 1,
    borderColor: "rgba(19,168,168,0.22)",
    shadowColor: "#13A8A8",
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    overflow: "hidden",
  },
  intentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(19,168,168,0.14)",
    borderWidth: 1,
    borderColor: "rgba(19,168,168,0.28)",
  },
  intentCopy: {
    flex: 1,
    minWidth: 0,
  },
  intentLabel: {
    color: "#F4E8D0",
    fontSize: 11,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    includeFontPadding: false,
  },
  intentText: {
    color: "rgba(248,243,233,0.82)",
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: "Manrope_500Medium",
    marginTop: 1,
    includeFontPadding: false,
  },
  signalRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  signalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(244,232,208,0.15)",
  },
  signalText: {
    color: "rgba(248,243,233,0.92)",
    fontSize: 12,
    fontFamily: "Manrope_600SemiBold",
  },
  footerWrap: {
    paddingBottom: 2,
  },
  footerCard: {
    borderRadius: 32,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: "rgba(244,232,208,0.13)",
    gap: 9,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  footerRim: {
    position: "absolute",
    top: 0,
    left: 22,
    right: 22,
    height: 1,
    backgroundColor: "rgba(244,232,208,0.30)",
  },
  legal: {
    color: "rgba(248,243,233,0.68)",
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
    backgroundColor: "#FFF8EF",
    borderRadius: 999,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#F4E8D0",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  ctaText: {
    color: "#0F172A",
    fontSize: 16,
    fontFamily: "Manrope_700Bold",
  },
  secondaryButton: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7,30,34,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,232,208,0.13)",
  },
  secondaryButtonPressed: {
    opacity: 0.78,
  },
  secondaryText: {
    color: "rgba(248,243,233,0.92)",
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Manrope_600SemiBold",
  },
});
