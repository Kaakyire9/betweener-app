import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { getSignupPhoneState } from "@/lib/signup-tracking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

export default function OnboardingRouter() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { phoneVerified, profile, refreshPhoneState } = useAuth();

  const variantParam = (() => {
    const raw = params?.variant;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0];
    return undefined;
  })();

  useEffect(() => {
    const route = async () => {
      const signupState = await getSignupPhoneState();
      const verifiedNow = phoneVerified || (await refreshPhoneState()) || signupState.verified;
      if (!verifiedNow) {
        router.replace({
          pathname: "/(auth)/verify-phone",
          params: { next: encodeURIComponent("/(auth)/onboarding") },
        });
        return;
      }

      const phoneNumber = profile?.phone_number || signupState.phoneNumber || "";

      const normalizedVariant = variantParam?.toLowerCase();
      const target =
        normalizedVariant === "ghana" || normalizedVariant === "global"
          ? normalizedVariant
          : phoneNumber.startsWith("+233")
            ? "ghana"
            : "global";

      router.replace(`/(auth)/onboarding-${target}`);
    };

    void route();
  }, [router, variantParam, phoneVerified, profile?.phone_number, refreshPhoneState]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: Colors.light.background,
      }}
    >
      <ActivityIndicator size="large" color={Colors.light.tint} />
      <Text style={{ marginTop: 12, color: Colors.light.textMuted }}>
        Preparing onboarding...
      </Text>
    </View>
  );
}
