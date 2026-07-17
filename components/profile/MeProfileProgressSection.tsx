import { VerificationNudgeCard } from "@/components/VerificationNudgeCard";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Theme = typeof Colors.light;

type Props = {
  theme: Theme;
  showPendingVerificationNudge: boolean;
  showInviteVerificationNudge: boolean;
  rewardText: string | null;
  progressSubtitle: string;
  progressPercent: number;
  progressTrackWidth: number;
  progressAnim: Animated.Value;
  progressGlowAnim: Animated.Value;
  progressAnimatedOnce: boolean;
  nextPrompt: string | null;
  onVerificationPress: () => void;
  onDismissVerificationNudge: () => void;
  onProgressTrackLayout: (width: number) => void;
  onEditProfile: () => void;
};

export default function MeProfileProgressSection({
  theme,
  showPendingVerificationNudge,
  showInviteVerificationNudge,
  rewardText,
  progressSubtitle,
  progressPercent,
  progressTrackWidth,
  progressAnim,
  progressGlowAnim,
  progressAnimatedOnce,
  nextPrompt,
  onVerificationPress,
  onDismissVerificationNudge,
  onProgressTrackLayout,
  onEditProfile,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      {showPendingVerificationNudge ? (
        <VerificationNudgeCard
          theme={theme}
          mode="pending"
          onPress={onVerificationPress}
        />
      ) : null}
      {showInviteVerificationNudge ? (
        <VerificationNudgeCard
          theme={theme}
          onPress={onVerificationPress}
          onSecondaryPress={onDismissVerificationNudge}
        />
      ) : null}
      <View
        style={[
          styles.progressCard,
          { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
        ]}
      >
        <View style={styles.progressTopRow}>
          <View>
            <Text style={[styles.progressTitle, { color: theme.text }]}>
              Profile progress
            </Text>
            <Text style={[styles.progressSub, { color: theme.textMuted }]}>
              {rewardText ?? progressSubtitle}
            </Text>
          </View>
          <View style={styles.progressPctWrap}>
            <Text style={[styles.progressPct, { color: theme.text }]}>
              {progressPercent}%
            </Text>
          </View>
        </View>
        <View
          style={[styles.progressTrack, { backgroundColor: theme.outline }]}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width) onProgressTrackLayout(width);
          }}
        >
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          >
            <LinearGradient
              colors={[theme.tint, theme.accent]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.progressFillGradient}
            />
          </Animated.View>
          {progressTrackWidth > 0 && !progressAnimatedOnce ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.progressGlow,
                {
                  transform: [
                    {
                      translateX: progressGlowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-60, progressTrackWidth + 60],
                      }),
                    },
                  ],
                  opacity: progressGlowAnim.interpolate({
                    inputRange: [0, 0.1, 0.6, 1],
                    outputRange: [0, 0.35, 0.22, 0],
                  }),
                },
              ]}
            />
          ) : null}
        </View>
        {progressPercent < 100 ? (
          <Text style={[styles.progressHelper, { color: theme.textMuted }]}>
            A few thoughtful details make the whole profile feel stronger.
          </Text>
        ) : (
          <Text style={[styles.progressHelper, { color: theme.textMuted }]}>
            {"You're all set."}
          </Text>
        )}
        {nextPrompt ? (
          <TouchableOpacity
            style={styles.progressHintRow}
            activeOpacity={0.7}
            onPress={onEditProfile}
          >
            <MaterialCommunityIcons name="star-four-points" size={14} color={theme.accent} />
            <Text
              style={[styles.progressHint, { color: theme.textMuted }]}
              numberOfLines={1}
            >
              {nextPrompt}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );
}

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    progressCard: {
      marginTop: 12,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 15,
      paddingVertical: 10,
      width: "100%",
    },
    progressTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    progressTitle: {
      fontSize: 14,
      fontFamily: "Manrope_600SemiBold",
      letterSpacing: 0.2,
    },
    progressSub: {
      marginTop: 2,
      fontSize: 12,
      fontFamily: "Manrope_400Regular",
    },
    progressPctWrap: {
      minWidth: 54,
      alignItems: "flex-end",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    progressPct: {
      fontSize: 15,
      fontFamily: "Archivo_700Bold",
      letterSpacing: 0.2,
    },
    progressTrack: {
      marginTop: 8,
      height: 9,
      borderRadius: 999,
      overflow: "hidden",
    },
    progressFill: {
      height: 9,
      borderRadius: 999,
      overflow: "hidden",
    },
    progressFillGradient: {
      flex: 1,
    },
    progressGlow: {
      position: "absolute",
      top: -6,
      bottom: -6,
      width: 60,
      borderRadius: 999,
      backgroundColor: "rgba(183,153,255,0.45)",
    },
    progressHintRow: {
      marginTop: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    progressHelper: {
      marginTop: 7,
      fontSize: 11.5,
      fontFamily: "Manrope_400Regular",
      lineHeight: 15,
    },
    progressHint: {
      fontSize: 12,
      fontFamily: "Manrope_500Medium",
      flexShrink: 1,
    },
  });
}
