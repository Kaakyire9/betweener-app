import { useAppFonts } from "@/constants/fonts";
import { supabase } from "@/lib/supabase";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function RootLayout() {
  const fontsLoaded = useAppFonts();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // If not authenticated and not already on an auth route, redirect to welcome
      if (!data.session && !segments[0]?.startsWith("(auth)")) {
        router.replace("/(auth)/welcome");
      }
    });
  }, [segments, router]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot />;
}