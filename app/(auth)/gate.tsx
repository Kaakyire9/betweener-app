import BetweenerLoader from "@/components/ui/BetweenerLoader";
import { consumeSessionExpiredReason } from "@/lib/auth-session-reason";
import { useAuth } from "@/lib/auth-context";
import { getSignupSessionId } from "@/lib/signup-tracking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { supabase } from "@/lib/supabase";
import { clearPendingAuthProvider, getFreshPendingAuthProvider } from "@/lib/auth-callback";
import {
  peekPendingNotificationRoute,
} from "@/lib/notifications/notification-routing";

const AUTH_PENDING_TOKENS_KEY = "auth_pending_tokens_v1";
const RETIRED_DUPLICATE_REDIRECT_KEY = "retired_duplicate_redirect_v1";
const DISCONNECTED_PROVIDER_REDIRECT_KEY = "disconnected_provider_redirect_v1";
const EXPLICIT_SIGN_OUT_KEY = "auth_explicit_sign_out_v1";
const SESSION_CHECK_TIMEOUT_MS = 4_000;
const GATE_PROFILE_TIMEOUT_MS = 6_000;
const GATE_RETRY_DELAY_MS = 2_500;
const GATE_STORAGE_HELPER_TIMEOUT_MS = 1_200;
// Disable auth-bootstrap while stabilizing core auth/phone verification routing.
// It can be re-enabled once the function is proven reliable in production.
const ENABLE_AUTH_BOOTSTRAP = false;

const withTimeout = async <T,>(promise: Promise<T>, fallback: T, timeoutMs: number) => {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
  } catch {
    return fallback;
  }
};

