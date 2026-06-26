import PremiumSyncNotice from "@/components/profile/PremiumSyncNotice";
import { Colors } from "@/constants/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Theme = typeof Colors.light;

type PremiumExpiryReminder = {
  title: string;
  body: string;
};

type PremiumQueueState = {
  visible: boolean;
  title: string;
  message: string;
  failedCount: number;
  pendingCount: number;
  hasFailed: boolean;
  retryFailed: () => Promise<unknown>;
};

type Props = {
  theme: Theme;
  isDark: boolean;
  premiumExpiryReminder: PremiumExpiryReminder | null;
  premiumQueue: PremiumQueueState;
  profileSyncPending: boolean;
  profileSyncFailed: boolean;
  onReviewPremium: () => void;
  onOpenSyncActivity: () => void;
};

export default function MeProfileStatusStack({
  theme,
  isDark,
  premiumExpiryReminder,
  premiumQueue,
  profileSyncPending,
  profileSyncFailed,
  onReviewPremium,
  onOpenSyncActivity,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!premiumExpiryReminder && !premiumQueue.visible && !profileSyncPending && !profileSyncFailed) {
    return null;
  }

  return (
    <>
      {premiumExpiryReminder ? (
        <View
          style={[
            styles.premiumReminderCard,
            {
              backgroundColor: isDark ? "rgba(24, 40, 46, 0.92)" : theme.backgroundSubtle,
              borderColor: isDark ? "rgba(255,255,255,0.08)" : theme.outline,
            },
          ]}
        >
          <View style={styles.premiumReminderCopy}>
            <Text style={[styles.premiumReminderTitle, { color: theme.text }]}>
              {premiumExpiryReminder.title}
            </Text>
            <Text style={[styles.premiumReminderBody, { color: theme.textMuted }]}>
              {premiumExpiryReminder.body}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.premiumReminderAction,
              { borderColor: theme.outline, backgroundColor: theme.background },
            ]}
            onPress={onReviewPremium}
          >
            <Text style={[styles.premiumReminderActionText, { color: theme.tint }]}>Review</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {premiumQueue.visible ? (
        <PremiumSyncNotice
          theme={theme}
          isDark={isDark}
          title={premiumQueue.title}
          message={premiumQueue.message}
          failedCount={premiumQueue.failedCount}
          pendingCount={premiumQueue.pendingCount}
          onPress={() => {
            if (premiumQueue.hasFailed) {
              void premiumQueue.retryFailed();
              return;
            }
            onOpenSyncActivity();
          }}
        />
      ) : null}

      {profileSyncPending || profileSyncFailed ? (
        <View
          style={[
            styles.profileSyncBanner,
            {
              backgroundColor: profileSyncFailed ? "rgba(239, 68, 68, 0.12)" : "rgba(20, 184, 166, 0.12)",
              borderColor: profileSyncFailed ? "rgba(239, 68, 68, 0.32)" : "rgba(20, 184, 166, 0.32)",
            },
          ]}
        >
          <MaterialCommunityIcons
            name={profileSyncFailed ? "cloud-alert-outline" : "cloud-sync-outline"}
            size={16}
            color={profileSyncFailed ? "#F87171" : theme.tint}
          />
          <Text style={[styles.profileSyncText, { color: theme.textMuted }]}>
            {profileSyncFailed
              ? "Some profile edits need your attention when you're back online."
              : "Profile edits saved here. Syncing when your connection returns."}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    premiumReminderCard: {
      width: "100%",
      marginTop: 12,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    premiumReminderCopy: {
      flex: 1,
      gap: 3,
    },
    premiumReminderTitle: {
      fontSize: 12.5,
      fontFamily: "Manrope_700Bold",
    },
    premiumReminderBody: {
      fontSize: 11.5,
      lineHeight: 16,
      fontFamily: "Manrope_500Medium",
    },
    premiumReminderAction: {
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    premiumReminderActionText: {
      fontSize: 11.5,
      fontFamily: "Manrope_700Bold",
    },
    profileSyncBanner: {
      width: "100%",
      marginTop: 12,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    profileSyncText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: "Manrope_600SemiBold",
    },
  });
}
