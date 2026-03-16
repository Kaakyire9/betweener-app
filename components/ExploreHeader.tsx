// components/ExploreHeader.tsx
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Tab = { id: string; label: string; icon: string };

export default function ExploreHeader({
  title = 'Vibes',
  subtitle = 'Ghana Diaspora Connections',
  tabs,
  activeTab,
  setActiveTab,
  currentIndex: _currentIndex,
  total: _total,
  smartCount: _smartCount,
  onPressFilter,
  filterCount,
  rightAccessory,
}: {
  title?: string;
  subtitle?: string;
  tabs: Tab[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  currentIndex: number;
  total: number;
  smartCount?: number;
  onPressFilter?: () => void;
  filterCount?: number;
  rightAccessory?: ReactNode;
}) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <View style={styles.titleCluster}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.subtitleRow}>
            <View style={styles.subtitleDot} />
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={styles.rightRail}>
          <View style={styles.rightRow}>
          {rightAccessory}
          {onPressFilter ? (
            <TouchableOpacity style={styles.filterButton} onPress={onPressFilter} activeOpacity={0.85}>
              <MaterialCommunityIcons name="filter-variant" size={20} color={theme.tint} />
              {filterCount && filterCount > 0 ? (
                <View style={styles.filterBadge} pointerEvents="none">
                  <Text style={styles.filterBadgeText}>{filterCount > 9 ? "9+" : String(filterCount)}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}
          </View>
        </View>
      </View>

      <View style={styles.tabContainer}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, activeTab === t.id && styles.activeTab]}
            onPress={() => setActiveTab(t.id)}
            activeOpacity={0.85}
          >
            {activeTab === t.id ? (
              <LinearGradientSafe
                colors={[theme.tint, theme.accent]}
                start={[0, 0]}
                end={[1, 1]}
                style={styles.activeTabSurface}
              >
                <MaterialCommunityIcons
                  name={t.icon as any}
                  size={14}
                  color="#fff"
                  style={styles.tabIcon}
                />
                <Text style={[styles.tabText, styles.activeTabText]}>{t.label}</Text>
              </LinearGradientSafe>
            ) : (
              <View style={styles.tabSurface}>
                <MaterialCommunityIcons
                  name={t.icon as any}
                  size={14}
                  color={theme.textMuted}
                  style={styles.tabIcon}
                />
                <Text style={styles.tabText}>{t.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => {
  const surface = theme.background;
  const outline = theme.outline;
  const subtle = theme.backgroundSubtle;
  const shadowColor = isDark ? "#000" : "#0f172a";
  const filterBg = isDark ? "rgba(255,255,255,0.06)" : "#f8fafc";
  const filterBorder = outline;
  const railBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.82)";
  const tabBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.72)";
  return StyleSheet.create({
    header: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
      backgroundColor: surface,
      borderBottomColor: outline,
      borderBottomWidth: 1,
    },
    topRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start' },
    titleCluster: { flex: 1, paddingRight: 14 },
    rightRail: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: outline,
      backgroundColor: railBg,
      paddingHorizontal: 8,
      paddingVertical: 8,
      shadowColor,
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    rightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 28, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: 0.2 },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
    },
    subtitleDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
      backgroundColor: theme.secondary,
      shadowColor: theme.secondary,
      shadowOpacity: isDark ? 0.45 : 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
    },
    subtitle: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', flexShrink: 1 },
    filterButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: filterBorder,
      backgroundColor: filterBg,
      shadowColor,
      shadowOpacity: isDark ? 0.12 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    filterBadge: {
      position: "absolute",
      top: -6,
      right: -6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: theme.accent,
      borderWidth: 2,
      borderColor: surface,
      alignItems: "center",
      justifyContent: "center",
    },
    filterBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      color: "#fff",
      lineHeight: 12,
    },
    tabContainer: {
      flexDirection: "row",
      backgroundColor: subtle,
      borderRadius: 18,
      padding: 6,
      marginTop: 2,
      borderWidth: 1,
      borderColor: outline,
      shadowColor,
      shadowOpacity: isDark ? 0.12 : 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    tab: { flex: 1, borderRadius: 14 },
    activeTab: {},
    activeTabSurface: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 11,
      paddingHorizontal: 8,
      borderRadius: 14,
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.22 : 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    tabSurface: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 11,
      paddingHorizontal: 8,
      borderRadius: 14,
      backgroundColor: tabBg,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
    },
    tabIcon: { marginRight: 6 },
    tabText: { fontSize: 13, color: theme.text, fontFamily: 'Manrope_700Bold' },
    activeTabText: { color: "#fff" },
    counterRow: { alignItems: "center", marginTop: 12 },
    counter: { fontSize: 16, fontWeight: "800", color: theme.text },
    counterSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  });
};
