// components/ExploreHeader.tsx
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Tab = { id: string; label: string; icon: string };

export default function ExploreHeader({
  tabs,
  activeTab,
  setActiveTab,
  currentIndex,
  total,
  smartCount,
}: {
  tabs: Tab[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  currentIndex: number;
  total: number;
  smartCount?: number;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Ghana Diaspora Connections</Text>
      </View>

      <View style={styles.tabContainer}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, activeTab === t.id && styles.activeTab]}
            onPress={() => setActiveTab(t.id)}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name={t.icon as any} size={14} color={activeTab === t.id ? "#fff" : Colors.light.tint} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, activeTab === t.id && styles.activeTabText]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.counterRow}>
        <Text style={styles.counter}>{currentIndex + 1} / {total}</Text>
        <Text style={styles.counterSubtitle}>Daily Curated{smartCount ? ` • ${smartCount} AI` : ""}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomColor: "#f3f4f6", borderBottomWidth: 1 },
  topRow: { marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "800", color: "#0f172a" },
  subtitle: { color: Colors.light.tint, marginTop: 4 },
  tabContainer: { flexDirection: "row", backgroundColor: "#f8fafc", borderRadius: 12, padding: 6, marginTop: 8 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  activeTab: { backgroundColor: Colors.light.tint },
  tabText: { fontSize: 13, color: Colors.light.tint },
  activeTabText: { color: "#fff", fontWeight: "700" },
  counterRow: { alignItems: "center", marginTop: 12 },
  counter: { fontSize: 16, fontWeight: "800", color: "#111827" },
  counterSubtitle: { fontSize: 12, color: "#6b7280", marginTop: 2 },
});
