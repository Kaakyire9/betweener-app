import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={require("@/assets/images/circle-logo.png")}
            style={styles.logo}
          />
        </View>
        
        <Text style={styles.title}>Welcome to Betweener!</Text>
        <Text style={styles.subtitle}>Ready to find your perfect match?</Text>
        
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: "#ff6b6b" }]}
            onPress={() => router.push("/(tabs)/explore")}
          >
            <MaterialCommunityIcons name="cards-heart" size={32} color="#fff" />
            <Text style={styles.actionText}>Start Matching</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: "#4ecdc4" }]}
            onPress={() => router.push("/(tabs)/chat")}
          >
            <MaterialCommunityIcons name="message-text" size={32} color="#fff" />
            <Text style={styles.actionText}>Messages</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: "#45b7d1" }]}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <MaterialCommunityIcons name="account-circle" size={32} color="#fff" />
            <Text style={styles.actionText}>Profile</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: "#f39c12" }]}
            onPress={() => router.push("/(tabs)/explore")}
          >
            <MaterialCommunityIcons name="fire" size={32} color="#fff" />
            <Text style={styles.actionText}>Hot Matches</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#667eea",
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    marginBottom: 30,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 40,
    textAlign: "center",
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    gap: 16,
  },
  actionCard: {
    width: "47%",
    padding: 20,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  actionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginTop: 8,
    textAlign: "center",
  },
});
