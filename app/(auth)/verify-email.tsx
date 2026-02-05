import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, TouchableOpacity, View } from "react-native";

export default function VerifyEmailScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  
  // Animation values
  const checkmarkScale = new Animated.Value(0);
  const checkmarkRotation = new Animated.Value(0);
  const successContainerScale = new Animated.Value(0.8);
  const successOpacity = new Animated.Value(0);
  const confettiAnimations = Array.from({ length: 8 }, () => ({
    translateY: new Animated.Value(0),
    translateX: new Animated.Value(0),
    rotate: new Animated.Value(0),
    opacity: new Animated.Value(0),
  }));

  const router = useRouter();
  const { verified, error: urlError } = useLocalSearchParams();

  useEffect(() => {
    AsyncStorage.getItem("pending_verification_email").then(email => {
      if (email) setUserEmail(email);
    });
  }, []);

  useEffect(() => {
    if (verified === "true") {
      setVerifiedAndRedirect();
    } else if (urlError) {
      setError(decodeURIComponent(urlError as string));
    }
  }, [verified, urlError]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setVerifiedAndRedirect();
        return;
      }
      
      // Also check if user exists and is verified (for cases where deep link failed)
      if (userEmail) {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user && user.email_confirmed_at) {
          setVerifiedAndRedirect();
        }
      }
    };
    checkSession();
  }, [userEmail]);

  const setVerifiedAndRedirect = async () => {
    setIsVerified(true);
    setMessage("Email verified! Redirecting to onboarding...");
    await AsyncStorage.removeItem("pending_verification_email");
    
    // Start success animation sequence
    startSuccessAnimation();
    
    setTimeout(async () => {
      // Let auth gate decide the correct next step (phone, onboarding, or app).
      router.replace("/(auth)/gate");
    }, 3500); // Extended to show full animation
  };
  
  const startSuccessAnimation = () => {
    // Animate success container appearance
    Animated.parallel([
      Animated.spring(successContainerScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Animate checkmark with bounce effect
    setTimeout(() => {
      Animated.sequence([
        Animated.spring(checkmarkScale, {
          toValue: 1.2,
          tension: 100,
          friction: 3,
          useNativeDriver: true,
        }),
        Animated.spring(checkmarkScale, {
          toValue: 1,
          tension: 100,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Checkmark rotation
      Animated.timing(checkmarkRotation, {
        toValue: 360,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, 200);
    
    // Confetti-like animations
    setTimeout(() => {
      confettiAnimations.forEach((confetti, index) => {
        const angle = (index * 45) * (Math.PI / 180);
        const distance = 60 + Math.random() * 40;
        
        Animated.parallel([
          Animated.timing(confetti.opacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(confetti.translateX, {
            toValue: Math.cos(angle) * distance,
            duration: 1000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(confetti.translateY, {
            toValue: Math.sin(angle) * distance,
            duration: 1000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(confetti.rotate, {
            toValue: 360 + Math.random() * 360,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Fade out confetti
        setTimeout(() => {
          Animated.timing(confetti.opacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start();
        }, 800);
      });
    }, 600);
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
        <Animated.View style={{
          backgroundColor: isVerified ? "#DCFCE7" : "#E0F2FE",
          padding: 20,
          borderRadius: 20,
          marginBottom: 32,
          alignItems: "center",
          transform: [{ scale: successContainerScale }],
          opacity: successOpacity,
          position: "relative",
        }}>
          {/* Confetti Elements */}
          {isVerified && confettiAnimations.map((confetti, index) => (
            <Animated.View
              key={index}
              style={{
                position: "absolute",
                width: 8,
                height: 8,
                backgroundColor: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"][index],
                borderRadius: 4,
                transform: [
                  { translateX: confetti.translateX },
                  { translateY: confetti.translateY },
                  { rotate: confetti.rotate.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }) },
                ],
                opacity: confetti.opacity,
              }}
            />
          ))}
          
          {/* Success Checkmark */}
          {isVerified && (
            <Animated.View style={{
              marginBottom: 12,
              transform: [
                { scale: checkmarkScale },
                { rotate: checkmarkRotation.interpolate({
                  inputRange: [0, 360],
                  outputRange: ['0deg', '360deg'],
                }) },
              ],
            }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "#10B981",
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#10B981",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}>
                <Text style={{
                  fontSize: 30,
                  color: "white",
                  fontWeight: "bold",
                }}>✓</Text>
              </View>
            </Animated.View>
          )}
          
          <Text style={{
            color: isVerified ? "#166534" : "#1E40AF",
            textAlign: "center",
            fontFamily: "Manrope_600SemiBold",
            fontSize: 18,
          }}>
            {message}
          </Text>
          
          {isVerified && (
            <Text style={{
              color: "#059669",
              textAlign: "center",
              fontFamily: "Manrope_400Regular",
              fontSize: 14,
              marginTop: 8,
              fontStyle: "italic",
            }}>
              🎉 Welcome to Betweener!
            </Text>
          )}
        </Animated.View>
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
      {!isVerified && (
        <>
          <ActivityIndicator style={{ marginTop: 20 }} />
          <Text style={{ color: "#64748B", textAlign: "center", marginTop: 8 }}>
            Waiting for email verification...
          </Text>
        </>
      )}
      
      {isVerified && (
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <Text style={{ 
            color: "#059669", 
            textAlign: "center", 
            fontFamily: "Manrope_400Regular",
            fontSize: 16,
            fontStyle: "italic"
          }}>
            Get ready for your journey! ✨
          </Text>
        </View>
      )}
    </View>
  );
}
