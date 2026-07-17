import BetweenerLoader from "@/components/ui/BetweenerLoader";
import { useAuth } from "@/lib/auth-context";
import { getSignupOnboardingVariant, getSignupPhoneState } from "@/lib/signup-tracking";
import { inferCountryFromPhoneNumber } from "@/lib/location/countries";
import { resolveOnboardingVariant } from "@/lib/onboarding/onboarding-routing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

export default function OnboardingRouter() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { phoneVerified, profile, refreshPhoneState, refreshProfile } = useAuth();
  const routedRef = useRef(false);
  const runTokenRef = useRef(0);

  const variantParam = (() => {
    const raw = params?.variant;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0];
    return undefined;
  })();

  useEffect(() => {
    const runToken = ++runTokenRef.current;
    let active = true;
    const canRoute = () => active && !routedRef.current && runTokenRef.current === runToken;

    const route = async () => {
      const [signupState, storedVariant, refreshedProfile] = await Promise.all([
        getSignupPhoneState(),
        getSignupOnboardingVariant(),
        refreshProfile(),
      ]);
      if (!canRoute()) return;

      const verifiedNow = phoneVerified || (await refreshPhoneState()) || signupState.verified;
      if (!canRoute()) return;

      const normalizedVariant = variantParam?.toLowerCase();
      const explicitVariant =
        normalizedVariant === "ghana" || normalizedVariant === "global"
          ? normalizedVariant
          : null;
      if (!verifiedNow) {
        const nextOnboardingRoute =
          explicitVariant === "ghana" || explicitVariant === "global"
            ? `/(auth)/onboarding?variant=${explicitVariant}`
            : "/(auth)/onboarding";
        routedRef.current = true;
        router.replace({
          pathname: "/(auth)/verify-phone",
          params: { next: encodeURIComponent(nextOnboardingRoute) },
        });
        return;
      }

      const routingProfile = refreshedProfile ?? profile;
      const phoneNumber = routingProfile?.phone_number || signupState.phoneNumber || "";
      const inferredPhoneCountryCode = inferCountryFromPhoneNumber(phoneNumber)?.code ?? null;
      const target = resolveOnboardingVariant({
        explicitVariant,
        profileVariant: (routingProfile as any)?.onboarding_variant,
        storedVariant,
        countryLockPolicy: (routingProfile as any)?.country_lock_policy,
        currentCountryCode: (routingProfile as any)?.current_country_code,
        currentCountry: (routingProfile as any)?.current_country,
        originCountryCode: (routingProfile as any)?.origin_country_code,
        originCountry: (routingProfile as any)?.origin_country,
        phoneCountryCode: inferredPhoneCountryCode,
      });

      if (!canRoute()) return;
      routedRef.current = true;
      router.replace(`/(auth)/onboarding-${target}`);
    };

    void route();
    return () => {
      active = false;
    };
  }, [router, variantParam, phoneVerified, profile, refreshPhoneState, refreshProfile]);

  return (
    <BetweenerLoader
      label="Preparing your profile"
      sublabel="Setting up the right onboarding path."
    />
  );
}
