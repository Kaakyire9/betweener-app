import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { Slot, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, Button, Easing, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAppFonts } from "@/constants/fonts";
import { AuthProvider } from "@/lib/auth-context";
import InAppToasts from "@/components/InAppToasts";
import { captureException, initSentry, wrapWithSentry } from "@/lib/telemetry/sentry";
import { SUPABASE_IS_CONFIGURED } from "@/lib/supabase";
import { initPushNotificationUX } from "@/lib/notifications/push";

// Keep native splash visible until we decide
SplashScreen.preventAutoHideAsync().catch(() => {});

// Initialize telemetry as early as possible (safe no-op if DSN isn't set).
initSentry();

function RootLayout() {
  const fontsLoaded = useAppFonts();
  const router = useRouter();

  const colorScheme = useColorScheme();

  const [showSplash, setShowSplash] = useState(false);
  const [allowRender, setAllowRender] = useState(false);

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
    // Be defensive: any uncaught exception during startup can crash a release build (TestFlight)
    // before we can render a fallback UI.
    try {
      const hasAuthPayload = (url: string) =>
        url.includes("access_token=") ||
        url.includes("refresh_token=") ||
        url.includes("code=") ||
        url.includes("token_hash=");

      Linking.getInitialURL()
        .then((url) => {
          if (url && hasAuthPayload(url)) {
            AsyncStorage.setItem("last_deep_link_url", url).catch(() => {});
          }
        })
        .catch((e) => captureException(e, { where: "Linking.getInitialURL" }));

      const subscription = Linking.addEventListener("url", ({ url }) => {
        try {
          if (url && hasAuthPayload(url)) {
            AsyncStorage.setItem("last_deep_link_url", url).catch(() => {});
          }
        } catch (e) {
          captureException(e, { where: "Linking.urlListener" });
        }
      });

      return () => {
        try {
          subscription.remove();
        } catch (e) {
          captureException(e, { where: "Linking.subscription.remove" });
        }
      };
    } catch (e) {
      captureException(e, { where: "Linking.useEffect" });
      return;
    }
  }, []);

  useEffect(() => {
    try {
      // Make sure channels/categories exist before any push arrives (esp. Android channels).
      initPushNotificationUX().catch(() => {});
    } catch (e) {
      captureException(e, { where: "initPushNotificationUX" });
    }
  }, []);

  useEffect(() => {
    // Same reasoning as deep links: don't let a notification handler crash a release build.
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const action = response.actionIdentifier;
          const data = response.notification.request.content.data as Record<string, any> | undefined;
          const type = data?.type;

          // Category actions: treat OPEN_* the same as a normal tap.
          const isDefaultTap = action === Notifications.DEFAULT_ACTION_IDENTIFIER;
          const isOpenAction = action === "OPEN_CHAT" || action === "OPEN_PROFILE";
          if (!isDefaultTap && !isOpenAction) {
            // Unknown action; ignore safely.
            return;
          }

          if (type === "message" || type === "message_reaction") {
            const chatId = data?.profile_id || data?.reactor_id || data?.user_id;
            if (chatId) {
              router.push({
                pathname: "/chat/[id]",
                params: {
                  id: String(chatId),
                  userName: data?.name ? String(data.name) : "",
                  userAvatar: data?.avatar_url ? String(data.avatar_url) : "",
                },
              });
              return;
            }
          }

          const route = typeof data?.route === "string" ? String(data.route) : "";
          if (route && route.startsWith("/")) {
            router.push(route);
            return;
          }

          const profileId = data?.profile_id || data?.profileId;
          if (profileId) {
            router.push({ pathname: "/profile-view", params: { profileId: String(profileId) } });
          }
        } catch (e) {
          captureException(e, { where: "Notifications.responseListener" });
        }
      });

      return () => {
        try {
          subscription.remove();
        } catch (e) {
          captureException(e, { where: "Notifications.subscription.remove" });
        }
      };
    } catch (e) {
      captureException(e, { where: "Notifications.useEffect" });
      return;
    }
  }, [router]);

  // Always release native splash even if fonts hang.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAllowRender(true);
      SplashScreen.hideAsync().catch(() => {});
    }, 1200);

    if (fontsLoaded) {
      setAllowRender(true);
      SplashScreen.hideAsync().catch(() => {});
    }

    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  if (!allowRender) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <View style={{ flex: 1, backgroundColor: Colors[colorScheme].background }}>
          <Slot />
          <InAppToasts />

          {!SUPABASE_IS_CONFIGURED && (
            <View style={styles.envBanner} pointerEvents="none">
              <Text style={styles.envBannerText}>
                Backend configuration missing (Supabase). Reinstall this build or contact support.
              </Text>
            </View>
          )}

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

  envBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(220,38,38,0.92)",
  },

  envBannerText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

});

export default wrapWithSentry(RootLayout);
