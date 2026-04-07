import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/auth-context";
import { canAccessAdminTools } from "@/lib/internal-tools";
import { supabase } from "@/lib/supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  auto_verification_data: Record<string, unknown> | null;
  document_url: string | null;
  full_name: string | null;
  current_country: string | null;
  avatar_url: string | null;
  verification_level: number | null;
  verification_refresh_required: boolean | null;
  verification_refresh_reason: string | null;
  verification_refresh_target_level: number | null;
  verification_refresh_requested_at: string | null;
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
  evidence_message_id: string | null;
  evidence_message_text: string | null;
  evidence_message_type: string | null;
  evidence_message_sender_id: string | null;
  evidence_message_created_at: string | null;
  evidence: Record<string, unknown> | null;
};

type DatePlanConciergeRow = {
  request_id: string;
  request_status: string;
  request_note: string | null;
  requested_at: string;
  requested_by_profile_id: string;
  requested_by_name: string | null;
  date_plan_id: string;
  date_plan_status: string;
  scheduled_for: string;
  place_name: string;
  place_address: string | null;
  city: string | null;
  creator_profile_id: string;
  creator_name: string | null;
  recipient_profile_id: string;
  recipient_name: string | null;
  concierge_requested_at: string | null;
};

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

type AccountMergePreflight = {
  case_id: string;
  status: string;
  source?: {
    user_id?: string | null;
    profile_id?: string | null;
  } | null;
  target?: {
    user_id?: string | null;
    profile_id?: string | null;
  } | null;
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

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".avi"] as const;

const isVideoVerificationAsset = (item: Pick<VerificationRow, "verification_type" | "document_url">, signedUrl?: string) => {
  if ((item.verification_type || "").toLowerCase() === "selfie_liveness") {
    return true;
  }

  const assetPath = `${item.document_url || ""} ${signedUrl || ""}`.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => assetPath.includes(ext));
};

const formatVerificationType = (value?: string | null) => {
  const type = (value || "").toLowerCase();
  const labels: Record<string, string> = {
    selfie_liveness: "Selfie liveness",
    passport: "Passport / visa",
    residence: "Residence proof",
    social: "Social media",
    workplace: "Work / study proof",
  };
  if (labels[type]) return labels[type];
  return (value || "Verification")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getVerificationReviewChecklist = (item: Pick<VerificationRow, "verification_type">) => {
  switch ((item.verification_type || "").toLowerCase()) {
    case "selfie_liveness":
      return [
        "Face is clearly visible throughout the clip",
        "Blink / turn challenge is actually completed",
        "No obvious replay, screen capture, or spoofing",
      ];
    default:
      return [
        "Document is clear and readable",
        "Important details are not cropped off",
        "Submission matches the selected verification method",
      ];
  }
};

const getVerificationRejectReasons = (item: Pick<VerificationRow, "verification_type">) => {
  switch ((item.verification_type || "").toLowerCase()) {
    case "selfie_liveness":
      return [
        "Face not clearly visible",
        "Challenge not completed",
        "Possible spoof or replay",
      ];
    case "passport":
    case "residence":
    case "workplace":
      return [
        "Document is unclear",
        "Important details are cropped",
        "Unsupported or invalid document",
      ];
    case "social":
      return [
        "Profile evidence is too weak",
        "Location history is not visible",
        "Submission does not match the claim",
      ];
    default:
      return [
        "Submission is unclear",
        "Evidence is insufficient",
        "Please resubmit with a stronger proof",
      ];
  }
};

const getSocialVerificationEvidence = (item: Pick<VerificationRow, "verification_type" | "auto_verification_data">) => {
  if ((item.verification_type || "").toLowerCase() !== "social") return null;
  const data = item.auto_verification_data || {};
  const platform = typeof data.social_platform === "string" ? data.social_platform : null;
  const profileUrl = typeof data.social_profile_url === "string" ? data.social_profile_url : null;
  const handle = typeof data.social_handle === "string" ? data.social_handle : null;
  if (!platform && !profileUrl && !handle) return null;
  return { platform, profileUrl, handle };
};

function VerificationAssetPreview({
  uri,
  isVideo,
  style,
  videoStyle,
  placeholderStyle,
  placeholderTextStyle,
  videoBadgeStyle,
  videoBadgeTextStyle,
  nativeControls = false,
  muted = true,
  autoPlay = true,
  loop = true,
}: {
  uri?: string;
  isVideo: boolean;
  style: any;
  videoStyle?: any;
  placeholderStyle?: any;
  placeholderTextStyle?: any;
  videoBadgeStyle?: any;
  videoBadgeTextStyle?: any;
  nativeControls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
}) {
  const player = useVideoPlayer(isVideo && uri ? uri : null, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    if (autoPlay) {
      try { instance.play(); } catch {}
    }
  });

  if (!uri) {
    return (
      <View style={[style, placeholderStyle]}>
        <Text style={placeholderTextStyle}>Document preview unavailable</Text>
      </View>
    );
  }

  if (isVideo) {
    return (
      <View style={[style, placeholderStyle, { overflow: "hidden", position: "relative", backgroundColor: "#000" }]}>
        <VideoView player={player} style={videoStyle} contentFit="cover" nativeControls={nativeControls} />
        <View style={videoBadgeStyle}>
          <MaterialCommunityIcons name="play-circle-outline" size={18} color="#fff" />
          <Text style={videoBadgeTextStyle}>Video</Text>
        </View>
      </View>
    );
  }

  return <Image source={{ uri }} style={style} />;
}

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

type AccountRecoveryRequestStatus = "pending" | "reviewing" | "resolved" | "closed";

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

