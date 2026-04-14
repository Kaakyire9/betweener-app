import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth-context";
import { getSignupSessionId } from "@/lib/signup-tracking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";

const AUTH_PENDING_TOKENS_KEY = "auth_pending_tokens_v1";
const RETIRED_DUPLICATE_REDIRECT_KEY = "retired_duplicate_redirect_v1";
// Disable auth-bootstrap while stabilizing core auth/phone verification routing.
// It can be re-enabled once the function is proven reliable in production.
const ENABLE_AUTH_BOOTSTRAP = false;

export default function AuthGateScreen() {
  const router = useRouter();
  const authContext = useAuth();
  const { isLoading, session, user, profile, refreshPhoneState, refreshProfile, phoneVerified } = authContext;
  const routedRef = useRef(false);
  const runInFlightRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const [statusText, setStatusText] = useState("Checking your account...");

  const getRetiredDuplicateRoute = (
    identityStatus: string | null,
    provider?: string | null,
    email?: string | null,
  ) => ({
    pathname: "/(auth)/retired-duplicate-account" as const,
    params: {
      ...(identityStatus ? { status: identityStatus } : {}),
      ...(provider ? { method: provider } : {}),
      ...(email ? { email: email.trim() } : {}),
    },
  });

  const persistRetiredDuplicateRedirect = async (
    identityStatus: string | null,
    provider?: string | null,
    email?: string | null,
  ) => {
    try {
      await AsyncStorage.setItem(
        RETIRED_DUPLICATE_REDIRECT_KEY,
        JSON.stringify({
          status: identityStatus ?? null,
          method: provider ?? null,
          email: email?.trim() || null,
          createdAt: Date.now(),
        }),
      );
    } catch {
      // best effort only
    }
  };

  const consumeRetiredDuplicateRoute = async () => {
    try {
      const raw = await AsyncStorage.getItem(RETIRED_DUPLICATE_REDIRECT_KEY);
      if (!raw) return null;
      await AsyncStorage.removeItem(RETIRED_DUPLICATE_REDIRECT_KEY);
      const parsed = JSON.parse(raw) as {
        status?: string | null;
        method?: string | null;
        email?: string | null;
        createdAt?: number;
      };
      if (typeof parsed?.createdAt === "number" && Date.now() - parsed.createdAt > 10 * 60 * 1000) {
        return null;
      }
      return getRetiredDuplicateRoute(parsed?.status ?? null, parsed?.method ?? null, parsed?.email ?? null);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (routedRef.current) return;
    if (isLoading) {
      runInFlightRef.current = false;
      return;
    }
    if (runInFlightRef.current && lastUserIdRef.current === user?.id) return;
    runInFlightRef.current = true;
    lastUserIdRef.current = user?.id ?? null;
    let active = true;
    const checkMergedRedirect = async (nextUserId: string | null | undefined) => {
      if (!nextUserId) return false;

      const { data, error } = await supabase.rpc("rpc_get_merged_account_redirect");
      if (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] merged redirect check failed", error.message);
        }
        return false;
      }

      const payload = (
        data as {
          is_merged?: boolean;
          merge_case_id?: string | null;
          kept_email_hint?: string | null;
          kept_sign_in_methods?: string[] | null;
        } | null
      ) ?? null;
      if (!payload?.is_merged) return false;

      try {
        await supabase.auth.signOut();
      } catch {
        // best effort only
      }

      if (!active || routedRef.current) return true;

      routedRef.current = true;
      router.replace({
        pathname: "/(auth)/merged-account",
        params: {
          ...(payload.merge_case_id ? { mergeCaseId: payload.merge_case_id } : {}),
          ...(payload.kept_email_hint ? { keptEmailHint: payload.kept_email_hint } : {}),
          ...(payload.kept_sign_in_methods?.length
            ? { keptMethods: payload.kept_sign_in_methods.join(",") }
            : {}),
        },
      });
      return true;
    };

    const hardFallbackTimer = setTimeout(() => {
      void (async () => {
        if (!active || routedRef.current) return;

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] hard fallback fired");
        }

        // If no session, go welcome
        if (!session?.user || !user?.id) {
          const retiredRoute = await consumeRetiredDuplicateRoute();
          routedRef.current = true;
          if (retiredRoute) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] hard fallback route", retiredRoute);
            }
            router.replace(retiredRoute);
            return;
          }
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] hard fallback route", "/(auth)/welcome");
          }
          router.replace("/(auth)/welcome");
          return;
        }

        if (await checkMergedRedirect(user.id)) {
          return;
        }

        // If email not verified, force verify-email
        if (!user.email_confirmed_at) {
          routedRef.current = true;
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] hard fallback route", "/(auth)/verify-email");
          }
          router.replace("/(auth)/verify-email");
          return;
        }

        const identityStatus = profile?.identity_status ?? null;
        const bestVerified = phoneVerified || profile?.phone_verified === true;
        const bestCompleted = profile?.profile_completed === true;

        routedRef.current = true;

        if (identityStatus === "recovered_into_existing_account" || identityStatus === "discarded_duplicate") {
          const retiredRoute = getRetiredDuplicateRoute(
            identityStatus,
            profile?.last_successful_auth_provider ?? user?.app_metadata?.provider ?? null,
            user?.email ?? null,
          );
          await persistRetiredDuplicateRedirect(
            identityStatus,
            profile?.last_successful_auth_provider ?? user?.app_metadata?.provider ?? null,
            user?.email ?? null,
          );
          try {
            await supabase.auth.signOut();
          } catch {
            // best effort only
          }
          router.replace(retiredRoute);
          return;
        }

        if (!bestVerified) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] hard fallback route", "/(auth)/verify-phone");
          }
          router.replace({
            pathname: "/(auth)/verify-phone",
            params: {
              next: encodeURIComponent("/(auth)/onboarding"),
              reason: "required_for_access",
            },
          });
          return;
        }

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log(
            "[auth-gate] hard fallback route",
            bestCompleted ? "/(tabs)/vibes" : "/(auth)/onboarding"
          );
        }
        router.replace(bestCompleted ? "/(tabs)/vibes" : "/(auth)/onboarding");
      })();
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
          const retiredRoute = await consumeRetiredDuplicateRoute();
          guardRoute(retiredRoute ?? "/(auth)/welcome");
          return;
        }

        if (await checkMergedRedirect(userToUse.id)) {
          return;
        }

        if (!userToUse.email_confirmed_at) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] email not verified");
          }
          guardRoute("/(auth)/verify-email");
          return;
        }

        // Optional: single server-side bootstrap (authoritative + fast).
        if (ENABLE_AUTH_BOOTSTRAP) {
          try {
            setStatusText("Bootstrapping your session...");
            const signupSessionId = await getSignupSessionId();
            const { data: freshSession } = await supabase.auth.getSession();
            if (freshSession?.session?.user) {
              sessionToUse = freshSession.session;
              userToUse = freshSession.session.user;
            }
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
              const fnUrl = baseUrl ? `${baseUrl}/functions/v1/auth-bootstrap` : "missing SUPABASE_URL";
              console.log("[auth-gate] bootstrap url", fnUrl);
              console.log("[auth-gate] bootstrap session", { hasSession: !!sessionToUse?.access_token });
            }
            const { data: bootstrapData, error: bootstrapError } = await Promise.race([
              supabase.functions.invoke("auth-bootstrap", {
                body: { signupSessionId },
              }),
              new Promise<{ data: null; error: Error }>((resolve) =>
                setTimeout(() => resolve({ data: null, error: new Error("bootstrap_timeout") }), 6000)
              ),
            ]);
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] bootstrap", { error: bootstrapError, data: bootstrapData });
            }
            if (bootstrapError && bootstrapError.message === "bootstrap_timeout") {
              setStatusText("Bootstrap timeout, checking profile...");
            }
            if (!bootstrapError && bootstrapData) {
              const verified = bootstrapData.verified === true;
              const profileCompleted = bootstrapData.profile_completed === true;
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
              guardRoute(profileCompleted ? "/(tabs)/vibes" : "/(auth)/onboarding", true);
              // Refresh context in background
              void refreshProfile();
              void refreshPhoneState();
              return;
            }
          } catch (error) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] bootstrap error", error);
            }
          }
        }

        void refreshProfile();
        const identityStatus = authContext.profile?.identity_status ?? profile?.identity_status ?? null;
        const verified = await refreshPhoneState();
        const profileCompleted = authContext.profile?.profile_completed === true;

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] refreshPhoneState done");
          console.log("[auth-gate] verified", {
            verified,
            profileCompleted,
          });
        }

        if (identityStatus === "recovered_into_existing_account" || identityStatus === "discarded_duplicate") {
          const retiredRoute = getRetiredDuplicateRoute(
            identityStatus,
            authContext.profile?.last_successful_auth_provider ??
              profile?.last_successful_auth_provider ??
              userToUse.app_metadata?.provider ??
              null,
            userToUse.email ?? null,
          );
          await persistRetiredDuplicateRedirect(
            identityStatus,
            authContext.profile?.last_successful_auth_provider ??
              profile?.last_successful_auth_provider ??
              userToUse.app_metadata?.provider ??
              null,
            userToUse.email ?? null,
          );
          try {
            await supabase.auth.signOut();
          } catch {
            // best effort only
          }
          guardRoute(retiredRoute);
          return;
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

        if (!profileCompleted) {
          guardRoute("/(auth)/onboarding", true);
          return;
        }

        guardRoute("/(tabs)/vibes", true);
      } catch (_error) {
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
  }, [isLoading, user?.id, profile?.profile_completed, router]);

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
