import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

export default function MagicLinkScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
          shouldCreateUser: false, // Only sign in existing users
        },
      });

      if (error) {
        if (error.message.includes("User not found")) {
          setError("No account found with this email. Please sign up first.");
        } else {
          setError(error.message);
        }
        return;
      }

      await AsyncStorage.setItem("pending_verification_email", email);
      setSuccess("Magic link sent! Check your email and tap the link to sign in.");
      
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
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        Quick Sign In
      </Text>
      
      <Text
        style={{
          fontFamily: "Manrope_400Regular",
          fontSize: 16,
          color: "#64748B",
          marginBottom: 32,
          textAlign: "center",
        }}
      >
        Enter your email to receive a magic link for instant sign-in
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
          backgroundColor: "#10b981",
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: "center",
          marginBottom: 24,
          opacity: loading ? 0.7 : 1,
        }}
        onPress={handleMagicLink}
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
          {loading ? "Sending..." : "Send Magic Link"}
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
          Need to create an account?{" "}
        </Text>
        <Pressable onPress={() => router.push("/(auth)/signup")}>
          <Text
            style={{
              color: "#0FBAB5",
              fontFamily: "Manrope_400Regular",
              fontSize: 15,
            }}
          >
            Sign Up
          </Text>
        </Pressable>
      </View>
      
      <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 16 }}>
        <Text
          style={{
            color: "#64748B",
            fontFamily: "Manrope_400Regular",
            fontSize: 15,
          }}
        >
          Prefer password login?{" "}
        </Text>
        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text
            style={{
              color: "#0FBAB5",
              fontFamily: "Manrope_400Regular",
              fontSize: 15,
            }}
          >
            Regular Login
          </Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
    </View>
  );
}