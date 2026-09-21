import { useAuth } from "@/lib/auth-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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

export default function PasswordLoginScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const router = useRouter();
  const { signIn, isAuthenticating } = useAuth();

  const revealPasswordField = useCallback((delay = 120) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), delay);
  }, []);

  useEffect(() => {
    const routeEmail = typeof params.email === "string" ? params.email.trim() : "";
    if (routeEmail) {
      setEmail(routeEmail);
    }
  }, [params.email]);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (focusedField === "password") revealPasswordField(40);
    });
    return () => subscription.remove();
  }, [focusedField, revealPasswordField]);

  const validate = () => {
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
      setError("Please enter a valid email address.");
      return false;
    }
    if (!password) {
      setError("Please enter your password.");
      return false;
    }
    setError("");
    return true;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    Keyboard.dismiss();
    setError("");
    setSuccess("");

    try {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error.message);
        return;
      }
      setSuccess("Signed in successfully.");
      setTimeout(() => {
        router.replace("/(auth)/gate");
      }, 800);
    } catch {
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
                <Text style={styles.securityPillText}>WELCOME BACK</Text>
              </View>

              <Text style={styles.title}>Sign in securely</Text>
              <Text style={styles.subtitle}>
                Continue with the email and password connected to your Betweener account.
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
                  autoComplete="current-password"
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  textContentType="password"
                  onSubmitEditing={() => void handleLogin()}
                  onFocus={() => {
                    setFocusedField("password");
                    revealPasswordField(160);
                  }}
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
                onPress={handleLogin}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Sign in</Text>
                    <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              <Pressable
                onPress={() => router.push("/(auth)/forgot-password")}
                style={styles.forgotLink}
              >
                <Text style={styles.forgotText}>Forgot your password?</Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable onPress={() => router.push("/(auth)/magic-link")} style={styles.emailLinkButton}>
                <MaterialCommunityIcons name="email-fast-outline" size={18} color="#087D79" />
                <Text style={styles.emailLinkButtonText}>Send me a secure sign-in link</Text>
              </Pressable>

              <View style={styles.privacyRow}>
                <MaterialCommunityIcons name="lock-outline" size={13} color="#64748B" />
                <Text style={styles.privacyText}>Your sign-in stays private and protected</Text>
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
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Manrope_400Regular",
    color: "#0F172A",
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
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    shadowColor: "#087D79",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
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
  forgotLink: {
    alignItems: "center",
    paddingVertical: 7,
  },
  forgotText: {
    color: "#087D79",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(100, 116, 139, 0.2)",
  },
  dividerText: {
    color: "#94A3B8",
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
  },
  emailLinkButton: {
    minHeight: 52,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: "rgba(15, 186, 181, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(15, 186, 181, 0.2)",
  },
  emailLinkButtonText: {
    color: "#087D79",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
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