export default function AuthGateScreen() {
  const router = useRouter();
  const authContext = useAuth();
  const {
    isLoading,
    session,
    user,
    profile,
    refreshPhoneState,
    refreshProfile,
    phoneVerified,
    hadStableAppAccess,
  } = authContext;
  const routedRef = useRef(false);
  const runInFlightRef = useRef(false);
  const runTokenRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);
  const [statusText, setStatusText] = useState("Opening Betweener");
  const [gateRetryTick, setGateRetryTick] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const waitForStoredSession = async (timeoutMs = SESSION_CHECK_TIMEOUT_MS) => {
    try {
      const { data, timedOut } = await Promise.race([
        supabase.auth.getSession().then((result) => ({
          data: result.data,
          timedOut: false,
        })),
        new Promise<{ data: { session: null }; timedOut: true }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null }, timedOut: true }), timeoutMs),
        ),
      ]);
      return { session: data?.session ?? null, timedOut };
    } catch {
      return { session: null, timedOut: true };
    }
  };

  const getPendingNotificationRouteWithTimeout = async () =>
    withTimeout(peekPendingNotificationRoute(), null, GATE_STORAGE_HELPER_TIMEOUT_MS);

  const getFreshPendingAuthProviderWithTimeout = async () =>
    withTimeout(getFreshPendingAuthProvider(), null, GATE_STORAGE_HELPER_TIMEOUT_MS);

  const clearPendingAuthProviderWithoutBlocking = () => {
    void withTimeout(clearPendingAuthProvider(), undefined, GATE_STORAGE_HELPER_TIMEOUT_MS);
  };

  const fetchGateProfileSnapshot = async (userId: string) => {
    try {
      const result = await Promise.race([
        supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle(),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error("gate_profile_timeout") }), GATE_PROFILE_TIMEOUT_MS),
        ),
      ]);

      if ((result as any)?.error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] profile snapshot error", (result as any).error?.message ?? (result as any).error);
        }
        return null;
      }

      return (result as any)?.data ?? null;
    } catch (error) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth-gate] profile snapshot failed", error);
      }
      return null;
    }
  };

  const hasText = (value: unknown) => String(value ?? "").trim().length > 0;

  const canTreatProfileAsCompleted = (profileSnapshot: any, verified: boolean) => {
    if (profileSnapshot?.profile_completed === true) return true;
    if (!profileSnapshot || !verified) return false;

    const hasCoreIdentity =
      hasText(profileSnapshot.full_name) &&
      profileSnapshot.age != null &&
      hasText(profileSnapshot.gender) &&
      (profileSnapshot.phone_verified === true || verified) &&
      hasText(profileSnapshot.phone_number);

    const hasCompletionMarker =
      profileSnapshot.onboarding_completed_at != null ||
      profileSnapshot.identity_finalized_at != null ||
      profileSnapshot.identity_status === "active";

    const hasProfileSubstance =
      hasText(profileSnapshot.bio) ||
      hasText(profileSnapshot.region) ||
      hasText(profileSnapshot.location) ||
      hasText(profileSnapshot.current_country) ||
      hasText(profileSnapshot.avatar_url);

    return hasCoreIdentity && (hasCompletionMarker || hasProfileSubstance);
  };

  const repairProfileCompletedFlag = async (profileSnapshot: any) => {
    if (!profileSnapshot?.id || profileSnapshot.profile_completed === true) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          profile_completed: true,
          identity_status: profileSnapshot.identity_status ?? "active",
          onboarding_completed_at: profileSnapshot.onboarding_completed_at ?? new Date().toISOString(),
          identity_finalized_at: profileSnapshot.identity_finalized_at ?? new Date().toISOString(),
        } as any)
        .eq("id", profileSnapshot.id);

      if (error && typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth-gate] profile completion repair failed", error.message);
      }
    } catch (error) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth-gate] profile completion repair exception", error);
      }
    }
  };

  const holdForConnectionRetry = (message = "Connection is unstable. Keeping you signed in while we retry...") => {
    if (!activeRef.current || routedRef.current) return;
    setStatusText(message);
    runInFlightRef.current = false;
    setTimeout(() => {
      if (!activeRef.current || routedRef.current) return;
      lastUserIdRef.current = null;
      setStatusText("Opening Betweener");
      setGateRetryTick((value) => value + 1);
    }, GATE_RETRY_DELAY_MS);
  };

  const consumeExplicitSignOut = async () => {
    try {
      const raw = await AsyncStorage.getItem(EXPLICIT_SIGN_OUT_KEY);
      if (!raw) return false;
      await AsyncStorage.removeItem(EXPLICIT_SIGN_OUT_KEY);
      const parsed = JSON.parse(raw) as { at?: number } | null;
      if (typeof parsed?.at !== "number") return false;
      return Date.now() - parsed.at < 2 * 60 * 1000;
    } catch {
      return false;
    }
  };

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

  const getDisconnectedProviderRoute = (
    provider?: string | null,
    email?: string | null,
  ) => ({
    pathname: "/(auth)/disconnected-provider" as const,
    params: {
      ...(provider ? { method: provider } : {}),
      ...(email ? { email: email.trim() } : {}),
    },
  });

  const persistDisconnectedProviderRedirect = async (
    provider?: string | null,
    email?: string | null,
  ) => {
    try {
      await AsyncStorage.setItem(
        DISCONNECTED_PROVIDER_REDIRECT_KEY,
        JSON.stringify({
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

  const consumeDisconnectedProviderRoute = async () => {
    try {
      const raw = await AsyncStorage.getItem(DISCONNECTED_PROVIDER_REDIRECT_KEY);
      if (!raw) return null;
      await AsyncStorage.removeItem(DISCONNECTED_PROVIDER_REDIRECT_KEY);
      const parsed = JSON.parse(raw) as {
        method?: string | null;
        email?: string | null;
        createdAt?: number;
      };
      if (typeof parsed?.createdAt === "number" && Date.now() - parsed.createdAt > 10 * 60 * 1000) {
        return null;
      }
      return getDisconnectedProviderRoute(parsed?.method ?? null, parsed?.email ?? null);
    } catch {
      return null;
    }
  };

  const consumeSessionExpiredRoute = async () => {
    const expired = await consumeSessionExpiredReason();
    if (!expired) return null;
    return {
      pathname: "/(auth)/login" as const,
      params: {
        reason: "session_expired",
      },
    };
  };

  useEffect(() => {
    if (routedRef.current) return;
    if (isLoading) {
      runInFlightRef.current = false;
      return;
    }
    runInFlightRef.current = true;
    lastUserIdRef.current = user?.id ?? null;
    const runToken = ++runTokenRef.current;
    const isCurrentRun = () =>
      activeRef.current && !routedRef.current && runTokenRef.current === runToken;
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

      if (!isCurrentRun()) return true;

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
        if (!isCurrentRun()) return;

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] hard fallback fired");
        }

        // If no session, go welcome
        if (!session?.user || !user?.id) {
          const stored = await waitForStoredSession();
          if (await consumeExplicitSignOut()) {
            routedRef.current = true;
            router.replace("/(auth)/welcome");
            return;
          }
          if (stored.timedOut) {
            holdForConnectionRetry();
            return;
          }
          if (stored.session?.user) {
            holdForConnectionRetry("Restoring your session. Please stay on this screen...");
            return;
          }
          const retiredRoute = await consumeRetiredDuplicateRoute();
          const disconnectedProviderRoute = await consumeDisconnectedProviderRoute();
          const sessionExpiredRoute = await consumeSessionExpiredRoute();
          routedRef.current = true;
          if (retiredRoute) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] hard fallback route", retiredRoute);
            }
            router.replace(retiredRoute);
            return;
          }
          if (disconnectedProviderRoute) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] hard fallback route", disconnectedProviderRoute);
            }
            router.replace(disconnectedProviderRoute);
            return;
          }
          if (sessionExpiredRoute) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] hard fallback route", sessionExpiredRoute);
            }
            router.replace(sessionExpiredRoute);
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
        const canResumeKnownGoodAppSurface = hadStableAppAccess && bestVerified;

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

        if (!bestVerified && !canResumeKnownGoodAppSurface) {
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
            bestCompleted || canResumeKnownGoodAppSurface ? "/(tabs)/vibes" : "/(auth)/onboarding"
          );
        }
        if (bestCompleted || canResumeKnownGoodAppSurface) {
          const pendingNotificationRoute = await getPendingNotificationRouteWithTimeout();
          if (pendingNotificationRoute) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] hard fallback route", pendingNotificationRoute);
            }
            router.replace(pendingNotificationRoute);
            return;
          }
        }
        router.replace(bestCompleted || canResumeKnownGoodAppSurface ? "/(tabs)/vibes" : "/(auth)/onboarding");
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
          if (!isCurrentRun()) return;
          routedRef.current = true;
          if (smooth) setStatusText("Opening your space");
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
          if (await consumeExplicitSignOut()) {
            guardRoute("/(auth)/welcome");
            return;
          }
          const stored = await waitForStoredSession();
          if (stored.timedOut) {
            holdForConnectionRetry();
            return;
          }
          if (stored.session?.user) {
            sessionToUse = stored.session;
            userToUse = stored.session.user;
          }
        }

        if (!sessionToUse || !userToUse) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] no session/user");
          }
          const retiredRoute = await consumeRetiredDuplicateRoute();
          const disconnectedProviderRoute = await consumeDisconnectedProviderRoute();
          const sessionExpiredRoute = await consumeSessionExpiredRoute();
          guardRoute(retiredRoute ?? disconnectedProviderRoute ?? sessionExpiredRoute ?? "/(auth)/welcome");
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
            setStatusText("Restoring your session");
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
              setStatusText("Keeping your session ready");
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

        const freshProfileSnapshot = await fetchGateProfileSnapshot(userToUse.id);
        void refreshProfile();
        const profileSnapshot = freshProfileSnapshot ?? authContext.profile ?? profile ?? null;
        const identityStatus = profileSnapshot?.identity_status ?? null;
        const verified = await refreshPhoneState();
        const profileCompleted = canTreatProfileAsCompleted(profileSnapshot, verified);
        if (profileCompleted && profileSnapshot?.profile_completed !== true) {
          void repairProfileCompletedFlag(profileSnapshot);
        }

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] refreshPhoneState done");
          console.log("[auth-gate] verified", {
            verified,
            profileCompleted,
            profileId: profileSnapshot?.id ?? null,
            profileCompletedRaw: profileSnapshot?.profile_completed ?? null,
            completionFallbackUsed: profileCompleted && profileSnapshot?.profile_completed !== true,
          });
        }

        if (identityStatus === "recovered_into_existing_account" || identityStatus === "discarded_duplicate") {
          const retiredRoute = getRetiredDuplicateRoute(
            identityStatus,
            profileSnapshot?.last_successful_auth_provider ??
              userToUse.app_metadata?.provider ??
              null,
            userToUse.email ?? null,
          );
          await persistRetiredDuplicateRedirect(
            identityStatus,
            profileSnapshot?.last_successful_auth_provider ??
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

        const pendingAuthProvider = await getFreshPendingAuthProviderWithTimeout();
        const currentProvider =
          String(
            pendingAuthProvider?.provider ??
              userToUse.app_metadata?.provider ??
              profileSnapshot?.last_successful_auth_provider ??
              "",
          )
            .trim()
            .toLowerCase() || null;

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] provider enforcement context", {
            pendingProvider: pendingAuthProvider?.provider ?? null,
            appMetadataProvider: userToUse.app_metadata?.provider ?? null,
            profileProvider: profileSnapshot?.last_successful_auth_provider ?? null,
            currentProvider,
            userId: userToUse.id,
            email: userToUse.email ?? null,
          });
        }

        if (currentProvider === "google" || currentProvider === "apple") {
          const { data: disconnectedProvider, error: disconnectedProviderError } = await supabase.rpc(
            "rpc_is_signin_provider_disconnected" as any,
            { p_provider: currentProvider },
          );
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] disconnected provider check", {
              currentProvider,
              disconnectedProvider: disconnectedProvider ?? null,
              disconnectedProviderError: disconnectedProviderError?.message ?? null,
            });
          }
          if (!disconnectedProviderError && disconnectedProvider === true) {
            const providerRoute = getDisconnectedProviderRoute(currentProvider, userToUse.email ?? null);
            await persistDisconnectedProviderRedirect(currentProvider, userToUse.email ?? null);
            try {
              await supabase.auth.signOut();
            } catch {
              // best effort only
            }
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-gate] disconnected provider route", providerRoute);
            }
            guardRoute(providerRoute);
            return;
          }
        }

        if (!verified && !hadStableAppAccess) {
          clearPendingAuthProviderWithoutBlocking();
          guardRoute({
            pathname: "/(auth)/verify-phone",
            params: {
              next: encodeURIComponent("/(auth)/onboarding"),
              reason: "required_for_access",
            },
          });
          return;
        }

        if (!profileSnapshot && hadStableAppAccess) {
          const pendingNotificationRoute = await getPendingNotificationRouteWithTimeout();
          if (pendingNotificationRoute) {
            guardRoute(pendingNotificationRoute, true);
            return;
          }
          guardRoute("/(tabs)/vibes", true);
          return;
        }

        if (!profileSnapshot) {
          holdForConnectionRetry("Connection is weak. We are keeping your session open while profile details load...");
          return;
        }

        if (!profileCompleted && !hadStableAppAccess) {
          clearPendingAuthProviderWithoutBlocking();
          guardRoute("/(auth)/onboarding", true);
          return;
        }

        clearPendingAuthProviderWithoutBlocking();
        const pendingNotificationRoute = await getPendingNotificationRouteWithTimeout();
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-gate] final route decision", {
            pendingNotificationRoute,
            profileCompleted,
            hadStableAppAccess,
            verified,
            profileId: profileSnapshot?.id ?? null,
          });
        }
        if (pendingNotificationRoute) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-gate] pending notification route", pendingNotificationRoute);
          }
          guardRoute(pendingNotificationRoute, true);
          return;
        }
        guardRoute("/(tabs)/vibes", true);
      } catch (_error) {
        if (isCurrentRun()) {
          holdForConnectionRetry();
        }
      } finally {
        if (runTokenRef.current === runToken) {
          runInFlightRef.current = false;
        }
      }
    };

    void run();
    return () => {
      clearTimeout(hardFallbackTimer);
    };
  }, [gateRetryTick, isLoading, user?.id, profile?.profile_completed, router]);

  return (
    <View style={{ flex: 1 }}>
      <BetweenerLoader
        label={statusText}
        sublabel="A private moment while we prepare your account."
      />
    </View>
  );
}
