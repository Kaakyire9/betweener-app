import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { canAccessAdminTools } from "@/lib/internal-tools";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AccountMergeCaseRow = {
  id: string;
  status: string;
  request_channel: string;
  candidate_reason: string | null;
  source_user_id: string;
  source_profile_id: string | null;
  source_name: string | null;
  source_avatar_url: string | null;
  target_user_id: string;
  target_profile_id: string | null;
  target_name: string | null;
  target_avatar_url: string | null;
  requester_user_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  executed_by: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  executed_at: string | null;
  resolved_at: string | null;
  preflight_summary: Record<string, unknown> | null;
  execution_summary: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  notes: string | null;
};

type AccountMergeEventRow = {
  id: string;
  merge_case_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AccountMergePreflight = {
  totals?: {
    user_reference_rows?: number | null;
    profile_reference_rows?: number | null;
    combined_rows?: number | null;
  } | null;
  references?: {
    scope?: string | null;
    table?: string | null;
    column?: string | null;
    count?: number | null;
  }[] | null;
  recommendation?: string | null;
};

type AccountMergeExecutionSummary = {
  success?: boolean | null;
  executed_at?: string | null;
  failed_at?: string | null;
  failed_step?: string | null;
  error_message?: string | null;
  error_detail?: string | null;
  error_hint?: string | null;
  sqlstate?: string | null;
  counts?: Record<string, number | null> | null;
};

type LinkedRecoveryRequestRow = {
  id: string;
  requester_user_id: string;
  requester_profile_id: string | null;
  requester_name: string | null;
  requester_avatar_url: string | null;
  status: string;
  current_sign_in_method: string | null;
  previous_sign_in_method: string | null;
  contact_email: string | null;
  previous_account_email: string | null;
  note: string | null;
  evidence: Record<string, unknown> | null;
  linked_merge_case_id: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleString();
};

const formatMergeFailureMessage = (summary?: AccountMergeExecutionSummary | null, fallback?: string | null) => {
  const lines = [summary?.error_message || fallback || "Unable to execute this merge case."];
  if (summary?.failed_step) lines.push(`Step: ${summary.failed_step}`);
  if (summary?.error_detail) lines.push(summary.error_detail);
  if (summary?.error_hint) lines.push(`Hint: ${summary.error_hint}`);
  return lines.filter(Boolean).join("\n");
};

export default function AdminMergeCaseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const isAllowed = canAccessAdminTools(user?.email ?? null);
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const caseId = typeof id === "string" ? id : "";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeCase, setMergeCase] = useState<AccountMergeCaseRow | null>(null);
  const [events, setEvents] = useState<AccountMergeEventRow[]>([]);
  const [linkedRecoveryRequests, setLinkedRecoveryRequests] = useState<LinkedRecoveryRequestRow[]>([]);

  const loadCase = useCallback(async () => {
    if (!caseId || !isAllowed) {
      setLoading(false);
      return;
    }

    setError(null);
    const [caseRes, eventsRes, linkedRecoveryRes] = await Promise.all([
      supabase.rpc("rpc_admin_get_account_merge_case", { p_case_id: caseId }),
      supabase.rpc("rpc_admin_get_account_merge_case_events", { p_case_id: caseId }),
      supabase.rpc("rpc_admin_get_account_recovery_requests_by_merge_case", { p_merge_case_id: caseId }),
    ]);

    const firstError = caseRes.error || eventsRes.error || linkedRecoveryRes.error;
    if (firstError) {
      setError(firstError.message || "Unable to load merge case.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const row = Array.isArray(caseRes.data) ? ((caseRes.data[0] as AccountMergeCaseRow | undefined) ?? null) : null;
    setMergeCase(row);
    setEvents((eventsRes.data as AccountMergeEventRow[] | null) ?? []);
    setLinkedRecoveryRequests((linkedRecoveryRes.data as LinkedRecoveryRequestRow[] | null) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [caseId, isAllowed]);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadCase();
  }, [loadCase]);

  const handleUpdateStatus = useCallback(
    async (status: "reviewing" | "approved" | "rejected" | "failed" | "cancelled") => {
      if (!mergeCase) return;
      const label = status.replace(/^\w/, (char) => char.toUpperCase());
      Alert.alert(`${label} merge case`, `Update this merge case to ${status}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: label,
          style: ["rejected", "failed", "cancelled"].includes(status) ? "destructive" : "default",
          onPress: async () => {
            const { data, error: rpcError } = await supabase.rpc("rpc_admin_update_account_merge_case", {
              p_case_id: mergeCase.id,
              p_status: status,
              p_notes: null,
              p_execution_summary: null,
            });
            if (rpcError || !data) {
              Alert.alert("Admin action failed", rpcError?.message || "Unable to update merge case.");
              return;
            }
            void loadCase();
          },
        },
      ]);
    },
    [loadCase, mergeCase],
  );

  const handleExecuteMerge = useCallback(async () => {
    if (!mergeCase) return;
    Alert.alert("Execute merge", "Run the merge executor for this approved case now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Execute merge",
        style: "destructive",
        onPress: async () => {
          const { data, error: rpcError } = await supabase.rpc("rpc_admin_execute_account_merge_case", {
            p_case_id: mergeCase.id,
          });
          const summary = (data as AccountMergeExecutionSummary | null) ?? null;
          if (rpcError || summary?.success === false || summary?.error_message) {
            await loadCase();
            Alert.alert("Merge failed", formatMergeFailureMessage(summary, rpcError?.message));
            return;
          }
          const counts = Object.entries(summary?.counts || {});
          Alert.alert(
            "Merge executed",
            counts.length === 0
              ? "Execution completed."
              : counts
                  .slice(0, 6)
                  .map(([label, count]) => `${label}: ${String(count ?? 0)}`)
                  .join("\n"),
          );
          void loadCase();
        },
      },
    ]);
  }, [loadCase, mergeCase]);

  const handlePreflight = useCallback(async () => {
    if (!mergeCase) return;
    const { error: rpcError } = await supabase.rpc("rpc_admin_preview_account_merge_case", {
      p_case_id: mergeCase.id,
    });
    if (rpcError) {
      Alert.alert("Preflight failed", rpcError.message || "Unable to preview account merge.");
      return;
    }
    void loadCase();
  }, [loadCase, mergeCase]);

  if (!isAllowed) {
    return <Redirect href="/(tabs)/profile" />;
  }

  if (!caseId) {
    return <Redirect href="/admin" />;
  }

  const preflight = (mergeCase?.preflight_summary as AccountMergePreflight | null) ?? null;
  const executionSummary = (mergeCase?.execution_summary as AccountMergeExecutionSummary | null) ?? null;
  const executionCounts = Object.entries((executionSummary?.counts || {}) as Record<string, number | null>);
  const hasExecutionFailure = Boolean(executionSummary?.error_message);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Merge Case</Text>
        <Pressable style={styles.refreshButton} onPress={onRefresh}>
          <MaterialCommunityIcons name="refresh" size={18} color={theme.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.tint} />
          <Text style={styles.centerBody}>Loading merge case...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Case unavailable</Text>
          <Text style={styles.centerBody}>{error}</Text>
        </View>
      ) : !mergeCase ? (
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Case not found</Text>
          <Text style={styles.centerBody}>This recovery case could not be found.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
          contentContainerStyle={styles.content}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <Text style={styles.heroTitle}>
                {(mergeCase.source_name || "Unknown source") + " → " + (mergeCase.target_name || "Unknown target")}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  ["failed", "rejected", "cancelled"].includes((mergeCase.status || "").toLowerCase())
                    ? styles.statusRejected
                    : ["completed"].includes((mergeCase.status || "").toLowerCase())
                      ? styles.statusApproved
                      : styles.statusPending,
                ]}
              >
                <Text style={styles.statusPillText}>{mergeCase.status}</Text>
              </View>
            </View>
            <Text style={styles.heroBody}>
              {(mergeCase.request_channel || "support").toUpperCase()} case opened on {formatDateTime(mergeCase.created_at)}
            </Text>
            {mergeCase.candidate_reason ? <Text style={styles.noteText}>{mergeCase.candidate_reason}</Text> : null}
            {mergeCase.notes ? <Text style={styles.noteText}>{mergeCase.notes}</Text> : null}
            <View style={styles.actionRow}>
              {["pending", "reviewing", "approved", "scheduled"].includes((mergeCase.status || "").toLowerCase()) ? (
                <Pressable style={styles.secondaryAction} onPress={handlePreflight}>
                  <Text style={styles.secondaryActionText}>Run preflight</Text>
                </Pressable>
              ) : null}
              {(mergeCase.status || "").toLowerCase() === "pending" ? (
                <Pressable style={styles.secondaryAction} onPress={() => void handleUpdateStatus("reviewing")}>
                  <Text style={styles.secondaryActionText}>Review</Text>
                </Pressable>
              ) : null}
              {["pending", "reviewing"].includes((mergeCase.status || "").toLowerCase()) ? (
                <Pressable style={styles.approveButton} onPress={() => void handleUpdateStatus("approved")}>
                  <Text style={styles.actionButtonText}>Approve</Text>
                </Pressable>
              ) : null}
              {["approved", "scheduled"].includes((mergeCase.status || "").toLowerCase()) ? (
                <Pressable style={styles.approveButton} onPress={() => void handleExecuteMerge()}>
                  <Text style={styles.actionButtonText}>Execute merge</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.actionRow}>
              {["pending", "reviewing"].includes((mergeCase.status || "").toLowerCase()) ? (
                <Pressable style={styles.rejectButton} onPress={() => void handleUpdateStatus("rejected")}>
                  <Text style={styles.actionButtonText}>Reject</Text>
                </Pressable>
              ) : null}
              {["pending", "reviewing", "approved", "scheduled"].includes((mergeCase.status || "").toLowerCase()) ? (
                <Pressable style={styles.rejectButton} onPress={() => void handleUpdateStatus("failed")}>
                  <Text style={styles.actionButtonText}>Fail</Text>
                </Pressable>
              ) : null}
              {["pending", "reviewing", "approved", "scheduled"].includes((mergeCase.status || "").toLowerCase()) ? (
                <Pressable style={styles.secondaryAction} onPress={() => void handleUpdateStatus("cancelled")}>
                  <Text style={styles.secondaryActionText}>Cancel case</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account pair</Text>
            <View style={styles.identityCard}>
              <Text style={styles.identityLabel}>Source</Text>
              <Text style={styles.identityValue}>{mergeCase.source_name || "Unknown source"}</Text>
              <Text style={styles.identityMeta}>User: {mergeCase.source_user_id}</Text>
              <Text style={styles.identityMeta}>Profile: {mergeCase.source_profile_id || "Not set"}</Text>
            </View>
            <View style={styles.identityCard}>
              <Text style={styles.identityLabel}>Target</Text>
              <Text style={styles.identityValue}>{mergeCase.target_name || "Unknown target"}</Text>
              <Text style={styles.identityMeta}>User: {mergeCase.target_user_id}</Text>
              <Text style={styles.identityMeta}>Profile: {mergeCase.target_profile_id || "Not set"}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Linked recovery requests</Text>
            {linkedRecoveryRequests.length === 0 ? (
              <Text style={styles.helperText}>No recovery requests are linked to this merge case yet.</Text>
            ) : (
              linkedRecoveryRequests.map((request) => (
                <View key={request.id} style={styles.timelineCard}>
                  <View style={styles.refHeader}>
                    <Text style={styles.identityValue}>{request.requester_name || request.contact_email || "Unknown member"}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        ["closed"].includes((request.status || "").toLowerCase())
                          ? styles.statusRejected
                          : ["resolved"].includes((request.status || "").toLowerCase())
                            ? styles.statusApproved
                            : styles.statusPending,
                      ]}
                    >
                      <Text style={styles.statusPillText}>{request.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.identityMeta}>
                    {(request.current_sign_in_method || "unknown").toUpperCase()} to {(request.previous_sign_in_method || "unknown").toUpperCase()}
                    {" • "}
                    {formatDateTime(request.created_at)}
                  </Text>
                  {request.note ? <Text style={styles.noteText}>{request.note}</Text> : null}
                  {request.review_notes ? <Text style={styles.timelineMeta}>{request.review_notes}</Text> : null}
                  <Pressable style={styles.secondaryAction} onPress={() => router.push(`/admin-recovery-request/${request.id}`)}>
                    <Text style={styles.secondaryActionText}>Open request</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Execution summary</Text>
            {hasExecutionFailure ? (
              <>
                <View style={styles.failureCard}>
                  <Text style={styles.failureTitle}>Last execution failed</Text>
                  <Text style={styles.helperText}>
                    Failed on {formatDateTime(executionSummary?.failed_at || mergeCase.executed_at)} at step{" "}
                    {executionSummary?.failed_step || "unknown"}.
                  </Text>
                  <Text style={styles.failureBody}>{executionSummary?.error_message || "Unknown merge executor error."}</Text>
                  {executionSummary?.error_detail ? <Text style={styles.helperText}>{executionSummary.error_detail}</Text> : null}
                  {executionSummary?.error_hint ? <Text style={styles.helperText}>Hint: {executionSummary.error_hint}</Text> : null}
                  {executionSummary?.sqlstate ? <Text style={styles.identityMeta}>SQLSTATE: {executionSummary.sqlstate}</Text> : null}
                </View>
                {mergeCase.executed_by ? <Text style={styles.helperText}>Attempted by {mergeCase.executed_by}.</Text> : null}
              </>
            ) : mergeCase.executed_at ? (
              <>
                <Text style={styles.helperText}>
                  Executed on {formatDateTime(mergeCase.executed_at)} by {mergeCase.executed_by || "Unknown admin"}
                </Text>
                {executionCounts.length === 0 ? (
                  <Text style={styles.helperText}>No execution counts were recorded for this case.</Text>
                ) : (
                  executionCounts.map(([label, count]) => (
                    <View key={label} style={styles.refCard}>
                      <View style={styles.refHeader}>
                        <Text style={styles.identityValue}>{label}</Text>
                        <Text style={styles.refCount}>{String(count ?? 0)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </>
            ) : (
              <Text style={styles.helperText}>This merge case has not been executed yet.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Preflight summary</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Combined</Text>
                <Text style={styles.summaryValue}>{Number(preflight?.totals?.combined_rows ?? 0)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>User refs</Text>
                <Text style={styles.summaryValue}>{Number(preflight?.totals?.user_reference_rows ?? 0)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Profile refs</Text>
                <Text style={styles.summaryValue}>{Number(preflight?.totals?.profile_reference_rows ?? 0)}</Text>
              </View>
            </View>
            <Text style={styles.helperText}>
              {preflight?.recommendation || "No preflight has been run for this case yet."}
            </Text>
            {(preflight?.references || []).map((ref, index) => (
              <View key={`${ref.table || "table"}:${ref.column || "column"}:${index}`} style={styles.refCard}>
                <View style={styles.refHeader}>
                  <Text style={styles.identityValue}>{ref.table || "Unknown table"}</Text>
                  <Text style={styles.refCount}>{String(ref.count ?? 0)}</Text>
                </View>
                <Text style={styles.identityMeta}>
                  {(ref.scope || "unknown").toUpperCase()} • {ref.column || "unknown column"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            {events.length === 0 ? (
              <Text style={styles.helperText}>No audit events have been recorded for this case yet.</Text>
            ) : (
              events.map((event) => (
                <View key={event.id} style={styles.timelineCard}>
                  <View style={styles.refHeader}>
                    <Text style={styles.identityValue}>{event.event_type.replace(/_/g, " ")}</Text>
                    <Text style={styles.identityMeta}>{formatDateTime(event.created_at)}</Text>
                  </View>
                  <Text style={styles.identityMeta}>
                    Actor: {event.actor_user_id || "Unknown"}{event.actor_role ? ` • ${event.actor_role}` : ""}
                  </Text>
                  {event.metadata ? (
                    <Text style={styles.timelineMeta}>{JSON.stringify(event.metadata, null, 2)}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: 18 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 6,
      paddingBottom: 12,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    refreshButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    headerTitle: { fontSize: 18, color: theme.text, fontFamily: "Archivo_700Bold" },
    scroll: { flex: 1 },
    content: { paddingBottom: 28, gap: 16 },
    heroCard: {
      borderRadius: 22,
      padding: 18,
      gap: 10,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.74),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    heroHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    heroTitle: { color: theme.text, fontSize: 22, lineHeight: 28, fontFamily: "PlayfairDisplay_700Bold", flex: 1 },
    heroBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20, fontFamily: "Manrope_500Medium" },
    noteText: {
      color: theme.text,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "Manrope_500Medium",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
      borderRadius: 12,
      padding: 10,
    },
    failureCard: {
      borderRadius: 14,
      padding: 12,
      gap: 8,
      backgroundColor: withAlpha("#D4505A", isDark ? 0.18 : 0.1),
      borderWidth: 1,
      borderColor: withAlpha("#D4505A", isDark ? 0.52 : 0.3),
    },
    failureTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    failureBody: { color: theme.text, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_600SemiBold" },
    sectionCard: {
      borderRadius: 20,
      padding: 16,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    sectionTitle: { color: theme.text, fontSize: 18, fontFamily: "Archivo_700Bold" },
    identityCard: {
      borderRadius: 16,
      padding: 14,
      gap: 4,
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    identityLabel: { color: theme.textMuted, fontSize: 11, textTransform: "uppercase", fontFamily: "Manrope_600SemiBold" },
    identityValue: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    identityMeta: { color: theme.textMuted, fontSize: 11, lineHeight: 17, fontFamily: "Manrope_500Medium" },
    summaryRow: { flexDirection: "row", gap: 10 },
    summaryPill: {
      flex: 1,
      borderRadius: 16,
      padding: 14,
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      gap: 4,
    },
    summaryLabel: { color: theme.textMuted, fontSize: 11, textTransform: "uppercase", fontFamily: "Manrope_600SemiBold" },
    summaryValue: { color: theme.text, fontSize: 20, fontFamily: "Archivo_700Bold" },
    helperText: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    refCard: {
      borderRadius: 14,
      padding: 12,
      gap: 6,
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.9),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    refHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    refCount: { color: theme.tint, fontSize: 13, fontFamily: "Archivo_700Bold" },
    timelineCard: {
      borderRadius: 14,
      padding: 12,
      gap: 6,
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.9),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    timelineMeta: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: "SpaceMono",
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.04),
      borderRadius: 10,
      padding: 10,
    },
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
    statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    statusPending: { borderColor: "#E0A106", backgroundColor: "rgba(224,161,6,0.14)" },
    statusApproved: { borderColor: "#1FA971", backgroundColor: "rgba(31,169,113,0.14)" },
    statusRejected: { borderColor: "#D4505A", backgroundColor: "rgba(212,80,90,0.14)" },
    statusPillText: { color: theme.text, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26, gap: 10 },
    centerTitle: { color: theme.text, fontSize: 22, textAlign: "center", fontFamily: "PlayfairDisplay_700Bold" },
    centerBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center", fontFamily: "Manrope_500Medium" },
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
