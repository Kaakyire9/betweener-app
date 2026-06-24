import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import {
  getGiftRevealCopy,
  getGiftStoryCtaLabel,
} from "@/components/gifts/giftCopy";
import GiftHero from "@/components/gifts/GiftHero";
import GiftSenderCard from "@/components/gifts/GiftSenderCard";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getGiftMeta } from "@/lib/gifts/gift-meta";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type GiftRevealModalProps = {
  visible: boolean;
  senderAvatar?: string | null;
  senderName: string;
  senderGender?: string | null;
  giftType?: string | null;
  timeLabel?: string;
  onClose: () => void;
  onViewProfile?: () => void;
};

export default function GiftRevealModal({
  visible,
  senderAvatar,
  senderName,
  senderGender,
  giftType,
  timeLabel,
  onClose,
  onViewProfile,
}: GiftRevealModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const meta = getGiftMeta(giftType);
  const safeSenderName = String(senderName || "").trim() || "Someone";
  const copy = getGiftRevealCopy({ giftType, senderName: safeSenderName });
  const senderMeta = timeLabel ? `Revealed ${timeLabel}` : "Revealed now";
  const primaryCtaLabel = getGiftStoryCtaLabel(senderGender);

  const backdropProgress = useSharedValue(0);
  const sheetProgress = useSharedValue(0);
  const eyebrowProgress = useSharedValue(0);
  const badgeProgress = useSharedValue(0);
  const titleProgress = useSharedValue(0);
  const subtitleProgress = useSharedValue(0);
  const senderProgress = useSharedValue(0);
  const storyProgress = useSharedValue(0);
  const actionsProgress = useSharedValue(0);
  const ambientSheetGlow = useSharedValue(0);

  useEffect(() => {
    const progressValues = [
      backdropProgress,
      sheetProgress,
      eyebrowProgress,
      badgeProgress,
      titleProgress,
      subtitleProgress,
      senderProgress,
      storyProgress,
      actionsProgress,
      ambientSheetGlow,
    ];

    progressValues.forEach((value) => {
      cancelAnimation(value);
      value.value = 0;
    });

    if (!visible) {
      return;
    }

    backdropProgress.value = withTiming(1, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    sheetProgress.value = withDelay(
      20,
      withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      }),
    );
    eyebrowProgress.value = withDelay(
      90,
      withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      }),
    );
    badgeProgress.value = withDelay(
      130,
      withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      }),
    );
    titleProgress.value = withDelay(
      160,
      withTiming(1, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      }),
    );
    subtitleProgress.value = withDelay(
      220,
      withTiming(1, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      }),
    );
    senderProgress.value = withDelay(
      390,
      withTiming(1, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      }),
    );
    storyProgress.value = withDelay(
      450,
      withTiming(1, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      }),
    );
    actionsProgress.value = withDelay(
      520,
      withTiming(1, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      }),
    );
    ambientSheetGlow.value = withDelay(
      860,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 5600, easing: Easing.inOut(Easing.cubic) }),
          withTiming(0, { duration: 5600, easing: Easing.inOut(Easing.cubic) }),
        ),
        -1,
        false,
      ),
    );
  }, [
    actionsProgress,
    ambientSheetGlow,
    backdropProgress,
    badgeProgress,
    eyebrowProgress,
    senderProgress,
    sheetProgress,
    storyProgress,
    subtitleProgress,
    titleProgress,
    visible,
  ]);

  const useFadeUpStyle = (progress: SharedValue<number>, distance: number) =>
    useAnimatedStyle(() => ({
      opacity: progress.value,
      transform: [{ translateY: (1 - progress.value) * distance }] as const,
    }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropProgress.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: sheetProgress.value,
    transform: [
      { translateY: (1 - sheetProgress.value) * 18 },
      { scale: 0.985 + sheetProgress.value * 0.015 },
    ] as const,
  }));

  const liveGlowStyle = useAnimatedStyle(() => ({
    opacity: (isDark ? 0.64 : 0.4) + ambientSheetGlow.value * 0.16,
    transform: [{ scale: 1 + ambientSheetGlow.value * 0.05 }] as const,
  }));

  const floatingWashStyle = useAnimatedStyle(() => ({
    opacity: (isDark ? 0.18 : 0.12) + ambientSheetGlow.value * 0.08,
    transform: [
      { translateX: ambientSheetGlow.value * 10 },
      { translateY: -ambientSheetGlow.value * 6 },
      { scale: 1 + ambientSheetGlow.value * 0.04 },
    ] as const,
  }));

  const eyebrowStyle = useFadeUpStyle(eyebrowProgress, 8);
  const badgeStyle = useFadeUpStyle(badgeProgress, 8);
  const titleStyle = useFadeUpStyle(titleProgress, 14);
  const subtitleStyle = useFadeUpStyle(subtitleProgress, 12);
  const senderStyle = useFadeUpStyle(senderProgress, 14);
  const storyStyle = useFadeUpStyle(storyProgress, 12);
  const actionsStyle = useFadeUpStyle(actionsProgress, 12);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <BlurViewSafe
          intensity={isDark ? 28 : 18}
          tint={isDark ? "dark" : "light"}
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark ? "rgba(3, 8, 12, 0.72)" : "rgba(9, 17, 24, 0.22)",
            },
          ]}
        />

        <Animated.View style={sheetStyle}>
          <LinearGradient
            colors={isDark ? ["#13222B", "#101923"] : ["#FBFEFF", "#F6F2FF"]}
            start={{ x: 0.04, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.sheet,
              {
                borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15, 23, 42, 0.08)",
                backgroundColor: theme.backgroundSubtle,
              },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sheetGlow,
                { backgroundColor: isDark ? `${meta.tint}20` : `${meta.tint}14` },
                liveGlowStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sheetWash,
                { backgroundColor: isDark ? `${meta.accent}18` : `${meta.tint}10` },
                floatingWashStyle,
              ]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={
                isDark
                  ? ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)", "transparent"]
                  : ["rgba(255,255,255,0.82)", "rgba(255,255,255,0.18)", "transparent"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 0.85, y: 0.55 }}
              style={styles.sheetSheen}
            />

            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Animated.View style={eyebrowStyle}>
                  <Text style={[styles.eyebrow, { color: isDark ? "#80E8DE" : theme.tint }]}>
                    Premium hub
                  </Text>
                </Animated.View>
                <Animated.View style={badgeStyle}>
                  <View
                    style={[
                      styles.headerBadge,
                      { backgroundColor: `${meta.tint}18`, borderColor: `${meta.tint}34` },
                    ]}
                  >
                    <MaterialCommunityIcons name="gift-outline" size={16} color={meta.tint} />
                    <Text style={[styles.headerBadgeText, { color: meta.tint }]}>Gift reveal</Text>
                  </View>
                </Animated.View>
              </View>
              <Pressable
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(15,23,42,0.04)",
                  },
                ]}
                onPress={onClose}
              >
                <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            <Animated.View style={titleStyle}>
              <Text style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
            </Animated.View>
            <Animated.View style={subtitleStyle}>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>{copy.meaning}</Text>
            </Animated.View>

            <GiftHero giftType={giftType} visible={visible} />

            <Animated.View style={senderStyle}>
              <View style={styles.senderCardWrap}>
                <GiftSenderCard
                  senderAvatar={senderAvatar}
                  senderName={safeSenderName}
                  senderMeta={senderMeta}
                />
              </View>
            </Animated.View>

            <Animated.View style={storyStyle}>
              <View style={styles.storyBlock}>
                <Text style={[styles.storyLine, { color: theme.text }]}>
                  {copy.storyLine}
                </Text>
              </View>
            </Animated.View>

            <Animated.View style={actionsStyle}>
              <View style={styles.actions}>
                <Pressable
                  onPress={onClose}
                  style={[
                    styles.secondaryButton,
                    {
                      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : theme.background,
                      borderColor: theme.outline,
                    },
                  ]}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                    Maybe Later
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onViewProfile}
                  disabled={!onViewProfile}
                  style={[styles.primaryButton, { opacity: onViewProfile ? 1 : 0.55 }]}
                >
                  <LinearGradient
                    colors={["#35D6C4", "#7D7CF3"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGradient}
                  >
                    <Text style={styles.primaryButtonText}>{primaryCtaLabel}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 8, 12, 0.7)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  sheet: {
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 26,
    elevation: 14,
  },
  sheetGlow: {
    position: "absolute",
    top: -54,
    right: -16,
    width: 220,
    height: 220,
    borderRadius: 999,
  },
  sheetWash: {
    position: "absolute",
    bottom: 92,
    left: -34,
    width: 180,
    height: 180,
    borderRadius: 999,
  },
  sheetSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerCopy: {
    gap: 8,
  },
  eyebrow: {
    fontFamily: "Archivo_700Bold",
    fontSize: 10.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  headerBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBadgeText: {
    fontFamily: "Archivo_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 18,
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 31,
    lineHeight: 36,
  },
  subtitle: {
    marginTop: 10,
    fontFamily: "Manrope_500Medium",
    fontSize: 13.5,
    lineHeight: 21,
  },
  storyBlock: {
    marginTop: 16,
    paddingHorizontal: 2,
  },
  senderCardWrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  storyLine: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13.5,
    lineHeight: 21,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  primaryButton: {
    flex: 1.15,
    borderRadius: 16,
    overflow: "hidden",
  },
  primaryGradient: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#07141A",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
  },
});
