import IntentRequestSheet from '@/components/IntentRequestSheet';
import CircleInviteSheet from '@/components/circles/CircleInviteSheet';
import CircleLoveSeatConsentSheet from '@/components/circles/CircleLoveSeatConsentSheet';
import CirclePulseBoard from '@/components/circles/CirclePulseBoard';
import CirclePulseCommentSheet from '@/components/circles/CirclePulseCommentSheet';
import CirclePulseManagerSheet from '@/components/circles/CirclePulseManagerSheet';
import CirclePulseMediaViewer from '@/components/circles/CirclePulseMediaViewer';
import CirclePulseModerationSheet from '@/components/circles/CirclePulseModerationSheet';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { getCircleScopeLabel } from '@/lib/circles/circle-display';
import { endCircleLoveSeat } from '@/lib/circles/pulse/circle-pulse-service';
import { respondToCircleInvitation } from '@/lib/circles/circle-invitations';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulse } from '@/lib/circles/pulse/use-circle-pulse';
import { createSignedUrl as createMomentSignedUrl } from '@/lib/moments';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

type DetailTab = 'overview' | 'members' | 'prompts' | 'gatherings' | 'moments' | 'gist';

type Circle = {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  short_description?: string | null;
  visibility?: string | null;
  category?: string | null;
  created_by_profile_id?: string | null;
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
  active_this_week_count?: number | null;
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
  } | null;
};

const NEW_MEMBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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

