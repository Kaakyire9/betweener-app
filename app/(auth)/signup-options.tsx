import {
  getSignupPhoneState,
  logSignupEvent,
  setPendingAuthMethod,
} from "@/lib/signup-tracking";
import { supabase } from "@/lib/supabase";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isAppleAuthCancelled = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("canceled") || message.includes("cancelled");
};

export default function SignupOptionsScreen() {
  WebBrowser.maybeCompleteAuthSession();
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

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

  const getRedirectUrl = () =>
    makeRedirectUri({
      scheme: "betweenerapp",
      path: "auth/callback",
    });

  const handleGoogle = async () => {
    setLoadingProvider("google");
    try {
      await setPendingAuthMethod("oauth", "google");
      await logSignupEvent({ auth_method: "oauth", oauth_provider: "google" });
      const redirectTo = getRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error || !data?.url) {
        throw error ?? new Error("Unable to start Google sign-in.");
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success" && result.url) {
        await AsyncStorage.setItem("last_deep_link_url", result.url);
        router.replace("/(auth)/callback");
      }
    } catch (error) {
      console.error("[auth] google sign-in error", error);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleApple = async () => {
    if (Platform.OS !== "ios") return;
    setLoadingProvider("apple");
    try {
      await setPendingAuthMethod("oauth", "apple");
      await logSignupEvent({ auth_method: "oauth", oauth_provider: "apple" });
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("Apple sign-in failed to return a token.");
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) {
        throw error;
      }
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        throw new Error("Apple sign-in completed without a user.");
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError && profileError.code !== "PGRST116") {
        throw profileError;
      }
      router.replace(profile ? "/(tabs)/vibes" : "/(auth)/onboarding");
    } catch (error) {
      if (!isAppleAuthCancelled(error)) {
        console.error("[auth] apple sign-in error", error);
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmailLink = async () => {
    await setPendingAuthMethod("otp");
    await logSignupEvent({ auth_method: "otp" });
    router.push({ pathname: "/(auth)/magic-link", params: { mode: "signup" } });
  };

  const theme = Colors.light;

  return (
    <LinearGradient
      colors={[theme.tint, theme.accent, theme.background]}
      start={{ x: 0.1, y: 0.05 }}
      end={{ x: 0.9, y: 0.95 }}
      style={styles.gradient}
    >
      <View style={styles.panel}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          Continue with Google or Apple for the fastest setup, or use a secure email link.
        </Text>

      <Pressable
        onPress={handleGoogle}
        disabled={loadingProvider !== null}
        style={[
          styles.providerButton,
          styles.googleButton,
          loadingProvider && loadingProvider !== "google" && styles.buttonDisabled,
        ]}
      >
        {loadingProvider === "google" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialCommunityIcons name="google" size={20} color="#fff" />
            <Text style={styles.providerText}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      {Platform.OS === "ios" && (
        <Pressable
          onPress={handleApple}
          disabled={loadingProvider !== null}
          style={[
            styles.providerButton,
            styles.appleButton,
            loadingProvider && loadingProvider !== "apple" && styles.buttonDisabled,
          ]}
        >
          {loadingProvider === "apple" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="apple" size={20} color="#fff" />
              <Text style={styles.providerText}>Continue with Apple</Text>
            </>
          )}
        </Pressable>
      )}

      <Pressable
        onPress={handleEmailLink}
        disabled={loadingProvider !== null}
        style={[styles.providerButton, styles.emailButton]}
      >
        <MaterialCommunityIcons name="email-outline" size={20} color="#fff" />
        <Text style={styles.providerText}>Continue with email link</Text>
      </Pressable>

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(auth)/verify-phone",
            params: { next: encodeURIComponent("/(auth)/signup") },
          })
        }
        style={styles.secondaryLink}
      >
        <Text style={styles.secondaryText}>Prefer password? Use email and password</Text>
      </Pressable>

        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.loginLink}>
          <Text style={styles.loginText}>Already have an account? Log in</Text>
        </Pressable>

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
  panel: {
    backgroundColor: "rgba(247, 236, 226, 0.9)",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  title: {
    fontFamily: "Archivo_700Bold",
    fontSize: 28,
    color: "#0F172A",
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: "Manrope_400Regular",
    fontSize: 15.5,
    color: "#5B6B6B",
    lineHeight: 22,
    marginBottom: 28,
  },
  providerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 16,
    marginBottom: 12,
  },
  googleButton: {
    backgroundColor: "#111827",
  },
  appleButton: {
    backgroundColor: "#000",
  },
  emailButton: {
    backgroundColor: "#0FBAB5",
    marginBottom: 22,
  },
  providerText: {
    color: "#fff",
    fontFamily: "Archivo_700Bold",
    fontSize: 15.5,
    letterSpacing: 0.4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginLink: {
    alignItems: "center",
  },
  secondaryLink: {
    alignItems: "center",
    marginBottom: 18,
  },
  secondaryText: {
    fontFamily: "Manrope_500Medium",
    color: "#64748B",
    fontSize: 14,
  },
  loginText: {
    fontFamily: "Manrope_500Medium",
    color: "#0FBAB5",
  },
});
