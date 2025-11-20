// components/ExploreCard.tsx
import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import type { Match } from "@/types/match";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ExploreCard({ match, onPress }: { match: Match; onPress?: (id: string) => void; }) {
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardContent} activeOpacity={0.95} onPress={() => onPress?.(match.id)}>
        <Image source={{ uri: match.avatar_url || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face" }} style={styles.image} />

        <LinearGradientSafe colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={styles.gradient} />

        <BlurViewSafe intensity={60} tint="dark" style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{match.name}, {match.age}</Text>
            {match.isActiveNow && (
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            )}
          </View>

          <Text style={styles.tagline}>{match.tagline}</Text>

          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={14} color="#fff" />
            <Text style={styles.location}>{match.distance}</Text>
          </View>

          <View style={styles.tags}>
            {(match.interests || []).slice(0, 3).map((t, i) => (
              <View key={i} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
            ))}
            {(match.interests || []).length > 3 && <View style={styles.tag}><Text style={styles.tagText}>+{(match.interests || []).length - 3}</Text></View>}
          </View>
        </BlurViewSafe>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", width: "100%", height: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: "#fff" },
  cardContent: { flex: 1 },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "50%" },
  info: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  name: { color: "#fff", fontSize: 28, fontWeight: "800", flex: 1 },
  activeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(16,185,129,0.95)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", marginRight: 6 },
  activeText: { color: "#fff", fontSize: 11 },
  tagline: { color: "#fff", marginBottom: 12, fontSize: 15 },
  locationRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  location: { color: "#fff", marginLeft: 6 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 6 },
  tagText: { color: "#fff", fontSize: 12 },
});
