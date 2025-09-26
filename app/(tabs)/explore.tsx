import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export default function ExploreScreen() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 24 }}>
        Explore
      </Text>
      {/* Your explore content here */}

      <TouchableOpacity
        onPress={handleSignOut}
        style={{
          marginTop: 32,
          backgroundColor: "#FF6B6B",
          paddingVertical: 12,
          paddingHorizontal: 32,
          borderRadius: 16,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
          Sign Out
        </Text>
      </TouchableOpacity>
    </View>
  );
}