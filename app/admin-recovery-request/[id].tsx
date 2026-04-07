import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { canAccessAdminTools } from "@/lib/internal-tools";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AccountRecoveryRequestStatus = "pending" | "reviewing" | "resolved" | "closed";

type AccountRecoveryRequestRow = {
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

type AccountRecoveryEventRow = {
  id: string;
  request_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_role: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type LinkedMergeCaseSummary = {
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

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleString();
};

export default function AdminRecoveryRequestScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const isAllowed = canAccessAdminTools(user?.email ?? null);
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? "light") === "dark" ? "dark" : "light";
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === "dark";
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const requestId = typeof id === "string" ? id : "";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestRow, setRequestRow] = useState<AccountRecoveryRequestRow | null>(null);
  const [events, setEvents] = useState<AccountRecoveryEventRow[]>([]);
  const [linkedMergeCase, setLinkedMergeCase] = useState<LinkedMergeCaseSummary | null>(null);
  const [statusDraft, setStatusDraft] = useState<AccountRecoveryRequestStatus>("pending");
  const [reviewNotesDraft, setReviewNotesDraft] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [createMergeModalVisible, setCreateMergeModalVisible] = useState(false);
  const [mergeDraftSourceUserId, setMergeDraftSourceUserId] = useState("");
  const [mergeDraftTargetUserId, setMergeDraftTargetUserId] = useState("");
  const [mergeDraftReason, setMergeDraftReason] = useState("");
  const [mergeDraftNotes, setMergeDraftNotes] = useState("");
  const [mergeDraftSubmitting, setMergeDraftSubmitting] = useState(false);
  const [mergeDraftError, setMergeDraftError] = useState<string | null>(null);

  const loadRequest = useCallback(async () => {
    if (!requestId || !isAllowed) {
      setLoading(false);
      return;
    }

    setError(null);
    const [requestRes, eventsRes] = await Promise.all([
      supabase.rpc("rpc_admin_get_account_recovery_request", { p_request_id: requestId }),
      supabase.rpc("rpc_admin_get_account_recovery_request_events", { p_request_id: requestId }),
    ]);

    const firstError = requestRes.error || eventsRes.error;
    if (firstError) {
      setError(firstError.message || "Unable to load recovery request.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const row = Array.isArray(requestRes.data) ? ((requestRes.data[0] as AccountRecoveryRequestRow | undefined) ?? null) : null;
    setRequestRow(row);
    setEvents((eventsRes.data as AccountRecoveryEventRow[] | null) ?? []);
    if (row?.linked_merge_case_id) {
      const mergeRes = await supabase.rpc("rpc_admin_get_account_merge_case", { p_case_id: row.linked_merge_case_id });
      const linkedRow = Array.isArray(mergeRes.data)
        ? ((mergeRes.data[0] as LinkedMergeCaseSummary | undefined) ?? null)
        : null;
      setLinkedMergeCase(mergeRes.error ? null : linkedRow);
    } else {
      setLinkedMergeCase(null);
    }
    setStatusDraft((((row?.status || "pending").toLowerCase()) as AccountRecoveryRequestStatus) || "pending");
    setReviewNotesDraft(row?.review_notes || "");
    setLoading(false);
    setRefreshing(false);
  }, [isAllowed, requestId]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadRequest();
  }, [loadRequest]);

  const handleSaveReview = useCallback(async () => {
    if (!requestRow) return;

    setSavingReview(true);
    const { data, error } = await supabase.functions.invoke("admin-update-account-recovery-request", {
      body: {
        requestId: requestRow.id,
        status: statusDraft,
        reviewNotes: reviewNotesDraft.trim() || null,
        linkedMergeCaseId: requestRow.linked_merge_case_id,
      },
    });

    setSavingReview(false);

    if (error || !(data as any)?.success) {
      Alert.alert("Admin action failed", error?.message || "Unable to save the recovery review.");
      return;
    }

    const warning = (data as any)?.notifications?.warning;
    if (statusDraft === "resolved" && warning) {
      Alert.alert("Recovery marked resolved", "Status was updated, but the recovery email could not be sent automatically.");
    }
    void loadRequest();
  }, [loadRequest, requestRow, reviewNotesDraft, statusDraft]);

  const openCreateMergeModal = useCallback(() => {
    if (!requestRow) return;
    setMergeDraftSourceUserId("");
    setMergeDraftTargetUserId(requestRow.requester_user_id || "");
    setMergeDraftReason(
      requestRow.note?.trim() ||
        `User-filed recovery request: ${(requestRow.current_sign_in_method || "unknown").toUpperCase()} to ${(requestRow.previous_sign_in_method || "unknown").toUpperCase()}`,
    );
    setMergeDraftNotes(requestRow.review_notes || "");
    setMergeDraftError(null);
    setCreateMergeModalVisible(true);
  }, [requestRow]);

  const handleCreateMergeCase = useCallback(async () => {
    if (!requestRow) return;

    const sourceUserId = mergeDraftSourceUserId.trim();
    const targetUserId = mergeDraftTargetUserId.trim();

    if (!sourceUserId || !targetUserId) {
      setMergeDraftError("Add both the source user ID and the target user ID.");
      return;
    }

    if (sourceUserId === targetUserId) {
      setMergeDraftError("Source and target user IDs must be different.");
      return;
    }

    setMergeDraftError(null);
    setMergeDraftSubmitting(true);

    try {
      const evidence = {
        recovery_request_id: requestRow.id,
        requester_user_id: requestRow.requester_user_id,
        current_sign_in_method: requestRow.current_sign_in_method,
        previous_sign_in_method: requestRow.previous_sign_in_method,
        contact_email: requestRow.contact_email,
        previous_account_email: requestRow.previous_account_email,
      };

      const { data: mergeCaseId, error: createError } = await supabase.rpc("rpc_admin_create_account_merge_case", {
        p_source_user_id: sourceUserId,
        p_target_user_id: targetUserId,
        p_source_profile_id: null,
        p_target_profile_id: null,
        p_request_channel: "user_report",
        p_candidate_reason: mergeDraftReason.trim() || null,
        p_evidence: evidence,
        p_requester_user_id: requestRow.requester_user_id,
        p_notes: mergeDraftNotes.trim() || null,
      });

      if (createError || !mergeCaseId) {
        throw createError ?? new Error("Unable to create merge case.");
      }

      const { data: linked, error: linkError } = await supabase.rpc("rpc_admin_update_account_recovery_request", {
        p_request_id: requestRow.id,
        p_status: "reviewing",
        p_review_notes: `Linked to merge case ${mergeCaseId}.`,
        p_linked_merge_case_id: mergeCaseId,
      });

      if (linkError || !linked) {
        throw linkError ?? new Error("Merge case was created, but the recovery request could not be linked.");
      }

      setCreateMergeModalVisible(false);
      setMergeDraftSubmitting(false);
      await loadRequest();
      router.push(`/admin-merge-case/${mergeCaseId}`);
    } catch (error: any) {
      setMergeDraftSubmitting(false);
      setMergeDraftError(error?.message ?? "Unable to create the merge case.");
    }
  }, [
    loadRequest,
    mergeDraftNotes,
    mergeDraftReason,
    mergeDraftSourceUserId,
    mergeDraftTargetUserId,
    requestRow,
  ]);

  if (!isAllowed) {
    return <Redirect href="/(tabs)/profile" />;
  }

  if (!requestId) {
    return <Redirect href="/admin" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Recovery Request</Text>
        <Pressable style={styles.refreshButton} onPress={onRefresh}>
          <MaterialCommunityIcons name="refresh" size={18} color={theme.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.tint} />
          <Text style={styles.centerBody}>Loading recovery request...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Request unavailable</Text>
          <Text style={styles.centerBody}>{error}</Text>
        </View>
      ) : !requestRow ? (
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Request not found</Text>
          <Text style={styles.centerBody}>This account recovery request could not be found.</Text>
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
              <Text style={styles.heroTitle}>{requestRow.requester_name || requestRow.contact_email || "Unknown member"}</Text>
              <View
                style={[
                  styles.statusPill,
                  ["closed"].includes((requestRow.status || "").toLowerCase())
                    ? styles.statusRejected
                    : ["resolved"].includes((requestRow.status || "").toLowerCase())
                      ? styles.statusApproved
                      : styles.statusPending,
                ]}
              >
                <Text style={styles.statusPillText}>{requestRow.status}</Text>
              </View>
            </View>
            <Text style={styles.heroBody}>
              {(requestRow.current_sign_in_method || "unknown").toUpperCase()} to {(requestRow.previous_sign_in_method || "unknown").toUpperCase()}
              {" on "}
              {formatDateTime(requestRow.created_at)}
            </Text>
            {requestRow.note ? <Text style={styles.noteText}>{requestRow.note}</Text> : null}
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryAction} onPress={() => router.push("/admin")}>
                <Text style={styles.secondaryActionText}>Back to queue</Text>
              </Pressable>
              {requestRow.linked_merge_case_id ? (
                <Pressable style={styles.secondaryAction} onPress={() => router.push(`/admin-merge-case/${requestRow.linked_merge_case_id}`)}>
                  <Text style={styles.secondaryActionText}>Open merge case</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.approveButton} onPress={openCreateMergeModal}>
                  <Text style={styles.actionButtonText}>Create merge case</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Requester</Text>
            <View style={styles.identityCard}>
              <Text style={styles.identityLabel}>User ID</Text>
              <Text style={styles.identityValue}>{requestRow.requester_user_id}</Text>
              <Text style={styles.identityMeta}>Profile: {requestRow.requester_profile_id || "Not set"}</Text>
              <Text style={styles.identityMeta}>Contact email: {requestRow.contact_email || "Not provided"}</Text>
              <Text style={styles.identityMeta}>Previous email: {requestRow.previous_account_email || "Unknown"}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Linked merge case</Text>
            {linkedMergeCase ? (
              <View style={styles.identityCard}>
                <View style={styles.refHeader}>
                  <Text style={styles.identityValue}>
                    {(linkedMergeCase.source_name || "Unknown source") + " → " + (linkedMergeCase.target_name || "Unknown target")}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      ["failed", "rejected", "cancelled"].includes((linkedMergeCase.status || "").toLowerCase())
                        ? styles.statusRejected
                        : ["completed"].includes((linkedMergeCase.status || "").toLowerCase())
                          ? styles.statusApproved
                          : styles.statusPending,
                    ]}
                  >
                    <Text style={styles.statusPillText}>{linkedMergeCase.status}</Text>
                  </View>
                </View>
                <Text style={styles.identityMeta}>
                  {(linkedMergeCase.request_channel || "support").toUpperCase()} • {formatDateTime(linkedMergeCase.created_at)}
                </Text>
                {linkedMergeCase.candidate_reason ? <Text style={styles.helperText}>{linkedMergeCase.candidate_reason}</Text> : null}
                <Pressable style={styles.secondaryAction} onPress={() => router.push(`/admin-merge-case/${linkedMergeCase.id}`)}>
                  <Text style={styles.secondaryActionText}>Open merge case</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helperText}>This request is not linked to a merge case yet.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Review</Text>
            <View style={styles.statusChoiceRow}>
              {(["pending", "reviewing", "resolved", "closed"] as AccountRecoveryRequestStatus[]).map((status) => (
                <Pressable
                  key={status}
                  style={[styles.statusChoiceButton, statusDraft === status ? styles.statusChoiceButtonActive : null]}
                  onPress={() => setStatusDraft(status)}
                >
                  <Text style={[styles.statusChoiceText, statusDraft === status ? styles.statusChoiceTextActive : null]}>
                    {status}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={reviewNotesDraft}
              onChangeText={setReviewNotesDraft}
              placeholder="Review notes for support handoff or follow-up"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.textArea, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            <Text style={styles.helperText}>
              Reviewed by: {requestRow.reviewed_by || "Not set"} • {formatDateTime(requestRow.reviewed_at)}
            </Text>
            <Pressable
              style={[styles.approveButton, { opacity: savingReview ? 0.7 : 1 }]}
              onPress={() => void handleSaveReview()}
              disabled={savingReview}
            >
              <Text style={styles.actionButtonText}>{savingReview ? "Saving..." : "Save review"}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Evidence</Text>
            {requestRow.evidence && Object.keys(requestRow.evidence).length > 0 ? (
              <Text style={styles.timelineMeta}>{JSON.stringify(requestRow.evidence, null, 2)}</Text>
            ) : (
              <Text style={styles.helperText}>No structured evidence was submitted with this request.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            {events.length === 0 ? (
              <Text style={styles.helperText}>No audit events have been recorded for this request yet.</Text>
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
                  {event.metadata ? <Text style={styles.timelineMeta}>{JSON.stringify(event.metadata, null, 2)}</Text> : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={createMergeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateMergeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalClose} onPress={() => setCreateMergeModalVisible(false)}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create merge case</Text>
            <Text style={styles.modalBody}>
              Enter the source account to merge from and the target account to keep. This recovery request will be linked automatically.
            </Text>
            <TextInput
              value={mergeDraftSourceUserId}
              onChangeText={setMergeDraftSourceUserId}
              placeholder="Source user ID (account to merge from)"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              style={[styles.modalInput, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            <TextInput
              value={mergeDraftTargetUserId}
              onChangeText={setMergeDraftTargetUserId}
              placeholder="Target user ID (account to keep)"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              style={[styles.modalInput, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            <TextInput
              value={mergeDraftReason}
              onChangeText={setMergeDraftReason}
              placeholder="Candidate reason"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.textArea, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            <TextInput
              value={mergeDraftNotes}
              onChangeText={setMergeDraftNotes}
              placeholder="Internal notes"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.textArea, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            {mergeDraftError ? <Text style={styles.errorText}>{mergeDraftError}</Text> : null}
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryAction} onPress={() => setCreateMergeModalVisible(false)}>
                <Text style={styles.secondaryActionText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.approveButton, { opacity: mergeDraftSubmitting ? 0.7 : 1 }]}
                onPress={() => void handleCreateMergeCase()}
                disabled={mergeDraftSubmitting}
              >
                <Text style={styles.actionButtonText}>{mergeDraftSubmitting ? "Creating..." : "Create and link"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    identityMeta: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    helperText: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    timelineMeta: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 18,
      fontFamily: "SpaceMono",
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.04),
      borderRadius: 12,
      padding: 10,
    },
    timelineCard: {
      borderRadius: 16,
      padding: 14,
      gap: 8,
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.92),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    refHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    approveButton: {
      flex: 1,
      minWidth: 120,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: "#1FA971",
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
    centerState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 26,
      gap: 10,
    },
    centerTitle: { color: theme.text, fontSize: 22, textAlign: "center", fontFamily: "PlayfairDisplay_700Bold" },
    centerBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center", fontFamily: "Manrope_500Medium" },
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
    statusChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    statusChoiceButton: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.04),
    },
    statusChoiceButtonActive: {
      backgroundColor: theme.tint,
      borderColor: theme.tint,
    },
    statusChoiceText: {
      color: theme.text,
      fontSize: 12,
      fontFamily: "Manrope_600SemiBold",
      textTransform: "capitalize",
    },
    statusChoiceTextActive: {
      color: Colors.light.background,
    },
    textArea: {
      minHeight: 96,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 13,
      textAlignVertical: "top",
      fontFamily: "Manrope_500Medium",
    },
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
    modalBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    modalInput: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 13,
      fontFamily: "Manrope_500Medium",
    },
    errorText: { color: "#ef4444", fontSize: 12, lineHeight: 17, fontFamily: "Manrope_500Medium" },
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
