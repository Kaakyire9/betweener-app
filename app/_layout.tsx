import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAppFonts } from "@/constants/fonts";
import { AuthProvider } from "@/lib/auth-context";

// Keep native splash visible until we decide
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const fontsLoaded = useAppFonts();

  const [showSplash, setShowSplash] = useState(true);

  // Logo animations
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;

  // Text animations
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(8)).current;

  // Glow effect
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.9)).current;

  // Handle deep links
  useEffect(() => {
    const prefix = Linking.createURL("/");
    console.log("App URL prefix:", prefix);

    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log("Initial URL:", url);
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      console.log("Deep link received:", url);
    });

    return () => subscription.remove();
  }, []);

  // Run splash animation once fonts are ready
  useEffect(() => {
    if (!fontsLoaded) return;

    const run = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {}

      Animated.sequence([
        // Logo reveal
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1,
            duration: 620,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),

        // Glow spotlight
        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.7,
            duration: 700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1.1,
            duration: 700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),

        // Brand name
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 520,
            delay: 60,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textTranslate, {
            toValue: 0,
            duration: 520,
            delay: 60,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setTimeout(() => setShowSplash(false), 300);
      });
    };

    run();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <View style={{ flex: 1 }}>
          <Slot />

          {showSplash && (
            <View style={styles.splashOverlay}>
              {/* Classic luxury background */}
              <LinearGradient
                colors={["#070A12", "#0B1220", "#0A1020", "#070A12"]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
              />

              {/* Vignette */}
              <View style={styles.vignette} pointerEvents="none" />

              {/* Glow */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.glow,
                  {
                    opacity: glowOpacity,
                    transform: [{ scale: glowScale }],
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    "rgba(236,72,153,0.55)",
                    "rgba(99,102,241,0.18)",
                    "rgba(0,0,0,0)",
                  ]}
                  start={{ x: 0.2, y: 0.15 }}
                  end={{ x: 0.85, y: 0.9 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>

              {/* Logo + Name */}
              <View style={styles.center}>
                <Animated.Image
                  source={require("../assets/images/splash-icon.png")}
                  resizeMode="contain"
                  style={[
                    styles.logo,
                    {
                      opacity: logoOpacity,
                      transform: [{ scale: logoScale }],
                    },
                  ]}
                />

                <Animated.View
                  style={{
                    opacity: textOpacity,
                    transform: [{ translateY: textTranslate }],
                    alignItems: "center",
                  }}
                >
                  <Text style={styles.name}>Betweener</Text>
                  <View style={styles.underline} />
                </Animated.View>
              </View>
            </View>
          )}
        </View>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },

  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  logo: {
    width: 120,
    height: 120,
    marginBottom: 18,
  },

  name: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: "rgba(255,255,255,0.92)",
  },

  underline: {
    marginTop: 10,
    width: 64,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(236,72,153,0.7)",
  },

  glow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 280,
    overflow: "hidden",
  },

  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
});
