import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { Motion } from "@/lib/motion";
import { subscribeToNetworkRestored } from "@/lib/network-recovery";
import {
  clearSupportDraft,
  readSupportDraft,
  writeSupportDraft,
  type SupportDraft,
} from "@/lib/offline/support-draft-store";
import { TRUST_LINKS, openExternalUrl, openSupportEmail } from "@/lib/trust-links";
import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from "@react-native-community/netinfo";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SUPPORT_TOPICS = [
  {
    id: "account",
    icon: "account-cog-outline",
    title: "Account and access",
    body: "Help with login, email changes, onboarding issues, or a stuck verification step.",
  },
  {
    id: "safety",
    icon: "shield-alert-outline",
    title: "Safety and reporting",
    body: "For harmful behavior, suspicious activity, blocking, and moderation-related concerns.",
  },
  {
    id: "premium",
    icon: "crown-outline",
    title: "Premium and billing",
    body: "Support for upcoming subscription plans, boosts, and premium member benefits.",
  },
] as const;

const SUPPORT_DRAFT_EMPTY: SupportDraft = {
  topicId: SUPPORT_TOPICS[0]?.id ?? "account",
  subject: "",
  body: "",
  queued: false,
  updatedAt: "",
};

const buildSupportDraftSubject = (topicTitle: string, fullName?: string | null) =>
  `Betweener support request${topicTitle ? ` • ${topicTitle}` : ""}${fullName ? ` • ${fullName}` : ""}`;

const buildSupportDraftBody = ({
  body,
  topicTitle,
  fullName,
  userId,
}: {
  body: string;
  topicTitle: string;
  fullName?: string | null;
  userId?: string | null;
}) => {
  const lines = [
    "Hello Betweener team,",
    "",
    `Topic: ${topicTitle}`,
    fullName ? `Member: ${fullName}` : null,
    userId ? `User ID: ${userId}` : null,
    "",
    body.trim(),
  ].filter(Boolean);
  return lines.join("%0D%0A");
};

