import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleReset = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage("If an account exists, we’ll email a secure reset link shortly.");
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

        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>
          Enter the email on your account and we’ll send a private reset link.
        </Text>

        <View style={[styles.inputShell, focused && styles.inputShellActive]}>
          <MaterialCommunityIcons
            name="email-outline"
            size={18}
            color={focused ? "#7C5FE6" : "#94A3B8"}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={styles.input}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Sending..." : "Send Reset Link"}
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
        </TouchableOpacity>

        <Pressable onPress={() => router.push("/(auth)/login")} style={styles.inlineRow}>
          <Text style={styles.inlineLink}>Back to Login</Text>
        </Pressable>

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
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
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
  inlineLink: {
    color: "#0FBAB5",
    fontFamily: "Manrope_500Medium",
    fontSize: 15,
  },
});
