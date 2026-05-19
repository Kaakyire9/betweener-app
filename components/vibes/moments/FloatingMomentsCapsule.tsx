import GlassSurface from "@/components/vibes/depth/GlassSurface";
import OfflineImage from "@/components/media/OfflineImage";
import { Colors } from "@/constants/theme";
import type { MomentUser } from "@/hooks/useMoments";
import { getSafeRemoteImageUri } from "@/lib/profile/display-name";
import type { MomentRelationshipContext } from "@/types/moment-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import MomentAvatarBubble from "./MomentAvatarBubble";
import { formatMomentFirstName, MOMENTS_CAPSULE_COPY } from "./momentsCapsuleCopy";
import type { MomentsCapsuleMetrics } from "./useMomentsCapsuleMetrics";

type FloatingMomentsCapsuleProps = {
  users: MomentUser[];
  relationshipContextByProfileId?: Record<string, MomentRelationshipContext>;
  onPressMyMoment: () => void;
  onPressUserMoment: (userId: string) => void;
  onPressSeeAll: () => void;
  onPressPostMoment: () => void;
  theme: typeof Colors.light;
  isDark: boolean;
  metrics: MomentsCapsuleMetrics;
  style?: ViewStyle;
};

function FloatingMomentsCapsule({
  users,
  relationshipContextByProfileId,
  onPressMyMoment,
  onPressUserMoment,
  onPressSeeAll,
  onPressPostMoment,
  theme,
  isDark,
  metrics,
  style,
}: FloatingMomentsCapsuleProps) {
  const orderedUsers = useMemo(() => {
    const own = users.find((item) => item.isOwn) ?? null;
    const others = users
      .filter((item) => !item.isOwn && item.moments.length > 0)
      .sort((a, b) => {
        const aPriority = a.profileId && relationshipContextByProfileId?.[String(a.profileId)] ? 1 : 0;
        const bPriority = b.profileId && relationshipContextByProfileId?.[String(b.profileId)] ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        const aTime = a.latestMoment ? new Date(a.latestMoment.created_at).getTime() : 0;
        const bTime = b.latestMoment ? new Date(b.latestMoment.created_at).getTime() : 0;
        return bTime - aTime;
      });
    return own ? [own, ...others] : others;
  }, [relationshipContextByProfileId, users]);

  const activeMomentUsers = orderedUsers.filter((item) => item.moments.length > 0);
  const isOwnOnlyMoment = activeMomentUsers.length === 1 && Boolean(activeMomentUsers[0]?.isOwn);
  const isCompactRail = activeMomentUsers.length <= 3;
  const maxVisibleUsers = isCompactRail ? orderedUsers.length : Math.max(metrics.maxVisibleAvatars, 5);
  const visibleUsers = isOwnOnlyMoment ? activeMomentUsers : orderedUsers.slice(0, maxVisibleUsers);
  const overflowCount = isOwnOnlyMoment ? 0 : Math.max(0, orderedUsers.length - visibleUsers.length);
  const ownHasMoment = Boolean(orderedUsers.find((item) => item.isOwn)?.moments.length);
  const ownOnlyUser = activeMomentUsers[0] ?? null;
  const ownOnlyAvatarUrl = getSafeRemoteImageUri(ownOnlyUser?.avatarUrl || null);
  const railHeight = isCompactRail ? (metrics.isCompactHeight || metrics.isCompactWidth ? 64 : 68) : metrics.capsuleHeight;
  const compactAvatarLaneWidth = Math.min(
    metrics.isCompactWidth ? 132 : 188,
    visibleUsers.length * (metrics.avatarRingSize + 10) + (overflowCount > 0 ? metrics.avatarRingSize + 8 : 0),
  );
  const countPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (activeMomentUsers.length <= 0) return;
    countPulse.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(countPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(countPulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [activeMomentUsers.length, countPulse]);

  const countPulseStyle = {
    opacity: countPulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
    transform: [
      {
        scale: countPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.055] }),
      },
    ],
  };

  if (activeMomentUsers.length === 0) return null;

  if (isOwnOnlyMoment && ownOnlyUser) {
    return (
      <GlassSurface
        radius={22}
        intensity={metrics.platform === "ios" ? 22 : 0}
        tint={isDark ? "dark" : "light"}
        borderOpacity={isDark ? 0.08 : 0.1}
        fallbackColor={isDark
          ? Platform.OS === "android" ? "rgba(7,30,34,0.80)" : "rgba(7,30,34,0.56)"
          : Platform.OS === "android" ? "rgba(255,250,244,0.90)" : "rgba(255,255,255,0.66)"}
        style={[
          styles.shell,
          styles.singleShell,
          {
            height: metrics.isCompactHeight || metrics.isCompactWidth ? 58 : 62,
            borderRadius: 22,
          },
          style,
        ]}
      contentStyle={[
        styles.singleContent,
          {
            height: metrics.isCompactHeight || metrics.isCompactWidth ? 58 : 62,
            borderRadius: 22,
          },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View or manage your Moment"
        onPress={onPressMyMoment}
        style={styles.singlePressable}
      >
          <View
            style={[
              styles.singleAvatarRing,
              {
                width: metrics.isCompactHeight || metrics.isCompactWidth ? 46 : 50,
                height: metrics.isCompactHeight || metrics.isCompactWidth ? 46 : 50,
                borderRadius: metrics.isCompactHeight || metrics.isCompactWidth ? 23 : 25,
                borderColor: isDark ? "rgba(244,232,208,0.52)" : "rgba(19,168,168,0.28)",
              },
            ]}
          >
            <OfflineImage
              uri={ownOnlyAvatarUrl}
              style={[
                styles.singleAvatar,
                {
                  width: metrics.isCompactHeight || metrics.isCompactWidth ? 40 : 44,
                  height: metrics.isCompactHeight || metrics.isCompactWidth ? 40 : 44,
                  borderRadius: metrics.isCompactHeight || metrics.isCompactWidth ? 20 : 22,
                },
              ]}
              contentFit="cover"
              fallback={
                <View
                  style={[
                    styles.singleAvatarFallback,
                    {
                      width: metrics.isCompactHeight || metrics.isCompactWidth ? 40 : 44,
                      height: metrics.isCompactHeight || metrics.isCompactWidth ? 40 : 44,
                      borderRadius: metrics.isCompactHeight || metrics.isCompactWidth ? 20 : 22,
                      backgroundColor: isDark ? "rgba(244,232,208,0.12)" : "rgba(19,168,168,0.12)",
                    },
                  ]}
                >
                  <Text style={[styles.singleInitial, { color: theme.text }]}>Y</Text>
                </View>
              }
            />
            <View style={[styles.singleLiveDot, { backgroundColor: theme.tint }]} />
          </View>
          <View style={styles.singleCopy}>
            <Text numberOfLines={1} style={[styles.singleLabel, { color: isDark ? "#F4E8D0" : "#173C3B" }]}>
              {MOMENTS_CAPSULE_COPY.ownLabel}
            </Text>
            <Text numberOfLines={1} style={[styles.singleStatus, { color: theme.textMuted }]}>
              {MOMENTS_CAPSULE_COPY.liveStatus}
            </Text>
          </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See all Moments"
        onPress={onPressSeeAll}
        style={[
          styles.singleSeeAll,
          {
            borderColor: isDark ? "rgba(19,168,168,0.22)" : "rgba(19,168,168,0.16)",
            backgroundColor: isDark ? "rgba(19,168,168,0.10)" : "rgba(19,168,168,0.08)",
          },
        ]}
      >
        <MaterialCommunityIcons name="send" size={12} color={theme.tint} />
        {!metrics.isCompactWidth ? <Text style={[styles.singleSeeAllText, { color: theme.tint }]}>See all</Text> : null}
      </Pressable>
      </GlassSurface>
    );
  }

  return (
    <GlassSurface
      radius={metrics.capsuleRadius}
      intensity={metrics.platform === "ios" ? 26 : 0}
      tint={isDark ? "dark" : "light"}
      borderOpacity={isDark ? 0.08 : 0.1}
      fallbackColor={isDark
        ? Platform.OS === "android" ? "rgba(7,30,34,0.82)" : "rgba(7,30,34,0.58)"
        : Platform.OS === "android" ? "rgba(255,250,244,0.88)" : "rgba(255,255,255,0.62)"}
      style={[
        styles.shell,
        isCompactRail && styles.compactRailShell,
        {
          height: railHeight,
          borderRadius: metrics.capsuleRadius,
        },
        style,
      ]}
      contentStyle={[
        styles.content,
        isCompactRail && styles.compactRailContent,
        {
          height: railHeight,
          borderRadius: metrics.capsuleRadius,
          paddingHorizontal: metrics.isCompactWidth ? 10 : 13,
          paddingVertical: isCompactRail ? 6 : metrics.isCompactHeight ? 6 : 8,
        },
      ]}
    >
      <View style={[styles.fullRail, isCompactRail && styles.compactRail]}>
        <View style={[styles.railIdentity, isCompactRail && styles.compactRailIdentity]}>
          <View style={[styles.railIcon, { backgroundColor: isDark ? "rgba(19,168,168,0.12)" : "rgba(19,168,168,0.10)" }]}>
            <MaterialCommunityIcons name="star-four-points" size={14} color={theme.tint} />
          </View>
          {(!metrics.isCompactWidth || isCompactRail) ? (
            <Text style={[styles.railTitle, { color: isDark ? "#F4E8D0" : "#173C3B" }]}>Moments</Text>
          ) : null}
          {isCompactRail ? (
            <Animated.View style={[styles.railCount, { borderColor: "rgba(19,168,168,0.16)" }, countPulseStyle]}>
              <Text style={[styles.railCountText, { color: theme.tint }]}>
                {activeMomentUsers.length > 9 ? "9+" : activeMomentUsers.length}
              </Text>
            </Animated.View>
          ) : null}
        </View>
        {isCompactRail ? (
          <View style={[styles.avatarRow, styles.compactAvatarRow, { width: compactAvatarLaneWidth }]}>
            {visibleUsers.map((item) => {
                const isOwn = item.isOwn;
                const hasMoment = item.moments.length > 0;
                const relationshipContext =
                  !isOwn && item.profileId ? relationshipContextByProfileId?.[String(item.profileId)] ?? null : null;
                const label = isOwn ? MOMENTS_CAPSULE_COPY.ownLabel : formatMomentFirstName(item.name, metrics.isCompactWidth ? 8 : 10);
                const statusLabel = isOwn
                  ? hasMoment ? MOMENTS_CAPSULE_COPY.liveStatus : MOMENTS_CAPSULE_COPY.addStatus
                  : relationshipContext?.cue || "New";
                return (
                  <MomentAvatarBubble
                    key={item.userId}
                    avatarUrl={item.avatarUrl}
                    label={label}
                    statusLabel={statusLabel}
                    isOwn={isOwn}
                    hasUnseenMoment={!isOwn && hasMoment}
                    isLive={hasMoment}
                    onPress={() => {
                      if (isOwn) {
                        if (hasMoment) onPressMyMoment();
                        else onPressPostMoment();
                        return;
                      }
                      onPressUserMoment(item.userId);
                    }}
                    avatarSize={metrics.avatarSize}
                    ringSize={metrics.avatarRingSize}
                    showLabel={false}
                    showStatus={false}
                    isDark={isDark}
                    theme={theme}
                  />
                );
              })}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.avatarRow}
            style={styles.avatarScroller}
          >
            {visibleUsers.map((item) => {
              const isOwn = item.isOwn;
              const hasMoment = item.moments.length > 0;
              const relationshipContext =
                !isOwn && item.profileId ? relationshipContextByProfileId?.[String(item.profileId)] ?? null : null;
              const label = isOwn ? MOMENTS_CAPSULE_COPY.ownLabel : formatMomentFirstName(item.name, metrics.isCompactWidth ? 8 : 10);
              const statusLabel = isOwn
                ? hasMoment ? MOMENTS_CAPSULE_COPY.liveStatus : MOMENTS_CAPSULE_COPY.addStatus
                : relationshipContext?.cue || "New";
              return (
                <MomentAvatarBubble
                  key={item.userId}
                  avatarUrl={item.avatarUrl}
                  label={label}
                  statusLabel={statusLabel}
                  isOwn={isOwn}
                  hasUnseenMoment={!isOwn && hasMoment}
                  isLive={hasMoment}
                  onPress={() => {
                    if (isOwn) {
                      if (hasMoment) onPressMyMoment();
                      else onPressPostMoment();
                      return;
                    }
                    onPressUserMoment(item.userId);
                  }}
                  avatarSize={metrics.avatarSize}
                  ringSize={metrics.avatarRingSize}
                  showLabel={!isCompactRail && (isOwn || metrics.showLabels)}
                  showStatus={!isCompactRail && !metrics.isCompactHeight && (isOwn || metrics.showStatusLabels)}
                  isDark={isDark}
                  theme={theme}
                />
              );
            })}
            {overflowCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="See all Moments"
                onPress={onPressSeeAll}
                style={[
                  styles.overflowBubble,
                  {
                    width: metrics.avatarRingSize,
                    height: metrics.avatarRingSize,
                    borderRadius: metrics.avatarRingSize / 2,
                    backgroundColor: isDark ? "rgba(19,168,168,0.14)" : "rgba(19,168,168,0.10)",
                    borderColor: isDark ? "rgba(19,168,168,0.28)" : "rgba(19,168,168,0.18)",
                  },
                ]}
              >
                <Text style={[styles.overflowText, { color: theme.tint }]}>+{overflowCount}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all Moments"
          onPress={onPressSeeAll}
          style={[styles.railSeeAll, isCompactRail && styles.compactRailSeeAll]}
        >
          {!metrics.isCompactWidth ? (
            <Text style={[styles.railSeeAllText, { color: theme.tint }]}>See all</Text>
          ) : null}
          <MaterialCommunityIcons name="chevron-right" size={14} color={theme.tint} />
        </Pressable>
      </View>
      {metrics.shouldUseCompactEmptyState && !ownHasMoment && visibleUsers.length <= 1 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add your Moment" onPress={onPressPostMoment} style={styles.compactAdd}>
          <MaterialCommunityIcons name="plus" size={14} color={theme.tint} />
        </Pressable>
      ) : null}
    </GlassSurface>
  );
}

export default memo(FloatingMomentsCapsule);

const styles = StyleSheet.create({
  shell: {
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  singleShell: {
    alignSelf: "flex-start",
    minWidth: 150,
    maxWidth: "65%",
  },
  compactRailShell: {
    alignSelf: "flex-start",
    minWidth: 286,
    maxWidth: "92%",
  },
  content: {
    justifyContent: "center",
  },
  compactRailContent: {
    justifyContent: "center",
  },
  singleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  singlePressable: {
    minHeight: 46,
    minWidth: 138,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  singleSeeAll: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  singleSeeAllText: {
    fontSize: 10,
    fontFamily: "Manrope_800ExtraBold",
  },
  singleAvatarRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "rgba(19,168,168,0.10)",
  },
  singleAvatar: {
    borderWidth: 1.5,
    borderColor: "rgba(244,232,208,0.78)",
  },
  singleAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  singleInitial: {
    fontSize: 13,
    fontFamily: "Manrope_800ExtraBold",
  },
  singleLiveDot: {
    position: "absolute",
    right: 2,
    bottom: 3,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: "#F4E8D0",
  },
  singleCopy: {
    flexShrink: 1,
    justifyContent: "center",
  },
  singleLabel: {
    fontSize: 12,
    fontFamily: "Manrope_800ExtraBold",
  },
  singleStatus: {
    marginTop: 1,
    fontSize: 8,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingRight: 8,
  },
  fullRail: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactRail: {
    flex: 0,
    minHeight: 52,
    gap: 8,
  },
  railIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
  },
  compactRailIdentity: {
    gap: 6,
  },
  railCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    backgroundColor: "rgba(19,168,168,0.075)",
    borderWidth: 1,
  },
  railCountText: {
    fontSize: 8.5,
    fontFamily: "Manrope_800ExtraBold",
  },
  railIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  railTitle: {
    fontSize: 13,
    fontFamily: "Manrope_800ExtraBold",
  },
  avatarScroller: {
    flex: 1,
  },
  compactAvatarScroller: {
    flexGrow: 0,
    flexShrink: 0,
  },
  compactAvatarRow: {
    flexShrink: 0,
    overflow: "visible",
  },
  railSeeAll: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingLeft: 8,
    flexShrink: 0,
  },
  compactRailSeeAll: {
    paddingLeft: 2,
  },
  railSeeAllText: {
    fontSize: 10.5,
    fontFamily: "Manrope_800ExtraBold",
  },
  overflowBubble: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  overflowText: {
    fontSize: 13,
    fontFamily: "Manrope_800ExtraBold",
  },
  compactAdd: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(19,168,168,0.12)",
  },
  compactSeeAll: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  compactSeeAllText: {
    fontSize: 11,
    fontFamily: "Manrope_800ExtraBold",
  },
});
