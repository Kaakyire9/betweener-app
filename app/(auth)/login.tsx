import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { signIn, isAuthenticating } = useAuth();

  const handleLogin = async () => {
    setError("");
    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message);
    }
    // No need to manually navigate - AuthGuard will handle routing
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
          fontSize: 32,
          color: "#0F172A",
          marginBottom: 32,
          textAlign: "center",
        }}
      >
        Login
      </Text>

      {error ? (
        <Text
          style={{ color: "#FF6B6B", marginBottom: 12, textAlign: "center" }}
        >
          {error}
        </Text>
      ) : null}

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
          marginBottom: 8,
          fontFamily: "Manrope_400Regular",
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
      />

      <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
        <Text
          style={{
            color: "#0FBAB5",
            fontSize: 14,
            textAlign: "right",
            marginBottom: 24,
          }}
        >
          Forgot password?
        </Text>
      </Pressable>

      <TouchableOpacity
        style={{
          backgroundColor: "#FF6B6B",
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: "center",
          marginBottom: 32,
          opacity: isAuthenticating ? 0.7 : 1,
        }}
        onPress={handleLogin}
        disabled={isAuthenticating}
      >
        <Text
          style={{
            color: "#fff",
            fontFamily: "Archivo_700Bold",
            fontSize: 18,
            letterSpacing: 1,
          }}
        >
          {isAuthenticating ? "Logging In..." : "Log In"}
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
          Don’t have an account?{" "}
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
    </View>
  );
}
