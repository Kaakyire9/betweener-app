import { Colors } from "@/constants/theme";
import SignalIcon from "@/components/icons/SignalIcon";
import { getSafeRemoteImageUri, getUserFacingDisplayName, hasLeftBetweener } from "@/lib/profile/display-name";
import { getProfileInitials, getProfilePlaceholderPalette } from "@/lib/profile-placeholders";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type ReceivedSignal = {
  id: string;
  sender_profile_id: string;
  receiver_profile_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  reason_key: string;
  reason_label: string;
  note: string | null;
  source: string;
  status: "sent" | "seen" | "responded" | "expired" | "dismissed" | string;
  expires_at: string;
  seen_at: string | null;
  created_at: string;
};

export type SignalProfileSnippet = {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  account_state?: string | null;
  deleted_at?: string | null;
  avatar_url?: string | null;
  photos?: string[] | null;
  age?: number | null;
  location?: string | null;
  city?: string | null;
  region?: string | null;
  verification_level?: number | null;
};

type Props = {
  signal: ReceivedSignal;
  sender?: SignalProfileSnippet;
  variant?: "received" | "sent";
  theme: typeof Colors.light;
  isDark: boolean;
  reduceMotion: boolean;
  onViewProfile: () => void;
  onAccept?: () => void;
  onDismiss: () => void;
};

const getSignalCountdown = (expiresAt?: string | null) => {
  if (!expiresAt) return "48h priority";
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return "48h priority";
  const hours = Math.max(0, (ts - Date.now()) / 3600000);
  if (hours <= 0) return "Expired";
  if (hours < 1) return "Ending soon";
  return `${Math.ceil(hours)}h left`;
};

const getSignalHoursLeft = (expiresAt?: string | null) => {
  if (!expiresAt) return null;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, (ts - Date.now()) / 3600000);
};

const getSourceLabel = (source?: string | null) => {
  switch (source) {
    case "moment":
      return "Moment Signal";
    case "vibes_card":
      return "Vibes Signal";
    case "intent":
      return "Intent Signal";
    default:
      return "Profile Signal";
  }
};