export default function SupportCenterScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = createStyles(theme, isDark);
  const { user, profile } = useAuth();
  const draftOwnerId = user?.id ?? null;
  const [draft, setDraft] = useState<SupportDraft>(SUPPORT_DRAFT_EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [networkReady, setNetworkReady] = useState(true);
  const [restoreNoticeVisible, setRestoreNoticeVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const [storedDraft, netState] = await Promise.all([
        readSupportDraft(draftOwnerId),
        fetchNetInfo().catch(() => null),
      ]);
      if (cancelled) return;
      if (storedDraft) {
        setDraft(storedDraft);
      } else {
        setDraft(SUPPORT_DRAFT_EMPTY);
      }
      setNetworkReady(netState?.isConnected !== false && netState?.isInternetReachable !== false);
      setHydrated(true);
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [draftOwnerId]);

  useEffect(() => {
    const unsubscribeNetInfo = addNetInfoListener((state) => {
      const ready = state.isConnected !== false && state.isInternetReachable !== false;
      setNetworkReady(ready);
    });

    const unsubscribeRestored = subscribeToNetworkRestored(() => {
      setNetworkReady(true);
      setRestoreNoticeVisible(true);
    });

    return () => {
      unsubscribeNetInfo();
      unsubscribeRestored();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!draft.queued || !networkReady) {
      setRestoreNoticeVisible(false);
      return;
    }
    setRestoreNoticeVisible(true);
  }, [draft.queued, hydrated, networkReady]);

  const selectedTopic = useMemo(
    () => SUPPORT_TOPICS.find((topic) => topic.id === draft.topicId) ?? SUPPORT_TOPICS[0],
    [draft.topicId],
  );

  const persistDraft = async (next: SupportDraft) => {
    setDraft(next);
    await writeSupportDraft(draftOwnerId, next);
  };

  const updateDraft = async (patch: Partial<SupportDraft>) => {
    const next: SupportDraft = {
      ...draft,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await persistDraft(next);
  };

  const sendDraft = async () => {
    if (!selectedTopic) return;
    const trimmedBody = draft.body.trim();
    if (!trimmedBody) {
      Alert.alert("Support request", "Write a short summary before sending this support request.");
      return;
    }

    const subject =
      draft.subject.trim() ||
      buildSupportDraftSubject(selectedTopic.title, profile?.full_name || user?.email || null);
    const body = buildSupportDraftBody({
      body: trimmedBody,
      topicTitle: selectedTopic.title,
      fullName: profile?.full_name || user?.email || null,
      userId: user?.id ?? null,
    });

    await openSupportEmail(subject, body);
    await persistDraft({
      ...draft,
      subject,
      queued: false,
      updatedAt: new Date().toISOString(),
    });
    setRestoreNoticeVisible(false);
  };

  const queueDraftOffline = async () => {
    if (!selectedTopic) return;
    const trimmedBody = draft.body.trim();
    if (!trimmedBody) {
      Alert.alert("Support request", "Write a short summary before saving this request offline.");
      return;
    }
    const nextSubject =
      draft.subject.trim() ||
      buildSupportDraftSubject(selectedTopic.title, profile?.full_name || user?.email || null);
    await persistDraft({
      ...draft,
      subject: nextSubject,
      queued: true,
      updatedAt: new Date().toISOString(),
    });
    Alert.alert("Saved offline", "Your support request is saved on this device. Send it when the network returns.");
  };

  const clearDraft = async () => {
    await clearSupportDraft(draftOwnerId);
    setDraft(SUPPORT_DRAFT_EMPTY);
    setRestoreNoticeVisible(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.accent, isDark ? 0.24 : 0.14), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGlow}
      />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(Motion.duration.slow)}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={theme.text} />
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>

            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Help & Support</Text>
              <Text style={styles.heroTitle}>Premium member support starts with clarity and fast next steps</Text>
              <Text style={styles.heroBody}>
                Give members one trusted place to resolve product issues, ask about billing, or escalate safety concerns without friction.
              </Text>
              <View style={styles.heroActions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => void (networkReady ? sendDraft() : queueDraftOffline())}
                >
                  <MaterialCommunityIcons name="email-fast-outline" size={18} color={Colors.light.background} />
                  <Text style={styles.primaryButtonText}>{networkReady ? "Send support request" : "Save request offline"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => router.push("/trust-center")}>
                  <Text style={styles.secondaryButtonText}>Open Trust Center</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(40).duration(Motion.duration.slow)} style={styles.section}>
            <View style={styles.draftCard}>
              <View style={styles.draftHeader}>
                <View style={styles.draftHeaderCopy}>
                  <Text style={styles.draftEyebrow}>Support draft</Text>
                  <Text style={styles.draftTitle}>Write once, send when the network is ready.</Text>
                </View>
                <View
                  style={[
                    styles.draftStatusPill,
                    restoreNoticeVisible
                      ? styles.draftStatusPillReady
                      : networkReady
                        ? styles.draftStatusPillOnline
                        : styles.draftStatusPillOffline,
                  ]}
                >
                  <Text
                    style={[
                      styles.draftStatusText,
                      restoreNoticeVisible
                        ? styles.draftStatusTextReady
                        : networkReady
                          ? styles.draftStatusTextOnline
                          : styles.draftStatusTextOffline,
                    ]}
                  >
                    {restoreNoticeVisible
                      ? "Ready to send"
                      : networkReady
                        ? "Online"
                        : "Offline"}
                  </Text>
                </View>
              </View>

              {restoreNoticeVisible ? (
                <View style={styles.restoreNotice}>
                  <MaterialCommunityIcons name="wifi-check" size={16} color={theme.tint} />
                  <Text style={styles.restoreNoticeText}>
                    Network restored. Your saved support draft is ready to send.
                  </Text>
                </View>
              ) : null}

              <View style={styles.topicRow}>
                {SUPPORT_TOPICS.map((topic) => {
                  const selected = topic.id === draft.topicId;
                  return (
                    <Pressable
                      key={topic.id}
                      style={[styles.topicPill, selected && styles.topicPillSelected]}
                      onPress={() => void updateDraft({ topicId: topic.id })}
                    >
                      <Text style={[styles.topicPillText, selected && styles.topicPillTextSelected]}>
                        {topic.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={draft.subject}
                onChangeText={(subject) => void updateDraft({ subject })}
                placeholder="Subject"
                placeholderTextColor={withAlpha(theme.textMuted, 0.7)}
                style={styles.input}
              />
              <TextInput
                value={draft.body}
                onChangeText={(body) => void updateDraft({ body })}
                placeholder="Describe what happened, what you expected, and what device/account you are using."
                placeholderTextColor={withAlpha(theme.textMuted, 0.7)}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.textArea]}
              />

              <View style={styles.draftActions}>
                <Pressable
                  style={[styles.secondaryButton, styles.draftActionSecondary]}
                  onPress={() => void clearDraft()}
                >
                  <Text style={styles.secondaryButtonText}>Clear draft</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, styles.draftActionPrimary]}
                  onPress={() => void (networkReady ? sendDraft() : queueDraftOffline())}
                >
                  <Text style={styles.primaryButtonText}>
                    {networkReady ? "Send draft" : draft.queued ? "Saved for later" : "Save for later"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(70).duration(Motion.duration.slow)} style={styles.section}>
            {SUPPORT_TOPICS.map((topic) => (
              <View key={topic.id} style={styles.topicCard}>
                <View style={styles.topicIcon}>
                  <MaterialCommunityIcons name={topic.icon} size={18} color={theme.tint} />
                </View>
                <View style={styles.topicCopy}>
                  <Text style={styles.topicTitle}>{topic.title}</Text>
                  <Text style={styles.topicBody}>{topic.body}</Text>
                </View>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(Motion.duration.slow)} style={styles.section}>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Support channels</Text>
              <Pressable style={styles.linkRow} onPress={() => void openSupportEmail("Betweener support")}>
                <View>
                  <Text style={styles.linkTitle}>Email</Text>
                  <Text style={styles.linkBody}>{TRUST_LINKS.supportEmail}</Text>
                </View>
                <MaterialCommunityIcons name="arrow-top-right" size={18} color={theme.textMuted} />
              </Pressable>
              <Pressable style={styles.linkRow} onPress={() => void openExternalUrl(TRUST_LINKS.supportSite)}>
                <View>
                  <Text style={styles.linkTitle}>Support page</Text>
                  <Text style={styles.linkBody}>Status notes, help articles, and premium member updates</Text>
                </View>
                <MaterialCommunityIcons name="open-in-new" size={18} color={theme.textMuted} />
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    safeArea: { flex: 1 },
    bgGlow: {
      position: "absolute",
      top: -100,
      right: -90,
      width: 260,
      height: 260,
      borderRadius: 260,
    },
    content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 18 },
    backButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
      marginBottom: 14,
    },
    backLabel: { color: theme.text, fontSize: 12, fontWeight: "600" },
    heroCard: {
      borderRadius: 24,
      padding: 20,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.74),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    heroEyebrow: { color: theme.tint, fontSize: 11, fontFamily: "Archivo_700Bold", letterSpacing: 0.6, textTransform: "uppercase" },
    heroTitle: {
      color: theme.text,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: "PlayfairDisplay_700Bold",
    },
    heroBody: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 21,
      fontFamily: "Manrope_500Medium",
    },
    heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
    draftCard: {
      borderRadius: 22,
      padding: 16,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.32 : 0.78),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
    },
    draftHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    draftHeaderCopy: { flex: 1, gap: 4 },
    draftEyebrow: {
      color: theme.tint,
      fontSize: 10,
      fontFamily: "Archivo_700Bold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    draftTitle: {
      color: theme.text,
      fontSize: 16,
      lineHeight: 22,
      fontFamily: "Archivo_700Bold",
    },
    draftStatusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
    },
    draftStatusPillOnline: {
      borderColor: withAlpha(theme.tint, 0.3),
      backgroundColor: withAlpha(theme.tint, 0.12),
    },
    draftStatusPillOffline: {
      borderColor: withAlpha(theme.accent, 0.3),
      backgroundColor: withAlpha(theme.accent, 0.12),
    },
    draftStatusPillReady: {
      borderColor: withAlpha(theme.secondary, 0.38),
      backgroundColor: withAlpha(theme.secondary, 0.16),
    },
    draftStatusText: {
      fontSize: 10.5,
      fontFamily: "Manrope_800ExtraBold",
      letterSpacing: 0.3,
    },
    draftStatusTextOnline: { color: theme.tint },
    draftStatusTextOffline: { color: theme.accent },
    draftStatusTextReady: { color: theme.secondary },
    restoreNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.18),
    },
    restoreNoticeText: {
      flex: 1,
      color: theme.text,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "Manrope_500Medium",
    },
    topicRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    topicPill: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.9),
    },
    topicPillSelected: {
      borderColor: withAlpha(theme.tint, 0.28),
      backgroundColor: withAlpha(theme.tint, 0.14),
    },
    topicPillText: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
    },
    topicPillTextSelected: {
      color: theme.text,
    },
    input: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.text,
      fontSize: 13,
      fontFamily: "Manrope_500Medium",
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.96),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    textArea: {
      minHeight: 120,
    },
    draftActions: {
      flexDirection: "row",
      gap: 10,
    },
    draftActionSecondary: {
      flex: 0.9,
      justifyContent: "center",
      alignItems: "center",
    },
    draftActionPrimary: {
      flex: 1.3,
      justifyContent: "center",
      alignItems: "center",
    },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    primaryButtonText: { color: Colors.light.background, fontSize: 12, fontWeight: "700" },
    secondaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
    },
    secondaryButtonText: { color: theme.text, fontSize: 12, fontWeight: "600" },
    section: { gap: 10 },
    topicCard: {
      flexDirection: "row",
      gap: 12,
      padding: 16,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    topicIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    topicCopy: { flex: 1, gap: 4 },
    topicTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    topicBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    panel: {
      borderRadius: 18,
      padding: 16,
      gap: 8,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    panelTitle: { color: theme.text, fontSize: 18, fontFamily: "Archivo_700Bold", marginBottom: 6 },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 10,
    },
    linkTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    linkBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium", marginTop: 4 },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};
