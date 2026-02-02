import { Colors } from "@/constants/theme";
import { getSignupPhoneState } from "@/lib/signup-tracking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

export default function OnboardingRouter() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const variantParam = (() => {
    const raw = params?.variant;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0];
    return undefined;
  })();

  useEffect(() => {
    let mounted = true;

    const route = async () => {
      const { phoneNumber, verified } = await getSignupPhoneState();
      if (!mounted) return;

      if (!phoneNumber || !verified) {
        router.replace({
          pathname: "/(auth)/verify-phone",
          params: { next: encodeURIComponent("/(auth)/onboarding") },
        });
        return;
      }

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

    return () => {
      mounted = false;
    };
  }, [router, variantParam]);

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
