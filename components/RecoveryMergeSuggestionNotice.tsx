import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";

import {
  clearPendingIdentityLink,
  isTrustedAuthCallbackUrl,
  markPendingIdentityLink,
} from "@/lib/auth-callback";
import { useAuth } from "@/lib/auth-context";
import {
  clearPendingRecoveryMergeNotice,
  getPendingRecoveryMergeNotice,
  type PendingRecoveryMergeNotice,
} from "@/lib/recovery-merge-notice";
import { supabase } from "@/lib/supabase";

type ProviderLinkPlan = {
  found?: boolean;
  candidate_provider?: string | null;
  action?: string | null;
  reason?: string | null;
  shell_identity_status?: string | null;
};

const methodLabel = (value?: string | null) => {
  switch (String(value || "").trim().toLowerCase()) {
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    case "magic_link":
      return "Email link";
    case "email":
      return "Email + password";
    default:
      return "your previous sign-in method";
  }
};

const providerDisplayLabel = (value?: string | null) => {
  switch (String(value || "").trim().toLowerCase()) {
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    case "email":
      return "Email";
    default:
      return "this sign-in method";
  }
};

export default function RecoveryMergeSuggestionNotice() {
  const { user } = useAuth();
  const [notice, setNotice] = useState<PendingRecoveryMergeNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [retireInFlight, setRetireInFlight] = useState(false);
  const [retiredToken, setRetiredToken] = useState<string | null>(null);
  const [providerLinkPlan, setProviderLinkPlan] = useState<ProviderLinkPlan | null>(null);

  const loadNotice = useCallback(async () => {
    if (!user?.id) {
      setNotice(null);
      return;
    }

    const pending = await getPendingRecoveryMergeNotice();
    if (!pending) {
      setNotice(null);
      return;
    }

    // Only surface the suggestion after the user has actually landed in a different,
    // older account than the duplicate account they started from.
    if (pending.duplicateUserId === user.id) {
      setNotice(null);
      return;
    }

    if (pending.recoveryToken && !retireInFlight && pending.recoveryToken !== retiredToken) {
      setRetireInFlight(true);
      try {
        await supabase.rpc("rpc_resolve_recovered_duplicate_shell", {
          p_recovery_token: pending.recoveryToken,
        });
        setRetiredToken(pending.recoveryToken);
      } catch {
        // best effort only; a failed retirement should not block the restored account UI
      } finally {
        setRetireInFlight(false);
      }
    }

    if (pending.recoveryToken) {
      try {
        const { data } = await supabase.rpc("rpc_get_account_recovery_provider_link_plan", {
          p_recovery_token: pending.recoveryToken,
        });
        setProviderLinkPlan((data as ProviderLinkPlan | null) ?? null);
      } catch {
        setProviderLinkPlan(null);
      }
    } else {
      setProviderLinkPlan(null);
    }

    setNotice(pending);
  }, [retireInFlight, retiredToken, user?.id]);

  useEffect(() => {
    void loadNotice();
  }, [loadNotice]);

  const waitForSession = useCallback(async (timeoutMs = 9000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }, []);

  const getOAuthRedirectUrl = useCallback(
    () =>
      makeRedirectUri({
        scheme: "betweenerapp",
        path: "auth/callback",
      }),
    [],
  );

  const finishIdentityCallback = useCallback(async (url: string) => {
    if (!isTrustedAuthCallbackUrl(url)) {
      throw new Error("Untrusted auth callback.");
    }

    const merged: Record<string, string | undefined> = {};

    try {
      const parsed = Linking.parse(url);
      const query = parsed.queryParams ?? {};
      Object.entries(query).forEach(([key, value]) => {
        if (typeof value === "string") merged[key] = value;
        else if (Array.isArray(value) && typeof value[0] === "string") merged[key] = value[0];
      });
    } catch {
      // ignore malformed callback urls
    }

    if (url.includes("#")) {
      const fragment = url.split("#")[1] || "";
      const params = new URLSearchParams(fragment);
      params.forEach((value, key) => {
        merged[key] = value;
      });
    }

    const code = merged.code;
    const accessToken = merged.access_token;
    const refreshToken = merged.refresh_token;
    const callbackError = merged.error;
    const callbackErrorDescription = merged.error_description;

    if (callbackError || callbackErrorDescription) {
      throw new Error(
        decodeURIComponent(callbackErrorDescription || callbackError || "Provider linking was cancelled.")
          .replace(/\+/g, " ")
      );
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return;
    }

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    }
  }, []);

  const formatIdentityLinkError = useCallback((error: any, providerLabel: string) => {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("manual linking") && message.includes("disabled")) {
      return `${providerLabel} linking is not enabled on Betweener auth yet. Enable Manual Linking in Supabase Authentication settings, then try again.`;
    }
    if (code === "identity_already_exists") {
      return `This ${providerLabel} account is already linked to another Betweener account.`;
    }
    if (code === "identity_not_found") {
      return `${providerLabel} could not be linked right now. Please try again.`;
    }
    return error?.message ?? `Unable to link ${providerLabel}.`;
  }, []);

  const handleLinkProvider = useCallback(async () => {
    if (!providerLinkPlan?.candidate_provider) return;

    const candidate = providerLinkPlan.candidate_provider;
    const candidateLabel = providerDisplayLabel(candidate);
    if (candidate !== "google" && candidate !== "apple") return;
    if (candidate === "apple" && Platform.OS !== "ios") {
      Alert.alert("Apple linking unavailable", "Apple can only be linked from an iPhone or iPad.");
      return;
    }

    setLinkingProvider(candidate);
    try {
      if (candidate === "google") {
        const redirectTo = getOAuthRedirectUrl();
        const { data, error } = await supabase.auth.linkIdentity({
          provider: "google",
          options: { redirectTo },
        });
        if (error || !data?.url) {
          throw error ?? new Error("Unable to start Google linking.");
        }
        await markPendingIdentityLink("google");
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== "success" || !result.url || !isTrustedAuthCallbackUrl(result.url)) {
          setLinkingProvider(null);
          return;
        }
        await finishIdentityCallback(result.url);
        await waitForSession(4000);
      } else {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!credential.identityToken) {
          throw new Error("Apple sign-in failed to return a token.");
        }
        const { error } = await supabase.auth.linkIdentity({
          provider: "apple",
          token: credential.identityToken,
        });
        if (error) throw error;
        await waitForSession(4000);
      }

      await loadNotice();
      Alert.alert(`${candidateLabel} linked`, `${candidateLabel} is now linked to this restored Betweener account.`);
    } catch (error: any) {
      const message = String(error?.message || "");
      if (
        candidate === "apple" &&
        (message.toLowerCase().includes("canceled") || message.toLowerCase().includes("cancelled"))
      ) {
        setLinkingProvider(null);
        return;
      }
      Alert.alert(`Unable to link ${candidateLabel}`, formatIdentityLinkError(error, candidateLabel));
    } finally {
      await clearPendingIdentityLink().catch(() => {});
      setLinkingProvider(null);
    }
  }, [
    finishIdentityCallback,
    formatIdentityLinkError,
    getOAuthRedirectUrl,
    loadNotice,
    providerLinkPlan?.candidate_provider,
    waitForSession,
  ]);

  const dismissNotice = async () => {
    await clearPendingRecoveryMergeNotice();
    setNotice(null);
  };

  const requestMergeReview = async () => {
    if (!user?.id || !notice) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("rpc_request_account_recovery", {
        p_current_sign_in_method: notice.restoredMethod ?? null,
        p_previous_sign_in_method: notice.attemptedSignInMethod ?? null,
        p_contact_email: user.email ?? notice.duplicateEmail ?? null,
        p_previous_account_email: null,
        p_note:
          "Automatic recovery restored the older account. Please review whether the newer duplicate account should be merged into this restored account.",
        p_evidence: {
          source: "post_recovery_merge_suggestion",
          duplicate_user_id: notice.duplicateUserId,
          restored_user_id: user.id,
          duplicate_email: notice.duplicateEmail ?? null,
          conflicting_phone_number: notice.conflictingPhoneNumber ?? null,
          attempted_sign_in_method: notice.attemptedSignInMethod ?? null,
          restored_method: notice.restoredMethod ?? null,
          recovery_token: notice.recoveryToken ?? null,
          auto_recovery_methods: notice.autoRecoveryMethods ?? [],
          provider_link_plan: providerLinkPlan,
        },
      });

      if (error || !data) {
        throw error ?? new Error("Unable to submit merge review request.");
      }

      await clearPendingRecoveryMergeNotice();
      setNotice(null);
      Alert.alert(
        "Merge review requested",
        "We restored your older account and queued a review for the newer duplicate account."
      );
    } catch (error: any) {
      Alert.alert("Unable to request merge review", error?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!notice) return null;

  const providerLabel = providerDisplayLabel(providerLinkPlan?.candidate_provider);

  const providerLinkMessage =
    providerLinkPlan?.action === "already_linked"
      ? `${providerLabel} is already linked to this restored account.`
      : providerLinkPlan?.action === "offer_native_link"
        ? `${providerLabel} can now be linked to this restored account before you leave this screen.`
        : providerLinkPlan?.action === "manual_email_backup"
          ? "Email recovery is restored, but a password backup still needs to be set up manually on this account."
          : providerLinkPlan?.action === "blocked_by_duplicate_shell_identity"
            ? `${providerLabel} is still attached to the retired duplicate shell, so linking cannot happen yet.`
            : null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.shadow} />
      <View style={styles.card}>
        <LinearGradient
          colors={["rgba(18, 28, 27, 0.985)", "rgba(15, 23, 23, 0.985)"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.cardGradient}
        >
          <View style={styles.accentGlow} />
          <View style={[styles.iconWrap, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
            <Ionicons name="git-merge-outline" size={20} color="#FFE0A8" />
          </View>
          <Text style={styles.eyebrow}>DUPLICATE ACCOUNT REVIEW</Text>
          <Text style={styles.title}>You’re back in the right account</Text>
          <Text style={styles.body}>
            We restored your older Betweener account. If you want, we can review whether the newer duplicate account you started from should be merged into this one.
          </Text>
          <Text style={styles.meta}>
            Started from {methodLabel(notice.attemptedSignInMethod)}. Restored to {methodLabel(notice.restoredMethod)}.
          </Text>
          {providerLinkMessage ? <Text style={styles.meta}>{providerLinkMessage}</Text> : null}

          {providerLinkPlan?.action === "offer_native_link" ? (
            <Pressable
              style={[
                styles.secondaryButton,
                styles.linkButton,
                {
                  borderColor: "rgba(42, 217, 212, 0.45)",
                  backgroundColor: "rgba(42, 217, 212, 0.12)",
                },
              ]}
              onPress={handleLinkProvider}
              disabled={submitting || linkingProvider !== null}
            >
              {linkingProvider ? (
                <ActivityIndicator color="#DFFDFC" />
              ) : (
                <Text style={[styles.secondaryText, { color: "#DFFDFC" }]}>Link {providerLabel} now</Text>
              )}
            </Pressable>
          ) : null}

          <Pressable
            style={styles.primaryWrap}
            onPress={requestMergeReview}
            disabled={submitting || linkingProvider !== null}
          >
            <LinearGradient
              colors={submitting ? ["#8AA8A7", "#8AA8A7"] : ["#2AD9D4", "#16C7C3", "#1797B1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Request merge review</Text>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, { borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)" }]}
            onPress={dismissNotice}
            disabled={submitting || linkingProvider !== null}
          >
            <Text style={[styles.secondaryText, { color: "#F7F3EE" }]}>Later</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 178,
    zIndex: 1001,
  },
  shadow: {
    position: "absolute",
    top: 8,
    left: 6,
    right: 6,
    bottom: -4,
    borderRadius: 26,
    backgroundColor: "rgba(4, 12, 12, 0.28)",
    opacity: 0.45,
  },
  card: {
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardGradient: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  accentGlow: {
    position: "absolute",
    right: -22,
    top: -10,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(255, 214, 153, 0.12)",
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  eyebrow: {
    color: "#FFE0A8",
    fontSize: 11.5,
    fontFamily: "Manrope_700Bold",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  title: {
    color: "#FBF6F1",
    fontSize: 24,
    lineHeight: 29,
    fontFamily: "Archivo_700Bold",
    marginBottom: 8,
  },
  body: {
    color: "rgba(245, 239, 232, 0.82)",
    fontSize: 14.5,
    lineHeight: 22,
    fontFamily: "Manrope_500Medium",
    marginBottom: 8,
  },
  meta: {
    color: "rgba(245, 239, 232, 0.68)",
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: "Manrope_600SemiBold",
    marginBottom: 18,
  },
  primaryWrap: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  primaryText: {
    color: "#fff",
    fontSize: 15.5,
    fontFamily: "Manrope_700Bold",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  linkButton: {
    marginBottom: 10,
  },
  secondaryText: {
    fontSize: 14.5,
    fontFamily: "Manrope_700Bold",
  },
});
