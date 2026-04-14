import { Colors } from "@/constants/theme";
import { clearPendingAuthFlow, isTrustedAuthCallbackUrl, LAST_DEEP_LINK_URL_KEY, markPendingAuthFlow } from "@/lib/auth-callback";
import {
  storePendingRecoveryMergeNotice,
} from "@/lib/recovery-merge-notice";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type RecoveryMethod = "email" | "google" | "apple" | "magic_link";
type AutoMethod = "email" | "google" | "apple";
const PENDING_RECOVERY_EMAIL_CONTEXT_KEY = "pending_recovery_email_context_v1";

type RecoveryOptions = {
  found?: boolean;
  phone_number?: string | null;
  display_name?: string | null;
  email_hint?: string | null;
  sign_in_methods?: string[] | null;
  primary_method?: string | null;
  is_merged?: boolean;
  merge_case_id?: string | null;
  message?: string | null;
};

const METHOD_LABELS: Record<RecoveryMethod, string> = {
  google: "Google",
  apple: "Apple",
  email: "Email + password",
  magic_link: "Email link",
};

const AUTO_METHOD_LABELS: Record<AutoMethod, string> = {
  google: "Google",
  apple: "Apple",
  email: "Email",
};

const normalizeMethod = (value?: string | string[] | null): RecoveryMethod => {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
  if (normalized === "google" || normalized === "apple" || normalized === "email" || normalized === "magic_link") {
    return normalized;
  }
  return "email";
};

const normalizeAutoMethods = (value: RecoveryOptions["sign_in_methods"]): AutoMethod[] => {
  const seen = new Set<AutoMethod>();
  for (const entry of Array.isArray(value) ? value : []) {
    const normalized = String(entry ?? "").trim().toLowerCase();
    if (normalized === "google" || normalized === "apple" || normalized === "email") {
      seen.add(normalized);
    }
  }
  return Array.from(seen);
};

const suggestPreviousMethod = (currentMethod: RecoveryMethod): RecoveryMethod => {
  if (currentMethod === "apple") return "google";
  if (currentMethod === "google") return "apple";
  return "email";
};

const isAppleAuthCancelled = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const anyErr = error as { code?: string; message?: string };
  return anyErr.code === "ERR_CANCELED" || anyErr.code === "ERR_CANCELLED" || (typeof anyErr.message === "string" && anyErr.message.toLowerCase().includes("canceled"));
};

const isValidEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