type RelationshipGist = {
  id: string;
  title: string;
  short_body?: string | null;
  body: string;
  perspective?: string | null;
  circle_id?: string | null;
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

const getLeaderRoleLabel = (role?: string | null) => {
  const normalized = String(role ?? '').toLowerCase();
  if (normalized === 'leader' || normalized === 'host') return 'Host';
  if (normalized === 'moderator') return 'Moderator';
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'matchmaker') return 'Matchmaker';
  return 'Member';
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

export default function CircleDetailScreen() {
  const { profile, user } = useAuth();
  const params = useLocalSearchParams();
  const circleId = String(params?.id ?? '');
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(profile?.id ?? null);
  const currentProfileId = resolvedProfileId;
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingMembers, setPendingMembers] = useState<MemberRow[]>([]);
  const [membership, setMembership] = useState<MemberRow | null>(null);
  const [prompts, setPrompts] = useState<CirclePrompt[]>([]);
  const [promptResponsesByPromptId, setPromptResponsesByPromptId] = useState<Record<string, CirclePromptResponse[]>>({});
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [gatheringAttendance, setGatheringAttendance] = useState<Record<string, GatheringAttendance>>({});
  const [gists, setGists] = useState<RelationshipGist[]>([]);
  const [moments, setMoments] = useState<CircleMoment[]>([]);
  const [momentSignedUrls, setMomentSignedUrls] = useState<Record<string, string>>({});
  const [momentLoadError, setMomentLoadError] = useState<string | null>(null);
  const [roleRequests, setRoleRequests] = useState<CircleRoleRequest[]>([]);
  const [moderationReports, setModerationReports] = useState<CircleReport[]>([]);
  const [loading, setLoading] = useState(false);
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
  const [publishingPrompt, setPublishingPrompt] = useState(false);
  const [gatheringComposerOpen, setGatheringComposerOpen] = useState(false);
  const [gatheringComposerTitle, setGatheringComposerTitle] = useState('');
  const [gatheringComposerDescription, setGatheringComposerDescription] = useState('');
  const [gatheringComposerDate, setGatheringComposerDate] = useState('');
  const [gatheringComposerTime, setGatheringComposerTime] = useState('');
  const [gatheringComposerCity, setGatheringComposerCity] = useState('');
  const [gatheringComposerVenue, setGatheringComposerVenue] = useState('');
  const [gatheringComposerType, setGatheringComposerType] = useState<'physical' | 'online' | 'hybrid'>('physical');
  const [creatingGathering, setCreatingGathering] = useState(false);
  const [manageMemberTarget, setManageMemberTarget] = useState<MemberRow | null>(null);
  const [hostNoteOpen, setHostNoteOpen] = useState(false);
  const [hostNoteValue, setHostNoteValue] = useState('');
  const [savingHostNote, setSavingHostNote] = useState(false);
  const [gistPerspective, setGistPerspective] = useState('general');
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
  const [pulseMediaTarget, setPulseMediaTarget] = useState<CirclePulseItem | null>(null);
  const [pulseModerationOpen, setPulseModerationOpen] = useState(false);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [circleOptionsOpen, setCircleOptionsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (profile?.id) {
      setResolvedProfileId(profile.id);
      return () => {
        cancelled = true;
      };
    }
    if (!user?.id) {
      setResolvedProfileId(null);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const { data } = await db.from('profiles').select('id').eq('user_id', user.id).maybeSingle();
      if (!cancelled) setResolvedProfileId(data?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, user?.id]);

  const loadCircle = useCallback(async () => {
    if (!circleId) return;
    setLoading(true);
    try {
      const circlePromise = db
        .from('circles')
        .select('id,name,slug,description,short_description,visibility,category,created_by_profile_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,is_official,is_partner,is_featured,requires_join_approval,rules,safety_note,member_count,active_this_week_count,gathering_count,archived_at,host_note,host_note_updated_at,host_note_updated_by_profile_id')
        .eq('id', circleId)
        .maybeSingle();

      const membershipPromise = currentProfileId
        ? db.from('circle_members').select('id,role,status,is_visible,profile_id,user_id').eq('circle_id', circleId).eq('profile_id', currentProfileId).maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const membersPromise = db
        .from('circle_members')
        .select('id,role,status,is_visible,profile_id,user_id,joined_at,profiles(id,user_id,full_name,avatar_url,age,location,city,region)')
        .eq('circle_id', circleId);

      const promptsPromise = db
        .from('circle_prompts')
        .select('id,title,prompt,prompt_type')
        .eq('circle_id', circleId)
        .eq('status', 'published')
        .order('starts_at', { ascending: false, nullsFirst: false })
        .limit(20);

      const gatheringsPromise = db
        .from('gatherings')
        .select('id,title,description,starts_at,city,country_code,venue_name,gathering_type,address_visibility,is_partner_venue,safe_first_date_space,attendee_count')
        .eq('circle_id', circleId)
        .eq('status', 'approved')
        .order('starts_at', { ascending: true })
        .limit(20);

      const roleRequestsPromise = db
        .from('circle_role_requests')
        .select('id,circle_id,requester_profile_id,requester_user_id,requested_role,note,status,rejection_reason,created_at')
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false })
        .limit(20);

      const gistsPromise = db
        .from('relationship_gists')
        .select('id,title,short_body,body,perspective,circle_id')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(24);

      const [
        { data: circleRow },
        { data: myMembership },
        { data: memberRows },
        { data: promptRows },
        { data: gatheringRows },
        { data: roleRequestRows },
        { data: gistRows },
      ] = await Promise.all([
        circlePromise,
        membershipPromise,
        membersPromise,
        promptsPromise,
        gatheringsPromise,
        roleRequestsPromise,
        gistsPromise,
      ]);

      setCircle((circleRow as Circle) || null);
      const nextMembership = (myMembership as MemberRow) || null;
      setMembership(nextMembership);
      const nextPrompts = (promptRows ?? []) as CirclePrompt[];
      setPrompts(nextPrompts);
      const nextGatherings = (gatheringRows ?? []) as Gathering[];
      setGatherings(nextGatherings);
      setGists(((gistRows ?? []) as RelationshipGist[]).filter((item) => !item.circle_id || item.circle_id === circleId));

      const rows: MemberRow[] = (memberRows || []).map((row: any) => ({
        id: String(row.id),
        role: String(row.role),
        status: String(row.status),
        is_visible: row.is_visible !== false,
        profile_id: String(row.profile_id),
        user_id: row.user_id || row.profiles?.user_id ? String(row.user_id || row.profiles?.user_id) : null,
        joined_at: row.joined_at ? String(row.joined_at) : null,
        profiles: normalizeMemberProfile(row.profiles),
      }));
      const activeVisibleMembers = rows.filter((row) => row.status === 'active' && row.is_visible !== false);
      const memberByProfileId = rows.reduce<Record<string, MemberRow>>((acc, row) => {
        acc[row.profile_id] = row;
        return acc;
      }, {});
      setMembers(activeVisibleMembers);
      setPendingMembers(rows.filter((row) => row.status === 'pending'));
      setRoleRequests(
        ((roleRequestRows ?? []) as any[]).map((row) => ({
          id: String(row.id),
          circle_id: String(row.circle_id),
          requester_profile_id: String(row.requester_profile_id),
          requester_user_id: row.requester_user_id ? String(row.requester_user_id) : null,
          requested_role: String(row.requested_role) as CircleRoleRequestType,
          note: row.note ?? null,
          status: String(row.status),
          rejection_reason: row.rejection_reason ?? null,
          created_at: String(row.created_at),
          requester: memberByProfileId[String(row.requester_profile_id)]?.profiles ?? null,
        })),
      );

      if (nextPrompts.length > 0) {
        const { data: promptResponseRows } = await db
          .from('circle_prompt_responses')
          .select('id,prompt_id,profile_id,response,created_at,profiles(id,full_name,avatar_url,age,location,city,region)')
          .in('prompt_id', nextPrompts.map((item) => item.id))
          .order('created_at', { ascending: false });
        const nextPromptResponses = ((promptResponseRows ?? []) as any[]).reduce<Record<string, CirclePromptResponse[]>>((acc, row) => {
          const promptId = String(row.prompt_id);
          const nextRow: CirclePromptResponse = {
            id: String(row.id),
            prompt_id: promptId,
            profile_id: String(row.profile_id),
            response: String(row.response),
            created_at: String(row.created_at),
            profiles: normalizeMemberProfile(row.profiles),
          };
          if (!acc[promptId]) acc[promptId] = [];
          acc[promptId].push(nextRow);
          return acc;
        }, {});
        setPromptResponsesByPromptId(nextPromptResponses);
      } else {
        setPromptResponsesByPromptId({});
      }

      const nextMembershipRole = normalizeCircleRole(nextMembership?.status === 'active' ? nextMembership.role : null);
      const canLoadModerationReports = !!currentProfileId && (
        String((circleRow as Circle | null)?.created_by_profile_id ?? '') === currentProfileId
        || ['host', 'admin', 'moderator'].includes(nextMembershipRole)
      );

      if (canLoadModerationReports) {
        const { data: reportRows, error: reportError } = await db.rpc('rpc_list_circle_reports', {
          p_circle_id: circleId,
          p_profile_id: currentProfileId,
        });
        if (reportError) throw reportError;
        setModerationReports(
          ((reportRows ?? []) as any[]).map((row) => ({
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
          })),
        );
      } else {
        setModerationReports([]);
      }

      if (currentProfileId && nextGatherings.length > 0) {
        const { data: attendeeRows } = await db
          .from('gathering_attendees')
          .select('gathering_id,status,visible_to_others')
          .eq('profile_id', currentProfileId)
          .in('gathering_id', nextGatherings.map((item) => item.id));
        const nextAttendance = ((attendeeRows ?? []) as any[]).reduce<Record<string, GatheringAttendance>>((acc, row) => {
          acc[String(row.gathering_id)] = {
            gathering_id: String(row.gathering_id),
            status: String(row.status),
            visible_to_others: row.visible_to_others === true,
          };
          return acc;
        }, {});
        setGatheringAttendance(nextAttendance);
      } else {
        setGatheringAttendance({});
      }

      const canLoadCircleMoments = String((circleRow as Circle | null)?.created_by_profile_id ?? '') === currentProfileId
        || nextMembership?.status === 'active';
      setMomentLoadError(null);
      if (!canLoadCircleMoments) {
        setMoments([]);
      } else {
        let { data: momentRows, error: momentError } = await db.rpc('rpc_get_circle_member_moments', {
          p_circle_id: circleId,
          p_limit: 18,
        });
        if (!momentError && (momentRows ?? []).length === 0) {
          const recovery = await db.rpc('rpc_get_circle_member_moments_recovery', {
            p_circle_id: circleId,
            p_limit: 18,
          });
          if (!recovery.error && (recovery.data ?? []).length > 0) {
            momentRows = recovery.data;
          } else if (recovery.error) {
            logger.warn('[circles] member_moments_recovery_failed', {
              circleId,
              error: String(recovery.error.message || recovery.error),
            });
          }
        }
        if (momentError) {
          logger.warn('[circles] member_moments_failed', { circleId, error: String(momentError.message || momentError) });
          setMomentLoadError(String(momentError.message || momentError));
          setMoments([]);
          return;
        }
        if ((momentRows ?? []).length === 0 && canLoadModerationReports) {
          const { data: diagnostics, error: diagnosticError } = await db.rpc('rpc_debug_circle_member_moments', {
            p_circle_id: circleId,
          });
          logger.warn('[circles] member_moments_empty', {
            circleId,
            diagnostics: diagnosticError ? String(diagnosticError.message || diagnosticError) : diagnostics,
          });
        }
        const memberByUserId = activeVisibleMembers.reduce<Record<string, MemberRow>>((acc, row) => {
          if (row.user_id) acc[String(row.user_id)] = row;
          if (row.profiles?.user_id) acc[String(row.profiles.user_id)] = row;
          return acc;
        }, {});
        setMoments(
          (momentRows ?? []).map((row: any) => ({
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
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [circleId, currentProfileId]);

  useEffect(() => {
    let cancelled = false;
    const resolveMomentUrls = async () => {
      const unresolved = moments.filter((moment) => {
        const source = moment.thumbnail_url || moment.media_url;
        return source && !source.startsWith('http') && !momentSignedUrls[moment.id];
      });
      if (unresolved.length === 0) return;
      const resolved: Record<string, string> = {};
      await Promise.all(unresolved.map(async (moment) => {
        const source = moment.thumbnail_url || moment.media_url;
        const url = source ? await createMomentSignedUrl(source, 3600) : null;
        if (url) resolved[moment.id] = url;
      }));
      if (!cancelled && Object.keys(resolved).length > 0) {
        setMomentSignedUrls((current) => ({ ...current, ...resolved }));
      }
    };
    void resolveMomentUrls();
    return () => {
      cancelled = true;
    };
  }, [momentSignedUrls, moments]);

  useFocusEffect(
    useCallback(() => {
      void loadCircle();
    }, [loadCircle]),
  );

  useEffect(() => {
    if (circle?.name) setNameValue(circle.name);
  }, [circle?.name]);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (circle?.cover_image_url || circle?.icon_url) {
        setImageUrl(circle.cover_image_url || circle.icon_url || null);
        return;
      }
      if (!circle?.image_path) {
        setImageUrl(null);
        return;
      }
      const { data, error } = await db.storage.from('circle-images').createSignedUrl(circle.image_path, 3600);
      if (cancelled) return;
      setImageUrl(error || !data?.signedUrl ? null : data.signedUrl);
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [circle?.cover_image_url, circle?.icon_url, circle?.image_path, circle?.image_updated_at]);

  const isOwner = !!(circle?.created_by_profile_id && circle.created_by_profile_id === currentProfileId);
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
  const canEditCircle = isOwner;
  const canReviewMembers = isOwner || ['host', 'admin', 'moderator'].includes(membershipRole);
  const canManageRoles = isOwner || ['host', 'admin'].includes(membershipRole);
  const canRemoveMembers = isOwner || ['host', 'admin', 'moderator'].includes(membershipRole);
  const canAssignHostRole = isOwner || membershipRole === 'admin';
  const canModerateCircle = isOwner || ['host', 'admin', 'moderator'].includes(membershipRole);
  const canPublishCirclePrompt = isOwner || ['host', 'admin', 'moderator', 'matchmaker'].includes(membershipRole);
  const canHostGathering = isOwner || ['host', 'admin', 'moderator', 'matchmaker'].includes(membershipRole);
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
  const pendingModerationReports = moderationReports.filter((report) => report.status === 'pending' || report.status === 'reviewing');
  const {
    items: pulseItems,
    loading: pulseLoading,
    error: pulseError,
    reload: reloadPulse,
  } = useCirclePulse({ circleId, enabled: isMember });

  const refreshCircleMoments = useCallback(async () => {
    if (!circleId || !isMember) {
      setMoments([]);
      return;
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
      setMomentLoadError(String(momentError.message || momentError));
      setMoments([]);
      return;
    }

    const memberByUserId = members.reduce<Record<string, MemberRow>>((acc, row) => {
      if (row.user_id) acc[String(row.user_id)] = row;
      if (row.profiles?.user_id) acc[String(row.profiles.user_id)] = row;
      return acc;
    }, {});
    setMoments(
      (momentRows ?? []).map((row: any) => ({
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
      })),
    );
  }, [circleId, isMember, members]);

  useEffect(() => {
    if (activeTab !== 'moments') return;
    void refreshCircleMoments();
  }, [activeTab, refreshCircleMoments]);

  useEffect(() => {
    if (!circleId || !isMember || circleMemberUserIds.size === 0 || typeof db.channel !== 'function') return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadCircle(), 240);
    };
    const channel = db
      .channel(`circle-moments:${circleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moments' }, (payload: any) => {
        const changedUserId = String(payload?.new?.user_id ?? payload?.old?.user_id ?? '');
        if (circleMemberUserIds.has(changedUserId)) queueRefresh();
      })
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (typeof db.removeChannel === 'function') void db.removeChannel(channel);
    };
  }, [circleId, circleMemberUserIds, isMember, loadCircle]);

  const handleJoin = useCallback(async () => {
    if (!currentProfileId || !circleId) return;
    if (membership?.status === 'invited') {
      Alert.alert(
        'Join this Circle?',
        `Accept the private invitation to ${circle?.name || 'this Circle'}?`,
        [
          {
            text: 'Decline',
            style: 'destructive',
            onPress: () => {
              void respondToCircleInvitation(circleId, currentProfileId, false)
                .then((status) => {
                  if (status === 'expired') Alert.alert('Circle invitation', 'This invitation has expired.');
                  return loadCircle();
                })
                .catch((error) => Alert.alert('Circle invitation', error instanceof Error ? error.message : 'Could not decline the invitation.'));
            },
          },
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Accept',
            onPress: () => {
              void respondToCircleInvitation(circleId, currentProfileId, true)
                .then((status) => {
                  if (status === 'expired') Alert.alert('Circle invitation', 'This invitation has expired.');
                  return loadCircle();
                })
                .catch((error) => Alert.alert('Circle invitation', error instanceof Error ? error.message : 'Could not accept the invitation.'));
            },
          },
        ],
      );
      return;
    }
    const { error } = await db.rpc('rpc_join_circle', {
      p_circle_id: circleId,
      p_profile_id: currentProfileId,
    });
    if (error) {
      Alert.alert('Join failed', error.message || 'Please try again.');
      return;
    }
    await loadCircle();
  }, [circle?.name, circleId, currentProfileId, loadCircle, membership?.status]);

  const handleApprove = useCallback(async (memberId: string) => {
    if (!currentProfileId || !circleId) return;
    const { error } = await db.rpc('rpc_approve_circle_member', {
      p_circle_id: circleId,
      p_member_id: memberId,
      p_profile_id: currentProfileId,
    });
    if (error) {
      logger.error('[circles] approve_member_failed', error, { circleId });
      Alert.alert('Approve failed', typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.');
      return;
    }
    await loadCircle();
  }, [circleId, currentProfileId, loadCircle]);

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
      Alert.alert('Update failed', typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.');
      return;
    }
    setManageMemberTarget(null);
    await loadCircle();
  }, [circleId, currentProfileId, loadCircle]);

  const handleRemove = useCallback((memberId: string) => {
    if (!currentProfileId || !circleId) return;
    Alert.alert('Remove member', 'Remove this person from the Circle?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setManageMemberTarget(null);
          const { error } = await db.rpc('rpc_remove_circle_member', {
            p_circle_id: circleId,
            p_member_id: memberId,
            p_profile_id: currentProfileId,
          });
          if (error) {
            logger.error('[circles] remove_member_failed', error, { circleId });
            Alert.alert('Remove failed', typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.');
            return;
          }
          await loadCircle();
        },
      },
    ]);
  }, [circleId, currentProfileId, loadCircle]);

  const handleLeave = useCallback(() => {
    if (!currentProfileId || !circleId || !canLeaveCircle) return;
    Alert.alert('Leave Circle', 'Leave this Circle and stop seeing its member context?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const { error } = await db.rpc('rpc_leave_circle', {
            p_circle_id: circleId,
            p_profile_id: currentProfileId,
          });
          if (error) {
            logger.error('[circles] leave_circle_failed', error, { circleId });
            Alert.alert('Leave failed', typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.');
            return;
          }
          await loadCircle();
        },
      },
    ]);
  }, [canLeaveCircle, circleId, currentProfileId, loadCircle]);

  const handleArchiveCircle = useCallback(() => {
    if (!circleId || !currentProfileId || !isOwner) return;
    Alert.alert('Archive Circle', 'Archive this Circle? Members will no longer see it in their Circle list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          const { error } = await db.rpc('rpc_archive_owned_circle', {
            p_circle_id: circleId,
            p_actor_profile_id: currentProfileId,
          });
          if (error) {
            logger.error('[circles] archive_circle_failed', error, { circleId });
            Alert.alert('Archive failed', typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.');
            return;
          }
          router.replace({ pathname: '/(tabs)/circles' });
        },
      },
    ]);
  }, [circleId, currentProfileId, isOwner]);

  const handleDeleteCircle = useCallback(() => {
    if (!circleId || !currentProfileId || !isOwner) return;
    Alert.alert('Delete Circle', 'Permanently delete this non-live Circle? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await db.rpc('rpc_delete_owned_circle', {
            p_circle_id: circleId,
            p_actor_profile_id: currentProfileId,
          });
          if (error) {
            logger.error('[circles] delete_circle_failed', error, { circleId });
            Alert.alert('Delete failed', typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please archive a live Circle first.');
            return;
          }
          router.replace({ pathname: '/(tabs)/circles' });
        },
      },
    ]);
  }, [circleId, currentProfileId, isOwner]);

  const handleSaveName = useCallback(async () => {
    if (!circleId || !currentProfileId) return;
    const trimmed = nameValue.trim();
    if (!trimmed) {
      Alert.alert('Circle name', 'Please enter a Circle name.');
      return;
    }
    const { error } = await db.rpc('rpc_update_circle_name', {
      p_circle_id: circleId,
      p_actor_profile_id: currentProfileId,
      p_name: trimmed,
    });
    if (error) {
      logger.error('[circles] update_name_failed', error, { circleId });
      Alert.alert('Update failed', typeof __DEV__ !== 'undefined' && __DEV__ ? error.message : 'Please try again.');
      return;
    }
    setEditingName(false);
    await loadCircle();
  }, [circleId, currentProfileId, loadCircle, nameValue]);

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
      const { error: updateError } = await db.rpc('rpc_update_circle_image', {
        p_circle_id: circleId,
        p_actor_profile_id: currentProfileId,
        p_image_path: filePath,
      });
      if (updateError) throw updateError;
      await loadCircle();
    } catch (error) {
      logger.error('[circles] upload_image_failed', error, { circleId });
      Alert.alert('Upload failed', typeof __DEV__ !== 'undefined' && __DEV__ && error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setImageUploading(false);
    }
  }, [circleId, currentProfileId, imageUploading, loadCircle]);

  const handleAttend = useCallback(async (gathering: Gathering, status: 'interested' | 'attending' = 'attending', visibleToOthers = false) => {
    const { error } = await db.rpc('rpc_attend_gathering', {
      p_gathering_id: gathering.id,
      p_status: status,
      p_visible_to_others: visibleToOthers,
    });
    if (error) {
      Alert.alert('Attend failed', error.message || 'Please try again.');
      return;
    }
    Alert.alert(status === 'interested' ? 'Interest saved' : 'You are attending', status === 'interested' ? 'This Gathering is saved as interested.' : 'This Gathering is saved for you.');
    await loadCircle();
  }, [loadCircle]);

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
        Alert.alert('Update failed', error.message || 'Please try again.');
        return;
      }
      await loadCircle();
      setGatheringRsvpTarget(null);
      Alert.alert('RSVP removed', 'You will no longer appear as attending for this Gathering.');
    } finally {
      setSavingGatheringRsvp(false);
    }
  }, [gatheringRsvpTarget, loadCircle, savingGatheringRsvp]);

  const openPromptComposer = useCallback(() => {
    setPromptComposerTitle('');
    setPromptComposerBody('');
    setPromptComposerType('host');
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
      const { error } = await db.rpc('rpc_set_circle_host_note', {
        p_circle_id: circleId,
        p_profile_id: currentProfileId,
        p_note: hostNoteValue,
      });
      if (error) throw error;
      setHostNoteOpen(false);
      await loadCircle();
      Alert.alert('Host note updated', 'Members will now see the updated note in this Circle.');
    } catch (error) {
      Alert.alert('Host note failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingHostNote(false);
    }
  }, [circleId, currentProfileId, hostNoteValue, loadCircle, savingHostNote]);

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
      Alert.alert('Report sent', 'We will review this privately. The Circle leadership will not be notified directly.');
    } catch (error) {
      Alert.alert('Report failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  }, [circleId, closeReportSheet, currentProfileId, reportDetails, reportReason, reportTarget, submittingReport, user?.id]);

  const handleReviewCircleReport = useCallback(async (reportId: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    if (!currentProfileId || reviewingReportId) return;
    setReviewingReportId(reportId);
    try {
      const { error } = await db.rpc('rpc_review_circle_report', {
        p_report_id: reportId,
        p_profile_id: currentProfileId,
        p_status: status,
      });
      if (error) throw error;
      await loadCircle();
    } catch (error) {
      Alert.alert('Moderation update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setReviewingReportId(null);
    }
  }, [currentProfileId, loadCircle, reviewingReportId]);

  const handleRemovePromptResponse = useCallback((responseId: string) => {
    if (!currentProfileId || removingPromptResponseId) return;
    Alert.alert('Remove response', 'Remove this response from the Circle?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemovingPromptResponseId(responseId);
          try {
            const { error } = await db.rpc('rpc_remove_circle_prompt_response', {
              p_response_id: responseId,
              p_profile_id: currentProfileId,
            });
            if (error) throw error;
            await loadCircle();
          } catch (error) {
            Alert.alert('Remove failed', error instanceof Error ? error.message : 'Please try again.');
          } finally {
            setRemovingPromptResponseId(null);
          }
        },
      },
    ]);
  }, [currentProfileId, loadCircle, removingPromptResponseId]);

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
      const { error } = await db.rpc('rpc_request_circle_role', {
        p_circle_id: circleId,
        p_profile_id: currentProfileId,
        p_requested_role: roleRequestType,
        p_note: roleRequestNote.trim() || null,
      });
      if (error) throw error;
      setRoleRequestOpen(false);
      setRoleRequestNote('');
      await loadCircle();
      Alert.alert('Request submitted', `Your ${roleRequestType} request has been shared with the Circle hosts.`);
    } catch (error) {
      Alert.alert('Request failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmittingRoleRequest(false);
    }
  }, [circleId, currentProfileId, loadCircle, roleRequestNote, roleRequestType, submittingRoleRequest]);

  const handleReviewRoleRequest = useCallback(async (requestId: string, decision: 'approve' | 'reject', rejectionReason?: string | null) => {
    if (!currentProfileId || reviewingRoleRequestId) return;
    setReviewingRoleRequestId(requestId);
    try {
      const { error } = await db.rpc('rpc_review_circle_role_request', {
        p_request_id: requestId,
        p_profile_id: currentProfileId,
        p_decision: decision,
        p_rejection_reason: rejectionReason?.trim() || null,
      });
      if (error) throw error;
      setRoleRequestRejectTarget(null);
      setRoleRequestRejectReason('');
      await loadCircle();
    } catch (error) {
      Alert.alert(`${decision === 'approve' ? 'Approve' : 'Reject'} failed`, error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setReviewingRoleRequestId(null);
    }
  }, [currentProfileId, loadCircle, reviewingRoleRequestId]);

  const openRejectRoleRequest = useCallback((request: CircleRoleRequest) => {
    setRoleRequestRejectTarget(request);
    setRoleRequestRejectReason('');
  }, []);

  const handleCancelRoleRequest = useCallback(async (requestId: string) => {
    if (!currentProfileId || cancellingRoleRequestId) return;
    setCancellingRoleRequestId(requestId);
    try {
      const { error } = await db.rpc('rpc_cancel_circle_role_request', {
        p_request_id: requestId,
        p_profile_id: currentProfileId,
      });
      if (error) throw error;
      await loadCircle();
    } catch (error) {
      Alert.alert('Cancel failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCancellingRoleRequestId(null);
    }
  }, [cancellingRoleRequestId, currentProfileId, loadCircle]);

  const handlePublishPrompt = useCallback(async () => {
    if (!circleId || publishingPrompt) return;
    const title = promptComposerTitle.trim();
    const body = promptComposerBody.trim();
    if (!title || title.length < 3) {
      Alert.alert('Prompt title', 'Add a clear prompt title.');
      return;
    }
    if (!body || body.length < 10) {
      Alert.alert('Prompt body', 'Add a thoughtful prompt people can answer.');
      return;
    }
    setPublishingPrompt(true);
    try {
      const { error } = await db.rpc('rpc_create_circle_prompt', {
        p_circle_id: circleId,
        p_title: title,
        p_prompt: body,
        p_prompt_type: promptComposerType,
      });
      if (error) throw error;
      setPromptComposerOpen(false);
      setPromptComposerTitle('');
      setPromptComposerBody('');
      await loadCircle();
      Alert.alert('Prompt published', 'Members can answer it now.');
    } catch (error) {
      Alert.alert('Prompt publish failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPublishingPrompt(false);
    }
  }, [circleId, loadCircle, promptComposerBody, promptComposerTitle, promptComposerType, publishingPrompt]);

  const openGatheringComposer = useCallback(() => {
    setGatheringComposerTitle('');
    setGatheringComposerDescription('');
    setGatheringComposerDate('');
    setGatheringComposerTime('');
    setGatheringComposerCity(circle?.city ?? (profile?.city ?? ''));
    setGatheringComposerVenue('');
    setGatheringComposerType('physical');
    setGatheringComposerOpen(true);
  }, [circle?.city, profile?.city]);

  const handleCreateGathering = useCallback(async () => {
    if (!circleId || creatingGathering) return;
    const title = gatheringComposerTitle.trim();
    const description = gatheringComposerDescription.trim();
    const datePart = gatheringComposerDate.trim();
    const timePart = gatheringComposerTime.trim();
    if (!title || title.length < 3) {
      Alert.alert('Gathering title', 'Add a clear Gathering title.');
      return;
    }
    if (!description || description.length < 10) {
      Alert.alert('Gathering details', 'Add a short description for review.');
      return;
    }
    if (!datePart || !timePart) {
      Alert.alert('Start time', 'Add a valid future date and time.');
      return;
    }
    const startsAt = new Date(`${datePart}T${timePart}`);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      Alert.alert('Start time', 'Use a future date and time.');
      return;
    }
    setCreatingGathering(true);
    try {
      const { error } = await db.rpc('rpc_create_gathering_request', {
        p_circle_id: circleId,
        p_title: title,
        p_description: description,
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
      });
      if (error) throw error;
      setGatheringComposerOpen(false);
      setGatheringComposerTitle('');
      setGatheringComposerDescription('');
      setGatheringComposerDate('');
      setGatheringComposerTime('');
      setGatheringComposerVenue('');
      await loadCircle();
      Alert.alert('Gathering submitted', 'We will notify you once it is approved.');
    } catch (error) {
      Alert.alert('Gathering request failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreatingGathering(false);
    }
  }, [
    circle?.city,
    circleId,
    creatingGathering,
    gatheringComposerCity,
    gatheringComposerDate,
    gatheringComposerDescription,
    gatheringComposerTime,
    gatheringComposerTitle,
    gatheringComposerType,
    gatheringComposerVenue,
    loadCircle,
    profile,
  ]);

  const openPromptAnswer = useCallback((prompt: CirclePrompt) => {
    setPromptTarget(prompt);
    setPromptAnswer('');
    setPromptAnswerOpen(true);
  }, []);

  const handleSubmitPromptAnswer = useCallback(async () => {
    if (!promptTarget?.id) return;
    const body = promptAnswer.trim();
    if (!body) {
      Alert.alert('Circle Prompt', 'Add your answer first.');
      return;
    }
    const { error } = await db.rpc('rpc_answer_circle_prompt', {
      p_prompt_id: promptTarget.id,
      p_response: body,
    });
    if (error) {
      Alert.alert('Circle Prompt', error.message || 'Please try again.');
      return;
    }
    setPromptAnswerOpen(false);
    setPromptTarget(null);
    setPromptAnswer('');
    Alert.alert('Answer shared', 'Your answer has been shared with the Circle.');
  }, [promptAnswer, promptTarget?.id]);

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

  const availableGistPerspectives = [...new Set(gists.map((item) => String(item.perspective ?? 'general').toLowerCase()))];
  const gist = gists.find((item) => item.circle_id === circleId && String(item.perspective ?? 'general').toLowerCase() === gistPerspective)
    ?? gists.find((item) => !item.circle_id && String(item.perspective ?? 'general').toLowerCase() === gistPerspective)
    ?? gists.find((item) => item.circle_id === circleId && item.perspective === 'general')
    ?? gists.find((item) => item.perspective === 'general')
    ?? gists[0]
    ?? null;
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
    if (item.mediaUrl || item.imageUrl) {
      setPulseMediaTarget(item);
      return;
    }
    Alert.alert('Circle media', 'This spotlight is not available in the media viewer yet.');
  }, [moments, openPulseMomentViewer]);

  const handleEndLoveSeat = useCallback((item: CirclePulseItem) => {
    if (!item.loveSeatId || !currentProfileId) return;
    Alert.alert('End Love Seat?', 'This spotlight will leave Circle Pulse immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End feature',
        style: 'destructive',
        onPress: () => {
          void endCircleLoveSeat(item.loveSeatId!, currentProfileId)
            .then(() => reloadPulse())
            .catch((error) => Alert.alert('Love Seat', error instanceof Error ? error.message : 'Could not end this feature right now.'));
        },
      },
    ]);
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
      Alert.alert('Moment feed check', String(error.message || error));
      return;
    }
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    const activeCount = profiles.reduce((total: number, item: any) => total + Number(item.active_moment_count ?? 0), 0);
    const visibleCount = profiles.reduce((total: number, item: any) => total + Number(item.circle_visible_moment_count ?? 0), 0);
    logger.warn('[circles] member_moments_manual_check', { circleId, diagnostics: data });
    Alert.alert(
      'Moment feed check',
      activeCount === 0
        ? 'No active Moment rows were found for visible Circle members.'
        : visibleCount === 0
          ? `${activeCount} active Moment row${activeCount === 1 ? '' : 's'} found, but none are currently eligible for this Circle feed.`
          : `${visibleCount} eligible Moment row${visibleCount === 1 ? '' : 's'} found. Apply the latest Circle migration, then refresh this screen.`,
    );
    if (visibleCount > 0) {
      void refreshCircleMoments();
    }
  }, [circleId, refreshCircleMoments]);

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
    return (
      <View style={styles.memberCard}>
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
          <Text style={styles.memberName}>
            {member.full_name ?? 'Member'}{member.age ? `, ${member.age}` : ''}
          </Text>
          <Text style={styles.memberMeta}>{member.city || member.region || member.location || 'Location hidden'}</Text>
          <View style={styles.memberBadges}>
            {isNewMember ? (
              <View style={styles.memberPillNew}>
                <Text style={styles.memberPillNewText}>New</Text>
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
              <TouchableOpacity style={styles.primaryButton} onPress={() => openIntentSheet(member.id, member.full_name)}>
                <Text style={styles.primaryText}>Request</Text>
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
    return (
      <View key={item.id} style={[styles.leadCard, expanded && styles.leadCardExpanded]}>
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
              <Text style={styles.memberName}>
                {member.full_name ?? 'Circle leader'}{member.age ? `, ${member.age}` : ''}
              </Text>
              <Text style={styles.memberMeta}>{joinMeta([getLeaderRoleLabel(item.role), member.city || member.region || member.location])}</Text>
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
            <TouchableOpacity style={styles.primaryButton} onPress={() => openIntentSheet(member.id, member.full_name)}>
              <Text style={styles.primaryText}>{item.role === 'matchmaker' ? 'Ask intro' : 'Request'}</Text>
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
          <View style={styles.featureCardTop}>
            <Text style={styles.kicker}>{getMomentKindLabel(moment.type)}</Text>
            <Text style={styles.featureMetaPill}>{compactDate(moment.created_at)}</Text>
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

        <CirclePulseBoard
          items={pulseItems}
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
          onOpenComments={setPulseCommentTarget}
          viewerProfileId={currentProfileId}
          onOpenFeaturedProfile={openProfile}
          onSendSignal={openIntentSheet}
          onEndLoveSeat={handleEndLoveSeat}
        />

        <View style={styles.trustSection}>
          <View style={styles.trustHeader}>
            <View style={styles.trustCopy}>
              <Text style={styles.heroTitle}>Trusted community space for intentional connection.</Text>
              <Text style={styles.heroSubcopy}>
                {circle?.short_description || circle?.description || 'Belong, discover, and connect through trusted shared context.'}
              </Text>
            </View>
            {isMember ? (
              <TouchableOpacity accessibilityLabel="Invite to Circle" style={styles.inviteButton} onPress={handleInvite}>
                <MaterialCommunityIcons name="account-plus-outline" size={16} color={theme.tint} />
                <Text style={styles.inviteText}>Invite</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, styles.statIconMembers]}><MaterialCommunityIcons name="account-group-outline" size={18} color={theme.tint} /></View>
              <View><Text style={styles.statValue}>{circle?.member_count ?? members.length}</Text><Text style={styles.statLabel}>Members</Text></View>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, styles.statIconPrompts]}><MaterialCommunityIcons name="message-text-outline" size={18} color={theme.accent} /></View>
              <View><Text style={styles.statValue}>{prompts.length}</Text><Text style={styles.statLabel}>Prompts</Text></View>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, styles.statIconGatherings]}><MaterialCommunityIcons name="calendar-check-outline" size={18} color={theme.secondary} /></View>
              <View><Text style={styles.statValue}>{gatherings.length}</Text><Text style={styles.statLabel}>Gatherings</Text></View>
            </View>
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

        {canReviewMembers && pendingMembers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending requests</Text>
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
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {[
            ['overview', 'Overview'],
            ['members', `Members (${members.length})`],
            ['prompts', `Prompts (${prompts.length})`],
            ['gatherings', `Gatherings (${gatherings.length})`],
            ['moments', `Moments (${moments.length})`],
            ['gist', 'Gist'],
          ].map(([key, label]) => {
            const active = activeTab === key;
            return (
              <Pressable key={key} style={[styles.tabButton, active && styles.tabButtonActive]} onPress={() => setActiveTab(key as DetailTab)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeTab === 'overview' ? (
          <View style={styles.section}>
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
          </View>
        ) : null}

        {activeTab === 'prompts' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLead}>Questions that help members reveal values, intent, and emotional clarity.</Text>
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
                    <TouchableOpacity style={styles.primaryButton} onPress={openPromptComposer}>
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
            <Text style={styles.sectionLead}>Curated ways to meet beyond chat, with stronger trust and better context.</Text>
            {gatherings.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="calendar-heart" size={24} color={theme.tint} />
                </View>
                <Text style={styles.emptyTitle}>No approved Gatherings yet</Text>
                <Text style={styles.emptyHint}>When hosts schedule trusted events, they will appear here with safety context and RSVP actions.</Text>
                {canHostGathering ? (
                  <View style={styles.inlineActions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={openGatheringComposer}>
                      <Text style={styles.primaryText}>Host Gathering</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}
            {gatherings.map((gathering) => (
              <LinearGradient key={gathering.id} colors={['rgba(139,92,255,0.14)', 'rgba(7,30,34,0.94)']} style={styles.featureCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.kicker}>{gathering.gathering_type ?? 'Gathering'}</Text>
                  <Text style={styles.featureMetaPill}>{gathering.attendee_count ?? 0} attending</Text>
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
            ))}
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
                    <TouchableOpacity style={styles.ghostButton} onPress={() => void loadCircle()}>
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

        {activeTab === 'gist' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLead}>Editorial guidance that helps this Circle stay intentional, not just active.</Text>
            {availableGistPerspectives.length > 1 ? (
              <View style={styles.roleSummaryRow}>
                {availableGistPerspectives.map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.roleSummaryPill, gistPerspective === item && styles.roleSummaryPillAccent]}
                    onPress={() => setGistPerspective(item)}
                  >
                    <Text style={gistPerspective === item ? styles.roleSummaryTextAccent : styles.roleSummaryText}>
                      {item === 'general' ? 'General' : item[0].toUpperCase() + item.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {gist ? (
              <LinearGradient colors={['rgba(244,232,208,0.08)', 'rgba(7,30,34,0.96)']} style={styles.featureCard}>
                <View style={styles.featureCardTop}>
                  <Text style={styles.kicker}>Relationship Gist</Text>
                  <Text style={styles.featureMetaPill}>{gist.perspective ?? 'general'}</Text>
                </View>
                <Text style={styles.featureTitle}>{gist.title}</Text>
                <Text style={styles.featureBody}>{gist.short_body || gist.body}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={24} color={theme.tint} />
                </View>
                <Text style={styles.emptyTitle}>No Relationship Gist yet</Text>
                <Text style={styles.emptyHint}>When Betweener publishes guidance shaped for this Circle, it will appear here.</Text>
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

      <Modal visible={promptComposerOpen} transparent animationType="fade" onRequestClose={() => setPromptComposerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPromptComposerOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>Create Circle Prompt</Text>
                <Text style={styles.modalBody}>Publish a prompt that helps members reveal values, intent, and emotional clarity.</Text>
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
                  <TouchableOpacity style={styles.ghostButton} onPress={() => setPromptComposerOpen(false)}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={publishingPrompt} onPress={handlePublishPrompt}>
                    <Text style={styles.primaryText}>{publishingPrompt ? 'Publishing' : 'Publish prompt'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={gatheringComposerOpen} transparent animationType="fade" onRequestClose={() => setGatheringComposerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGatheringComposerOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>Host Gathering</Text>
                <Text style={styles.modalBody}>Propose a trusted Gathering directly from this Circle.</Text>
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
                <View style={styles.rowInputs}>
                  <TextInput value={gatheringComposerDate} onChangeText={setGatheringComposerDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textMuted} style={[styles.inlineInput, styles.rowInput]} />
                  <TextInput value={gatheringComposerTime} onChangeText={setGatheringComposerTime} placeholder="HH:MM" placeholderTextColor={theme.textMuted} style={[styles.inlineInput, styles.rowInput]} />
                </View>
                <TextInput value={gatheringComposerCity} onChangeText={setGatheringComposerCity} placeholder="City" placeholderTextColor={theme.textMuted} style={styles.inlineInput} />
                {gatheringComposerType !== 'online' ? (
                  <TextInput value={gatheringComposerVenue} onChangeText={setGatheringComposerVenue} placeholder="Venue name" placeholderTextColor={theme.textMuted} style={styles.inlineInput} />
                ) : null}
                <View style={styles.inlineActions}>
                  <TouchableOpacity style={styles.ghostButton} onPress={() => setGatheringComposerOpen(false)}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={creatingGathering} onPress={handleCreateGathering}>
                    <Text style={styles.primaryText}>{creatingGathering ? 'Submitting' : 'Submit Gathering'}</Text>
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
        onClose={() => setPulseCommentTarget(null)}
        onOpenProfile={openProfile}
        onCommentsChanged={reloadPulse}
      />
      <CirclePulseMediaViewer
        visible={!!pulseMediaTarget}
        item={pulseMediaTarget}
        onClose={() => setPulseMediaTarget(null)}
        onOpenComments={setPulseCommentTarget}
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
    trustSection: { gap: 15, paddingHorizontal: 4, paddingVertical: 2 },
    trustHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    trustCopy: { flex: 1, gap: 5 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    trustBadge: {
      alignSelf: 'flex-start',
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      color: theme.tint,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.1),
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    heroTitle: { color: theme.text, fontSize: 20, lineHeight: 25, fontFamily: 'PlayfairDisplay_700Bold' },
    heroSubcopy: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
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
    statsRow: { flexDirection: 'row', gap: 8 },
    statCard: {
      flex: 1,
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 15,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.42 : 0.76),
    },
    statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    statIconMembers: { backgroundColor: withAlpha(theme.tint, isDark ? 0.18 : 0.1) },
    statIconPrompts: { backgroundColor: withAlpha(theme.accent, isDark ? 0.2 : 0.12) },
    statIconGatherings: { backgroundColor: withAlpha(theme.secondary, isDark ? 0.18 : 0.12) },
    statValue: { color: theme.text, fontSize: 18, lineHeight: 20, fontFamily: 'PlayfairDisplay_700Bold' },
    statLabel: { marginTop: 2, color: theme.textMuted, fontSize: 11, fontWeight: '700' },
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
      gap: 4,
      padding: 5,
      paddingRight: 18,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.5 : 0.84),
    },
    tabButton: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
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
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.88 : 0.96),
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
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
    memberContent: { flex: 1, gap: 4 },
    memberName: { fontSize: 14, fontWeight: '800', color: theme.text },
    memberMeta: { fontSize: 12, color: theme.textMuted },
    memberBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
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
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.88 : 0.96),
    },
    momentPreview: { width: '100%', height: 142, backgroundColor: theme.backgroundSubtle },
    momentFallback: { width: '100%', height: 142, alignItems: 'center', justifyContent: 'center' },
    momentTextPanel: { width: '100%', minHeight: 142, padding: 16, justifyContent: 'flex-end' },
    momentTextPreview: { color: '#F4E8D0', fontSize: 18, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
    momentCopy: { padding: 14, gap: 6 },
    momentTitle: { color: theme.text, fontSize: 15, fontWeight: '800' },
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
