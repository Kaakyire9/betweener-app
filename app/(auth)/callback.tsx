import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const exchange = async () => {
      const code = params.code as string | undefined;
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace("/(auth)/verify-email?verified=true");
        } else {
          Alert.alert("Verification Error", error.message);
          router.replace(("/(auth)/verify-email?error=" + encodeURIComponent(error.message)) as any);
        }
      } else {
        Alert.alert("No Code", "No verification code found in the URL.");
        router.replace("/(auth)/verify-email?error=No code found");
      }
    };
    exchange();
  }, [params, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 16, color: "#64748B" }}>Verifying your email...</Text>
    </View>
  );
}