export default function SignalReceivedCard({
  signal,
  sender,
  variant = "received",
  theme,
  isDark,
  reduceMotion,
  onViewProfile,
  onAccept,
  onDismiss,
}: Props) {
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const senderName = getUserFacingDisplayName(sender, "Someone");
  const senderHasLeft = hasLeftBetweener(sender);
  const nameLine = `${senderName}${typeof sender?.age === "number" ? `, ${sender.age}` : ""}`;
  const location = sender?.city || sender?.region || sender?.location || "Location hidden";
  const photos = Array.isArray(sender?.photos) ? sender?.photos.filter(Boolean) : [];
  const avatarUri =
    getSafeRemoteImageUri(sender?.avatar_url) ??
    (photos.map((photo) => getSafeRemoteImageUri(photo)).filter(Boolean)[0] as string | undefined) ??
    null;
  const palette = getProfilePlaceholderPalette(sender?.id || senderName);
  const initials = getProfileInitials(senderName);
  const countdown = getSignalCountdown(signal.expires_at);
  const hoursLeft = getSignalHoursLeft(signal.expires_at);
  const sourceLabel = getSourceLabel(signal.source);
  const isNew = signal.status === "sent" && !signal.seen_at;
  const isSent = variant === "sent";
  const isExpired = signal.status === "expired" || (hoursLeft !== null && hoursLeft <= 0);
  const receiptLabel = isSent ? "Your Signal receipt" : "Signal receipt";
  const noteLabel = isSent ? "Your note" : "Personal note";
  const sentLifecycle = isSent
    ? isExpired
      ? { label: "Expired quietly", body: "The 48-hour window closed with no pressure.", icon: "weather-night" as const }
      : hoursLeft !== null && hoursLeft <= 6
      ? { label: "Ending soon", body: "Their response window is closing.", icon: "timer-alert-outline" as const }
      : signal.seen_at || signal.status === "seen"
        ? { label: "Seen", body: "They opened your Signal.", icon: "eye-check-outline" as const }
        : { label: "Delivered", body: "Waiting for their decision.", icon: "send-check-outline" as const }
    : null;

  return (
    <View style={styles.shell}>
      <View pointerEvents="none" style={styles.tealGlow} />
      <View pointerEvents="none" style={styles.purpleGlow} />
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(19,168,168,0.16)", "rgba(7,30,34,0.78)", "rgba(7,30,34,0.96)"]
            : ["rgba(19,168,168,0.16)", "rgba(255,255,255,0.88)", "rgba(255,250,245,0.98)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.topRow}>
        <View style={styles.iconPlate}>
          <SignalIcon size={28} color={theme.tint} accentColor={theme.accent} active />
        </View>
        <View style={styles.titleWrap}>
          <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>{isSent ? (isExpired ? "Signal closed" : "Signal sent") : isNew ? "New Signal" : "Signal received"}</Text>
            <View style={styles.sourcePill}>
              <Text style={styles.sourceText}>{sourceLabel}</Text>
            </View>
          </View>
          <Text style={styles.title}>{isSent ? (isExpired ? "Signal expired quietly." : "You noticed what stood out.") : "Someone noticed what stood out."}</Text>
          {sentLifecycle ? (
            <View style={styles.lifecycleRow}>
              <MaterialCommunityIcons name={sentLifecycle.icon} size={13} color={theme.tint} />
              <Text style={styles.lifecycleText} numberOfLines={1}>
                {sentLifecycle.label} · {sentLifecycle.body}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.countdownPill}>
          <MaterialCommunityIcons name="timer-sand" size={13} color={theme.accent} />
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      </View>

      <View style={styles.profileRow}>
        <TouchableOpacity activeOpacity={0.9} onPress={onViewProfile} style={styles.photoFrame}>
          {avatarUri ? (
            <ExpoImage source={{ uri: avatarUri }} style={styles.photo} contentFit="cover" contentPosition="top center" />
          ) : (
            <LinearGradient colors={[palette.start, palette.end]} style={styles.photoFallback}>
              <Text style={styles.photoInitials}>{initials}</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>

        <View style={styles.profileCopy}>
          <Text style={styles.name} numberOfLines={1}>
            {nameLine}
          </Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name={senderHasLeft ? "account-off-outline" : "map-marker"} size={13} color={theme.textMuted} />
            <Text style={[styles.meta, senderHasLeft && styles.metaWarning]} numberOfLines={1}>
              {senderHasLeft ? "No longer on Betweener" : location}
            </Text>
          </View>

          <View style={styles.receiptPanel}>
            <View style={styles.receiptHeader}>
              <SignalIcon size={15} color={theme.tint} accentColor={theme.accent} active />
              <Text style={styles.receiptLabel}>{receiptLabel}</Text>
            </View>
            <Text style={styles.reasonText} numberOfLines={2}>
              {signal.reason_label}
            </Text>
            <View style={styles.noteDivider} />
            {signal.note ? (
              <View style={styles.noteBlock}>
                <Text style={styles.noteLabel}>{noteLabel}</Text>
                <Text style={styles.note} numberOfLines={3}>
                  "{signal.note}"
                </Text>
              </View>
            ) : (
              <Text style={styles.noteMuted} numberOfLines={2}>
                Limited, intentional, and visible for 48 hours.
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          activeOpacity={reduceMotion ? 0.9 : 0.82}
          onPress={isSent ? onViewProfile : onAccept ?? onViewProfile}
          style={styles.primaryAction}
          accessibilityRole="button"
          accessibilityLabel={isSent ? `View ${senderName}'s profile` : `Accept ${senderName}'s Signal and unlock chemistry`}
        >
          <LinearGradient
            colors={isDark ? ["#F4E8D0", "#9AE7DE", "#13A8A8"] : ["#FFF8EC", "#BCEFE8", "#13A8A8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryActionFill}
          >
            <MaterialCommunityIcons name={isSent ? "account-eye-outline" : "check-decagram-outline"} size={17} color="#071E22" />
            <View style={styles.primaryCopy}>
              <Text style={styles.primaryText}>{isSent ? "View profile" : "Accept"}</Text>
              <Text style={styles.primaryHint} numberOfLines={1}>
                {isSent ? (isExpired ? "Closure saved" : "Signal active") : "Unlock chemistry"}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        {!isSent ? (
          <>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={onDismiss}
              style={styles.secondaryAction}
              accessibilityRole="button"
              accessibilityLabel={`Pass on ${senderName}'s Signal`}
            >
              <Text style={styles.secondaryText}>Pass</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={onViewProfile}
              style={styles.secondaryAction}
              accessibilityRole="button"
              accessibilityLabel={`View ${senderName}'s profile`}
            >
              <Text style={styles.secondaryText}>Profile</Text>
            </TouchableOpacity>
          </>
        ) : null}
        {isSent ? (
          <TouchableOpacity
            activeOpacity={0.72}
            onPress={onDismiss}
            style={styles.dismissAction}
            accessibilityRole="button"
            accessibilityLabel={isExpired ? `Hide expired Signal to ${senderName}` : `Cancel Signal to ${senderName}`}
          >
            <MaterialCommunityIcons name="close-circle-outline" size={15} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    shell: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 26,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? "rgba(244,232,208,0.12)" : "rgba(15,61,62,0.12)",
      backgroundColor: isDark ? "rgba(7,30,34,0.90)" : "rgba(255,250,245,0.96)",
      shadowColor: isDark ? "#13A8A8" : "#0F3D3E",
      shadowOpacity: isDark ? 0.18 : 0.10,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 7,
    },
    tealGlow: {
      position: "absolute",
      top: -78,
      left: -54,
      width: 168,
      height: 168,
      borderRadius: 84,
      backgroundColor: theme.tint,
      opacity: isDark ? 0.16 : 0.10,
    },
    purpleGlow: {
      position: "absolute",
      right: -72,
      bottom: -84,
      width: 184,
      height: 184,
      borderRadius: 92,
      backgroundColor: theme.accent,
      opacity: isDark ? 0.13 : 0.08,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    iconPlate: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,61,62,0.10)",
      backgroundColor: isDark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.66)",
    },
    titleWrap: { flex: 1, gap: 4, paddingTop: 1 },
    eyebrowRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
    eyebrow: {
      fontSize: 10,
      letterSpacing: 1.5,
      color: theme.tint,
      fontWeight: "900",
      textTransform: "uppercase",
    },
    sourcePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? "rgba(139,92,255,0.22)" : "rgba(124,92,255,0.16)",
      backgroundColor: isDark ? "rgba(139,92,255,0.10)" : "rgba(124,92,255,0.07)",
    },
    sourceText: { fontSize: 10, fontWeight: "800", color: theme.accent },
    title: {
      fontSize: 16,
      lineHeight: 21,
      color: theme.text,
      fontWeight: "800",
    },
    lifecycleRow: {
      marginTop: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    lifecycleText: {
      flex: 1,
      color: theme.textMuted,
      fontSize: 10.5,
      lineHeight: 14,
      fontWeight: "800",
    },
    countdownPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.64)",
    },
    countdownText: { fontSize: 10, fontWeight: "900", color: theme.accent },
    profileRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginTop: 14,
    },
    photoFrame: {
      width: 92,
      height: 118,
      borderRadius: 21,
      padding: 3,
      borderWidth: 1,
      borderColor: isDark ? "rgba(244,232,208,0.22)" : "rgba(15,61,62,0.10)",
      backgroundColor: isDark ? "rgba(244,232,208,0.08)" : "rgba(255,255,255,0.76)",
      overflow: "hidden",
    },
    photo: {
      width: "100%",
      height: "100%",
      borderRadius: 18,
      backgroundColor: theme.backgroundSubtle,
    },
    photoFallback: {
      width: "100%",
      height: "100%",
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    photoInitials: {
      color: Colors.light.background,
      fontSize: 22,
      fontFamily: "PlayfairDisplay_700Bold",
    },
    profileCopy: {
      flex: 1,
      gap: 6,
      paddingVertical: 2,
    },
    name: {
      fontSize: 19,
      lineHeight: 23,
      color: theme.text,
      fontWeight: "800",
    },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    meta: { flex: 1, fontSize: 12, color: theme.textMuted, fontWeight: "700" },
    metaWarning: { color: isDark ? "#D6C0AA" : "#8E735A" },
    receiptPanel: {
      marginTop: 2,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? "rgba(244,232,208,0.11)" : "rgba(15,61,62,0.08)",
      backgroundColor: isDark ? "rgba(255,246,236,0.045)" : "rgba(255,255,255,0.58)",
      gap: 5,
    },
    receiptHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    receiptLabel: {
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 1.15,
      color: theme.tint,
      fontWeight: "900",
      textTransform: "uppercase",
    },
    reasonText: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "900",
      color: theme.text,
    },
    noteDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? "rgba(244,232,208,0.12)" : "rgba(15,61,62,0.08)",
      marginVertical: 1,
    },
    noteBlock: {
      gap: 2,
    },
    noteLabel: {
      fontSize: 9,
      lineHeight: 11,
      letterSpacing: 0.8,
      color: theme.textMuted,
      fontWeight: "900",
      textTransform: "uppercase",
    },
    note: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.text,
      fontWeight: "700",
    },
    noteMuted: {
      fontSize: 11,
      lineHeight: 15,
      color: theme.textMuted,
      fontWeight: "700",
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 14,
    },
    primaryAction: {
      flexGrow: 1,
      minHeight: 46,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: theme.tint,
      shadowColor: isDark ? "#F4E8D0" : theme.tint,
      shadowOpacity: isDark ? 0.20 : 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    primaryActionFill: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 13,
      paddingVertical: 6,
    },
    primaryCopy: {
      alignItems: "flex-start",
      justifyContent: "center",
    },
    primaryText: { color: "#071E22", fontSize: 13, lineHeight: 15, fontWeight: "900" },
    primaryHint: { color: "rgba(7,30,34,0.70)", fontSize: 9, lineHeight: 11, fontWeight: "900" },
    secondaryAction: {
      minHeight: 44,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: isDark ? "rgba(244,232,208,0.10)" : "rgba(15,61,62,0.08)",
      backgroundColor: isDark ? "rgba(255,246,236,0.035)" : "rgba(255,255,255,0.66)",
    },
    secondaryText: { color: theme.text, fontSize: 12, fontWeight: "800" },
    dismissAction: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(15,61,62,0.07)",
      backgroundColor: isDark ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.52)",
    },
  });
