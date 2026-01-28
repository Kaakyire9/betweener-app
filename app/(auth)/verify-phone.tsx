import { PhoneVerification } from "@/components/PhoneVerification";
import {
  captureSignupContext,
  getOrCreateSignupSessionId,
  getSignupPhoneState,
  logSignupEvent,
  setSignupPhoneNumber,
  setSignupPhoneVerified,
} from "@/lib/signup-tracking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";

export default function VerifyPhoneScreen() {
  const router = useRouter();
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

  useEffect(() => {
    let active = true;
    (async () => {
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

  return (
    <LinearGradient
      colors={[Colors.light.tint, Colors.light.accent, Colors.light.background]}
      start={{ x: 0.15, y: 0.1 }}
      end={{ x: 0.9, y: 0.95 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        {showVerification ? (
          <PhoneVerification
            allowAnonymous
            signupSessionId={signupSessionId}
            countryLabel={countryLabel}
            dialCode={dialCode}
            onCancel={() => router.replace("/(auth)/welcome")}
            onPhoneVerified={async (phone) => {
              setVerifiedPhoneNumber(phone);
              await setSignupPhoneNumber(phone);
            }}
            onVerificationComplete={async (success) => {
              if (success) {
                await setSignupPhoneVerified(true);
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
                router.replace("/(auth)/signup-options");
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
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
