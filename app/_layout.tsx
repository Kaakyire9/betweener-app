import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { Slot, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAppFonts } from "@/constants/fonts";
import { AuthProvider } from "@/lib/auth-context";
import AccountRecoveryNotice from "@/components/AccountRecoveryNotice";
import InAppToasts from "@/components/InAppToasts";
import { captureException, initSentry, wrapWithSentry } from "@/lib/telemetry/sentry";
import { SUPABASE_IS_CONFIGURED } from "@/lib/supabase";
import { initPushNotificationUX } from "@/lib/notifications/push";
import {
  hasFreshPendingAuthFlow,
  isTrustedAuthCallbackUrl,
  LAST_DEEP_LINK_URL_KEY,
  urlHasAuthPayload,
} from "@/lib/auth-callback";

// Keep native splash visible until we decide
SplashScreen.preventAutoHideAsync().catch(() => {});

// Initialize telemetry as early as possible (safe no-op if DSN isn't set).
initSentry();

function RootLayout() {
  const fontsLoaded = useAppFonts();
  const router = useRouter();

  const colorScheme = useColorScheme();

  const [showSplash, setShowSplash] = useState(true);
  const [allowRender, setAllowRender] = useState(false);

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashShift = useRef(new Animated.Value(0)).current;
  const ambienceOpacity = useRef(new Animated.Value(0)).current;

  // Logo animations
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;
  const frameOpacity = useRef(new Animated.Value(0)).current;

  // Text animations
  const textTranslate = useRef(new Animated.Value(56)).current;
  const textScale = useRef(new Animated.Value(0.82)).current;

  // Glow and accent effects
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.76)).current;
  const shimmerTranslate = useRef(new Animated.Value(-240)).current;
  const footerTranslate = useRef(new Animated.Value(34)).current;
  const footerScale = useRef(new Animated.Value(0.94)).current;
  const underlineScale = useRef(new Animated.Value(0.08)).current;
  const orbDrift = useRef(new Animated.Value(0)).current;

  // Handle deep links
  useEffect(() => {
    // Be defensive: any uncaught exception during startup can crash a release build (TestFlight)
    // before we can render a fallback UI.
    try {
      const maybeStoreAuthCallbackUrl = async (url: string) => {
        if (!urlHasAuthPayload(url) || !isTrustedAuthCallbackUrl(url)) {
          return;
        }

        const hasPendingFlow = await hasFreshPendingAuthFlow();
        if (!hasPendingFlow) {
          return;
        }

        await AsyncStorage.setItem(LAST_DEEP_LINK_URL_KEY, url);
      };

      Linking.getInitialURL()
        .then((url) => {
          if (url) {
            void maybeStoreAuthCallbackUrl(url).catch(() => {});
          }
        })
        .catch((e) => captureException(e, { where: "Linking.getInitialURL" }));

      const subscription = Linking.addEventListener("url", ({ url }) => {
        try {
          if (url) {
            void maybeStoreAuthCallbackUrl(url).catch(() => {});
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
      const handleResponse = (response: Notifications.NotificationResponse) => {
        try {
          const action = response.actionIdentifier;
          const data = response.notification.request.content.data as Record<string, any> | undefined;
          const pushType = data?.type;

          // Category actions: treat OPEN_* the same as a normal tap.
          const isDefaultTap = action === Notifications.DEFAULT_ACTION_IDENTIFIER;
          const isOpenAction = action === "OPEN_CHAT" || action === "OPEN_PROFILE";
          if (!isDefaultTap && !isOpenAction) {
            // Unknown action; ignore safely.
            return;
          }

          if (pushType === "message" || pushType === "message_reaction") {
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

          if (pushType === "moment_reaction" || pushType === "moment_comment") {
            const startUserId = data?.start_user_id || data?.moment_owner_user_id || data?.user_id;
            const momentId = data?.moment_id || data?.momentId;
            router.push({
              pathname: "/moments",
              params: {
                startUserId: startUserId ? String(startUserId) : "",
                startMomentId: momentId ? String(momentId) : "",
              },
            });
            return;
          }

          // Intent reminders: route to the Intent inbox (actionable view) so users can accept/pass quickly.
          if (pushType === "intent_expiring_soon" || pushType === "intent_last_chance") {
            const requestId = data?.request_id || data?.requestId;
            const requestType = data?.request_type || data?.requestType;
            router.push({
              pathname: "/(tabs)/intent",
              params: {
                requestId: requestId ? String(requestId) : "",
                // Reuse the existing `?type=` deep-link behavior in IntentScreen.
                type: requestType ? String(requestType) : "",
              },
            });
            return;
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
      };

      // Handle taps that launched the app from a terminated state.
      Notifications.getLastNotificationResponseAsync()
        .then((initial) => {
          if (initial) handleResponse(initial);
        })
        .catch((e) => captureException(e, { where: "Notifications.getLastNotificationResponseAsync" }));

      const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

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
    }, 1200);

    if (fontsLoaded) {
      setAllowRender(true);
    }

    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  useEffect(() => {
    if (!allowRender) return;
    const hideTimer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 120);
    return () => clearTimeout(hideTimer);
  }, [allowRender]);

  useEffect(() => {
    if (!allowRender || !showSplash) return;

    const entrance = Animated.parallel([
      Animated.timing(ambienceOpacity, {
        toValue: 1,
        duration: 720,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(frameOpacity, {
        toValue: 1,
        duration: 700,
        delay: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 900,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(glowScale, {
        toValue: 1,
        duration: 1100,
        delay: 140,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 44,
        useNativeDriver: true,
      }),
      Animated.timing(textTranslate, {
        toValue: 0,
        duration: 980,
        delay: 540,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.spring(textScale, {
        toValue: 1,
        friction: 9,
        tension: 36,
        useNativeDriver: true,
      }),
      Animated.timing(underlineScale, {
        toValue: 1,
        duration: 760,
        delay: 1380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(footerTranslate, {
        toValue: 0,
        duration: 760,
        delay: 1280,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.spring(footerScale, {
        toValue: 1,
        friction: 9,
        tension: 40,
        useNativeDriver: true,
      }),
    ]);

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoFloat, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1.08,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(logoFloat, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    const orbLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbDrift, {
          toValue: 1,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(orbDrift, {
          toValue: 0,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerTranslate, {
        toValue: 240,
        duration: 1700,
        delay: 620,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );

    entrance.start();
    floatLoop.start();
    orbLoop.start();
    shimmerLoop.start();

    const exitTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 480,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(splashShift, {
          toValue: -12,
          duration: 480,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShowSplash(false);
        }
      });
    }, 4400);

    return () => {
      clearTimeout(exitTimer);
      entrance.stop();
      floatLoop.stop();
      orbLoop.stop();
      shimmerLoop.stop();
    };
  }, [
    ambienceOpacity,
    frameOpacity,
    allowRender,
    footerScale,
    footerTranslate,
    glowOpacity,
    glowScale,
    logoFloat,
    logoScale,
    orbDrift,
    shimmerTranslate,
    showSplash,
    splashOpacity,
    splashShift,
    textScale,
    textTranslate,
    underlineScale,
  ]);

  if (!allowRender) return null;

  const logoLift = logoFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const orbLift = orbDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18],
  });

  const orbDrop = orbDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 16],
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <View style={{ flex: 1, backgroundColor: Colors[colorScheme].background }}>
          <Slot />
          <InAppToasts />
          <AccountRecoveryNotice />

          {!SUPABASE_IS_CONFIGURED && (
            <View style={styles.envBanner} pointerEvents="none">
              <Text style={styles.envBannerText}>
                Backend configuration missing (Supabase). Reinstall this build or contact support.
              </Text>
            </View>
          )}

          {showSplash && (
            <View style={styles.splashOverlay}>
              <Animated.View
                style={[
                  styles.splashScene,
                  {
                    opacity: splashOpacity,
                    transform: [{ translateY: splashShift }],
                  },
                ]}
              >
                <LinearGradient
                  colors={["#03060F", "#09111F", "#101A2E", "#05070D"]}
                  start={{ x: 0.08, y: 0 }}
                  end={{ x: 0.92, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.orbPrimary,
                    {
                      opacity: ambienceOpacity,
                      transform: [{ translateY: orbLift }],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={["rgba(46,196,182,0.34)", "rgba(46,196,182,0)"]}
                    start={{ x: 0.3, y: 0.2 }}
                    end={{ x: 0.8, y: 0.95 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.orbSecondary,
                    {
                      opacity: ambienceOpacity,
                      transform: [{ translateY: orbDrop }],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={["rgba(124,58,237,0.24)", "rgba(251,191,36,0)"]}
                    start={{ x: 0.15, y: 0.15 }}
                    end={{ x: 0.9, y: 0.85 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <View style={styles.vignette} pointerEvents="none" />

                <SafeAreaView style={styles.splashShell}>
                  <View style={styles.heroSpacer} />

                  <View style={styles.center}>
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
                          "rgba(46,196,182,0.34)",
                          "rgba(124,58,237,0.26)",
                          "rgba(251,191,36,0.08)",
                          "rgba(0,0,0,0)",
                        ]}
                        start={{ x: 0.18, y: 0.16 }}
                        end={{ x: 0.86, y: 0.9 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>

                    <View style={styles.logoStage}>
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.logoFrame,
                          {
                            opacity: frameOpacity,
                            transform: [{ scale: logoScale }, { translateY: logoLift }],
                          },
                        ]}
                      >
                        <LinearGradient
                          colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.05)"]}
                          start={{ x: 0.15, y: 0 }}
                          end={{ x: 0.85, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </Animated.View>
                      <Animated.Image
                        source={require("../assets/images/foreground-icon.png")}
                        resizeMode="contain"
                        style={[
                          styles.logo,
                          {
                            transform: [{ translateY: logoLift }],
                          },
                        ]}
                      />
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.shimmer,
                          {
                            opacity: frameOpacity,
                            transform: [{ translateX: shimmerTranslate }, { rotate: "18deg" }],
                          },
                        ]}
                      >
                        <LinearGradient
                          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </Animated.View>
                    </View>

                    <Animated.View
                      style={[
                        styles.brandLockup,
                        {
                          transform: [{ translateY: textTranslate }, { scale: textScale }],
                        },
                      ]}
                    >
                      <Text style={styles.nameShadow}>Betweener</Text>
                      <Text style={styles.name}>Betweener</Text>
                      <View style={styles.underlineWrap}>
                        <Animated.View
                          style={[
                            styles.underline,
                            {
                              transform: [{ scaleX: underlineScale }],
                            },
                          ]}
                        />
                      </View>
                    </Animated.View>
                  </View>

                  <Animated.View
                    style={[
                      styles.footer,
                      {
                        transform: [{ translateY: footerTranslate }, { scale: footerScale }],
                      },
                    ]}
                  >
                    <View style={styles.footerBadge}>
                      <View style={styles.footerDot} />
                      <Text style={styles.footerText}>2026 Nyansapa Ltd</Text>
                    </View>
                  </Animated.View>
                </SafeAreaView>
              </Animated.View>
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
  },

  splashScene: {
    flex: 1,
  },

  splashShell: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 26,
  },

  heroSpacer: {
    height: 24,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },

  glow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    overflow: "hidden",
  },

  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",
  },

  orbPrimary: {
    position: "absolute",
    top: -80,
    left: -56,
    width: 280,
    height: 280,
    borderRadius: 280,
    overflow: "hidden",
  },

  orbSecondary: {
    position: "absolute",
    right: -42,
    bottom: 180,
    width: 260,
    height: 260,
    borderRadius: 260,
    overflow: "hidden",
  },

  logoStage: {
    width: 208,
    height: 188,
    alignItems: "center",
    justifyContent: "center",
  },

  logoFrame: {
    position: "absolute",
    width: 198,
    height: 198,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(11,18,33,0.52)",
    shadowColor: "#2EC4B6",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },

  shimmer: {
    position: "absolute",
    top: 4,
    bottom: 4,
    width: 110,
  },

  logo: {
    width: 184,
    height: 184,
  },

  brandLockup: {
    marginTop: 4,
    alignItems: "center",
    minWidth: 280,
  },

  nameShadow: {
    position: "absolute",
    top: 5,
    color: "rgba(17,197,198,0.26)",
    fontSize: 48,
    fontFamily: "PlayfairDisplay_700Bold",
    letterSpacing: 0.2,
    lineHeight: 56,
  },

  name: {
    color: "#F7F5EF",
    fontSize: 48,
    fontFamily: "PlayfairDisplay_700Bold",
    letterSpacing: 0.2,
    lineHeight: 56,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.34)",
    textShadowOffset: { width: 0, height: 10 },
    textShadowRadius: 22,
  },

  underlineWrap: {
    marginTop: 8,
    width: 136,
    alignItems: "center",
  },

  underline: {
    width: "100%",
    height: 3,
    borderRadius: 999,
    backgroundColor: "#E7C78D",
  },

  footer: {
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 42,
  },

  footerBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(12,20,34,0.46)",
  },

  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(231,199,141,0.82)",
    marginRight: 8,
  },

  footerText: {
    color: "rgba(244,239,230,0.9)",
    fontSize: 12,
    fontFamily: "Manrope_600SemiBold",
    letterSpacing: 0.9,
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
