import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { getSignupPhoneState, getSignupSessionId } from "@/lib/signup-tracking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

const AUTH_PENDING_TOKENS_KEY = "auth_pending_tokens_v1";
const PROFILE_FLAGS_TIMEOUT_MS = 4000;

const fetchProfileFlags = async (userId: string, accessToken?: string | null) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_FLAGS_TIMEOUT_MS);
  const url = `${supabaseUrl}/rest/v1/profiles?select=phone_verified,profile_completed&user_id=eq.${userId}&limit=1`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken || anonKey}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ phone_verified?: boolean; profile_completed?: boolean }>;
    return data?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export default function AuthGateScreen() {
  const router = useRouter();
  const { isLoading, session, user, profile, refreshPhoneState } = useAuth();
  const routedRef = useRef(false);
  const runInFlightRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const [statusText, setStatusText] = useState("Checking your account...");

  useEffect(() => {
    if (routedRef.current) return;
    if (runInFlightRef.current && lastUserIdRef.current === user?.id) return;
    runInFlightRef.current = true;
    lastUserIdRef.current = user?.id ?? null;
    let active = true;
    const hardFallbackTimer = setTimeout(() => {
      if (!active || routedRef.current) return;
      routedRef.current = true;
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth-gate] fallback timer fired");
      }
      if (session?.user) {
        const completed = profile?.profile_completed === true;
        router.replace(completed ? "/(tabs)/vibes" : "/(auth)/onboarding");
        return;
      }
      router.replace("/(auth)/welcome");
    }, 10000);

    const run = async () => {
      try {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] run start");
        }
        const guardRoute = (
          target: string | { pathname: string; params?: Record<string, string> },
          smooth = false
        ) => {
          if (!active || routedRef.current) return;
          routedRef.current = true;
          if (smooth) setStatusText("Almost there...");
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] route", target);
          }
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
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] no session/user");
          }
          const signupState = await getSignupPhoneState();
          if (signupState.verified) {
            guardRoute("/(auth)/onboarding", true);
            return;
          }
          guardRoute("/(auth)/welcome");
          return;
        }

        if (!userToUse.email_confirmed_at) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] email not verified");
          }
          guardRoute("/(auth)/verify-email");
          return;
        }

        const [signupState, signupSessionId] = await Promise.all([
          getSignupPhoneState(),
          getSignupSessionId(),
        ]);

        const flags = await fetchProfileFlags(userToUse.id, sessionToUse?.access_token);
        const verifiedFromFlags = flags?.phone_verified === true;
        const completedFromFlags = flags?.profile_completed === true;
        const verified = verifiedFromFlags || (await refreshPhoneState());
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] refreshPhoneState done");
        }
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] verified", {
            verified,
            profileCompleted: completedFromFlags ?? profile?.profile_completed ?? null,
          });
        }

        if (!verified) {
          guardRoute({
            pathname: "/(auth)/verify-phone",
            params: { next: encodeURIComponent("/(auth)/onboarding") },
          });
          return;
        }

        if (!(completedFromFlags ?? profile?.profile_completed)) {
          guardRoute("/(auth)/onboarding", true);
          return;
        }

        guardRoute("/(tabs)/vibes", true);
      } catch (error) {
        if (active && !routedRef.current) {
          routedRef.current = true;
          router.replace("/(auth)/welcome");
        }
      } finally {
        runInFlightRef.current = false;
      }
    };

    void run();
    return () => {
      active = false;
      clearTimeout(hardFallbackTimer);
    };
  }, [isLoading, session?.user?.id, profile?.profile_completed, router]);

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
