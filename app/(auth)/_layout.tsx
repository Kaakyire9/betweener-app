import { GuestGuard } from "@/components/auth-guard";
import { Stack } from "expo-router";
import { View } from "react-native";

export default function AuthLayout() {
  return (
    <GuestGuard>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="welcome" />
          <Stack.Screen name="verify-phone" />
          <Stack.Screen name="signup-options" />
          <Stack.Screen name="login" />
          <Stack.Screen name="password-login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="verify-email" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="onboarding-ghana" />
          <Stack.Screen name="onboarding-global" />
          <Stack.Screen name="callback" />
          <Stack.Screen name="gate" />
        </Stack>
      </View>
    </GuestGuard>
  );
}
