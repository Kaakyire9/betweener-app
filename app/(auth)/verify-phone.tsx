import { PhoneVerification } from "@/components/PhoneVerification";
import {
  captureSignupContext,
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

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const { refreshPhoneState, isAuthenticated, hasProfile, phoneVerified, signOut } = useAuth();
  const params = useLocalSearchParams();
  const nextParam = params.next;
  const nextRoute = typeof nextParam === "string" ? decodeURIComponent(nextParam) : null;
  const reasonParam = params.reason;
  const reason = typeof reasonParam === "string" ? reasonParam : null;
  const [isPreparing, setIsPreparing] = useState(true);
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
    if (isAuthenticated) {
      router.replace("/(auth)/gate");
      return;
    }
    router.replace(nextRoute ?? "/(auth)/signup-options");
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const verifiedNow = await refreshPhoneState();
      if (verifiedNow) {
        await routeAfterVerified();
        return;
      }
      const { verified } = await getSignupPhoneState();
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
    void routeAfterVerified();
  }, [phoneVerified, hasProfile, isAuthenticated, nextRoute]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthenticated || phoneVerified) return;
      const verifiedNow = await refreshPhoneState();
      if (!active) return;
      if (verifiedNow) {
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
            signupSessionId={signupSessionId}
            countryLabel={countryLabel}
            dialCode={dialCode}
            onCancel={handleCancel}
            onPhoneVerified={async (phone) => {
              setVerifiedPhoneNumber(phone);
              await setSignupPhoneNumber(phone);
            }}
            onVerificationComplete={async (success) => {
              if (success) {
                await setSignupPhoneVerified(true);
                await refreshPhoneState();
                const { phoneNumber } = await getSignupPhoneState();
                await logSignupEvent({
                  phone_verified: true,
                  phone_number: phoneNumber ?? verifiedPhoneNumber,
                  ip_address: signupContext?.ipInfo?.ip ?? null,
                  ip_country: signupContext?.ipInfo?.country ?? null,
                  ip_region: signupContext?.ipInfo?.region ?? null,
                  ip_city: signupContext?.ipInfo?.city ?? null,
                  ip_timezone: signupContext?.ipInfo?.timezone ?? null,
                  geo_lat: signupContext?.location?.geo_lat ?? null,
                  geo_lng: signupContext?.location?.geo_lng ?? null,
                  geo_accuracy: signupContext?.location?.geo_accuracy ?? null,
                });
                await routeAfterVerified();
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