export default function AccountRecoveryScreen() {
  WebBrowser.maybeCompleteAuthSession();

  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const theme = useMemo(() => Colors.light, []);
  const phoneNumber = String(params.phoneNumber ?? "").trim();
  const recoveryToken = typeof params.recoveryToken === "string" ? params.recoveryToken.trim() : "";
  const currentMethod = normalizeMethod(params.currentMethod);
  const nextRoute = String(params.next ?? "").trim();
  const reason = String(params.reason ?? "").trim();
  const callbackError =
    typeof params.callbackError === "string" ? params.callbackError.trim() : "";

  const [options, setOptions] = useState<RecoveryOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [previousEmail, setPreviousEmail] = useState("");
  const [details, setDetails] = useState("");
  const [previousMethod, setPreviousMethod] = useState<RecoveryMethod>(suggestPreviousMethod(currentMethod));
  const [loadingMethod, setLoadingMethod] = useState<string | null>(null);
  const [submittingFallback, setSubmittingFallback] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [autoDispatchingEmail, setAutoDispatchingEmail] = useState(false);

  const availableMethods = useMemo(() => normalizeAutoMethods(options?.sign_in_methods), [options?.sign_in_methods]);

  const persistPendingMergeSuggestion = async () => {
    if (!user?.id) return;
    await storePendingRecoveryMergeNotice({
      createdAt: Date.now(),
      duplicateUserId: user.id,
      duplicateEmail: user.email ?? null,
      conflictingPhoneNumber: phoneNumber || null,
      attemptedSignInMethod: currentMethod,
      restoredMethod: typeof options?.primary_method === "string" ? options.primary_method : null,
      recoveryToken: recoveryToken || null,
      autoRecoveryMethods: availableMethods,
    });
  };

  useEffect(() => {
    if (user?.email) {
      setContactEmail((current) => current || user.email || "");
    }
  }, [user?.email]);

  useEffect(() => {
    if (!callbackError) return;
    setOptionsError(callbackError);
    setShowManualFallback(true);
  }, [callbackError]);

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      if (!user?.id || !recoveryToken) {
        if (active) {
          setLoadingOptions(false);
          setShowManualFallback(true);
          setOptionsError("Recovery session not found. Please verify the phone number again.");
        }
        return;
      }

      setLoadingOptions(true);
      setOptionsError("");

      try {
        const { data, error } = await supabase.rpc("rpc_get_account_recovery_options", {
          p_recovery_token: recoveryToken,
        });

        if (!active) return;
        if (error) {
          setOptionsError(error.message || "Unable to load recovery options right now.");
          setShowManualFallback(true);
          return;
        }

        const payload = (data as RecoveryOptions | null) ?? null;
        if (!payload?.found) {
          setOptions(null);
          setOptionsError("We could not map the older account automatically.");
          setShowManualFallback(true);
          return;
        }

        setOptions(payload);
        setPreviousMethod(normalizeMethod(payload.primary_method || suggestPreviousMethod(currentMethod)));
      } catch (error: any) {
        if (!active) return;
        setOptionsError(error?.message ?? "Unable to load recovery options right now.");
        setShowManualFallback(true);
      } finally {
        if (active) setLoadingOptions(false);
      }
    };

    void loadOptions();
    return () => {
      active = false;
    };
  }, [recoveryToken, user?.id, currentMethod]);

  const handleGoBack = () => {
    router.replace({
      pathname: "/(auth)/verify-phone",
      params: {
        ...(nextRoute ? { next: nextRoute } : {}),
        ...(reason ? { reason } : {}),
      },
    });
  };

  const getRedirectUrl = () =>
    makeRedirectUri({
      scheme: "betweenerapp",
      path: "auth/callback",
    });

  const waitForSession = async (timeoutMs = 6000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };

  const signOutBeforeRecovery = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // best effort only
    }
  };

  const sendRecoveryEmailLink = async ({
    requireConfirmedEmail,
    onAmbiguousEmail,
  }: {
    requireConfirmedEmail: boolean;
    onAmbiguousEmail?: () => void;
  }) => {
    if (!recoveryToken) {
      Alert.alert("Recovery session expired", "Please verify that phone number again.");
      return false;
    }

    if (requireConfirmedEmail) {
      const email = recoveryEmail.trim().toLowerCase();
      if (!isValidEmail(email)) {
        Alert.alert("Enter the older account email", "Use the email attached to the older Betweener account.");
        return false;
      }
    }

    await persistPendingMergeSuggestion();
    await markPendingAuthFlow("email_link");

    const { data, error } = await supabase.functions.invoke("start-account-recovery", {
      body: {
        recoveryToken,
        method: "email",
      },
    });

    const responseCode =
      typeof data?.code === "string"
        ? data.code
        : typeof (error as any)?.context?.json?.code === "string"
          ? (error as any).context.json.code
          : null;
    const responseMessage =
      typeof data?.error === "string"
        ? data.error
        : typeof (error as any)?.context?.json?.error === "string"
          ? (error as any).context.json.error
          : error?.message ?? null;

    if (error || !data?.sent) {
      await clearPendingAuthFlow();
      if (responseCode === "email_recovery_ambiguous_duplicate_address") {
        setOptionsError(
          responseMessage ||
            "This email is attached to the newer sign-in too, so an email link could reopen the duplicate account. Use the older account password instead.",
        );
        setShowManualFallback(true);
        onAmbiguousEmail?.();
        return false;
      }
      throw error ?? new Error(responseMessage || "Unable to send recovery link.");
    }

      const hint = typeof data?.emailHint === "string" ? data.emailHint : options?.email_hint ?? null;
      await signOutBeforeRecovery();
      await AsyncStorage.setItem(
        PENDING_RECOVERY_EMAIL_CONTEXT_KEY,
        JSON.stringify({
          phoneNumber: phoneNumber || null,
          recoveryToken: recoveryToken || null,
          currentMethod,
          nextRoute: nextRoute || null,
          reason: reason || null,
        }),
      );
      setSuccessMessage(
        hint
          ? `A recovery sign-in link is on the way to ${hint}. Open that inbox to restore the older account.`
          : "A recovery sign-in link is on the way to the older account email.",
    );
    router.replace({
      pathname: "/(auth)/verify-email",
      params: {
        ...(hint ? { email: hint } : {}),
        recovery: "true",
      },
    });
    return true;
  };

  const handleGoogleRecovery = async () => {
    setLoadingMethod("google");
    setSuccessMessage("");
    try {
      await persistPendingMergeSuggestion();
      await signOutBeforeRecovery();
      await markPendingAuthFlow("oauth");
      const redirectTo = getRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error || !data?.url) throw error ?? new Error("Unable to start Google recovery.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success" && result.url && isTrustedAuthCallbackUrl(result.url)) {
        await AsyncStorage.setItem(LAST_DEEP_LINK_URL_KEY, result.url);
        router.replace("/(auth)/callback");
      } else {
        await clearPendingAuthFlow();
      }
    } catch (error: any) {
      await clearPendingAuthFlow();
      Alert.alert("Google recovery failed", error?.message ?? "Please try again.");
    } finally {
      setLoadingMethod(null);
    }
  };

  const handleAppleRecovery = async () => {
    if (Platform.OS !== "ios") return;
    setLoadingMethod("apple");
    setSuccessMessage("");
    try {
      await persistPendingMergeSuggestion();
      await signOutBeforeRecovery();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("Apple sign-in failed to return a token.");
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) throw error;
      await waitForSession();
      router.replace("/(auth)/gate");
    } catch (error: any) {
      if (!isAppleAuthCancelled(error)) {
        Alert.alert("Apple recovery failed", error?.message ?? "Please try again.");
      }
    } finally {
      setLoadingMethod(null);
    }
  };

  const handleEmailLinkRecovery = async () => {
    setLoadingMethod("email_link");
    setSuccessMessage("");
    setOptionsError("");
    try {
      await sendRecoveryEmailLink({
        requireConfirmedEmail: true,
        onAmbiguousEmail: () => {
          setRecoveryEmail("");
        },
      });
    } catch (error: any) {
      Alert.alert("Email recovery failed", error?.message ?? "Please try again.");
    } finally {
      setLoadingMethod(null);
    }
  };

  const dispatchAutomaticEmailRecovery = async () => {
    setAutoDispatchingEmail(true);
    setSuccessMessage("");
    setOptionsError("");
    try {
      await sendRecoveryEmailLink({ requireConfirmedEmail: false });
    } catch (error: any) {
      Alert.alert("Automatic recovery failed", error?.message ?? "Please try again.");
    } finally {
      setAutoDispatchingEmail(false);
    }
  };

  useEffect(() => {
    if (loadingOptions || autoDispatchingEmail) return;
    if (!recoveryToken) return;
    if (availableMethods.length !== 1 || availableMethods[0] !== "email") return;
    if (successMessage) return;
    void dispatchAutomaticEmailRecovery();
  }, [availableMethods, autoDispatchingEmail, loadingOptions, recoveryToken, successMessage]);

  const handleSubmitFallback = async () => {
    if (!user?.id) {
      router.replace("/(auth)/welcome");
      return;
    }

    if (!contactEmail.trim()) {
      Alert.alert("Add a contact email", "We need an email address in case the automatic route still needs support backup.");
      return;
    }

    setSubmittingFallback(true);
    try {
      const note =
        details.trim() ||
        `Phone verification was blocked because ${phoneNumber || "this number"} already protects an older Betweener account.`;

      const { data, error } = await supabase.rpc("rpc_request_account_recovery", {
        p_current_sign_in_method: currentMethod,
        p_previous_sign_in_method: previousMethod,
        p_contact_email: contactEmail.trim(),
        p_previous_account_email: previousEmail.trim() || recoveryEmail.trim() || null,
        p_note: note,
        p_evidence: {
          source: "phone_verification_conflict",
          conflicting_phone_number: phoneNumber || null,
          current_email: user?.email ?? null,
          auto_recovery_methods: availableMethods,
          auto_recovery_email_hint: options?.email_hint ?? null,
        },
      });
      if (error || !data) throw error ?? new Error("Unable to submit the recovery request.");
      Alert.alert("Recovery request sent", "We could not finish the automatic route, so your fallback recovery request is now in review.", [{ text: "OK", onPress: handleGoBack }]);
    } catch (error: any) {
      Alert.alert("Unable to send request", error?.message ?? "Please try again in a moment.");
    } finally {
      setSubmittingFallback(false);
    }
  };

  const renderMethodButton = (method: AutoMethod) => {
    if (method === "apple" && Platform.OS !== "ios") return null;
    const loading = method === "email" ? loadingMethod === "email_link" : loadingMethod === method;
    const label = method === "email" ? "Send sign-in link" : `Continue with ${AUTO_METHOD_LABELS[method]}`;
    const onPress = method === "google" ? handleGoogleRecovery : method === "apple" ? handleAppleRecovery : handleEmailLinkRecovery;
    const iconName = method === "google" ? "google" : method === "apple" ? "apple" : "email-outline";

    return (
      <TouchableOpacity key={method} activeOpacity={0.92} style={[styles.primaryWrap, loadingMethod !== null && !loading && styles.buttonDisabled]} onPress={onPress} disabled={loadingMethod !== null}>
        <LinearGradient colors={method === "email" ? ["#0f8f8e", "#127f9e"] : ["#111827", "#111827"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
          {loading ? <ActivityIndicator color="#fff" /> : <><MaterialCommunityIcons name={iconName as any} size={19} color="#fff" /><Text style={styles.primaryText}>{label}</Text></>}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={[Colors.light.tint, Colors.light.accent, Colors.light.background]} start={{ x: 0.15, y: 0.08 }} end={{ x: 0.9, y: 0.96 }} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.keyboardWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.panelShadow} />
          <View style={[styles.panel, { backgroundColor: "rgba(252, 246, 240, 0.94)" }]}>
            <View style={styles.header}>
              <TouchableOpacity onPress={handleGoBack} style={styles.closeButton}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: theme.text }]}>Recover the right account</Text>
              <View style={styles.placeholder} />
            </View>
            <ScrollView style={styles.scrollArea} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.heroBlock}>
                <View style={[styles.eyebrowPill, { backgroundColor: "rgba(0, 128, 128, 0.09)" }]}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={theme.tint} />
                  <Text style={[styles.eyebrowText, { color: theme.tint }]}>Automatic recovery</Text>
                </View>
                <Text style={[styles.promptTitle, { color: theme.text }]}>This number already protects an older Betweener account</Text>
                <Text style={[styles.description, { color: theme.textMuted }]}>
                  {phoneNumber ? `${phoneNumber} already belongs to an older verified Betweener account.` : "This number already belongs to an older verified Betweener account."} Verify and recover that account to continue, or use a different number if you want a separate account.
                </Text>
              </View>

              {loadingOptions ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator color={theme.tint} />
                  <Text style={[styles.loadingText, { color: theme.textMuted }]}>Looking up the safest sign-in route...</Text>
                </View>
              ) : (
                <>
                  <View style={[styles.infoCard, { backgroundColor: "rgba(255,255,255,0.74)", borderColor: theme.outline }]}>
                    <Text style={[styles.infoTitle, { color: theme.text }]}>
                      {options?.display_name ? `We found ${options.display_name}'s account` : "We found the older account"}
                    </Text>
                    <Text style={[styles.infoText, { color: theme.textMuted }]}>
                      {options?.message || optionsError || "Use one of the older account's sign-in methods to get back in."}
                    </Text>
                    {availableMethods.length > 0 ? (
                      <View style={styles.methodRow}>
                        {availableMethods.map((method) => (
                          <View key={method} style={[styles.methodPill, { backgroundColor: "rgba(15, 186, 181, 0.12)", borderColor: "rgba(15, 186, 181, 0.24)" }]}>
                            <Text style={[styles.methodPillText, { color: theme.tint }]}>{AUTO_METHOD_LABELS[method]}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {options?.email_hint ? (
                      <View style={[styles.hintCard, { backgroundColor: "rgba(255,255,255,0.9)", borderColor: theme.outline }]}>
                        <Text style={[styles.hintLabel, { color: theme.textMuted }]}>Older account email hint</Text>
                        <Text style={[styles.hintValue, { color: theme.text }]}>{options.email_hint}</Text>
                      </View>
                    ) : null}
                  </View>

                  {availableMethods.some((method) => method === "google" || method === "apple") ? (
                    <View style={styles.actionGroup}>
                      {availableMethods.filter((method) => method !== "email").map(renderMethodButton)}
                    </View>
                  ) : null}

                  {availableMethods.includes("email") ? (
                    <View style={[styles.emailCard, { backgroundColor: "rgba(255,255,255,0.74)", borderColor: theme.outline }]}>
                      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Email recovery</Text>
                      <Text style={[styles.sectionIntro, { color: theme.textMuted }]}>
                        Enter the older account email if you want to request a fresh sign-in link manually.
                      </Text>
                      <TextInput value={recoveryEmail} onChangeText={setRecoveryEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder={options?.email_hint ? `Older email (${options.email_hint})` : "Older account email"} placeholderTextColor={theme.textMuted} style={[styles.input, { borderColor: theme.outline, color: theme.text, backgroundColor: "rgba(255,255,255,0.92)" }]} />
                      <View style={styles.emailActions}>
                        {renderMethodButton("email")}
                      </View>
                    </View>
                  ) : null}

                  {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
                  {optionsError ? <Text style={styles.errorText}>{optionsError}</Text> : null}
                </>
              )}

              <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowManualFallback((value) => !value)}>
                <Text style={[styles.secondaryText, { color: theme.text }]}>{showManualFallback ? "Hide manual fallback" : "Need help instead?"}</Text>
              </TouchableOpacity>

              {showManualFallback ? (
                <View style={[styles.formCard, { backgroundColor: "rgba(255,255,255,0.74)", borderColor: theme.outline }]}>
                  <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Fallback recovery request</Text>
                  <Text style={[styles.sectionIntro, { color: theme.textMuted }]}>Use this only if the automatic route fails. It keeps the existing support foundation alive as a safety net.</Text>
                  <View style={styles.chipRow}>
                    {(["google", "apple", "email", "magic_link"] as RecoveryMethod[]).map((method) => {
                      const active = previousMethod === method;
                      return (
                        <TouchableOpacity key={method} activeOpacity={0.9} onPress={() => setPreviousMethod(method)} style={[styles.methodChip, { backgroundColor: active ? "rgba(15, 186, 181, 0.14)" : "rgba(255,255,255,0.88)", borderColor: active ? "rgba(15, 186, 181, 0.45)" : theme.outline }]}>
                          <Text style={[styles.methodChipText, { color: active ? theme.tint : theme.textMuted }]}>{METHOD_LABELS[method]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Contact email</Text>
                  <TextInput value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="support can reach you here" placeholderTextColor={theme.textMuted} style={[styles.input, { borderColor: theme.outline, color: theme.text, backgroundColor: "rgba(255,255,255,0.92)" }]} />
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Older account email (optional)</Text>
                  <TextInput value={previousEmail} onChangeText={setPreviousEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder={options?.email_hint || "the older account email"} placeholderTextColor={theme.textMuted} style={[styles.input, { borderColor: theme.outline, color: theme.text, backgroundColor: "rgba(255,255,255,0.92)" }]} />
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Details (optional)</Text>
                  <TextInput value={details} onChangeText={setDetails} multiline textAlignVertical="top" placeholder={`Example: I signed in with ${METHOD_LABELS[currentMethod]} today, but the older account was under ${METHOD_LABELS[previousMethod]}.`} placeholderTextColor={theme.textMuted} style={[styles.input, styles.textArea, { borderColor: theme.outline, color: theme.text, backgroundColor: "rgba(255,255,255,0.92)" }]} />
                  <TouchableOpacity style={[styles.primaryWrap, submittingFallback && styles.buttonDisabled]} onPress={handleSubmitFallback} disabled={submittingFallback}>
                    <LinearGradient colors={submittingFallback ? ["#80b6b4", "#80b6b4"] : ["#0f8f8e", "#127f9e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                      {submittingFallback ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send fallback request</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity style={styles.secondaryButton} onPress={handleGoBack}>
                <Text style={[styles.secondaryText, { color: theme.text }]}>Use a different number</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16, paddingBottom: 8 },
  keyboardWrap: { flex: 1, paddingVertical: 8, position: "relative" },
  panelShadow: { position: "absolute", top: 22, left: 18, right: 18, bottom: 10, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.24)", opacity: 0.55 },
  panel: { flex: 1, borderRadius: 30, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.52)" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(95, 112, 108, 0.12)" },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(95, 112, 108, 0.12)" },
  title: { fontSize: 20, fontFamily: "Archivo_700Bold", letterSpacing: 0.2 },
  placeholder: { width: 38 },
  scrollArea: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 34, gap: 16 },
  heroBlock: { marginBottom: 4 },
  eyebrowPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 16 },
  eyebrowText: { fontSize: 12, fontFamily: "Manrope_700Bold", letterSpacing: 0.3, textTransform: "uppercase" },
  promptTitle: { fontSize: 31, lineHeight: 38, marginBottom: 10, fontFamily: "Archivo_700Bold", letterSpacing: -0.4 },
  description: { fontSize: 15, lineHeight: 23, fontFamily: "Manrope_500Medium" },
  loadingCard: { alignItems: "center", justifyContent: "center", paddingVertical: 28, gap: 10 },
  loadingText: { fontSize: 14, fontFamily: "Manrope_500Medium" },
  infoCard: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 18, gap: 12 },
  infoTitle: { fontSize: 20, lineHeight: 26, fontFamily: "Archivo_700Bold" },
  infoText: { fontSize: 14, lineHeight: 22, fontFamily: "Manrope_500Medium" },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  methodPillText: { fontSize: 12.5, fontFamily: "Manrope_700Bold" },
  hintCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, gap: 4 },
  hintLabel: { fontSize: 11, lineHeight: 16, textTransform: "uppercase", fontFamily: "Manrope_700Bold", letterSpacing: 0.5 },
  hintValue: { fontSize: 15, lineHeight: 20, fontFamily: "Archivo_700Bold" },
  actionGroup: { gap: 12 },
  emailCard: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 18, gap: 14 },
  sectionLabel: { fontSize: 12, fontFamily: "Manrope_700Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  sectionIntro: { fontSize: 14, lineHeight: 21, fontFamily: "Manrope_500Medium" },
  input: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 16, fontSize: 15, fontFamily: "Manrope_500Medium" },
  emailActions: { gap: 10 },
  primaryWrap: { borderRadius: 18, overflow: "hidden" },
  primaryButton: { minHeight: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, flexDirection: "row", gap: 8 },
  primaryText: { color: "#fff", fontSize: 16, fontFamily: "Manrope_700Bold" },
  secondaryButton: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 18, borderWidth: 1, borderColor: "rgba(95, 112, 108, 0.14)", backgroundColor: "rgba(255,255,255,0.64)", paddingHorizontal: 16 },
  secondaryText: { fontSize: 15, fontFamily: "Manrope_700Bold" },
  buttonDisabled: { opacity: 0.7 },
  formCard: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 18, gap: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  methodChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  methodChipText: { fontSize: 13, fontFamily: "Manrope_700Bold" },
  fieldLabel: { fontSize: 12, fontFamily: "Manrope_700Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  textArea: { minHeight: 120 },
  successText: { color: "#10b981", fontSize: 13.5, lineHeight: 20, fontFamily: "Manrope_600SemiBold" },
  errorText: { color: "#ef4444", fontSize: 13.5, lineHeight: 20, fontFamily: "Manrope_600SemiBold" },
});
