import GiftArtwork from "@/components/gifts/GiftArtwork";
import OfflineImage from "@/components/media/OfflineImage";
import { Colors } from "@/constants/theme";
import {
  formatMembershipDate,
  type ReceivedGiftItem,
} from "@/lib/profile/me-screen-helpers";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Theme = typeof Colors.light;

const formatRelativeSignalTime = (value?: string | null) => {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  const diffMs = Math.max(0, Date.now() - parsed);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatMembershipDate(value) ?? "";
};

type Props = {
  theme: Theme;
  isDark: boolean;
  gifts: ReceivedGiftItem[];
  onOpenGift: (gift: ReceivedGiftItem) => void;
  onOpenInsights: () => void;
};

export default function MeReceivedGiftsCard({
  theme,
  isDark,
  gifts,
  onOpenGift,
  onOpenInsights,
}: Props) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (gifts.length === 0) return null;

  return (
    <View
      style={[
        styles.receivedGiftsCard,
        { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline },
      ]}
    >
      <View style={styles.receivedGiftsHeader}>
        <View style={styles.receivedGiftsHeaderCopy}>
          <Text style={[styles.receivedGiftsEyebrow, { color: theme.tint }]}>
            Gifted signals
          </Text>
          <Text style={[styles.receivedGiftsTitle, { color: theme.text }]}>
            {gifts.length === 1 ? "A premium surprise is waiting" : "Premium surprises are waiting"}
          </Text>
        </View>
        <View
          style={[
            styles.receivedGiftsCountPill,
            {
              backgroundColor: isDark ? "rgba(20, 184, 166, 0.12)" : `${theme.tint}14`,
              borderColor: isDark ? "rgba(20, 184, 166, 0.22)" : `${theme.tint}24`,
            },
          ]}
        >
          <MaterialCommunityIcons name="gift-outline" size={14} color={theme.tint} />
          <Text style={[styles.receivedGiftsCountText, { color: theme.tint }]}>
            {gifts.length}
          </Text>
        </View>
      </View>

      <View style={styles.receivedGiftsList}>
        {gifts.map((gift) => (
          <TouchableOpacity
            key={gift.id}
            style={[
              styles.receivedGiftRow,
              {
                backgroundColor: isDark ? "rgba(255,255,255,0.03)" : theme.background,
                borderColor: theme.outline,
              },
            ]}
            activeOpacity={0.9}
            onPress={() => onOpenGift(gift)}
          >
            <View style={styles.receivedGiftSender}>
              {gift.senderAvatar ? (
                <OfflineImage
                  uri={gift.senderAvatar}
                  style={styles.receivedGiftAvatar}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  style={[
                    styles.receivedGiftAvatarFallback,
                    { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : `${theme.tint}18` },
                  ]}
                >
                  <Text style={[styles.receivedGiftAvatarInitials, { color: theme.text }]}>
                    {gift.senderName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.receivedGiftCopy}>
                <Text style={[styles.receivedGiftSenderName, { color: theme.text }]} numberOfLines={1}>
                  {gift.senderName}
                </Text>
                <Text style={[styles.receivedGiftMessage, { color: theme.text }]}>
                  sent you something special
                </Text>
                <Text style={[styles.receivedGiftTimestamp, { color: theme.textMuted }]}>
                  {formatRelativeSignalTime(gift.createdAt)}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.receivedGiftTypePill,
                {
                  backgroundColor: isDark ? "rgba(46,214,194,0.10)" : `${theme.tint}0D`,
                  borderColor: isDark ? "rgba(46,214,194,0.24)" : `${theme.tint}24`,
                },
              ]}
            >
              <GiftArtwork giftType={gift.giftType} size={44} animate={false} />
              <View style={styles.receivedGiftTypeCopy}>
                <Text style={[styles.receivedGiftTypeText, { color: theme.text }]}>
                  Gift waiting
                </Text>
                <Text style={[styles.receivedGiftTypeHint, { color: theme.textMuted }]}>
                  Tap to reveal
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.receivedGiftsAction,
          { borderColor: theme.outline, backgroundColor: theme.background },
        ]}
        activeOpacity={0.86}
        onPress={onOpenInsights}
      >
        <Text style={[styles.receivedGiftsActionText, { color: theme.tint }]}>
          Open in Insights
        </Text>
        <MaterialCommunityIcons name="arrow-right" size={14} color={theme.tint} />
      </TouchableOpacity>
    </View>
  );
}

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    receivedGiftsCard: {
      width: "100%",
      marginTop: 12,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    receivedGiftsHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    receivedGiftsHeaderCopy: {
      flex: 1,
      gap: 4,
    },
    receivedGiftsEyebrow: {
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    receivedGiftsTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontFamily: "Manrope_700Bold",
    },
    receivedGiftsCountPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    receivedGiftsCountText: {
      fontSize: 12,
      fontFamily: "Archivo_700Bold",
    },
    receivedGiftsList: {
      gap: 10,
    },
    receivedGiftRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 15,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    receivedGiftSender: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
    },
    receivedGiftAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
    },
    receivedGiftAvatarFallback: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    receivedGiftAvatarInitials: {
      fontSize: 14,
      fontFamily: "Manrope_800ExtraBold",
    },
    receivedGiftCopy: {
      flex: 1,
      minWidth: 0,
    },
    receivedGiftSenderName: {
      fontSize: 13,
      fontFamily: "Manrope_700Bold",
    },
    receivedGiftMessage: {
      marginTop: 2,
      fontSize: 12.5,
      fontFamily: "Manrope_700Bold",
    },
    receivedGiftTimestamp: {
      marginTop: 2,
      fontSize: 11.5,
      fontFamily: "Manrope_500Medium",
    },
    receivedGiftTypePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    receivedGiftTypeCopy: {
      minWidth: 0,
    },
    receivedGiftTypeText: {
      fontSize: 11.5,
      fontFamily: "Manrope_700Bold",
    },
    receivedGiftTypeHint: {
      marginTop: 1,
      fontSize: 10.5,
      fontFamily: "Manrope_600SemiBold",
    },
    receivedGiftsAction: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    receivedGiftsActionText: {
      fontSize: 12,
      fontFamily: "Manrope_700Bold",
    },
  });
}
