import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  AUTH_PENDING_TOKENS_KEY,
  clearPendingAuthFlow,
  getFreshPendingAuthFlow,
  isTrustedAuthCallbackUrl,
  LAST_DEEP_LINK_URL_KEY,
  urlHasAuthPayload,
} from "@/lib/auth-callback";

type CallbackParams = Record<string, string | undefined>;
const AUTH_CALLBACK_LAST_SIG_KEY = "auth_callback_last_sig_v1";
const PENDING_RECOVERY_EMAIL_CONTEXT_KEY = "pending_recovery_email_context_v1";

const mergeParamsFromUrl = (target: CallbackParams, url: string) => {
  try {
    const parsed = Linking.parse(url);
    const query = parsed.queryParams ?? {};
    Object.entries(query).forEach(([key, value]) => {
      if (typeof value === "string") target[key] = value;
      else if (Array.isArray(value) && typeof value[0] === "string") target[key] = value[0];
    });
  } catch {
    // ignore malformed callback urls
  }

  if (url.includes("#")) {
    const fragment = url.split("#")[1] || "";
    const params = new URLSearchParams(fragment);
    params.forEach((value, key) => {
      target[key] = value;
    });
  }
};

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState("Verifying your email...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const didRunRef = useRef(false);
  const didNavigateRef = useRef(false);

  const waitForSession = async (timeoutMs = 9000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 1500)
          ),
        ]);
        if (data?.session) return true;
      } catch {
        // ignore transient getSession errors while polling
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };

  const buildCallbackSignature = (payload: {
    accessToken?: string;
    refreshToken?: string;
    code?: string;
    tokenHash?: string;
    type?: string;
  }) => {
    if (payload.accessToken || payload.refreshToken) {
      const a = (payload.accessToken ?? "").slice(-24);
      const r = (payload.refreshToken ?? "").slice(-24);
      return `tokens:${a}:${r}`;
    }
    if (payload.code) return `code:${payload.code.slice(0, 24)}`;
    if (payload.tokenHash || payload.type) {
      return `otp:${payload.type ?? ""}:${(payload.tokenHash ?? "").slice(0, 24)}`;
    }
    return null;
  };

  const routeToResetPassword = async (waitMs = 2500) => {
    if (didNavigateRef.current) return;
    await waitForSession(waitMs);
    didNavigateRef.current = true;
    setIsComplete(true);
    setStatus("Reset link verified. Redirecting...");
    router.replace("/(auth)/reset-password");
  };

  const routeToGate = async (waitMs = 1200) => {
    if (didNavigateRef.current) return;
    const hasSession = await waitForSession(waitMs);
    if (!hasSession) return;
    didNavigateRef.current = true;
    setIsComplete(true);
    setStatus("Signed in! Redirecting...");
    router.replace("/(auth)/gate");
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
    ]);
  };

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    const run = async () => {
      setIsProcessing(true);
      try {
        const pendingFlow = await getFreshPendingAuthFlow();
        const pendingPurpose = pendingFlow?.purpose ?? null;
        const isPendingPasswordReset = pendingPurpose === "password_reset";
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-callback] run start", {
            pendingPurpose,
            paramsKeys: Object.keys(params ?? {}),
          });
        }

        const hasExistingSession = await waitForSession(800);
        if (hasExistingSession && !isPendingPasswordReset) {
          await routeToGate(800);
          return;
        }

        const hasPendingFlow = pendingFlow !== null;
        const merged: CallbackParams = {};
        Object.entries(params).forEach(([key, value]) => {
          if (typeof value === "string") merged[key] = value;
          else if (Array.isArray(value) && typeof value[0] === "string") merged[key] = value[0];
        });

        const initialUrl = await Linking.getInitialURL();
        if (
          initialUrl &&
          urlHasAuthPayload(initialUrl) &&
          isTrustedAuthCallbackUrl(initialUrl)
        ) {
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth-callback] using initial url", initialUrl);
          }
          mergeParamsFromUrl(merged, initialUrl);
        }

        const storedUrl = await AsyncStorage.getItem(LAST_DEEP_LINK_URL_KEY);
        if (storedUrl) {
          if (
            urlHasAuthPayload(storedUrl) &&
            isTrustedAuthCallbackUrl(storedUrl)
          ) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth-callback] using stored url", storedUrl);
            }
            mergeParamsFromUrl(merged, storedUrl);
          }
          await AsyncStorage.removeItem(LAST_DEEP_LINK_URL_KEY);
        }

        const accessToken = merged.access_token;
        const refreshToken = merged.refresh_token;
        const code = merged.code;
        const tokenHash = merged.token_hash;
        const type = merged.type;
        const callbackError = merged.error;
        const callbackErrorCode = merged.error_code;
        const callbackErrorDescription = merged.error_description;
        const isRecoveryFlow = type === "recovery" || isPendingPasswordReset;
        const hasCallbackPayload = !!(accessToken || refreshToken || code || tokenHash || type);
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth-callback] merged payload", {
            hasPendingFlow,
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            hasCode: !!code,
            hasTokenHash: !!tokenHash,
            type: type ?? null,
            isRecoveryFlow,
            error: callbackError ?? null,
            errorCode: callbackErrorCode ?? null,
          });
        }

        if (!hasCallbackPayload && (callbackError || callbackErrorCode || callbackErrorDescription)) {
          const recoveryMessage = decodeURIComponent(
            callbackErrorDescription ||
              callbackError ||
              "This recovery email link is invalid or has expired. Please request a fresh link.",
          ).replace(/\+/g, " ");

          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.warn("[auth-callback] callback error payload", {
              callbackError,
              callbackErrorCode,
              callbackErrorDescription,
            });
          }

          await clearPendingAuthFlow();
          const recoveryContextRaw = await AsyncStorage.getItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
          if (pendingPurpose === "email_link" && recoveryContextRaw) {
            try {
              const recoveryContext = JSON.parse(recoveryContextRaw) as {
                phoneNumber?: string | null;
                recoveryToken?: string | null;
                currentMethod?: string | null;
                nextRoute?: string | null;
                reason?: string | null;
              };

              didNavigateRef.current = true;
              router.replace({
                pathname: "/(auth)/account-recovery",
                params: {
                  ...(recoveryContext.phoneNumber ? { phoneNumber: recoveryContext.phoneNumber } : {}),
                  ...(recoveryContext.recoveryToken ? { recoveryToken: recoveryContext.recoveryToken } : {}),
                  ...(recoveryContext.currentMethod ? { currentMethod: recoveryContext.currentMethod } : {}),
                  ...(recoveryContext.nextRoute ? { next: recoveryContext.nextRoute } : {}),
                  ...(recoveryContext.reason ? { reason: recoveryContext.reason } : {}),
                  callbackError: recoveryMessage,
                },
              });
              return;
            } catch {
              // fall through to the generic verify-email screen
            }
          }

          didNavigateRef.current = true;
          router.replace({
            pathname: "/(auth)/verify-email",
            params: {
              recovery: "true",
              error: encodeURIComponent(recoveryMessage),
            },
          });
          return;
        }

        if (hasCallbackPayload && !hasPendingFlow && typeof __DEV__ !== "undefined" && __DEV__) {
          console.warn("[auth-callback] processing trusted callback payload without pending flow");
        }

        const callbackSig = buildCallbackSignature({
          accessToken,
          refreshToken,
          code,
          tokenHash,
          type,
        });
        if (callbackSig) {
          const lastSig = await AsyncStorage.getItem(AUTH_CALLBACK_LAST_SIG_KEY);
          if (lastSig === callbackSig) {
            await clearPendingAuthFlow();
            if (isRecoveryFlow) {
              await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
              await routeToResetPassword(1800);
              if (!didNavigateRef.current) {
                didNavigateRef.current = true;
                router.replace("/(auth)/reset-password");
              }
            } else {
              await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
              await routeToGate(1800);
              if (!didNavigateRef.current) {
                didNavigateRef.current = true;
                router.replace("/(auth)/gate");
              }
            }
            return;
          }
        }

        if (tokenHash && type) {
          setStatus(isRecoveryFlow ? "Verifying your reset link..." : "Verifying your email...");
          const { error } = await withTimeout(
            supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as any,
            }),
            7000,
            "verify_otp_timeout"
          );
          if (error) throw error;
          if (callbackSig) {
            await AsyncStorage.setItem(AUTH_CALLBACK_LAST_SIG_KEY, callbackSig);
          }
          await clearPendingAuthFlow();
          if (isRecoveryFlow) {
            await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
            await routeToResetPassword(2500);
            if (!didNavigateRef.current) {
              didNavigateRef.current = true;
              router.replace("/(auth)/reset-password");
            }
          } else {
            await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
            didNavigateRef.current = true;
            router.replace("/(auth)/verify-email?verified=true");
          }
          return;
        }

        if (code) {
          setStatus(isRecoveryFlow ? "Preparing password reset..." : "Completing sign in...");
          const { error } = await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            9000,
            "exchange_code_timeout"
          );
          if (error) throw error;
          if (callbackSig) {
            await AsyncStorage.setItem(AUTH_CALLBACK_LAST_SIG_KEY, callbackSig);
          }
          await clearPendingAuthFlow();
          if (isRecoveryFlow) {
            await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
            await routeToResetPassword(2500);
          } else {
            await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
            await routeToGate();
          }
          return;
        }

        if (accessToken && refreshToken) {
          setStatus(isRecoveryFlow ? "Preparing password reset..." : "Completing sign in...");
          await AsyncStorage.setItem(
            AUTH_PENDING_TOKENS_KEY,
            JSON.stringify({
              accessToken,
              refreshToken,
              createdAt: Date.now(),
            })
          );
          await Promise.race([
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
            new Promise<{ error: Error }>((resolve) =>
              setTimeout(() => resolve({ error: new Error("set_session_final_timeout") }), 18000)
            ),
          ]);
          // Gate can recover pending tokens if setSession is slow on some devices.
          const settled = await waitForSession(7000);
          if (settled) {
            await AsyncStorage.removeItem(AUTH_PENDING_TOKENS_KEY);
          }
          if (callbackSig) {
            await AsyncStorage.setItem(AUTH_CALLBACK_LAST_SIG_KEY, callbackSig);
          }
          await clearPendingAuthFlow();
          if (isRecoveryFlow) {
            await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
            await routeToResetPassword(2500);
            if (!didNavigateRef.current) {
              didNavigateRef.current = true;
              router.replace("/(auth)/reset-password");
            }
          } else {
            await AsyncStorage.removeItem(PENDING_RECOVERY_EMAIL_CONTEXT_KEY);
            // Always hand off to gate; it can recover pending tokens and route correctly.
            if (!didNavigateRef.current) {
              didNavigateRef.current = true;
              setIsComplete(true);
              setStatus("Signed in! Redirecting...");
              router.replace("/(auth)/gate");
            }
          }
          return;
        }

        if (isPendingPasswordReset) {
          await clearPendingAuthFlow();
          await routeToResetPassword(1200);
          if (!didNavigateRef.current) {
            didNavigateRef.current = true;
            router.replace("/(auth)/reset-password");
          }
        } else {
          await routeToGate();
          if (!didNavigateRef.current) {
            didNavigateRef.current = true;
            router.replace("/(auth)/gate");
          }
        }
      } catch (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.error("[auth-callback] callback error", error);
        }
        const pendingFlow = await getFreshPendingAuthFlow();
        if (pendingFlow?.purpose === "password_reset") {
          await clearPendingAuthFlow();
          await routeToResetPassword(1200);
          if (!didNavigateRef.current) {
            didNavigateRef.current = true;
            router.replace("/(auth)/reset-password");
          }
        } else {
          await routeToGate();
          if (!didNavigateRef.current) {
            didNavigateRef.current = true;
            router.replace("/(auth)/gate");
          }
        }
      } finally {
        setIsProcessing(false);
      }
    };

    void run();
  }, [params, router]);

  useEffect(() => {
    const watchdog = setTimeout(() => {
      if (didNavigateRef.current) return;
      void (async () => {
        const pendingFlow = await getFreshPendingAuthFlow();
        if (pendingFlow?.purpose === "password_reset") {
          await routeToResetPassword(1200);
          if (!didNavigateRef.current) {
            didNavigateRef.current = true;
            router.replace("/(auth)/reset-password");
          }
        } else {
          await routeToGate();
          if (!didNavigateRef.current) {
            didNavigateRef.current = true;
            router.replace("/(auth)/gate");
          }
        }
      })();
    }, 8000);
    return () => clearTimeout(watchdog);
  }, [router]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        padding: 24,
      }}
    >
      <ActivityIndicator size="large" color="#0FBAB5" />
      <Text
        style={{
          marginTop: 16,
          color: "#64748B",
          textAlign: "center",
          fontSize: 16,
          fontFamily: "Manrope_400Regular",
        }}
      >
        {status}
      </Text>
      {isProcessing && (
        <Text
          style={{
            marginTop: 8,
            color: "#94A3B8",
            textAlign: "center",
            fontSize: 14,
            fontStyle: "italic",
          }}
        >
          Processing verification...
        </Text>
      )}
      {isComplete && (
        <Text
          style={{
            marginTop: 8,
            color: "#10B981",
            textAlign: "center",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Complete
        </Text>
      )}
    </View>
  );
}
