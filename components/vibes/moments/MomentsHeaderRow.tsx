import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MOMENTS_CAPSULE_COPY } from "./momentsCapsuleCopy";
import type { MomentsCapsuleMetrics } from "./useMomentsCapsuleMetrics";

type MomentsHeaderRowProps = {
  momentCount: number;
  isEmpty: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPressSeeAll: () => void;
  onPressShare: () => void;
  theme: typeof Colors.light;
  isDark: boolean;
  metrics: MomentsCapsuleMetrics;
};

function MomentsHeaderRow({
  momentCount,
  isEmpty,
  expanded,
  onToggle,
  onPressSeeAll,
  onPressShare,
  theme,
  isDark,
  metrics,
}: MomentsHeaderRowProps) {
  return (
    <View style={[styles.row, { minHeight: metrics.headerHeight }]}>
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={onToggle}
        style={[
          styles.titlePill,
          {
            backgroundColor: isDark ? "rgba(7,30,34,0.44)" : "rgba(255,250,244,0.58)",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
          },
        ]}
      >
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="star-four-points" size={16} color={theme.tint} />
        </View>
        <View>
          <Text style={[styles.eyebrow, { color: theme.tint }]}>{MOMENTS_CAPSULE_COPY.eyebrow}</Text>
          <View style={styles.titleLine}>
            <Text style={[styles.title, { color: isDark ? "#F4E8D0" : "#173C3B" }]}>
              {MOMENTS_CAPSULE_COPY.title}
            </Text>
            {momentCount > 0 ? (
              <View style={[styles.countBadge, { borderColor: "rgba(19,168,168,0.22)" }]}>
                <Text style={[styles.countText, { color: theme.tint }]}>{momentCount > 9 ? "9+" : momentCount}</Text>
              </View>
            ) : null}
            <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={15} color={theme.text} />
          </View>
          {isEmpty ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{MOMENTS_CAPSULE_COPY.emptySubtitle}</Text> : null}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isEmpty ? "Share a Moment" : "See all Moments"}
        activeOpacity={0.86}
        onPress={isEmpty ? onPressShare : onPressSeeAll}
        style={[
          styles.actionPill,
          {
            backgroundColor: isDark ? "rgba(7,30,34,0.42)" : "rgba(255,255,255,0.58)",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
          },
        ]}
      >
        <MaterialCommunityIcons name={isEmpty ? "plus" : "send"} size={14} color={theme.tint} />
        <Text style={[styles.actionText, { color: theme.tint }]}>{isEmpty ? "Share" : MOMENTS_CAPSULE_COPY.seeAll}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default memo(MomentsHeaderRow);

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexShrink: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(19,168,168,0.10)",
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  title: {
    fontSize: 18,
    fontFamily: "Archivo_700Bold",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: "Manrope_600SemiBold",
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "rgba(19,168,168,0.10)",
    borderWidth: 1,
  },
  countText: {
    fontSize: 10,
    fontFamily: "Manrope_800ExtraBold",
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 12,
    fontFamily: "Manrope_800ExtraBold",
  },
});
