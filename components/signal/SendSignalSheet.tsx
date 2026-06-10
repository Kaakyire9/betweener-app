import SignalIcon from "@/components/icons/SignalIcon";
import BlurViewSafe from "@/components/NativeWrappers/BlurViewSafe";
import LinearGradientSafe from "@/components/NativeWrappers/LinearGradientSafe";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import useSendSignal from "@/hooks/useSendSignal";
import useSignalAccess from "@/hooks/useSignalAccess";
import { getSignalErrorMessage, type SignalSource } from "@/lib/signal/signal-api";
import { getSignalReasonsForProfile, type SignalReason, type SignalReasonKey } from "@/lib/signal/signal-reasons";
import type { Match } from "@/types/match";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from "react-native-reanimated";

type SendSignalSheetProps = {
  visible: boolean;
  receiverProfileId?: string | null;
  receiverName?: string | null;
  match?: Match | null;
  source?: SignalSource;
  sourceMomentId?: string | null;
  onClose: () => void;
  onSent?: (payload: { signalId: string; remainingSignals: number }) => void;
  onPaywall?: () => void;
};

const MAX_NOTE = 120;

export default function SendSignalSheet({
  visible,
  receiverProfileId,
  receiverName,
  match,
  source = "profile",
  sourceMomentId,
  onClose,
  onSent,
  onPaywall,
}: SendSignalSheetProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const isDark = (colorScheme ?? "light") === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const reasons = useMemo(() => getSignalReasonsForProfile(match, source), [match, source]);
  const { access, loading: accessLoading, refresh } = useSignalAccess(visible);
  const { submit, submitting } = useSendSignal();
  const [selectedReason, setSelectedReason] = useState<SignalReasonKey | null>(null);
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState<{ remainingSignals: number } | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelectedReason(null);
    setNote("");
    setSuccess(null);
    void refresh();
  }, [refresh, visible]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const quotaText = access.limit > 0
    ? `${Math.max(access.remaining, 0)} Signal${access.remaining === 1 ? "" : "s"} left this week`
    : "Silver or Gold";

  const handleSend = async () => {
    if (!receiverProfileId) {
      Alert.alert("Signal", "Select a profile to send a Signal.");
      return;
    }
    if (!selectedReason) {
      void Haptics.selectionAsync();
      return;
    }
    if (!access.can_send) {
      onPaywall?.();
      return;
    }

    try {
      const result = await submit({
        receiverProfileId,
        reasonKey: selectedReason,
        note,
        source,
        sourceMomentId,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSent?.({ signalId: result.signal.id, remainingSignals: result.remainingSignals });
      setSuccess({ remainingSignals: result.remainingSignals });
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1450);
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Signal failed", getSignalErrorMessage(error, receiverName));
    }
  };

  const renderReason = (reason: SignalReason) => {
    const selected = selectedReason === reason.key;
    return (
      <TouchableOpacity
        key={reason.key}
        style={[styles.reasonCard, selected && styles.reasonCardSelected]}
        activeOpacity={0.88}
        onPress={() => {
          void Haptics.selectionAsync();
          setSelectedReason(reason.key);
        }}
      >
        <SignalIcon size={22} color={selected ? theme.tint : theme.textMuted} accentColor="#8B5CFF" active={selected} />
        <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{reason.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardWrap}>
          <View style={styles.sheet}>
            <BlurViewSafe
              pointerEvents="none"
              intensity={42}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.handle} />
            <LinearGradientSafe
              pointerEvents="none"
              colors={isDark
                ? ["rgba(19,168,168,0.18)", "rgba(139,92,255,0.10)", "rgba(7,30,34,0)"]
                : ["rgba(19,168,168,0.12)", "rgba(139,92,255,0.08)", "rgba(255,250,244,0)"]}
              style={StyleSheet.absoluteFill}
            />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <View style={styles.header}>
                <View style={styles.iconShell}>
                  <SignalIcon size={30} color={theme.tint} accentColor="#8B5CFF" active />
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.84}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.title}>Send a Signal</Text>
              <Text style={styles.subtitle}>
                {receiverName ? `To ${receiverName}. ` : ""}Choose what stood out.
              </Text>

              <View style={styles.quotaPill}>
                <MaterialCommunityIcons name="timer-sand" size={14} color={theme.tint} />
                <Text style={styles.quotaText}>{accessLoading ? "Checking Signals..." : quotaText}</Text>
              </View>

              <View style={styles.reasons}>{reasons.map(renderReason)}</View>

              <View style={styles.noteBlock}>
                <View style={styles.noteLabelRow}>
                  <Text style={styles.noteLabel}>Small note</Text>
                  <Text style={styles.noteCount}>{note.length}/{MAX_NOTE}</Text>
                </View>
                <TextInput
                  value={note}
                  onChangeText={(value) => setNote(value.slice(0, MAX_NOTE))}
                  placeholder="Add a small note..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  maxLength={MAX_NOTE}
                  style={styles.input}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!selectedReason || submitting || accessLoading || Boolean(success)) && styles.sendButtonDisabled,
                ]}
                activeOpacity={0.9}
                onPress={handleSend}
                disabled={!selectedReason || submitting || accessLoading || Boolean(success)}
              >
                <Text style={styles.sendText}>
                  {submitting ? "Sending..." : access.can_send ? "Send Signal" : "Unlock Signals"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.footer}>Signals are limited and stay visible for 48 hours.</Text>
            </ScrollView>
            {success ? (
              <Animated.View
                pointerEvents="none"
                entering={FadeIn.duration(140)}
                exiting={FadeOut.duration(160)}
                style={styles.successOverlay}
              >
                <Animated.View entering={ZoomIn.duration(360).springify().damping(18)} exiting={ZoomOut.duration(180)} style={styles.successCard}>
                  <LinearGradientSafe
                    pointerEvents="none"
                    colors={isDark
                      ? ["rgba(244,232,208,0.18)", "rgba(19,168,168,0.16)", "rgba(139,92,255,0.10)"]
                      : ["rgba(255,248,236,0.96)", "rgba(222,250,246,0.92)", "rgba(139,92,255,0.10)"]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.successIconShell}>
                    <SignalIcon size={34} color={theme.tint} accentColor="#8B5CFF" active />
                  </View>
                  <Text style={styles.successTitle}>Signal sent</Text>
                  <Text style={styles.successBody}>They&apos;ll see what stood out for 48 hours.</Text>
                  <View style={styles.successPill}>
                    <MaterialCommunityIcons name="timer-sand" size={13} color={theme.tint} />
                    <Text style={styles.successPillText}>
                      {Math.max(success.remainingSignals, 0)} left this week
                    </Text>
                  </View>
                </Animated.View>
              </Animated.View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: isDark ? "rgba(4,10,11,0.58)" : "rgba(31,42,42,0.34)",
    },
    backdropPress: { flex: 1 },
    keyboardWrap: {
      width: "100%",
      justifyContent: "flex-end",
    },
    sheet: {
      maxHeight: "86%",
      overflow: "hidden",
      position: "relative",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: isDark ? "rgba(7,30,34,0.82)" : "rgba(255,250,244,0.9)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(139,92,255,0.24)" : "rgba(15,61,62,0.08)",
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? "rgba(255,255,255,0.24)" : "rgba(15,61,62,0.16)",
      marginTop: 10,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 26 : 18,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    iconShell: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDark ? "rgba(19,168,168,0.24)" : "rgba(19,168,168,0.16)",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.38)",
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.34)",
    },
    title: {
      marginTop: 14,
      color: theme.text,
      fontSize: 28,
      lineHeight: 33,
      fontFamily: "PlayfairDisplay_700Bold",
    },
    subtitle: {
      marginTop: 5,
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Manrope_500Medium",
    },
    quotaPill: {
      marginTop: 14,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? "rgba(19,168,168,0.22)" : "rgba(19,168,168,0.16)",
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.32)",
    },
    quotaText: {
      color: theme.text,
      fontSize: 11.5,
      fontFamily: "Manrope_800ExtraBold",
    },
    reasons: {
      marginTop: 16,
      gap: 10,
    },
    reasonCard: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingHorizontal: 13,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.07)",
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.3)",
    },
    reasonCardSelected: {
      borderColor: isDark ? "rgba(19,168,168,0.45)" : "rgba(19,168,168,0.34)",
      backgroundColor: isDark ? "rgba(19,168,168,0.11)" : "rgba(232,249,246,0.86)",
    },
    reasonText: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      lineHeight: 19,
      fontFamily: "Manrope_700Bold",
    },
    reasonTextSelected: {
      color: isDark ? "#E8FFFC" : "#0F3D3E",
    },
    noteBlock: {
      marginTop: 16,
    },
    noteLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 7,
    },
    noteLabel: {
      color: theme.text,
      fontSize: 12,
      fontFamily: "Manrope_800ExtraBold",
    },
    noteCount: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: "Manrope_600SemiBold",
    },
    input: {
      minHeight: 76,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,61,62,0.08)",
      color: theme.text,
      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.34)",
      paddingHorizontal: 12,
      paddingVertical: 10,
      textAlignVertical: "top",
      fontFamily: "Manrope_500Medium",
      fontSize: 14,
      lineHeight: 19,
    },
    sendButton: {
      marginTop: 16,
      minHeight: 50,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.tint,
    },
    sendButtonDisabled: {
      opacity: 0.58,
    },
    sendText: {
      color: Colors.light.background,
      fontSize: 14,
      fontFamily: "Manrope_800ExtraBold",
    },
    footer: {
      marginTop: 10,
      color: theme.textMuted,
      textAlign: "center",
      fontSize: 11.5,
      lineHeight: 16,
      fontFamily: "Manrope_600SemiBold",
    },
    successOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: isDark ? "rgba(4,15,17,0.58)" : "rgba(255,250,244,0.62)",
    },
    successCard: {
      width: "100%",
      maxWidth: 330,
      overflow: "hidden",
      alignItems: "center",
      borderRadius: 26,
      paddingHorizontal: 22,
      paddingVertical: 24,
      borderWidth: 1,
      borderColor: isDark ? "rgba(244,232,208,0.16)" : "rgba(15,61,62,0.10)",
      backgroundColor: isDark ? "rgba(7,30,34,0.92)" : "rgba(255,250,244,0.96)",
      shadowColor: isDark ? "#13A8A8" : "#0F3D3E",
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
      elevation: 10,
    },
    successIconShell: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: isDark ? "rgba(19,168,168,0.34)" : "rgba(19,168,168,0.20)",
      backgroundColor: isDark ? "rgba(19,168,168,0.10)" : "rgba(255,255,255,0.72)",
    },
    successTitle: {
      marginTop: 14,
      color: theme.text,
      fontSize: 26,
      lineHeight: 31,
      fontFamily: "PlayfairDisplay_700Bold",
      textAlign: "center",
    },
    successBody: {
      marginTop: 6,
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: "Manrope_600SemiBold",
      textAlign: "center",
    },
    successPill: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? "rgba(19,168,168,0.24)" : "rgba(19,168,168,0.16)",
      backgroundColor: isDark ? "rgba(19,168,168,0.08)" : "rgba(255,255,255,0.66)",
    },
    successPillText: {
      color: theme.text,
      fontSize: 11,
      fontFamily: "Manrope_800ExtraBold",
    },
  });
