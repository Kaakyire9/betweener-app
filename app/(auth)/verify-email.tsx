import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View } from "react-native";

export default function VerifyEmailScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isVerified, setIsVerified] = useState(false);

  const router = useRouter();
  const { verified } = useLocalSearchParams();

  useEffect(() => {
    AsyncStorage.getItem("pending_verification_email").then(email => {
      if (email) setUserEmail(email);
    });
  }, []);

  useEffect(() => {
    if (verified === "true") {
      setVerifiedAndRedirect();
    }
  }, [verified]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setVerifiedAndRedirect();
    };
    checkSession();
  }, []);

  const setVerifiedAndRedirect = async () => {
    setIsVerified(true);
    setMessage("✅ Email verified! Redirecting to onboarding...");
    await AsyncStorage.removeItem("pending_verification_email");
    setTimeout(() => {
      router.replace("/(auth)/onboarding");
    }, 2000);
  };

  const handleResend = async () => {
    setLoading(true);
    setError("");
    try {
      if (!userEmail) {
        setError("No email found for verification");
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: userEmail,
      });
      if (error) {
        setError("Failed to resend: " + error.message);
      } else {
        setMessage("Verification email sent! Please check your inbox.");
      }
    } catch (err) {
      setError("Failed to resend email");
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setError("Failed to check verification: " + error.message);
      } else if (data?.user?.email_confirmed_at) {
        setVerifiedAndRedirect();
      } else {
        setMessage("Still waiting for verification. Please check your email.");
      }
    } catch (err) {
      setError("Failed to check verification");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    await AsyncStorage.removeItem("pending_verification_email");
    router.push("/(auth)/login");
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
        Verify Your Email
      </Text>
      <Text style={{
        color: "#64748B",
        fontFamily: "Manrope_400Regular",
        fontSize: 16,
        marginBottom: 24,
        textAlign: "center",
      }}>
        We’ve sent a verification link to {userEmail || "your email"}. Please check your inbox and follow the instructions.
      </Text>
      {error ? (
        <Text style={{ color: "red", marginBottom: 16, textAlign: "center" }}>{error}</Text>
      ) : null}
      {message ? (
        <View style={{
          backgroundColor: isVerified ? "#DCFCE7" : "#E0F2FE",
          padding: 16,
          borderRadius: 12,
          marginBottom: 16,
        }}>
          <Text style={{
            color: isVerified ? "#166534" : "#1E40AF",
            textAlign: "center",
            fontFamily: "Manrope_600SemiBold",
          }}>
            {message}
          </Text>
        </View>
      ) : null}
      {!isVerified && (
        <>
          <TouchableOpacity
            style={{
              backgroundColor: "#0FBAB5",
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              marginBottom: 16,
              opacity: loading ? 0.7 : 1,
            }}
            onPress={handleResend}
            disabled={loading}
          >
            <Text style={{
              color: "#fff",
              fontFamily: "Archivo_700Bold",
              fontSize: 18,
            }}>
              {loading ? "Sending..." : "Resend Email"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              backgroundColor: "#3b82f6",
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              marginBottom: 16,
              opacity: loading ? 0.7 : 1,
            }}
            onPress={handleManualCheck}
            disabled={loading}
          >
            <Text style={{
              color: "#fff",
              fontFamily: "Archivo_700Bold",
              fontSize: 18,
            }}>
              {loading ? "Checking..." : "I've Verified My Email"}
            </Text>
          </TouchableOpacity>
          <Pressable onPress={handleBackToLogin} style={{ alignSelf: "center" }}>
            <Text style={{
              color: "#0FBAB5",
              fontFamily: "Manrope_400Regular",
              fontSize: 15,
            }}>
              Back to Login
            </Text>
          </Pressable>
        </>
      )}
      <ActivityIndicator style={{ marginTop: 20 }} />
      <Text style={{ color: "#64748B", textAlign: "center", marginTop: 8 }}>
        {isVerified
          ? "Redirecting to onboarding..."
          : "Waiting for email verification..."}
      </Text>
    </View>
  );
}