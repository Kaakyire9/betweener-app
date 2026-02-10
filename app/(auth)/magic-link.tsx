import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function MagicLinkScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();
  const params = useLocalSearchParams();
  const mode = params.mode === "signup" ? "signup" : "signin";
  const isSignup = mode === "signup";

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleMagicLink = async () => {
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: isSignup,
          emailRedirectTo: "https://getbetweener.com/auth/callback",
        },
      });

      if (error) {
        const raw = (error.message || "").toLowerCase();
        const isMissingAccount =
          raw.includes("user not found") ||
          raw.includes("invalid login") ||
          raw.includes("otp") ||
          raw.includes("email not confirmed");

        if (!isSignup && isMissingAccount) {
          setError("No account found with this email. Tap Create account to get started.");
        } else {
          setError(error.message);
        }
        return;
      }

      await AsyncStorage.setItem("pending_verification_email", email);
      setCooldown(90);
      setSuccess(
        isSignup
          ? "Magic link sent! Check your email to finish creating your account."
          : "Magic link sent! Check your email and tap the link to sign in."
      );
      
      setTimeout(() => {
        router.replace("/(auth)/verify-email");
      }, 2000);
    } catch (err: any) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
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

        <Text style={styles.title}>
          {isSignup ? "Create your account" : "Quick Sign In"}
        </Text>
        <Text style={styles.subtitle}>
          {isSignup
            ? "Enter your email to receive a secure link to create your account"
            : "Enter your email to receive a magic link for instant sign-in"}
        </Text>

        <View style={styles.inputShell}>
          <MaterialCommunityIcons name="email-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Email"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, (loading || cooldown > 0) && styles.buttonDisabled]}
          onPress={handleMagicLink}
          disabled={loading || cooldown > 0}
        >
          <Text style={styles.primaryButtonText}>
            {loading
              ? "Sending..."
              : cooldown > 0
                ? `Try again in ${cooldown}s`
                : isSignup
                  ? "Send secure link"
                  : "Send magic link"}
          </Text>
        </TouchableOpacity>

        {!isSignup ? (
          <View style={styles.inlineRow}>
            <Text style={styles.inlineText}>New here? </Text>
            <Pressable onPress={() => router.push("/(auth)/signup-options")}>
              <Text style={styles.inlineLink}>Create an account</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.inlineRow}>
            <Text style={styles.inlineText}>Already have an account? </Text>
            <Pressable onPress={() => router.push("/(auth)/login")}>
              <Text style={styles.inlineLink}>Sign in</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.inlineRow, { marginTop: 16 }]}>
          <Text style={styles.inlineText}>Prefer password? </Text>
          <Pressable
            onPress={() =>
              isSignup
                ? router.push("/(auth)/signup")
                : router.push("/(auth)/password-login")
            }
          >
            <Text style={styles.inlineLink}>
              {isSignup ? "Use email and password" : "Use password login"}
            </Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
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
    fontSize: 16,
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
    opacity: 0.6,
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
