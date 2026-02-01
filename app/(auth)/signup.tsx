import { useAuth } from "@/lib/auth-context";
import { getSignupPhoneState } from "@/lib/signup-tracking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const { signUp, isAuthenticating } = useAuth();

  useEffect(() => {
    let active = true;
    (async () => {
      const { verified } = await getSignupPhoneState();
      if (active && !verified) {
        router.replace("/(auth)/verify-phone");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const validate = () => {
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
      setError("Please enter a valid email address.");
      return false;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
    setError("");
    setSuccess("");

    try {
      const { error } = await signUp(email, password);

      if (error) {
        setError(error.message);
        return;
      }

      await AsyncStorage.setItem("pending_verification_email", email);
      setSuccess("Signup successful! Please check your email to verify your account.");
      
      setTimeout(() => {
        router.replace("/(auth)/verify-email");
      }, 1500);
    } catch (err: any) {
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
      <View style={styles.panel}>
        <View style={styles.brandWrap}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>Betweener</Text>
            <Text style={styles.brandGlyph}>*</Text>
          </View>
          <View style={styles.brandRule} />
        </View>

        <Text style={styles.title}>Password Signup</Text>
        <Text style={styles.subtitle}>
          Use this only if you prefer a password. For a faster experience, use the secure email link.
        </Text>

        <View style={[styles.inputShell, focusedField === "email" && styles.inputShellActive]}>
          <MaterialCommunityIcons
            name="email-outline"
            size={18}
            color={focusedField === "email" ? "#7C5FE6" : "#94A3B8"}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField((prev) => (prev === "email" ? null : prev))}
            style={styles.input}
          />
        </View>

        <View style={[styles.inputShell, focusedField === "password" && styles.inputShellActive]}>
          <MaterialCommunityIcons
            name="lock-outline"
            size={18}
            color={focusedField === "password" ? "#7C5FE6" : "#94A3B8"}
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField((prev) => (prev === "password" ? null : prev))}
            style={styles.input}
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            style={styles.iconButton}
          >
            <MaterialCommunityIcons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={focusedField === "password" ? "#7C5FE6" : "#94A3B8"}
            />
          </Pressable>
        </View>

        <View style={[styles.inputShell, focusedField === "confirm" && styles.inputShellActive]}>
          <MaterialCommunityIcons
            name="lock-check-outline"
            size={18}
            color={focusedField === "confirm" ? "#7C5FE6" : "#94A3B8"}
          />
          <TextInput
            placeholder="Confirm Password"
            placeholderTextColor="#94A3B8"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            onFocus={() => setFocusedField("confirm")}
            onBlur={() => setFocusedField((prev) => (prev === "confirm" ? null : prev))}
            style={styles.input}
          />
          <Pressable
            onPress={() => setShowConfirmPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
            style={styles.iconButton}
          >
            <MaterialCommunityIcons
              name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={focusedField === "confirm" ? "#7C5FE6" : "#94A3B8"}
            />
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, isAuthenticating && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={isAuthenticating}
        >
          <Text style={styles.primaryButtonText}>
            {isAuthenticating ? "Signing Up..." : "Sign Up"}
          </Text>
        </TouchableOpacity>

        <View style={styles.inlineRow}>
          <Text style={styles.inlineText}>Prefer the secure link? </Text>
          <Pressable onPress={() => router.push({ pathname: "/(auth)/magic-link", params: { mode: "signup" } })}>
            <Text style={styles.inlineLink}>Send email link</Text>
          </Pressable>
        </View>

        {isAuthenticating && <ActivityIndicator style={{ marginTop: 8 }} />}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
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
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  brandWrap: {
    alignItems: "center",
    marginBottom: 10,
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
  title: {
    fontFamily: "Archivo_700Bold",
    fontSize: 28,
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Manrope_400Regular",
    fontSize: 15,
    color: "#64748B",
    marginBottom: 24,
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
    marginBottom: 16,
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
  errorText: {
    color: "#ef4444",
    marginBottom: 8,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
  },
  successText: {
    color: "#10b981",
    marginBottom: 8,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
  },
  primaryButton: {
    backgroundColor: "#0FBAB5",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  primaryButtonText: {
    color: "#fff",
    fontFamily: "Archivo_700Bold",
    fontSize: 18,
    letterSpacing: 1,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  inlineRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  inlineText: {
    color: "#64748B",
    fontFamily: "Manrope_400Regular",
    fontSize: 15,
  },
  inlineLink: {
    color: "#0FBAB5",
    fontFamily: "Manrope_500Medium",
    fontSize: 15,
  },
});
