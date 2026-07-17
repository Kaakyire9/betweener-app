import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import OfflineImage from "@/components/media/OfflineImage";
import { Colors } from "@/constants/theme";
import { getSafeRemoteImageUri } from "@/lib/profile/display-name";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

type MomentAvatarBubbleProps = {
  avatarUrl?: string | null;
  label: string;
  statusLabel?: string;
  isOwn?: boolean;
  needsAttention?: boolean;
  hasUnseenMoment?: boolean;
  isLive?: boolean;
  onPress: () => void;
  avatarSize: number;
  ringSize: number;
  showLabel: boolean;
  showStatus: boolean;
  isDark: boolean;
  theme: typeof Colors.light;
};

function MomentAvatarBubble({
  avatarUrl,
  label,
  statusLabel,
  isOwn = false,
  needsAttention = false,
  hasUnseenMoment = false,
  isLive = false,
  onPress,
  avatarSize,
  ringSize,
  showLabel,
  showStatus,
  isDark,
  theme,
}: MomentAvatarBubbleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const safeAvatarUrl = getSafeRemoteImageUri(avatarUrl || null);
  const initials = label.trim().slice(0, 1).toUpperCase() || "M";

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    try {
      Haptics.selectionAsync();
    } catch {}
    onPress();
  };

  const showGradientRing = hasUnseenMoment || isOwn;
  const ringColors = hasUnseenMoment
    ? ["#f59e0b", "#f43f5e", "#22d3ee"]
    : isOwn
      ? ["rgba(244,232,208,0.95)", "rgba(19,168,168,0.72)"]
      : ["rgba(244,232,208,0.0)", "rgba(244,232,208,0.0)"];

  const avatarFallback = (
    <View
      style={[
        styles.placeholder,
        {
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          backgroundColor: isDark ? "rgba(244,232,208,0.12)" : "rgba(19,168,168,0.12)",
          borderColor: isDark ? "rgba(244,232,208,0.10)" : "rgba(19,168,168,0.12)",
        },
      ]}
    >
      {isOwn && !isLive ? (
        <MaterialCommunityIcons name="plus" size={Math.round(avatarSize * 0.42)} color={theme.tint} />
      ) : (
        <Text style={[styles.initials, { color: theme.text }]}>{initials}</Text>
      )}
    </View>
  );

  const overlayBadge = isOwn && !isLive ? (
    <View style={[styles.addDot, { backgroundColor: theme.tint }]}>
      <MaterialCommunityIcons name="plus" size={8} color="#F4E8D0" />
    </View>
  ) : needsAttention ? (
    <View style={[styles.attentionDot, { backgroundColor: "#f59e0b" }]}>
      <MaterialCommunityIcons name="bell-ring" size={8} color="#082224" />
    </View>
  ) : null;

  const avatarBody = (
    <>
      <OfflineImage
        uri={safeAvatarUrl}
        style={[
          styles.avatar,
          {
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            borderColor: isDark ? "rgba(7,30,34,0.88)" : "rgba(255,250,244,0.92)",
          },
        ]}
        contentFit="cover"
        fallback={avatarFallback}
      />
      {overlayBadge}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isOwn ? (isLive ? "View or manage your Moment" : "Add your Moment") : `View ${label}'s Moment`}
      onPress={handlePress}
      style={[styles.pressable, { minWidth: Math.max(ringSize, 48) }]}
    >
      <Animated.View style={[styles.scaleWrap, { transform: [{ scale }] }]}>
        {showGradientRing ? (
          <LinearGradientSafe
            colors={ringColors}
            start={[0, 0]}
            end={[1, 1]}
            style={[
              styles.ring,
              hasUnseenMoment ? styles.ringUnseen : null,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                padding: Math.max(2, Math.round((ringSize - avatarSize) / 2)),
              },
            ]}
          >
            {avatarBody}
          </LinearGradientSafe>
        ) : (
          <View
            style={[
              styles.ringPlain,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                padding: Math.max(2, Math.round((ringSize - avatarSize) / 2)),
              },
            ]}
          >
            {avatarBody}
          </View>
        )}
      </Animated.View>
      {showLabel ? (
        <Text numberOfLines={1} style={[styles.label, { color: isDark ? "#F4E8D0" : "#173C3B", maxWidth: ringSize + 10 }]}>
          {label}
        </Text>
      ) : null}
      {showStatus && statusLabel ? (
        <Text numberOfLines={1} style={[styles.status, { color: theme.textMuted, maxWidth: ringSize + 18 }]}>
          {statusLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default memo(MomentAvatarBubble);

const styles = StyleSheet.create({
  pressable: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  scaleWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringUnseen: {
    shadowColor: '#f3c784',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  ringPlain: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    borderWidth: 2,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  initials: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold",
  },
  addDot: {
    position: "absolute",
    right: 3,
    bottom: 3,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.5,
    borderColor: "#F4E8D0",
    alignItems: "center",
    justifyContent: "center",
  },
  attentionDot: {
    position: "absolute",
    right: 3,
    top: 3,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.5,
    borderColor: "#F4E8D0",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 3,
    fontSize: 10,
    fontFamily: "Manrope_800ExtraBold",
    textAlign: "center",
  },
  status: {
    marginTop: 0,
    fontSize: 7,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    textAlign: "center",
  },
});
