import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { getSignupPhoneState, getSignupSessionId } from "@/lib/signup-tracking";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

const AUTH_PENDING_TOKENS_KEY = "auth_pending_tokens_v1";

export default function AuthGateScreen() {
  const router = useRouter();
  const { isLoading, session, user, profile } = useAuth();
  const routedRef = useRef(false);
  const [statusText, setStatusText] = useState("Checking your account...");

  useEffect(() => {
    if (routedRef.current) return;
    let active = true;
    const hardFallbackTimer = setTimeout(() => {
      if (!active || routedRef.current) return;
      routedRef.current = true;
      if (session?.user) {
        router.replace(profile?.id ? "/(tabs)/vibes" : "/(auth)/onboarding");
      } else {
        router.replace("/(auth)/welcome");
      }
    }, 10000);

    const run = async () => {
      try {
        const guardRoute = (
          target: string | { pathname: string; params?: Record<string, string> },
          smooth = false
        ) => {
          if (!active || routedRef.current) return;
          routedRef.current = true;
          if (smooth) setStatusText("Almost there...");
          const routeNow = () => router.replace(target as any);
          if (smooth) {
            setTimeout(routeNow, 140);
          } else {
            routeNow();
          }
        };

        // Keep gate mostly silent; only log unexpected or critical events.
        let sessionToUse = session;
        let userToUse = user;

        // Give auth/session a short grace period to settle after OAuth callback.
        if (!sessionToUse || !userToUse) {
          const startedAt = Date.now();
          while (Date.now() - startedAt < 8000) {
            try {
              const { data } = await Promise.race([
                supabase.auth.getSession(),
                new Promise<{ data: { session: null } }>((resolve) =>
                  setTimeout(() => resolve({ data: { session: null } }), 1200)
                ),
              ]);
              if (data?.session?.user) {
                sessionToUse = data.session;
                userToUse = data.session.user;
                break;
              }
            } catch {
              // keep polling
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }

        // If callback could not finish setSession in time, recover from pending tokens once.
        if (!sessionToUse || !userToUse) {
          try {
            const rawPending = await AsyncStorage.getItem(AUTH_PENDING_TOKENS_KEY);
            if (rawPending) {
              const pending = JSON.parse(rawPending) as {
                accessToken?: string;
                refreshToken?: string;
                createdAt?: number;
              };
              const isFresh =
                typeof pending.createdAt === "number" && Date.now() - pending.createdAt < 15 * 60 * 1000;
              if (pending.accessToken && pending.refreshToken && isFresh) {
                await Promise.race([
                  supabase.auth.setSession({
                    access_token: pending.accessToken,
                    refresh_token: pending.refreshToken,
                  }),
                  new Promise((resolve) => setTimeout(resolve, 7000)),
                ]);
                const { data } = await supabase.auth.getSession();
                if (data?.session?.user) {
                  sessionToUse = data.session;
                  userToUse = data.session.user;
                  await AsyncStorage.removeItem(AUTH_PENDING_TOKENS_KEY);
                }
              } else if (!isFresh) {
                await AsyncStorage.removeItem(AUTH_PENDING_TOKENS_KEY);
              }
            }
          } catch {
            // ignore pending token recovery errors
          }
        }

        if (!sessionToUse || !userToUse) {
          const signupState = await getSignupPhoneState();
          if (signupState.verified) {
            guardRoute("/(auth)/onboarding", true);
            return;
          }
          guardRoute("/(auth)/welcome");
          return;
        }

        if (!userToUse.email_confirmed_at) {
          guardRoute("/(auth)/verify-email");
          return;
        }

        // Premium fast-path: verified fresh signup without profile goes straight to onboarding.
        const [signupState, signupSessionId] = await Promise.all([
          getSignupPhoneState(),
          getSignupSessionId(),
        ]);
        if (!profile?.id && signupState.verified && !!signupSessionId) {
          guardRoute("/(auth)/onboarding", true);
          return;
        }

        const { data: profileRow, error: profileError } = await Promise.race([
          supabase
            .from("profiles")
            .select("id, phone_verified")
            .eq("user_id", userToUse.id)
            .maybeSingle(),
          new Promise<{ data: null; error: Error }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error("profile_lookup_timeout") }), 12000)
          ),
        ]);
        void profileError;

        let verified = profileRow?.phone_verified === true || profile?.phone_verified === true;

        // If this is a fresh signup with verified phone and no profile yet, skip extra phone RPC.
        if (!verified && !profileRow?.id && !profile?.id && signupState.verified) {
          verified = true;
        }

        if (!verified) {
          const { data: rpcData, error: rpcError } = await Promise.race([
            supabase.rpc("rpc_get_phone_verification_status"),
            new Promise<{ data: null; error: Error }>((resolve) =>
              setTimeout(() => resolve({ data: null, error: new Error("phone_status_timeout") }), 8000)
            ),
          ]);
          void rpcError;
          verified = (rpcData as { verified?: boolean } | null)?.verified === true;
        }

        if (!verified) {
          guardRoute({
            pathname: "/(auth)/verify-phone",
            params: {
              next: encodeURIComponent("/(auth)/onboarding"),
              reason: "required_for_access",
            },
          });
          return;
        }

        if (!profile?.id && !profileRow?.id) {
          guardRoute("/(auth)/onboarding", true);
          return;
        }

        guardRoute("/(tabs)/vibes", true);
      } catch (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] unexpected error", error);
        }
        if (active && !routedRef.current) {
          routedRef.current = true;
          router.replace("/(auth)/welcome");
        }
      }
    };

    void run();
    return () => {
      active = false;
      clearTimeout(hardFallbackTimer);
    };
  }, [isLoading, session, user, profile, router]);

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
      <Text style={{ marginTop: 12, color: Colors.light.textMuted }}>{statusText}</Text>
    </View>
  );
}
