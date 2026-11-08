import { Colors } from "@/constants/theme";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Theme = typeof Colors.light;

type PremiumExpiryReminder = {
  title: string;
  body: string;
};

type Props = {
  theme: Theme;
  isDark: boolean;
  premiumExpiryReminder: PremiumExpiryReminder | null;
  onReviewPremium: () => void;
};

export default function MeProfileStatusStack({
  theme,
  isDark,
  premiumExpiryReminder,
  onReviewPremium,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!premiumExpiryReminder) {
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
  });
}
