import { GuestGuard } from "@/components/auth-guard";
import { useAuth } from "@/lib/auth-context";
import { AUTH_V2_ENABLED } from "@/lib/feature-flags";
import { getSignupPhoneState } from "@/lib/signup-tracking";
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

function AuthFlowGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { phoneVerified, profile } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const isOnboardingRoute =
        typeof pathname === "string" && pathname.includes("/onboarding");
      if (!isOnboardingRoute) {
        if (active) setReady(true);
        return;
      }

      if (profile?.phone_verified || phoneVerified) {
        if (active) setReady(true);
        return;
      }

      const { verified } = await getSignupPhoneState();
      if (!active) return;
      if (verified) {
        setReady(true);
        return;
      }

      router.replace({
        pathname: "/(auth)/verify-phone",
        params: { next: encodeURIComponent("/(auth)/onboarding") },
      });
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [pathname, phoneVerified, profile?.phone_verified, router]);

  if (!ready) return null;
  return <>{children}</>;
}

export default function AuthLayout() {
  if (AUTH_V2_ENABLED) {
    return (
      <GuestGuard>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="welcome" />
            <Stack.Screen name="verify-phone" />
            <Stack.Screen name="signup-options" />
            <Stack.Screen name="login" />
            <Stack.Screen name="password-login" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="verify-email" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="onboarding-ghana" />
            <Stack.Screen name="onboarding-global" />
            <Stack.Screen name="callback" />
            <Stack.Screen name="gate" />
          </Stack>
        </View>
      </GuestGuard>
    );
  }

  return (
    <GuestGuard>
      <AuthFlowGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="welcome" />
          <Stack.Screen name="verify-phone" />
          <Stack.Screen name="signup-options" />
          <Stack.Screen name="login" />
          <Stack.Screen name="password-login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="verify-email" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="onboarding-ghana" />
          <Stack.Screen name="onboarding-global" />
          <Stack.Screen name="callback" />
        </Stack>
      </AuthFlowGuard>
    </GuestGuard>
  );
}
