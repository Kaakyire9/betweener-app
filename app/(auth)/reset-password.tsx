import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleReset = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    // TODO: Implement Supabase password update logic here
    setTimeout(() => {
      setLoading(false);
      setMessage("Password reset successful! You can now log in.");
      setTimeout(() => router.replace("/(auth)/login"), 1500);
    }, 1000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC", justifyContent: "center", padding: 24 }}>
      <Text style={{
        fontFamily: "Archivo_700Bold",
        fontSize: 28,
        color: "#0F172A",
        marginBottom: 24,
        textAlign: "center",
      }}>
        Reset Password
      </Text>
      <TextInput
        placeholder="New Password"
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
      {error ? <Text style={{ color: 'red', marginBottom: 8 }}>{error}</Text> : null}
      {message ? <Text style={{ color: 'green', marginBottom: 8 }}>{message}</Text> : null}
      <TouchableOpacity
        style={{
          backgroundColor: "#FF6B6B",
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: "center",
          marginBottom: 24,
          opacity: loading ? 0.7 : 1,
        }}
        onPress={handleReset}
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
          {loading ? "Resetting..." : "Reset Password"}
        </Text>
      </TouchableOpacity>
      <Pressable onPress={() => router.push("/(auth)/login")}>
        <Text style={{ color: "#0FBAB5", fontFamily: "Manrope_400Regular", fontSize: 15, textAlign: "center" }}>
          Back to Login
        </Text>
      </Pressable>
      {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
    </View>
  );
}