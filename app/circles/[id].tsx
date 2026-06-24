import IntentRequestSheet from '@/components/IntentRequestSheet';
import CircleInviteSheet from '@/components/circles/CircleInviteSheet';
import CircleLoveSeatConsentSheet from '@/components/circles/CircleLoveSeatConsentSheet';
import CirclePulseBoard from '@/components/circles/CirclePulseBoard';
import CirclePulseCommentSheet from '@/components/circles/CirclePulseCommentSheet';
import CirclePulseManagerSheet from '@/components/circles/CirclePulseManagerSheet';
import CirclePulseMediaViewer from '@/components/circles/CirclePulseMediaViewer';
import CirclePulseModerationSheet from '@/components/circles/CirclePulseModerationSheet';
import { showBetweenerAlert } from '@/components/ui/BetweenerAlertHost';
import Notice from '@/components/ui/Notice';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import { getCircleScopeLabel } from '@/lib/circles/circle-display';
import { endCircleLoveSeat, fetchCirclePulseDiscussionReadStates } from '@/lib/circles/pulse/circle-pulse-service';
import { respondToCircleInvitation } from '@/lib/circles/circle-invitations';
import { uploadImage } from '@/lib/image-upload';
import { cacheOfflineImage, getOfflineImageUri, resolveOfflineImageUri } from '@/lib/offline/image-store';
import { cacheOfflineVideo, getOfflineVideoUri } from '@/lib/offline/video-store';
import {
  readCirclePulseCommentsSnapshotState,
  readCirclePulseDiscussionReadState,
} from '@/lib/offline/circle-pulse-comments-store';
import {
  readCircleDetailSnapshotState,
  type OfflineCircleDetailSnapshot,
  writeCircleDetailSnapshot,
} from '@/lib/offline/circle-detail-store';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import { getAuthoritativePresenceDisplay } from '@/lib/presence';
import { fetchUsersPresence } from '@/lib/user-presence';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulse } from '@/lib/circles/pulse/use-circle-pulse';
import { createSignedUrl as createMomentSignedUrl } from '@/lib/moments';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DetailTab = 'overview' | 'members' | 'prompts' | 'gatherings' | 'moments';
const DETAIL_TABS: DetailTab[] = ['overview', 'members', 'prompts', 'gatherings', 'moments'];

type Circle = {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  short_description?: string | null;
  visibility?: string | null;
  category?: string | null;
  created_by_profile_id?: string | null;
  created_by_user_id?: string | null;
  cover_image_url?: string | null;
  icon_url?: string | null;
  image_path?: string | null;
  image_updated_at?: string | null;
  circle_type?: string | null;
  status?: string | null;
  visibility_scope?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  region?: string | null;
  city?: string | null;
  is_official?: boolean | null;
  is_partner?: boolean | null;
  is_featured?: boolean | null;
  requires_join_approval?: boolean | null;
  rules?: string | null;
  safety_note?: string | null;
  member_count?: number | null;
  gathering_count?: number | null;
  archived_at?: string | null;
  host_note?: string | null;
  host_note_updated_at?: string | null;
  host_note_updated_by_profile_id?: string | null;
};

type MemberRow = {
  id: string;
  role: string;
  status: string;
  is_visible: boolean;
  profile_id: string;
  user_id?: string | null;
  joined_at?: string | null;
  profiles?: {
    id: string;
    user_id?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    age?: number | null;
    location?: string | null;
    city?: string | null;
    region?: string | null;
    online?: boolean | null;
    last_active?: string | null;
  } | null;
};

const NEW_MEMBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const isCircleOwnerForActor = (
  circle: Pick<Circle, 'created_by_profile_id' | 'created_by_user_id'> | null | undefined,
  profileId?: string | null,
  userId?: string | null,
) =>
  Boolean(
    (circle?.created_by_profile_id && profileId && circle.created_by_profile_id === profileId)
    || (circle?.created_by_user_id && userId && circle.created_by_user_id === userId),
  );

const isRecentCircleMember = (joinedAt?: string | null) => {
  if (!joinedAt) return false;
  const joinedAtMs = new Date(joinedAt).getTime();
  if (Number.isNaN(joinedAtMs)) return false;
  const ageMs = Date.now() - joinedAtMs;
  return ageMs >= 0 && ageMs <= NEW_MEMBER_WINDOW_MS;
};

type CirclePrompt = {
  id: string;
  title: string;
  prompt: string;
  prompt_type?: string | null;
  expires_at?: string | null;
};

type CirclePromptResponse = {
  id: string;
  prompt_id: string;
  profile_id: string;
  response: string;
  created_at: string;
  profiles?: MemberRow['profiles'] | null;
};

type Gathering = {
  id: string;
  title: string;
  description?: string | null;
  poster_url?: string | null;
  presentation_mode?: 'general' | 'seat_linked' | null;
  featured_profile_id?: string | null;
  seat_context?: 'welcome' | 'love' | null;
  host_created_for_member?: boolean | null;
  starts_at: string;
  city?: string | null;
  country_code?: string | null;
  venue_name?: string | null;
  gathering_type?: string | null;
  address_visibility?: string | null;
  is_partner_venue?: boolean | null;
  safe_first_date_space?: boolean | null;
  attendee_count?: number | null;
};

type GatheringAttendance = {
  gathering_id: string;
  status: string;
  visible_to_others: boolean;
};

type CircleMoment = {
  id: string;
  user_id: string;
  type: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  text_body?: string | null;
  caption?: string | null;
  created_at: string;
  expires_at?: string | null;
  visibility?: string | null;
  profile?: MemberRow['profiles'] | null;
};

type CircleManageRole = 'member' | 'matchmaker' | 'moderator' | 'host';
type CircleRoleRequestType = 'moderator' | 'host';

type CircleRoleRequest = {
  id: string;
  circle_id: string;
  requester_profile_id: string;
  requester_user_id?: string | null;
  requested_role: CircleRoleRequestType;
  note?: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
  requester?: MemberRow['profiles'] | null;
};

type CircleReport = {
  id: string;
  circle_id?: string | null;
  gathering_id?: string | null;
  prompt_response_id?: string | null;
  reporter_profile_id: string;
  reason: string;
  details?: string | null;
  status: string;
  created_at: string;
  gathering_title?: string | null;
  prompt_response_text?: string | null;
};

type CircleReportTarget =
  | { type: 'circle'; id: string; title: string }
  | { type: 'gathering'; id: string; title: string }
  | { type: 'prompt_response'; id: string; title: string };

const db = supabase as any;
const CIRCLE_REPORT_REASONS = ['Unsafe behaviour', 'Spam or scam', 'Harassment', 'Impersonation', 'Other'];

const normalizeMemberProfile = (
  input: MemberRow['profiles'] | MemberRow['profiles'][] | undefined,
): MemberRow['profiles'] => {
  if (!input) return null;
  return Array.isArray(input) ? (input[0] ?? null) : input;
};

const compactDate = (value?: string | null) => {
  if (!value) return 'Soon';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Soon';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatMomentTimestamp = (value?: string | null) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).replace(',', ' ·');
};

const getCompactPresenceLabel = (presence: {
  online: boolean;
  activeNow: boolean;
  recentlyActive: boolean;
  label: string;
}) => {
  if (presence.online) return 'Online';
  if (presence.activeNow) return 'Active';
  if (presence.recentlyActive) return 'Recent';
  return presence.label;
};

const formatSnapshotAgeLabel = (savedAt?: number | null) => {
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return 'recently';
  const diffMs = Math.max(0, Date.now() - savedAt);
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

const toDateInputValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const getLeaderRoleLabel = (role?: string | null) => {
  const normalized = String(role ?? '').toLowerCase();
  if (normalized === 'leader' || normalized === 'host') return 'Host';
  if (normalized === 'moderator') return 'Moderator';
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'matchmaker') return 'Matchmaker';
  return 'Member';
};

const hydrateMemberProfileAvatar = async (
  profile: MemberRow['profiles'],
  scope: string,
  circleId: string,
) => {
  if (!profile?.id || !profile.avatar_url) return profile;
  const avatarUrl = await resolveOfflineImageUri(
    `circle-member-avatar:${circleId}:${scope}:${profile.id}:${profile.avatar_url}`,
    profile.avatar_url,
  );
  if (!avatarUrl || avatarUrl === profile.avatar_url) return profile;
  return {
    ...profile,
    avatar_url: avatarUrl,
  };
};

const normalizeCircleRole = (role?: string | null) => {
  const normalized = String(role ?? '').toLowerCase();
  return normalized === 'leader' ? 'host' : normalized;
};

const getMomentKindLabel = (type?: string | null) => {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized === 'text') return 'Text Moment';
  if (normalized === 'video') return 'Video Moment';
  return 'Photo Moment';
};

const getMomentPreview = (moment: CircleMoment) => {
  const caption = String(moment.caption ?? '').trim();
  if (caption) return caption;
  const body = String(moment.text_body ?? '').trim().replace(/\s+/g, ' ');
  if (body) return body.length > 120 ? `${body.slice(0, 117)}...` : body;
  return moment.type === 'video'
    ? 'A fresh video Moment from this Circle.'
    : moment.type === 'text'
      ? 'A fresh text Moment from this Circle.'
      : 'A fresh photo Moment from this Circle.';
};

const getGatheringPrivacyLabel = (gathering?: Gathering | null) => {
  const visibility = String(gathering?.address_visibility ?? '').toLowerCase();
  if (visibility === 'public') return 'Address visible to everyone';
  if (visibility === 'hidden') return 'Exact location shared privately';
  return 'Exact address shared with attendees';
};

const getAttendanceStatusLabel = (status?: string | null) => {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'interested') return 'Interested';
  if (normalized === 'checked_in') return 'Checked in';
  if (normalized === 'cancelled') return 'Not attending';
  return 'Attending';
};

const isAttendanceCounted = (status?: string | null) => {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'interested' || normalized === 'attending' || normalized === 'checked_in';
};

const getRoleRequestStatusLabel = (status?: string | null) => {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Declined';
  if (normalized === 'cancelled') return 'Cancelled';
  return 'Pending';
};

const getCircleReportStatusLabel = (status?: string | null) => {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'reviewing') return 'Reviewing';
  if (normalized === 'resolved') return 'Resolved';
  if (normalized === 'dismissed') return 'Dismissed';
  return 'Pending review';
};

const joinMeta = (parts: (string | number | null | undefined)[]) =>
  parts
    .filter((part): part is string | number => part !== null && part !== undefined && part !== '')
    .join(' \u00b7 ');

const normalizeCopy = (value?: string | null) => String(value ?? '').trim().replace(/\s+/g, ' ');

const isSameCopy = (left?: string | null, right?: string | null) =>
  normalizeCopy(left).length > 0 && normalizeCopy(left).toLowerCase() === normalizeCopy(right).toLowerCase();

const pluralize = (count: number, singular: string, plural = `${singular}s`) => (count === 1 ? singular : plural);

const normalizePosterKey = (value?: string | null) => String(value ?? '').trim();
type GatheringSeatContext = 'welcome' | 'love' | 'featured_member';
const getGatheringSeatContextLabel = (value?: GatheringSeatContext) => {
  if (value === 'welcome') return 'Welcome Seat';
  if (value === 'love') return 'Love Seat';
  return 'Featured member';
};
const getGatheringSeatContextCopy = (value: GatheringSeatContext | undefined, fullName: string) => {
  const firstName = String(fullName || 'member').trim().split(/\s+/)[0] || 'member';
  if (value === 'welcome') return `A host-created gathering to help members welcome ${firstName} in a warmer setting.`;
  if (value === 'love') return `A Circle gathering created around ${firstName}'s Love Seat for warmer, intentional conversation.`;
  return `A host-led gathering built around ${firstName}'s Circle context before members RSVP.`;
};

const summarizeCircleMomentDiagnostics = (diagnostics: any) => {
  const profiles = Array.isArray(diagnostics?.profiles) ? diagnostics.profiles : [];
  const activeCount = profiles.reduce((total: number, item: any) => total + Number(item?.active_moment_count ?? 0), 0);
  const visibleCount = profiles.reduce((total: number, item: any) => total + Number(item?.circle_visible_moment_count ?? 0), 0);
  const hasIdentityMismatch = profiles.some((item: any) => item?.identity_mismatch === true);
  return {
    profiles,
    activeCount,
    visibleCount,
    hasIdentityMismatch,
    shouldWarn: activeCount > 0 || visibleCount > 0 || hasIdentityMismatch,
  };
};

