import { useEffect } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";

export default function TestDeepLink() {
  useEffect(() => {
    const handleUrl = (url: string) => {
      console.log("Deep link received:", url);
      Alert.alert("Deep Link", `Received URL: ${url}`);
    };

    // Handle initial URL (if app was closed)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl(url);
      }
    });

    // Handle URL when app is already running
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    return () => subscription?.remove();
  }, []);

  const testDeepLink = () => {
    const testUrl = "betweenerapp://auth/callback?code=test123";
    Linking.openURL(testUrl).catch(() => {
      Alert.alert("Error", "Could not open deep link");
    });
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ fontSize: 18, marginBottom: 24, textAlign: "center" }}>
        Deep Link Test Page
      </Text>
      
      <Pressable
        onPress={testDeepLink}
        style={{
          backgroundColor: "#0FBAB5",
          padding: 16,
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>
          Test Deep Link
        </Text>
      </Pressable>

      <Text style={{ color: "#64748B", textAlign: "center", fontSize: 14 }}>
        Check console logs and alerts for deep link events
      </Text>
    </View>
  );
}