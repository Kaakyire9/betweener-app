import { PhoneVerification } from "@/components/PhoneVerification";
import {
  captureSignupContext,
  getOrCreateSignupSessionId,
  logSignupEvent,
  setSignupPhoneNumber,
  setSignupPhoneVerified,
} from "@/lib/signup-tracking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Location from "expo-location";

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const [isPreparing, setIsPreparing] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState<string | null>(null);
  const [signupContext, setSignupContext] = useState<{
    ipInfo: Awaited<ReturnType<typeof captureSignupContext>>["ipInfo"];
    location: Awaited<ReturnType<typeof captureSignupContext>>["location"];
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      await getOrCreateSignupSessionId();
      if (active) setIsPreparing(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleStartVerification = async () => {
    setIsPreparing(true);
    try {
      await Location.requestForegroundPermissionsAsync();
      const context = await captureSignupContext();
      setSignupContext(context);
      setShowVerification(true);
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      {showVerification ? (
        <PhoneVerification
          allowAnonymous
          onCancel={() => setShowVerification(false)}
          onPhoneVerified={async (phone) => {
            setVerifiedPhoneNumber(phone);
            await setSignupPhoneNumber(phone);
          }}
          onVerificationComplete={async (success) => {
            if (success) {
              await setSignupPhoneVerified(true);
              await logSignupEvent({
                phone_verified: true,
                phone_number: verifiedPhoneNumber,
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
        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: 80,
          }}
        >
          <Text
            style={{
              fontFamily: "Archivo_700Bold",
              fontSize: 28,
              color: "#0F172A",
              marginBottom: 12,
            }}
          >
            Verify your number
          </Text>
          <Text
            style={{
              fontFamily: "Manrope_400Regular",
              fontSize: 16,
              color: "#64748B",
              lineHeight: 22,
              marginBottom: 24,
            }}
          >
            We use phone verification, IP, and location signals to keep Betweener authentic and
            reduce fake profiles.
          </Text>

          <Pressable
            onPress={handleStartVerification}
            style={{
              backgroundColor: "#0FBAB5",
              paddingVertical: 16,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              opacity: isPreparing ? 0.6 : 1,
            }}
            disabled={isPreparing}
          >
            {isPreparing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={{
                  color: "#fff",
                  fontFamily: "Archivo_700Bold",
                  fontSize: 16,
                  letterSpacing: 1,
                }}
              >
                Continue
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={{ marginTop: 24, alignItems: "center" }}
          >
            <Text
              style={{
                fontFamily: "Manrope_400Regular",
                color: "#0FBAB5",
                fontSize: 15,
              }}
            >
              Already have an account? Log in
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