export default function CircleDetailScreen() {
  const { profile, user } = useAuth();
  const { profileId: currentProfileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const authProfile = profile as any;
  const params = useLocalSearchParams();
  const circleId = String(params?.id ?? '');
  const requestedTab = typeof params?.tab === 'string' ? params.tab : Array.isArray(params?.tab) ? params.tab[0] : null;
  const initialRequestedTab: DetailTab = requestedTab && DETAIL_TABS.includes(requestedTab as DetailTab)
    ? (requestedTab as DetailTab)
    : 'overview';
  const requestedPulseItemId =
    typeof params?.openPulseItemId === 'string'
      ? params.openPulseItemId
      : Array.isArray(params?.openPulseItemId)
        ? params.openPulseItemId[0]
        : null;
  const requestedPulseCommentId =
    typeof params?.openPulseCommentId === 'string'
      ? params.openPulseCommentId
      : Array.isArray(params?.openPulseCommentId)
        ? params.openPulseCommentId[0]
        : null;
  const requestedPulseParentCommentId =
    typeof params?.openPulseParentCommentId === 'string'
      ? params.openPulseParentCommentId
      : Array.isArray(params?.openPulseParentCommentId)
        ? params.openPulseParentCommentId[0]
        : null;
  const requestedPulseRouteNonce =
    typeof params?.openPulseRouteNonce === 'string'
      ? params.openPulseRouteNonce
      : Array.isArray(params?.openPulseRouteNonce)
        ? params.openPulseRouteNonce[0]
        : null;
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [activeTab, setActiveTab] = useState<DetailTab>(initialRequestedTab);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingMembers, setPendingMembers] = useState<MemberRow[]>([]);
  const [matchedMemberProfileIds, setMatchedMemberProfileIds] = useState<Record<string, true>>({});
  const [matchedMemberUserIds, setMatchedMemberUserIds] = useState<Record<string, true>>({});
  const [membership, setMembership] = useState<MemberRow | null>(null);
  const [prompts, setPrompts] = useState<CirclePrompt[]>([]);
  const [promptResponsesByPromptId, setPromptResponsesByPromptId] = useState<Record<string, CirclePromptResponse[]>>({});
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [gatheringAttendance, setGatheringAttendance] = useState<Record<string, GatheringAttendance>>({});
  const [moments, setMoments] = useState<CircleMoment[]>([]);
  const [momentSignedUrls, setMomentSignedUrls] = useState<Record<string, string>>({});
  const [momentLoadError, setMomentLoadError] = useState<string | null>(null);
  const [roleRequests, setRoleRequests] = useState<CircleRoleRequest[]>([]);
  const [moderationReports, setModerationReports] = useState<CircleReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [networkReady, setNetworkReady] = useState(true);
  const [detailSnapshotInfo, setDetailSnapshotInfo] = useState<{
    hasSnapshot: boolean;
    savedAt: number | null;
    isStale: boolean;
  }>({
    hasSnapshot: false,
    savedAt: null,
    isStale: false,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [promptAnswerOpen, setPromptAnswerOpen] = useState(false);
  const [promptTarget, setPromptTarget] = useState<CirclePrompt | null>(null);
  const [promptAnswer, setPromptAnswer] = useState('');
  const [promptComposerOpen, setPromptComposerOpen] = useState(false);
  const [promptComposerTitle, setPromptComposerTitle] = useState('');
  const [promptComposerBody, setPromptComposerBody] = useState('');
  const [promptComposerType, setPromptComposerType] = useState<'host' | 'weekly' | 'daily'>('host');
  const [editingPromptTarget, setEditingPromptTarget] = useState<CirclePrompt | null>(null);
  const [publishingPrompt, setPublishingPrompt] = useState(false);
  const [gatheringComposerOpen, setGatheringComposerOpen] = useState(false);
  const [gatheringComposerTitle, setGatheringComposerTitle] = useState('');
  const [gatheringComposerDescription, setGatheringComposerDescription] = useState('');
  const [gatheringComposerDate, setGatheringComposerDate] = useState('');
  const [gatheringComposerTime, setGatheringComposerTime] = useState('');
  const [gatheringComposerCity, setGatheringComposerCity] = useState('');
  const [gatheringComposerVenue, setGatheringComposerVenue] = useState('');
  const [gatheringComposerType, setGatheringComposerType] = useState<'physical' | 'online' | 'hybrid'>('physical');
  const [gatheringComposerPosterUrl, setGatheringComposerPosterUrl] = useState<string | null>(null);
  const [gatheringComposerPosterPreviewUrl, setGatheringComposerPosterPreviewUrl] = useState<string | null>(null);
  const [gatheringComposerPosterMode, setGatheringComposerPosterMode] = useState<'image' | 'member' | null>(null);
  const [gatheringComposerPosterMemberId, setGatheringComposerPosterMemberId] = useState<string | null>(null);
  const [editingGatheringTarget, setEditingGatheringTarget] = useState<Gathering | null>(null);
  const [gatheringPosterUploading, setGatheringPosterUploading] = useState(false);
  const [creatingGathering, setCreatingGathering] = useState(false);
  const [manageMemberTarget, setManageMemberTarget] = useState<MemberRow | null>(null);
  const [hostNoteOpen, setHostNoteOpen] = useState(false);
  const [hostNoteValue, setHostNoteValue] = useState('');
  const [savingHostNote, setSavingHostNote] = useState(false);
  const [deletingContentKey, setDeletingContentKey] = useState<string | null>(null);
  const [gatheringRsvpTarget, setGatheringRsvpTarget] = useState<Gathering | null>(null);
  const [gatheringRsvpStatus, setGatheringRsvpStatus] = useState<'interested' | 'attending'>('attending');
  const [gatheringRsvpVisible, setGatheringRsvpVisible] = useState(false);
  const [savingGatheringRsvp, setSavingGatheringRsvp] = useState(false);
  const [reportTarget, setReportTarget] = useState<CircleReportTarget | null>(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [roleRequestOpen, setRoleRequestOpen] = useState(false);
  const [roleRequestType, setRoleRequestType] = useState<CircleRoleRequestType>('moderator');
  const [roleRequestNote, setRoleRequestNote] = useState('');
  const [submittingRoleRequest, setSubmittingRoleRequest] = useState(false);
  const [reviewingRoleRequestId, setReviewingRoleRequestId] = useState<string | null>(null);
  const [cancellingRoleRequestId, setCancellingRoleRequestId] = useState<string | null>(null);
  const [roleRequestRejectTarget, setRoleRequestRejectTarget] = useState<CircleRoleRequest | null>(null);
  const [roleRequestRejectReason, setRoleRequestRejectReason] = useState('');
  const [reviewingReportId, setReviewingReportId] = useState<string | null>(null);
  const [removingPromptResponseId, setRemovingPromptResponseId] = useState<string | null>(null);
  const [intentSheetOpen, setIntentSheetOpen] = useState(false);
  const [intentTarget, setIntentTarget] = useState<{ id: string; name?: string | null } | null>(null);
  const [pulseManagerOpen, setPulseManagerOpen] = useState(false);
  const [pulseCommentTarget, setPulseCommentTarget] = useState<CirclePulseItem | null>(null);
  const [pulseCommentFocusId, setPulseCommentFocusId] = useState<string | null>(null);
  const [pulseCommentParentFocusId, setPulseCommentParentFocusId] = useState<string | null>(null);
  const [pulseMediaTarget, setPulseMediaTarget] = useState<CirclePulseItem | null>(null);
  const [pulseModerationOpen, setPulseModerationOpen] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [circleOptionsOpen, setCircleOptionsOpen] = useState(false);
  const [pulseDiscussionUnreadByItemId, setPulseDiscussionUnreadByItemId] = useState<Record<string, number>>({});
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const handledPulseNotificationKeyRef = useRef<string | null>(null);
  const pulseNotificationReloadAttemptRef = useRef<string | null>(null);
  const activeTabRef = useRef<DetailTab>(initialRequestedTab);
  const loadCircleBootstrapRef = useRef<(() => Promise<void>) | null>(null);
  const refreshCircleMomentsPersistedRef = useRef<(() => Promise<unknown>) | null>(null);

  useEffect(() => {
    if (!requestedTab) return;
    if (DETAIL_TABS.includes(requestedTab as DetailTab)) {
      setActiveTab(requestedTab as DetailTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const timer = setInterval(() => setPresenceNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const applyCircleDetailSnapshot = useCallback((snapshot: OfflineCircleDetailSnapshot) => {
    setCircle((snapshot.circle as Circle | null) ?? null);
    setMembership((snapshot.membership as MemberRow | null) ?? null);
    setMembers((snapshot.members as MemberRow[]) ?? []);
    setPendingMembers((snapshot.pendingMembers as MemberRow[]) ?? []);
    setPrompts((snapshot.prompts as CirclePrompt[]) ?? []);
    setPromptResponsesByPromptId(
      (snapshot.promptResponsesByPromptId as Record<string, CirclePromptResponse[]>) ?? {},
    );
    setGatherings((snapshot.gatherings as Gathering[]) ?? []);
    setGatheringAttendance(
      (snapshot.gatheringAttendance as Record<string, GatheringAttendance>) ?? {},
    );
    setMoments((snapshot.moments as CircleMoment[]) ?? []);
    setMomentLoadError(snapshot.momentLoadError ?? null);
    setRoleRequests((snapshot.roleRequests as CircleRoleRequest[]) ?? []);
    setModerationReports((snapshot.moderationReports as CircleReport[]) ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!circleId) return () => {
      cancelled = true;
    };
    void (async () => {
      const snapshotState = await readCircleDetailSnapshotState(circleId, currentProfileId);
      if (cancelled) return;
      setDetailSnapshotInfo({
        hasSnapshot: Boolean(snapshotState.data),
        savedAt: snapshotState.savedAt,
        isStale: snapshotState.isStale,
      });
      if (snapshotState.data) {
        applyCircleDetailSnapshot(snapshotState.data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCircleDetailSnapshot, circleId, currentProfileId]);

  const persistCircleDetailSnapshot = useCallback(async (patch?: Partial<OfflineCircleDetailSnapshot>) => {
    if (!circleId) return;
    const savedAt = Date.now();
    await writeCircleDetailSnapshot(circleId, currentProfileId, {
      circle: ((patch && 'circle' in patch) ? patch.circle : circle) ?? null,
      membership: ((patch && 'membership' in patch) ? patch.membership : membership) ?? null,
      members: ((patch && 'members' in patch) ? patch.members : members) ?? [],
      pendingMembers: ((patch && 'pendingMembers' in patch) ? patch.pendingMembers : pendingMembers) ?? [],
      prompts: ((patch && 'prompts' in patch) ? patch.prompts : prompts) ?? [],
      promptResponsesByPromptId: ((patch && 'promptResponsesByPromptId' in patch) ? patch.promptResponsesByPromptId : promptResponsesByPromptId) ?? {},
      gatherings: ((patch && 'gatherings' in patch) ? patch.gatherings : gatherings) ?? [],
      gatheringAttendance: ((patch && 'gatheringAttendance' in patch) ? patch.gatheringAttendance : gatheringAttendance) ?? {},
      moments: ((patch && 'moments' in patch) ? patch.moments : moments) ?? [],
      momentLoadError: ((patch && 'momentLoadError' in patch) ? patch.momentLoadError : momentLoadError) ?? null,
      roleRequests: ((patch && 'roleRequests' in patch) ? patch.roleRequests : roleRequests) ?? [],
      moderationReports: ((patch && 'moderationReports' in patch) ? patch.moderationReports : moderationReports) ?? [],
    });
    setDetailSnapshotInfo({
      hasSnapshot: true,
      savedAt,
      isStale: false,
    });
  }, [
    circle,
    circleId,
    currentProfileId,
    gatherings,
    gatheringAttendance,
    members,
    membership,
    moderationReports,
    momentLoadError,
    moments,
    pendingMembers,
    promptResponsesByPromptId,
    prompts,
    roleRequests,
  ]);

  const refreshCircleCoreState = useCallback(async () => {
    if (!circleId) {
      setCircle(null);
      setMembership(null);
      return { circle: null, membership: null };
    }

    const circlePromise = db
      .from('circles')
      .select('id,name,slug,description,short_description,visibility,category,created_by_profile_id,created_by_user_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,is_official,is_partner,is_featured,requires_join_approval,rules,safety_note,member_count,gathering_count,archived_at,host_note,host_note_updated_at,host_note_updated_by_profile_id')
      .eq('id', circleId)
      .maybeSingle();

    const membershipPromise = (() => {
      if (!currentProfileId && !user?.id) {
        return Promise.resolve({ data: null, error: null });
      }
      const query = db
        .from('circle_members')
        .select('id,role,status,is_visible,profile_id,user_id')
        .eq('circle_id', circleId);
      if (currentProfileId && user?.id) {
        return query.or(`profile_id.eq.${currentProfileId},user_id.eq.${user.id}`).maybeSingle();
      }
      if (currentProfileId) {
        return query.eq('profile_id', currentProfileId).maybeSingle();
      }
      return query.eq('user_id', user!.id).maybeSingle();
    })();

    const [{ data: circleRow }, { data: myMembership }] = await Promise.all([circlePromise, membershipPromise]);
    const nextCircle = (circleRow as Circle) || null;
    const nextMembership = (myMembership as MemberRow) || null;
    setCircle(nextCircle);
    setMembership(nextMembership);
    return { circle: nextCircle, membership: nextMembership };
  }, [circleId, currentProfileId, user?.id]);

  const refreshCircleMembersState = useCallback(async () => {
    if (!circleId) {
      setMembers([]);
      setPendingMembers([]);
      return {
        activeVisibleMembers: [] as MemberRow[],
        pendingMembers: [] as MemberRow[],
        memberByProfileId: {} as Record<string, MemberRow>,
      };
    }

    const { data: memberRows } = await db
      .from('circle_members')
      .select('id,role,status,is_visible,profile_id,user_id,joined_at,profiles(id,user_id,full_name,avatar_url,age,location,city,region)')
      .eq('circle_id', circleId);

    const rows: MemberRow[] = await Promise.all(
      ((memberRows || []) as any[]).map(async (row: any) => ({
        id: String(row.id),
        role: String(row.role),
        status: String(row.status),
        is_visible: row.is_visible !== false,
        profile_id: String(row.profile_id),
        user_id: row.user_id || row.profiles?.user_id ? String(row.user_id || row.profiles?.user_id) : null,
        joined_at: row.joined_at ? String(row.joined_at) : null,
        profiles: await hydrateMemberProfileAvatar(
          normalizeMemberProfile(row.profiles),
          'member',
          circleId,
        ),
      })),
    );

    const presenceUserIds = rows
      .map((row) => row.user_id || row.profiles?.user_id || null)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    const presenceResult = await fetchUsersPresence(presenceUserIds);
    const presenceByUserId = new Map(
      ((presenceResult.data ?? []) as { user_id: string; online?: boolean | null; last_active?: string | null }[])
        .map((row) => [String(row.user_id), row] as const),
    );
    const hydratedRows = rows.map((row) => {
      const userId = row.user_id || row.profiles?.user_id || null;
      const presence = userId ? presenceByUserId.get(String(userId)) : null;
      if (!presence || !row.profiles) return row;
      return {
        ...row,
        profiles: {
          ...row.profiles,
          online: typeof presence.online === 'boolean' ? presence.online : row.profiles.online ?? null,
          last_active: presence.last_active ?? row.profiles.last_active ?? null,
        },
      };
    });

    const activeVisibleMembers = hydratedRows.filter((row) => row.status === 'active' && row.is_visible !== false);
    const nextPendingMembers = hydratedRows.filter((row) => row.status === 'pending');
    const memberByProfileId = hydratedRows.reduce<Record<string, MemberRow>>((acc, row) => {
      acc[row.profile_id] = row;
      return acc;
    }, {});

    setMembers(activeVisibleMembers);
    setPendingMembers(nextPendingMembers);

    return {
      activeVisibleMembers,
      pendingMembers: nextPendingMembers,
      memberByProfileId,
    };
  }, [circleId]);

  const refreshCirclePromptsState = useCallback(async () => {
    if (!circleId) {
      setPrompts([]);
      setPromptResponsesByPromptId({});
      return {
        prompts: [] as CirclePrompt[],
        promptResponsesByPromptId: {} as Record<string, CirclePromptResponse[]>,
      };
    }

    const { data: promptRows } = await db
      .from('circle_prompts')
      .select('id,title,prompt,prompt_type')
      .eq('circle_id', circleId)
      .eq('status', 'published')
      .order('starts_at', { ascending: false, nullsFirst: false })
      .limit(20);

    const nextPrompts = (promptRows ?? []) as CirclePrompt[];
    setPrompts(nextPrompts);

    let nextPromptResponses: Record<string, CirclePromptResponse[]> = {};
    if (nextPrompts.length > 0) {
      const { data: promptResponseRows } = await db
        .from('circle_prompt_responses')
        .select('id,prompt_id,profile_id,response,created_at,profiles(id,full_name,avatar_url,age,location,city,region)')
        .in('prompt_id', nextPrompts.map((item) => item.id))
        .order('created_at', { ascending: false });

      const hydratedPromptResponses = await Promise.all(
        ((promptResponseRows ?? []) as any[]).map(async (row) => ({
          id: String(row.id),
          prompt_id: String(row.prompt_id),
          profile_id: String(row.profile_id),
          response: String(row.response),
          created_at: String(row.created_at),
          profiles: await hydrateMemberProfileAvatar(
            normalizeMemberProfile(row.profiles),
            'prompt-response',
            circleId,
          ),
        })),
      );

      nextPromptResponses = hydratedPromptResponses.reduce<Record<string, CirclePromptResponse[]>>((acc, row) => {
        const promptId = String(row.prompt_id);
        if (!acc[promptId]) acc[promptId] = [];
        acc[promptId].push(row);
        return acc;
      }, {});
    }

    setPromptResponsesByPromptId(nextPromptResponses);

    return {
      prompts: nextPrompts,
      promptResponsesByPromptId: nextPromptResponses,
    };
  }, [circleId]);

  const refreshAcceptedMatches = useCallback(async () => {
    if (!currentProfileId) {
      setMatchedMemberProfileIds({});
      setMatchedMemberUserIds({});
      return {} as Record<string, true>;
    }

    const { data, error } = await db
      .from('matches')
      .select('user1_id,user2_id')
      .eq('status', 'ACCEPTED')
      .or(`user1_id.eq.${currentProfileId},user2_id.eq.${currentProfileId}`);
    if (error) throw error;

    const nextMatchedProfileIds = ((data ?? []) as any[]).reduce<Record<string, true>>((acc, row) => {
      const user1Id = row?.user1_id ? String(row.user1_id) : null;
      const user2Id = row?.user2_id ? String(row.user2_id) : null;
      const peerProfileId = user1Id === currentProfileId ? user2Id : user1Id;
      if (peerProfileId) acc[peerProfileId] = true;
      return acc;
    }, {});
    const nextMatchedUserIds = Object.keys(nextMatchedProfileIds).reduce<Record<string, true>>((acc, peerProfileId) => {
      const matchedMember = members.find((item) => item.profile_id === peerProfileId || item.profiles?.id === peerProfileId) ?? null;
      const peerUserId = matchedMember?.user_id ?? matchedMember?.profiles?.user_id ?? null;
      if (peerUserId) acc[String(peerUserId)] = true;
      return acc;
    }, {});

    setMatchedMemberProfileIds(nextMatchedProfileIds);
    setMatchedMemberUserIds(nextMatchedUserIds);
    return nextMatchedProfileIds;
  }, [currentProfileId, members]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void refreshAcceptedMatches().catch((error) => {
        if (!isActive) return;
        logger.warn('[circles] accepted_matches_lookup_failed', {
          circleId,
          currentProfileId,
          error: error instanceof Error ? error.message : String(error),
        });
        setMatchedMemberProfileIds({});
        setMatchedMemberUserIds({});
      });
      return () => {
        isActive = false;
      };
    }, [circleId, currentProfileId, refreshAcceptedMatches]),
  );

  const refreshCircleGatheringsState = useCallback(async () => {
    if (!circleId) {
      setGatherings([]);
      setGatheringAttendance({});
      return {
        gatherings: [] as Gathering[],
        gatheringAttendance: {} as Record<string, GatheringAttendance>,
      };
    }

    const { data: gatheringRows } = await db
      .from('gatherings')
      .select('id,title,description,poster_url,presentation_mode,featured_profile_id,seat_context,host_created_for_member,starts_at,city,country_code,venue_name,gathering_type,address_visibility,is_partner_venue,safe_first_date_space,attendee_count')
      .eq('circle_id', circleId)
      .eq('status', 'approved')
      .order('starts_at', { ascending: true })
      .limit(20);

    const nextGatherings = (gatheringRows ?? []) as Gathering[];
    setGatherings(nextGatherings);

    let nextAttendance: Record<string, GatheringAttendance> = {};
    if (currentProfileId && nextGatherings.length > 0) {
      const { data: attendeeRows } = await db
        .from('gathering_attendees')
        .select('gathering_id,status,visible_to_others')
        .eq('profile_id', currentProfileId)
        .in('gathering_id', nextGatherings.map((item) => item.id));

      nextAttendance = ((attendeeRows ?? []) as any[]).reduce<Record<string, GatheringAttendance>>((acc, row) => {
        acc[String(row.gathering_id)] = {
          gathering_id: String(row.gathering_id),
          status: String(row.status),
          visible_to_others: row.visible_to_others === true,
        };
        return acc;
      }, {});
    }

    setGatheringAttendance(nextAttendance);

    return {
      gatherings: nextGatherings,
      gatheringAttendance: nextAttendance,
    };
  }, [circleId, currentProfileId]);

  const refreshCircleRoleRequestsState = useCallback(async (memberByProfileId?: Record<string, MemberRow>) => {
    if (!circleId) {
      setRoleRequests([]);
      return [] as CircleRoleRequest[];
    }

    const { data: roleRequestRows } = await db
      .from('circle_role_requests')
      .select('id,circle_id,requester_profile_id,requester_user_id,requested_role,note,status,rejection_reason,created_at')
      .eq('circle_id', circleId)
      .order('created_at', { ascending: false })
      .limit(20);

    const resolvedMemberByProfileId = memberByProfileId ?? [...members, ...pendingMembers].reduce<Record<string, MemberRow>>((acc, row) => {
      acc[row.profile_id] = row;
      return acc;
    }, {});

    const nextRoleRequests = ((roleRequestRows ?? []) as any[]).map((row) => ({
      id: String(row.id),
      circle_id: String(row.circle_id),
      requester_profile_id: String(row.requester_profile_id),
      requester_user_id: row.requester_user_id ? String(row.requester_user_id) : null,
      requested_role: String(row.requested_role) as CircleRoleRequestType,
      note: row.note ?? null,
      status: String(row.status),
      rejection_reason: row.rejection_reason ?? null,
      created_at: String(row.created_at),
      requester: resolvedMemberByProfileId[String(row.requester_profile_id)]?.profiles ?? null,
    }));

    setRoleRequests(nextRoleRequests);
    return nextRoleRequests;
  }, [circleId, members, pendingMembers]);

  const refreshCircleReportsState = useCallback(async (options?: {
    circleOverride?: Circle | null;
    membershipOverride?: MemberRow | null;
  }) => {
    if (!circleId) {
      setModerationReports([]);
      return [] as CircleReport[];
    }

    const nextCircle = options?.circleOverride ?? circle;
    const nextMembership = options?.membershipOverride ?? membership;
    const nextMembershipRole = normalizeCircleRole(nextMembership?.status === 'active' ? nextMembership.role : null);
    const canLoadModerationReports = !!(currentProfileId || user?.id) && (
      isCircleOwnerForActor(nextCircle, currentProfileId, user?.id)
      || ['host', 'admin', 'moderator'].includes(nextMembershipRole)
    );

    if (!canLoadModerationReports) {
      setModerationReports([]);
      return [] as CircleReport[];
    }

    const { data: reportRows, error: reportError } = await db.rpc('rpc_list_circle_reports', {
      p_circle_id: circleId,
      p_profile_id: currentProfileId,
    });
    if (reportError) throw reportError;

    const nextModerationReports = ((reportRows ?? []) as any[]).map((row) => ({
      id: String(row.id),
      circle_id: row.circle_id ? String(row.circle_id) : null,
      gathering_id: row.gathering_id ? String(row.gathering_id) : null,
      prompt_response_id: row.prompt_response_id ? String(row.prompt_response_id) : null,
      reporter_profile_id: String(row.reporter_profile_id),
      reason: String(row.reason),
      details: row.details ?? null,
      status: String(row.status),
      created_at: String(row.created_at),
      gathering_title: row.gathering_title ?? null,
      prompt_response_text: row.prompt_response_text ?? null,
    }));

    setModerationReports(nextModerationReports);
    return nextModerationReports;
  }, [circle, circleId, currentProfileId, membership, user?.id]);

  const refreshCircleMembershipView = useCallback(async () => {
    const [coreState, memberState] = await Promise.all([
      refreshCircleCoreState(),
      refreshCircleMembersState(),
    ]);
    const [nextRoleRequests, nextModerationReports] = await Promise.all([
      refreshCircleRoleRequestsState(memberState.memberByProfileId),
      refreshCircleReportsState({
        circleOverride: coreState.circle,
        membershipOverride: coreState.membership,
      }),
    ]);
    await persistCircleDetailSnapshot({
      circle: coreState.circle,
      membership: coreState.membership,
      members: memberState.activeVisibleMembers,
      pendingMembers: memberState.pendingMembers,
      roleRequests: nextRoleRequests,
      moderationReports: nextModerationReports,
    });
  }, [
    persistCircleDetailSnapshot,
    refreshCircleCoreState,
    refreshCircleMembersState,
    refreshCircleReportsState,
    refreshCircleRoleRequestsState,
  ]);

  const refreshCircleMoments = useCallback(async (options?: {
    canLoad?: boolean;
    memberRows?: MemberRow[];
  }) => {
    const canLoadMoments =
      options?.canLoad
      ?? Boolean(
        isCircleOwnerForActor(circle, currentProfileId, user?.id)
        || membership?.status === 'active',
      );
    if (!circleId || !canLoadMoments) {
      setMoments([]);
      setMomentLoadError(null);
      return {
        moments: [] as CircleMoment[],
        momentLoadError: null as string | null,
      };
    }

    setMomentLoadError(null);
    let { data: momentRows, error: momentError } = await db.rpc('rpc_get_circle_member_moments', {
      p_circle_id: circleId,
      p_limit: 18,
    });

    if (momentError || (momentRows ?? []).length === 0) {
      const recovery = await db.rpc('rpc_get_circle_member_moments_recovery', {
        p_circle_id: circleId,
        p_limit: 18,
      });
      if (!recovery.error) {
        momentRows = recovery.data ?? [];
        momentError = null;
      } else {
        logger.warn('[circles] member_moments_recovery_failed', {
          circleId,
          error: String(recovery.error.message || recovery.error),
        });
      }
    }

    if (momentError) {
      logger.warn('[circles] member_moments_failed', { circleId, error: String(momentError.message || momentError) });
      const nextMomentLoadError = String(momentError.message || momentError);
      setMomentLoadError(nextMomentLoadError);
      setMoments([]);
      return {
        moments: [] as CircleMoment[],
        momentLoadError: nextMomentLoadError,
      };
    }

    const sourceMembers = options?.memberRows ?? members;
    const memberByUserId = sourceMembers.reduce<Record<string, MemberRow>>((acc, row) => {
      if (row.user_id) acc[String(row.user_id)] = row;
      if (row.profiles?.user_id) acc[String(row.profiles.user_id)] = row;
      return acc;
    }, {});
    const nextMoments = (momentRows ?? []).map((row: any) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      type: String(row.type),
      media_url: row.media_url ?? null,
      thumbnail_url: row.thumbnail_url ?? null,
      text_body: row.text_body ?? null,
      caption: row.caption ?? null,
      created_at: String(row.created_at),
      expires_at: row.expires_at ?? null,
      visibility: row.visibility ?? null,
      profile: memberByUserId[String(row.user_id)]?.profiles ?? null,
    }));
    setMoments(nextMoments);
    return {
      moments: nextMoments,
      momentLoadError: null as string | null,
    };
  }, [circle, circleId, currentProfileId, members, membership?.status, user?.id]);

  const refreshCircleMomentsPersisted = useCallback(async () => {
    const nextMomentState = await refreshCircleMoments();
    await persistCircleDetailSnapshot({
      moments: nextMomentState.moments,
      momentLoadError: nextMomentState.momentLoadError,
    });
    return nextMomentState;
  }, [persistCircleDetailSnapshot, refreshCircleMoments]);

  const refreshCircleAccessEnvelope = useCallback(async () => {
    const [coreState, memberState, promptState, gatheringState] = await Promise.all([
      refreshCircleCoreState(),
      refreshCircleMembersState(),
      refreshCirclePromptsState(),
      refreshCircleGatheringsState(),
    ]);

    const nextIsOwner = isCircleOwnerForActor(coreState.circle, currentProfileId, user?.id);
    const nextIsMember = nextIsOwner || coreState.membership?.status === 'active';

    const [nextRoleRequests, nextModerationReports, nextMomentState] = await Promise.all([
      refreshCircleRoleRequestsState(memberState.memberByProfileId),
      refreshCircleReportsState({
        circleOverride: coreState.circle,
        membershipOverride: coreState.membership,
      }),
      refreshCircleMoments({
        canLoad: nextIsMember,
        memberRows: memberState.activeVisibleMembers,
      }),
    ]);

    if (!nextIsMember) {
      setPulseDiscussionUnreadByItemId({});
    }

    await persistCircleDetailSnapshot({
      circle: coreState.circle,
      membership: coreState.membership,
      members: memberState.activeVisibleMembers,
      pendingMembers: memberState.pendingMembers,
      prompts: promptState.prompts,
      promptResponsesByPromptId: promptState.promptResponsesByPromptId,
      gatherings: gatheringState.gatherings,
      gatheringAttendance: gatheringState.gatheringAttendance,
      moments: nextMomentState.moments,
      momentLoadError: nextMomentState.momentLoadError,
      roleRequests: nextRoleRequests,
      moderationReports: nextModerationReports,
    });

    return {
      circle: coreState.circle,
      membership: coreState.membership,
    };
  }, [
    currentProfileId,
    persistCircleDetailSnapshot,
    refreshCircleCoreState,
    refreshCircleGatheringsState,
    refreshCircleMembersState,
    refreshCircleMoments,
    refreshCirclePromptsState,
    refreshCircleReportsState,
    refreshCircleRoleRequestsState,
    user?.id,
  ]);

  const refreshCirclePromptsStatePersisted = useCallback(async () => {
    const promptState = await refreshCirclePromptsState();
    await persistCircleDetailSnapshot({
      prompts: promptState.prompts,
      promptResponsesByPromptId: promptState.promptResponsesByPromptId,
    });
    return promptState;
  }, [persistCircleDetailSnapshot, refreshCirclePromptsState]);

  const patchRoleRequestState = useCallback(async (
    nextRequest: CircleRoleRequest,
    options?: { updatedMemberRole?: CircleManageRole | null; requesterProfileId?: string | null },
  ) => {
    const nextRoleRequests = roleRequests.some((item) => item.id === nextRequest.id)
      ? roleRequests.map((item) => (item.id === nextRequest.id ? { ...item, ...nextRequest } : item))
      : [nextRequest, ...roleRequests];

    const requesterProfileId = options?.requesterProfileId ?? nextRequest.requester_profile_id ?? null;
    const updatedMemberRole = options?.updatedMemberRole ?? null;

    let nextMembers = members;
    if (requesterProfileId && updatedMemberRole) {
      nextMembers = members.map((item) => (
        item.profile_id === requesterProfileId
          ? { ...item, role: updatedMemberRole }
          : item
      ));
      setMembers(nextMembers);
    }

    setRoleRequests(nextRoleRequests);
    await persistCircleDetailSnapshot({
      members: nextMembers,
      roleRequests: nextRoleRequests,
    });
  }, [members, persistCircleDetailSnapshot, roleRequests]);

  const patchModerationReportState = useCallback(async (reportId: string, status: string) => {
    const nextReports = moderationReports.map((item) => (
      item.id === reportId ? { ...item, status } : item
    ));
    setModerationReports(nextReports);
    await persistCircleDetailSnapshot({
      moderationReports: nextReports,
    });
  }, [moderationReports, persistCircleDetailSnapshot]);

  const loadCircleBootstrap = useCallback(async () => {
    if (!circleId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const netState = await fetchNetInfo().catch(() => null);
      const canUseLiveNetwork = isNetworkConnectionAvailable(netState);
      setNetworkReady(canUseLiveNetwork);

      if (!canUseLiveNetwork) {
        const snapshotState = await readCircleDetailSnapshotState(circleId, currentProfileId);
        setDetailSnapshotInfo({
          hasSnapshot: Boolean(snapshotState.data),
          savedAt: snapshotState.savedAt,
          isStale: snapshotState.isStale,
        });
        if (snapshotState.data) {
          applyCircleDetailSnapshot(snapshotState.data);
          return;
        }
        setLoadError('Circle detail needs a connection the first time it opens on this device.');
        return;
      }

      const [coreState, memberState, promptState, gatheringState] = await Promise.all([
        refreshCircleCoreState(),
        refreshCircleMembersState(),
        refreshCirclePromptsState(),
        refreshCircleGatheringsState(),
      ]);
      const nextCircle = coreState.circle;
      const nextMembership = coreState.membership;
      const activeVisibleMembers = memberState.activeVisibleMembers;
      const nextPendingMembers = memberState.pendingMembers;
      const nextPrompts = promptState.prompts;
      const nextPromptResponses = promptState.promptResponsesByPromptId;
      const nextGatherings = gatheringState.gatherings;
      const nextAttendance = gatheringState.gatheringAttendance;
      const nextRoleRequests = await refreshCircleRoleRequestsState(memberState.memberByProfileId);
      const nextModerationReports = await refreshCircleReportsState({
        circleOverride: nextCircle,
        membershipOverride: nextMembership,
      });
      await persistCircleDetailSnapshot({
        circle: nextCircle,
        membership: nextMembership,
        members: activeVisibleMembers,
        pendingMembers: nextPendingMembers,
        prompts: nextPrompts,
        promptResponsesByPromptId: nextPromptResponses,
        gatherings: nextGatherings,
        gatheringAttendance: nextAttendance,
        roleRequests: nextRoleRequests,
        moderationReports: nextModerationReports,
      });
    } catch (error) {
      const snapshotState = await readCircleDetailSnapshotState(circleId, currentProfileId);
      setDetailSnapshotInfo({
        hasSnapshot: Boolean(snapshotState.data),
        savedAt: snapshotState.savedAt,
        isStale: snapshotState.isStale,
      });
      if (snapshotState.data) {
        applyCircleDetailSnapshot(snapshotState.data);
      }
      setLoadError(error instanceof Error ? error.message : 'Could not load this Circle.');
    } finally {
      setLoading(false);
    }
  }, [
    applyCircleDetailSnapshot,
    circleId,
    currentProfileId,
    persistCircleDetailSnapshot,
    refreshCircleCoreState,
    refreshCircleGatheringsState,
    refreshCircleMembersState,
    refreshCirclePromptsState,
    refreshCircleReportsState,
    refreshCircleRoleRequestsState,
  ]);

  useEffect(() => {
    loadCircleBootstrapRef.current = loadCircleBootstrap;
  }, [loadCircleBootstrap]);

  useEffect(() => {
    let cancelled = false;
    const resolveMomentUrls = async () => {
      const unresolved = moments.filter((moment) => {
        const source = moment.thumbnail_url || moment.media_url;
        return source && !momentSignedUrls[moment.id];
      });
      if (unresolved.length === 0) return;
      const resolved: Record<string, string> = {};
      await Promise.all(unresolved.map(async (moment) => {
        const source = moment.thumbnail_url || moment.media_url;
        const cacheKey = `circle-moment:${circleId}:${moment.id}:${moment.thumbnail_url ?? moment.media_url ?? 'none'}`;
        const prefersImageCache = Boolean(moment.thumbnail_url) || String(moment.type).toLowerCase() !== 'video';
        const cached =
          prefersImageCache ? await getOfflineImageUri(cacheKey) : await getOfflineVideoUri(cacheKey);
        if (cached) {
          resolved[moment.id] = cached;
          return;
        }
        const url = source?.startsWith('http')
          ? source
          : source
            ? await createMomentSignedUrl(source, 3600)
            : null;
        if (!url) return;
        if (!prefersImageCache) {
          const offlineVideo = await cacheOfflineVideo(cacheKey, url);
          resolved[moment.id] = offlineVideo ?? url;
          return;
        }
        const offlineImage = await cacheOfflineImage(cacheKey, url);
        resolved[moment.id] = offlineImage ?? url;
      }));
      if (!cancelled && Object.keys(resolved).length > 0) {
        setMomentSignedUrls((current) => ({ ...current, ...resolved }));
      }
    };
    void resolveMomentUrls();
    return () => {
      cancelled = true;
    };
  }, [circleId, momentSignedUrls, moments]);

  useEffect(() => {
    refreshCircleMomentsPersistedRef.current = refreshCircleMomentsPersisted;
  }, [refreshCircleMomentsPersisted]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        await loadCircleBootstrapRef.current?.();
        if (active && activeTabRef.current === 'moments') {
          await refreshCircleMomentsPersistedRef.current?.();
        }
      })();
      return () => {
        active = false;
      };
    }, [circleId]),
  );

  useEffect(() => {
    if (circle?.name) setNameValue(circle.name);
  }, [circle?.name]);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const sourceKey = circle?.id
        ? `circle-image:${circle.id}:${circle.image_path ?? circle.cover_image_url ?? circle.icon_url ?? 'none'}:${circle.image_updated_at ?? 'na'}`
        : null;
      const cachedUri = sourceKey ? await getOfflineImageUri(sourceKey) : null;
      if (cancelled) return;
      if (cachedUri) {
        setImageUrl(cachedUri);
      }

      if (circle?.cover_image_url || circle?.icon_url) {
        const remoteUrl = circle.cover_image_url || circle.icon_url || null;
        setImageUrl((current) => current || remoteUrl);
        if (sourceKey && remoteUrl?.startsWith('http')) {
          const offlineUri = await cacheOfflineImage(sourceKey, remoteUrl);
          if (!cancelled && offlineUri) {
            setImageUrl(offlineUri);
          }
        }
        return;
      }
      if (!circle?.image_path) {
        if (!cachedUri) setImageUrl(null);
        return;
      }
      if (!networkReady && cachedUri) return;
      if (!networkReady) {
        setImageUrl(null);
        return;
      }
      const { data, error } = await db.storage.from('circle-images').createSignedUrl(circle.image_path, 3600);
      if (cancelled) return;
      const signedUrl = error || !data?.signedUrl ? null : data.signedUrl;
      if (!signedUrl) {
        if (!cachedUri) setImageUrl(null);
        return;
      }
      setImageUrl((current) => current || signedUrl);
      if (sourceKey) {
        const offlineUri = await cacheOfflineImage(sourceKey, signedUrl);
        if (!cancelled && offlineUri) {
          setImageUrl(offlineUri);
          return;
        }
      }
      if (!cancelled) {
        setImageUrl(signedUrl);
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [circle?.cover_image_url, circle?.icon_url, circle?.id, circle?.image_path, circle?.image_updated_at, networkReady]);

  const isOwner = isCircleOwnerForActor(circle, currentProfileId, user?.id);
  const membershipRole = normalizeCircleRole(membership?.status === 'active' ? membership.role : null);
  const isMember = isOwner || membership?.status === 'active';
  const circleMemberUserIds = useMemo(
    () => new Set([
      ...members.map((item) => String(item.user_id ?? '')).filter(Boolean),
      ...members.map((item) => String(item.profiles?.user_id ?? '')).filter(Boolean),
      ...(isOwner && user?.id ? [user.id] : []),
    ]),
    [isOwner, members, user?.id],
  );
  const circlePresenceUserIds = useMemo(
    () => Array.from(new Set([
      ...members.map((item) => String(item.user_id ?? item.profiles?.user_id ?? '')).filter(Boolean),
      ...pendingMembers.map((item) => String(item.user_id ?? item.profiles?.user_id ?? '')).filter(Boolean),
    ])).slice(0, 60),
    [members, pendingMembers],
  );
  const circlePresenceUserIdsKey = useMemo(
    () => circlePresenceUserIds.join('|'),
    [circlePresenceUserIds],
  );

  useEffect(() => {
    if (!circleId || circlePresenceUserIds.length === 0 || typeof db.channel !== 'function') return;

    const applyPresenceRow = (row?: { user_id?: string | null; online?: boolean | null; last_active?: string | null } | null) => {
      const targetUserId = String(row?.user_id ?? '').trim();
      if (!targetUserId) return;
      const patchCollection = (collection: MemberRow[]) => collection.map((item) => {
        const candidateUserId = String(item.user_id ?? item.profiles?.user_id ?? '').trim();
        if (!candidateUserId || candidateUserId !== targetUserId || !item.profiles) return item;
        return {
          ...item,
          profiles: {
            ...item.profiles,
            online: typeof row?.online === 'boolean' ? row.online : item.profiles.online ?? null,
            last_active: row?.last_active ?? item.profiles.last_active ?? null,
          },
        };
      });

      setMembers((current) => patchCollection(current));
      setPendingMembers((current) => patchCollection(current));
    };

    const channel = db.channel(`circle-member-presence:${circleId}`);
    circlePresenceUserIds.forEach((memberUserId) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence', filter: `user_id=eq.${memberUserId}` },
        (payload: any) => applyPresenceRow((payload?.new || payload?.old) as { user_id?: string | null; online?: boolean | null; last_active?: string | null } | null),
      );
    });
    channel.subscribe();

    return () => {
      if (typeof db.removeChannel === 'function') void db.removeChannel(channel);
    };
  }, [circleId, circlePresenceUserIdsKey]);

  const canEditCircle = isOwner;
  const canReviewMembers = isOwner || ['host', 'admin', 'moderator'].includes(membershipRole);
  const canManageRoles = isOwner || ['host', 'admin'].includes(membershipRole);
  const canRemoveMembers = isOwner || ['host', 'admin', 'moderator'].includes(membershipRole);
  const canAssignHostRole = isOwner || membershipRole === 'admin';
  const canModerateCircle = isOwner || ['host', 'admin', 'moderator'].includes(membershipRole);
  const canPublishCirclePrompt = isOwner || ['host', 'admin'].includes(membershipRole);
  const canHostGathering = isOwner || ['host', 'admin'].includes(membershipRole);
  const canSetHostNote = isOwner || ['host', 'admin', 'moderator'].includes(membershipRole);
  const canLeaveCircle = isMember && !isOwner && !['host', 'admin'].includes(membershipRole);
  const requestableRoleTypes = useMemo<CircleRoleRequestType[]>(() => {
    if (!isMember || ['host', 'admin', 'leader'].includes(membershipRole)) return [];
    if (membershipRole === 'moderator') return ['host'];
    return ['moderator', 'host'];
  }, [isMember, membershipRole]);
  const canRequestLeadershipRole = requestableRoleTypes.length > 0;
  const canReviewRoleRequests = isOwner || ['host', 'admin'].includes(membershipRole);
  const joinLabel = membership?.status === 'invited'
    ? 'Review invitation'
    : circle?.requires_join_approval || circle?.visibility === 'private'
      ? 'Request to join'
      : 'Join Circle';
  const memberCount = circle?.member_count ?? members.length;
  const mastheadTitle = (() => {
    const shortDescription = normalizeCopy(circle?.short_description);
    if (!shortDescription || isSameCopy(shortDescription, circle?.name)) {
      return 'Trusted community space for intentional connection.';
    }
    return shortDescription;
  })();
  const mastheadBody = (() => {
    const description = normalizeCopy(circle?.description);
    if (!description || isSameCopy(description, mastheadTitle) || isSameCopy(description, circle?.name)) {
      return 'Belong, discover, and connect through trusted shared context.';
    }
    return description;
  })();
  const pendingModerationReports = moderationReports.filter((report) => report.status === 'pending' || report.status === 'reviewing');
  const {
    items: pulseItems,
    loading: pulseLoading,
    error: pulseError,
    reload: reloadPulse,
  } = useCirclePulse({ circleId, enabled: isMember, viewerProfileId: currentProfileId });

  const reloadPulseDiscussionUnreadState = useCallback(async () => {
    if (pulseItems.length === 0) {
      setPulseDiscussionUnreadByItemId({});
      return;
    }

    if (currentProfileId && circleId) {
      try {
        const readStates = await fetchCirclePulseDiscussionReadStates(circleId, currentProfileId);
        setPulseDiscussionUnreadByItemId(
          Object.fromEntries(readStates.map((state) => [state.itemId, Math.max(0, state.unreadCount)])),
        );
        return;
      } catch {
        // fall through to local snapshot fallback
      }
    }

    const entries = await Promise.all(
      pulseItems.map(async (item) => {
        const [snapshotState, readState] = await Promise.all([
          readCirclePulseCommentsSnapshotState(item.id, currentProfileId),
          readCirclePulseDiscussionReadState(item.id, currentProfileId),
        ]);
        const comments = snapshotState.data ?? [];
        const lastSeenAtMs = readState.lastSeenAt ? new Date(readState.lastSeenAt).getTime() : Number.NaN;
        const unreadCount = Number.isFinite(lastSeenAtMs)
          ? comments.filter((comment) => {
              if (comment.isOwn) return false;
              const createdAtMs = new Date(comment.createdAt).getTime();
              return Number.isFinite(createdAtMs) && createdAtMs > lastSeenAtMs;
            }).length
          : 0;
        return [item.id, unreadCount] as const;
      }),
    );

    setPulseDiscussionUnreadByItemId(Object.fromEntries(entries));
  }, [circleId, currentProfileId, pulseItems]);

  useEffect(() => {
    void reloadPulseDiscussionUnreadState();
  }, [reloadPulseDiscussionUnreadState]);

  useEffect(() => {
    if (!requestedPulseItemId) {
      handledPulseNotificationKeyRef.current = null;
      pulseNotificationReloadAttemptRef.current = null;
      return;
    }
    if (!circleId || !isMember || pulseLoading) return;

    const routeKey = `${circleId}:${requestedPulseItemId}:${requestedPulseCommentId ?? ''}:${requestedPulseParentCommentId ?? ''}:${requestedPulseRouteNonce ?? ''}`;
    if (handledPulseNotificationKeyRef.current === routeKey) return;

    const targetItem = pulseItems.find((item) => item.id === requestedPulseItemId) ?? null;
    logger.debug('[circles] pulse_notification_route_received', {
      circleId,
      requestedPulseItemId,
      requestedPulseCommentId,
      requestedPulseParentCommentId,
      requestedPulseRouteNonce,
      pulseLoading,
      pulseItemCount: pulseItems.length,
      pulseItemIds: pulseItems.map((item) => item.id),
    });

    if (!targetItem) {
      logger.warn('[circles] pulse_notification_target_missing', {
        circleId,
        requestedPulseItemId,
        requestedPulseCommentId,
        requestedPulseParentCommentId,
        requestedPulseRouteNonce,
        pulseLoading,
        pulseItemCount: pulseItems.length,
        pulseItemIds: pulseItems.map((item) => item.id),
      });
      if (pulseNotificationReloadAttemptRef.current !== routeKey) {
        pulseNotificationReloadAttemptRef.current = routeKey;
        void reloadPulse();
      }
      return;
    }

    handledPulseNotificationKeyRef.current = routeKey;
    pulseNotificationReloadAttemptRef.current = null;
    logger.info('[circles] pulse_notification_target_opened', {
      circleId,
      requestedPulseItemId,
      requestedPulseCommentId,
      requestedPulseParentCommentId,
      requestedPulseRouteNonce,
      targetItemType: targetItem.type,
    });
    setActiveTab('overview');
    setPulseCommentTarget(targetItem);
    setPulseCommentFocusId(requestedPulseCommentId ?? null);
    setPulseCommentParentFocusId(requestedPulseParentCommentId ?? null);
  }, [
    circleId,
    isMember,
    pulseItems,
    pulseLoading,
    requestedPulseCommentId,
    requestedPulseItemId,
    requestedPulseParentCommentId,
    requestedPulseRouteNonce,
    requestedTab,
    reloadPulse,
  ]);

  useEffect(() => {
    if (!pulseCommentTarget) return;
    logger.info('[circles] pulse_comment_sheet_visible', {
      circleId,
      itemId: pulseCommentTarget.id,
      itemType: pulseCommentTarget.type,
      targetCommentId: pulseCommentFocusId,
      targetParentCommentId: pulseCommentParentFocusId,
    });
  }, [circleId, pulseCommentFocusId, pulseCommentParentFocusId, pulseCommentTarget]);
  const detailNotice = !networkReady && detailSnapshotInfo.hasSnapshot
    ? {
        title: 'Offline mode',
        message: detailSnapshotInfo.isStale
          ? `Showing saved Circle details from ${formatSnapshotAgeLabel(detailSnapshotInfo.savedAt)}.`
          : 'Showing saved Circle details from this device while the connection is offline.',
        icon: 'wifi-off' as const,
      }
    : loadError && detailSnapshotInfo.hasSnapshot
      ? {
          title: 'Showing saved Circle',
          message: `We could not refresh this Circle. Saved details from ${formatSnapshotAgeLabel(detailSnapshotInfo.savedAt)} are still available.`,
          icon: 'cloud-alert' as const,
        }
      : loadError
        ? {
            title: 'Circle is unavailable',
            message: loadError,
            icon: 'cloud-alert' as const,
          }
        : null;

  const handleRetryCircleDetail = useCallback(() => {
    if (!networkReady) return;
    void (async () => {
      setLoadError(null);
      if (activeTab === 'members') {
        await refreshCircleMembershipView();
        return;
      }
      if (activeTab === 'prompts') {
        const [coreState, promptState] = await Promise.all([
          refreshCircleCoreState(),
          refreshCirclePromptsState(),
        ]);
        await persistCircleDetailSnapshot({
          circle: coreState.circle,
          membership: coreState.membership,
          prompts: promptState.prompts,
          promptResponsesByPromptId: promptState.promptResponsesByPromptId,
        });
        return;
      }
      if (activeTab === 'gatherings') {
        const [coreState, gatheringState] = await Promise.all([
          refreshCircleCoreState(),
          refreshCircleGatheringsState(),
        ]);
        await persistCircleDetailSnapshot({
          circle: coreState.circle,
          membership: coreState.membership,
          gatherings: gatheringState.gatherings,
          gatheringAttendance: gatheringState.gatheringAttendance,
        });
        return;
      }
      if (activeTab === 'moments') {
        const [coreState, momentState] = await Promise.all([
          refreshCircleCoreState(),
          refreshCircleMoments(),
        ]);
        await persistCircleDetailSnapshot({
          circle: coreState.circle,
          membership: coreState.membership,
          moments: momentState.moments,
          momentLoadError: momentState.momentLoadError,
        });
        return;
      }
      await loadCircleBootstrap();
    })();
  }, [
    activeTab,
    loadCircleBootstrap,
    networkReady,
    persistCircleDetailSnapshot,
    refreshCircleCoreState,
    refreshCircleGatheringsState,
    refreshCircleMembershipView,
    refreshCircleMoments,
    refreshCirclePromptsState,
  ]);

  useEffect(() => {
    if (activeTab !== 'moments') return;
    void refreshCircleMomentsPersisted();
  }, [activeTab, refreshCircleMomentsPersisted]);

  useEffect(() => {
    if (!circleId || !isMember || circleMemberUserIds.size === 0 || typeof db.channel !== 'function') return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scopedMemberIds = Array.from(circleMemberUserIds).filter(Boolean).slice(0, 60);
    if (scopedMemberIds.length === 0) return;
    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refreshCircleMomentsPersisted(), 240);
    };
    const channel = db.channel(`circle-moments:${circleId}`);
    scopedMemberIds.forEach((memberUserId) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moments', filter: `user_id=eq.${memberUserId}` },
        queueRefresh,
      );
    });
    channel.subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (typeof db.removeChannel === 'function') void db.removeChannel(channel);
    };
  }, [circleId, circleMemberUserIds, isMember, refreshCircleMomentsPersisted]);

  const handleJoin = useCallback(async () => {
    if (!currentProfileId || !circleId) return;
    if (membership?.status === 'invited') {
      showBetweenerAlert({
        title: 'Join this Circle?',
        message: `Accept the private invitation to ${circle?.name || 'this Circle'}?`,
        tone: 'info',
        buttons: [
          {
            text: 'Decline',
            style: 'destructive',
            onPress: () => {
              void respondToCircleInvitation(circleId, currentProfileId, false)
                .then((status) => {
                  if (status === 'expired') {
                    showBetweenerAlert({
                      title: 'Circle invitation',
                      message: 'This invitation has expired.',
                      tone: 'info',
                    });
                  }
                  return refreshCircleAccessEnvelope();
                })
                .catch((error) => showBetweenerAlert({
                  title: 'Circle invitation',
                  message: error instanceof Error ? error.message : 'Could not decline the invitation.',
                  tone: 'error',
                }));
            },
          },
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Accept',
            style: 'primary',
            onPress: () => {
              void respondToCircleInvitation(circleId, currentProfileId, true)
                .then((status) => {
                  if (status === 'expired') {
                    showBetweenerAlert({
                      title: 'Circle invitation',
                      message: 'This invitation has expired.',
                      tone: 'info',
                    });
                  }
                  return refreshCircleAccessEnvelope();
                })
                .catch((error) => showBetweenerAlert({
                  title: 'Circle invitation',
                  message: error instanceof Error ? error.message : 'Could not accept the invitation.',
                  tone: 'error',
                }));
            },
          },
        ],
      });
      return;
    }
    const { error } = await db.rpc('rpc_join_circle', {
      p_circle_id: circleId,
      p_profile_id: currentProfileId,
    });
    if (error) {
      showBetweenerAlert({
        title: 'Join failed',
        message: error.message || 'Please try again.',
        tone: 'error',
      });
      return;
    }
    const refreshedState = await refreshCircleAccessEnvelope();
    const joinIsPending =
      refreshedState.membership?.status === 'pending'
      || circle?.requires_join_approval === true
      || circle?.visibility === 'private';
    showBetweenerAlert({
      title: joinIsPending ? 'Request sent' : 'Circle joined',
      message: joinIsPending
        ? `Your request to join ${circle?.name || 'this Circle'} has been shared with the hosts for approval.`
        : `You are now inside ${circle?.name || 'this Circle'}. Betweener will keep it close in your Circles.`,
      tone: 'success',
    });
  }, [circle?.name, circleId, currentProfileId, membership?.status, refreshCircleAccessEnvelope]);

  const handleApprove = useCallback(async (memberId: string) => {
    if (!currentProfileId || !circleId) return;
    const { error } = await db.rpc('rpc_approve_circle_member', {
      p_circle_id: circleId,
      p_member_id: memberId,
      p_profile_id: currentProfileId,
    });
    if (error) {
      logger.error('[circles] approve_member_failed', error, { circleId });
      showBetweenerAlert({
        title: 'Approve failed',
        message: typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.',
        tone: 'error',
      });
      return;
    }
    await refreshCircleMembershipView();
  }, [circleId, currentProfileId, refreshCircleMembershipView]);

  const handleSetRole = useCallback(async (memberId: string, role: CircleManageRole) => {
    if (!currentProfileId || !circleId) return;
    const { error } = await db.rpc('rpc_set_circle_member_role', {
      p_circle_id: circleId,
      p_member_id: memberId,
      p_profile_id: currentProfileId,
      p_role: role,
    });
    if (error) {
      logger.error('[circles] set_role_failed', error, { circleId });
      showBetweenerAlert({
        title: 'Update failed',
        message: typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.',
        tone: 'error',
      });
      return;
    }
    setManageMemberTarget(null);
    await refreshCircleMembershipView();
  }, [circleId, currentProfileId, refreshCircleMembershipView]);

  const handleRemove = useCallback((memberId: string) => {
    if (!currentProfileId || !circleId) return;
    showBetweenerAlert({
      title: 'Remove member',
      message: 'Remove this person from the Circle?',
      tone: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setManageMemberTarget(null);
              const { error } = await db.rpc('rpc_remove_circle_member', {
                p_circle_id: circleId,
                p_member_id: memberId,
                p_profile_id: currentProfileId,
              });
              if (error) {
                logger.error('[circles] remove_member_failed', error, { circleId });
                showBetweenerAlert({
                  title: 'Remove failed',
                  message: typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.',
                  tone: 'error',
                });
                return;
              }
              await refreshCircleMembershipView();
            })();
          },
        },
      ],
    });
  }, [circleId, currentProfileId, refreshCircleMembershipView]);

  const handleLeave = useCallback(() => {
    if (!currentProfileId || !circleId || !canLeaveCircle) return;
    showBetweenerAlert({
      title: 'Leave Circle',
      message: 'Leave this Circle and stop seeing its member context?',
      tone: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error } = await db.rpc('rpc_leave_circle', {
                p_circle_id: circleId,
                p_profile_id: currentProfileId,
              });
              if (error) {
                logger.error('[circles] leave_circle_failed', error, { circleId });
                showBetweenerAlert({
                  title: 'Leave failed',
                  message: typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.',
                  tone: 'error',
                });
                return;
              }
              await refreshCircleAccessEnvelope();
            })();
          },
        },
      ],
    });
  }, [canLeaveCircle, circleId, currentProfileId, refreshCircleAccessEnvelope]);

  const handleArchiveCircle = useCallback(() => {
    if (!circleId || !currentProfileId || !isOwner) return;
    showBetweenerAlert({
      title: 'Archive Circle',
      message: 'Archive this Circle? Members will no longer see it in their Circle list.',
      tone: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error } = await db.rpc('rpc_archive_owned_circle', {
                p_circle_id: circleId,
                p_actor_profile_id: currentProfileId,
              });
              if (error) {
                logger.error('[circles] archive_circle_failed', error, { circleId });
                showBetweenerAlert({
                  title: 'Archive failed',
                  message: typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.',
                  tone: 'error',
                });
                return;
              }
              router.replace({ pathname: '/(tabs)/circles' });
            })();
          },
        },
      ],
    });
  }, [circleId, currentProfileId, isOwner]);

  const handleDeleteCircle = useCallback(() => {
    if (!circleId || !currentProfileId || !isOwner) return;
    showBetweenerAlert({
      title: 'Delete Circle',
      message: 'Permanently delete this non-live Circle? This cannot be undone.',
      tone: 'error',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error } = await db.rpc('rpc_delete_owned_circle', {
                p_circle_id: circleId,
                p_actor_profile_id: currentProfileId,
              });
              if (error) {
                logger.error('[circles] delete_circle_failed', error, { circleId });
                showBetweenerAlert({
                  title: 'Delete failed',
                  message: typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please archive a live Circle first.',
                  tone: 'error',
                });
                return;
              }
              router.replace({ pathname: '/(tabs)/circles' });
            })();
          },
        },
      ],
    });
  }, [circleId, currentProfileId, isOwner]);

  const handleSaveName = useCallback(async () => {
    if (!circleId || !currentProfileId) return;
    const trimmed = nameValue.trim();
    if (!trimmed) {
      showBetweenerAlert({
        title: 'Circle name',
        message: 'Please enter a Circle name.',
        tone: 'warning',
      });
      return;
    }
    const { data, error } = await db.rpc('rpc_update_circle_name', {
      p_circle_id: circleId,
      p_actor_profile_id: currentProfileId,
      p_name: trimmed,
    });
    if (error) {
      logger.error('[circles] update_name_failed', error, { circleId });
      showBetweenerAlert({
        title: 'Update failed',
        message: typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.',
        tone: 'error',
      });
      return;
    }
    const nextCircle = data ? { ...(circle ?? {}), ...(data as Partial<Circle>) } as Circle : circle;
    if (nextCircle) {
      setCircle(nextCircle);
      await persistCircleDetailSnapshot({ circle: nextCircle });
    }
    setEditingName(false);
  }, [circle, circleId, currentProfileId, nameValue, persistCircleDetailSnapshot]);

  const handlePickImage = useCallback(async () => {
    if (!circleId || !currentProfileId || imageUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showOpenSettingsPrompt('Photos access', 'Turn on photo access in Settings so Betweener can upload a Circle image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      setImageUploading(true);
      const uri = result.assets[0].uri;
      const fileExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${circleId}/${Date.now()}.${fileExtension}`;
      const response = await fetch(uri);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const { error: uploadError } = await db.storage.from('circle-images').upload(filePath, bytes, {
        contentType: `image/${fileExtension}`,
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const { data: updatedCircle, error: updateError } = await db.rpc('rpc_update_circle_image', {
        p_circle_id: circleId,
        p_actor_profile_id: currentProfileId,
        p_image_path: filePath,
      });
      if (updateError) throw updateError;
      setImageUrl(result.assets[0].uri);
      const nextCircle = updatedCircle ? { ...(circle ?? {}), ...(updatedCircle as Partial<Circle>) } as Circle : circle;
      if (nextCircle) {
        setCircle(nextCircle);
        await persistCircleDetailSnapshot({ circle: nextCircle });
      }
    } catch (error) {
      logger.error('[circles] upload_image_failed', error, { circleId });
      showBetweenerAlert({
        title: 'Upload failed',
        message: typeof __DEV__ !== 'undefined' && __DEV__ && error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setImageUploading(false);
    }
  }, [circle, circleId, currentProfileId, imageUploading, persistCircleDetailSnapshot]);

  const gatheringPosterCandidates = useMemo(
    () =>
      members
        .map((item) => ({
          profileId: item.profile_id,
          fullName: item.profiles?.full_name ?? 'Circle member',
          avatarUrl: item.profiles?.avatar_url ?? null,
          joinedAt: item.joined_at ?? null,
        }))
        .filter((item) => typeof item.avatarUrl === 'string' && item.avatarUrl.trim().length > 0)
        .slice(0, 12),
    [members],
  );
  const getGatheringPosterDisplayUri = useCallback((posterUrl?: string | null) => {
    const raw = normalizePosterKey(posterUrl);
    if (!raw) return null;
    return normalizeProfilePhotoUri(raw) || raw;
  }, []);
  const gatheringPosterMembersByUrl = useMemo(() => {
    const loveSeatProfileIds = new Set(
      pulseItems
        .filter((item) => item.type === 'love_seat' && item.featuredProfileId)
        .map((item) => item.featuredProfileId as string),
    );
    const next: Record<string, { profileId: string; fullName: string; avatarUrl: string; seatContext?: GatheringSeatContext }> = {};
    for (const item of gatheringPosterCandidates) {
      const key = normalizePosterKey(item.avatarUrl);
      if (!key) continue;
      next[key] = {
        profileId: item.profileId,
        fullName: item.fullName,
        avatarUrl: item.avatarUrl!,
        seatContext: loveSeatProfileIds.has(item.profileId)
          ? 'love'
          : isRecentCircleMember(item.joinedAt)
            ? 'welcome'
            : 'featured_member',
      };
    }
    return next;
  }, [gatheringPosterCandidates, pulseItems]);
  const gatheringPosterMembersByProfileId = useMemo(() => {
    const next: Record<string, { profileId: string; fullName: string; avatarUrl: string; seatContext?: GatheringSeatContext }> = {};
    for (const item of Object.values(gatheringPosterMembersByUrl)) {
      next[item.profileId] = item;
    }
    return next;
  }, [gatheringPosterMembersByUrl]);
  const getGatheringPosterMember = useCallback(
    (posterUrl?: string | null) => {
      const key = normalizePosterKey(posterUrl);
      return key ? gatheringPosterMembersByUrl[key] ?? null : null;
    },
    [gatheringPosterMembersByUrl],
  );
  const getGatheringPosterMemberByProfileId = useCallback(
    (profileId?: string | null) => {
      const key = String(profileId ?? '').trim();
      return key ? gatheringPosterMembersByProfileId[key] ?? null : null;
    },
    [gatheringPosterMembersByProfileId],
  );
  const getGatheringPresentationMember = useCallback(
    (gathering?: Gathering | null) => {
      if (!gathering) return null;
      if (gathering.presentation_mode === 'general') return null;
      return getGatheringPosterMemberByProfileId(gathering.featured_profile_id) ?? getGatheringPosterMember(gathering.poster_url);
    },
    [getGatheringPosterMember, getGatheringPosterMemberByProfileId],
  );
  const selectedGatheringPosterMember = useMemo(
    () => (gatheringComposerPosterMemberId ? gatheringPosterMembersByProfileId[gatheringComposerPosterMemberId] ?? null : null)
      ?? getGatheringPosterMember(gatheringComposerPosterUrl),
    [gatheringComposerPosterMemberId, gatheringComposerPosterUrl, gatheringPosterMembersByProfileId, getGatheringPosterMember],
  );
  const selectedGatheringPosterSeatContext = useMemo(
    () =>
      selectedGatheringPosterMember
        ? ((selectedGatheringPosterMember.seatContext ?? 'featured_member') as GatheringSeatContext)
        : 'featured_member',
    [selectedGatheringPosterMember],
  );

  const handlePickGatheringPosterImage = useCallback(async () => {
    if (!user?.id || gatheringPosterUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showOpenSettingsPrompt('Photos access', 'Turn on photo access in Settings so Betweener can upload a Gathering poster.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.84,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      setGatheringPosterUploading(true);
      const upload = await uploadImage({
        userId: user.id,
        uri: result.assets[0].uri,
        bucket: 'profile-photos',
        folder: `${user.id}/gathering-posters`,
      });
      if (upload.error || !upload.publicUrl) {
        throw new Error(upload.error || 'Poster upload failed');
      }
      setGatheringComposerPosterMode('image');
      setGatheringComposerPosterMemberId(null);
      setGatheringComposerPosterUrl(upload.path);
      setGatheringComposerPosterPreviewUrl(upload.previewUri ?? result.assets[0].uri);
    } catch (error) {
      logger.error('[circles] upload_gathering_poster_failed', error, { circleId });
      showBetweenerAlert({
        title: 'Poster upload failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setGatheringPosterUploading(false);
    }
  }, [circleId, gatheringPosterUploading, user?.id]);

  const handleSelectGatheringPosterMember = useCallback((profileId: string, avatarUrl: string | null) => {
    if (!avatarUrl) return;
    setGatheringComposerPosterMode('member');
    setGatheringComposerPosterMemberId(profileId);
    setGatheringComposerPosterUrl(avatarUrl);
    setGatheringComposerPosterPreviewUrl(avatarUrl);
  }, []);

  const handleAttend = useCallback(async (gathering: Gathering, status: 'interested' | 'attending' = 'attending', visibleToOthers = false) => {
    const existingAttendance = gatheringAttendance[gathering.id];
    const { data, error } = await db.rpc('rpc_attend_gathering', {
      p_gathering_id: gathering.id,
      p_status: status,
      p_visible_to_others: visibleToOthers,
    });
    if (error) {
      showBetweenerAlert({
        title: 'Attend failed',
        message: error.message || 'Please try again.',
        tone: 'error',
      });
      return;
    }
    const nextAttendanceRow: GatheringAttendance = {
      gathering_id: String((data as any)?.gathering_id ?? gathering.id),
      status: String((data as any)?.status ?? status),
      visible_to_others: (data as any)?.visible_to_others === true ? true : visibleToOthers,
    };
    const nextAttendance = {
      ...gatheringAttendance,
      [gathering.id]: nextAttendanceRow,
    };
    const delta =
      Number(isAttendanceCounted(nextAttendanceRow.status)) - Number(isAttendanceCounted(existingAttendance?.status));
    const nextGatherings = gatherings.map((item) => (
      item.id === gathering.id
        ? { ...item, attendee_count: Math.max(0, Number(item.attendee_count ?? 0) + delta) }
        : item
    ));
    setGatheringAttendance(nextAttendance);
    setGatherings(nextGatherings);
    await persistCircleDetailSnapshot({
      gatherings: nextGatherings,
      gatheringAttendance: nextAttendance,
    });
    showBetweenerAlert({
      title: status === 'interested' ? 'Interest saved' : 'You are attending',
      message: status === 'interested' ? 'This Gathering is saved as interested.' : 'This Gathering is saved for you.',
      tone: 'success',
    });
  }, [gatheringAttendance, gatherings, persistCircleDetailSnapshot]);

  const openGatheringRsvp = useCallback((gathering: Gathering) => {
    const existing = gatheringAttendance[gathering.id];
    setGatheringRsvpTarget(gathering);
    setGatheringRsvpStatus(existing?.status === 'interested' ? 'interested' : 'attending');
    setGatheringRsvpVisible(existing?.visible_to_others === true);
  }, [gatheringAttendance]);

  const closeGatheringRsvp = useCallback(() => {
    if (savingGatheringRsvp) return;
    setGatheringRsvpTarget(null);
  }, [savingGatheringRsvp]);

  const handleSaveGatheringRsvp = useCallback(async () => {
    if (!gatheringRsvpTarget || savingGatheringRsvp) return;
    setSavingGatheringRsvp(true);
    try {
      await handleAttend(gatheringRsvpTarget, gatheringRsvpStatus, gatheringRsvpVisible);
      setGatheringRsvpTarget(null);
    } finally {
      setSavingGatheringRsvp(false);
    }
  }, [gatheringRsvpStatus, gatheringRsvpTarget, gatheringRsvpVisible, handleAttend, savingGatheringRsvp]);

  const handleCancelGatheringRsvp = useCallback(async () => {
    if (!gatheringRsvpTarget || savingGatheringRsvp) return;
    setSavingGatheringRsvp(true);
    try {
      const { error } = await db.rpc('rpc_attend_gathering', {
        p_gathering_id: gatheringRsvpTarget.id,
        p_status: 'cancelled',
        p_visible_to_others: false,
      });
      if (error) {
        showBetweenerAlert({
          title: 'Update failed',
          message: error.message || 'Please try again.',
          tone: 'error',
        });
        return;
      }
      const existingAttendance = gatheringAttendance[gatheringRsvpTarget.id];
      const nextAttendance = {
        ...gatheringAttendance,
        [gatheringRsvpTarget.id]: {
          gathering_id: gatheringRsvpTarget.id,
          status: 'cancelled',
          visible_to_others: false,
        },
      };
      const delta = 0 - Number(isAttendanceCounted(existingAttendance?.status));
      const nextGatherings = gatherings.map((item) => (
        item.id === gatheringRsvpTarget.id
          ? { ...item, attendee_count: Math.max(0, Number(item.attendee_count ?? 0) + delta) }
          : item
      ));
      setGatheringAttendance(nextAttendance);
      setGatherings(nextGatherings);
      await persistCircleDetailSnapshot({
        gatherings: nextGatherings,
        gatheringAttendance: nextAttendance,
      });
      setGatheringRsvpTarget(null);
      showBetweenerAlert({
        title: 'RSVP removed',
        message: 'You will no longer appear as attending for this Gathering.',
        tone: 'success',
      });
    } finally {
      setSavingGatheringRsvp(false);
    }
  }, [gatheringAttendance, gatheringRsvpTarget, gatherings, persistCircleDetailSnapshot, savingGatheringRsvp]);

  const openPromptComposer = useCallback((prompt?: CirclePrompt | null) => {
    setEditingPromptTarget(prompt ?? null);
    setPromptComposerTitle(prompt?.title ?? '');
    setPromptComposerBody(prompt?.prompt ?? '');
    const nextType = String(prompt?.prompt_type ?? 'host').toLowerCase();
    setPromptComposerType(nextType === 'daily' || nextType === 'weekly' ? nextType : 'host');
    setPromptComposerOpen(true);
  }, []);

  const openReportSheet = useCallback((target: CircleReportTarget) => {
    setReportTarget(target);
    setReportReason(null);
    setReportDetails('');
  }, []);

  const handleInvite = useCallback(() => {
    if (!circle?.id || !circle.name) return;
    setInviteSheetOpen(true);
  }, [circle?.id, circle?.name]);

  const openHostNoteComposer = useCallback(() => {
    setCircleOptionsOpen(false);
    setHostNoteValue(circle?.host_note ?? '');
    setHostNoteOpen(true);
  }, [circle?.host_note]);

  const openCircleOptions = useCallback(() => {
    setCircleOptionsOpen(true);
  }, []);

  const closeReportSheet = useCallback(() => {
    if (submittingReport) return;
    setReportTarget(null);
    setReportReason(null);
    setReportDetails('');
  }, [submittingReport]);

  const handleSaveHostNote = useCallback(async () => {
    if (!circleId || !currentProfileId || savingHostNote) return;
    setSavingHostNote(true);
    try {
      const { data, error } = await db.rpc('rpc_set_circle_host_note', {
        p_circle_id: circleId,
        p_profile_id: currentProfileId,
        p_note: hostNoteValue,
      });
      if (error) throw error;
      const nextCircle = data ? { ...(circle ?? {}), ...(data as Partial<Circle>) } as Circle : circle;
      if (nextCircle) {
        setCircle(nextCircle);
        await persistCircleDetailSnapshot({ circle: nextCircle });
      }
      setHostNoteOpen(false);
      showBetweenerAlert({
        title: 'Host note updated',
        message: 'Members will now see the updated note in this Circle.',
        tone: 'success',
      });
    } catch (error) {
      showBetweenerAlert({
        title: 'Host note failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setSavingHostNote(false);
    }
  }, [circle, circleId, currentProfileId, hostNoteValue, persistCircleDetailSnapshot, savingHostNote]);

  const handleSubmitCircleReport = useCallback(async () => {
    if (!currentProfileId || !user?.id || !reportTarget || !reportReason || submittingReport) return;
    setSubmittingReport(true);
    try {
      const payload: Record<string, any> = {
        reporter_profile_id: currentProfileId,
        reporter_user_id: user.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
      };
      if (reportTarget.type === 'circle') {
        payload.circle_id = reportTarget.id;
      } else if (reportTarget.type === 'gathering') {
        payload.gathering_id = reportTarget.id;
        payload.circle_id = circleId || null;
      } else {
        payload.prompt_response_id = reportTarget.id;
        payload.circle_id = circleId || null;
      }
      const { error } = await db.from('circle_reports').insert(payload);
      if (error) throw error;
      closeReportSheet();
      showBetweenerAlert({
        title: 'Report sent',
        message: 'We will review this privately. The Circle leadership will not be notified directly.',
        tone: 'success',
      });
    } catch (error) {
      showBetweenerAlert({
        title: 'Report failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setSubmittingReport(false);
    }
  }, [circleId, closeReportSheet, currentProfileId, reportDetails, reportReason, reportTarget, submittingReport, user?.id]);

  const handleReviewCircleReport = useCallback(async (reportId: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    if (!currentProfileId || reviewingReportId) return;
    setReviewingReportId(reportId);
    try {
      const { data, error } = await db.rpc('rpc_review_circle_report', {
        p_report_id: reportId,
        p_profile_id: currentProfileId,
        p_status: status,
      });
      if (error) throw error;
      await patchModerationReportState(reportId, String((data as any)?.status ?? status));
    } catch (error) {
      showBetweenerAlert({
        title: 'Moderation update failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setReviewingReportId(null);
    }
  }, [currentProfileId, patchModerationReportState, reviewingReportId]);

  const handleRemovePromptResponse = useCallback((responseId: string) => {
    if (!currentProfileId || removingPromptResponseId) return;
    showBetweenerAlert({
      title: 'Remove response',
      message: 'Remove this response from the Circle?',
      tone: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRemovingPromptResponseId(responseId);
              try {
                const { error } = await db.rpc('rpc_remove_circle_prompt_response', {
                  p_response_id: responseId,
                  p_profile_id: currentProfileId,
                });
                if (error) throw error;
                await refreshCirclePromptsStatePersisted();
              } catch (error) {
                showBetweenerAlert({
                  title: 'Remove failed',
                  message: error instanceof Error ? error.message : 'Please try again.',
                  tone: 'error',
                });
              } finally {
                setRemovingPromptResponseId(null);
              }
            })();
          },
        },
      ],
    });
  }, [currentProfileId, refreshCirclePromptsStatePersisted, removingPromptResponseId]);

  const openRoleRequest = useCallback((role: CircleRoleRequestType) => {
    if (!requestableRoleTypes.includes(role)) return;
    setRoleRequestType(role);
    setRoleRequestNote('');
    setRoleRequestOpen(true);
  }, [requestableRoleTypes]);

  const handleSubmitRoleRequest = useCallback(async () => {
    if (!circleId || !currentProfileId || submittingRoleRequest) return;
    setSubmittingRoleRequest(true);
    try {
      const { data, error } = await db.rpc('rpc_request_circle_role', {
        p_circle_id: circleId,
        p_profile_id: currentProfileId,
        p_requested_role: roleRequestType,
        p_note: roleRequestNote.trim() || null,
      });
      if (error) throw error;
      const nextRequest: CircleRoleRequest | null = data ? {
        id: String((data as any).id),
        circle_id: String((data as any).circle_id ?? circleId),
        requester_profile_id: String((data as any).requester_profile_id ?? currentProfileId),
        requester_user_id: (data as any).requester_user_id ? String((data as any).requester_user_id) : user?.id ?? null,
        requested_role: String((data as any).requested_role ?? roleRequestType) as CircleRoleRequestType,
        note: (data as any).note ?? (roleRequestNote.trim() || null),
        status: String((data as any).status ?? 'pending'),
        rejection_reason: (data as any).rejection_reason ?? null,
        created_at: String((data as any).created_at ?? new Date().toISOString()),
        requester: {
          id: currentProfileId,
          user_id: user?.id ?? null,
          full_name: authProfile?.full_name ?? 'You',
          avatar_url: authProfile?.avatar_url ?? null,
          age: authProfile?.age ?? null,
          location: authProfile?.location ?? null,
          city: authProfile?.city ?? null,
          region: authProfile?.region ?? null,
        },
      } : null;
      if (nextRequest) {
        await patchRoleRequestState(nextRequest);
      }
      setRoleRequestOpen(false);
      setRoleRequestNote('');
      showBetweenerAlert({
        title: 'Request submitted',
        message: `Your ${roleRequestType} request has been shared with the Circle hosts.`,
        tone: 'success',
      });
    } catch (error) {
      showBetweenerAlert({
        title: 'Request failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setSubmittingRoleRequest(false);
    }
  }, [authProfile, circleId, currentProfileId, patchRoleRequestState, roleRequestNote, roleRequestType, submittingRoleRequest, user?.id]);

  const handleReviewRoleRequest = useCallback(async (requestId: string, decision: 'approve' | 'reject', rejectionReason?: string | null) => {
    if (!currentProfileId || reviewingRoleRequestId) return;
    setReviewingRoleRequestId(requestId);
    try {
      const existingRequest = roleRequests.find((item) => item.id === requestId) ?? null;
      const { data, error } = await db.rpc('rpc_review_circle_role_request', {
        p_request_id: requestId,
        p_profile_id: currentProfileId,
        p_decision: decision,
        p_rejection_reason: rejectionReason?.trim() || null,
      });
      if (error) throw error;
      const nextRequest: CircleRoleRequest | null = data ? {
        id: String((data as any).id),
        circle_id: String((data as any).circle_id ?? existingRequest?.circle_id ?? circleId),
        requester_profile_id: String((data as any).requester_profile_id ?? existingRequest?.requester_profile_id ?? ''),
        requester_user_id: (data as any).requester_user_id ? String((data as any).requester_user_id) : existingRequest?.requester_user_id ?? null,
        requested_role: String((data as any).requested_role ?? existingRequest?.requested_role ?? 'moderator') as CircleRoleRequestType,
        note: (data as any).note ?? existingRequest?.note ?? null,
        status: String((data as any).status ?? (decision === 'approve' ? 'approved' : 'rejected')),
        rejection_reason: (data as any).rejection_reason ?? (rejectionReason?.trim() || null),
        created_at: String((data as any).created_at ?? existingRequest?.created_at ?? new Date().toISOString()),
        requester: existingRequest?.requester ?? null,
      } : null;
      if (nextRequest) {
        await patchRoleRequestState(nextRequest, {
          requesterProfileId: nextRequest.requester_profile_id,
          updatedMemberRole: decision === 'approve' ? (nextRequest.requested_role as CircleManageRole) : null,
        });
      }
      setRoleRequestRejectTarget(null);
      setRoleRequestRejectReason('');
    } catch (error) {
      showBetweenerAlert({
        title: `${decision === 'approve' ? 'Approve' : 'Reject'} failed`,
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setReviewingRoleRequestId(null);
    }
  }, [circleId, currentProfileId, patchRoleRequestState, reviewingRoleRequestId, roleRequests]);

  const openRejectRoleRequest = useCallback((request: CircleRoleRequest) => {
    setRoleRequestRejectTarget(request);
    setRoleRequestRejectReason('');
  }, []);

  const handleCancelRoleRequest = useCallback(async (requestId: string) => {
    if (!currentProfileId || cancellingRoleRequestId) return;
    setCancellingRoleRequestId(requestId);
    try {
      const existingRequest = roleRequests.find((item) => item.id === requestId) ?? null;
      const { data, error } = await db.rpc('rpc_cancel_circle_role_request', {
        p_request_id: requestId,
        p_profile_id: currentProfileId,
      });
      if (error) throw error;
      const nextRequest: CircleRoleRequest | null = data ? {
        id: String((data as any).id),
        circle_id: String((data as any).circle_id ?? existingRequest?.circle_id ?? circleId),
        requester_profile_id: String((data as any).requester_profile_id ?? existingRequest?.requester_profile_id ?? currentProfileId),
        requester_user_id: (data as any).requester_user_id ? String((data as any).requester_user_id) : existingRequest?.requester_user_id ?? user?.id ?? null,
        requested_role: String((data as any).requested_role ?? existingRequest?.requested_role ?? 'moderator') as CircleRoleRequestType,
        note: (data as any).note ?? existingRequest?.note ?? null,
        status: String((data as any).status ?? 'cancelled'),
        rejection_reason: (data as any).rejection_reason ?? existingRequest?.rejection_reason ?? null,
        created_at: String((data as any).created_at ?? existingRequest?.created_at ?? new Date().toISOString()),
        requester: existingRequest?.requester ?? null,
      } : null;
      if (nextRequest) {
        await patchRoleRequestState(nextRequest);
      }
    } catch (error) {
      showBetweenerAlert({
        title: 'Cancel failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setCancellingRoleRequestId(null);
    }
  }, [cancellingRoleRequestId, circleId, currentProfileId, patchRoleRequestState, roleRequests, user?.id]);

  const handleSavePrompt = useCallback(async () => {
    if (!circleId || publishingPrompt) return;
    const title = promptComposerTitle.trim();
    const body = promptComposerBody.trim();
    if (!title || title.length < 3) {
      showBetweenerAlert({
        title: 'Prompt title',
        message: 'Add a clear prompt title.',
        tone: 'warning',
      });
      return;
    }
    if (!body || body.length < 10) {
      showBetweenerAlert({
        title: 'Prompt body',
        message: 'Add a thoughtful prompt people can answer.',
        tone: 'warning',
      });
      return;
    }
    setPublishingPrompt(true);
    try {
      const rpcName = editingPromptTarget ? 'rpc_update_circle_prompt' : 'rpc_create_circle_prompt';
      const { data, error } = await db.rpc(rpcName, {
        ...(editingPromptTarget ? { p_prompt_id: editingPromptTarget.id } : {}),
        p_circle_id: circleId,
        p_title: title,
        p_prompt: body,
        p_prompt_type: promptComposerType,
      });
      if (error) throw error;
      const nextPrompt: CirclePrompt | null = data ? {
        id: String((data as any).id),
        title: String((data as any).title ?? title),
        prompt: String((data as any).prompt ?? body),
        prompt_type: (data as any).prompt_type ?? promptComposerType,
        expires_at: (data as any).expires_at ?? null,
      } : null;
      if (nextPrompt) {
        const nextPrompts = editingPromptTarget
          ? prompts.map((item) => (item.id === nextPrompt.id ? nextPrompt : item))
          : [nextPrompt, ...prompts];
        setPrompts(nextPrompts);
        await persistCircleDetailSnapshot({ prompts: nextPrompts });
      }
      setPromptComposerOpen(false);
      setEditingPromptTarget(null);
      setPromptComposerTitle('');
      setPromptComposerBody('');
      await reloadPulse();
      showBetweenerAlert({
        title: editingPromptTarget ? 'Prompt updated' : 'Prompt published',
        message: editingPromptTarget ? 'The Circle prompt has been refreshed.' : 'Members can answer it now.',
        tone: 'success',
      });
    } catch (error) {
      showBetweenerAlert({
        title: editingPromptTarget ? 'Prompt update failed' : 'Prompt publish failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setPublishingPrompt(false);
    }
  }, [circleId, editingPromptTarget, persistCircleDetailSnapshot, promptComposerBody, promptComposerTitle, promptComposerType, prompts, publishingPrompt, reloadPulse]);

  const handleDeletePrompt = useCallback((prompt: CirclePrompt) => {
    if (!circleId || deletingContentKey) return;
    showBetweenerAlert({
      title: 'Delete prompt?',
      message: 'This will archive the prompt and remove it from Circle Pulse.',
      tone: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingContentKey(`prompt:${prompt.id}`);
              try {
                const { error } = await db.rpc('rpc_delete_circle_prompt', {
                  p_prompt_id: prompt.id,
                  p_circle_id: circleId,
                });
                if (error) throw error;
                if (editingPromptTarget?.id === prompt.id) {
                  setPromptComposerOpen(false);
                  setEditingPromptTarget(null);
                }
                const nextPrompts = prompts.filter((item) => item.id !== prompt.id);
                const nextPromptResponses = { ...promptResponsesByPromptId };
                delete nextPromptResponses[prompt.id];
                setPrompts(nextPrompts);
                setPromptResponsesByPromptId(nextPromptResponses);
                await persistCircleDetailSnapshot({
                  prompts: nextPrompts,
                  promptResponsesByPromptId: nextPromptResponses,
                });
                await reloadPulse();
              } catch (error) {
                showBetweenerAlert({
                  title: 'Prompt delete failed',
                  message: error instanceof Error ? error.message : 'Please try again.',
                  tone: 'error',
                });
              } finally {
                setDeletingContentKey(null);
              }
            })();
          },
        },
      ],
    });
  }, [circleId, deletingContentKey, editingPromptTarget?.id, persistCircleDetailSnapshot, promptResponsesByPromptId, prompts, reloadPulse]);

  const openGatheringComposer = useCallback((gathering?: Gathering | null) => {
    const posterMember = getGatheringPresentationMember(gathering);
    setEditingGatheringTarget(gathering ?? null);
    setGatheringComposerTitle(gathering?.title ?? '');
    setGatheringComposerDescription(gathering?.description ?? '');
    setGatheringComposerDate(toDateInputValue(gathering?.starts_at));
    setGatheringComposerTime(toTimeInputValue(gathering?.starts_at));
    setGatheringComposerCity(gathering?.city ?? circle?.city ?? (profile?.city ?? ''));
    setGatheringComposerVenue(gathering?.venue_name ?? '');
    const nextType = String(gathering?.gathering_type ?? 'physical').toLowerCase();
    setGatheringComposerType(nextType === 'online' || nextType === 'hybrid' ? nextType : 'physical');
    setGatheringComposerPosterUrl(gathering?.poster_url ?? null);
    setGatheringComposerPosterPreviewUrl(
      posterMember?.avatarUrl ?? getGatheringPosterDisplayUri(gathering?.poster_url) ?? null,
    );
    setGatheringComposerPosterMode(
      posterMember && gathering?.presentation_mode === 'seat_linked'
        ? 'member'
        : gathering?.poster_url
          ? 'image'
          : null,
    );
    setGatheringComposerPosterMemberId(posterMember?.profileId ?? null);
    setGatheringComposerOpen(true);
  }, [circle?.city, getGatheringPosterDisplayUri, getGatheringPresentationMember, profile?.city]);

  const handleSaveGathering = useCallback(async () => {
    if (!circleId || creatingGathering) return;
    const title = gatheringComposerTitle.trim();
    const description = gatheringComposerDescription.trim();
    const datePart = gatheringComposerDate.trim();
    const timePart = gatheringComposerTime.trim();
    if (!title || title.length < 3) {
      showBetweenerAlert({
        title: 'Gathering title',
        message: 'Add a clear Gathering title.',
        tone: 'warning',
      });
      return;
    }
    if (!description || description.length < 10) {
      showBetweenerAlert({
        title: 'Gathering details',
        message: 'Add a short description for review.',
        tone: 'warning',
      });
      return;
    }
    if (!datePart || !timePart) {
      showBetweenerAlert({
        title: 'Start time',
        message: 'Add a valid future date and time.',
        tone: 'warning',
      });
      return;
    }
    const startsAt = new Date(`${datePart}T${timePart}`);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      showBetweenerAlert({
        title: 'Start time',
        message: 'Use a future date and time.',
        tone: 'warning',
      });
      return;
    }
    const presentationMode = gatheringComposerPosterMode === 'member' && gatheringComposerPosterMemberId ? 'seat_linked' : 'general';
    const featuredProfileId = presentationMode === 'seat_linked' ? gatheringComposerPosterMemberId : null;
    const seatContext = presentationMode === 'seat_linked'
      ? selectedGatheringPosterSeatContext === 'featured_member'
        ? null
        : selectedGatheringPosterSeatContext
      : null;
    setCreatingGathering(true);
    try {
      const rpcName = editingGatheringTarget ? 'rpc_update_gathering_request' : 'rpc_create_gathering_request';
      const { data, error } = await db.rpc(rpcName, {
        ...(editingGatheringTarget ? { p_gathering_id: editingGatheringTarget.id } : {}),
        p_circle_id: circleId,
        p_title: title,
        p_description: description,
        p_poster_url: gatheringComposerPosterUrl,
        p_gathering_type: gatheringComposerType,
        p_country_code: (profile as any)?.current_country_code ?? null,
        p_country_name: (profile as any)?.current_country ?? null,
        p_region: (profile as any)?.region ?? null,
        p_city: gatheringComposerCity.trim() || circle?.city || ((profile as any)?.city ?? null),
        p_venue_name: gatheringComposerVenue.trim() || null,
        p_address_visibility: gatheringComposerType === 'online' ? 'hidden' : 'attendees_only',
        p_starts_at: startsAt.toISOString(),
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        p_tags: [],
        p_presentation_mode: presentationMode,
        p_featured_profile_id: featuredProfileId,
        p_seat_context: seatContext,
        p_host_created_for_member: presentationMode === 'seat_linked',
      });
      if (error) throw error;
      const savedGathering = data
        ? ({
            id: String((data as any).id),
            title: String((data as any).title ?? title),
            description: (data as any).description ?? description,
            poster_url: (data as any).poster_url ?? gatheringComposerPosterUrl,
            presentation_mode: (data as any).presentation_mode ?? presentationMode,
            featured_profile_id: (data as any).featured_profile_id ?? featuredProfileId,
            seat_context: (data as any).seat_context ?? seatContext,
            host_created_for_member: (data as any).host_created_for_member ?? (presentationMode === 'seat_linked'),
            starts_at: String((data as any).starts_at ?? startsAt.toISOString()),
            city: (data as any).city ?? (gatheringComposerCity.trim() || circle?.city || ((profile as any)?.city ?? null)),
            country_code: (data as any).country_code ?? ((profile as any)?.current_country_code ?? null),
            venue_name: (data as any).venue_name ?? (gatheringComposerVenue.trim() || null),
            gathering_type: (data as any).gathering_type ?? gatheringComposerType,
            address_visibility: (data as any).address_visibility ?? (gatheringComposerType === 'online' ? 'hidden' : 'attendees_only'),
            is_partner_venue: (data as any).is_partner_venue ?? null,
            safe_first_date_space: (data as any).safe_first_date_space ?? null,
            attendee_count: (data as any).attendee_count ?? editingGatheringTarget?.attendee_count ?? 0,
          } satisfies Gathering)
        : null;
      setGatheringComposerOpen(false);
      setEditingGatheringTarget(null);
      setGatheringComposerTitle('');
      setGatheringComposerDescription('');
      setGatheringComposerDate('');
      setGatheringComposerTime('');
      setGatheringComposerVenue('');
      setGatheringComposerPosterUrl(null);
      setGatheringComposerPosterPreviewUrl(null);
      setGatheringComposerPosterMode(null);
      setGatheringComposerPosterMemberId(null);
      if (savedGathering) {
        const isApproved = String((data as any)?.status ?? '').toLowerCase() === 'approved';
        const nextGatherings = isApproved
          ? (() => {
              const next = editingGatheringTarget
                ? gatherings.map((item) => (item.id === savedGathering.id ? savedGathering : item))
                : [savedGathering, ...gatherings];
              return [...next].sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());
            })()
          : gatherings.filter((item) => item.id !== savedGathering.id);
        setGatherings(nextGatherings);
        await persistCircleDetailSnapshot({ gatherings: nextGatherings });
      }
      await reloadPulse();
      showBetweenerAlert({
        title: editingGatheringTarget ? 'Gathering updated' : 'Gathering submitted',
        message: editingGatheringTarget ? 'The gathering details and poster have been updated.' : 'We will notify you once it is approved.',
        tone: 'success',
      });
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: unknown }).message || 'Please try again.')
          : 'Please try again.';
      showBetweenerAlert({
        title: editingGatheringTarget ? 'Gathering update failed' : 'Gathering request failed',
        message,
        tone: 'error',
      });
    } finally {
      setCreatingGathering(false);
    }
  }, [
    circle?.city,
    circleId,
    creatingGathering,
    editingGatheringTarget,
    gatheringComposerCity,
    gatheringComposerDate,
    gatheringComposerDescription,
    gatheringComposerPosterUrl,
    gatheringComposerPosterPreviewUrl,
    gatheringComposerTime,
    gatheringComposerTitle,
    gatheringComposerType,
    gatheringComposerVenue,
    gatherings,
    persistCircleDetailSnapshot,
    profile,
    reloadPulse,
  ]);

  const handleDeleteGathering = useCallback((gathering: Gathering) => {
    if (deletingContentKey) return;
    showBetweenerAlert({
      title: 'Delete Gathering?',
      message: 'This will archive the Gathering and remove it from Circle Pulse.',
      tone: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingContentKey(`gathering:${gathering.id}`);
              try {
                const { error } = await db.rpc('rpc_delete_gathering_request', {
                  p_gathering_id: gathering.id,
                });
                if (error) throw error;
                if (editingGatheringTarget?.id === gathering.id) {
                  setGatheringComposerOpen(false);
                  setEditingGatheringTarget(null);
                }
                const nextGatherings = gatherings.filter((item) => item.id !== gathering.id);
                const nextAttendance = { ...gatheringAttendance };
                delete nextAttendance[gathering.id];
                setGatherings(nextGatherings);
                setGatheringAttendance(nextAttendance);
                await persistCircleDetailSnapshot({
                  gatherings: nextGatherings,
                  gatheringAttendance: nextAttendance,
                });
                await reloadPulse();
              } catch (error) {
                showBetweenerAlert({
                  title: 'Gathering delete failed',
                  message: error instanceof Error ? error.message : 'Please try again.',
                  tone: 'error',
                });
              } finally {
                setDeletingContentKey(null);
              }
            })();
          },
        },
      ],
    });
  }, [deletingContentKey, editingGatheringTarget?.id, gatheringAttendance, gatherings, persistCircleDetailSnapshot, reloadPulse]);

  const openPromptAnswer = useCallback((prompt: CirclePrompt) => {
    setPromptTarget(prompt);
    setPromptAnswer('');
    setPromptAnswerOpen(true);
  }, []);

  const handleSubmitPromptAnswer = useCallback(async () => {
    if (!promptTarget?.id) return;
    const body = promptAnswer.trim();
    if (!body) {
      showBetweenerAlert({
        title: 'Circle Prompt',
        message: 'Add your answer first.',
        tone: 'warning',
      });
      return;
    }
    const { data, error } = await db.rpc('rpc_answer_circle_prompt', {
      p_prompt_id: promptTarget.id,
      p_response: body,
    });
    if (error) {
      showBetweenerAlert({
        title: 'Circle Prompt',
        message: error.message || 'Please try again.',
        tone: 'error',
      });
      return;
    }
    const nextResponse: CirclePromptResponse | null = data ? {
      id: String((data as any).id),
      prompt_id: String((data as any).prompt_id ?? promptTarget.id),
      profile_id: String((data as any).profile_id ?? currentProfileId ?? ''),
      response: String((data as any).response ?? body),
      created_at: String((data as any).created_at ?? new Date().toISOString()),
      profiles: currentProfileId
        ? {
            id: currentProfileId,
            user_id: user?.id ?? null,
            full_name: authProfile?.full_name ?? 'You',
            avatar_url: authProfile?.avatar_url ?? null,
            age: authProfile?.age ?? null,
            location: authProfile?.location ?? null,
            city: authProfile?.city ?? null,
            region: authProfile?.region ?? null,
          }
        : null,
    } : null;
    if (nextResponse) {
      const existing = promptResponsesByPromptId[promptTarget.id] ?? [];
      const nextPromptResponses = {
        ...promptResponsesByPromptId,
        [promptTarget.id]: [nextResponse, ...existing],
      };
      setPromptResponsesByPromptId(nextPromptResponses);
      await persistCircleDetailSnapshot({
        promptResponsesByPromptId: nextPromptResponses,
      });
    }
    setPromptAnswerOpen(false);
    setPromptTarget(null);
    setPromptAnswer('');
    showBetweenerAlert({
      title: 'Answer shared',
      message: 'Your answer has been shared with the Circle.',
      tone: 'success',
    });
  }, [authProfile, currentProfileId, persistCircleDetailSnapshot, promptAnswer, promptResponsesByPromptId, promptTarget, user?.id]);

  const openProfile = useCallback((profileId?: string | null) => {
    if (!profileId) return;
    router.push({
      pathname: '/profile-view',
      params: {
        profileId: String(profileId),
        source: 'circle',
        returnCircleId: circleId,
      },
    });
  }, [circleId]);

  const openIntentSheet = useCallback((profileId?: string | null, name?: string | null) => {
    if (!profileId || profileId === currentProfileId) return;
    setIntentTarget({ id: profileId, name: name ?? null });
    setIntentSheetOpen(true);
  }, [currentProfileId]);

  const leadershipMembers = useMemo(
    () =>
      members
        .filter((item) => ['leader', 'host', 'moderator', 'admin', 'matchmaker'].includes(String(item.role).toLowerCase()))
        .sort((a, b) => {
          const weight = (role: string) => {
            switch (String(role).toLowerCase()) {
              case 'admin':
                return 0;
              case 'leader':
              case 'host':
                return 1;
              case 'moderator':
                return 2;
              case 'matchmaker':
                return 3;
              default:
                return 4;
            }
          };
          return weight(a.role) - weight(b.role);
        }),
    [members],
  );
  const communityMembers = useMemo(
    () => members.filter((item) => !leadershipMembers.some((leader) => leader.id === item.id)),
    [leadershipMembers, members],
  );
  const membersByProfileId = useMemo(
    () => members.reduce<Record<string, MemberRow>>((acc, item) => {
      acc[item.profile_id] = item;
      return acc;
    }, {}),
    [members],
  );
  const recentMoments = moments.slice(0, 4);
  const pulsePromptCandidates = useMemo(
    () => prompts.map((item) => ({ id: item.id, title: item.title, prompt: item.prompt })),
    [prompts],
  );
  const pulseGatheringCandidates = useMemo(
    () => gatherings.map((item) => ({ id: item.id, title: item.title, description: item.description, startsAt: item.starts_at })),
    [gatherings],
  );
  const pulseMediaCandidates = useMemo(
    () =>
      moments
        .filter((item) => item.type === 'photo' || item.type === 'video')
        .map((item) => ({
          id: item.id,
          title: item.profile?.full_name ? `${item.profile.full_name}'s Moment` : 'Circle Moment',
          subtitle: getMomentPreview(item),
          momentType: item.type,
          imageUrl: momentSignedUrls[item.id] || item.thumbnail_url || item.media_url || null,
        })),
    [momentSignedUrls, moments],
  );
  const pulseLoveSeatCandidates = useMemo(
    () =>
      members.map((item) => ({
        profileId: item.profile_id,
        name: item.profiles?.full_name || 'Circle member',
        age: item.profiles?.age ?? null,
        avatarUrl: item.profiles?.avatar_url ?? null,
        location: item.profiles?.city || item.profiles?.region || null,
      })),
    [members],
  );
  const matchmakerCount = useMemo(
    () => members.filter((item) => String(item.role).toLowerCase() === 'matchmaker').length,
    [members],
  );
  const primaryHost = leadershipMembers[0] ?? null;
  const pulseCommentCount = useMemo(
    () => pulseItems.reduce((total, item) => total + item.commentCount, 0),
    [pulseItems],
  );
  const pendingCount = pendingMembers.length;
  const pendingRoleRequests = useMemo(
    () => roleRequests.filter((item) => item.status === 'pending'),
    [roleRequests],
  );
  const myRoleRequests = useMemo(
    () => roleRequests.filter((item) => item.requester_profile_id === currentProfileId),
    [currentProfileId, roleRequests],
  );
  const myPendingRoleRequests = useMemo(
    () => pendingRoleRequests.filter((item) => item.requester_profile_id === currentProfileId),
    [currentProfileId, pendingRoleRequests],
  );
  const myPendingRoleTypes = useMemo(
    () => new Set(myPendingRoleRequests.map((item) => item.requested_role)),
    [myPendingRoleRequests],
  );

  const openMomentThread = useCallback((moment: CircleMoment) => {
    if (!moment.user_id) return;
    if (user?.id && moment.user_id === user.id) {
      router.push('/my-moments');
      return;
    }
    router.push({
      pathname: '/moments',
      params: {
        startUserId: moment.user_id,
        source: 'circles',
        entry: 'circles',
        circleId,
        circleName: circle?.name ?? '',
      },
    });
  }, [circle?.name, circleId, user?.id]);

  const normalizeMemberTargetProfileId = useCallback((profileId?: string | null) => {
    if (!profileId) return null;
    const directId = String(profileId);
    if (matchedMemberProfileIds[directId] || membersByProfileId[directId]) return directId;
    const resolvedMember = members.find((item) => item.profiles?.id === directId);
    return resolvedMember?.profile_id ?? directId;
  }, [matchedMemberProfileIds, members, membersByProfileId]);

  const openMatchedMemberChat = useCallback((profileId?: string | null, fallbackName?: string | null) => {
    const targetProfileId = normalizeMemberTargetProfileId(profileId);
    if (!targetProfileId) return;
    const member = membersByProfileId[targetProfileId]?.profiles ?? null;
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: targetProfileId,
        peerUserId: member?.user_id ?? '',
        userName: member?.full_name ?? fallbackName ?? '',
        userAvatar: member?.avatar_url ?? '',
      },
    });
  }, [membersByProfileId, normalizeMemberTargetProfileId]);

  const handleMemberConnection = useCallback((profileId?: string | null, name?: string | null) => {
    const targetProfileId = normalizeMemberTargetProfileId(profileId);
    if (!targetProfileId || targetProfileId === currentProfileId) return;
    if (matchedMemberProfileIds[targetProfileId]) {
      openMatchedMemberChat(targetProfileId, name);
      return;
    }
    openIntentSheet(targetProfileId, name);
  }, [currentProfileId, matchedMemberProfileIds, normalizeMemberTargetProfileId, openIntentSheet, openMatchedMemberChat]);

  const isMatchedMember = useCallback((item: MemberRow) => (
    Boolean(
      matchedMemberProfileIds[item.profile_id]
      || (item.profiles?.id ? matchedMemberProfileIds[item.profiles.id] : false)
      || (item.user_id ? matchedMemberUserIds[item.user_id] : false)
      || (item.profiles?.user_id ? matchedMemberUserIds[item.profiles.user_id] : false)
    )
  ), [matchedMemberProfileIds, matchedMemberUserIds]);

  const getMemberConnectionLabel = useCallback((item: MemberRow) => {
    if (isMatchedMember(item)) return 'Chat';
    return String(item.role).toLowerCase() === 'matchmaker' ? 'Ask intro' : 'Request';
  }, [isMatchedMember]);

  const openPulseMomentViewer = useCallback((moment: CircleMoment) => {
    if (!moment.user_id) return;
    router.push({
      pathname: '/moments',
      params: {
        startUserId: moment.user_id,
        startMomentId: moment.id,
        source: 'circles',
        entry: 'circles',
        circleId,
        circleName: circle?.name ?? '',
      },
    });
  }, [circle?.name, circleId]);

  const openPulseMomentViewerByIds = useCallback((userId: string, momentId: string) => {
    router.push({
      pathname: '/moments',
      params: {
        startUserId: userId,
        startMomentId: momentId,
        source: 'circles',
        entry: 'circles',
        circleId,
        circleName: circle?.name ?? '',
      },
    });
  }, [circle?.name, circleId]);

  const openPulsePrompt = useCallback((promptId: string) => {
    const prompt = prompts.find((item) => item.id === promptId);
    if (prompt) openPromptAnswer(prompt);
  }, [openPromptAnswer, prompts]);

  const openPulseGathering = useCallback((gatheringId: string) => {
    const gathering = gatherings.find((item) => item.id === gatheringId);
    if (gathering) openGatheringRsvp(gathering);
  }, [gatherings, openGatheringRsvp]);

  const openPulseMedia = useCallback((item: CirclePulseItem) => {
    const moment = moments.find((candidate) => candidate.id === item.momentId);
    if (moment) {
      openPulseMomentViewer(moment);
      return;
    }
    if (item.momentId && item.featuredProfileId) {
      const member = members.find((candidate) => candidate.profile_id === item.featuredProfileId);
      const fallbackUserId = member?.user_id ?? member?.profiles?.user_id ?? null;
      if (fallbackUserId) {
        openPulseMomentViewerByIds(String(fallbackUserId), item.momentId);
        return;
      }
    }
    if (item.mediaUrl || item.imageUrl) {
      setPulseMediaTarget(item);
      return;
    }
    showBetweenerAlert({
      title: 'Circle media',
      message: 'This spotlight is not available in the media viewer yet.',
      tone: 'info',
    });
  }, [members, moments, openPulseMomentViewer, openPulseMomentViewerByIds]);

  const handleEndLoveSeat = useCallback((item: CirclePulseItem) => {
    if (!item.loveSeatId || !currentProfileId) return;
    showBetweenerAlert({
      title: 'End Love Seat?',
      message: 'This spotlight will leave Circle Pulse immediately.',
      tone: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End feature',
          style: 'destructive',
          onPress: () => {
            void endCircleLoveSeat(item.loveSeatId!, currentProfileId)
              .then(() => reloadPulse())
              .catch((error) => showBetweenerAlert({
                title: 'Love Seat',
                message: error instanceof Error ? error.message : 'Could not end this feature right now.',
                tone: 'error',
              }));
          },
        },
      ],
    });
  }, [currentProfileId, reloadPulse]);

  const openCircleMomentCreate = useCallback(() => {
    router.push({
      pathname: '/moments/create',
      params: {
        source: 'circles',
        circleId,
        circleName: circle?.name ?? '',
      },
    });
  }, [circle?.name, circleId]);

  const handleCheckMomentFeed = useCallback(async () => {
    if (!circleId) return;
    const { data, error } = await db.rpc('rpc_debug_circle_member_moments', {
      p_circle_id: circleId,
    });
    if (error) {
      showBetweenerAlert({
        title: 'Moment feed check',
        message: String(error.message || error),
        tone: 'error',
      });
      return;
    }
    const { activeCount, visibleCount } = summarizeCircleMomentDiagnostics(data);
    logger.warn('[circles] member_moments_manual_check', { circleId, diagnostics: data });
    showBetweenerAlert({
      title: 'Moment feed check',
      message: activeCount === 0
        ? 'No active Moment rows were found for visible Circle members.'
        : visibleCount === 0
          ? `${activeCount} active Moment row${activeCount === 1 ? '' : 's'} found, but none are currently eligible for this Circle feed.`
          : `${visibleCount} eligible Moment row${visibleCount === 1 ? '' : 's'} found. Apply the latest Circle migration, then refresh this screen.`,
      tone: visibleCount > 0 ? 'success' : 'info',
    });
    if (visibleCount > 0) {
      void refreshCircleMomentsPersisted();
    }
  }, [circleId, refreshCircleMomentsPersisted]);

  const getMemberManagementOptions = useCallback((item: MemberRow) => {
    if (item.profile_id === currentProfileId) {
      return { roles: [] as CircleManageRole[], canRemove: false };
    }

    const targetRole = normalizeCircleRole(item.role);
    const targetIsHostLevel = ['host', 'admin'].includes(targetRole);
    const roles: CircleManageRole[] = [];

    if (canManageRoles && (!targetIsHostLevel || canAssignHostRole)) {
      if (canAssignHostRole && targetRole !== 'host') roles.push('host');
      if (targetRole !== 'moderator') roles.push('moderator');
      if (targetRole !== 'matchmaker') roles.push('matchmaker');
      if (targetRole !== 'member') roles.push('member');
    }

    return {
      roles,
      canRemove: canRemoveMembers && (!targetIsHostLevel || canAssignHostRole),
    };
  }, [canAssignHostRole, canManageRoles, canRemoveMembers, currentProfileId]);

  const openMemberManager = useCallback((item: MemberRow) => {
    const options = getMemberManagementOptions(item);
    if (options.roles.length === 0 && !options.canRemove) return;
    setManageMemberTarget(item);
  }, [getMemberManagementOptions]);
  const manageTargetOptions = manageMemberTarget ? getMemberManagementOptions(manageMemberTarget) : { roles: [] as CircleManageRole[], canRemove: false };
  const manageTargetProfile = manageMemberTarget?.profiles ?? null;
  const getGatheringAttendance = useCallback((gatheringId: string) => gatheringAttendance[gatheringId] ?? null, [gatheringAttendance]);
  const getPromptResponses = useCallback((promptId: string) => promptResponsesByPromptId[promptId] ?? [], [promptResponsesByPromptId]);

  const renderMember = ({ item }: { item: MemberRow }) => {
    const member = item.profiles;
    if (!member) return null;
    const manageOptions = getMemberManagementOptions(item);
    const isSelf = item.profile_id === currentProfileId;
    const isNewMember = item.role === 'member' && isRecentCircleMember(item.joined_at);
    const presence = getAuthoritativePresenceDisplay(member.online, member.last_active, presenceNow);
    return (
      <View style={styles.memberCard}>
        <View style={styles.memberCardGlow} />
        <TouchableOpacity accessibilityLabel={`View ${member.full_name || 'member'} profile`} onPress={() => openProfile(member.id)}>
          {member.avatar_url ? (
            <Image source={{ uri: member.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <MaterialCommunityIcons name="account-circle" size={34} color={theme.textMuted} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.memberContent}>
          <View style={styles.memberHeaderRow}>
            <View style={styles.memberHeaderCopy}>
              <View style={styles.memberTitleRow}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.full_name ?? 'Member'}{member.age ? `, ${member.age}` : ''}
                </Text>
                {isNewMember ? (
                  <View style={styles.memberPillNewInline}>
                    <Text style={styles.memberPillNewText}>New</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.memberMeta}>{member.city || member.region || member.location || 'Location hidden'}</Text>
            </View>
          </View>
          <View style={styles.memberBadgeRow}>
            {presence.showPresence ? (
              <View
                style={[
                  styles.presenceBadge,
                  presence.online
                    ? styles.presenceBadgeOnline
                    : presence.activeNow
                      ? styles.presenceBadgeActive
                      : styles.presenceBadgeRecent,
                ]}
              >
                <View
                  style={[
                    styles.presenceDot,
                    presence.online
                      ? styles.presenceDotOnline
                      : presence.activeNow
                        ? styles.presenceDotActive
                        : styles.presenceDotRecent,
                  ]}
                />
                <Text style={styles.presenceText}>{getCompactPresenceLabel(presence)}</Text>
              </View>
            ) : null}
            {item.role !== 'member' ? (
              <View style={styles.memberPill}>
                <Text style={styles.memberPillText}>{item.role === 'leader' ? 'Host' : item.role}</Text>
              </View>
            ) : null}
            {isSelf ? (
              <View style={styles.memberPillMuted}>
                <Text style={styles.memberPillMutedText}>You</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.inlineActions}>
            <TouchableOpacity style={styles.ghostButton} onPress={() => openProfile(member.id)}>
              <Text style={styles.ghostText}>View</Text>
            </TouchableOpacity>
            {!isSelf ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => handleMemberConnection(item.profile_id, member.full_name)}>
                <Text style={styles.primaryText}>{getMemberConnectionLabel(item)}</Text>
              </TouchableOpacity>
            ) : null}
            {manageOptions.roles.length > 0 || manageOptions.canRemove ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => openMemberManager(item)}>
                <Text style={styles.secondaryText}>Roles</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderLeader = (item: MemberRow, expanded = false) => {
    const member = item.profiles;
    if (!member) return null;
    const isSelf = item.profile_id === currentProfileId;
    const manageOptions = getMemberManagementOptions(item);
    const presence = getAuthoritativePresenceDisplay(member.online, member.last_active, presenceNow);
    return (
      <View key={item.id} style={[styles.leadCard, expanded && styles.leadCardExpanded]}>
        <View style={styles.memberCardGlow} />
        <View style={styles.leadTopRow}>
          <View style={styles.leadIdentity}>
            <TouchableOpacity accessibilityLabel={`View ${member.full_name || 'leader'} profile`} onPress={() => openProfile(member.id)}>
              {member.avatar_url ? (
                <Image source={{ uri: member.avatar_url }} style={styles.leadAvatar} />
              ) : (
                <View style={styles.leadAvatarFallback}>
                  <MaterialCommunityIcons name="account-circle" size={28} color={theme.textMuted} />
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.leadCopy}>
              <View style={styles.memberTitleRow}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.full_name ?? 'Circle leader'}{member.age ? `, ${member.age}` : ''}
                </Text>
              </View>
              <Text style={styles.memberMeta}>{joinMeta([getLeaderRoleLabel(item.role), member.city || member.region || member.location])}</Text>
              {presence.showPresence ? (
                <View
                  style={[
                    styles.presenceBadge,
                    presence.online
                      ? styles.presenceBadgeOnline
                      : presence.activeNow
                        ? styles.presenceBadgeActive
                        : styles.presenceBadgeRecent,
                  ]}
                >
                  <View
                    style={[
                      styles.presenceDot,
                      presence.online
                        ? styles.presenceDotOnline
                        : presence.activeNow
                          ? styles.presenceDotActive
                          : styles.presenceDotRecent,
                    ]}
                  />
                  <Text style={styles.presenceText}>{getCompactPresenceLabel(presence)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={styles.featureMetaPill}>{getLeaderRoleLabel(item.role)}</Text>
        </View>
        <Text style={styles.leadBody}>
          {item.role === 'matchmaker'
            ? 'Helps surface warmer introductions when shared context is strong.'
            : item.role === 'moderator'
              ? 'Protects the tone, safety, and pace of this Circle.'
              : 'Sets the tone and trust level for who belongs here.'}
        </Text>
        <View style={styles.inlineActions}>
          <TouchableOpacity style={styles.ghostButton} onPress={() => openProfile(member.id)}>
            <Text style={styles.ghostText}>View</Text>
          </TouchableOpacity>
          {!isSelf ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => handleMemberConnection(item.profile_id, member.full_name)}>
              <Text style={styles.primaryText}>{getMemberConnectionLabel(item)}</Text>
            </TouchableOpacity>
          ) : null}
          {manageOptions.roles.length > 0 || manageOptions.canRemove ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openMemberManager(item)}>
              <Text style={styles.secondaryText}>Roles</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderMoment = (moment: CircleMoment) => {
    const profileRow = moment.profile;
    const isTextMoment = String(moment.type).toLowerCase() === 'text';
    return (
      <TouchableOpacity key={moment.id} activeOpacity={0.9} style={styles.momentCard} onPress={() => openMomentThread(moment)}>
        <View style={styles.momentCardGlow} />
        {isTextMoment ? (
          <LinearGradient colors={['rgba(19,168,168,0.18)', 'rgba(7,30,34,0.96)']} style={styles.momentTextPanel}>
            <Text style={styles.momentTextPreview} numberOfLines={4}>{getMomentPreview(moment)}</Text>
          </LinearGradient>
        ) : momentSignedUrls[moment.id] || moment.thumbnail_url || moment.media_url ? (
          <Image source={{ uri: momentSignedUrls[moment.id] || moment.thumbnail_url || moment.media_url || undefined }} style={styles.momentPreview} />
        ) : (
          <LinearGradient colors={['rgba(139,92,255,0.16)', 'rgba(7,30,34,0.96)']} style={styles.momentFallback}>
            <MaterialCommunityIcons name={moment.type === 'video' ? 'play-circle-outline' : 'image-outline'} size={28} color="#F4E8D0" />
          </LinearGradient>
        )}
        <View style={styles.momentCopy}>
          <View style={styles.momentHeaderRow}>
            <View style={styles.momentKindPill}>
              <Text style={styles.kicker}>{getMomentKindLabel(moment.type)}</Text>
            </View>
            <View style={styles.momentTimePill}>
              <MaterialCommunityIcons name="clock-time-four-outline" size={13} color={theme.textMuted} />
              <Text style={styles.momentTimeText}>{formatMomentTimestamp(moment.created_at)}</Text>
            </View>
          </View>
          <Text style={styles.momentTitle} numberOfLines={1}>{profileRow?.full_name ?? 'Circle member'}</Text>
          <Text style={styles.momentMeta} numberOfLines={1}>
            {joinMeta([profileRow?.city || profileRow?.region || profileRow?.location, moment.visibility])}
          </Text>
          <Text style={styles.featureBody} numberOfLines={3}>{getMomentPreview(moment)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPromptResponse = (response: CirclePromptResponse) => {
    const responder = response.profiles;
    const isSelf = response.profile_id === currentProfileId;
    return (
      <View key={response.id} style={styles.responseCard}>
        <View style={styles.responseTopRow}>
          <View style={styles.leadIdentity}>
            {responder?.avatar_url ? (
              <Image source={{ uri: responder.avatar_url }} style={styles.leadAvatar} />
            ) : (
              <View style={styles.leadAvatarFallback}>
                <MaterialCommunityIcons name="account-circle" size={28} color={theme.textMuted} />
              </View>
            )}
            <View style={styles.leadCopy}>
              <Text style={styles.memberName}>
                {responder?.full_name ?? 'Circle member'}{responder?.age ? `, ${responder.age}` : ''}
              </Text>
              <Text style={styles.memberMeta}>{joinMeta([compactDate(response.created_at), responder?.city || responder?.region || responder?.location])}</Text>
            </View>
          </View>
          {isSelf ? (
            <View style={styles.memberPillMuted}>
              <Text style={styles.memberPillMutedText}>You</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.infoText}>{response.response}</Text>
        <View style={styles.inlineActions}>
          {!isSelf ? (
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() => openReportSheet({ type: 'prompt_response', id: response.id, title: responder?.full_name ?? 'this response' })}
            >
              <Text style={styles.ghostText}>Report response</Text>
            </TouchableOpacity>
          ) : null}
          {canModerateCircle ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              disabled={removingPromptResponseId === response.id}
              onPress={() => handleRemovePromptResponse(response.id)}
            >
              <Text style={styles.secondaryText}>{removingPromptResponseId === response.id ? 'Removing' : 'Remove response'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderModerationReport = (report: CircleReport) => {
    const targetLabel = report.prompt_response_id
      ? 'Prompt response'
      : report.gathering_id
        ? report.gathering_title || 'Gathering'
        : 'Circle';
    return (
      <View key={report.id} style={styles.pendingCard}>
        <View style={styles.featureCardTop}>
          <Text style={styles.memberName}>{report.reason}</Text>
          <Text style={styles.featureMetaPill}>{getCircleReportStatusLabel(report.status)}</Text>
        </View>
        <Text style={styles.memberMeta}>{joinMeta([targetLabel, compactDate(report.created_at)])}</Text>
        {report.details ? <Text style={styles.infoText}>{report.details}</Text> : null}
        {report.prompt_response_id && report.prompt_response_text ? (
          <Text style={styles.emptySupport}>Reported response: {report.prompt_response_text}</Text>
        ) : null}
        <View style={styles.inlineActions}>
          {report.status === 'pending' ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              disabled={reviewingReportId === report.id}
              onPress={() => void handleReviewCircleReport(report.id, 'reviewing')}
            >
              <Text style={styles.secondaryText}>{reviewingReportId === report.id ? 'Updating' : 'Mark reviewing'}</Text>
            </TouchableOpacity>
          ) : null}
          {report.status !== 'resolved' ? (
            <TouchableOpacity
              style={styles.primaryButton}
              disabled={reviewingReportId === report.id}
              onPress={() => void handleReviewCircleReport(report.id, 'resolved')}
            >
              <Text style={styles.primaryText}>{reviewingReportId === report.id ? 'Updating' : 'Resolve'}</Text>
            </TouchableOpacity>
          ) : null}
          {report.status !== 'dismissed' ? (
            <TouchableOpacity
              style={styles.ghostButton}
              disabled={reviewingReportId === report.id}
              onPress={() => void handleReviewCircleReport(report.id, 'dismissed')}
            >
              <Text style={styles.ghostText}>Dismiss</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace({ pathname: '/(tabs)/circles' })}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <Pressable style={styles.circleAvatar} onPress={canEditCircle ? handlePickImage : undefined}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.circleAvatarImage} />
            ) : (
              <MaterialCommunityIcons name="account-group" size={24} color={theme.textMuted} />
            )}
            {canEditCircle ? (
              <View style={styles.circleAvatarBadge}>
                <MaterialCommunityIcons name={imageUploading ? 'loading' : 'pencil'} size={12} color={theme.text} />
              </View>
            ) : null}
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle} numberOfLines={1}>{circle?.name ?? 'Circle'}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {joinMeta([
                circle?.is_official ? 'Official Circle' : circle?.is_partner ? 'Partner Circle' : circle?.circle_type === 'private' ? 'Private Circle' : 'Community Circle',
                getCircleScopeLabel(circle),
              ])}
            </Text>
          </View>
          <TouchableOpacity accessibilityLabel="Circle options" style={styles.headerUtility} onPress={openCircleOptions}>
            <MaterialCommunityIcons name="dots-horizontal" size={19} color={theme.text} />
          </TouchableOpacity>
        </View>

        {detailNotice ? (
          <Notice
            title={detailNotice.title}
            message={detailNotice.message}
            actionLabel={networkReady ? 'Retry' : undefined}
            onAction={networkReady ? handleRetryCircleDetail : undefined}
            icon={detailNotice.icon}
          />
        ) : null}

        <CirclePulseBoard
          items={pulseItems}
          discussionUnreadByItemId={pulseDiscussionUnreadByItemId}
          gatheringPosterMembersByUrl={gatheringPosterMembersByUrl}
          loading={pulseLoading}
          error={pulseError}
          isMember={isMember}
          canManage={canModerateCircle}
          joinLabel={joinLabel}
          onJoin={handleJoin}
          onAddToPulse={() => setPulseManagerOpen(true)}
          onAnswerPrompt={openPulsePrompt}
          onOpenGathering={openPulseGathering}
          onOpenMedia={openPulseMedia}
          onOpenComments={(target) => {
            setPulseCommentFocusId(null);
            setPulseCommentParentFocusId(null);
            setPulseCommentTarget(target);
          }}
          viewerProfileId={currentProfileId}
          onOpenFeaturedProfile={openProfile}
          onSendSignal={handleMemberConnection}
          onEndLoveSeat={handleEndLoveSeat}
        />

        <View style={styles.trustSection}>
          <View style={styles.badgeRow}>
            <Text style={styles.trustBadge}>
              {circle?.is_official ? 'Official Circle' : circle?.is_partner ? 'Partner Circle' : 'Community Circle'}
            </Text>
            <Text style={styles.trustBadge}>{getCircleScopeLabel(circle)}</Text>
            <Text style={styles.trustBadge}>{circle?.member_count ?? members.length} inside</Text>
          </View>
          <View style={styles.trustHeader}>
            <View style={styles.trustCopy}>
              <Text style={styles.heroTitle}>{mastheadTitle}</Text>
              <Text style={styles.heroSubcopy}>{mastheadBody}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, styles.statCardHalf]}>
              <View style={[styles.statIcon, styles.statIconMembers]}><MaterialCommunityIcons name="account-group-outline" size={18} color={theme.tint} /></View>
              <View style={styles.statCopy}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>{memberCount}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{pluralize(memberCount, 'Member')}</Text>
              </View>
            </View>
            <View style={[styles.statCard, styles.statCardHalf]}>
              <View style={[styles.statIcon, styles.statIconPrompts]}><MaterialCommunityIcons name="message-text-outline" size={18} color={theme.accent} /></View>
              <View style={styles.statCopy}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>{prompts.length}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{pluralize(prompts.length, 'Prompt')}</Text>
              </View>
            </View>
            <View style={[styles.statCard, styles.statCardHalf]}>
              <View style={[styles.statIcon, styles.statIconGatherings]}><MaterialCommunityIcons name="calendar-check-outline" size={18} color={theme.secondary} /></View>
              <View style={styles.statCopy}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>{gatherings.length}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{pluralize(gatherings.length, 'Gathering')}</Text>
              </View>
            </View>
          </View>
          <View style={styles.trustActionRow}>
            {isMember ? (
              <TouchableOpacity accessibilityLabel="Invite to Circle" style={styles.inviteButton} onPress={handleInvite}>
                <MaterialCommunityIcons name="account-plus-outline" size={16} color={theme.tint} />
                <Text style={styles.inviteText}>Invite</Text>
              </TouchableOpacity>
            ) : null}
            {canEditCircle ? (
              <TouchableOpacity style={styles.coverButton} onPress={handlePickImage}>
                <MaterialCommunityIcons name={imageUploading ? 'cloud-upload-outline' : 'image-edit-outline'} size={16} color={theme.text} />
                <Text style={styles.coverButtonText}>{imageUploading ? 'Uploading cover' : 'Update cover'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {canEditCircle && editingName ? (
          <View style={styles.editNameCard}>
            <Text style={styles.inputLabel}>Circle name</Text>
            <TextInput value={nameValue} onChangeText={setNameValue} placeholder="Circle name" placeholderTextColor={theme.textMuted} style={styles.inlineInput} />
            <View style={styles.inlineActions}>
              <TouchableOpacity style={styles.ghostButton} onPress={() => setEditingName(false)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleSaveName}>
                <Text style={styles.secondaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {[
            ['overview', 'Overview'],
            ['members', 'Members'],
            ['prompts', 'Prompts'],
            ['gatherings', 'Gatherings'],
            ['moments', 'Moments'],
          ].map(([key, label]) => {
            const active = activeTab === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Open ${label} tab`}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(key as DetailTab)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeTab === 'overview' ? (
          <View style={styles.section}>
            {canReviewMembers && pendingMembers.length > 0 ? (
              <View style={styles.infoCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.sectionTitle}>Pending requests</Text>
                  <Text style={styles.featureMetaPill}>{pendingMembers.length} waiting</Text>
                </View>
                <View style={styles.requestStack}>
                  {pendingMembers.map((row) => (
                    <View key={row.id} style={styles.pendingCard}>
                      <Text style={styles.memberName}>{row.profiles?.full_name ?? 'Member'}</Text>
                      <View style={styles.inlineActions}>
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => handleApprove(row.profile_id)}>
                          <Text style={styles.secondaryText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ghostButton} onPress={() => handleRemove(row.profile_id)}>
                          <Text style={styles.ghostText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {canRequestLeadershipRole || myRoleRequests.length > 0 ? (
              <View style={styles.infoCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.sectionTitle}>Help shape this Circle</Text>
                  <Text style={styles.featureMetaPill}>{myPendingRoleRequests.length > 0 ? 'Request pending' : canRequestLeadershipRole ? 'Step forward' : 'Stewardship'}</Text>
                </View>
                {canRequestLeadershipRole ? (
                  <>
                    <Text style={styles.infoText}>Step forward when you are ready to help protect the tone, safety, and consistency of this Circle. Hosts review every request.</Text>
                    <View style={styles.inlineActions}>
                      {requestableRoleTypes.map((role) => (
                        <TouchableOpacity
                          key={role}
                          style={styles.secondaryButton}
                          disabled={myPendingRoleTypes.has(role)}
                          onPress={() => openRoleRequest(role)}
                        >
                          <Text style={styles.secondaryText}>{myPendingRoleTypes.has(role) ? `${getLeaderRoleLabel(role)} pending` : `Request ${role}`}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : null}
                {myRoleRequests.length > 0 ? (
                  <View style={styles.requestStack}>
                    {myRoleRequests.slice(0, 3).map((request) => (
                      <View key={request.id} style={styles.pendingCard}>
                        <Text style={styles.memberName}>{getLeaderRoleLabel(request.requested_role)} request</Text>
                        <Text style={styles.memberMeta}>{getRoleRequestStatusLabel(request.status)} · {compactDate(request.created_at)}</Text>
                        {request.note ? <Text style={styles.memberMeta}>{request.note}</Text> : null}
                        {request.rejection_reason ? <Text style={styles.emptySupport}>Why it was declined: {request.rejection_reason}</Text> : null}
                        {request.status === 'pending' ? (
                          <View style={styles.inlineActions}>
                            <TouchableOpacity
                              style={styles.ghostButton}
                              disabled={cancellingRoleRequestId === request.id}
                              onPress={() => void handleCancelRoleRequest(request.id)}
                            >
                              <Text style={styles.ghostText}>{cancellingRoleRequestId === request.id ? 'Withdrawing' : 'Withdraw request'}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {canReviewRoleRequests && pendingRoleRequests.length > 0 ? (
              <View style={styles.infoCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.sectionTitle}>Role requests</Text>
                  <Text style={styles.featureMetaPill}>{pendingRoleRequests.length} pending</Text>
                </View>
                <View style={styles.requestStack}>
                  {pendingRoleRequests.slice(0, 3).map((request) => (
                    <View key={request.id} style={styles.pendingCard}>
                      <Text style={styles.memberName}>
                        {request.requester?.full_name ?? 'Member'} wants to be {getLeaderRoleLabel(request.requested_role)}
                      </Text>
                      {request.note ? <Text style={styles.memberMeta}>{request.note}</Text> : null}
                      <View style={styles.inlineActions}>
                        <TouchableOpacity
                          style={styles.secondaryButton}
                          disabled={reviewingRoleRequestId === request.id}
                          onPress={() => void handleReviewRoleRequest(request.id, 'approve')}
                        >
                          <Text style={styles.secondaryText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.ghostButton}
                          disabled={reviewingRoleRequestId === request.id}
                          onPress={() => openRejectRoleRequest(request)}
                        >
                          <Text style={styles.ghostText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {leadershipMembers.length > 0 ? (
              <View style={styles.infoCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.sectionTitle}>Hosts and moderators</Text>
                  <Text style={styles.featureMetaPill}>{leadershipMembers.length} leading</Text>
                </View>
                <Text style={styles.infoText}>The first people who lead a Circle usually define the quality of every introduction and Gathering that follows.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leadRail}>
                  {leadershipMembers.slice(0, 4).map((item) => renderLeader(item))}
                </ScrollView>
              </View>
            ) : null}
            {canModerateCircle && moderationReports.length > 0 ? (
              <View style={styles.infoCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.sectionTitle}>Moderation queue</Text>
                  <Text style={styles.featureMetaPill}>
                    {pendingModerationReports.length > 0 ? `${pendingModerationReports.length} active` : 'All reviewed'}
                  </Text>
                </View>
                <Text style={styles.infoText}>Reports stay private. Leaders can review unsafe behaviour without exposing who raised it inside the Circle.</Text>
                <View style={styles.requestStack}>
                  {moderationReports.slice(0, 3).map(renderModerationReport)}
                </View>
              </View>
            ) : null}
            {recentMoments.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.sectionTitle}>Moments from this Circle</Text>
                  <Text style={styles.featureMetaPill}>{moments.length} active</Text>
                </View>
                <Text style={styles.sectionLead}>A quick pulse of who is active and what they are sharing right now.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.momentRail}>
                  {recentMoments.map(renderMoment)}
                </ScrollView>
              </View>
            ) : null}
            <View style={styles.infoCard}>
              <View style={styles.featureCardTop}>
                <Text style={styles.sectionTitle}>Rules and safety</Text>
                <TouchableOpacity style={styles.ghostButton} onPress={() => circle && openReportSheet({ type: 'circle', id: circle.id, title: circle.name ?? 'Circle' })}>
                  <Text style={styles.ghostText}>Report</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.infoText}>{circle?.rules || 'Hosts keep this Circle respectful, intentional, and safe for warm connection.'}</Text>
              {circle?.safety_note ? <Text style={styles.infoText}>{circle.safety_note}</Text> : null}
            </View>
          </View>
        ) : null}

        {activeTab === 'members' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLead}>People shaping the tone, trust, and introductions inside this Circle.</Text>
            {!isMember ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="account-lock-outline" size={24} color={theme.tint} />
                </View>
                <Text style={styles.emptyTitle}>Join this Circle to see members</Text>
                <Text style={styles.emptyHint}>Member profiles, leadership roles, and introductions only open after you join.</Text>
                <Text style={styles.emptySupport}>Once your membership is active, you will be able to see who is hosting, matching, and already inside.</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => void handleJoin()}>
                  <Text style={styles.primaryText}>{joinLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.memberContextRow}>
                  <TouchableOpacity
                    style={styles.memberContextCard}
                    disabled={!primaryHost?.profiles?.id}
                    onPress={() => openProfile(primaryHost?.profiles?.id)}
                  >
                    <View style={styles.memberContextIcon}>
                      <MaterialCommunityIcons name="shield-account-outline" size={20} color={theme.tint} />
                    </View>
                    <View style={styles.memberContextCopy}>
                      <Text style={styles.memberContextKicker}>Circle host</Text>
                      <Text style={styles.memberContextTitle} numberOfLines={1}>{primaryHost?.profiles?.full_name || 'Leadership team'}</Text>
                      <Text style={styles.memberContextMeta}>Tone, trust, and member care</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.memberContextCard} onPress={() => setActiveTab('overview')}>
                    <View style={styles.memberContextIcon}>
                      <MaterialCommunityIcons name="message-processing-outline" size={20} color={theme.tint} />
                    </View>
                    <View style={styles.memberContextCopy}>
                      <Text style={styles.memberContextKicker}>Live discussion</Text>
                      <Text style={styles.memberContextTitle}>{pulseCommentCount ? `${pulseCommentCount} Pulse comments` : 'Ready when you are'}</Text>
                      <Text style={styles.memberContextMeta}>Reply, react, and see who is typing</Text>
                    </View>
                  </TouchableOpacity>
                </View>
                {canManageRoles ? (
                  <Text style={styles.emptySupport}>Tap `Roles` on any member to promote them to matchmaker, moderator, or host.</Text>
                ) : null}
                <View style={styles.roleSummaryRow}>
                  <View style={styles.roleSummaryPill}>
                    <Text style={styles.roleSummaryText}>{leadershipMembers.length} leads</Text>
                  </View>
                  <View style={styles.roleSummaryPill}>
                    <Text style={styles.roleSummaryText}>{matchmakerCount} matchmakers</Text>
                  </View>
                  {pendingCount > 0 ? (
                    <View style={styles.roleSummaryPillAccent}>
                      <Text style={styles.roleSummaryTextAccent}>{pendingCount} pending</Text>
                    </View>
                  ) : null}
                </View>
                {leadershipMembers.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Leadership</Text>
                    <Text style={styles.sectionLead}>Hosts, moderators, and matchmakers who shape the quality of this space.</Text>
                    <View style={styles.leadStack}>
                      {leadershipMembers.map((item) => renderLeader(item, true))}
                    </View>
                  </View>
                ) : null}
                {loading && members.length === 0 ? <Text style={styles.emptyText}>Loading members...</Text> : null}
                {members.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIcon}>
                      <MaterialCommunityIcons name="account-group-outline" size={24} color={theme.tint} />
                    </View>
                    <Text style={styles.emptyTitle}>This Circle is still taking shape</Text>
                    <Text style={styles.emptyHint}>The first few members usually define the quality of every introduction after that.</Text>
                    <Text style={styles.emptySupport}>Join momentum starts with trusted people, not volume.</Text>
                  </View>
                ) : communityMembers.length > 0 ? (
                  <FlatList data={communityMembers} keyExtractor={(item) => item.id} renderItem={renderMember} scrollEnabled={false} contentContainerStyle={styles.memberList} />
                ) : leadershipMembers.length > 0 ? (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIcon}>
                      <MaterialCommunityIcons name="account-star-outline" size={24} color={theme.tint} />
                    </View>
                    <Text style={styles.emptyTitle}>Leadership is set</Text>
                    <Text style={styles.emptyHint}>The broader member layer has not opened up yet. This Circle is still being curated carefully.</Text>
                  </View>
                ) : (
                  <FlatList data={members} keyExtractor={(item) => item.id} renderItem={renderMember} scrollEnabled={false} contentContainerStyle={styles.memberList} />
                )}
              </>
            )}
          </View>
        ) : null}

        {activeTab === 'prompts' ? (
          <View style={styles.section}>
            <View style={styles.featureCardTop}>
              <Text style={styles.sectionLead}>Questions that help members reveal values, intent, and emotional clarity.</Text>
              {canPublishCirclePrompt ? (
                <TouchableOpacity style={styles.secondaryButton} onPress={() => void openPromptComposer()}>
                  <Text style={styles.secondaryText}>New prompt</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {canModerateCircle && moderationReports.length > 0 ? (
              <View style={styles.infoCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.sectionTitle}>Moderation queue</Text>
                  <Text style={styles.featureMetaPill}>
                    {pendingModerationReports.length > 0 ? `${pendingModerationReports.length} active` : 'All reviewed'}
                  </Text>
                </View>
                <Text style={styles.infoText}>Prompt-response reports and other Circle safety flags appear here for host review.</Text>
                <View style={styles.requestStack}>
                  {moderationReports.map(renderModerationReport)}
                </View>
              </View>
            ) : null}
            {prompts.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="message-text-outline" size={24} color={theme.tint} />
                </View>
                <Text style={styles.emptyTitle}>No live prompts right now</Text>
                <Text style={styles.emptyHint}>Hosts can publish thoughtful prompts here when the Circle needs a spark.</Text>
                {canPublishCirclePrompt ? (
                  <View style={styles.inlineActions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => void openPromptComposer()}>
                      <Text style={styles.primaryText}>Create prompt</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}
            {prompts.map((prompt) => (
              <LinearGradient key={prompt.id} colors={['rgba(19,168,168,0.14)', 'rgba(7,30,34,0.94)']} style={styles.featureCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.kicker}>{prompt.prompt_type ?? 'Prompt'}</Text>
                  <Text style={styles.featureMetaPill}>
                    {getPromptResponses(prompt.id).length > 0 ? `${getPromptResponses(prompt.id).length} answers` : 'Open reflection'}
                  </Text>
                </View>
                <Text style={styles.featureTitle}>{prompt.title}</Text>
                <Text style={styles.featureBody}>{prompt.prompt}</Text>
                {canPublishCirclePrompt ? (
                  <View style={styles.manageRow}>
                    <TouchableOpacity style={styles.manageButton} onPress={() => openPromptComposer(prompt)}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.text} />
                      <Text style={styles.manageButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.manageButton}
                      disabled={deletingContentKey === `prompt:${prompt.id}`}
                      onPress={() => handleDeletePrompt(prompt)}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.danger} />
                      <Text style={styles.manageDangerText}>{deletingContentKey === `prompt:${prompt.id}` ? 'Deleting' : 'Delete'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <View style={styles.featureActionRow}>
                  <Text style={styles.featureHint}>Better answers improve shared context for picks and intros.</Text>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => openPromptAnswer(prompt)}>
                    <Text style={styles.primaryText}>Answer</Text>
                  </TouchableOpacity>
                </View>
                {getPromptResponses(prompt.id).length > 0 ? (
                  <View style={styles.responseStack}>
                    {getPromptResponses(prompt.id).slice(0, 4).map(renderPromptResponse)}
                  </View>
                ) : (
                  <View style={styles.pendingCard}>
                    <Text style={styles.memberName}>No responses shared yet</Text>
                    <Text style={styles.memberMeta}>The first thoughtful answer usually sets the tone for the rest of the Circle.</Text>
                  </View>
                )}
              </LinearGradient>
            ))}
          </View>
        ) : null}

        {activeTab === 'gatherings' ? (
          <View style={styles.section}>
            <View style={styles.featureCardTop}>
              <Text style={styles.sectionLead}>Curated ways to meet beyond chat, with stronger trust and better context.</Text>
              {canHostGathering ? (
                <TouchableOpacity style={styles.secondaryButton} onPress={() => void openGatheringComposer()}>
                  <Text style={styles.secondaryText}>New Gathering</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {gatherings.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="calendar-heart" size={24} color={theme.tint} />
                </View>
                <Text style={styles.emptyTitle}>No approved Gatherings yet</Text>
                <Text style={styles.emptyHint}>When hosts schedule trusted events, they will appear here with safety context and RSVP actions.</Text>
                {canHostGathering ? (
                  <View style={styles.inlineActions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => void openGatheringComposer()}>
                      <Text style={styles.primaryText}>Host Gathering</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}
            {gatherings.map((gathering) => {
              const posterMember = getGatheringPresentationMember(gathering);
              return (
                <LinearGradient key={gathering.id} colors={['rgba(139,92,255,0.14)', 'rgba(7,30,34,0.94)']} style={styles.featureCard}>
                  {posterMember ? (
                    <LinearGradient colors={['rgba(19,168,168,0.26)', 'rgba(7,30,34,0.96)']} style={styles.gatheringMemberPosterShell}>
                      <View style={styles.memberPosterPreviewTop}>
                        <Text style={styles.memberPosterPreviewKicker}>Host-led invitation</Text>
                        <Text style={styles.memberPosterPreviewPill}>{getGatheringSeatContextLabel(posterMember.seatContext)}</Text>
                      </View>
                      <View style={styles.memberPosterPreviewBody}>
                        <Image source={{ uri: posterMember.avatarUrl }} style={styles.memberPosterPreviewAvatar} />
                        <View style={styles.memberPosterPreviewCopy}>
                          <Text style={styles.memberPosterPreviewName} numberOfLines={1}>{posterMember.fullName}</Text>
                          <Text style={styles.memberPosterPreviewMeta} numberOfLines={2}>
                            {joinMeta([gathering.title, compactDate(gathering.starts_at)])}
                          </Text>
                          <Text style={styles.memberPosterPreviewSupport} numberOfLines={2}>{getGatheringSeatContextCopy(posterMember.seatContext, posterMember.fullName)}</Text>
                        </View>
                      </View>
                    </LinearGradient>
                ) : gathering.poster_url ? (
                  <View style={styles.gatheringPosterShell}>
                    <Image source={{ uri: getGatheringPosterDisplayUri(gathering.poster_url) || gathering.poster_url }} style={styles.gatheringPosterImage} />
                      <LinearGradient colors={['rgba(7,30,34,0.08)', 'rgba(7,30,34,0.78)']} style={styles.gatheringPosterOverlay} />
                      <View style={styles.gatheringPosterBadge}>
                        <MaterialCommunityIcons name="image-filter-hdr" size={14} color="#F4E8D0" />
                        <Text style={styles.gatheringPosterBadgeText}>Event poster</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.featureCardTop}>
                    <Text style={styles.kicker}>{gathering.gathering_type ?? 'Gathering'}</Text>
                    <Text style={styles.featureMetaPill}>{gathering.attendee_count === 1 ? '1 attending' : `${gathering.attendee_count ?? 0} attending`}</Text>
                  </View>
                  <Text style={styles.featureTitle}>{gathering.title}</Text>
                  <Text style={styles.featureBody}>{joinMeta([compactDate(gathering.starts_at), gathering.city, gathering.venue_name])}</Text>
                  <View style={styles.badgeRow}>
                    <Text style={styles.trustBadge}>{getGatheringPrivacyLabel(gathering)}</Text>
                    {gathering.is_partner_venue ? <Text style={styles.trustBadge}>Partner venue</Text> : null}
                    {gathering.safe_first_date_space ? <Text style={styles.trustBadge}>Safe first-date space</Text> : null}
                    {getGatheringAttendance(gathering.id)?.status ? (
                      <Text style={styles.trustBadge}>Your RSVP: {getAttendanceStatusLabel(getGatheringAttendance(gathering.id)?.status)}</Text>
                    ) : null}
                  </View>
                  {canHostGathering ? (
                    <View style={styles.manageRow}>
                      <TouchableOpacity style={styles.manageButton} onPress={() => openGatheringComposer(gathering)}>
                        <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.text} />
                        <Text style={styles.manageButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.manageButton}
                        disabled={deletingContentKey === `gathering:${gathering.id}`}
                        onPress={() => handleDeleteGathering(gathering)}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.danger} />
                        <Text style={styles.manageDangerText}>{deletingContentKey === `gathering:${gathering.id}` ? 'Deleting' : 'Delete'}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View style={styles.featureActionRow}>
                    <Text style={styles.featureHint}>Attend with clearer expectations and safer discovery.</Text>
                    <View style={styles.inlineActions}>
                      <TouchableOpacity style={styles.primaryButton} onPress={() => openGatheringRsvp(gathering)}>
                        <Text style={styles.primaryText}>{getGatheringAttendance(gathering.id) ? 'Manage RSVP' : 'RSVP'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.ghostButton} onPress={() => openReportSheet({ type: 'gathering', id: gathering.id, title: gathering.title })}>
                        <Text style={styles.ghostText}>Report</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              );
            })}
          </View>
        ) : null}

        {activeTab === 'moments' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLead}>A living layer of what people in this Circle are sharing right now.</Text>
            {moments.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="image-multiple-outline" size={24} color={theme.tint} />
                </View>
                <Text style={styles.emptyTitle}>{momentLoadError ? 'Moments could not load' : 'No active Moments yet'}</Text>
                <Text style={styles.emptyHint}>
                  {momentLoadError
                    ? 'Refresh the feed after the latest Circle migration is applied.'
                    : 'When members share fresh Moments, this Circle starts to feel alive instead of static.'}
                </Text>
                <View style={styles.inlineActions}>
                  <TouchableOpacity style={styles.primaryButton} onPress={openCircleMomentCreate}>
                    <Text style={styles.primaryText}>Add Moment</Text>
                  </TouchableOpacity>
                  {momentLoadError ? (
                    <TouchableOpacity style={styles.ghostButton} onPress={() => void refreshCircleMomentsPersisted()}>
                      <Text style={styles.ghostText}>Refresh</Text>
                    </TouchableOpacity>
                  ) : null}
                  {canModerateCircle ? (
                    <TouchableOpacity style={styles.ghostButton} onPress={() => void handleCheckMomentFeed()}>
                      <Text style={styles.ghostText}>Check feed</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.momentList}>
                {moments.map(renderMoment)}
              </View>
            )}
          </View>
        ) : null}

      </ScrollView>

      <Modal visible={circleOptionsOpen} transparent animationType="fade" onRequestClose={() => setCircleOptionsOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCircleOptionsOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Circle options</Text>
            <Text style={styles.modalBody}>Manage this Circle with the controls available to your role.</Text>
            <View style={styles.optionStack}>
              {canEditCircle ? (
                <>
                  <TouchableOpacity
                    style={styles.optionAction}
                    onPress={() => {
                      setCircleOptionsOpen(false);
                      setEditingName(true);
                    }}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.tint} />
                    <Text style={styles.optionActionText}>Edit Circle name</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.optionAction}
                    disabled={imageUploading}
                    onPress={() => {
                      setCircleOptionsOpen(false);
                      void handlePickImage();
                    }}
                  >
                    <MaterialCommunityIcons name="image-edit-outline" size={18} color={theme.tint} />
                    <Text style={styles.optionActionText}>{imageUploading ? 'Uploading cover' : 'Update cover'}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {canSetHostNote ? (
                <TouchableOpacity style={styles.optionAction} onPress={openHostNoteComposer}>
                  <MaterialCommunityIcons name="note-edit-outline" size={18} color={theme.tint} />
                  <Text style={styles.optionActionText}>{circle?.host_note ? 'Update host note' : 'Add host note'}</Text>
                </TouchableOpacity>
              ) : null}
              {isOwner && circle?.status === 'approved' && !circle.archived_at ? (
                <TouchableOpacity
                  style={[styles.optionAction, styles.optionDangerAction]}
                  onPress={() => {
                    setCircleOptionsOpen(false);
                    handleArchiveCircle();
                  }}
                >
                  <MaterialCommunityIcons name="archive-outline" size={18} color={theme.danger} />
                  <Text style={styles.optionDangerText}>Archive Circle</Text>
                </TouchableOpacity>
              ) : null}
              {isOwner && (circle?.status !== 'approved' || !!circle?.archived_at) ? (
                <TouchableOpacity
                  style={[styles.optionAction, styles.optionDangerAction]}
                  onPress={() => {
                    setCircleOptionsOpen(false);
                    handleDeleteCircle();
                  }}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.danger} />
                  <Text style={styles.optionDangerText}>Delete Circle permanently</Text>
                </TouchableOpacity>
              ) : null}
              {canLeaveCircle ? (
                <TouchableOpacity
                  style={[styles.optionAction, styles.optionDangerAction]}
                  onPress={() => {
                    setCircleOptionsOpen(false);
                    handleLeave();
                  }}
                >
                  <MaterialCommunityIcons name="exit-to-app" size={18} color={theme.danger} />
                  <Text style={styles.optionDangerText}>Leave Circle</Text>
                </TouchableOpacity>
              ) : null}
              {isMember && !isOwner && ['host', 'admin'].includes(membershipRole) ? (
                <Text style={styles.optionSupport}>Reassign your stewardship role before leaving this Circle.</Text>
              ) : null}
              {circle?.id ? (
                <TouchableOpacity
                  style={styles.optionAction}
                  onPress={() => {
                    setCircleOptionsOpen(false);
                    openReportSheet({ type: 'circle', id: circle.id, title: circle.name ?? 'Circle' });
                  }}
                >
                  <MaterialCommunityIcons name="flag-outline" size={18} color={theme.tint} />
                  <Text style={styles.optionActionText}>Report Circle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setCircleOptionsOpen(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={promptAnswerOpen} transparent animationType="fade" onRequestClose={() => setPromptAnswerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPromptAnswerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Circle Prompt</Text>
            <Text style={styles.modalBody}>{promptTarget?.prompt}</Text>
            <TextInput
              value={promptAnswer}
              onChangeText={setPromptAnswer}
              placeholder="Share a thoughtful answer"
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={500}
              style={[styles.inlineInput, styles.textArea]}
            />
            <View style={styles.inlineActions}>
              <TouchableOpacity style={styles.ghostButton} onPress={() => setPromptAnswerOpen(false)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSubmitPromptAnswer}>
                <Text style={styles.primaryText}>Share answer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!manageMemberTarget} transparent animationType="fade" onRequestClose={() => setManageMemberTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setManageMemberTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Manage member</Text>
            <Text style={styles.modalBody}>
              Adjust trusted access for {manageTargetProfile?.full_name ?? 'this member'} without leaving the Circle detail screen.
            </Text>
            <View style={styles.manageMemberCard}>
              <Text style={styles.memberName}>
                {manageTargetProfile?.full_name ?? 'Member'}{manageTargetProfile?.age ? `, ${manageTargetProfile.age}` : ''}
              </Text>
              <Text style={styles.memberMeta}>
                {joinMeta([getLeaderRoleLabel(manageMemberTarget?.role), manageTargetProfile?.city || manageTargetProfile?.region || manageTargetProfile?.location])}
              </Text>
            </View>
            {manageTargetOptions.roles.length > 0 ? (
              <View style={styles.manageRoleStack}>
                {manageTargetOptions.roles.map((role) => (
                  <TouchableOpacity key={role} style={styles.manageRoleButton} onPress={() => manageMemberTarget && handleSetRole(manageMemberTarget.profile_id, role)}>
                    <Text style={styles.manageRoleButtonText}>Make {getLeaderRoleLabel(role)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={styles.inlineActions}>
              {manageTargetOptions.canRemove && manageMemberTarget ? (
                <TouchableOpacity style={styles.ghostButton} onPress={() => handleRemove(manageMemberTarget.profile_id)}>
                  <Text style={styles.ghostText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setManageMemberTarget(null)}>
                <Text style={styles.secondaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={hostNoteOpen} transparent animationType="fade" onRequestClose={() => setHostNoteOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setHostNoteOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <Text style={styles.modalTitle}>Host note</Text>
              <Text style={styles.modalBody}>Set a short note that tells members what kind of energy, values, and intent this Circle expects.</Text>
              <TextInput
                value={hostNoteValue}
                onChangeText={setHostNoteValue}
                placeholder="What should members know about this Circle?"
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={320}
                style={[styles.inlineInput, styles.textArea]}
              />
              <View style={styles.inlineActions}>
                <TouchableOpacity style={styles.ghostButton} onPress={() => setHostNoteOpen(false)}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} disabled={savingHostNote} onPress={handleSaveHostNote}>
                  <Text style={styles.primaryText}>{savingHostNote ? 'Saving' : 'Save note'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={!!gatheringRsvpTarget} transparent animationType="fade" onRequestClose={closeGatheringRsvp}>
        <Pressable style={styles.modalBackdrop} onPress={closeGatheringRsvp}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <Text style={styles.modalTitle}>Manage RSVP</Text>
              <Text style={styles.modalBody}>
                Choose how you want to show up for {gatheringRsvpTarget?.title ?? 'this Gathering'} and whether other attendees can see your RSVP.
              </Text>
              <View style={styles.roleSummaryRow}>
                {(['interested', 'attending'] as const).map((item) => (
                  <Pressable key={item} style={[styles.roleSummaryPill, gatheringRsvpStatus === item && styles.roleSummaryPillAccent]} onPress={() => setGatheringRsvpStatus(item)}>
                    <Text style={gatheringRsvpStatus === item ? styles.roleSummaryTextAccent : styles.roleSummaryText}>{getAttendanceStatusLabel(item)}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.infoCard}>
                <Text style={styles.sectionTitle}>Visibility</Text>
                <Text style={styles.infoText}>
                  {gatheringRsvpVisible
                    ? 'Other attendees and hosts can see that you plan to attend.'
                    : 'Your RSVP stays private while hosts can still manage the event safely.'}
                </Text>
                <View style={styles.inlineActions}>
                  <TouchableOpacity
                    style={gatheringRsvpVisible ? styles.secondaryButton : styles.primaryButton}
                    onPress={() => setGatheringRsvpVisible(false)}
                  >
                    <Text style={gatheringRsvpVisible ? styles.secondaryText : styles.primaryText}>Keep private</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={gatheringRsvpVisible ? styles.primaryButton : styles.secondaryButton}
                    onPress={() => setGatheringRsvpVisible(true)}
                  >
                    <Text style={gatheringRsvpVisible ? styles.primaryText : styles.secondaryText}>Visible to others</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.emptySupport}>{getGatheringPrivacyLabel(gatheringRsvpTarget)}</Text>
              <View style={styles.inlineActions}>
                <TouchableOpacity style={styles.ghostButton} onPress={closeGatheringRsvp}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                {getGatheringAttendance(gatheringRsvpTarget?.id ?? '') ? (
                  <TouchableOpacity style={styles.ghostButton} disabled={savingGatheringRsvp} onPress={() => void handleCancelGatheringRsvp()}>
                    <Text style={styles.ghostText}>{savingGatheringRsvp ? 'Updating' : 'Remove RSVP'}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.primaryButton} disabled={savingGatheringRsvp} onPress={() => void handleSaveGatheringRsvp()}>
                  <Text style={styles.primaryText}>{savingGatheringRsvp ? 'Saving' : 'Save RSVP'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={!!reportTarget} transparent animationType="fade" onRequestClose={closeReportSheet}>
        <Pressable style={styles.modalBackdrop} onPress={closeReportSheet}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <Text style={styles.modalTitle}>
                Report {reportTarget?.type === 'gathering' ? 'Gathering' : reportTarget?.type === 'prompt_response' ? 'Response' : 'Circle'}
              </Text>
              <Text style={styles.modalBody}>
                Reports are private. Tell Betweener what feels unsafe or inappropriate about {reportTarget?.title ?? 'this space'}.
              </Text>
              <View style={styles.roleSummaryRow}>
                {CIRCLE_REPORT_REASONS.map((reason) => {
                  const selected = reportReason === reason;
                  return (
                    <Pressable key={reason} style={[styles.roleSummaryPill, selected && styles.roleSummaryPillAccent]} onPress={() => setReportReason(reason)}>
                      <Text style={selected ? styles.roleSummaryTextAccent : styles.roleSummaryText}>{reason}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={reportDetails}
                onChangeText={setReportDetails}
                placeholder="Optional details"
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={320}
                style={[styles.inlineInput, styles.textArea]}
              />
              <View style={styles.inlineActions}>
                <TouchableOpacity style={styles.ghostButton} onPress={closeReportSheet}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} disabled={!reportReason || submittingReport} onPress={handleSubmitCircleReport}>
                  <Text style={styles.primaryText}>{submittingReport ? 'Sending' : 'Send report'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={roleRequestOpen} transparent animationType="fade" onRequestClose={() => setRoleRequestOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRoleRequestOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <Text style={styles.modalTitle}>Request leadership role</Text>
              <Text style={styles.modalBody}>
                Ask the Circle hosts to consider you for a more trusted role. This is review-based, not instant promotion.
              </Text>
              <View style={styles.roleSummaryRow}>
                {requestableRoleTypes.map((item) => (
                  <Pressable key={item} style={[styles.roleSummaryPill, roleRequestType === item && styles.roleSummaryPillAccent]} onPress={() => setRoleRequestType(item)}>
                    <Text style={roleRequestType === item ? styles.roleSummaryTextAccent : styles.roleSummaryText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={roleRequestNote}
                onChangeText={setRoleRequestNote}
                placeholder="Why are you a good fit for this role?"
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={240}
                style={[styles.inlineInput, styles.textArea]}
              />
              <View style={styles.inlineActions}>
                <TouchableOpacity style={styles.ghostButton} onPress={() => setRoleRequestOpen(false)}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} disabled={submittingRoleRequest} onPress={handleSubmitRoleRequest}>
                  <Text style={styles.primaryText}>{submittingRoleRequest ? 'Submitting' : 'Send request'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={!!roleRequestRejectTarget} transparent animationType="fade" onRequestClose={() => setRoleRequestRejectTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRoleRequestRejectTarget(null)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <Text style={styles.modalTitle}>Decline role request</Text>
              <Text style={styles.modalBody}>
                Share a short reason so the member understands why this request is not being approved right now.
              </Text>
              <TextInput
                value={roleRequestRejectReason}
                onChangeText={setRoleRequestRejectReason}
                placeholder="Optional reason"
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={240}
                style={[styles.inlineInput, styles.textArea]}
              />
              <View style={styles.inlineActions}>
                <TouchableOpacity style={styles.ghostButton} onPress={() => setRoleRequestRejectTarget(null)}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  disabled={!roleRequestRejectTarget || reviewingRoleRequestId === roleRequestRejectTarget?.id}
                  onPress={() => roleRequestRejectTarget && void handleReviewRoleRequest(roleRequestRejectTarget.id, 'reject', roleRequestRejectReason)}
                >
                  <Text style={styles.primaryText}>{roleRequestRejectTarget && reviewingRoleRequestId === roleRequestRejectTarget.id ? 'Declining' : 'Decline request'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={promptComposerOpen} transparent animationType="fade" onRequestClose={() => {
        setPromptComposerOpen(false);
        setEditingPromptTarget(null);
      }}>
        <Pressable style={styles.modalBackdrop} onPress={() => {
          setPromptComposerOpen(false);
          setEditingPromptTarget(null);
        }}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{editingPromptTarget ? 'Edit Circle Prompt' : 'Create Circle Prompt'}</Text>
                <Text style={styles.modalBody}>
                  {editingPromptTarget
                    ? 'Tighten the wording so this prompt keeps producing thoughtful answers.'
                    : 'Publish a prompt that helps members reveal values, intent, and emotional clarity.'}
                </Text>
                <TextInput
                  value={promptComposerTitle}
                  onChangeText={setPromptComposerTitle}
                  placeholder="Prompt title"
                  placeholderTextColor={theme.textMuted}
                  style={styles.inlineInput}
                />
                <TextInput
                  value={promptComposerBody}
                  onChangeText={setPromptComposerBody}
                  placeholder="What question should members answer?"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  maxLength={500}
                  style={[styles.inlineInput, styles.textArea]}
                />
                <View style={styles.roleSummaryRow}>
                  {(['host', 'weekly', 'daily'] as const).map((item) => (
                    <Pressable key={item} style={[styles.roleSummaryPill, promptComposerType === item && styles.roleSummaryPillAccent]} onPress={() => setPromptComposerType(item)}>
                      <Text style={promptComposerType === item ? styles.roleSummaryTextAccent : styles.roleSummaryText}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.inlineActions}>
                  <TouchableOpacity style={styles.ghostButton} onPress={() => {
                    setPromptComposerOpen(false);
                    setEditingPromptTarget(null);
                  }}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={publishingPrompt} onPress={handleSavePrompt}>
                    <Text style={styles.primaryText}>
                      {publishingPrompt ? (editingPromptTarget ? 'Saving' : 'Publishing') : editingPromptTarget ? 'Save prompt' : 'Publish prompt'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={gatheringComposerOpen} transparent animationType="fade" onRequestClose={() => {
        setGatheringComposerOpen(false);
        setEditingGatheringTarget(null);
      }}>
        <Pressable style={styles.modalBackdrop} onPress={() => {
          setGatheringComposerOpen(false);
          setEditingGatheringTarget(null);
        }}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{editingGatheringTarget ? 'Edit Gathering' : 'Host Gathering'}</Text>
                <Text style={styles.modalBody}>
                  {editingGatheringTarget
                    ? 'Refine the event details, timing, or poster without leaving this Circle.'
                    : 'Propose a trusted Gathering directly from this Circle.'}
                </Text>
                <TextInput
                  value={gatheringComposerTitle}
                  onChangeText={setGatheringComposerTitle}
                  placeholder="Gathering title"
                  placeholderTextColor={theme.textMuted}
                  style={styles.inlineInput}
                />
                <TextInput
                  value={gatheringComposerDescription}
                  onChangeText={setGatheringComposerDescription}
                  placeholder="What is this Gathering for?"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[styles.inlineInput, styles.textArea]}
                />
                <View style={styles.roleSummaryRow}>
                  {(['physical', 'online', 'hybrid'] as const).map((item) => (
                    <Pressable key={item} style={[styles.roleSummaryPill, gatheringComposerType === item && styles.roleSummaryPillAccent]} onPress={() => setGatheringComposerType(item)}>
                      <Text style={gatheringComposerType === item ? styles.roleSummaryTextAccent : styles.roleSummaryText}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.posterComposerCard}>
                  <View style={styles.featureCardTop}>
                    <Text style={styles.inputLabel}>Gathering poster</Text>
                    <Text style={styles.featureMetaPill}>{gatheringComposerPosterMode === 'member' ? getGatheringSeatContextLabel(selectedGatheringPosterSeatContext) : gatheringComposerPosterMode === 'image' ? 'Photo poster' : 'Optional'}</Text>
                  </View>
                  {gatheringComposerPosterPreviewUrl ? (
                    gatheringComposerPosterMode === 'member' && selectedGatheringPosterMember?.avatarUrl ? (
                      <LinearGradient colors={['rgba(19,168,168,0.24)', 'rgba(7,30,34,0.96)']} style={styles.memberPosterPreview}>
                        <View style={styles.memberPosterPreviewTop}>
                          <Text style={styles.memberPosterPreviewKicker}>Host-led invitation</Text>
                          <Text style={styles.memberPosterPreviewPill}>{getGatheringSeatContextLabel(selectedGatheringPosterSeatContext)}</Text>
                        </View>
                        <View style={styles.memberPosterPreviewBody}>
                          <Image source={{ uri: selectedGatheringPosterMember.avatarUrl }} style={styles.memberPosterPreviewAvatar} />
                          <View style={styles.memberPosterPreviewCopy}>
                            <Text style={styles.memberPosterPreviewName} numberOfLines={1}>{selectedGatheringPosterMember.fullName}</Text>
                            <Text style={styles.memberPosterPreviewMeta} numberOfLines={2}>
                              {gatheringComposerTitle.trim() || 'Gathering poster preview'}
                            </Text>
                            <Text style={styles.memberPosterPreviewSupport} numberOfLines={2}>{getGatheringSeatContextCopy(selectedGatheringPosterSeatContext, selectedGatheringPosterMember.fullName)}</Text>
                          </View>
                        </View>
                      </LinearGradient>
                    ) : (
                      <Image source={{ uri: gatheringComposerPosterPreviewUrl }} style={styles.gatheringPosterPreview} />
                    )
                  ) : (
                    <View style={styles.gatheringPosterPreviewFallback}>
                      <MaterialCommunityIcons name="image-outline" size={24} color={theme.textMuted} />
                      <Text style={styles.emptySupport}>Add a visual so this Gathering reads like an event, not just a text block.</Text>
                    </View>
                  )}
                  <View style={styles.inlineActions}>
                    <TouchableOpacity style={styles.secondaryButton} disabled={gatheringPosterUploading} onPress={() => void handlePickGatheringPosterImage()}>
                      <Text style={styles.secondaryText}>{gatheringPosterUploading ? 'Uploading image' : 'Upload image'}</Text>
                    </TouchableOpacity>
                    {gatheringComposerPosterUrl ? (
                      <TouchableOpacity
                        style={styles.ghostButton}
                        onPress={() => {
                          setGatheringComposerPosterUrl(null);
                          setGatheringComposerPosterPreviewUrl(null);
                          setGatheringComposerPosterMode(null);
                          setGatheringComposerPosterMemberId(null);
                        }}
                      >
                        <Text style={styles.ghostText}>Clear</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {gatheringPosterCandidates.length > 0 ? (
                    <View style={styles.posterMemberSection}>
                      <Text style={styles.emptySupport}>Or use a member avatar for a more social host-led invitation.</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.posterMemberRail}>
                        {gatheringPosterCandidates.map((candidate) => {
                          const active = gatheringComposerPosterMemberId === candidate.profileId;
                          return (
                            <Pressable
                              key={candidate.profileId}
                              style={[styles.posterMemberCard, active && styles.posterMemberCardActive]}
                              onPress={() => handleSelectGatheringPosterMember(candidate.profileId, candidate.avatarUrl)}
                            >
                              <Image source={{ uri: candidate.avatarUrl! }} style={styles.posterMemberAvatar} />
                              <Text style={styles.posterMemberName} numberOfLines={1}>{candidate.fullName}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
                <View style={styles.rowInputs}>
                  <TextInput value={gatheringComposerDate} onChangeText={setGatheringComposerDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textMuted} style={[styles.inlineInput, styles.rowInput]} />
                  <TextInput value={gatheringComposerTime} onChangeText={setGatheringComposerTime} placeholder="HH:MM" placeholderTextColor={theme.textMuted} style={[styles.inlineInput, styles.rowInput]} />
                </View>
                <TextInput value={gatheringComposerCity} onChangeText={setGatheringComposerCity} placeholder="City" placeholderTextColor={theme.textMuted} style={styles.inlineInput} />
                {gatheringComposerType !== 'online' ? (
                  <TextInput value={gatheringComposerVenue} onChangeText={setGatheringComposerVenue} placeholder="Venue name" placeholderTextColor={theme.textMuted} style={styles.inlineInput} />
                ) : null}
                <View style={styles.inlineActions}>
                  <TouchableOpacity style={styles.ghostButton} onPress={() => {
                    setGatheringComposerOpen(false);
                    setEditingGatheringTarget(null);
                  }}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={creatingGathering || gatheringPosterUploading} onPress={handleSaveGathering}>
                    <Text style={styles.primaryText}>
                      {creatingGathering
                        ? (editingGatheringTarget ? 'Saving' : 'Submitting')
                        : gatheringPosterUploading
                          ? 'Preparing poster'
                          : editingGatheringTarget
                            ? 'Save Gathering'
                            : 'Submit Gathering'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <IntentRequestSheet
        visible={intentSheetOpen}
        onClose={() => setIntentSheetOpen(false)}
        recipientId={intentTarget?.id}
        recipientName={intentTarget?.name ?? null}
        defaultType="circle_intro"
        metadata={{ source: 'circles', circle_id: circle?.id, circle_name: circle?.name }}
      />
      <CircleInviteSheet
        visible={inviteSheetOpen}
        circleId={circleId}
        circleName={circle?.name || 'this Circle'}
        actorProfileId={currentProfileId}
        onClose={() => setInviteSheetOpen(false)}
      />
      <CirclePulseManagerSheet
        visible={pulseManagerOpen}
        circleId={circleId}
        actorProfileId={currentProfileId}
        hostNote={circle?.host_note}
        prompts={pulsePromptCandidates}
        gatherings={pulseGatheringCandidates}
        media={pulseMediaCandidates}
        loveSeatCandidates={pulseLoveSeatCandidates}
        featuredItems={pulseItems}
        onClose={() => setPulseManagerOpen(false)}
        onFeatured={reloadPulse}
        onOpenModeration={() => setPulseModerationOpen(true)}
      />
      <CirclePulseCommentSheet
        visible={!!pulseCommentTarget}
        item={pulseCommentTarget}
        actorProfileId={currentProfileId}
        actorDisplayName={profile?.full_name}
        targetCommentId={pulseCommentFocusId}
        targetParentCommentId={pulseCommentParentFocusId}
        onClose={() => {
          setPulseCommentTarget(null);
          setPulseCommentFocusId(null);
          setPulseCommentParentFocusId(null);
          if (requestedPulseItemId || requestedPulseCommentId || requestedPulseParentCommentId || requestedPulseRouteNonce) {
            const nextParams: Record<string, string> = { id: circleId };
            if (requestedTab && ['overview', 'members', 'prompts', 'gatherings', 'moments'].includes(requestedTab)) {
              nextParams.tab = requestedTab;
            }
            router.replace({ pathname: '/circles/[id]', params: nextParams });
          }
          void reloadPulseDiscussionUnreadState();
        }}
        onOpenProfile={openProfile}
      />
      <CirclePulseMediaViewer
        visible={!!pulseMediaTarget}
        item={pulseMediaTarget}
        onClose={() => setPulseMediaTarget(null)}
        onOpenComments={(target) => {
          setPulseCommentFocusId(null);
          setPulseCommentParentFocusId(null);
          setPulseCommentTarget(target);
        }}
      />
      <CirclePulseModerationSheet
        visible={pulseModerationOpen}
        circleId={circleId}
        actorProfileId={currentProfileId}
        onClose={() => setPulseModerationOpen(false)}
        onChanged={reloadPulse}
      />
      <CircleLoveSeatConsentSheet
        circleId={circleId}
        actorProfileId={currentProfileId}
        onResponded={reloadPulse}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    circleAvatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    circleAvatarImage: { width: '100%', height: '100%', borderRadius: 29 },
    circleAvatarBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 19,
      height: 19,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    headerUtility: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    headerCopy: { flex: 1 },
    headerTitle: { fontSize: 24, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { marginTop: 3, fontSize: 12, color: theme.textMuted },
    trustSection: {
      gap: 14,
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.78 : 0.96),
    },
    trustHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    trustCopy: { flex: 1, gap: 5 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    trustBadge: {
      alignSelf: 'flex-start',
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
      color: theme.tint,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.55,
      textTransform: 'capitalize',
    },
    heroTitle: { color: theme.text, fontSize: 25, lineHeight: 31, fontFamily: 'PlayfairDisplay_700Bold' },
    heroSubcopy: { color: theme.textMuted, fontSize: 13, lineHeight: 21 },
    trustActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    inviteButton: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.38),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
    },
    inviteText: { color: theme.text, fontSize: 12, fontWeight: '900' },
    coverButton: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 14,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.42 : 0.8),
    },
    coverButtonText: { color: theme.text, fontSize: 12, fontWeight: '800' },
    statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' },
    statCard: {
      minHeight: 60,
      minWidth: 0,
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 18,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.74),
    },
    statCardHalf: {
      width: 96,
      flexBasis: 96,
      flexGrow: 0,
    },
    statIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    statIconMembers: { backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.1) },
    statIconPrompts: { backgroundColor: withAlpha(theme.accent, isDark ? 0.2 : 0.12) },
    statIconGatherings: { backgroundColor: withAlpha(theme.secondary, isDark ? 0.18 : 0.12) },
    statCopy: { flex: 1, minWidth: 0 },
    statValue: { color: theme.text, fontSize: 17, lineHeight: 19, fontFamily: 'PlayfairDisplay_700Bold' },
    statLabel: { marginTop: 1, color: theme.textMuted, fontSize: 8, lineHeight: 11, fontWeight: '700', letterSpacing: 0.3 },
    posterComposerCard: {
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.72 : 0.9),
      gap: 10,
    },
    gatheringPosterPreview: {
      width: '100%',
      height: 158,
      borderRadius: 18,
      backgroundColor: theme.backgroundSubtle,
    },
    memberPosterPreview: {
      width: '100%',
      minHeight: 158,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.24),
      gap: 12,
    },
    memberPosterPreviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    memberPosterPreviewKicker: { color: theme.tint, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
    memberPosterPreviewPill: {
      color: theme.text,
      fontSize: 10,
      fontWeight: '800',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
    },
    memberPosterPreviewBody: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    memberPosterPreviewAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
      borderColor: withAlpha(theme.text, 0.92),
      backgroundColor: theme.backgroundSubtle,
    },
    memberPosterPreviewCopy: { flex: 1, gap: 4 },
    memberPosterPreviewName: { color: theme.text, fontSize: 18, lineHeight: 22, fontFamily: 'PlayfairDisplay_700Bold' },
    memberPosterPreviewMeta: { color: theme.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
    memberPosterPreviewSupport: { color: theme.textMuted, fontSize: 11, lineHeight: 16 },
    gatheringPosterPreviewFallback: {
      minHeight: 132,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.72),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      gap: 10,
    },
    posterMemberSection: { gap: 8 },
    posterMemberRail: { gap: 10, paddingRight: 6 },
    posterMemberCard: {
      width: 82,
      padding: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.76),
      gap: 8,
      alignItems: 'center',
    },
    posterMemberCardActive: {
      borderColor: withAlpha(theme.tint, 0.4),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
    },
    posterMemberAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.backgroundSubtle },
    posterMemberName: { color: theme.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
    editNameCard: {
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      gap: 10,
    },
    inputLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
    inlineInput: {
      borderWidth: 1,
      borderColor: theme.outline,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      backgroundColor: theme.backgroundSubtle,
      fontSize: 13,
    },
    textArea: { minHeight: 110, textAlignVertical: 'top' },
    rowInputs: { flexDirection: 'row', gap: 10 },
    rowInput: { flex: 1 },
    section: { gap: 12 },
    sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '800' },
    sectionLead: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    requestStack: { gap: 10 },
    pendingCard: {
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.86 : 0.96),
      gap: 10,
    },
    tabRow: {
      gap: 6,
      paddingVertical: 2,
      paddingRight: 18,
    },
    tabButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.46 : 0.84),
    },
    tabButtonActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    tabText: { color: theme.textMuted, fontSize: 12, fontWeight: '800' },
    tabTextActive: { color: Colors.light.background },
    featureCard: {
      padding: 15,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      gap: 10,
      overflow: 'hidden',
    },
    gatheringPosterShell: {
      height: 154,
      marginBottom: 4,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.backgroundSubtle,
    },
    gatheringMemberPosterShell: {
      minHeight: 154,
      marginBottom: 4,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.24),
      gap: 12,
    },
    gatheringPosterImage: { width: '100%', height: '100%' },
    gatheringPosterOverlay: { ...StyleSheet.absoluteFillObject },
    gatheringPosterBadge: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(7,30,34,0.72)',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.16)',
    },
    gatheringPosterBadgeText: { color: '#F4E8D0', fontSize: 11, fontWeight: '800' },
    featureCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    featureMetaPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.12),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.72),
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    kicker: { color: theme.tint, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
    featureTitle: { color: theme.text, fontSize: 18, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
    featureBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    featureHint: { color: withAlpha(theme.textMuted, 0.92), fontSize: 12, lineHeight: 18, flex: 1 },
    featureActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    manageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    manageButton: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.66),
    },
    manageButtonText: { color: theme.text, fontSize: 12, fontWeight: '800' },
    manageDangerText: { color: theme.danger, fontSize: 12, fontWeight: '800' },
    infoCard: {
      padding: 15,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.88 : 0.98),
      gap: 8,
    },
    leadRail: { gap: 12, paddingTop: 4, paddingRight: 18 },
    leadStack: { gap: 12 },
    memberContextRow: { gap: 10 },
    memberContextCard: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      padding: 13,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.24),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.82 : 0.96),
    },
    memberContextIcon: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 21,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
    },
    memberContextCopy: { flex: 1, minWidth: 0, gap: 2 },
    memberContextKicker: { color: theme.tint, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
    memberContextTitle: { color: theme.text, fontSize: 14, fontWeight: '900' },
    memberContextMeta: { color: theme.textMuted, fontSize: 11 },
    leadCard: {
      width: 252,
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.3 : 0.7),
      gap: 10,
      overflow: 'hidden',
    },
    leadCardExpanded: { width: '100%' },
    leadTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    leadIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    leadAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.backgroundSubtle },
    leadAvatarFallback: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    leadCopy: { flex: 1, gap: 2 },
    leadBody: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
    infoText: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    responseStack: { gap: 10, paddingTop: 4 },
    responseCard: {
      padding: 13,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.74),
      gap: 8,
    },
    responseTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    roleSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    roleSummaryPill: {
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.82 : 0.96),
    },
    roleSummaryPillAccent: {
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.28),
      backgroundColor: withAlpha(theme.tint, 0.14),
    },
    roleSummaryText: { color: theme.textMuted, fontSize: 11, fontWeight: '800' },
    roleSummaryTextAccent: { color: theme.tint, fontSize: 11, fontWeight: '900' },
    memberList: { gap: 12 },
    memberCard: {
      padding: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.09),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.9 : 0.98),
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      overflow: 'hidden',
    },
    memberCardGlow: {
      position: 'absolute',
      right: -18,
      top: -12,
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.backgroundSubtle },
    avatarFallback: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    memberContent: { flex: 1, gap: 7 },
    memberHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    memberHeaderCopy: { flex: 1, minWidth: 0, gap: 3 },
    memberTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    memberName: { fontSize: 14, fontWeight: '800', color: theme.text, flexShrink: 1 },
    memberMeta: { fontSize: 12, color: theme.textMuted },
    memberBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    memberPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.tint, 0.16),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.26),
    },
    memberPillText: { color: theme.tint, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
    memberPillNew: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.secondary, isDark ? 0.18 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.secondary, isDark ? 0.34 : 0.28),
    },
    memberPillNewInline: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.secondary, isDark ? 0.18 : 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.secondary, isDark ? 0.34 : 0.28),
    },
    memberPillNewText: { color: theme.secondary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
    memberPillMuted: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.textMuted, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.textMuted, isDark ? 0.16 : 0.12),
    },
    memberPillMutedText: { color: theme.textMuted, fontSize: 11, fontWeight: '800' },
    presenceBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    presenceBadgeOnline: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(theme.tint, isDark ? 0.32 : 0.24),
    },
    presenceBadgeActive: {
      backgroundColor: withAlpha(theme.secondary, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(theme.secondary, isDark ? 0.32 : 0.24),
    },
    presenceBadgeRecent: {
      backgroundColor: withAlpha(theme.accent, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(theme.accent, isDark ? 0.32 : 0.24),
    },
    presenceDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    presenceDotOnline: { backgroundColor: theme.tint },
    presenceDotActive: { backgroundColor: theme.secondary },
    presenceDotRecent: { backgroundColor: theme.accent },
    presenceText: { color: theme.text, fontSize: 10, fontWeight: '800' },
    inlineActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 4 },
    primaryButton: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.tint },
    primaryText: { color: Colors.light.background, fontWeight: '800', fontSize: 12 },
    secondaryButton: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    secondaryText: { color: theme.text, fontWeight: '700', fontSize: 12 },
    ghostButton: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    ghostText: { color: theme.tint, fontWeight: '700', fontSize: 12 },
    emptyText: { fontSize: 13, color: theme.textMuted, lineHeight: 20 },
    emptyCard: {
      padding: 18,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.88 : 0.98),
      gap: 10,
    },
    emptyIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.2),
    },
    emptyTitle: { fontSize: 18, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold' },
    emptyHint: { fontSize: 13, lineHeight: 20, color: theme.textMuted },
    emptySupport: { fontSize: 12, lineHeight: 18, color: theme.textMuted },
    momentRail: { gap: 12, paddingRight: 18 },
    momentList: { gap: 12 },
    momentCard: {
      width: 232,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.9 : 0.98),
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    momentCardGlow: {
      position: 'absolute',
      right: -24,
      top: 116,
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: withAlpha(theme.accent, isDark ? 0.14 : 0.08),
      zIndex: 0,
    },
    momentPreview: { width: '100%', height: 156, backgroundColor: theme.backgroundSubtle },
    momentFallback: { width: '100%', height: 156, alignItems: 'center', justifyContent: 'center' },
    momentTextPanel: { width: '100%', minHeight: 156, padding: 18, justifyContent: 'flex-end' },
    momentTextPreview: { color: '#F4E8D0', fontSize: 18, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
    momentCopy: { padding: 16, gap: 8 },
    momentHeaderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    momentKindPill: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.2),
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    },
    momentTimePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.12),
      backgroundColor: withAlpha(theme.background, isDark ? 0.4 : 0.76),
    },
    momentTimeText: { color: theme.textMuted, fontSize: 11, fontWeight: '800' },
    momentTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
    momentMeta: { color: theme.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.56)' },
    modalKeyboardWrap: { width: '100%', justifyContent: 'center' },
    modalCard: {
      padding: 18,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
      gap: 12,
    },
    modalScroll: { maxHeight: '88%' },
    modalScrollContent: { gap: 12 },
    modalTitle: { color: theme.text, fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
    modalBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    manageMemberCard: {
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.84 : 0.96),
      gap: 4,
    },
    manageRoleStack: { gap: 10 },
    optionStack: { gap: 8 },
    optionAction: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.2),
      backgroundColor: withAlpha(theme.tint, 0.08),
    },
    optionDangerAction: {
      borderColor: withAlpha(theme.danger, 0.22),
      backgroundColor: withAlpha(theme.danger, 0.07),
    },
    optionActionText: { color: theme.text, fontSize: 13, fontWeight: '800' },
    optionDangerText: { color: theme.danger, fontSize: 13, fontWeight: '800' },
    optionSupport: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
    manageRoleButton: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, 0.24),
      backgroundColor: withAlpha(theme.tint, 0.1),
    },
    manageRoleButtonText: { color: theme.text, fontSize: 13, fontWeight: '800' },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
