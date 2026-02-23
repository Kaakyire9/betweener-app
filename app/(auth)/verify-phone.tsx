import { PhoneVerification } from "@/components/PhoneVerification";
import {
  captureSignupContext,
  clearSignupSession,
  finalizeSignupPhoneVerification,
  getOrCreateSignupSessionId,
  getSignupPhoneState,
  logSignupEvent,
  setSignupPhoneNumber,
  setSignupPhoneVerified,
} from "@/lib/signup-tracking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib/telemetry/logger";

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const {
    refreshPhoneState,
    refreshProfile,
    isAuthenticated,
    hasProfile,
    phoneVerified,
    signOut,
    user,
  } = useAuth();
  const params = useLocalSearchParams();
  const nextParam = params.next;
  const nextRoute = typeof nextParam === "string" ? decodeURIComponent(nextParam) : null;
  const reasonParam = params.reason;
  const reason = typeof reasonParam === "string" ? reasonParam : null;
  const [_isPreparing, setIsPreparing] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState<string | null>(null);
  const [signupSessionId, setSignupSessionId] = useState<string | null>(null);
  const [countryLabel, setCountryLabel] = useState("Ghana");
  const [dialCode, setDialCode] = useState("+233");
  const [signupContext, setSignupContext] = useState<{
    ipInfo: Awaited<ReturnType<typeof captureSignupContext>>["ipInfo"];
    location: Awaited<ReturnType<typeof captureSignupContext>>["location"];
  } | null>(null);
  const routedRef = useRef(false);

  const needsPhoneForAccess = reason === "required_for_access";

  const routeAfterVerified = async () => {
    if (routedRef.current) return;
    routedRef.current = true;
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[verify-phone] routeAfterVerified", {
        isAuthenticated,
        nextRoute,
      });
    }
    if (isAuthenticated) {
      router.replace("/(auth)/gate");
      return;
    }
    router.replace(nextRoute ?? "/(auth)/signup-options");
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[verify-phone] init");
      }
      const verifiedNow = await refreshPhoneState();
      if (verifiedNow) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[verify-phone] verified on mount");
        }
        await routeAfterVerified();
        return;
      }
      const { verified: _verified } = await getSignupPhoneState();
      const sessionId = await getOrCreateSignupSessionId();
      const context = await captureSignupContext();
      if (!active) return;
      setSignupSessionId(sessionId);
      setSignupContext(context);
      const resolvedCountry = context?.ipInfo?.country || "Ghana";
      const countryMap: Record<string, { label: string; dial: string }> = {
        Ghana: { label: "Ghana", dial: "+233" },
        "United States": { label: "United States", dial: "+1" },
        "United Kingdom": { label: "United Kingdom", dial: "+44" },
        Canada: { label: "Canada", dial: "+1" },
        Nigeria: { label: "Nigeria", dial: "+234" },
        "South Africa": { label: "South Africa", dial: "+27" },
        Germany: { label: "Germany", dial: "+49" },
        Netherlands: { label: "Netherlands", dial: "+31" },
        France: { label: "France", dial: "+33" },
        Spain: { label: "Spain", dial: "+34" },
        Italy: { label: "Italy", dial: "+39" },
        Australia: { label: "Australia", dial: "+61" },
        "United Arab Emirates": { label: "United Arab Emirates", dial: "+971" },
      };
      const mapped = countryMap[resolvedCountry];
      if (mapped) {
        setCountryLabel(mapped.label);
        setDialCode(mapped.dial);
      }
      if (sessionId) {
        setShowVerification(true);
        setIsPreparing(false);
      } else {
        setShowVerification(false);
        setIsPreparing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!phoneVerified) return;
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[verify-phone] phoneVerified true");
    }
    void routeAfterVerified();
  }, [phoneVerified, hasProfile, isAuthenticated, nextRoute]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthenticated || phoneVerified) return;
      const verifiedNow = await refreshPhoneState();
      if (!active) return;
      if (verifiedNow) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[verify-phone] verified via refreshPhoneState");
        }
        await routeAfterVerified();
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated, phoneVerified, refreshPhoneState, hasProfile, nextRoute]);

  const handleCancel = () => {
    if (!isAuthenticated) {
      router.replace("/(auth)/welcome");
      return;
    }

    Alert.alert(
      "Phone verification required",
      "To keep Betweener safe, please verify your phone before continuing. You can continue now or sign out.",
      [
        { text: "Continue", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/welcome");
          },
        },
      ]
    );
  };

  return (
    <LinearGradient
      colors={[Colors.light.tint, Colors.light.accent, Colors.light.background]}
      start={{ x: 0.15, y: 0.1 }}
      end={{ x: 0.9, y: 0.95 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            {needsPhoneForAccess ? "One quick step to continue" : "Verify your phone"}
          </Text>
          <Text style={styles.infoText}>
            {needsPhoneForAccess
              ? "For trust and safety, phone verification is required for email/password and magic link accounts."
              : "Add and verify your phone number so we can protect your account and reduce fake profiles."}
          </Text>
        </View>
        {showVerification ? (
          <PhoneVerification
            allowAnonymous
            userId={user?.id ?? null}
            signupSessionId={signupSessionId}
            countryLabel={countryLabel}
            dialCode={dialCode}
            onCancel={handleCancel}
            onPhoneVerified={async (phone) => {
              setVerifiedPhoneNumber(phone);
              await setSignupPhoneNumber(phone);
            }}
            onVerificationComplete={async (success) => {
              if (!success) return;

              try {
                if (typeof __DEV__ !== "undefined" && __DEV__) {
                  console.log("[verify-phone] onVerificationComplete: start", {
                    isAuthenticated,
                    hasUser: !!user?.id,
                  });
                }
                // Ensure signup session exists and persist local "verified" state.
                const ensuredSignupSessionId = await getOrCreateSignupSessionId();
                await setSignupPhoneVerified(true);
                const state = await getSignupPhoneState();
                const localPhone = state.phoneNumber ?? verifiedPhoneNumber ?? null;
                logger.debug("[verify-phone] onVerificationComplete: localPhone", {
                  hasLocalPhone: !!localPhone,
                });

                if (!localPhone) {
                  Alert.alert(
                    "Missing phone number",
                    "We verified your code, but we couldn't read your phone number. Please try again."
                  );
                  return;
                }

                // Important: mark verified locally so Gate won't bounce back to this screen while
                // the server-side finalize/linking runs in the background.
                if (user?.id) {
                  try {
                    await AsyncStorage.setItem(
                      `phone_verified_cache_v1:${user.id}`,
                      JSON.stringify({ verified: true, expiresAt: Date.now() + 60_000 })
                    );
                  } catch {
                    // ignore cache errors
                  }
                }

                // Navigate immediately; do not block on network calls (they can hang on mobile).
                // Gate is the single routing authority.
                if (!routedRef.current) {
                  routedRef.current = true;
                  if (typeof __DEV__ !== "undefined" && __DEV__) {
                    console.log("[verify-phone] onVerificationComplete: route /(auth)/gate");
                  }
                  router.replace("/(auth)/gate");
                }

                async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
                  return (await Promise.race([
                    p,
                    new Promise<never>((_, reject) =>
                      setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
                    ),
                  ])) as T;
                }

                // Continue in background (best-effort) to persist flags and clean up local state.
                void (async () => {
                // Persist verified state on profile (abortable REST call).
                // IMPORTANT: Avoid supabase-js upsert here (can hang on some mobile networks).
                if (isAuthenticated && user?.id) {
                  try {
                    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
                    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
                    if (!supabaseUrl || !anonKey) {
                      throw new Error("missing_supabase_env");
                    }

                    const { data: sessionData } = await supabase.auth.getSession();
                    const accessToken = sessionData?.session?.access_token ?? null;

                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 4000);
                    const url = `${supabaseUrl}/rest/v1/profiles?user_id=eq.${user.id}`;

                    const res = (await withTimeout(
                      fetch(url, {
                        method: "PATCH",
                        headers: {
                          apikey: anonKey,
                          Authorization: `Bearer ${accessToken || anonKey}`,
                          "Content-Type": "application/json",
                          Prefer: "return=minimal",
                        },
                        body: JSON.stringify({
                          phone_verified: true,
                          phone_number: localPhone,
                          updated_at: new Date().toISOString(),
                        }),
                        signal: controller.signal,
                      }),
                      5000,
                      "profile_rest_patch"
                    )) as Response;
                    clearTimeout(timeout);

                    if (!res.ok) {
                      let bodyText = "";
                      try {
                        bodyText = await res.text();
                      } catch {
                        bodyText = "<unreadable body>";
                      }
                      console.warn("[verify-phone] profile rest patch failed", {
                        status: res.status,
                        body: bodyText,
                      });
                    } else if (typeof __DEV__ !== "undefined" && __DEV__) {
                      console.log("[verify-phone] profile rest patch ok");
                    }
                  } catch (e) {
                    console.warn("[verify-phone] profile rest patch error", e);
                  }
                }

                // Refresh in-app state (best-effort).
                try {
                  const refreshedVerified = await withTimeout(refreshPhoneState(), 5000, "refreshPhoneState");
                  if (typeof __DEV__ !== "undefined" && __DEV__) {
                    console.log("[verify-phone] refreshPhoneState result", refreshedVerified);
                  }
                } catch (e) {
                  if (typeof __DEV__ !== "undefined" && __DEV__) {
                    console.log("[verify-phone] refreshPhoneState error", e);
                  }
                }
                void refreshProfile();

                // Analytics
                await logSignupEvent({
                  phone_verified: true,
                  phone_number: localPhone,
                  ip_address: signupContext?.ipInfo?.ip ?? null,
                  ip_country: signupContext?.ipInfo?.country ?? null,
                  ip_region: signupContext?.ipInfo?.region ?? null,
                  ip_city: signupContext?.ipInfo?.city ?? null,
                  ip_timezone: signupContext?.ipInfo?.timezone ?? null,
                  geo_lat: signupContext?.location?.geo_lat ?? null,
                  geo_lng: signupContext?.location?.geo_lng ?? null,
                  geo_accuracy: signupContext?.location?.geo_accuracy ?? null,
                });

                // Finalize signup + clear local session (best-effort).
                if (ensuredSignupSessionId) {
                  let finalized = false;
                  try {
                    finalized = await withTimeout(finalizeSignupPhoneVerification(), 7000, "finalizeSignup");
                  } catch (e) {
                    console.warn("[verify-phone] finalizeSignupPhoneVerification error", e);
                  }
                  if (finalized) {
                    try {
                      await withTimeout(clearSignupSession(), 2000, "clearSignupSession");
                    } catch (e) {
                      console.warn("[verify-phone] clearSignupSession error", e);
                    }
                  } else if (typeof __DEV__ !== "undefined" && __DEV__) {
                    console.log("[verify-phone] finalize failed; keeping signup session for retry");
                  }
                }
                })();
              } catch (e) {
                console.error("[verify-phone] onVerificationComplete error", e);
                router.replace("/(auth)/gate");
              }
            }}
          />
        ) : (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.light.tint} />
          </View>
        )}
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
    paddingBottom: 8,
  },
  infoCard: {
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(247, 236, 226, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: "Archivo_700Bold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Manrope_500Medium",
    color: Colors.light.textMuted,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
