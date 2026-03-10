import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { canAccessAdminTools } from "@/lib/internal-tools";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Overview = {
  pending_verifications: number;
  rejected_unread: number;
  open_reports: number;
  active_subscriptions: number;
  silver_active: number;
  gold_active: number;
  members_total: number;
  members_last_7d: number;
};

type VerificationRow = {
  id: string;
  user_id: string | null;
  profile_id: string | null;
  verification_type: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  auto_verification_score: number | null;
  document_url: string | null;
  full_name: string | null;
  current_country: string | null;
  avatar_url: string | null;
  verification_level: number | null;
};

type ReportRow = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter_user_id: string;
  reported_user_id: string;
  reporter_name: string | null;
  reporter_avatar: string | null;
  reporter_verification_level: number | null;
  reported_name: string | null;
  reported_avatar: string | null;
  reported_verification_level: number | null;
};

const EMPTY_OVERVIEW: Overview = {
  pending_verifications: 0,
  rejected_unread: 0,
  open_reports: 0,
  active_subscriptions: 0,
  silver_active: 0,
  gold_active: 0,
  members_total: 0,
  members_last_7d: 0,
};

export const AdminVerificationDashboard = () => {
  const { user } = useAuth();
  const isAllowed = canAccessAdminTools(user?.email ?? null);
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVerification, setSelectedVerification] = useState<VerificationRow | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"verification" | "reports">("verification");

  const loadSignedUrls = useCallback(async (rows: VerificationRow[]) => {
    const nextMap: Record<string, string> = {};
    for (const item of rows) {
      if (!item.document_url) continue;
      const { data, error: storageError } = await supabase.storage
        .from("verification-docs")
        .createSignedUrl(item.document_url, 3600);
      if (!storageError && data?.signedUrl) {
        nextMap[item.id] = data.signedUrl;
      }
    }
    setDocumentUrls(nextMap);
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!isAllowed) {
      setLoading(false);
      return;
    }

    setError(null);
    const [overviewRes, verificationRes, reportsRes] = await Promise.all([
      supabase.rpc("rpc_admin_dashboard_overview"),
      supabase.rpc("rpc_admin_get_verification_queue"),
      supabase.rpc("rpc_admin_get_reports_queue"),
    ]);

    const firstError = overviewRes.error || verificationRes.error || reportsRes.error;
    if (firstError) {
      setError(firstError.message || "Unable to load the admin dashboard.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const overviewData = (overviewRes.data as Overview | null) ?? EMPTY_OVERVIEW;
    const verificationData = (verificationRes.data as VerificationRow[] | null) ?? [];
    const reportsData = (reportsRes.data as ReportRow[] | null) ?? [];

    setOverview({
      ...EMPTY_OVERVIEW,
      ...overviewData,
    });
    setVerifications(verificationData);
    setReports(reportsData);
    await loadSignedUrls(verificationData);
    setLoading(false);
    setRefreshing(false);
  }, [isAllowed, loadSignedUrls]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDashboard();
  }, [loadDashboard]);

  const handleVerificationDecision = useCallback(
    async (item: VerificationRow, decision: "approved" | "rejected") => {
      const actionLabel = decision === "approved" ? "approve" : "reject";
      Alert.alert(
        decision === "approved" ? "Approve verification" : "Reject verification",
        `Are you sure you want to ${actionLabel} ${item.full_name || "this member"}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: decision === "approved" ? "Approve" : "Reject",
            style: decision === "approved" ? "default" : "destructive",
            onPress: async () => {
              const defaultNote =
                decision === "approved"
                  ? "Approved by internal review."
                  : "Rejected by internal review. Please resubmit with clearer documentation.";
              const { data, error: rpcError } = await supabase.rpc("rpc_admin_review_verification_request", {
                p_request_id: item.id,
                p_decision: decision,
                p_notes: defaultNote,
              });
              if (rpcError || !data) {
                Alert.alert("Admin action failed", rpcError?.message || "Unable to update verification.");
                return;
              }
              void loadDashboard();
            },
          },
        ]
      );
    },
    [loadDashboard]
  );

  const handleReportStatus = useCallback(
    async (item: ReportRow, status: "REVIEWING" | "RESOLVED" | "DISMISSED") => {
      const { data, error: rpcError } = await supabase.rpc("rpc_admin_update_report_status", {
        p_report_id: item.id,
        p_status: status,
      });
      if (rpcError || !data) {
        Alert.alert("Admin action failed", rpcError?.message || "Unable to update report.");
        return;
      }
      void loadDashboard();
    },
    [loadDashboard]
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.centerTitle}>Loading internal dashboard...</Text>
        <Text style={styles.centerBody}>Pulling verification, reports, and premium membership signals.</Text>
      </View>
    );
  }

  if (!isAllowed) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.centerTitle}>Internal tools disabled</Text>
        <Text style={styles.centerBody}>This build does not expose admin operations.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.centerTitle}>Admin dashboard unavailable</Text>
        <Text style={styles.centerBody}>{error}</Text>
        <Text style={styles.centerHint}>
          Confirm your account exists in `public.internal_admins` and the new admin migration has been applied.
        </Text>
        <Pressable style={styles.retryButton} onPress={onRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const pendingVerifications = verifications.filter((item) => item.status === "pending");
  const activeReports = reports.filter((item) => ["PENDING", "REVIEWING"].includes((item.status || "").toUpperCase()));

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Internal Operations</Text>
          </View>
          <Text style={styles.heroTitle}>Moderation, verification, and premium health in one place</Text>
          <Text style={styles.heroBody}>
            This dashboard is designed for review speed, trust oversight, and launch-quality operational visibility.
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          {[
            { label: "Pending verification", value: overview.pending_verifications, icon: "shield-account-outline" },
            { label: "Open reports", value: overview.open_reports, icon: "flag-outline" },
            { label: "Active subscriptions", value: overview.active_subscriptions, icon: "crown-outline" },
            { label: "Members", value: overview.members_total, icon: "account-group-outline" },
            { label: "New in 7 days", value: overview.members_last_7d, icon: "chart-line" },
            { label: "Unread rejections", value: overview.rejected_unread, icon: "bell-alert-outline" },
          ].map((metric) => (
            <View key={metric.label} style={styles.metricCard}>
              <View style={styles.metricIcon}>
                <MaterialCommunityIcons name={metric.icon as any} size={18} color={theme.tint} />
              </View>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Premium footprint</Text>
          <View style={styles.planRow}>
            <View style={styles.planPill}>
              <Text style={styles.planPillLabel}>Silver</Text>
              <Text style={styles.planPillValue}>{overview.silver_active}</Text>
            </View>
            <View style={styles.planPill}>
              <Text style={styles.planPillLabel}>Gold</Text>
              <Text style={styles.planPillValue}>{overview.gold_active}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabRow}>
          {[
            { key: "verification", label: `Verification (${pendingVerifications.length})` },
            { key: "reports", label: `Reports (${activeReports.length})` },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key as "verification" | "reports")}
              >
                <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === "verification" ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Verification queue</Text>
            {verifications.length === 0 ? (
              <Text style={styles.emptyText}>No verification requests are waiting right now.</Text>
            ) : (
              verifications.map((item) => {
                const documentUrl = documentUrls[item.id];
                const statusTone =
                  item.status === "approved" ? styles.statusApproved : item.status === "rejected" ? styles.statusRejected : styles.statusPending;
                return (
                  <View key={item.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.identityRow}>
                        <View style={styles.avatarWrap}>
                          {item.avatar_url ? (
                            <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
                          ) : (
                            <MaterialCommunityIcons name="account-circle-outline" size={26} color={theme.textMuted} />
                          )}
                        </View>
                        <View style={styles.identityCopy}>
                          <Text style={styles.identityName}>{item.full_name || "Unknown member"}</Text>
                          <Text style={styles.identityMeta}>
                            {(item.current_country || "Unknown country") + " • " + item.verification_type.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.statusPill, statusTone]}>
                        <Text style={styles.statusPillText}>{item.status}</Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>
                        Auto score: {typeof item.auto_verification_score === "number" ? `${Math.round(item.auto_verification_score * 100)}%` : "N/A"}
                      </Text>
                      <Text style={styles.metaText}>
                        Submitted: {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : "Unknown"}
                      </Text>
                    </View>

                    {item.reviewer_notes ? <Text style={styles.reviewerNote}>{item.reviewer_notes}</Text> : null}

                    <View style={styles.documentCard}>
                      <Pressable
                        style={styles.documentPreview}
                        onPress={() => {
                          setSelectedVerification(item);
                          setImageModalVisible(true);
                        }}
                      >
                        {documentUrl ? (
                          <Image source={{ uri: documentUrl }} style={styles.documentImage} />
                        ) : (
                          <View style={[styles.documentImage, styles.documentPlaceholder]}>
                            <Text style={styles.documentPlaceholderText}>Document preview unavailable</Text>
                          </View>
                        )}
                      </Pressable>
                    </View>

                    {item.status === "pending" ? (
                      <View style={styles.actionRow}>
                        <Pressable style={styles.approveButton} onPress={() => void handleVerificationDecision(item, "approved")}>
                          <Text style={styles.actionButtonText}>Approve</Text>
                        </Pressable>
                        <Pressable style={styles.rejectButton} onPress={() => void handleVerificationDecision(item, "rejected")}>
                          <Text style={styles.actionButtonText}>Reject</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Moderation queue</Text>
            {reports.length === 0 ? (
              <Text style={styles.emptyText}>No moderation reports are active right now.</Text>
            ) : (
              reports.map((item) => (
                <View key={item.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.identityCopy}>
                      <Text style={styles.identityName}>
                        {item.reporter_name || "Unknown reporter"} → {item.reported_name || "Unknown member"}
                      </Text>
                      <Text style={styles.identityMeta}>
                        {new Date(item.created_at).toLocaleDateString()} • {item.status}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, ["PENDING", "REVIEWING"].includes(item.status) ? styles.statusPending : styles.statusApproved]}>
                      <Text style={styles.statusPillText}>{item.status}</Text>
                    </View>
                  </View>

                  <Text style={styles.reportReason}>{item.reason}</Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Reporter verified: {item.reporter_verification_level ? "Yes" : "No"}</Text>
                    <Text style={styles.metaText}>Reported verified: {item.reported_verification_level ? "Yes" : "No"}</Text>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable style={styles.secondaryAction} onPress={() => void handleReportStatus(item, "REVIEWING")}>
                      <Text style={styles.secondaryActionText}>Mark reviewing</Text>
                    </Pressable>
                    <Pressable style={styles.approveButton} onPress={() => void handleReportStatus(item, "RESOLVED")}>
                      <Text style={styles.actionButtonText}>Resolve</Text>
                    </Pressable>
                    <Pressable style={styles.rejectButton} onPress={() => void handleReportStatus(item, "DISMISSED")}>
                      <Text style={styles.actionButtonText}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={imageModalVisible} transparent animationType="fade" onRequestClose={() => setImageModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalClose} onPress={() => setImageModalVisible(false)}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {selectedVerification?.full_name || "Verification document"} • {selectedVerification?.verification_type || ""}
            </Text>
            {selectedVerification && documentUrls[selectedVerification.id] ? (
              <Image source={{ uri: documentUrls[selectedVerification.id] }} style={styles.modalImage} />
            ) : (
              <View style={[styles.modalImage, styles.documentPlaceholder]}>
                <Text style={styles.documentPlaceholderText}>Document preview unavailable</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingBottom: 28, gap: 16 },
    heroCard: {
      borderRadius: 24,
      padding: 20,
      gap: 10,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.78),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    heroBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.94),
    },
    heroBadgeText: { color: theme.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
    heroTitle: { color: theme.text, fontSize: 28, lineHeight: 34, fontFamily: "PlayfairDisplay_700Bold" },
    heroBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontFamily: "Manrope_500Medium" },
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    metricCard: {
      width: "48%",
      borderRadius: 18,
      padding: 14,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      gap: 8,
    },
    metricIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    metricValue: { color: theme.text, fontSize: 24, fontFamily: "Archivo_700Bold" },
    metricLabel: { color: theme.textMuted, fontSize: 12, lineHeight: 17, fontFamily: "Manrope_500Medium" },
    sectionCard: {
      borderRadius: 20,
      padding: 16,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    sectionTitle: { color: theme.text, fontSize: 18, fontFamily: "Archivo_700Bold" },
    planRow: { flexDirection: "row", gap: 10 },
    planPill: {
      flex: 1,
      borderRadius: 16,
      padding: 14,
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 4,
    },
    planPillLabel: { color: theme.textMuted, fontSize: 11, fontFamily: "Manrope_600SemiBold", textTransform: "uppercase" },
    planPillValue: { color: theme.text, fontSize: 20, fontFamily: "Archivo_700Bold" },
    tabRow: { flexDirection: "row", gap: 10 },
    tabButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 999,
      alignItems: "center",
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    tabButtonActive: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
    },
    tabButtonText: { color: theme.text, fontSize: 12, fontWeight: "600" },
    tabButtonTextActive: { color: Colors.light.background },
    reviewCard: {
      borderRadius: 18,
      padding: 14,
      gap: 10,
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.9),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    reviewHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    identityRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    avatarWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.06),
      overflow: "hidden",
    },
    avatarImage: { width: "100%", height: "100%" },
    identityCopy: { flex: 1, gap: 4 },
    identityName: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    identityMeta: { color: theme.textMuted, fontSize: 12, lineHeight: 17, fontFamily: "Manrope_500Medium" },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    statusPending: {
      borderColor: "#E0A106",
      backgroundColor: "rgba(224,161,6,0.14)",
    },
    statusApproved: {
      borderColor: "#1FA971",
      backgroundColor: "rgba(31,169,113,0.14)",
    },
    statusRejected: {
      borderColor: "#D4505A",
      backgroundColor: "rgba(212,80,90,0.14)",
    },
    statusPillText: { color: theme.text, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    metaText: { color: theme.textMuted, fontSize: 11, fontFamily: "Manrope_500Medium" },
    reviewerNote: {
      color: theme.text,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "Manrope_500Medium",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
      borderRadius: 12,
      padding: 10,
    },
    documentCard: { gap: 8 },
    documentPreview: { borderRadius: 14, overflow: "hidden" },
    documentImage: { width: "100%", height: 180, backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.06) },
    documentPlaceholder: { alignItems: "center", justifyContent: "center" },
    documentPlaceholderText: { color: theme.textMuted, fontSize: 12, fontFamily: "Manrope_500Medium" },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    approveButton: {
      flex: 1,
      minWidth: 100,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: "#1FA971",
    },
    rejectButton: {
      flex: 1,
      minWidth: 100,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: "#D4505A",
    },
    secondaryAction: {
      flex: 1,
      minWidth: 120,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.04),
    },
    actionButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    secondaryActionText: { color: theme.text, fontSize: 12, fontWeight: "600" },
    emptyText: { color: theme.textMuted, fontSize: 13, lineHeight: 19, fontFamily: "Manrope_500Medium" },
    reportReason: { color: theme.text, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    centerState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 26,
      gap: 10,
    },
    centerTitle: { color: theme.text, fontSize: 22, textAlign: "center", fontFamily: "PlayfairDisplay_700Bold" },
    centerBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center", fontFamily: "Manrope_500Medium" },
    centerHint: { color: theme.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center", fontFamily: "Manrope_500Medium" },
    retryButton: {
      marginTop: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    retryButtonText: { color: Colors.light.background, fontSize: 12, fontWeight: "700" },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.78)",
      justifyContent: "center",
      padding: 18,
    },
    modalClose: {
      position: "absolute",
      right: 18,
      top: 58,
      zIndex: 2,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    modalCard: {
      borderRadius: 20,
      padding: 16,
      backgroundColor: withAlpha(theme.background, 0.96),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, 0.12),
      gap: 12,
    },
    modalTitle: { color: theme.text, fontSize: 15, lineHeight: 20, fontFamily: "Archivo_700Bold" },
    modalImage: { width: "100%", height: 420, borderRadius: 14, backgroundColor: withAlpha(theme.text, 0.06) },
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
