import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

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
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await AsyncStorage.removeItem("supabase.auth.token");

      const redirectTo = makeRedirectUri({
        scheme: "betweenerapp",
        path: "callback",
      });

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      await AsyncStorage.setItem("pending_verification_email", email);

      setSuccess("Signup successful! Please check your email to verify your account.");
      setTimeout(() => {
        router.replace("/(auth)/verify-email");
      }, 1500);
    } catch (err: any) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#F8FAFC",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Logo at the top */}
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <Image
          source={require("../../assets/images/circle-logo.png")}
          style={{ width: 100, height: 100, borderRadius: 50 }}
          resizeMode="contain"
        />
      </View>

      <Text
        style={{
          fontFamily: "Archivo_700Bold",
          fontSize: 28,
          color: "#0F172A",
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        Create Account
      </Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor="#94A3B8"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 16,
          fontSize: 16,
          marginBottom: 16,
          fontFamily: "Manrope_400Regular",
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
      />

      <TextInput
        placeholder="Password"
        placeholderTextColor="#94A3B8"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 16,
          fontSize: 16,
          marginBottom: 16,
          fontFamily: "Manrope_400Regular",
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
      />

      <TextInput
        placeholder="Confirm Password"
        placeholderTextColor="#94A3B8"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 16,
          fontSize: 16,
          marginBottom: 16,
          fontFamily: "Manrope_400Regular",
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
      />

      {error ? (
        <Text style={{ color: "red", marginBottom: 8, textAlign: "center" }}>
          {error}
        </Text>
      ) : null}

      {success ? (
        <Text style={{ color: "green", marginBottom: 8, textAlign: "center" }}>
          {success}
        </Text>
      ) : null}

      <TouchableOpacity
        style={{
          backgroundColor: "#FF6B6B",
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: "center",
          marginBottom: 24,
          opacity: loading ? 0.7 : 1,
        }}
        onPress={handleSignup}
        disabled={loading}
      >
        <Text
          style={{
            color: "#fff",
            fontFamily: "Archivo_700Bold",
            fontSize: 18,
            letterSpacing: 1,
          }}
        >
          {loading ? "Signing Up..." : "Sign Up"}
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: "row", justifyContent: "center" }}>
        <Text
          style={{
            color: "#64748B",
            fontFamily: "Manrope_400Regular",
            fontSize: 15,
          }}
        >
          Already have an account?{" "}
        </Text>
        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text
            style={{
              color: "#0FBAB5",
              fontFamily: "Manrope_400Regular",
              fontSize: 15,
            }}
          >
            Log In
          </Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
    </View>
  );
}
