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
  AppState,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const WAITING_COPY = "Waiting for email verification";
const PENDING_EMAIL_KEY = "pending_verification_email";

const getInboxTarget = (email: string) => {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { label: "Open Gmail inbox", url: "https://mail.google.com/mail/u/0/#inbox" };
  }
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return { label: "Open Outlook inbox", url: "https://outlook.live.com/mail/0/inbox" };
  }
  if (domain === "yahoo.com" || domain.startsWith("yahoo.")) {
    return { label: "Open Yahoo Mail", url: "https://mail.yahoo.com/" };
  }
  if (["icloud.com", "me.com", "mac.com"].includes(domain)) {
    return { label: "Open iCloud Mail", url: "https://www.icloud.com/mail/" };
  }
  if (domain === "proton.me" || domain === "protonmail.com") {
    return { label: "Open Proton Mail", url: "https://mail.proton.me/" };
  }
  return { label: "Open email app", url: "mailto:" };
};

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { verified, error: urlError, email: routeEmail, recovery } = useLocalSearchParams();
  const isRecoveryEmailFlow = recovery === "true";

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(isRecoveryEmailFlow ? 0 : 30);
  const redirectingRef = useRef(false);

  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
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
  const inboxTarget = getInboxTarget(userEmail);
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
  useEffect(() => {
    AsyncStorage.getItem(PENDING_EMAIL_KEY).then((email) => {
      if (email) setUserEmail(email);
      else if (typeof routeEmail === "string" && routeEmail.trim()) setUserEmail(routeEmail.trim());
    });
  }, [routeEmail]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

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
    const checkAfterReturn = () => {
      void supabase.auth.getSession().then(({ data }) => {
        const returnedUser = data.session?.user;
        if (returnedUser?.email_confirmed_at && !isRecoveryEmailFlow) {
          void setVerifiedAndRedirect();
        }
      });
    };

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") checkAfterReturn();
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email_confirmed_at && !isRecoveryEmailFlow) {
        void setVerifiedAndRedirect();
      }
    });

    return () => {
      appStateSubscription.remove();
      authListener.subscription.unsubscribe();
    };
  }, [isRecoveryEmailFlow]);

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
    dotLoops.forEach((loop) => loop.start());

    return () => {
      pulseLoop.stop();
      rotateLoop.stop();
      dotLoops.forEach((loop) => loop.stop());
    };
  }, [dotValues, pulse, rotate]);

  const setVerifiedAndRedirect = async () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
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
        setResendCooldown(60);
        setMessage("A fresh verification link is on the way.");
      }
    } catch {
      setError("Failed to resend email.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInbox = async () => {
    setError("");
    setMessage("");
    try {
      await Linking.openURL(inboxTarget.url);
    } catch {
      setError("We could not open your inbox automatically. Open your email app and look for the latest Betweener message.");
    }
  };

  const handleManualCheck = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError("We could not check verification right now. Please try again in a moment.");
      } else if (sessionData.session?.user?.email_confirmed_at) {
        await setVerifiedAndRedirect();
      } else if (!sessionData.session) {
        setMessage(
          "We have not received the verified sign-in yet. Open the button inside the email on this phone so it can return you to Betweener.",
        );
      } else {
        setMessage(
          isRecoveryEmailFlow
            ? "We are still waiting for the recovery link to be completed."
            : "The email is not verified yet. Open the newest Betweener email and tap its verification button.",
        );
      }
    } catch {
      setError("We could not check verification right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    await AsyncStorage.removeItem(PENDING_EMAIL_KEY);
    await clearPendingAuthFlow();
    router.replace(isRecoveryEmailFlow ? "/(auth)/login" : "/(auth)/signup-options");
  };

  return (
    <LinearGradient
      colors={[Colors.light.tint, Colors.light.secondary, Colors.light.background]}
      start={{ x: 0.08, y: 0.04 }}
      end={{ x: 0.92, y: 0.96 }}
      style={styles.gradient}
    >
      <View style={styles.ambientGlowTop} />
      <View style={styles.ambientGlowBottom} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.screenContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow}>
            <Text style={styles.brand}>Betweener</Text>
            <Text style={styles.brandGlyph}>*</Text>
          </View>

          <View style={styles.panel}>
            <View style={styles.eyebrowPill}>
              <Ionicons name={isRecoveryEmailFlow ? "shield-checkmark-outline" : "paper-plane-outline"} size={14} color="#73E2DC" />
              <Text style={styles.eyebrowText}>{isRecoveryEmailFlow ? "Recovery email sent" : "Verification email sent"}</Text>
            </View>

            <Text style={styles.title}>{isRecoveryEmailFlow ? headline : "Check your inbox"}</Text>
            <Text style={styles.description}>
              {isRecoveryEmailFlow
                ? description
                : "Your account is almost ready. Open the email we sent and tap the verification button inside."}
            </Text>

            <View style={styles.emailCard}>
              <View style={styles.emailIconWrap}>
                <Ionicons name="mail-outline" size={19} color="#73E2DC" />
              </View>
              <View style={styles.emailCopy}>
                <Text style={styles.emailLabel}>{isRecoveryEmailFlow ? "Recovery sent to" : "Sent to"}</Text>
                <Text style={styles.emailValue} numberOfLines={2}>{displayEmail}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={21} color="#6FD6B2" />
            </View>

            {error ? (
              <View style={[styles.feedbackCard, styles.errorCard]}>
                <Ionicons name="alert-circle-outline" size={19} color="#FF8C98" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {message ? (
              <Animated.View
                style={[
                  styles.messageCard,
                  isVerified ? styles.messageCardSuccess : styles.messageCardInfo,
                  isVerified
                    ? { transform: [{ scale: successContainerScale }], opacity: successOpacity }
                    : { opacity: 1 },
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
                    <Ionicons name="checkmark" size={28} color="#FFFFFF" />
                  </Animated.View>
                ) : (
                  <Ionicons name="information-circle-outline" size={19} color="#73E2DC" />
                )}
                <Text style={[styles.messageText, isVerified ? styles.messageTextSuccess : styles.messageTextInfo]}>
                  {message}
                </Text>
              </Animated.View>
            ) : null}

            {!isVerified ? (
              <>
                <View style={styles.instructionsCard}>
                  <View style={styles.statusHeader}>
                    <View style={styles.loaderStage}>
                      <Animated.View
                        style={[
                          styles.orbitalRing,
                          { transform: [{ scale: ringScale }, { rotate: rotation }], opacity: ringOpacity },
                        ]}
                      />
                      <LinearGradient
                        colors={["#139C98", "#7659B5", "#E8B86D"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.orbCore}
                      >
                        <Ionicons name="mail-open-outline" size={22} color="#FFFFFF" />
                      </LinearGradient>
                    </View>
                    <View style={styles.statusCopy}>
                      <View style={styles.loadingHeadlineRow}>
                        <Text style={styles.loadingHeadline}>{WAITING_COPY}</Text>
                        <View style={styles.dotRow}>
                          {dotValues.map((value, index) => (
                            <Animated.View key={index} style={[styles.dot, { opacity: value }]} />
                          ))}
                        </View>
                      </View>
                      <Text style={styles.loadingSubtext}>We will continue automatically when the link returns you to Betweener.</Text>
                    </View>
                  </View>

                  <View style={styles.stepDivider} />
                  {[
                    ["1", "Open your inbox", "Look for the newest email from Betweener."],
                    ["2", "Tap Verify my email", "Use the button inside that email—not this screen."],
                    ["3", "Return to Betweener", "The app will detect verification and continue."],
                  ].map(([number, stepTitle, stepBody]) => (
                    <View key={number} style={styles.stepRow}>
                      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
                      <View style={styles.stepCopy}>
                        <Text style={styles.stepTitle}>{stepTitle}</Text>
                        <Text style={styles.stepBody}>{stepBody}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity activeOpacity={0.9} style={styles.primaryWrap} onPress={handleOpenInbox}>
                    <LinearGradient
                      colors={["#13AAA4", "#6E55BE"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryButton}
                    >
                      <Ionicons name="mail-open-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>{inboxTarget.label}</Text>
                      <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.secondaryButton, loading && styles.buttonDisabled]}
                    onPress={handleManualCheck}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator color="#73E2DC" /> : <Ionicons name="checkmark-circle-outline" size={19} color="#73E2DC" />}
                    <Text style={styles.secondaryButtonText}>
                      {loading ? "Checking verification..." : "I tapped the link — continue"}
                    </Text>
                  </TouchableOpacity>

                  {!isRecoveryEmailFlow ? (
                    <View style={styles.resendRow}>
                      <Text style={styles.resendPrompt}>No email after a minute?</Text>
                      <Pressable onPress={handleResend} disabled={loading || resendCooldown > 0} hitSlop={8}>
                        <Text style={[styles.resendLink, resendCooldown > 0 && styles.resendLinkDisabled]}>
                          {loading
                            ? "Please wait"
                            : resendCooldown > 0
                              ? `Send again in ${resendCooldown}s`
                              : "Send another link"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.helpCard}>
                    <Ionicons name="search-outline" size={17} color="#DFC18A" />
                    <Text style={styles.helpText}>Check Spam or Promotions if it is not in your main inbox. Use only the newest verification email.</Text>
                  </View>

                  <Pressable onPress={handleBackToLogin} style={styles.backLink}>
                    <Ionicons name="chevron-back" size={16} color="#B8C9C8" />
                    <Text style={styles.backLinkText}>{isRecoveryEmailFlow ? "Back to sign in" : "Wrong email? Start again"}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.verifiedFooter}>
                <ActivityIndicator color="#73E2DC" />
                <Text style={styles.verifiedFooterText}>Securing your account and preparing the next screen.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: "#061B1C",
  },
  ambientGlowTop: {
    position: "absolute",
    top: -90,
    right: -70,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: "rgba(118, 89, 181, 0.25)",
  },
  ambientGlowBottom: {
    position: "absolute",
    bottom: -120,
    left: -90,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: "rgba(19, 170, 164, 0.2)",
  },
  safeArea: {
    flex: 1,
  },
  screenContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
  },
  brandRow: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  brand: {
    color: "#FFF8F2",
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    letterSpacing: 0.4,
  },
  brandGlyph: {
    color: "#C7A7FF",
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 13,
    marginTop: -6,
  },
  panel: {
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(6, 27, 28, 0.91)",
    shadowColor: "#020B0C",
    shadowOpacity: 0.42,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  eyebrowPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
    backgroundColor: "rgba(115, 226, 220, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(115, 226, 220, 0.18)",
  },
  eyebrowText: {
    color: "#A9EFEB",
    fontSize: 10.5,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  title: {
    color: "#FFF8F2",
    fontSize: 34,
    lineHeight: 40,
    marginBottom: 10,
    fontFamily: "PlayfairDisplay_700Bold",
    letterSpacing: -0.45,
    textAlign: "center",
  },
  description: {
    color: "#B8C9C8",
    fontSize: 15,
    lineHeight: 23,
    fontFamily: "Manrope_500Medium",
    textAlign: "center",
  },
  emailCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "rgba(115, 226, 220, 0.17)",
    backgroundColor: "rgba(255,255,255,0.065)",
  },
  emailIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(115, 226, 220, 0.11)",
  },
  emailCopy: {
    flex: 1,
  },
  emailLabel: {
    color: "#91A9A7",
    fontSize: 10.5,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.55,
    marginBottom: 3,
  },
  emailValue: {
    color: "#FFF8F2",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Manrope_700Bold",
  },
  errorText: {
    flex: 1,
    color: "#FFD7DC",
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: "Manrope_600SemiBold",
  },
  messageCard: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 14,
  },
  messageCardInfo: {
    backgroundColor: "rgba(115, 226, 220, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(23, 151, 177, 0.16)",
  },
  messageCardSuccess: {
    flexDirection: "column",
    backgroundColor: "rgba(111, 214, 178, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(15, 143, 142, 0.16)",
  },
  messageText: {
    flex: 1,
    textAlign: "center",
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: "Manrope_600SemiBold",
  },
  messageTextInfo: {
    color: "#D2F6F3",
  },
  messageTextSuccess: {
    color: "#CFF6E8",
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0A9E99",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  confetti: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  instructionsCard: {
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  loaderStage: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  orbitalRing: {
    position: "absolute",
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    borderColor: "rgba(115, 226, 220, 0.22)",
    borderTopColor: "rgba(232, 184, 109, 0.78)",
  },
  orbCore: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7659B5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  statusCopy: {
    flex: 1,
  },
  loadingHeadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  loadingHeadline: {
    flexShrink: 1,
    color: "#FFF8F2",
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Manrope_700Bold",
    marginRight: 7,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    paddingTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#73E2DC",
  },
  loadingSubtext: {
    color: "#9FB5B3",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Manrope_500Medium",
  },
  stepDivider: {
    height: 1,
    marginVertical: 14,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    marginBottom: 12,
  },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(118, 89, 181, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(199, 167, 255, 0.3)",
  },
  stepNumberText: {
    color: "#E3D3FF",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
  },
  stepCopy: {
    flex: 1,
  },
  stepTitle: {
    color: "#FFF8F2",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    marginBottom: 2,
  },
  stepBody: {
    color: "#9FB5B3",
    fontFamily: "Manrope_400Regular",
    fontSize: 11.5,
    lineHeight: 16,
  },
  actions: {
    gap: 11,
  },
  primaryWrap: {
    borderRadius: 18,
    overflow: "hidden",
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
    shadowColor: "#7659B5",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Manrope_700Bold",
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(115, 226, 220, 0.19)",
    backgroundColor: "rgba(115, 226, 220, 0.07)",
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: "#D9F5F3",
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
  },
  resendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 3,
  },
  resendPrompt: {
    color: "#91A9A7",
    fontFamily: "Manrope_400Regular",
    fontSize: 12.5,
  },
  resendLink: {
    color: "#73E2DC",
    fontFamily: "Manrope_700Bold",
    fontSize: 12.5,
  },
  resendLinkDisabled: {
    color: "#718886",
  },
  helpCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(232, 184, 109, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(232, 184, 109, 0.16)",
  },
  helpText: {
    flex: 1,
    color: "#D5C6AC",
    fontFamily: "Manrope_400Regular",
    fontSize: 11.5,
    lineHeight: 17,
  },
  backLink: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingTop: 5,
  },
  backLinkText: {
    color: "#B8C9C8",
    fontSize: 13,
    fontFamily: "Manrope_600SemiBold",
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  verifiedFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingTop: 6,
  },
  verifiedFooterText: {
    color: "#CFF6E8",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Manrope_500Medium",
    textAlign: "center",
  },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 14,
    borderWidth: 1,
  },
  errorCard: {
    backgroundColor: "rgba(255, 92, 110, 0.10)",
    borderColor: "rgba(255, 140, 152, 0.22)",
  },
});
