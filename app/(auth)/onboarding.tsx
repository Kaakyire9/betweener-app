import BetweenerLoader from "@/components/ui/BetweenerLoader";
import { useAuth } from "@/lib/auth-context";
import { getSignupOnboardingVariant, getSignupPhoneState } from "@/lib/signup-tracking";
import { inferCountryFromPhoneNumber } from "@/lib/location/countries";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

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
      const storedVariant = await getSignupOnboardingVariant();
      const verifiedNow = phoneVerified || (await refreshPhoneState()) || signupState.verified;
      const normalizedVariant = variantParam?.toLowerCase();
      const explicitVariant =
        normalizedVariant === "ghana" || normalizedVariant === "global"
          ? normalizedVariant
          : null;
      const preferredVariant =
        explicitVariant ?? storedVariant;
      if (!verifiedNow) {
        const nextOnboardingRoute =
          explicitVariant === "ghana" || explicitVariant === "global"
            ? `/(auth)/onboarding?variant=${explicitVariant}`
            : "/(auth)/onboarding";
        router.replace({
          pathname: "/(auth)/verify-phone",
          params: { next: encodeURIComponent(nextOnboardingRoute) },
        });
        return;
      }

      const phoneNumber = profile?.phone_number || signupState.phoneNumber || "";
      const inferredPhoneCountryCode = inferCountryFromPhoneNumber(phoneNumber)?.code ?? null;
      const countryLockPolicy = String((profile as any)?.country_lock_policy || "").trim().toLowerCase();
      const currentCountryCode = String((profile as any)?.current_country_code || "").trim().toUpperCase();
      const currentCountry = String((profile as any)?.current_country || "").trim().toLowerCase();
      const target = explicitVariant
        ? explicitVariant
        : countryLockPolicy === "ghana_locked" ||
          currentCountryCode === "GH" ||
          currentCountry === "ghana" ||
          inferredPhoneCountryCode === "GH"
          ? "ghana"
          : inferredPhoneCountryCode
            ? "global"
            : preferredVariant === "ghana" || preferredVariant === "global"
              ? preferredVariant
              : "global";

      router.replace(`/(auth)/onboarding-${target}`);
    };

    void route();
  }, [router, variantParam, phoneVerified, profile?.phone_number, refreshPhoneState]);

  return (
    <BetweenerLoader
      label="Preparing your profile"
      sublabel="Setting up the right onboarding path."
    />
  );
}
