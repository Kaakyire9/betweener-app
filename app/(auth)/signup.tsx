import { useAuth } from "@/lib/auth-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { clearPendingAuthFlow, markPendingAuthFlow } from "@/lib/auth-callback";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const router = useRouter();
  const { signUp, isAuthenticating } = useAuth();

  const normalizedEmail = email.trim().toLowerCase();
  const emailReady = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail);
  const passwordLongEnough = password.length >= 8;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordStrengthScore = [
    passwordLongEnough,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const passwordStrength =
    password.length === 0
      ? { label: "Not started", color: "#94A3B8", bars: 0 }
      : passwordStrengthScore <= 1
        ? { label: "Needs work", color: "#E35D6A", bars: 1 }
        : passwordStrengthScore <= 2
          ? { label: "Fair", color: "#D99A3D", bars: 2 }
          : passwordStrengthScore <= 3
            ? { label: "Good", color: "#0EA5A4", bars: 3 }
            : { label: "Strong", color: "#12805C", bars: 4 };

  const revealBottomOfForm = useCallback((delay = 120) => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (focusedField === "confirm") {
        revealBottomOfForm(40);
      }
    });
    return () => subscription.remove();
  }, [focusedField, revealBottomOfForm]);

  const validate = () => {
    if (!emailReady) {
      setError("Please enter a valid email address.");
      return false;
    }
    if (!passwordLongEnough) {
      setError("Password must be at least 8 characters.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    setError("");
    return true;
  };

  const handleSignup = async () => {
    if (!validate()) return;
    Keyboard.dismiss();
    setError("");
    setSuccess("");

    try {
      await markPendingAuthFlow("email_signup");
      const { error } = await signUp(normalizedEmail, password);

      if (error) {
        await clearPendingAuthFlow();
        setError(error.message);
        return;
      }

      await AsyncStorage.setItem("pending_verification_email", normalizedEmail);
      setSuccess("Signup successful! Please check your email to verify your account.");
      
      setTimeout(() => {
        router.replace("/(auth)/verify-email");
      }, 1500);
    } catch (_err: any) {
      await clearPendingAuthFlow();
      setError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <LinearGradient
      colors={["#0AA7A0", "#7C5FE6", "#F7E9DD"]}
      start={{ x: 0.08, y: 0.04 }}
      end={{ x: 0.95, y: 0.96 }}
      style={styles.gradient}
    >
      <View style={styles.glow} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
          style={styles.keyboardArea}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.panel}>
              <View style={styles.brandWrap}>
                <View style={styles.brandRow}>
                  <Text style={styles.brand}>Betweener</Text>
                  <Text style={styles.brandGlyph}>*</Text>
                </View>
                <View style={styles.brandRule} />
              </View>

              <View style={styles.securityPill}>
                <MaterialCommunityIcons name="shield-lock-outline" size={14} color="#0A7773" />
                <Text style={styles.securityPillText}>SECURE ACCOUNT</Text>
              </View>

              <Text style={styles.title}>Create your password</Text>
              <Text style={styles.subtitle}>
                A private sign-in you can use across your devices, even when you do not use Google or Apple.
              </Text>

              <View style={[styles.inputShell, focusedField === "email" && styles.inputShellActive]}>
                <MaterialCommunityIcons
                  name="email-outline"
                  size={18}
                  color={focusedField === "email" ? "#7C5FE6" : "#64748B"}
                />
                <TextInput
                  placeholder="Email address"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField((prev) => (prev === "email" ? null : prev))}
                  style={styles.input}
                />
                {email.length > 0 && emailReady ? (
                  <MaterialCommunityIcons name="check-circle" size={18} color="#12805C" />
                ) : null}
              </View>

              <View style={[styles.inputShell, focusedField === "password" && styles.inputShellActive]}>
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={18}
                  color={focusedField === "password" ? "#7C5FE6" : "#64748B"}
                />
                <TextInput
                  ref={passwordInputRef}
                  placeholder="Password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  autoComplete="new-password"
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  textContentType="newPassword"
                  onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField((prev) => (prev === "password" ? null : prev))}
                  style={styles.input}
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  hitSlop={8}
                  style={styles.iconButton}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={19}
                    color={focusedField === "password" ? "#7C5FE6" : "#64748B"}
                  />
                </Pressable>
              </View>

              <View style={styles.strengthCard}>
                <View style={styles.strengthHeader}>
                  <Text style={styles.strengthTitle}>Password strength</Text>
                  <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                    {passwordStrength.label}
                  </Text>
                </View>
                <View style={styles.strengthBars}>
                  {[1, 2, 3, 4].map((bar) => (
                    <View
                      key={bar}
                      style={[
                        styles.strengthBar,
                        bar <= passwordStrength.bars && { backgroundColor: passwordStrength.color },
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.requirementRow}>
                  <MaterialCommunityIcons
                    name={passwordLongEnough ? "check-circle" : "circle-outline"}
                    size={16}
                    color={passwordLongEnough ? "#12805C" : "#94A3B8"}
                  />
                  <Text style={[styles.requirementText, passwordLongEnough && styles.requirementTextReady]}>
                    At least 8 characters; longer is stronger
                  </Text>
                </View>
              </View>

              <View style={[styles.inputShell, focusedField === "confirm" && styles.inputShellActive]}>
                <MaterialCommunityIcons
                  name="lock-check-outline"
                  size={18}
                  color={focusedField === "confirm" ? "#7C5FE6" : "#64748B"}
                />
                <TextInput
                  ref={confirmPasswordInputRef}
                  placeholder="Confirm password"
                  placeholderTextColor="#94A3B8"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoComplete="new-password"
                  secureTextEntry={!showConfirmPassword}
                  returnKeyType="done"
                  textContentType="newPassword"
                  onSubmitEditing={() => void handleSignup()}
                  onFocus={() => {
                    setFocusedField("confirm");
                    revealBottomOfForm(160);
                  }}
                  onBlur={() => setFocusedField((prev) => (prev === "confirm" ? null : prev))}
                  style={styles.input}
                />
                <Pressable
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
                  hitSlop={8}
                  style={styles.iconButton}
                >
                  <MaterialCommunityIcons
                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                    size={19}
                    color={focusedField === "confirm" ? "#7C5FE6" : "#64748B"}
                  />
                </Pressable>
              </View>

              {confirmPassword.length > 0 ? (
                <View style={styles.matchRow}>
                  <MaterialCommunityIcons
                    name={passwordsMatch ? "check-circle" : "alert-circle-outline"}
                    size={16}
                    color={passwordsMatch ? "#12805C" : "#E35D6A"}
                  />
                  <Text style={[styles.matchText, { color: passwordsMatch ? "#12805C" : "#C2414F" }]}>
                    {passwordsMatch ? "Passwords match" : "Passwords do not match yet"}
                  </Text>
                </View>
              ) : null}

              {error ? (
                <View style={[styles.feedbackBanner, styles.errorBanner]}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#B42336" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              {success ? (
                <View style={[styles.feedbackBanner, styles.successBanner]}>
                  <MaterialCommunityIcons name="check-circle-outline" size={18} color="#12805C" />
                  <Text style={styles.successText}>{success}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.primaryButton, isAuthenticating && styles.buttonDisabled]}
                onPress={handleSignup}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <View style={styles.primaryButtonContent}>
                    <Text style={styles.primaryButtonText}>Create account</Text>
                    <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.inlineRow}>
                <Text style={styles.inlineText}>Prefer a password-free sign-in? </Text>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/(auth)/magic-link", params: { mode: "signup" } })
                  }
                >
                  <Text style={styles.inlineLink}>Use email link</Text>
                </Pressable>
              </View>

              <View style={styles.privacyRow}>
                <MaterialCommunityIcons name="lock-outline" size={13} color="#64748B" />
                <Text style={styles.privacyText}>Private by design · Never shown on your profile</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  glow: {
    position: "absolute",
    top: 110,
    left: "20%",
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: "rgba(124, 95, 230, 0.25)",
  },
  panel: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.66)",
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  brandWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  brand: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    letterSpacing: 0.4,
    color: "#0F172A",
  },
  brandGlyph: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 13,
    color: "#8B5CF6",
    marginTop: -6,
  },
  brandRule: {
    width: 52,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#A78BFA",
    marginTop: 8,
    opacity: 0.75,
  },
  securityPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginBottom: 12,
    borderRadius: 999,
    backgroundColor: "rgba(15, 186, 181, 0.11)",
    borderWidth: 1,
    borderColor: "rgba(15, 186, 181, 0.2)",
  },
  securityPillText: {
    color: "#0A7773",
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 30,
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Manrope_400Regular",
    fontSize: 15,
    color: "#64748B",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 22,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 18,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  inputShellActive: {
    borderColor: "#7C5FE6",
    shadowOpacity: 0.12,
  },
  iconButton: {
    padding: 6,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Manrope_400Regular",
    color: "#0F172A",
  },
  strengthCard: {
    marginTop: -2,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(241, 245, 249, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
  },
  strengthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  strengthTitle: {
    color: "#475569",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
  },
  strengthLabel: {
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
  },
  strengthBars: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#DDE3EA",
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  requirementText: {
    flex: 1,
    color: "#64748B",
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  requirementTextReady: {
    color: "#276C58",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: -5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  matchText: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  errorBanner: {
    backgroundColor: "rgba(227, 93, 106, 0.09)",
    borderColor: "rgba(227, 93, 106, 0.25)",
  },
  successBanner: {
    backgroundColor: "rgba(18, 128, 92, 0.09)",
    borderColor: "rgba(18, 128, 92, 0.22)",
  },
  errorText: {
    flex: 1,
    color: "#B42336",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  successText: {
    flex: 1,
    color: "#12805C",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: "#0A9E99",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginBottom: 18,
    shadowColor: "#087D79",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  primaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  primaryButtonText: {
    color: "#fff",
    fontFamily: "Archivo_700Bold",
    fontSize: 17,
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  inlineText: {
    color: "#64748B",
    fontFamily: "Manrope_400Regular",
    fontSize: 15,
  },
  inlineLink: {
    color: "#087D79",
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 15,
  },
  privacyText: {
    color: "#64748B",
    fontFamily: "Manrope_400Regular",
    fontSize: 11,
  },
});
