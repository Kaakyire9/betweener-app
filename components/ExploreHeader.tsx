// components/ExploreHeader.tsx
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import GlassSurface from "@/components/vibes/depth/GlassSurface";
import GlowOrb from "@/components/vibes/depth/GlowOrb";
import RimLight from "@/components/vibes/depth/RimLight";
import { VIBES_DEPTH_COLORS } from "@/components/vibes/depth/platformGlass";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";

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
  const { width, height } = useWindowDimensions();
  const compact = width < 390 || height < 760;
  const styles = useMemo(() => createStyles(theme, isDark, compact), [theme, isDark, compact]);

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
        <GlassSurface
          radius={18}
          intensity={18}
          borderOpacity={0.12}
          fallbackColor={isDark ? "rgba(7,30,34,0.78)" : "rgba(255,250,244,0.70)"}
          style={styles.rightRail}
          contentStyle={styles.rightRailSurface}
        >
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
        </GlassSurface>
      </View>

      <GlassSurface
        radius={22}
        intensity={18}
        borderOpacity={0.11}
        fallbackColor={isDark ? "rgba(7,30,34,0.72)" : "rgba(255,250,244,0.66)"}
        style={styles.tabContainer}
        contentStyle={styles.tabContainerSurface}
      >
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, activeTab === t.id && styles.activeTab]}
            onPress={() => setActiveTab(t.id)}
            activeOpacity={0.85}
          >
            {activeTab === t.id ? (
              <LinearGradientSafe
                colors={isDark
                  ? ["rgba(19,168,168,0.20)", "rgba(19,168,168,0.08)", "rgba(244,232,208,0.05)"]
                  : ["rgba(19,168,168,0.18)", "rgba(255,255,255,0.42)", "rgba(244,232,208,0.22)"]}
                start={[0, 0]}
                end={[1, 1]}
                style={styles.activeTabSurface}
              >
                <GlowOrb color="rgba(19,168,168,0.20)" size={96} opacity={0.28} top={-42} left={-16} />
                <MaterialCommunityIcons
                  name={t.icon as any}
                  size={14}
                  color={isDark ? "#fff" : theme.tint}
                  style={styles.tabIcon}
                />
                <Text style={[styles.tabText, styles.activeTabText]}>{t.label}</Text>
                <RimLight position="top" color={VIBES_DEPTH_COLORS.teal} opacity={0.2} radius={15} thickness={1} />
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
      </GlassSurface>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean, compact: boolean) => {
  const surface = isDark ? VIBES_DEPTH_COLORS.background : theme.background;
  const shadowColor = isDark ? "#000" : "#0f172a";
  const filterBg = isDark ? "rgba(7,30,34,0.64)" : "rgba(255,255,255,0.48)";
  const filterBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,128,128,0.14)";
  const tabBg = isDark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.34)";
  return StyleSheet.create({
    header: {
      paddingHorizontal: compact ? 16 : 20,
      paddingTop: compact ? 8 : 13,
      paddingBottom: compact ? 6 : 9,
      backgroundColor: "transparent",
      borderBottomColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,128,128,0.06)",
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    topRow: { marginBottom: compact ? 6 : 9, flexDirection: 'row', alignItems: 'flex-start' },
    titleCluster: { flex: 1, paddingRight: compact ? 10 : 14 },
    rightRail: {
      borderRadius: 18,
    },
    rightRailSurface: {
      paddingHorizontal: compact ? 5 : 7,
      paddingVertical: compact ? 5 : 7,
      borderRadius: 18,
    },
    rightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: compact ? 30 : 36, color: isDark ? VIBES_DEPTH_COLORS.cream : "#173C3B", fontFamily: 'PlayfairDisplay_700Bold', letterSpacing: 0 },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: compact ? 4 : 6,
    },
    subtitleDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
      backgroundColor: VIBES_DEPTH_COLORS.teal,
      shadowColor: VIBES_DEPTH_COLORS.teal,
      shadowOpacity: isDark ? 0.45 : 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
    },
    subtitle: { color: isDark ? "rgba(244,248,248,0.72)" : "rgba(31,42,42,0.66)", fontFamily: 'Manrope_600SemiBold', flexShrink: 1, fontSize: compact ? 13 : 14 },
    filterButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: compact ? 36 : 40,
      height: compact ? 36 : 40,
      borderRadius: compact ? 12 : 13,
      borderWidth: 1,
      borderColor: filterBorder,
      backgroundColor: filterBg,
      shadowColor,
      shadowOpacity: isDark ? 0.1 : 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
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
      borderRadius: 22,
      marginTop: 2,
    },
    tabContainerSurface: {
      flexDirection: "row",
      padding: compact ? 3 : 5,
      borderRadius: 22,
    },
    tab: { flex: 1, borderRadius: 14 },
    activeTab: {},
    activeTabSurface: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: compact ? 9 : 10,
      paddingHorizontal: compact ? 6 : 10,
      borderRadius: 15,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(19,168,168,0.24)",
      shadowColor: VIBES_DEPTH_COLORS.teal,
      shadowOpacity: isDark ? 0.2 : 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    tabSurface: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: compact ? 9 : 10,
      paddingHorizontal: compact ? 6 : 10,
      borderRadius: 15,
      backgroundColor: tabBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,128,128,0.06)',
    },
    tabIcon: { marginRight: compact ? 4 : 6 },
    tabText: { fontSize: compact ? 12 : 13, color: isDark ? theme.text : "rgba(31,42,42,0.72)", fontFamily: 'Manrope_700Bold' },
    activeTabText: { color: isDark ? "#F8FFFF" : "#173C3B" },
    counterRow: { alignItems: "center", marginTop: 12 },
    counter: { fontSize: 16, fontWeight: "800", color: theme.text },
    counterSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  });
};
