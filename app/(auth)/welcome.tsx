// Example: Animated Get Started Button
// filepath: c:\Users\HP\OneDrive\Documents\Projects\betweener-app\app\(auth)\welcome.tsx
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";

export default function WelcomeScreen() {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#FF6B6B",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: 40,
          fontFamily: "Archivo_700Bold",
          marginBottom: 8,
        }}
      >
        Betweener
      </Text>
      <Text
        style={{
          color: "#fff",
          fontSize: 28,
          fontFamily: "Archivo_700Bold",
          marginBottom: 16,
        }}
      >
        Welcome
      </Text>
      <Text
        style={{
          color: "#fff",
          fontSize: 18,
          fontFamily: "Manrope_400Regular",
          opacity: 0.9,
          marginBottom: 40,
          textAlign: "center",
        }}
      >
        Find your perfect match today.
      </Text>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onPress={() => router.replace("/(auth)/login")}
          android_ripple={{ color: "#0FBAB5", borderless: false }}
          style={{
            backgroundColor: "#0FBAB5",
            paddingVertical: 16,
            paddingHorizontal: 48,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            elevation: 2,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 18,
              fontFamily: "Archivo_700Bold",
              letterSpacing: 1,
            }}
          >
            Get Started
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}