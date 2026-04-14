import { Colors } from "@/constants/theme";
import { clearPendingAuthFlow, markPendingAuthFlow } from "@/lib/auth-callback";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const WAITING_COPY = "Waiting for email verification";
const PENDING_EMAIL_KEY = "pending_verification_email";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { verified, error: urlError, email: routeEmail, recovery } = useLocalSearchParams();
  const isRecoveryEmailFlow = recovery === "true";

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isVerified, setIsVerified] = useState(false);

  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const dotValues = useRef([
    new Animated.Value(0.28),
    new Animated.Value(0.28),
    new Animated.Value(0.28),
  ]).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const checkmarkRotation = useRef(new Animated.Value(0)).current;
  const successContainerScale = useRef(new Animated.Value(0.88)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const confettiAnimations = useRef(
    Array.from({ length: 8 }, () => ({
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(0),
    })),
  ).current;

  const hasConcreteEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmail);
  const displayEmail = userEmail || "your email";
  const headline = isRecoveryEmailFlow ? "Open the recovery email" : "Verify your email";
  const description = isRecoveryEmailFlow
    ? `We sent a secure sign-in link to ${displayEmail}. Open that inbox and tap the link to return to the older Betweener account.`
    : `We sent a verification link to ${displayEmail}. Open that inbox and follow the link to continue.`;

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.05],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.46, 0.18],
  });
  const rotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 120],
  });

  useEffect(() => {
    AsyncStorage.getItem(PENDING_EMAIL_KEY).then((email) => {
      if (email) setUserEmail(email);
      else if (typeof routeEmail === "string" && routeEmail.trim()) setUserEmail(routeEmail.trim());
    });
  }, [routeEmail]);

  useEffect(() => {
    if (verified === "true") {
      void setVerifiedAndRedirect();
    } else if (urlError) {
      setError(decodeURIComponent(urlError as string));
    }
  }, [verified, urlError]);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && !isRecoveryEmailFlow) {
        await setVerifiedAndRedirect();
        return;
      }

      if (userEmail && !isRecoveryEmailFlow) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && user.email_confirmed_at) {
          await setVerifiedAndRedirect();
        }
      }
    };

    void checkSession();
  }, [isRecoveryEmailFlow, userEmail]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const rotateLoop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 5200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 2200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );

    const dotLoops = dotValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(value, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.28,
            duration: 540,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    pulseLoop.start();
    rotateLoop.start();
    shimmerLoop.start();
    dotLoops.forEach((loop) => loop.start());

    return () => {
      pulseLoop.stop();
      rotateLoop.stop();
      shimmerLoop.stop();
      dotLoops.forEach((loop) => loop.stop());
    };
  }, [dotValues, pulse, rotate, shimmer]);

  const setVerifiedAndRedirect = async () => {
    setIsVerified(true);
    setMessage(isRecoveryEmailFlow ? "Recovery confirmed. Taking you back in..." : "Email verified. Redirecting...");
    await AsyncStorage.removeItem(PENDING_EMAIL_KEY);
    await clearPendingAuthFlow();

    startSuccessAnimation();

    setTimeout(() => {
      router.replace("/(auth)/gate");
    }, 3200);
  };

  const startSuccessAnimation = () => {
    Animated.parallel([
      Animated.spring(successContainerScale, {
        toValue: 1,
        tension: 52,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.sequence([
        Animated.spring(checkmarkScale, {
          toValue: 1.16,
          tension: 120,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.spring(checkmarkScale, {
          toValue: 1,
          tension: 100,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.timing(checkmarkRotation, {
        toValue: 360,
        duration: 760,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, 180);

    setTimeout(() => {
      confettiAnimations.forEach((confetti, index) => {
        const angle = index * 45 * (Math.PI / 180);
        const distance = 56 + Math.random() * 32;

        Animated.parallel([
          Animated.timing(confetti.opacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(confetti.translateX, {
            toValue: Math.cos(angle) * distance,
            duration: 950,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(confetti.translateY, {
            toValue: Math.sin(angle) * distance,
            duration: 950,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(confetti.rotate, {
            toValue: 360 + Math.random() * 240,
            duration: 950,
            useNativeDriver: true,
          }),
        ]).start();

        setTimeout(() => {
          Animated.timing(confetti.opacity, {
            toValue: 0,
            duration: 420,
            useNativeDriver: true,
          }).start();
        }, 700);
      });
    }, 520);
  };

  const handleResend = async () => {
    if (isRecoveryEmailFlow || !hasConcreteEmail) {
      setError("A recovery link was already sent to the older account email. Open that inbox to continue.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      if (!userEmail) {
        setError("No email found for verification.");
        return;
      }
      await markPendingAuthFlow("email_signup");
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: userEmail,
      });
      if (resendError) {
        await clearPendingAuthFlow();
        setError(`Failed to resend: ${resendError.message}`);
      } else {
        setMessage("A fresh verification link is on the way.");
      }
    } catch {
      setError("Failed to resend email.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheck = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) {
        setError(`Failed to check verification: ${userError.message}`);
      } else if (data?.user?.email_confirmed_at) {
        await setVerifiedAndRedirect();
      } else {
        setMessage(isRecoveryEmailFlow ? "We are still waiting for the recovery link to be completed." : "Still waiting for email verification. Please check your inbox.");
      }
    } catch {
      setError("Failed to check verification.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    await AsyncStorage.removeItem(PENDING_EMAIL_KEY);
    await clearPendingAuthFlow();
    router.push("/(auth)/login");
  };

  return (
    <LinearGradient
      colors={[Colors.light.tint, Colors.light.secondary, Colors.light.background]}
      start={{ x: 0.08, y: 0.04 }}
      end={{ x: 0.92, y: 0.96 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.shell}>
          <View style={styles.panelShadow} />
          <View style={styles.panel}>
            <LinearGradient
              colors={["rgba(247, 236, 226, 0.96)", "rgba(243, 229, 216, 0.94)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.panelGradient}
            >
              <View style={styles.hero}>
                <View style={styles.eyebrowPill}>
                  <Ionicons name={isRecoveryEmailFlow ? "shield-checkmark-outline" : "mail-unread-outline"} size={14} color={Colors.light.tint} />
                  <Text style={styles.eyebrowText}>{isRecoveryEmailFlow ? "Secure recovery" : "Email verification"}</Text>
                </View>

                <Text style={styles.title}>{headline}</Text>
                <Text style={styles.description}>{description}</Text>

                <View style={styles.emailCard}>
                  <Text style={styles.emailLabel}>{isRecoveryEmailFlow ? "Recovery inbox" : "Inbox to check"}</Text>
                  <Text style={styles.emailValue}>{displayEmail}</Text>
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {message ? (
                <Animated.View
                  style={[
                    styles.messageCard,
                    isVerified ? styles.messageCardSuccess : styles.messageCardInfo,
                    {
                      transform: [{ scale: successContainerScale }],
                      opacity: successOpacity,
                    },
                  ]}
                >
                  {isVerified && confettiAnimations.map((confetti, index) => (
                    <Animated.View
                      key={index}
                      style={[
                        styles.confetti,
                        {
                          backgroundColor: ["#E8B86D", "#2AD9D4", "#7D5BA6", "#5CBEB6", "#F1C99D", "#9DB5B2", "#C38FD6", "#0F8F8E"][index],
                          transform: [
                            { translateX: confetti.translateX },
                            { translateY: confetti.translateY },
                            {
                              rotate: confetti.rotate.interpolate({
                                inputRange: [0, 360],
                                outputRange: ["0deg", "360deg"],
                              }),
                            },
                          ],
                          opacity: confetti.opacity,
                        },
                      ]}
                    />
                  ))}

                  {isVerified ? (
                    <Animated.View
                      style={[
                        styles.successIconWrap,
                        {
                          transform: [
                            { scale: checkmarkScale },
                            {
                              rotate: checkmarkRotation.interpolate({
                                inputRange: [0, 360],
                                outputRange: ["0deg", "360deg"],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <Ionicons name="checkmark" size={30} color="#FFFFFF" />
                    </Animated.View>
                  ) : null}

                  <Text style={[styles.messageText, isVerified ? styles.messageTextSuccess : styles.messageTextInfo]}>
                    {message}
                  </Text>
                </Animated.View>
              ) : null}

              {!isVerified ? (
                <View style={styles.waitingCard}>
                  <View style={styles.loaderStage}>
                    <Animated.View
                      style={[
                        styles.orbitalRing,
                        {
                          transform: [{ scale: ringScale }, { rotate: rotation }],
                          opacity: ringOpacity,
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.orbitalRingInner,
                        {
                          transform: [{ rotate: rotation }],
                        },
                      ]}
                    />
                    <LinearGradient
                      colors={["#1797B1", "#2AD9D4", "#E8B86D"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.orbCore}
                    >
                      <Ionicons name={isRecoveryEmailFlow ? "mail-open-outline" : "mail-outline"} size={24} color="#FFF8F2" />
                    </LinearGradient>
                  </View>

                  <View style={styles.loadingCopyWrap}>
                    <View style={styles.loadingHeadlineRow}>
                      <Text style={styles.loadingHeadline}>{WAITING_COPY}</Text>
                      <View style={styles.dotRow}>
                        {dotValues.map((value, index) => (
                          <Animated.View
                            key={index}
                            style={[
                              styles.dot,
                              {
                                opacity: value,
                                transform: [
                                  {
                                    translateY: value.interpolate({
                                      inputRange: [0.28, 1],
                                      outputRange: [0, -3],
                                    }),
                                  },
                                ],
                              },
                            ]}
                          />
                        ))}
                      </View>
                    </View>

                    <View style={styles.shimmerTrack}>
                      <Animated.View
                        style={[
                          styles.shimmerBar,
                          {
                            transform: [{ translateX: shimmerTranslate }],
                          },
                        ]}
                      />
                    </View>

                    <Text style={styles.loadingSubtext}>
                      {isRecoveryEmailFlow
                        ? "Stay here after opening the recovery link. We will route you back into the right account."
                        : "Once the link is opened, we will continue automatically."}
                    </Text>
                  </View>
                </View>
              ) : null}

              {!isVerified ? (
                <View style={styles.actions}>
                  {!isRecoveryEmailFlow ? (
                    <TouchableOpacity
                      activeOpacity={0.92}
                      style={[styles.primaryWrap, loading && styles.buttonDisabled]}
                      onPress={handleResend}
                      disabled={loading}
                    >
                      <LinearGradient
                        colors={loading ? ["#7CB7B3", "#7CB7B3"] : ["#0F8F8E", "#1797B1"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.primaryButton}
                      >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send another link</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    activeOpacity={0.92}
                    style={[styles.secondaryButton, loading && styles.buttonDisabled]}
                    onPress={handleManualCheck}
                    disabled={loading}
                  >
                    <Text style={styles.secondaryButtonText}>{loading ? "Checking..." : isRecoveryEmailFlow ? "I opened the recovery link" : "I've verified my email"}</Text>
                  </TouchableOpacity>

                  <Pressable onPress={handleBackToLogin} style={styles.backLink}>
                    <Text style={styles.backLinkText}>{isRecoveryEmailFlow ? "Back to sign in" : "Back to login"}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.verifiedFooter}>
                  <Text style={styles.verifiedFooterText}>Securing your account and preparing the next screen.</Text>
                </View>
              )}
            </LinearGradient>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  shell: {
    flex: 1,
    justifyContent: "center",
    position: "relative",
  },
  panelShadow: {
    position: "absolute",
    top: 28,
    left: 14,
    right: 14,
    bottom: 18,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.25)",
    opacity: 0.58,
  },
  panel: {
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.52)",
  },
  panelGradient: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
  },
  hero: {
    marginBottom: 18,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 16,
    backgroundColor: "rgba(0, 128, 128, 0.10)",
  },
  eyebrowText: {
    color: Colors.light.tint,
    fontSize: 12,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  title: {
    color: Colors.light.text,
    fontSize: 32,
    lineHeight: 38,
    marginBottom: 10,
    fontFamily: "Archivo_700Bold",
    letterSpacing: -0.45,
  },
  description: {
    color: Colors.light.textMuted,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: "Manrope_500Medium",
  },
  emailCard: {
    marginTop: 18,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: Colors.light.outline,
    backgroundColor: "rgba(255,255,255,0.76)",
  },
  emailLabel: {
    color: Colors.light.textMuted,
    fontSize: 11.5,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.55,
    marginBottom: 6,
  },
  emailValue: {
    color: Colors.light.text,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: "Archivo_700Bold",
  },
  errorText: {
    color: Colors.light.danger,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: "Manrope_600SemiBold",
    marginBottom: 14,
  },
  messageCard: {
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
  },
  messageCardInfo: {
    backgroundColor: "rgba(23, 151, 177, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(23, 151, 177, 0.16)",
  },
  messageCardSuccess: {
    backgroundColor: "rgba(15, 143, 142, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(15, 143, 142, 0.16)",
  },
  messageText: {
    textAlign: "center",
    fontSize: 17,
    lineHeight: 24,
    fontFamily: "Manrope_700Bold",
  },
  messageTextInfo: {
    color: "#155E75",
  },
  messageTextSuccess: {
    color: "#0B6D6A",
  },
  successIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#0F8F8E",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confetti: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  waitingCard: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 22,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.56)",
    backgroundColor: "rgba(255,255,255,0.62)",
  },
  loaderStage: {
    height: 136,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  orbitalRing: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1.5,
    borderColor: "rgba(15, 143, 142, 0.28)",
    borderTopColor: "rgba(232, 184, 109, 0.64)",
  },
  orbitalRingInner: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: "rgba(125, 91, 166, 0.20)",
    borderBottomColor: "rgba(42, 217, 212, 0.64)",
  },
  orbCore: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1797B1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingCopyWrap: {
    alignItems: "center",
  },
  loadingHeadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  loadingHeadline: {
    color: Colors.light.text,
    fontSize: 19,
    lineHeight: 24,
    fontFamily: "Archivo_700Bold",
    marginRight: 8,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    paddingTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.tint,
  },
  shimmerTrack: {
    width: 120,
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(95, 112, 108, 0.12)",
    marginBottom: 12,
  },
  shimmerBar: {
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(232, 184, 109, 0.95)",
  },
  loadingSubtext: {
    color: Colors.light.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Manrope_500Medium",
    textAlign: "center",
    paddingHorizontal: 6,
  },
  actions: {
    gap: 12,
  },
  primaryWrap: {
    borderRadius: 18,
    overflow: "hidden",
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Manrope_700Bold",
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(95, 112, 108, 0.16)",
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: Colors.light.text,
    fontSize: 15.5,
    fontFamily: "Manrope_700Bold",
  },
  backLink: {
    alignSelf: "center",
    paddingTop: 4,
  },
  backLinkText: {
    color: Colors.light.tint,
    fontSize: 15,
    fontFamily: "Manrope_600SemiBold",
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  verifiedFooter: {
    alignItems: "center",
    paddingTop: 6,
  },
  verifiedFooterText: {
    color: "#0B6D6A",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Manrope_500Medium",
    textAlign: "center",
  },
});
