import { useAppFonts } from "@/constants/fonts";
import { AuthProvider } from "@/lib/auth-context";
import * as Linking from "expo-linking";
import { Slot } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function RootLayout() {
  const fontsLoaded = useAppFonts();

  useEffect(() => {
    // Configure Linking for deep links
    const prefix = Linking.createURL('/');
    console.log('App URL prefix:', prefix);

    // Handle initial URL when app is opened from a link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL received:', url);
        // Check if it's an auth callback URL
        if (url.includes('auth/callback') || url.includes('#access_token')) {
          console.log('Auth callback detected in initial URL');
        }
      }
    });

    // Handle URLs when app is already running
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      console.log('Deep link received while app running:', url);
      // Check if it's an auth callback URL
      if (url.includes('auth/callback') || url.includes('#access_token')) {
        console.log('Auth callback detected in running app');
        // Store the URL so the callback page can access it
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem('last_deep_link_url', url);
          console.log('Stored deep link URL for callback processing');
        } catch (error) {
          console.log('Failed to store deep link URL:', error);
        }
      }
    });

    return () => subscription?.remove();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}