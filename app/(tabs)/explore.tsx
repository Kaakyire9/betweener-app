import { useAuth } from "@/lib/auth-context";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export default function ExploreScreen() {
  const { signOut, user, profile } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    // No need to manually navigate - AuthGuard will handle routing
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 24 }}>
        Welcome to Betweener! 🇬🇭
      </Text>
      
      {profile && (
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", marginBottom: 8 }}>
            Hi, {profile.full_name}!
          </Text>
          <Text style={{ fontSize: 16, color: "#666", marginBottom: 4 }}>
            {profile.age} years old • {profile.gender}
          </Text>
          <Text style={{ fontSize: 16, color: "#666", marginBottom: 4 }}>
            {profile.region} • {profile.tribe}
          </Text>
          <Text style={{ fontSize: 14, color: "#888", textAlign: "center", marginTop: 8 }}>
            {profile.bio}
          </Text>
        </View>
      )}

      {user && (
        <Text style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
          Email: {user.email}
        </Text>
      )}

      <TouchableOpacity
        onPress={handleSignOut}
        style={{
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