const formatMergeFailureMessage = (summary?: AccountMergeExecutionSummary | null, fallback?: string | null) => {
  const lines = [summary?.error_message || fallback || "Unable to execute this merge case."];
  if (summary?.failed_step) lines.push(`Step: ${summary.failed_step}`);
  if (summary?.error_detail) lines.push(summary.error_detail);
  if (summary?.error_hint) lines.push(`Hint: ${summary.error_hint}`);
  return lines.filter(Boolean).join("\n");
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
  const [conciergeRequests, setConciergeRequests] = useState<DatePlanConciergeRow[]>([]);
  const [accountMergeCases, setAccountMergeCases] = useState<AccountMergeCaseRow[]>([]);
  const [accountRecoveryRequests, setAccountRecoveryRequests] = useState<AccountRecoveryRequestRow[]>([]);
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moduleWarnings, setModuleWarnings] = useState<string[]>([]);
  const [selectedVerification, setSelectedVerification] = useState<VerificationRow | null>(null);
  const [selectedMergePreflight, setSelectedMergePreflight] = useState<AccountMergePreflight | null>(null);
  const [selectedRecoveryRequest, setSelectedRecoveryRequest] = useState<AccountRecoveryRequestRow | null>(null);
  const [recoveryReviewRequest, setRecoveryReviewRequest] = useState<AccountRecoveryRequestRow | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [mergePreflightModalVisible, setMergePreflightModalVisible] = useState(false);
  const [createMergeModalVisible, setCreateMergeModalVisible] = useState(false);
  const [recoveryReviewModalVisible, setRecoveryReviewModalVisible] = useState(false);
  const [mergeDraftSourceUserId, setMergeDraftSourceUserId] = useState("");
  const [mergeDraftTargetUserId, setMergeDraftTargetUserId] = useState("");
  const [mergeDraftReason, setMergeDraftReason] = useState("");
  const [mergeDraftNotes, setMergeDraftNotes] = useState("");
  const [mergeDraftSubmitting, setMergeDraftSubmitting] = useState(false);
  const [mergeDraftError, setMergeDraftError] = useState<string | null>(null);
  const [recoveryReviewStatusDraft, setRecoveryReviewStatusDraft] = useState<AccountRecoveryRequestStatus>("reviewing");
  const [recoveryReviewNotesDraft, setRecoveryReviewNotesDraft] = useState("");
  const [recoveryReviewSubmitting, setRecoveryReviewSubmitting] = useState(false);
  const [recoveryReviewError, setRecoveryReviewError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"verification" | "reports" | "concierge" | "recovery_requests" | "merges">("verification");

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
    const [overviewRes, verificationRes, reportsRes, conciergeRes, recoveryRes, mergeRes] = await Promise.all([
      supabase.rpc("rpc_admin_dashboard_overview"),
      supabase.rpc("rpc_admin_get_verification_queue"),
      supabase.rpc("rpc_admin_get_reports_queue"),
      supabase.rpc("rpc_admin_get_date_plan_concierge_queue"),
      supabase.rpc("rpc_admin_get_account_recovery_requests"),
      supabase.rpc("rpc_admin_get_account_merge_queue"),
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
    const warnings: string[] = [];

    const conciergeData = conciergeRes.error
      ? (warnings.push("Date concierge queue unavailable until the latest admin migration is applied."), [])
      : ((conciergeRes.data as DatePlanConciergeRow[] | null) ?? []);

    const recoveryData = recoveryRes.error
      ? (warnings.push("Account recovery requests are unavailable until the latest admin migration is applied."), [])
      : ((recoveryRes.data as AccountRecoveryRequestRow[] | null) ?? []);

    const mergeData = mergeRes.error
      ? (warnings.push("Account recovery queue unavailable until the account merge migration is applied."), [])
      : ((mergeRes.data as AccountMergeCaseRow[] | null) ?? []);

    setOverview({
      ...EMPTY_OVERVIEW,
      ...overviewData,
    });
    setVerifications(verificationData);
    setReports(reportsData);
    setConciergeRequests(conciergeData);
    setAccountRecoveryRequests(recoveryData);
    setAccountMergeCases(mergeData);
    setModuleWarnings(warnings);
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
    async (item: VerificationRow, decision: "approved" | "rejected", noteOverride?: string) => {
      const actionLabel = decision === "approved" ? "approve" : "reject";
      const formattedType = formatVerificationType(item.verification_type);
      Alert.alert(
        decision === "approved" ? "Approve verification" : "Reject verification",
        decision === "approved"
          ? `Approve ${formattedType.toLowerCase()} for ${item.full_name || "this member"}?`
          : noteOverride
            ? `Reject ${formattedType.toLowerCase()} for ${item.full_name || "this member"}?\n\nReason: ${noteOverride}`
            : `Are you sure you want to ${actionLabel} ${item.full_name || "this member"}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: decision === "approved" ? "Approve" : "Reject",
            style: decision === "approved" ? "default" : "destructive",
            onPress: async () => {
              const defaultNote =
                decision === "approved"
                  ? "Approved by internal review."
                  : noteOverride || "Rejected by internal review. Please resubmit with clearer documentation.";
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

  const handleRequestFreshReview = useCallback(
    async (item: VerificationRow) => {
      if (!item.profile_id) {
        Alert.alert("Fresh review unavailable", "This verification row is missing a profile id.");
        return;
      }

      if (item.verification_refresh_required) {
        Alert.alert("Fresh review already requested", "This member already has an active private trust refresh.");
        return;
      }

      const currentLevel = Math.max(1, Math.min(2, item.verification_level || 1));
      const formattedType = formatVerificationType(item.verification_type).toLowerCase();
      const reason = `Betweener needs a fresh ${formattedType} check to keep this trust signal current.`;

      Alert.alert(
        "Ask for fresh review",
        `Ask ${item.full_name || "this member"} for a private Trust level ${currentLevel} refresh?\n\nThey keep their current badge while they complete it.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Ask for refresh",
            onPress: async () => {
              const { data, error: rpcError } = await supabase.rpc("rpc_admin_request_verification_refresh", {
                p_profile_id: item.profile_id,
                p_target_level: currentLevel,
                p_reason: reason,
              });
              if (rpcError || !data) {
                Alert.alert("Fresh review failed", rpcError?.message || "Unable to request a fresh verification review.");
                return;
              }
              void loadDashboard();
            },
          },
        ],
      );
    },
    [loadDashboard],
  );

  const handleClearFreshReview = useCallback(
    async (item: VerificationRow) => {
      if (!item.profile_id) {
        Alert.alert("Fresh review unavailable", "This verification row is missing a profile id.");
        return;
      }

      Alert.alert(
        "Cancel fresh review",
        `Cancel the private trust refresh for ${item.full_name || "this member"}? Their current badge stays unchanged.`,
        [
          { text: "Keep request", style: "cancel" },
          {
            text: "Cancel request",
            style: "destructive",
            onPress: async () => {
              const { data, error: rpcError } = await supabase.rpc("rpc_admin_clear_verification_refresh", {
                p_profile_id: item.profile_id,
              });
              if (rpcError || !data) {
                Alert.alert("Fresh review failed", rpcError?.message || "Unable to cancel the fresh verification review.");
                return;
              }
              void loadDashboard();
            },
          },
        ],
      );
    },
    [loadDashboard],
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

  const handleConciergeStatus = useCallback(
    async (item: DatePlanConciergeRow, status: "claimed" | "completed" | "cancelled") => {
      const labels: Record<typeof status, string> = {
        claimed: "claim",
        completed: "complete",
        cancelled: "cancel",
      };
      Alert.alert(
        `${labels[status][0].toUpperCase()}${labels[status].slice(1)} concierge request`,
        `Are you sure you want to ${labels[status]} this concierge request for ${item.creator_name || "this member"} and ${item.recipient_name || "their match"}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: status === "cancelled" ? "Cancel request" : `${labels[status][0].toUpperCase()}${labels[status].slice(1)}`,
            style: status === "cancelled" ? "destructive" : "default",
            onPress: async () => {
              const { data, error: rpcError } = await supabase.rpc("rpc_admin_update_date_plan_concierge_request", {
                p_request_id: item.request_id,
                p_status: status,
              });
              if (rpcError || !data) {
                Alert.alert("Admin action failed", rpcError?.message || "Unable to update concierge request.");
                return;
              }
              void loadDashboard();
            },
          },
        ],
      );
    },
    [loadDashboard],
  );

  const handleMergeStatus = useCallback(
    async (
      item: AccountMergeCaseRow,
      status: "reviewing" | "approved" | "rejected" | "failed" | "cancelled",
    ) => {
      const statusLabel = status.replace(/^\w/, (char) => char.toUpperCase());
      Alert.alert(
        `${statusLabel} merge case`,
        `Update this recovery case from ${item.source_name || "source"} to ${item.target_name || "target"} as ${status}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: statusLabel,
            style: ["rejected", "failed", "cancelled"].includes(status) ? "destructive" : "default",
            onPress: async () => {
              const { data, error: rpcError } = await supabase.rpc("rpc_admin_update_account_merge_case", {
                p_case_id: item.id,
                p_status: status,
                p_notes: null,
                p_execution_summary: null,
              });
              if (rpcError || !data) {
                Alert.alert("Admin action failed", rpcError?.message || "Unable to update merge case.");
                return;
              }
              void loadDashboard();
            },
          },
        ],
      );
    },
    [loadDashboard],
  );

  const handleExecuteMerge = useCallback(
    async (item: AccountMergeCaseRow) => {
      Alert.alert(
        "Execute merge",
        `Execute the approved merge from ${item.source_name || "source"} to ${item.target_name || "target"} now?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Execute merge",
            style: "destructive",
            onPress: async () => {
              const { data, error: rpcError } = await supabase.rpc("rpc_admin_execute_account_merge_case", {
                p_case_id: item.id,
              });
              const summary = (data as AccountMergeExecutionSummary | null) ?? null;
              if (rpcError || summary?.success === false || summary?.error_message) {
                Alert.alert(
                  "Merge failed",
                  `${formatMergeFailureMessage(summary, rpcError?.message)}\n\nThe case was marked failed and the details were logged.`,
                );
                void loadDashboard();
                return;
              }
              const countEntries = Object.entries(summary?.counts || {});
              const countPreview =
                countEntries.length === 0
                  ? "No row counts were returned."
                  : countEntries
                      .slice(0, 5)
                      .map(([label, count]) => `${label}: ${String(count ?? 0)}`)
                      .join("\n");
              Alert.alert("Merge executed", countPreview);
              void loadDashboard();
            },
          },
        ],
      );
    },
    [loadDashboard],
  );

  const handleMergePreflight = useCallback(
    async (item: AccountMergeCaseRow) => {
      const { data, error: rpcError } = await supabase.rpc("rpc_admin_preview_account_merge_case", {
        p_case_id: item.id,
      });
      if (rpcError) {
        Alert.alert("Preflight failed", rpcError.message || "Unable to preview account merge.");
        return;
      }
      setSelectedMergePreflight((data as AccountMergePreflight | null) ?? null);
      setMergePreflightModalVisible(true);
      void loadDashboard();
    },
    [loadDashboard],
  );

  const handleRecoveryRequestStatus = useCallback(
    async (item: AccountRecoveryRequestRow, status: Exclude<AccountRecoveryRequestStatus, "pending">) => {
      const statusLabel = status.replace(/^\w/, (char) => char.toUpperCase());
      Alert.alert(
        `${statusLabel} recovery request`,
        `Update this request from ${item.requester_name || "this member"} to ${status}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: statusLabel,
            style: status === "closed" ? "destructive" : "default",
            onPress: async () => {
              const { data, error } = await supabase.functions.invoke("admin-update-account-recovery-request", {
                body: {
                  requestId: item.id,
                  status,
                  reviewNotes: null,
                  linkedMergeCaseId: null,
                },
              });
              if (error || !(data as any)?.success) {
                Alert.alert("Admin action failed", error?.message || "Unable to update recovery request.");
                return;
              }
              const warning = (data as any)?.notifications?.warning;
              if (status === "resolved" && warning) {
                Alert.alert("Recovery marked resolved", "Status was updated, but the recovery email could not be sent automatically.");
              }
              void loadDashboard();
            },
          },
        ],
      );
    },
    [loadDashboard],
  );

  const closeRecoveryReviewModal = useCallback(() => {
    setRecoveryReviewModalVisible(false);
    setRecoveryReviewRequest(null);
    setRecoveryReviewStatusDraft("reviewing");
    setRecoveryReviewNotesDraft("");
    setRecoveryReviewError(null);
    setRecoveryReviewSubmitting(false);
  }, []);

  const openRecoveryReviewModal = useCallback((item: AccountRecoveryRequestRow) => {
    setRecoveryReviewRequest(item);
    setRecoveryReviewStatusDraft(((item.status || "pending").toLowerCase() as AccountRecoveryRequestStatus) || "pending");
    setRecoveryReviewNotesDraft(item.review_notes || "");
    setRecoveryReviewError(null);
    setRecoveryReviewSubmitting(false);
    setRecoveryReviewModalVisible(true);
  }, []);

  const handleSaveRecoveryReview = useCallback(async () => {
    if (!recoveryReviewRequest) return;

    setRecoveryReviewError(null);
    setRecoveryReviewSubmitting(true);

    const { data, error } = await supabase.functions.invoke("admin-update-account-recovery-request", {
      body: {
        requestId: recoveryReviewRequest.id,
        status: recoveryReviewStatusDraft,
        reviewNotes: recoveryReviewNotesDraft.trim() || null,
        linkedMergeCaseId: recoveryReviewRequest.linked_merge_case_id,
      },
    });

    if (error || !(data as any)?.success) {
      setRecoveryReviewSubmitting(false);
      setRecoveryReviewError(error?.message || "Unable to save recovery review.");
      return;
    }

    const warning = (data as any)?.notifications?.warning;
    if (recoveryReviewStatusDraft === "resolved" && warning) {
      Alert.alert("Recovery marked resolved", "Status was updated, but the recovery email could not be sent automatically.");
    }
    closeRecoveryReviewModal();
    void loadDashboard();
  }, [
    closeRecoveryReviewModal,
    loadDashboard,
    recoveryReviewNotesDraft,
    recoveryReviewRequest,
    recoveryReviewStatusDraft,
  ]);

  const openCreateMergeCaseModal = useCallback((item: AccountRecoveryRequestRow) => {
    setSelectedRecoveryRequest(item);
    setMergeDraftSourceUserId("");
    setMergeDraftTargetUserId(item.requester_user_id || "");
    setMergeDraftReason(
      item.note?.trim() ||
        `User-filed recovery request: ${(item.current_sign_in_method || "unknown").toUpperCase()} to ${(item.previous_sign_in_method || "unknown").toUpperCase()}`,
    );
    setMergeDraftNotes("");
    setMergeDraftError(null);
    setCreateMergeModalVisible(true);
  }, []);

  const handleCreateMergeCaseFromRequest = useCallback(async () => {
    if (!selectedRecoveryRequest) return;

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
        recovery_request_id: selectedRecoveryRequest.id,
        requester_user_id: selectedRecoveryRequest.requester_user_id,
        current_sign_in_method: selectedRecoveryRequest.current_sign_in_method,
        previous_sign_in_method: selectedRecoveryRequest.previous_sign_in_method,
        contact_email: selectedRecoveryRequest.contact_email,
        previous_account_email: selectedRecoveryRequest.previous_account_email,
      };

      const { data: mergeCaseId, error: createError } = await supabase.rpc("rpc_admin_create_account_merge_case", {
        p_source_user_id: sourceUserId,
        p_target_user_id: targetUserId,
        p_source_profile_id: null,
        p_target_profile_id: null,
        p_request_channel: "user_report",
        p_candidate_reason: mergeDraftReason.trim() || null,
        p_evidence: evidence,
        p_requester_user_id: selectedRecoveryRequest.requester_user_id,
        p_notes: mergeDraftNotes.trim() || null,
      });

      if (createError || !mergeCaseId) {
        throw createError ?? new Error("Unable to create merge case.");
      }

      const { data: linked, error: linkError } = await supabase.rpc("rpc_admin_update_account_recovery_request", {
        p_request_id: selectedRecoveryRequest.id,
        p_status: "reviewing",
        p_review_notes: `Linked to merge case ${mergeCaseId}.`,
        p_linked_merge_case_id: mergeCaseId,
      });

      if (linkError || !linked) {
        throw linkError ?? new Error("Merge case was created, but the recovery request could not be linked.");
      }

      setCreateMergeModalVisible(false);
      setSelectedRecoveryRequest(null);
      setMergeDraftSubmitting(false);
      void loadDashboard();
      router.push(`/admin-merge-case/${mergeCaseId}`);
    } catch (error: any) {
      setMergeDraftSubmitting(false);
      setMergeDraftError(error?.message ?? "Unable to create the merge case.");
    }
  }, [
    loadDashboard,
    mergeDraftNotes,
    mergeDraftReason,
    mergeDraftSourceUserId,
    mergeDraftTargetUserId,
    selectedRecoveryRequest,
  ]);

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
  const openConciergeRequests = conciergeRequests.filter((item) => ["pending", "claimed"].includes((item.request_status || "").toLowerCase()));
  const openRecoveryRequests = accountRecoveryRequests.filter((item) => ["pending", "reviewing"].includes((item.status || "").toLowerCase()));
  const openMergeCases = accountMergeCases.filter((item) =>
    ["pending", "reviewing", "approved", "scheduled"].includes((item.status || "").toLowerCase()),
  );
  const recoveryReviewingCount = accountRecoveryRequests.filter((item) => (item.status || "").toLowerCase() === "reviewing").length;
  const recoveryResolvedCount = accountRecoveryRequests.filter((item) => (item.status || "").toLowerCase() === "resolved").length;
  const mergeReviewingCount = accountMergeCases.filter((item) => (item.status || "").toLowerCase() === "reviewing").length;
  const mergeApprovedCount = accountMergeCases.filter((item) => (item.status || "").toLowerCase() === "approved").length;
  const mergeFailedCount = accountMergeCases.filter((item) => (item.status || "").toLowerCase() === "failed").length;

  const metricCards: {
    key: "verification" | "reports" | "concierge" | "recovery_requests" | "merges";
    label: string;
    value: number;
    icon: string;
    helper: string;
  }[] = [
    {
      key: "verification",
      label: "Pending verification",
      value: overview.pending_verifications,
      icon: "shield-account-outline",
      helper: "Open queue",
    },
    {
      key: "reports",
      label: "Open reports",
      value: overview.open_reports,
      icon: "flag-outline",
      helper: "Moderation queue",
    },
    {
      key: "concierge",
      label: "Date concierge",
      value: openConciergeRequests.length,
      icon: "calendar-heart",
      helper: "Planning help queue",
    },
    {
      key: "recovery_requests",
      label: "Recovery requests",
      value: openRecoveryRequests.length,
      icon: "account-alert-outline",
      helper: "User support queue",
    },
    {
      key: "merges",
      label: "Merge cases",
      value: openMergeCases.length,
      icon: "account-switch-outline",
      helper: "Recovery execution",
    },
    {
      key: "verification",
      label: "Members",
      value: overview.members_total,
      icon: "account-group-outline",
      helper: "Member base",
    },
    {
      key: "reports",
      label: "Unread rejections",
      value: overview.rejected_unread,
      icon: "bell-alert-outline",
      helper: "Follow-up needed",
    },
  ];

  const operationCards = [
    {
      key: "verification" as const,
      title: "Verification queue",
      subtitle: `${pendingVerifications.length} pending`,
      detail: pendingVerifications.length > 0 ? "Review documents and approve or reject." : "No one is waiting right now.",
      icon: "shield-check-outline",
    },
    {
      key: "reports" as const,
      title: "Moderation queue",
      subtitle: `${activeReports.length} active`,
      detail: activeReports.length > 0 ? "Move reports from pending to resolved." : "No active moderation reports.",
      icon: "gavel",
    },
    {
      key: "concierge" as const,
      title: "Date concierge",
      subtitle: `${openConciergeRequests.length} open`,
      detail: openConciergeRequests.length > 0 ? "Check who needs planning help next." : "No open concierge requests.",
      icon: "calendar-star",
    },
    {
      key: "recovery_requests" as const,
      title: "Recovery requests",
      subtitle: `${openRecoveryRequests.length} open`,
      detail: openRecoveryRequests.length > 0 ? "Triage user-submitted account access issues." : "No open recovery requests.",
      icon: "account-question-outline",
    },
    {
      key: "merges" as const,
      title: "Merge cases",
      subtitle: `${openMergeCases.length} open`,
      detail: openMergeCases.length > 0 ? "Review duplicate-account merge cases." : "No open account recovery cases.",
      icon: "account-convert-outline",
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.metricsGrid}>
          {metricCards.map((metric) => (
            <Pressable key={metric.label} style={styles.metricCard} onPress={() => setActiveTab(metric.key)}>
              <View style={styles.metricIcon}>
                <MaterialCommunityIcons name={metric.icon as any} size={18} color={theme.tint} />
              </View>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricHelper}>{metric.helper}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Operations</Text>
          <View style={styles.operationsGrid}>
            {operationCards.map((card) => (
              <Pressable
                key={card.title}
                style={[styles.operationCard, activeTab === card.key && styles.operationCardActive]}
                onPress={() => setActiveTab(card.key)}
              >
                <View style={styles.operationIcon}>
                  <MaterialCommunityIcons name={card.icon as any} size={18} color={theme.tint} />
                </View>
                <Text style={styles.operationTitle}>{card.title}</Text>
                <Text style={styles.operationSubtitle}>{card.subtitle}</Text>
                <Text style={styles.operationDetail}>{card.detail}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Revenue and member health</Text>
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
          <View style={styles.planRow}>
            <View style={styles.planPill}>
              <Text style={styles.planPillLabel}>Active subscriptions</Text>
              <Text style={styles.planPillValue}>{overview.active_subscriptions}</Text>
            </View>
            <View style={styles.planPill}>
              <Text style={styles.planPillLabel}>New in 7 days</Text>
              <Text style={styles.planPillValue}>{overview.members_last_7d}</Text>
            </View>
          </View>
        </View>

        {moduleWarnings.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Module status</Text>
            {moduleWarnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                {warning}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.tabRow}>
          {[
            { key: "verification", label: `Verification (${pendingVerifications.length})` },
            { key: "reports", label: `Reports (${activeReports.length})` },
            { key: "concierge", label: `Concierge (${openConciergeRequests.length})` },
            { key: "recovery_requests", label: `Requests (${openRecoveryRequests.length})` },
            { key: "merges", label: `Recovery (${openMergeCases.length})` },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key as "verification" | "reports" | "concierge" | "recovery_requests" | "merges")}
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
                const isVideoAsset = isVideoVerificationAsset(item, documentUrl);
                const checklist = getVerificationReviewChecklist(item);
                const rejectReasons = getVerificationRejectReasons(item);
                const socialEvidence = getSocialVerificationEvidence(item);
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
                            {`${item.current_country || "Unknown country"} • ${formatVerificationType(item.verification_type)}`}
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

                    {item.verification_refresh_required ? (
                      <View style={styles.socialEvidenceCard}>
                        <Text style={styles.socialEvidenceTitle}>Fresh review requested</Text>
                        <Text style={styles.socialEvidenceText}>
                          Target level: {item.verification_refresh_target_level || item.verification_level || 1}
                        </Text>
                        {item.verification_refresh_reason ? (
                          <Text style={styles.socialEvidenceText}>{item.verification_refresh_reason}</Text>
                        ) : null}
                      </View>
                    ) : null}

                    {socialEvidence ? (
                      <View style={styles.socialEvidenceCard}>
                        <Text style={styles.socialEvidenceTitle}>Linked social proof</Text>
                        <Text style={styles.socialEvidenceText}>
                          Platform: {socialEvidence.platform || "Not specified"}
                        </Text>
                        {socialEvidence.handle ? (
                          <Text style={styles.socialEvidenceText}>Handle: @{socialEvidence.handle}</Text>
                        ) : null}
                        {socialEvidence.profileUrl ? (
                          <Pressable
                            style={styles.socialEvidenceLink}
                            onPress={() => void Linking.openURL(socialEvidence.profileUrl as string)}
                          >
                            <MaterialCommunityIcons name="open-in-new" size={14} color={theme.tint} />
                            <Text style={styles.socialEvidenceLinkText} numberOfLines={1}>
                              {socialEvidence.profileUrl}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.reviewChecklistCard}>
                      <Text style={styles.reviewChecklistTitle}>Reviewer checklist</Text>
                      {checklist.map((point) => (
                        <View key={`${item.id}:${point}`} style={styles.reviewChecklistRow}>
                          <MaterialCommunityIcons name="check-decagram-outline" size={14} color={theme.tint} />
                          <Text style={styles.reviewChecklistText}>{point}</Text>
                        </View>
                      ))}
                    </View>

                    {item.document_url ? (
                      <View style={styles.documentCard}>
                        <Pressable
                          style={styles.documentPreview}
                          onPress={() => {
                            setSelectedVerification(item);
                            setImageModalVisible(true);
                          }}
                        >
                          <VerificationAssetPreview
                            uri={documentUrl}
                            isVideo={isVideoAsset}
                            style={styles.documentImage}
                            videoStyle={styles.videoPreview}
                            placeholderStyle={styles.documentPlaceholder}
                            placeholderTextStyle={styles.documentPlaceholderText}
                            videoBadgeStyle={styles.videoPreviewBadge}
                            videoBadgeTextStyle={styles.videoPreviewBadgeText}
                            muted
                            autoPlay
                            loop
                            nativeControls={false}
                          />
                        </Pressable>
                      </View>
                    ) : null}

                    {item.status === "pending" ? (
                      <>
                        <View style={styles.rejectReasonRow}>
                          {rejectReasons.map((reason) => (
                            <Pressable
                              key={`${item.id}:${reason}`}
                              style={styles.rejectReasonChip}
                              onPress={() => void handleVerificationDecision(item, "rejected", reason)}
                            >
                              <Text style={styles.rejectReasonChipText}>{reason}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <View style={styles.actionRow}>
                          <Pressable style={styles.approveButton} onPress={() => void handleVerificationDecision(item, "approved")}>
                            <Text style={styles.actionButtonText}>Approve</Text>
                          </Pressable>
                          <Pressable style={styles.rejectButton} onPress={() => void handleVerificationDecision(item, "rejected")}>
                            <Text style={styles.actionButtonText}>Reject</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : null}
                    {item.status === "approved" && item.profile_id ? (
                      <View style={styles.actionRow}>
                        {item.verification_refresh_required ? (
                          <>
                            <View style={[styles.secondaryAction, styles.disabledAction]}>
                              <Text style={[styles.secondaryActionText, styles.disabledActionText]}>
                                Refresh requested
                              </Text>
                            </View>
                            <Pressable
                              style={styles.rejectButton}
                              onPress={() => void handleClearFreshReview(item)}
                            >
                              <Text style={styles.actionButtonText}>Cancel request</Text>
                            </Pressable>
                          </>
                        ) : (
                          <Pressable
                            style={styles.secondaryAction}
                            onPress={() => void handleRequestFreshReview(item)}
                          >
                            <Text style={styles.secondaryActionText}>Ask fresh review</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        ) : activeTab === "reports" ? (
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
                        {item.reporter_name || "Unknown reporter"}{" -> "}{item.reported_name || "Unknown member"}
                      </Text>
                      <Text style={styles.identityMeta}>
                        {new Date(item.created_at).toLocaleDateString()} - {item.status}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, ["PENDING", "REVIEWING"].includes(item.status) ? styles.statusPending : styles.statusApproved]}>
                      <Text style={styles.statusPillText}>{item.status}</Text>
                    </View>
                  </View>

                  <Text style={styles.reportReason}>{item.reason}</Text>

                  {item.evidence_message_id ? (
                    <View style={styles.reportEvidenceCard}>
                      <View style={styles.reportEvidenceHeader}>
                        <Text style={styles.reportEvidenceTitle}>Attached message evidence</Text>
                        <Text style={styles.reportEvidenceMeta}>
                          {(item.evidence_message_type || "message").toUpperCase()}
                          {item.evidence_message_created_at ? ` - ${new Date(item.evidence_message_created_at).toLocaleString()}` : ""}
                        </Text>
                      </View>
                      <Text style={styles.reportEvidenceText}>
                        {item.evidence_message_text || "No text snapshot was available for this message."}
                      </Text>
                    </View>
                  ) : null}

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
        ) : activeTab === "concierge" ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Date concierge queue</Text>
            {conciergeRequests.length === 0 ? (
              <Text style={styles.emptyText}>No date-planning requests are active right now.</Text>
            ) : (
              conciergeRequests.map((item) => (
                <View key={item.request_id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.identityCopy}>
                      <Text style={styles.identityName}>
                        {(item.creator_name || "Unknown") + " and " + (item.recipient_name || "Unknown")}
                      </Text>
                      <Text style={styles.identityMeta}>
                        Requested by {item.requested_by_name || "participant"}{" - "}
                        {new Date(item.requested_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, ["pending", "claimed"].includes(item.request_status) ? styles.statusPending : styles.statusApproved]}>
                      <Text style={styles.statusPillText}>{item.request_status}</Text>
                    </View>
                  </View>
                  <Text style={styles.reportReason}>
                    {(item.place_name || "Date plan") +
                      (item.city ? `, ${item.city}` : "") +
                      (item.scheduled_for ? ` - ${new Date(item.scheduled_for).toLocaleString()}` : "")}
                  </Text>
                  {item.request_note ? <Text style={styles.reviewerNote}>{item.request_note}</Text> : null}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Plan status: {item.date_plan_status}</Text>
                    <Text style={styles.metaText}>Request id: {item.request_id.slice(0, 8)}</Text>
                  </View>
                  <View style={styles.actionRow}>
                    {(item.request_status || "").toLowerCase() === "pending" ? (
                      <Pressable style={styles.secondaryAction} onPress={() => void handleConciergeStatus(item, "claimed")}>
                        <Text style={styles.secondaryActionText}>Claim</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "claimed"].includes((item.request_status || "").toLowerCase()) ? (
                      <Pressable style={styles.approveButton} onPress={() => void handleConciergeStatus(item, "completed")}>
                        <Text style={styles.actionButtonText}>Complete</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "claimed"].includes((item.request_status || "").toLowerCase()) ? (
                      <Pressable style={styles.rejectButton} onPress={() => void handleConciergeStatus(item, "cancelled")}>
                        <Text style={styles.actionButtonText}>Cancel</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        ) : activeTab === "recovery_requests" ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account recovery requests</Text>
            <View style={styles.planRow}>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>Reviewing</Text>
                <Text style={styles.planPillValue}>{recoveryReviewingCount}</Text>
              </View>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>Resolved</Text>
                <Text style={styles.planPillValue}>{recoveryResolvedCount}</Text>
              </View>
            </View>
            {accountRecoveryRequests.length === 0 ? (
              <Text style={styles.emptyText}>No user-filed recovery requests are waiting right now.</Text>
            ) : (
              accountRecoveryRequests.map((item) => (
                <View key={item.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.identityCopy}>
                      <Text style={styles.identityName}>{item.requester_name || item.contact_email || "Unknown member"}</Text>
                      <Text style={styles.identityMeta}>
                        {(item.current_sign_in_method || "unknown").toUpperCase()}{" -> "}{(item.previous_sign_in_method || "unknown").toUpperCase()}
                        {" - "}
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        ["resolved"].includes((item.status || "").toLowerCase())
                          ? styles.statusApproved
                          : ["closed"].includes((item.status || "").toLowerCase())
                            ? styles.statusRejected
                            : styles.statusPending,
                      ]}
                    >
                      <Text style={styles.statusPillText}>{item.status}</Text>
                    </View>
                  </View>
                  {item.note ? <Text style={styles.reportReason}>{item.note}</Text> : null}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Contact: {item.contact_email || "Not provided"}</Text>
                    <Text style={styles.metaText}>Previous email: {item.previous_account_email || "Unknown"}</Text>
                  </View>
                  {item.review_notes ? <Text style={styles.reviewerNote}>{item.review_notes}</Text> : null}
                  <View style={styles.actionRow}>
                    <Pressable style={styles.secondaryAction} onPress={() => router.push(`/admin-recovery-request/${item.id}`)}>
                      <Text style={styles.secondaryActionText}>Open request</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryAction} onPress={() => openRecoveryReviewModal(item)}>
                      <Text style={styles.secondaryActionText}>{item.review_notes ? "Edit note" : "Add note"}</Text>
                    </Pressable>
                    {(item.status || "").toLowerCase() === "pending" ? (
                      <Pressable style={styles.secondaryAction} onPress={() => void handleRecoveryRequestStatus(item, "reviewing")}>
                        <Text style={styles.secondaryActionText}>Review</Text>
                      </Pressable>
                    ) : null}
                    {!item.linked_merge_case_id ? (
                      <Pressable style={styles.secondaryAction} onPress={() => openCreateMergeCaseModal(item)}>
                        <Text style={styles.secondaryActionText}>Create merge case</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "reviewing"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.approveButton} onPress={() => void handleRecoveryRequestStatus(item, "resolved")}>
                        <Text style={styles.actionButtonText}>Resolve</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "reviewing", "resolved"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.rejectButton} onPress={() => void handleRecoveryRequestStatus(item, "closed")}>
                        <Text style={styles.actionButtonText}>Close</Text>
                      </Pressable>
                    ) : null}
                    {item.linked_merge_case_id ? (
                      <Pressable style={styles.secondaryAction} onPress={() => router.push(`/admin-merge-case/${item.linked_merge_case_id}`)}>
                        <Text style={styles.secondaryActionText}>Open merge case</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account merge queue</Text>
            <View style={styles.planRow}>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>Reviewing</Text>
                <Text style={styles.planPillValue}>{mergeReviewingCount}</Text>
              </View>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>Approved</Text>
                <Text style={styles.planPillValue}>{mergeApprovedCount}</Text>
              </View>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>Failed</Text>
                <Text style={styles.planPillValue}>{mergeFailedCount}</Text>
              </View>
            </View>
            {accountMergeCases.length === 0 ? (
              <Text style={styles.emptyText}>No duplicate-account recovery cases have been filed yet.</Text>
            ) : (
              accountMergeCases.map((item) => (
                <View key={item.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.identityCopy}>
                      <Text style={styles.identityName}>
                        {(item.source_name || "Unknown source") + " -> " + (item.target_name || "Unknown target")}
                      </Text>
                      <Text style={styles.identityMeta}>
                        {(item.request_channel || "support").toUpperCase()}{" - "}
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        ["failed", "rejected", "cancelled"].includes((item.status || "").toLowerCase())
                          ? styles.statusRejected
                          : ["completed"].includes((item.status || "").toLowerCase())
                            ? styles.statusApproved
                            : styles.statusPending,
                      ]}
                    >
                      <Text style={styles.statusPillText}>{item.status}</Text>
                    </View>
                  </View>
                  {item.candidate_reason ? <Text style={styles.reportReason}>{item.candidate_reason}</Text> : null}
                  {item.notes ? <Text style={styles.reviewerNote}>{item.notes}</Text> : null}
                  {((item.execution_summary as AccountMergeExecutionSummary | null)?.error_message || null) ? (
                    <View style={styles.failureNote}>
                      <Text style={styles.failureNoteTitle}>Last execution failed</Text>
                      <Text style={styles.failureNoteBody}>
                        {(item.execution_summary as AccountMergeExecutionSummary | null)?.error_message}
                      </Text>
                      {((item.execution_summary as AccountMergeExecutionSummary | null)?.failed_step || null) ? (
                        <Text style={styles.metaText}>
                          Step: {(item.execution_summary as AccountMergeExecutionSummary | null)?.failed_step}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Source user: {item.source_user_id.slice(0, 8)}</Text>
                    <Text style={styles.metaText}>Target user: {item.target_user_id.slice(0, 8)}</Text>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable style={styles.secondaryAction} onPress={() => router.push(`/admin-merge-case/${item.id}`)}>
                      <Text style={styles.secondaryActionText}>Open case</Text>
                    </Pressable>
                    {["pending", "reviewing", "approved", "scheduled"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.secondaryAction} onPress={() => void handleMergePreflight(item)}>
                        <Text style={styles.secondaryActionText}>Preflight</Text>
                      </Pressable>
                    ) : null}
                    {(item.status || "").toLowerCase() === "pending" ? (
                      <Pressable style={styles.secondaryAction} onPress={() => void handleMergeStatus(item, "reviewing")}>
                        <Text style={styles.secondaryActionText}>Review</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "reviewing"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.approveButton} onPress={() => void handleMergeStatus(item, "approved")}>
                        <Text style={styles.actionButtonText}>Approve</Text>
                      </Pressable>
                    ) : null}
                    {["approved", "scheduled"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.approveButton} onPress={() => void handleExecuteMerge(item)}>
                        <Text style={styles.actionButtonText}>Execute merge</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "reviewing"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.rejectButton} onPress={() => void handleMergeStatus(item, "rejected")}>
                        <Text style={styles.actionButtonText}>Reject</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "reviewing", "approved", "scheduled"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.rejectButton} onPress={() => void handleMergeStatus(item, "failed")}>
                        <Text style={styles.actionButtonText}>Fail</Text>
                      </Pressable>
                    ) : null}
                    {["pending", "reviewing", "approved", "scheduled"].includes((item.status || "").toLowerCase()) ? (
                      <Pressable style={styles.secondaryAction} onPress={() => void handleMergeStatus(item, "cancelled")}>
                        <Text style={styles.secondaryActionText}>Cancel case</Text>
                      </Pressable>
                    ) : null}
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
              {(selectedVerification?.full_name || "Verification document") + " • " + formatVerificationType(selectedVerification?.verification_type)}
            </Text>
            <VerificationAssetPreview
              uri={selectedVerification ? documentUrls[selectedVerification.id] : undefined}
              isVideo={selectedVerification ? isVideoVerificationAsset(selectedVerification, documentUrls[selectedVerification.id]) : false}
              style={styles.modalImage}
              videoStyle={styles.videoPreview}
              placeholderStyle={styles.documentPlaceholder}
              placeholderTextStyle={styles.documentPlaceholderText}
              videoBadgeStyle={styles.videoPreviewBadge}
              videoBadgeTextStyle={styles.videoPreviewBadgeText}
              muted={false}
              autoPlay={false}
              loop={false}
              nativeControls
            />
            {selectedVerification ? (
              <View style={styles.modalInfoCard}>
                <Text style={styles.modalInfoLabel}>Review focus</Text>
                {getVerificationReviewChecklist(selectedVerification).map((point) => (
                  <Text key={`modal:${selectedVerification.id}:${point}`} style={styles.modalInfoMeta}>
                    * {point}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={mergePreflightModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMergePreflightModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalClose} onPress={() => setMergePreflightModalVisible(false)}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Merge preflight</Text>
            <Text style={styles.modalBody}>
              {selectedMergePreflight?.recommendation || "Review the linked rows before completing this merge case."}
            </Text>
            <View style={styles.preflightSummaryRow}>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>Combined</Text>
                <Text style={styles.planPillValue}>{Number(selectedMergePreflight?.totals?.combined_rows ?? 0)}</Text>
              </View>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>User refs</Text>
                <Text style={styles.planPillValue}>{Number(selectedMergePreflight?.totals?.user_reference_rows ?? 0)}</Text>
              </View>
              <View style={styles.planPill}>
                <Text style={styles.planPillLabel}>Profile refs</Text>
                <Text style={styles.planPillValue}>{Number(selectedMergePreflight?.totals?.profile_reference_rows ?? 0)}</Text>
              </View>
            </View>
            <ScrollView style={styles.preflightList} contentContainerStyle={styles.preflightListContent}>
              {(selectedMergePreflight?.references || []).length === 0 ? (
                <Text style={styles.emptyText}>No linked reference rows were found for this case.</Text>
              ) : (
                (selectedMergePreflight?.references || []).map((ref, index) => (
                  <View
                    key={`${ref.table || "table"}:${ref.column || "column"}:${index}`}
                    style={styles.preflightRefCard}
                  >
                    <View style={styles.preflightRefHeader}>
                      <Text style={styles.identityName}>{ref.table || "Unknown table"}</Text>
                      <View style={styles.statusPill}>
                        <Text style={styles.statusPillText}>{String(ref.count ?? 0)}</Text>
                      </View>
                    </View>
                    <Text style={styles.identityMeta}>
                      {(ref.scope || "unknown").toUpperCase()} - {ref.column || "unknown column"}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={recoveryReviewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRecoveryReviewModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
        >
          <Pressable style={styles.modalClose} onPress={closeRecoveryReviewModal}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Recovery review</Text>
            <Text style={styles.modalBody}>
              Add internal notes and keep the recovery request status aligned with the support work.
            </Text>
            <View style={styles.modalInfoCard}>
              <Text style={styles.modalInfoLabel}>Requester</Text>
              <Text style={styles.modalInfoValue}>
                {recoveryReviewRequest?.requester_name || recoveryReviewRequest?.contact_email || "Unknown member"}
              </Text>
              <Text style={styles.modalInfoMeta}>
                Signed in with: {(recoveryReviewRequest?.current_sign_in_method || "unknown").toUpperCase()}
              </Text>
              <Text style={styles.modalInfoMeta}>
                Wants back: {(recoveryReviewRequest?.previous_sign_in_method || "unknown").toUpperCase()}
              </Text>
            </View>
            <View style={styles.statusChoiceRow}>
              {(["pending", "reviewing", "resolved", "closed"] as AccountRecoveryRequestStatus[]).map((status) => (
                <Pressable
                  key={status}
                  style={[
                    styles.statusChoiceButton,
                    recoveryReviewStatusDraft === status ? styles.statusChoiceButtonActive : null,
                  ]}
                  onPress={() => setRecoveryReviewStatusDraft(status)}
                >
                  <Text
                    style={[
                      styles.statusChoiceText,
                      recoveryReviewStatusDraft === status ? styles.statusChoiceTextActive : null,
                    ]}
                  >
                    {status}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={recoveryReviewNotesDraft}
              onChangeText={setRecoveryReviewNotesDraft}
              placeholder="Review notes for support handoff or follow-up"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.modalTextArea, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            {recoveryReviewError ? <Text style={styles.modalErrorText}>{recoveryReviewError}</Text> : null}
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryAction} onPress={closeRecoveryReviewModal}>
                <Text style={styles.secondaryActionText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.approveButton, { opacity: recoveryReviewSubmitting ? 0.7 : 1 }]}
                onPress={() => void handleSaveRecoveryReview()}
                disabled={recoveryReviewSubmitting}
              >
                <Text style={styles.actionButtonText}>{recoveryReviewSubmitting ? "Saving..." : "Save review"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={createMergeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateMergeModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
        >
          <Pressable style={styles.modalClose} onPress={() => setCreateMergeModalVisible(false)}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create merge case</Text>
            <Text style={styles.modalBody}>
              Recovery requests do not contain enough information to infer which account should be kept. Enter the two user IDs deliberately before creating the merge case.
            </Text>
            <View style={styles.modalInfoCard}>
              <Text style={styles.modalInfoLabel}>Requester</Text>
              <Text style={styles.modalInfoValue}>{selectedRecoveryRequest?.requester_name || selectedRecoveryRequest?.contact_email || "Unknown member"}</Text>
              <Text style={styles.modalInfoMeta}>Signed in with: {(selectedRecoveryRequest?.current_sign_in_method || "unknown").toUpperCase()}</Text>
              <Text style={styles.modalInfoMeta}>Wants back: {(selectedRecoveryRequest?.previous_sign_in_method || "unknown").toUpperCase()}</Text>
            </View>
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
              style={[styles.modalTextArea, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            <TextInput
              value={mergeDraftNotes}
              onChangeText={setMergeDraftNotes}
              placeholder="Internal notes"
              placeholderTextColor={theme.textMuted}
              multiline
              style={[styles.modalTextArea, { color: theme.text, borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            />
            {mergeDraftError ? <Text style={styles.modalErrorText}>{mergeDraftError}</Text> : null}
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryAction} onPress={() => setCreateMergeModalVisible(false)}>
                <Text style={styles.secondaryActionText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.approveButton, { opacity: mergeDraftSubmitting ? 0.7 : 1 }]}
                onPress={() => void handleCreateMergeCaseFromRequest()}
                disabled={mergeDraftSubmitting}
              >
                <Text style={styles.actionButtonText}>{mergeDraftSubmitting ? "Creating..." : "Create and link"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingBottom: 28, gap: 16 },
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
    metricHelper: { color: theme.tint, fontSize: 11, fontFamily: "Manrope_600SemiBold" },
    sectionCard: {
      borderRadius: 20,
      padding: 16,
      gap: 12,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    sectionTitle: { color: theme.text, fontSize: 18, fontFamily: "Archivo_700Bold" },
    warningText: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
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
    operationsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    operationCard: {
      width: "48%",
      borderRadius: 18,
      padding: 14,
      gap: 8,
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.9),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    operationCardActive: {
      borderColor: withAlpha(theme.tint, 0.5),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    },
    operationIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.12),
    },
    operationTitle: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    operationSubtitle: { color: theme.tint, fontSize: 12, fontFamily: "Manrope_600SemiBold" },
    operationDetail: { color: theme.textMuted, fontSize: 12, lineHeight: 17, fontFamily: "Manrope_500Medium" },
    tabRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
    tabButton: {
      flexGrow: 1,
      minWidth: "47%",
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
    socialEvidenceCard: {
      borderRadius: 14,
      padding: 12,
      gap: 6,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.35 : 0.18),
    },
    socialEvidenceTitle: {
      color: theme.text,
      fontSize: 12,
      fontFamily: "Archivo_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    socialEvidenceText: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: "Manrope_600SemiBold",
    },
    socialEvidenceLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginTop: 2,
    },
    socialEvidenceLinkText: {
      flex: 1,
      color: theme.tint,
      fontSize: 12,
      fontFamily: "Manrope_700Bold",
    },
    reviewChecklistCard: {
      borderRadius: 14,
      padding: 12,
      gap: 8,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.24 : 0.82),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
    },
    reviewChecklistTitle: {
      color: theme.text,
      fontSize: 12,
      fontFamily: "Archivo_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    reviewChecklistRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    reviewChecklistText: {
      flex: 1,
      color: theme.text,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "Manrope_500Medium",
    },
    failureNote: {
      borderRadius: 12,
      padding: 10,
      gap: 4,
      backgroundColor: withAlpha("#D4505A", isDark ? 0.18 : 0.1),
      borderWidth: 1,
      borderColor: withAlpha("#D4505A", isDark ? 0.5 : 0.28),
    },
    failureNoteTitle: { color: theme.text, fontSize: 12, fontFamily: "Archivo_700Bold" },
    failureNoteBody: { color: theme.text, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_600SemiBold" },
    documentCard: { gap: 8 },
    documentPreview: { borderRadius: 14, overflow: "hidden" },
    documentImage: { width: "100%", height: 180, backgroundColor: withAlpha(theme.text, isDark ? 0.12 : 0.06) },
    videoPreviewWrap: {
      overflow: "hidden",
      position: "relative",
      backgroundColor: "#000",
    },
    videoPreview: {
      width: "100%",
      height: "100%",
    },
    videoPreviewBadge: {
      position: "absolute",
      right: 10,
      bottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    videoPreviewBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontFamily: "Archivo_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    documentPlaceholder: { alignItems: "center", justifyContent: "center" },
    documentPlaceholderText: { color: theme.textMuted, fontSize: 12, fontFamily: "Manrope_500Medium" },
    rejectReasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    rejectReasonChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: withAlpha("#D4505A", isDark ? 0.44 : 0.24),
      backgroundColor: withAlpha("#D4505A", isDark ? 0.16 : 0.08),
    },
    rejectReasonChipText: {
      color: "#D4505A",
      fontSize: 11,
      fontFamily: "Manrope_700Bold",
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
    disabledAction: {
      opacity: 0.72,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
    },
    actionButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    secondaryActionText: { color: theme.text, fontSize: 12, fontWeight: "600" },
    disabledActionText: { color: theme.tint },
    emptyText: { color: theme.textMuted, fontSize: 13, lineHeight: 19, fontFamily: "Manrope_500Medium" },
    reportReason: { color: theme.text, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    reportEvidenceCard: {
      gap: 8,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.2),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    },
    reportEvidenceHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    reportEvidenceTitle: {
      flex: 1,
      color: theme.text,
      fontSize: 12,
      fontFamily: "Archivo_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    reportEvidenceMeta: {
      color: theme.tint,
      fontSize: 10,
      fontFamily: "Manrope_800ExtraBold",
      letterSpacing: 0.3,
    },
    reportEvidenceText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: "Manrope_600SemiBold",
    },
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
    modalBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "Manrope_500Medium" },
    modalImage: { width: "100%", height: 420, borderRadius: 14, backgroundColor: withAlpha(theme.text, 0.06) },
    modalInfoCard: {
      borderRadius: 14,
      padding: 12,
      gap: 4,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.28 : 0.78),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    modalInfoLabel: { color: theme.textMuted, fontSize: 11, textTransform: "uppercase", fontFamily: "Manrope_600SemiBold" },
    modalInfoValue: { color: theme.text, fontSize: 14, fontFamily: "Archivo_700Bold" },
    modalInfoMeta: { color: theme.textMuted, fontSize: 11, lineHeight: 16, fontFamily: "Manrope_500Medium" },
    modalInput: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 13,
      fontFamily: "Manrope_500Medium",
    },
    modalTextArea: {
      minHeight: 88,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 13,
      textAlignVertical: "top",
      fontFamily: "Manrope_500Medium",
    },
    modalErrorText: { color: "#ef4444", fontSize: 12, lineHeight: 17, fontFamily: "Manrope_500Medium" },
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
    preflightSummaryRow: { flexDirection: "row", gap: 10 },
    preflightList: { maxHeight: 320 },
    preflightListContent: { gap: 10 },
    preflightRefCard: {
      borderRadius: 14,
      padding: 12,
      gap: 6,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.26 : 0.78),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
    },
    preflightRefHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
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
