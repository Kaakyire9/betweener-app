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
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";

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
      await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch (error) {
      console.log("[auth] google sign-in error", error);
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
    } catch (error) {
      console.log("[auth] apple sign-in error", error);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmail = async () => {
    await setPendingAuthMethod("password");
    await logSignupEvent({ auth_method: "password" });
    router.push("/(auth)/signup");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC", padding: 24 }}>
      <Text
        style={{
          fontFamily: "Archivo_700Bold",
          fontSize: 28,
          color: "#0F172A",
          marginTop: 40,
          marginBottom: 12,
        }}
      >
        Create your account
      </Text>
      <Text
        style={{
          fontFamily: "Manrope_400Regular",
          fontSize: 16,
          color: "#64748B",
          lineHeight: 22,
          marginBottom: 32,
        }}
      >
        Continue with Google or Apple for the fastest setup, or use email and password.
      </Text>

      <Pressable
        onPress={handleGoogle}
        disabled={loadingProvider !== null}
        style={{
          backgroundColor: "#111827",
          paddingVertical: 16,
          borderRadius: 16,
          alignItems: "center",
          marginBottom: 12,
          opacity: loadingProvider && loadingProvider !== "google" ? 0.6 : 1,
        }}
      >
        {loadingProvider === "google" ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text
            style={{
              color: "#fff",
              fontFamily: "Archivo_700Bold",
              fontSize: 16,
              letterSpacing: 0.6,
            }}
          >
            Continue with Google
          </Text>
        )}
      </Pressable>

      {Platform.OS === "ios" && (
        <Pressable
          onPress={handleApple}
          disabled={loadingProvider !== null}
          style={{
            backgroundColor: "#000",
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: "center",
            marginBottom: 12,
            opacity: loadingProvider && loadingProvider !== "apple" ? 0.6 : 1,
          }}
        >
          {loadingProvider === "apple" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={{
                color: "#fff",
                fontFamily: "Archivo_700Bold",
                fontSize: 16,
                letterSpacing: 0.6,
              }}
            >
              Continue with Apple
            </Text>
          )}
        </Pressable>
      )}

      <Pressable
        onPress={handleEmail}
        disabled={loadingProvider !== null}
        style={{
          backgroundColor: "#0FBAB5",
          paddingVertical: 16,
          borderRadius: 16,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Text
          style={{
            color: "#fff",
            fontFamily: "Archivo_700Bold",
            fontSize: 16,
            letterSpacing: 0.6,
          }}
        >
          Use email and password
        </Text>
      </Pressable>

      <Pressable onPress={() => router.replace("/(auth)/login")} style={{ alignItems: "center" }}>
        <Text style={{ fontFamily: "Manrope_400Regular", color: "#0FBAB5" }}>
          Already have an account? Log in
        </Text>
      </Pressable>
    </View>
  );
}
