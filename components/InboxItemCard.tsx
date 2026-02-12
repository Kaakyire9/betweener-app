import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type InboxAction = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
};

type InboxItemCardProps = {
  title: string;
  body: string;
  timeLabel: string;
  avatarUrl?: string | null;
  initials: string;
  isUnread?: boolean;
  isActionRequired?: boolean;
  badgeIcon?: string;
  systemIcon?: string;
  primaryAction?: InboxAction;
  secondaryAction?: InboxAction;
  onPress?: () => void;
};

const InboxItemCard = memo((props: InboxItemCardProps) => {
  const {
    title,
    body,
    timeLabel,
    avatarUrl,
    initials,
    isUnread,
    isActionRequired,
    badgeIcon,
    systemIcon,
    primaryAction,
    secondaryAction,
    onPress,
  } = props;

  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  return (
    <Pressable onPress={onPress} style={[styles.card, isUnread && styles.cardUnread]}>
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {systemIcon ? (
            <View style={styles.systemAvatar}>
              <MaterialCommunityIcons name={systemIcon as any} size={20} color={theme.tint} />
            </View>
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{initials}</Text>
            </View>
          )}
          {isActionRequired ? <View style={styles.actionDot} /> : null}
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.time}>{timeLabel}</Text>
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {body}
          </Text>
        </View>

        <View style={styles.right}>
          {isUnread ? <View style={styles.unreadDot} /> : null}
          {badgeIcon ? (
            <View style={styles.badgeIcon}>
              <MaterialCommunityIcons name={badgeIcon as any} size={16} color={theme.tint} />
            </View>
          ) : null}
        </View>
      </View>

      {primaryAction || secondaryAction ? (
        <View style={styles.actionsRow}>
          {secondaryAction ? (
            <Pressable
              onPress={secondaryAction.onPress}
              style={[styles.button, styles.buttonSecondary]}
              disabled={secondaryAction.disabled}
            >
              <Text style={styles.buttonSecondaryText}>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
          {primaryAction ? (
            <Pressable
              onPress={primaryAction.onPress}
              style={[styles.button, styles.buttonPrimary]}
              disabled={primaryAction.disabled}
            >
              <Text style={styles.buttonPrimaryText}>{primaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

InboxItemCard.displayName = "InboxItemCard";

export default InboxItemCard;

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    card: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)",
      marginBottom: 12,
    },
    cardUnread: {
      borderColor: theme.tint,
      shadowColor: theme.tint,
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatarWrap: {
      width: 44,
      height: 44,
      marginRight: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.background,
    },
    avatarFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)",
    },
    avatarFallbackText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "700",
    },
    systemAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)",
    },
    actionDot: {
      position: "absolute",
      top: -2,
      right: -2,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.tint,
      borderWidth: 1,
      borderColor: theme.background,
    },
    content: {
      flex: 1,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.text,
      flex: 1,
      paddingRight: 8,
    },
    time: {
      fontSize: 11,
      color: theme.textMuted,
    },
    body: {
      marginTop: 6,
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 18,
    },
    right: {
      marginLeft: 10,
      alignItems: "center",
      gap: 6,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.tint,
    },
    badgeIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)",
    },
    actionsRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 12,
    },
    button: {
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    buttonPrimary: {
      backgroundColor: theme.tint,
    },
    buttonPrimaryText: {
      color: Colors.light.background,
      fontWeight: "700",
      fontSize: 12,
    },
    buttonSecondary: {
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.12)",
    },
    buttonSecondaryText: {
      color: theme.text,
      fontWeight: "600",
      fontSize: 12,
    },
  });
