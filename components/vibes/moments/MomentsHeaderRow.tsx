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
  const compactEmptyState = isEmpty && metrics.shouldUseCompactEmptyState;
  const titleBlock = (
    <>
      <View
        style={[
          styles.iconWrap,
          isEmpty ? styles.iconWrapEmpty : null,
          compactEmptyState ? styles.iconWrapEmptyCompact : null,
        ]}
      >
        <MaterialCommunityIcons
          name="star-four-points"
          size={compactEmptyState ? 14 : isEmpty ? 15 : 16}
          color={theme.tint}
        />
      </View>
      <View style={styles.copyWrap}>
        <Text style={[styles.eyebrow, { color: theme.tint }]}>{MOMENTS_CAPSULE_COPY.eyebrow}</Text>
        <View style={styles.titleLine}>
          <Text
            style={[
              styles.title,
              isEmpty ? styles.titleEmpty : null,
              compactEmptyState ? styles.titleEmptyCompact : null,
              { color: isDark ? "#F4E8D0" : "#173C3B" },
            ]}
          >
            {MOMENTS_CAPSULE_COPY.title}
          </Text>
          {momentCount > 0 ? (
            <View style={[styles.countBadge, { borderColor: "rgba(19,168,168,0.22)" }]}>
              <Text style={[styles.countText, { color: theme.tint }]}>{momentCount > 9 ? "9+" : momentCount}</Text>
            </View>
          ) : null}
          {!isEmpty ? (
            <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={15} color={theme.text} />
          ) : null}
        </View>
        {isEmpty ? (
          <Text
            numberOfLines={compactEmptyState ? 1 : 2}
            style={[
              styles.subtitle,
              styles.subtitleEmpty,
              compactEmptyState ? styles.subtitleEmptyCompact : null,
              { color: theme.textMuted },
            ]}
          >
            {MOMENTS_CAPSULE_COPY.emptySubtitle}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.row,
        isEmpty ? styles.rowEmpty : null,
        compactEmptyState ? styles.rowEmptyCompact : null,
        {
          marginBottom:
            isEmpty && compactEmptyState
              ? metrics.platform === "android"
                ? 14
                : 8
              : 0,
          minHeight: isEmpty
            ? Math.max(40, metrics.headerHeight - (compactEmptyState ? 14 : 10))
            : metrics.headerHeight,
        },
      ]}
    >
      {isEmpty ? (
        <View
          style={[
            styles.titlePill,
            styles.titlePillEmpty,
            compactEmptyState ? styles.titlePillEmptyCompact : null,
            {
              backgroundColor: isDark ? "rgba(7,30,34,0.44)" : "rgba(255,250,244,0.58)",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
            },
          ]}
        >
          {titleBlock}
        </View>
      ) : (
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
          {titleBlock}
        </TouchableOpacity>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isEmpty ? "Share a Moment" : "See all Moments"}
        activeOpacity={0.86}
        onPress={isEmpty ? onPressShare : onPressSeeAll}
        style={[
          styles.actionPill,
          isEmpty ? styles.actionPillEmpty : null,
          compactEmptyState ? styles.actionPillEmptyCompact : null,
          {
            backgroundColor: isEmpty
              ? isDark ? "rgba(19,168,168,0.18)" : "rgba(19,168,168,0.12)"
              : isDark ? "rgba(7,30,34,0.42)" : "rgba(255,255,255,0.58)",
            borderColor: isEmpty
              ? isDark ? "rgba(19,168,168,0.30)" : "rgba(19,168,168,0.20)"
              : isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
          },
        ]}
      >
        <MaterialCommunityIcons name={isEmpty ? "plus-circle" : "send"} size={14} color={theme.tint} />
        <Text style={[styles.actionText, compactEmptyState ? styles.actionTextCompact : null, { color: theme.tint }]}>
          {isEmpty ? (compactEmptyState ? "Share" : "Share yours") : MOMENTS_CAPSULE_COPY.seeAll}
        </Text>
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
  rowEmpty: {
    gap: 8,
  },
  rowEmptyCompact: {
    gap: 6,
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
  titlePillEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  titlePillEmptyCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(19,168,168,0.10)",
  },
  iconWrapEmpty: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  iconWrapEmptyCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  copyWrap: {
    flexShrink: 1,
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
  titleEmpty: {
    fontSize: 17,
  },
  titleEmptyCompact: {
    fontSize: 16,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: "Manrope_600SemiBold",
  },
  subtitleEmpty: {
    marginTop: 1,
    lineHeight: 16,
    maxWidth: 200,
  },
  subtitleEmptyCompact: {
    marginTop: 0,
    fontSize: 11,
    lineHeight: 14,
    maxWidth: 170,
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
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionPillEmpty: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionPillEmptyCompact: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 12,
    fontFamily: "Manrope_800ExtraBold",
  },
  actionTextCompact: {
    fontSize: 11,
  },
});
