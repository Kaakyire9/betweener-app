import {
  CircleHeroCard,
  CirclePickCard,
  CircleStoryCard,
  FeaturedSlotCard,
  RelationshipGistCard,
} from '@/components/circles/CirclesHomeCards';
import CircleInvitationInbox from '@/components/circles/CircleInvitationInbox';
import { showBetweenerAlert } from '@/components/ui/BetweenerAlertHost';
import Notice from '@/components/ui/Notice';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { CirclesLiveGateway } from '@/features/live/components/index.ts';
import { useLiveSessions } from '@/features/live/hooks/index.ts';
import { getCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import { canCreateCircle, canCreateGathering, type CircleAccessEntitlements } from '@/lib/circles/circle-access';
import {
  type CircleDiscoveryScope,
  sortCirclesByRelevance,
} from '@/lib/circles/circle-localization';
import { getCircleLocationAffinity } from '@/lib/location/location-intelligence';
import {
  buildCirclesHubSnapshotStoreKey,
  type CirclesHubSnapshot,
  migrateLegacyCirclesHubSnapshot,
  readCirclesHubSnapshotState,
  writeCirclesHubSnapshot,
} from '@/lib/offline/circles-store';
import { resolveOfflineImageUri } from '@/lib/offline/image-store';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import {
  clampRelationshipGistProgress,
  getDefaultRelationshipGistLocalState,
  type RelationshipGistLocalStateMap,
  readRelationshipGistLocalState,
  writeRelationshipGistLocalState,
} from '@/lib/relationship-gists/local-state';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  type GestureResponderEvent,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CircleV2 = {
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
  diaspora_tags?: string[] | null;
  culture_tags?: string[] | null;
  faith_tags?: string[] | null;
  interest_tags?: string[] | null;
  audience_tags?: string[] | null;
  is_official?: boolean | null;
  is_partner?: boolean | null;
  is_featured?: boolean | null;
  requires_join_approval?: boolean | null;
  member_count?: number | null;
  active_this_week_count?: number | null;
  gathering_count?: number | null;
  archived_at?: string | null;
  rejected_reason?: string | null;
  created_at?: string | null;
  location_insight?: string | null;
  location_insight_hydrated?: boolean | null;
};

type CircleMembership = {
  id: string;
  circle_id: string;
  role: string;
  status: string;
  circles?: CircleV2 | null;
};

type CirclePrompt = {
  id: string;
  circle_id?: string | null;
  title: string;
  prompt: string;
  prompt_type?: string | null;
};

type Gathering = {
  id: string;
  circle_id?: string | null;
  title: string;
  description?: string | null;
  poster_url?: string | null;
  starts_at: string;
  city?: string | null;
  country_code?: string | null;
  gathering_type?: string | null;
  presentation_mode?: 'general' | 'seat_linked' | null;
  featured_profile_id?: string | null;
  featured_profile?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    city?: string | null;
    region?: string | null;
  } | null;
  seat_context?: 'welcome' | 'love' | null;
  host_created_for_member?: boolean | null;
  status?: string | null;
  venue_name?: string | null;
  is_partner_venue?: boolean | null;
  safe_first_date_space?: boolean | null;
  attendee_count?: number | null;
  rejected_reason?: string | null;
  created_at?: string | null;
};

type RelationshipGist = {
  id: string;
  title: string;
  short_body?: string | null;
  body: string;
  perspective?: string | null;
  circle_id?: string | null;
};

type WarmIntro = {
  id: string;
  circle_id?: string | null;
  profile_a_id: string;
  profile_b_id: string;
  reason: string;
  shared_context?: string[] | null;
};

type CirclePick = {
  profile_id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  reason: string;
  circleName: string;
};

type CircleMemberPreview = {
  profile_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

type GistLensMenuAnchor = {
  left: number;
  top: number;
};

type GistLensPickerContext = 'preview' | 'reader' | null;

const db = supabase as any;

const SCOPES: { key: CircleDiscoveryScope; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'near_me', label: 'Near me', icon: 'map-marker-radius-outline' },
  { key: 'my_country', label: 'My country', icon: 'flag-outline' },
  { key: 'diaspora', label: 'Diaspora', icon: 'earth' },
  { key: 'global', label: 'Global', icon: 'web' },
];

const GIST_PERSPECTIVES = ['general', 'christian', 'muslim', 'culture', 'safety', 'communication'] as const;

const getPreferredGistPerspective = (religion?: string | null) => {
  const normalized = String(religion ?? '').trim().toUpperCase();
  if (normalized === 'CHRISTIAN') return 'christian';
  if (normalized === 'MUSLIM') return 'muslim';
  return 'general';
};

const getEligibleGistPerspectiveOrder = (religion?: string | null) => {
  const preferred = getPreferredGistPerspective(religion);
  if (preferred === 'christian') return ['christian', 'general', 'culture', 'safety'] as const;
  if (preferred === 'muslim') return ['muslim', 'general', 'culture', 'safety'] as const;
  return ['general', 'culture', 'safety', 'communication'] as const;
};

const buildVisibleGistPerspectives = (
  available: string[],
  religion?: string | null,
) => {
  const eligible = getEligibleGistPerspectiveOrder(religion);
  const eligibleAvailable = eligible.filter((item) => available.includes(item));
  if (eligibleAvailable.length) return eligibleAvailable;
  if (available.includes('general')) return ['general'];
  return available.slice(0, 1);
};

const buildGistSelectionOrder = (
  selectedPerspective: string,
  religion?: string | null,
) => {
  const eligible = getEligibleGistPerspectiveOrder(religion);
  return Array.from(new Set([selectedPerspective, ...eligible, 'general', 'culture', 'safety', 'communication']));
};

const getGistPerspectiveLabel = (value?: string | null) => {
  const normalized = String(value ?? 'general').toLowerCase();
  return normalized === 'general' ? 'General' : normalized[0].toUpperCase() + normalized.slice(1);
};

const getGistPerspectiveIcon = (value?: string | null): keyof typeof MaterialCommunityIcons.glyphMap => {
  switch (String(value ?? 'general').toLowerCase()) {
    case 'christian':
      return 'cross';
    case 'muslim':
      return 'star-crescent';
    case 'culture':
      return 'flower-pollen-outline';
    case 'safety':
      return 'shield-check-outline';
    case 'communication':
      return 'message-text-outline';
    default:
      return 'earth';
  }
};

const getGistLensSupport = (value?: string | null) => {
  switch (String(value ?? 'general').toLowerCase()) {
    case 'christian':
      return 'Read this through a Christian lens that values clarity, character, and consistency.';
    case 'muslim':
      return 'Read this through a Muslim lens that values intention, adab, and emotional steadiness.';
    case 'culture':
      return 'Read this through a cultural lens that respects family context, timing, and shared norms.';
    case 'safety':
      return 'Read this through a safety lens that centers boundaries, pacing, and emotional protection.';
    case 'communication':
      return 'Read this through a communication lens that favors directness, listening, and consistency.';
    default:
      return 'Read this as broad relationship guidance designed to protect clarity before attachment deepens.';
  }
};

const normalizeCircle = (input: CircleV2 | CircleV2[] | null | undefined): CircleV2 | null => {
  if (!input) return null;
  return Array.isArray(input) ? (input[0] ?? null) : input;
};

const isBinaryOppositeGenderMatch = (viewerGender: unknown, candidateGender: unknown) => {
  const normalizedViewerGender = typeof viewerGender === 'string' ? viewerGender.toUpperCase() : null;
  const normalizedCandidateGender = typeof candidateGender === 'string' ? candidateGender.toUpperCase() : null;
  if (
    normalizedViewerGender !== 'MALE'
    && normalizedViewerGender !== 'FEMALE'
  ) {
    return true;
  }
  if (
    normalizedCandidateGender !== 'MALE'
    && normalizedCandidateGender !== 'FEMALE'
  ) {
    return true;
  }
  return (
    (normalizedViewerGender === 'MALE' && normalizedCandidateGender === 'FEMALE')
    || (normalizedViewerGender === 'FEMALE' && normalizedCandidateGender === 'MALE')
  );
};

const compactDate = (value?: string | null) => {
  if (!value) return 'Soon';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Soon';
  return date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
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

const getGistReadTimeLabel = (gist?: Pick<RelationshipGist, 'short_body' | 'body'> | null) => {
  const text = `${gist?.short_body ?? ''} ${gist?.body ?? ''}`.trim();
  if (!text) return '1 min read';
  const words = text.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 180))} min read`;
};

const normalizeCopy = (value?: string | null) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const splitGistParagraphs = (value?: string | null) =>
  String(value ?? '')
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const buildGistReaderSections = (gist: RelationshipGist | null, perspective: string) => {
  const lead = gist?.short_body?.trim() || gist?.body?.trim() || 'No guidance yet.';
  const paragraphs = splitGistParagraphs(gist?.body);
  const remainingParagraphs = paragraphs.length > 1 && normalizeCopy(paragraphs[0]) === normalizeCopy(gist?.short_body)
    ? paragraphs.slice(1)
    : paragraphs.length === 1 && normalizeCopy(paragraphs[0]) === normalizeCopy(lead)
      ? []
      : paragraphs;
  const sectionTitles = ['What matters first', 'What to notice early', 'What this protects', 'What to carry forward'];
  const sections = remainingParagraphs.map((paragraph, index) => {
    const headingMatch = paragraph.match(/^([^:]{3,56}):\s+(.+)$/s);
    if (headingMatch) {
      return {
        id: `${index}:${headingMatch[1]}`,
        title: headingMatch[1].trim(),
        body: headingMatch[2].trim(),
      };
    }
    return {
      id: `${index}:${paragraph.slice(0, 18)}`,
      title: sectionTitles[index] ?? `Guidance ${index + 1}`,
      body: paragraph,
    };
  });
  const takeaway = sections.length ? sections[sections.length - 1].body : lead;
  return {
    lead,
    sections,
    takeaway,
    framing: getGistLensSupport(perspective),
  };
};

const getGistProgressLabel = (
  state?: { progress?: number | null; lastOpenedAt?: number | null } | null,
) => {
  if (!state?.lastOpenedAt) return null;
  const value = clampRelationshipGistProgress(Number(state.progress ?? 0));
  if (value >= 0.995) return 'Completed';
  if (value <= 0.01) return 'Just opened';
  return `${Math.max(1, Math.round(value * 100))}% read`;
};

const GIST_LENS_DROPDOWN_WIDTH = 236;
const GIST_LENS_DROPDOWN_ITEM_HEIGHT = 52;
const GIST_LENS_DROPDOWN_PADDING = 24;
const CIRCLE_SECTION_PREVIEW_LIMIT = 8;

export default function CirclesScreen() {
  const { profile, user } = useAuth();
  const { sessions: liveSessions, canSchedule: canScheduleLive } = useLiveSessions();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const circlePalette = useMemo(() => getCirclePulsePalette(isDark ? 'dark' : 'light'), [isDark]);
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(profile?.id ?? null);
  const currentProfileId = resolvedProfileId;
  const [scope, setScope] = useState<CircleDiscoveryScope>('my_country');
  const [myCircles, setMyCircles] = useState<CircleMembership[]>([]);
  const [discoverCircles, setDiscoverCircles] = useState<CircleV2[]>([]);
  const [creatorCircles, setCreatorCircles] = useState<CircleV2[]>([]);
  const [creatorGatherings, setCreatorGatherings] = useState<Gathering[]>([]);
  const [prompts, setPrompts] = useState<CirclePrompt[]>([]);
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [gists, setGists] = useState<RelationshipGist[]>([]);
  const [gistPerspective, setGistPerspective] = useState('general');
  const [gistPerspectiveTouched, setGistPerspectiveTouched] = useState(false);
  const [warmIntros, setWarmIntros] = useState<WarmIntro[]>([]);
  const [picks, setPicks] = useState<CirclePick[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [memberPreviewsByCircleId, setMemberPreviewsByCircleId] = useState<Record<string, CircleMemberPreview[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [networkReady, setNetworkReady] = useState(true);
  const [showAllJoinedCircles, setShowAllJoinedCircles] = useState(false);
  const [showAllDiscoverCircles, setShowAllDiscoverCircles] = useState(false);
  const [circlesSnapshotInfo, setCirclesSnapshotInfo] = useState<{
    hasSnapshot: boolean;
    savedAt: number | null;
    isStale: boolean;
  }>({
    hasSnapshot: false,
    savedAt: null,
    isStale: false,
  });
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [gatheringOpen, setGatheringOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingGathering, setCreatingGathering] = useState(false);
  const [premiumState, setPremiumState] = useState<CircleAccessEntitlements | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const [newCity, setNewCity] = useState(profile?.city ?? '');
  const [newScope, setNewScope] = useState<'country' | 'local' | 'diaspora' | 'global' | 'invite_only'>('country');
  const [newGatheringTitle, setNewGatheringTitle] = useState('');
  const [newGatheringDescription, setNewGatheringDescription] = useState('');
  const [newGatheringDate, setNewGatheringDate] = useState('');
  const [newGatheringTime, setNewGatheringTime] = useState('');
  const [newGatheringCity, setNewGatheringCity] = useState(profile?.city ?? '');
  const [newGatheringVenue, setNewGatheringVenue] = useState('');
  const [newGatheringType, setNewGatheringType] = useState<'physical' | 'online' | 'hybrid'>('physical');
  const [newGatheringCircleId, setNewGatheringCircleId] = useState<string | null>(null);
  const [promptAnswerOpen, setPromptAnswerOpen] = useState(false);
  const [promptAnswer, setPromptAnswer] = useState('');
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [gistComposerOpen, setGistComposerOpen] = useState(false);
  const [gistReaderOpen, setGistReaderOpen] = useState(false);
  const [gistLensPickerOpen, setGistLensPickerOpen] = useState(false);
  const [gistLensMenuAnchor, setGistLensMenuAnchor] = useState<GistLensMenuAnchor | null>(null);
  const [gistLensPickerContext, setGistLensPickerContext] = useState<GistLensPickerContext>(null);
  const [gistLocalState, setGistLocalState] = useState<RelationshipGistLocalStateMap>({});
  const [gistTitleDraft, setGistTitleDraft] = useState('');
  const [gistShortBodyDraft, setGistShortBodyDraft] = useState('');
  const [gistBodyDraft, setGistBodyDraft] = useState('');
  const [gistPerspectiveDraft, setGistPerspectiveDraft] = useState<(typeof GIST_PERSPECTIVES)[number]>('general');
  const [creatingGist, setCreatingGist] = useState(false);

  const circlesSnapshotKey = useMemo(
    () => (currentProfileId ? buildCirclesHubSnapshotStoreKey(currentProfileId, scope) : null),
    [currentProfileId, scope],
  );
  const snapshotLoadedRef = useRef<string | null>(null);
  const gistReaderAnim = useRef(new Animated.Value(1)).current;
  const gistLocalStateRef = useRef<RelationshipGistLocalStateMap>({});
  const gistReaderProgressRef = useRef(0);
  const gistReaderProgressSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    void (async () => {
      const [{ data: premium }, { data: admin }] = await Promise.all([
        db.rpc('rpc_get_my_premium_state'),
        db.rpc('is_internal_admin'),
      ]);
      if (cancelled) return;
      setPremiumState(premium ?? null);
      setIsAdmin(admin === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const applyCirclesSnapshot = useCallback((
    snapshot: CirclesHubSnapshot,
    options?: { preserveExisting?: boolean },
  ) => {
    const preserveExisting = options?.preserveExisting === true;
    setMyCircles((prev) => (preserveExisting && prev.length ? prev : (snapshot.myCircles as CircleMembership[]) ?? []));
    setDiscoverCircles((prev) => (
      preserveExisting && prev.length ? prev : (snapshot.discoverCircles as CircleV2[]) ?? []
    ));
    setCreatorCircles((prev) => (
      preserveExisting && prev.length ? prev : (snapshot.creatorCircles as CircleV2[]) ?? []
    ));
    setCreatorGatherings((prev) => (
      preserveExisting && prev.length ? prev : (snapshot.creatorGatherings as Gathering[]) ?? []
    ));
    setPrompts((prev) => (preserveExisting && prev.length ? prev : (snapshot.prompts as CirclePrompt[]) ?? []));
    setGatherings((prev) => (preserveExisting && prev.length ? prev : (snapshot.gatherings as Gathering[]) ?? []));
    setGists((prev) => (preserveExisting && prev.length ? prev : (snapshot.gists as RelationshipGist[]) ?? []));
    setWarmIntros((prev) => (preserveExisting && prev.length ? prev : (snapshot.warmIntros as WarmIntro[]) ?? []));
    setPicks((prev) => (preserveExisting && prev.length ? prev : (snapshot.picks as CirclePick[]) ?? []));
    setImageUrls((prev) => (
      preserveExisting && Object.keys(prev).length ? prev : snapshot.imageUrls ?? {}
    ));
    setMemberPreviewsByCircleId((prev) => (
      preserveExisting && Object.keys(prev).length ? prev : (snapshot.memberPreviewsByCircleId as Record<string, CircleMemberPreview[]>) ?? {}
    ));
  }, []);

  useEffect(() => {
    if (!currentProfileId || !circlesSnapshotKey || snapshotLoadedRef.current === circlesSnapshotKey) return;
    snapshotLoadedRef.current = circlesSnapshotKey;
    let cancelled = false;
    void (async () => {
      const offlineState =
        (await migrateLegacyCirclesHubSnapshot(currentProfileId, scope)) ??
        (await readCirclesHubSnapshotState(currentProfileId, scope));
      if (cancelled) return;
      setCirclesSnapshotInfo({
        hasSnapshot: Boolean(offlineState.data),
        savedAt: offlineState.savedAt,
        isStale: offlineState.isStale,
      });
      if (!offlineState.data) return;
      applyCirclesSnapshot(offlineState.data, { preserveExisting: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCirclesSnapshot, circlesSnapshotKey, currentProfileId, scope]);

  useEffect(() => {
    gistLocalStateRef.current = gistLocalState;
  }, [gistLocalState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readRelationshipGistLocalState(user?.id ?? null);
      if (!cancelled) {
        gistLocalStateRef.current = stored;
        setGistLocalState(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const canSubmitCircle = canCreateCircle(premiumState, {
    id: currentProfileId,
    user_id: user?.id ?? null,
    is_internal_admin: isAdmin,
  });
  const canSubmitGathering = canCreateGathering(premiumState, {
    id: currentProfileId,
    user_id: user?.id ?? null,
    is_internal_admin: isAdmin,
  });

  const refreshImageUrls = useCallback(async (circles: CircleV2[]) => {
    const pairs = await Promise.all(
      circles.map(async (circle) => {
        if (circle.cover_image_url || circle.icon_url) {
          return [circle.id, circle.cover_image_url || circle.icon_url] as const;
        }
        if (!circle.image_path) return [circle.id, null] as const;
        const { data } = await db.storage.from('circle-images').createSignedUrl(circle.image_path, 3600);
        return [circle.id, data?.signedUrl ?? null] as const;
      }),
    );
    const next: Record<string, string> = {};
    pairs.forEach(([id, url]) => {
      if (url) next[id] = url;
    });
    return next;
  }, []);

  const loadCirclePicks = useCallback(async (memberships: CircleMembership[]) => {
    if (!currentProfileId || memberships.length === 0) return [];
    const activeCircleIds = memberships
      .filter((membership) => membership.status === 'active')
      .map((membership) => membership.circle_id);
    if (activeCircleIds.length === 0) return [];

    const { data: suggestionRows, error: suggestionError } = await db.rpc('rpc_get_circle_profile_suggestions', {
      p_profile_id: currentProfileId,
      p_limit: 8,
    });
    if (!suggestionError) {
      const basePicks = ((suggestionRows ?? []) as any[]).slice(0, 3).map((row: any) => ({
        profile_id: String(row.profile_id),
        full_name: row.full_name,
        age: typeof row.age === 'number' ? row.age : null,
        avatar_url: row.avatar_url ?? null,
        circleName: row.circle_name ?? 'Shared Circle',
        reason: row.reason || 'Shared Circle',
      })) as CirclePick[];
      return await Promise.all(basePicks.map(async (pick) => ({
        ...pick,
        avatar_url: await resolveOfflineImageUri(`circle-pick:${pick.profile_id}:${pick.avatar_url ?? 'none'}`, pick.avatar_url),
      })));
    }
    logger.warn('[circles] profile_suggestions_rpc_failed', {
      error: String(suggestionError.message || suggestionError),
    });

    const { data } = await db
      .from('circle_members')
      .select('circle_id,profile_id,circles(name),profiles(id,full_name,age,avatar_url,looking_for,current_country,city,gender)')
      .in('circle_id', activeCircleIds)
      .eq('status', 'active')
      .neq('profile_id', currentProfileId)
      .limit(24);

    const seen = new Set<string>();
    const basePicks = (data ?? [])
      .map((row: any) => {
        const pickedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const pickedCircle = normalizeCircle(row.circles);
        if (!pickedProfile?.id || seen.has(String(pickedProfile.id))) return null;
        if (!isBinaryOppositeGenderMatch(profile?.gender, pickedProfile.gender)) return null;
        seen.add(String(pickedProfile.id));
        const reasonParts = [
          pickedCircle?.name ? 'Shared Circle' : null,
          pickedProfile.looking_for ? 'Intent context' : null,
          pickedProfile.city || pickedProfile.current_country ? 'Location context' : null,
        ].filter(Boolean);
        return {
          profile_id: String(pickedProfile.id),
          full_name: pickedProfile.full_name,
          age: pickedProfile.age,
          avatar_url: pickedProfile.avatar_url,
          circleName: pickedCircle?.name ?? 'Circle',
          reason: reasonParts.join(' · ') || 'Shared values',
        } as CirclePick;
      })
      .filter(Boolean)
      .slice(0, 3) as CirclePick[];
    return await Promise.all(basePicks.map(async (pick) => ({
      ...pick,
      avatar_url: await resolveOfflineImageUri(`circle-pick:${pick.profile_id}:${pick.avatar_url ?? 'none'}`, pick.avatar_url),
    })));
  }, [currentProfileId, profile?.gender]);

  const loadCircleMemberPreviews = useCallback(async (circleIds: string[]) => {
    const visibleCircleIds = [...new Set(circleIds.filter(Boolean))];
    if (visibleCircleIds.length === 0) return {};

    const { data } = await db
      .from('circle_members')
      .select('circle_id,profile_id,profiles(id,full_name,avatar_url)')
      .in('circle_id', visibleCircleIds)
      .eq('status', 'active')
      .eq('is_visible', true)
      .order('joined_at', { ascending: false })
      .limit(Math.max(18, visibleCircleIds.length * 6));

    const previews = (data ?? []).reduce((acc: Record<string, CircleMemberPreview[]>, row: any) => {
      const circleId = String(row.circle_id);
      const pickedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!pickedProfile?.id || !pickedProfile.avatar_url) return acc;
      const existing = acc[circleId] ?? [];
      if (existing.length >= 12 || existing.some((item) => item.profile_id === String(pickedProfile.id))) return acc;
      acc[circleId] = [
        ...existing,
        {
          profile_id: String(pickedProfile.id),
          full_name: pickedProfile.full_name ?? null,
          avatar_url: pickedProfile.avatar_url,
        },
      ];
      return acc;
    }, {} as Record<string, CircleMemberPreview[]>);
    const hydratedEntries = await Promise.all(
      (Object.entries(previews) as [string, CircleMemberPreview[]][]).map(async ([circleId, members]) => ([
        circleId,
        await Promise.all(
          members.map(async (member) => ({
            ...member,
            avatar_url: await resolveOfflineImageUri(
              `circle-member-preview:${circleId}:${member.profile_id}:${member.avatar_url ?? 'none'}`,
              member.avatar_url,
            ),
          })),
        ),
      ] as const)),
    );
    return Object.fromEntries(hydratedEntries) as Record<string, CircleMemberPreview[]>;
  }, []);

  const loadCircles = useCallback(async () => {
    if (!currentProfileId) return;
    setLoading(true);
    setLoadError(null);

    try {
      const netState = await fetchNetInfo().catch(() => null);
      const canUseLiveNetwork = isNetworkConnectionAvailable(netState);
      setNetworkReady(canUseLiveNetwork);

      if (!canUseLiveNetwork) {
        const offlineState =
          (await migrateLegacyCirclesHubSnapshot(currentProfileId, scope)) ??
          (await readCirclesHubSnapshotState(currentProfileId, scope));
        setCirclesSnapshotInfo({
          hasSnapshot: Boolean(offlineState.data),
          savedAt: offlineState.savedAt,
          isStale: offlineState.isStale,
        });
        if (offlineState.data) {
          applyCirclesSnapshot(offlineState.data);
          return;
        }
        setLoadError('Circles need a connection the first time they load on this device.');
        return;
      }

      const membershipsPromise = db
        .from('circle_members')
        .select('id,circle_id,role,status,circles(id,name,slug,description,short_description,visibility,category,created_by_profile_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,diaspora_tags,culture_tags,faith_tags,interest_tags,audience_tags,is_official,is_partner,is_featured,requires_join_approval,member_count,active_this_week_count,gathering_count,archived_at)')
        .eq('profile_id', currentProfileId);

      const circlesPromise = db.rpc('get_ranked_circles_for_profile' as any, {
        p_profile_id: currentProfileId,
        p_scope: scope,
        p_limit: 48,
      });

      const creatorCirclesPromise = db
        .from('circles')
        .select('id,name,slug,description,short_description,visibility,category,created_by_profile_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,diaspora_tags,culture_tags,faith_tags,interest_tags,audience_tags,is_official,is_partner,is_featured,requires_join_approval,member_count,active_this_week_count,gathering_count,archived_at,rejected_reason,created_at')
        .eq('created_by_profile_id', currentProfileId)
        .in('status', ['draft', 'pending_review', 'approved', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(8);

      const promptsPromise = db
        .from('circle_prompts')
        .select('id,circle_id,title,prompt,prompt_type')
        .eq('status', 'published')
        .order('starts_at', { ascending: false, nullsFirst: false })
        .limit(8);

      const gatheringsPromise = db
        .from('gatherings')
        .select('id,circle_id,title,description,poster_url,starts_at,city,country_code,gathering_type,presentation_mode,featured_profile_id,featured_profile:profiles!gatherings_featured_profile_id_fkey(id,full_name,avatar_url,city,region),seat_context,host_created_for_member,is_partner_venue,safe_first_date_space,attendee_count,venue_name')
        .eq('status', 'approved')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(8);

      const creatorGatheringsPromise = db
        .from('gatherings')
        .select('id,circle_id,title,description,starts_at,city,country_code,gathering_type,status,venue_name,is_partner_venue,safe_first_date_space,attendee_count,rejected_reason,created_at')
        .eq('created_by_profile_id', currentProfileId)
        .in('status', ['draft', 'pending_review', 'approved', 'rejected', 'cancelled', 'completed'])
        .order('created_at', { ascending: false })
        .limit(8);

      const gistsPromise = db
        .from('relationship_gists')
        .select('id,title,short_body,body,perspective,circle_id')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(24);

      const warmIntroPromise = db
        .from('warm_introductions')
        .select('id,circle_id,profile_a_id,profile_b_id,reason,shared_context')
        .in('status', ['pending', 'accepted_by_a', 'accepted_by_b'])
        .or(`profile_a_id.eq.${currentProfileId},profile_b_id.eq.${currentProfileId}`)
        .order('created_at', { ascending: false })
        .limit(3);

      const [
        { data: membershipRows, error: membershipError },
        { data: circleRows, error: circlesError },
        { data: creatorCircleRows },
        { data: promptRows },
        { data: gatheringRows },
        { data: creatorGatheringRows },
        { data: gistRows },
        { data: warmIntroRows },
      ] = await Promise.all([
        membershipsPromise,
        circlesPromise,
        creatorCirclesPromise,
        promptsPromise,
        gatheringsPromise,
        creatorGatheringsPromise,
        gistsPromise,
        warmIntroPromise,
      ]);

      if (membershipError) throw membershipError;

      let discoverCircleRows = (circleRows ?? []) as CircleV2[];
      if (circlesError) {
        logger.warn('[circles] ranked_discover_rpc_failed', {
          scope,
          message: circlesError.message,
        });
        const { data: fallbackCircleRows, error: fallbackCirclesError } = await db
          .from('circles')
          .select('id,name,slug,description,short_description,visibility,category,created_by_profile_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,diaspora_tags,culture_tags,faith_tags,interest_tags,audience_tags,is_official,is_partner,is_featured,requires_join_approval,member_count,active_this_week_count,gathering_count,archived_at')
          .eq('status', 'approved')
          .is('archived_at', null)
          .order('is_featured', { ascending: false })
          .order('member_count', { ascending: false })
          .limit(48);
        if (fallbackCirclesError) throw fallbackCirclesError;
        discoverCircleRows = (fallbackCircleRows ?? []) as CircleV2[];
      }

      const affinityCircleIds = new Set<string>();
      for (const row of membershipRows ?? []) {
        const membershipCircle = normalizeCircle((row as any)?.circles);
        if (membershipCircle?.id) affinityCircleIds.add(String(membershipCircle.id));
      }
      for (const circle of (creatorCircleRows ?? []) as CircleV2[]) {
        if (circle?.id) affinityCircleIds.add(String(circle.id));
      }
      if (circlesError) {
        for (const circle of discoverCircleRows) {
          if (circle?.id) affinityCircleIds.add(String(circle.id));
        }
      }

      const circleAffinityMap: Record<string, string | null> = {};
      let circleAffinityHydrated = false;
      if (currentProfileId && affinityCircleIds.size > 0) {
        const { data: circleAffinityRows, error: circleAffinityError } = await db.rpc(
          'get_circle_location_affinities' as any,
          {
            p_profile_id: currentProfileId,
            p_circle_ids: Array.from(affinityCircleIds),
            p_scope: scope,
          },
        );
        if (circleAffinityError) {
          logger.warn('[circles] circle_affinity_bulk_rpc_failed', {
            scope,
            message: circleAffinityError.message,
          });
        } else if (Array.isArray(circleAffinityRows)) {
          circleAffinityHydrated = true;
          for (const row of circleAffinityRows as any[]) {
            const circleId = String(row.circle_id ?? '').trim();
            if (!circleId) continue;
            circleAffinityMap[circleId] =
              typeof row.short_text === 'string' ? row.short_text : null;
          }
        }
      }

      const decorateCircleWithLocationInsight = (
        circle: CircleV2,
        options?: { allowClientFallback?: boolean },
      ): CircleV2 => ({
        ...circle,
        location_insight_hydrated:
          circle.location_insight_hydrated ?? (circle.location_insight != null || circleAffinityHydrated),
        location_insight:
          circle.location_insight
          ?? circleAffinityMap[String(circle.id)] ?? (
            options?.allowClientFallback === false
              ? null
              : getCircleLocationAffinity(circle, profile as any, scope)?.shortText ?? null
          ),
      });

      const memberships: CircleMembership[] = (membershipRows ?? []).map((row: any) => ({
        id: String(row.id),
        circle_id: String(row.circle_id),
        role: String(row.role),
        status: String(row.status),
        circles: row.circles
          ? decorateCircleWithLocationInsight(normalizeCircle(row.circles), {
              allowClientFallback: !circleAffinityHydrated,
            })
          : null,
      }));
      const joinedIds = new Set(memberships.map((membership) => membership.circle_id));
      const visibleCircles = discoverCircleRows.filter((circle) => !joinedIds.has(String(circle.id)));
      const sortedDiscover = circlesError
        ? sortCirclesByRelevance<CircleV2>(
          visibleCircles,
          profile as any,
          scope,
        ).filter((circle) => {
          if (scope === 'global') return true;
          if (scope === 'diaspora') return circle.visibility_scope === 'diaspora' || (circle.diaspora_tags?.length ?? 0) > 0;
          const userCountry = String((profile as any)?.current_country_code ?? '').toUpperCase();
          const matchesCountry = !circle.country_code || !userCountry || String(circle.country_code).toUpperCase() === userCountry;
          if (!matchesCountry && circle.visibility_scope !== 'global') return false;
          if (scope !== 'near_me' || circle.visibility_scope === 'global') return true;
          const userCity = String((profile as any)?.city ?? '').trim().toLowerCase();
          return !circle.city || !userCity || String(circle.city).trim().toLowerCase() === userCity;
        }).map((circle) => decorateCircleWithLocationInsight(circle))
        : visibleCircles.map((circle) =>
          decorateCircleWithLocationInsight(circle, { allowClientFallback: false }));

      const allCircles = [
        ...memberships.map((membership) => membership.circles).filter(Boolean) as CircleV2[],
        ...sortedDiscover,
      ];
      const [nextPicks, nextImages, nextMemberPreviews] = await Promise.all([
        loadCirclePicks(memberships),
        refreshImageUrls(allCircles),
        loadCircleMemberPreviews(allCircles.map((circle) => circle.id)),
      ]);

      setMyCircles(memberships);
      setDiscoverCircles(sortedDiscover);
      setCreatorCircles(
        ((creatorCircleRows ?? []) as CircleV2[]).map((circle) =>
          decorateCircleWithLocationInsight(circle, {
            allowClientFallback: !circleAffinityHydrated,
          })),
      );
      setCreatorGatherings((creatorGatheringRows ?? []) as Gathering[]);
      setPrompts((promptRows ?? []) as CirclePrompt[]);
      setGatherings((gatheringRows ?? []) as Gathering[]);
      const globalGists = ((gistRows ?? []) as RelationshipGist[]).filter((item) => !item.circle_id);
      setGists(globalGists);
      setWarmIntros((warmIntroRows ?? []) as WarmIntro[]);
      setPicks(nextPicks);
      setImageUrls(nextImages);
      setMemberPreviewsByCircleId(nextMemberPreviews);
      setCirclesSnapshotInfo({
        hasSnapshot: true,
        savedAt: Date.now(),
        isStale: false,
      });

      void writeCirclesHubSnapshot(currentProfileId, scope, {
        myCircles: memberships,
        discoverCircles: sortedDiscover,
        creatorCircles: ((creatorCircleRows ?? []) as CircleV2[]).map((circle) =>
          decorateCircleWithLocationInsight(circle, {
            allowClientFallback: !circleAffinityHydrated,
          })),
        creatorGatherings: (creatorGatheringRows ?? []) as Gathering[],
        prompts: (promptRows ?? []) as CirclePrompt[],
        gatherings: (gatheringRows ?? []) as Gathering[],
        gists: globalGists,
        warmIntros: (warmIntroRows ?? []) as WarmIntro[],
        picks: nextPicks,
        imageUrls: nextImages,
        memberPreviewsByCircleId: nextMemberPreviews,
      });
    } catch (error) {
      const offlineState =
        (await migrateLegacyCirclesHubSnapshot(currentProfileId, scope)) ??
        (await readCirclesHubSnapshotState(currentProfileId, scope));
      setCirclesSnapshotInfo({
        hasSnapshot: Boolean(offlineState.data),
        savedAt: offlineState.savedAt,
        isStale: offlineState.isStale,
      });
      if (offlineState.data) {
        applyCirclesSnapshot(offlineState.data);
      }
      setLoadError(error instanceof Error ? error.message : 'Could not load Circles.');
    } finally {
      setLoading(false);
    }
  }, [applyCirclesSnapshot, currentProfileId, loadCircleMemberPreviews, loadCirclePicks, profile, refreshImageUrls, scope]);

  useFocusEffect(
    useCallback(() => {
      void loadCircles();
    }, [loadCircles]),
  );

  const openCircle = useCallback((circleId?: string | null) => {
    if (!circleId) return;
    router.push({ pathname: '/circles/[id]', params: { id: String(circleId) } });
  }, []);

  const handleCreatePress = useCallback(() => {
    if (!canSubmitCircle) {
      setPaywallOpen(true);
      return;
    }
    setNewName('');
    setNewPurpose('');
    setNewCity(profile?.city ?? '');
    setNewScope('country');
    setCreateOpen(true);
  }, [canSubmitCircle, profile?.city]);

  const handleCreateGatheringPress = useCallback(() => {
    if (!canSubmitGathering) {
      setPaywallOpen(true);
      return;
    }
    setNewGatheringTitle('');
    setNewGatheringDescription('');
    setNewGatheringDate('');
    setNewGatheringTime('');
    setNewGatheringCity(profile?.city ?? '');
    setNewGatheringVenue('');
    setNewGatheringType('physical');
    setNewGatheringCircleId(creatorCircles.find((circle) => circle.status === 'approved')?.id ?? null);
    setGatheringOpen(true);
  }, [canSubmitGathering, creatorCircles, profile?.city]);

  const handleSubmitCircle = useCallback(async () => {
    Keyboard.dismiss();
    const name = newName.trim();
    const purpose = newPurpose.trim();
    if (!name || name.length < 3) {
      showBetweenerAlert({
        title: 'Circle name',
        message: 'Add a clear Circle name.',
        tone: 'warning',
      });
      return;
    }
    if (!purpose || purpose.length < 10) {
      showBetweenerAlert({
        title: 'Circle purpose',
        message: 'Add a short purpose so Betweener can review it.',
        tone: 'warning',
      });
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const { data, error } = await db.rpc('rpc_create_circle_request', {
        p_name: name,
        p_description: purpose,
        p_short_description: purpose.slice(0, 140),
        p_circle_type: isAdmin ? 'official' : 'gold_community',
        p_visibility_scope: newScope,
        p_country_code: (profile as any)?.current_country_code ?? null,
        p_country_name: (profile as any)?.current_country ?? null,
        p_region: (profile as any)?.region ?? null,
        p_city: newCity.trim() || ((profile as any)?.city ?? null),
        p_diaspora_tags: [],
        p_culture_tags: [],
        p_faith_tags: [],
        p_interest_tags: [],
        p_audience_tags: [],
        p_requires_join_approval: newScope === 'invite_only',
        p_rules: null,
      });
      if (error) throw error;
      setCreateOpen(false);
      setNewName('');
      setNewPurpose('');
      await loadCircles();
      if (data?.id) {
        showBetweenerAlert({
          title: isAdmin ? 'Circle published' : 'Submitted for review',
          message: isAdmin ? 'Your official Circle is live.' : "We'll notify you once Betweener approves it.",
          tone: 'success',
        });
      }
    } catch (error) {
      showBetweenerAlert({
        title: 'Circle request failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setCreating(false);
    }
  }, [creating, isAdmin, loadCircles, newCity, newName, newPurpose, newScope, profile]);

  const handleSubmitGathering = useCallback(async () => {
    Keyboard.dismiss();
    const title = newGatheringTitle.trim();
    const description = newGatheringDescription.trim();
    const datePart = newGatheringDate.trim();
    const timePart = newGatheringTime.trim();
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
        message: 'Add a short description so Betweener can review it.',
        tone: 'warning',
      });
      return;
    }
    if (!datePart || !timePart) {
      showBetweenerAlert({
        title: 'Start time',
        message: 'Add a valid date and time.',
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
    if (creatingGathering) return;
    setCreatingGathering(true);
    try {
      const { data, error } = await db.rpc('rpc_create_gathering_request', {
        p_circle_id: newGatheringCircleId,
        p_title: title,
        p_description: description,
        p_gathering_type: newGatheringType,
        p_country_code: (profile as any)?.current_country_code ?? null,
        p_country_name: (profile as any)?.current_country ?? null,
        p_region: (profile as any)?.region ?? null,
        p_city: newGatheringCity.trim() || ((profile as any)?.city ?? null),
        p_venue_name: newGatheringVenue.trim() || null,
        p_address_visibility: newGatheringType === 'online' ? 'hidden' : 'attendees_only',
        p_starts_at: startsAt.toISOString(),
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        p_tags: [],
      });
      if (error) throw error;
      setGatheringOpen(false);
      setNewGatheringTitle('');
      setNewGatheringDescription('');
      setNewGatheringDate('');
      setNewGatheringTime('');
      setNewGatheringCity(profile?.city ?? '');
      setNewGatheringVenue('');
      setNewGatheringType('physical');
      setNewGatheringCircleId(null);
      await loadCircles();
      if (data?.id) {
        showBetweenerAlert({
          title: isAdmin ? 'Gathering published' : 'Submitted for review',
          message: isAdmin ? 'Your Gathering is live.' : "We'll notify you once Betweener approves it.",
          tone: 'success',
        });
      }
    } catch (error) {
      showBetweenerAlert({
        title: 'Gathering request failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setCreatingGathering(false);
    }
  }, [
    creatingGathering,
    isAdmin,
    loadCircles,
    newGatheringCircleId,
    newGatheringCity,
    newGatheringDate,
    newGatheringDescription,
    newGatheringTime,
    newGatheringTitle,
    newGatheringType,
    newGatheringVenue,
    profile,
  ]);

  const handleJoin = useCallback(async (circle: CircleV2) => {
    if (!currentProfileId) return;
    try {
      const { error } = await db.rpc('rpc_join_circle', {
        p_circle_id: circle.id,
        p_profile_id: currentProfileId,
      });
      if (error) throw error;
      await loadCircles();
      const requiresApproval = circle.requires_join_approval === true || circle.visibility === 'private';
      showBetweenerAlert({
        title: requiresApproval ? 'Request sent' : 'Circle joined',
        message: requiresApproval
          ? `Your request to join ${circle.name} is now with the Circle hosts for approval.`
          : `${circle.name} is now in your Circles. Betweener will keep the vibe close.`,
        tone: 'success',
      });
    } catch (error) {
      showBetweenerAlert({
        title: 'Join failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  }, [currentProfileId, loadCircles]);

  const handleAttend = useCallback(async (gathering?: Gathering | null) => {
    if (!gathering?.id) return;
    try {
      const { error } = await db.rpc('rpc_attend_gathering', {
        p_gathering_id: gathering.id,
        p_status: 'attending',
        p_visible_to_others: false,
      });
      if (error) throw error;
      showBetweenerAlert({
        title: 'You are attending',
        message: 'We will keep this Gathering saved for you.',
        tone: 'success',
      });
      await loadCircles();
    } catch (error) {
      showBetweenerAlert({
        title: 'Attend failed',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  }, [loadCircles]);

  const handleAddGatheringToCalendar = useCallback(async (gathering?: Gathering | null) => {
    if (!gathering) return;
    if (Platform.OS === 'web') {
      showBetweenerAlert({
        title: 'Add to Calendar',
        message: 'Calendar saving is available in the iOS and Android app.',
        tone: 'info',
      });
      return;
    }

    try {
      const startDate = new Date(gathering.starts_at);
      if (Number.isNaN(startDate.getTime())) {
        showBetweenerAlert({
          title: 'Add to Calendar',
          message: 'This Gathering does not have a valid start time yet.',
          tone: 'warning',
        });
        return;
      }

      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 2);

      const noteParts = [
        gathering.description?.trim() || null,
        gathering.safe_first_date_space ? 'Safe first-date space' : null,
        gathering.is_partner_venue ? 'Hosted at a partner venue' : null,
      ].filter(Boolean);

      await Calendar.createEventInCalendarAsync({
        title: gathering.title,
        startDate,
        endDate,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: [gathering.venue_name, gathering.city].filter(Boolean).join(', ') || undefined,
        notes: noteParts.length ? noteParts.join('\n\n') : undefined,
      });
    } catch (error: any) {
      showBetweenerAlert({
        title: 'Add to Calendar',
        message: error?.message || 'Unable to open your calendar right now.',
        tone: 'error',
      });
    }
  }, []);

  const handleWarmIntroDecision = useCallback(async (intro: WarmIntro | null | undefined, decision: 'accept' | 'decline') => {
    if (!intro?.id) return;
    try {
      const { error } = await db.rpc('rpc_respond_warm_introduction', {
        p_intro_id: intro.id,
        p_decision: decision,
      });
      if (error) throw error;
      await loadCircles();
    } catch (error) {
      showBetweenerAlert({
        title: 'Warm Introduction',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  }, [loadCircles]);

  const activePrompt = prompts[0] ?? null;

  const handleSubmitPromptAnswer = useCallback(async () => {
    Keyboard.dismiss();
    if (!activePrompt?.id) return;
    const body = promptAnswer.trim();
    if (!body) {
      showBetweenerAlert({
        title: 'Circle Prompt',
        message: 'Add your answer first.',
        tone: 'warning',
      });
      return;
    }
    try {
      const { error } = await db.rpc('rpc_answer_circle_prompt', {
        p_prompt_id: activePrompt.id,
        p_response: body,
      });
      if (error) throw error;
      setPromptAnswer('');
      setPromptAnswerOpen(false);
      showBetweenerAlert({
        title: 'Answer shared',
        message: 'Your answer has been shared with the Circle.',
        tone: 'success',
      });
    } catch (error) {
      showBetweenerAlert({
        title: 'Circle Prompt',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
  }, [activePrompt?.id, promptAnswer]);

  const upcomingGathering = gatherings[0] ?? null;
  const warmIntro = warmIntros[0] ?? null;
  const preferredGistPerspective = getPreferredGistPerspective((profile as any)?.religion);
  const allAvailableGistPerspectives = [...new Set(gists.map((item) => String(item.perspective ?? 'general').toLowerCase()))];
  const availableGistPerspectives = buildVisibleGistPerspectives(allAvailableGistPerspectives, (profile as any)?.religion);
  const gistSelectionOrder = buildGistSelectionOrder(gistPerspective, (profile as any)?.religion);
  const gist = gistSelectionOrder
    .map((perspective) => gists.find((item) => String(item.perspective ?? 'general').toLowerCase() === perspective))
    .find(Boolean)
    ?? gists[0]
    ?? null;
  const joinedCircles = myCircles
    .filter((membership) => membership.status === 'active')
    .map((membership) => membership.circles)
    .filter(Boolean) as CircleV2[];
  const visibleJoinedCircles = showAllJoinedCircles
    ? joinedCircles
    : joinedCircles.slice(0, CIRCLE_SECTION_PREVIEW_LIMIT);
  const hasCirclesHubContent =
    myCircles.length > 0 ||
    discoverCircles.length > 0 ||
    creatorCircles.length > 0 ||
    creatorGatherings.length > 0 ||
    prompts.length > 0 ||
    gatherings.length > 0 ||
    gists.length > 0 ||
    warmIntros.length > 0 ||
    picks.length > 0;
  const approvedCreatorCircles = creatorCircles.filter((circle) => circle.status === 'approved');
  const creatorStudioVisible = canSubmitCircle || canSubmitGathering || creatorCircles.length > 0 || creatorGatherings.length > 0;
  const scopeLabel = SCOPES.find((item) => item.key === scope)?.label ?? 'My country';
  const filteredDiscoverCircles = useMemo(() => {
    const query = discoveryQuery.trim().toLowerCase();
    if (!query) return discoverCircles;
    return discoverCircles.filter((circle) => {
      const haystack = [
        circle.name,
        circle.short_description,
        circle.description,
        circle.category,
        circle.country_name,
        circle.city,
        ...(circle.audience_tags ?? []),
        ...(circle.culture_tags ?? []),
        ...(circle.faith_tags ?? []),
        ...(circle.interest_tags ?? []),
        ...(circle.diaspora_tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [discoverCircles, discoveryQuery]);
  const discoverySnapshotLegacy = loading
    ? 'Refreshing circles, prompts, and gatherings for your community.'
    : `${discoverCircles.length} circles to explore · ${joinedCircles.length} joined · ${picks.length} Circle Picks`;

  const creatorQueueCount = creatorCircles.length + creatorGatherings.length;
  void discoverySnapshotLegacy;
  const circlesHubNotice = !networkReady && circlesSnapshotInfo.hasSnapshot
    ? {
        title: 'Offline mode',
        message: circlesSnapshotInfo.isStale
          ? `Showing saved Circles from ${formatSnapshotAgeLabel(circlesSnapshotInfo.savedAt)}. Some activity may be out of date.`
          : 'Showing your saved Circles from this device while the connection is offline.',
        icon: 'wifi-off' as const,
      }
    : loadError && hasCirclesHubContent
      ? {
          title: 'Showing saved Circles',
          message: circlesSnapshotInfo.hasSnapshot
            ? `We could not refresh the hub. Saved data from ${formatSnapshotAgeLabel(circlesSnapshotInfo.savedAt)} is still available.`
            : 'We could not fully refresh the hub right now.',
          icon: 'cloud-alert' as const,
        }
      : circlesSnapshotInfo.hasSnapshot && circlesSnapshotInfo.isStale && !loading
        ? {
            title: 'Saved snapshot',
            message: `Circles last synced ${formatSnapshotAgeLabel(circlesSnapshotInfo.savedAt)}. Pull back here online to refresh live activity.`,
            icon: 'history' as const,
          }
        : null;
  const discoverySnapshot = loading
    ? 'Refreshing circles, prompts, and gatherings for your community.'
    : discoveryQuery.trim()
      ? `${filteredDiscoverCircles.length} matches for "${discoveryQuery.trim()}" · ${joinedCircles.length} joined`
      : `${discoverCircles.length} circles to explore · ${joinedCircles.length} joined · ${picks.length} Circle Picks`;
  const visibleDiscoverCircles = showAllDiscoverCircles
    ? filteredDiscoverCircles
    : filteredDiscoverCircles.slice(0, CIRCLE_SECTION_PREVIEW_LIMIT);

  useEffect(() => {
    setShowAllDiscoverCircles(false);
  }, [discoveryQuery, scope]);

  useEffect(() => {
    setShowAllJoinedCircles(false);
  }, [scope]);

  const joinedCircleSignals = useMemo(() => {
    const promptCircleId = activePrompt?.circle_id ?? null;
    const gatheringCircleId = upcomingGathering?.circle_id ?? null;
    const introCircleId = warmIntro?.circle_id ?? null;

    return joinedCircles
      .map((circle) => {
        const activeCount = Math.max(0, Number(circle.active_this_week_count ?? 0));
        const gatheringCount = Math.max(0, Number(circle.gathering_count ?? 0));
        const hasPrompt = promptCircleId === circle.id;
        const hasGathering = gatheringCircleId === circle.id;
        const hasWarmIntro = introCircleId === circle.id;
        const score = (activeCount * 3) + (gatheringCount * 2) + (hasPrompt ? 5 : 0) + (hasGathering ? 7 : 0) + (hasWarmIntro ? 9 : 0);

        let eyebrow = 'Active';
        let summary = activeCount > 0 ? `${activeCount} active this week` : 'Warm context waiting';

        if (hasWarmIntro) {
          eyebrow = 'Warm intro';
          summary = 'A host-curated introduction is waiting on you.';
        } else if (hasGathering) {
          eyebrow = 'Gathering';
          summary = upcomingGathering?.title?.trim() || 'A gathering is coming up in this Circle.';
        } else if (hasPrompt) {
          eyebrow = 'Prompt live';
          summary = activePrompt?.title?.trim() || 'A fresh prompt is pulling people back in.';
        } else if (gatheringCount > 0) {
          eyebrow = 'Plans';
          summary = `${gatheringCount} gathering${gatheringCount === 1 ? '' : 's'} in motion.`;
        }

        return { circle, score, eyebrow, summary };
      })
      .sort((left, right) => right.score - left.score || (right.circle.member_count ?? 0) - (left.circle.member_count ?? 0));
  }, [
    activePrompt?.circle_id,
    activePrompt?.title,
    joinedCircles,
    upcomingGathering?.circle_id,
    upcomingGathering?.title,
    warmIntro?.circle_id,
  ]);
  const liveCircleSignals = useMemo(
    () => joinedCircleSignals.filter((item) => item.score > 0).slice(0, 3),
    [joinedCircleSignals],
  );
  const heroLeadSignal = liveCircleSignals[0] ?? null;
  const heroAttentionCount = Number(Boolean(warmIntro)) + Number(Boolean(upcomingGathering)) + Number(Boolean(activePrompt));
  const heroTitle = joinedCircles.length === 0
    ? 'Start with a Circle that fits your values.'
    : heroLeadSignal
      ? `${heroLeadSignal.circle.name} feels warm right now.`
      : 'Your Circle map is set. Now make it warmer.';
  const heroBody = joinedCircles.length === 0
    ? 'Join or request a Circle so prompts, gatherings, and introductions stop feeling like a cold start.'
    : heroLeadSignal
      ? `${heroLeadSignal.summary} Re-enter where context is already forming instead of starting from zero.`
      : 'Your joined Circles are quiet right now. Switch scope, browse new spaces, or request a more values-led room.';
  const gistReadTimeLabel = getGistReadTimeLabel(gist);
  const gistLensLabel = gistPerspective === 'general' ? 'General lens' : `${gistPerspective[0].toUpperCase()}${gistPerspective.slice(1)} lens`;
  const gistReaderContent = useMemo(() => buildGistReaderSections(gist, gistPerspective), [gist, gistPerspective]);
  const currentGistLocalState = gist
    ? gistLocalState[gist.id] ?? getDefaultRelationshipGistLocalState(gistPerspective)
    : null;
  const gistProgressLabel = getGistProgressLabel(currentGistLocalState);

  const handleSelectGistPerspective = useCallback((perspective: string) => {
    if (!availableGistPerspectives.includes(perspective)) return;
    setGistPerspectiveTouched(true);
    setGistPerspective(perspective);
    setGistLensPickerOpen(false);
    setGistLensMenuAnchor(null);
    setGistLensPickerContext(null);
  }, [availableGistPerspectives]);

  const handleOpenPreviewGistLensPicker = useCallback((event: GestureResponderEvent) => {
    if (availableGistPerspectives.length <= 1) return;
    const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
    const estimatedHeight = (availableGistPerspectives.length * GIST_LENS_DROPDOWN_ITEM_HEIGHT) + GIST_LENS_DROPDOWN_PADDING;
    const triggerLeft = event.nativeEvent.pageX - event.nativeEvent.locationX;
    const triggerTop = event.nativeEvent.pageY - event.nativeEvent.locationY;
    const left = Math.min(
      Math.max(16, triggerLeft),
      Math.max(16, windowWidth - GIST_LENS_DROPDOWN_WIDTH - 16),
    );
    const top = Math.min(
      Math.max(92, triggerTop + 46),
      Math.max(92, windowHeight - estimatedHeight - 24),
    );

    setGistLensMenuAnchor({ left, top });
    setGistLensPickerContext('preview');
    setGistLensPickerOpen(true);
  }, [availableGistPerspectives.length]);

  const handleOpenReaderGistLensPicker = useCallback(() => {
    if (availableGistPerspectives.length <= 1) return;
    setGistLensPickerContext((current) => (current === 'reader' ? null : 'reader'));
    setGistLensPickerOpen(false);
    setGistLensMenuAnchor(null);
  }, [availableGistPerspectives.length]);

  const persistGistLocalEntry = useCallback(async (
    gistId: string,
    patch: Partial<ReturnType<typeof getDefaultRelationshipGistLocalState>>,
  ) => {
    const previous = gistLocalStateRef.current[gistId] ?? getDefaultRelationshipGistLocalState(gistPerspective);
    const nextEntry = {
      ...previous,
      ...patch,
      progress: clampRelationshipGistProgress(
        typeof patch.progress === 'number' ? patch.progress : previous.progress,
      ),
    };
    const nextState = {
      ...gistLocalStateRef.current,
      [gistId]: nextEntry,
    };
    gistLocalStateRef.current = nextState;
    setGistLocalState(nextState);
    await writeRelationshipGistLocalState(user?.id ?? null, nextState);
  }, [gistPerspective, user?.id]);

  const flushGistReaderProgress = useCallback(async () => {
    if (!gist?.id) return;
    const progress = gistReaderProgressRef.current;
    await persistGistLocalEntry(gist.id, {
      progress,
      lastReadAt: Date.now(),
      lastPerspective: gistPerspective,
    });
  }, [gist?.id, gistPerspective, persistGistLocalEntry]);

  const queuePersistGistReaderProgress = useCallback((progress: number) => {
    if (!gist?.id) return;
    gistReaderProgressRef.current = progress;
    if (gistReaderProgressSaveTimeoutRef.current) {
      clearTimeout(gistReaderProgressSaveTimeoutRef.current);
    }
    gistReaderProgressSaveTimeoutRef.current = setTimeout(() => {
      void flushGistReaderProgress();
    }, 800);
  }, [flushGistReaderProgress, gist?.id]);

  const handleToggleSaveGist = useCallback(() => {
    if (!gist?.id) return;
    void persistGistLocalEntry(gist.id, {
      saved: !(currentGistLocalState?.saved === true),
      lastPerspective: gistPerspective,
    });
  }, [currentGistLocalState?.saved, gist?.id, gistPerspective, persistGistLocalEntry]);

  const handleShareGist = useCallback(async () => {
    if (!gist) return;
    const message = [
      gist.title?.trim() || 'Relationship Gist',
      gistReaderContent.lead,
      gistReaderContent.takeaway && gistReaderContent.takeaway !== gistReaderContent.lead
        ? gistReaderContent.takeaway
        : null,
      'Shared from Betweener.',
    ].filter(Boolean).join('\n\n');
    try {
      await Share.share({ message });
    } catch (error) {
      logger.warn('[circles] gist_share_failed', {
        gistId: gist.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [gist, gistReaderContent.lead, gistReaderContent.takeaway]);

  const handleSubmitGist = useCallback(async () => {
    const title = gistTitleDraft.trim();
    const shortBody = gistShortBodyDraft.trim();
    const body = gistBodyDraft.trim();
    if (!currentProfileId) {
      showBetweenerAlert({
        title: 'Share Gist',
        message: 'Your profile is still loading. Try again in a moment.',
        tone: 'warning',
      });
      return;
    }
    if (!title || title.length < 3) {
      showBetweenerAlert({
        title: 'Share Gist',
        message: 'Add a clear gist title.',
        tone: 'warning',
      });
      return;
    }
    if (!body || body.length < 20) {
      showBetweenerAlert({
        title: 'Share Gist',
        message: 'Add a fuller relationship note before publishing.',
        tone: 'warning',
      });
      return;
    }
    if (creatingGist) return;
    setCreatingGist(true);
    try {
      const { error } = await db.rpc('rpc_create_circle_relationship_gist', {
        p_circle_id: null,
        p_actor_profile_id: currentProfileId,
        p_title: title,
        p_short_body: shortBody,
        p_body: body,
        p_perspective: gistPerspectiveDraft,
      });
      if (error) throw error;
      setGistComposerOpen(false);
      setGistTitleDraft('');
      setGistShortBodyDraft('');
      setGistBodyDraft('');
      setGistPerspectiveDraft('general');
      await loadCircles();
      showBetweenerAlert({
        title: 'Gist published',
        message: 'Your Betweener Relationship Gist is now live.',
        tone: 'success',
      });
    } catch (error) {
      showBetweenerAlert({
        title: 'Share Gist',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    } finally {
      setCreatingGist(false);
    }
  }, [
    creatingGist,
    currentProfileId,
    gistBodyDraft,
    gistPerspectiveDraft,
    gistShortBodyDraft,
    gistTitleDraft,
    loadCircles,
  ]);

  useEffect(() => {
    if (!availableGistPerspectives.length) return;
    if (availableGistPerspectives.includes(gistPerspective)) return;
    setGistPerspective(availableGistPerspectives[0]);
    setGistPerspectiveTouched(false);
  }, [availableGistPerspectives, gistPerspective]);

  useEffect(() => {
    if (gistPerspectiveTouched) return;
    if (availableGistPerspectives.includes(preferredGistPerspective)) {
      setGistPerspective((prev) => (prev === preferredGistPerspective ? prev : preferredGistPerspective));
      return;
    }
    if (availableGistPerspectives.includes('general')) {
      setGistPerspective((prev) => (prev === 'general' ? prev : 'general'));
    }
  }, [availableGistPerspectives, gistPerspectiveTouched, preferredGistPerspective]);

  useEffect(() => {
    if (!gistReaderOpen) return;
    if (gist?.id) {
      void persistGistLocalEntry(gist.id, {
        lastOpenedAt: Date.now(),
        lastPerspective: gistPerspective,
      });
    }
    gistReaderProgressRef.current = currentGistLocalState?.progress ?? 0;
    gistReaderAnim.setValue(0);
    Animated.spring(gistReaderAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 180,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [currentGistLocalState?.progress, gist?.id, gistPerspective, gistReaderAnim, gistReaderOpen, persistGistLocalEntry]);

  useEffect(() => () => {
    if (gistReaderProgressSaveTimeoutRef.current) {
      clearTimeout(gistReaderProgressSaveTimeoutRef.current);
    }
  }, []);

  const joinedCirclesSection = (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Circles</Text>
        <View style={styles.sectionHeaderMeta}>
          <Text style={styles.sectionHint}>{joinedCircles.length ? `${joinedCircles.length} joined` : 'Find your people'}</Text>
          {joinedCircles.length > CIRCLE_SECTION_PREVIEW_LIMIT ? (
            <TouchableOpacity onPress={() => setShowAllJoinedCircles((value) => !value)}>
              <Text style={styles.sectionLink}>{showAllJoinedCircles ? 'Show less' : 'See all'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {joinedCircles.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
          {visibleJoinedCircles.map((circle) => (
            <CircleHeroCard
              key={`joined:${circle.id}`}
              circle={circle}
              imageUrl={imageUrls[circle.id]}
              memberPreviews={memberPreviewsByCircleId[circle.id]}
              mode="joined"
              onOpen={() => openCircle(circle.id)}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyPanel}>
          <View style={styles.emptyBadge}>
            <MaterialCommunityIcons name="account-group-outline" size={18} color={theme.tint} />
          </View>
          <Text style={styles.emptyTitle}>Find your people</Text>
          <Text style={styles.emptyBody}>Join trusted spaces shaped around culture, values, lifestyle, and intent.</Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePress}>
              <Text style={styles.primaryButtonText}>Request a Circle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setScope('my_country')}>
              <Text style={styles.secondaryButtonText}>Browse local</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Circles</Text>
            <Text style={styles.headerSubtitle}>Community spaces for intentional connection.</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerAction} onPress={() => void loadCircles()}>
              <MaterialCommunityIcons name="refresh" size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerAction} onPress={() => setActionsMenuOpen(true)}>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        <CirclesLiveGateway
          sessions={liveSessions}
          canSchedule={canScheduleLive}
          viewerProfileId={profile?.id}
          isDark={isDark}
          onPress={() => router.push('/live')}
        />

        {false ? <View style={styles.heroStage}>
          <View style={styles.heroCommandDeck}>
            <View style={styles.heroCommandHeader}>
              <View style={styles.heroCommandCopy}>
                <Text style={styles.heroCommandEyebrow}>Circle Command</Text>
                <Text style={styles.heroCommandTitle}>{heroTitle}</Text>
                <Text style={styles.heroCommandBody}>{heroBody}</Text>
              </View>
              <TouchableOpacity
                style={styles.headerAction}
                onPress={() => {
                  if (heroLeadSignal) {
                    openCircle(heroLeadSignal.circle.id);
                    return;
                  }
                  if (!joinedCircles.length) {
                    handleCreatePress();
                    return;
                  }
                  setScope('near_me');
                }}
              >
                <MaterialCommunityIcons
                  name={heroLeadSignal ? 'arrow-top-right' : !joinedCircles.length ? 'plus' : 'compass-outline'}
                  size={18}
                  color={theme.text}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{joinedCircles.length}</Text>
                <Text style={styles.heroStatLabel}>Joined</Text>
              </View>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{liveCircleSignals.length}</Text>
                <Text style={styles.heroStatLabel}>Warm Now</Text>
              </View>
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatValue}>{heroAttentionCount}</Text>
                <Text style={styles.heroStatLabel}>Needs You</Text>
              </View>
            </View>

            {liveCircleSignals.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroSignalRail}>
                {liveCircleSignals.map((signal) => (
                  <Pressable key={signal.circle.id} style={styles.heroSignalCard} onPress={() => openCircle(signal.circle.id)}>
                    <Text style={styles.heroSignalEyebrow}>{signal.eyebrow}</Text>
                    <Text style={styles.heroSignalTitle} numberOfLines={1}>{signal.circle.name}</Text>
                    <Text style={styles.heroSignalBody} numberOfLines={2}>{signal.summary}</Text>
                    <View style={styles.heroSignalMetaRow}>
                      <Text style={styles.heroSignalMeta} numberOfLines={1}>
                        {[signal.circle.member_count ? `${signal.circle.member_count} inside` : null, signal.circle.city ?? signal.circle.country_name ?? null].filter(Boolean).join(' · ')}
                      </Text>
                      <MaterialCommunityIcons name="arrow-top-right" size={14} color={circlePalette.tealStrong} />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.heroActionRow}>
              {heroLeadSignal ? (
                <TouchableOpacity style={styles.primaryButton} onPress={() => openCircle(heroLeadSignal.circle.id)}>
                  <Text style={styles.primaryButtonText}>Open warmest Circle</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setScope(joinedCircles.length ? 'near_me' : 'my_country')}>
                <Text style={styles.secondaryButtonText}>{joinedCircles.length ? 'Browse nearby' : 'Browse local'}</Text>
              </TouchableOpacity>
              {!joinedCircles.length ? (
                <TouchableOpacity style={styles.secondaryButton} onPress={handleCreatePress}>
                  <Text style={styles.secondaryButtonText}>Request a Circle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
          {SCOPES.map((item) => {
            const active = item.key === scope;
            return (
              <Pressable
                key={item.key}
                style={[styles.scopePill, active && styles.scopePillActive]}
                onPress={() => setScope(item.key)}
              >
                <MaterialCommunityIcons name={item.icon} size={15} color={active ? theme.backgroundSubtle : theme.textMuted} />
                <Text style={[styles.scopeText, active && styles.scopeTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {gist ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Relationship Gist</Text>
              <Text style={styles.sectionHint}>Open to every member</Text>
            </View>
            <RelationshipGistCard
              gist={gist}
              availablePerspectives={availableGistPerspectives}
              selectedPerspective={gistPerspective}
              onSelectPerspective={handleSelectGistPerspective}
              onOpenPerspectivePicker={handleOpenPreviewGistLensPicker}
              onOpenReader={() => setGistReaderOpen(true)}
              saved={currentGistLocalState?.saved === true}
              progressLabel={gistProgressLabel}
              onToggleSaved={handleToggleSaveGist}
            />
          </View>
        ) : null}

        <FeaturedSlotCard
          warmIntro={warmIntro}
          upcomingGathering={upcomingGathering}
          gatheringMemberPreviews={upcomingGathering?.circle_id ? memberPreviewsByCircleId[upcomingGathering.circle_id] : undefined}
          activePrompt={activePrompt}
          compactDate={compactDate}
          onAcceptIntro={() => void handleWarmIntroDecision(warmIntro, 'accept')}
          onDeclineIntro={() => void handleWarmIntroDecision(warmIntro, 'decline')}
          onAttend={() => void handleAttend(upcomingGathering)}
          onAddToCalendar={() => void handleAddGatheringToCalendar(upcomingGathering)}
          onOpenGathering={() => openCircle(upcomingGathering?.circle_id)}
          onOpenFeaturedProfile={() => {
            const profileId = upcomingGathering?.featured_profile?.id ?? upcomingGathering?.featured_profile_id;
            if (!profileId) return;
            router.push({ pathname: '/profile-view', params: { profileId, source: 'circles_home' } });
          }}
          onAnswerPrompt={() => setPromptAnswerOpen(true)}
        />

        <View style={styles.discoveryBanner}>
          <View style={styles.discoveryBannerHeader}>
            <Text style={styles.discoveryKicker}>Curated discovery</Text>
            <View style={styles.discoveryScopePill}>
              <MaterialCommunityIcons name="compass-outline" size={13} color={theme.tint} />
              <Text style={styles.discoveryScopeText}>{scopeLabel}</Text>
            </View>
          </View>
          <Text style={styles.discoveryTitle}>Trusted spaces shaped around your location, values, and intent.</Text>
          <Text style={styles.discoveryBody}>{discoverySnapshot}</Text>
          <View style={styles.discoverySearchShell}>
            <MaterialCommunityIcons name="magnify" size={16} color={theme.textMuted} />
            <TextInput
              value={discoveryQuery}
              onChangeText={setDiscoveryQuery}
              placeholder="Search circles, prompts, gatherings"
              placeholderTextColor={theme.textMuted}
              style={styles.discoverySearchInput}
              returnKeyType="search"
            />
            {discoveryQuery.trim() ? (
              <TouchableOpacity onPress={() => setDiscoveryQuery('')}>
                <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            ) : (
              <MaterialCommunityIcons name="tune-variant" size={16} color={theme.textMuted} />
            )}
          </View>
        </View>

        {circlesHubNotice ? (
          <Notice
            title={circlesHubNotice.title}
            message={circlesHubNotice.message}
            actionLabel={networkReady ? 'Retry' : undefined}
            onAction={networkReady ? () => void loadCircles() : undefined}
            icon={circlesHubNotice.icon}
          />
        ) : null}

        {joinedCirclesSection}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today in your Circles</Text>
            <Text style={styles.sectionHint}>What deserves attention first</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
            {activePrompt ? <CircleStoryCard label="Circle Prompt" title={activePrompt.prompt} /> : null}
            {upcomingGathering ? <CircleStoryCard label="Gathering" title={upcomingGathering.title} meta={compactDate(upcomingGathering.starts_at)} /> : null}
            {!activePrompt && !upcomingGathering ? <CircleStoryCard label="Quiet now" title="Fresh prompts and Gatherings will appear here." /> : null}
          </ScrollView>
        </View>

        {loadError && joinedCircles.length === 0 && discoverCircles.length === 0 ? (
          <Notice
            title="Circles are taking a moment"
            message="We could not refresh the hub. Cached Circles will still appear when available."
            actionLabel="Retry"
            onAction={() => void loadCircles()}
            icon="cloud-alert"
          />
        ) : null}

        <CircleInvitationInbox profileId={currentProfileId} onChanged={() => void loadCircles()} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Circle Picks</Text>
            <Text style={styles.sectionHint}>Shared context first</Text>
          </View>
          {picks.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
              {picks.map((item) => (
                <CirclePickCard
                  key={item.profile_id}
                  pick={item}
                  onOpenProfile={() =>
                    router.push({ pathname: '/profile-view', params: { profileId: item.profile_id, source: 'circles_home' } })
                  }
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.compactPanel}>
              <MaterialCommunityIcons name="account-search-outline" size={20} color={theme.tint} />
              <Text style={styles.compactText}>Join a Circle to unlock warmer profile suggestions.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{discoveryQuery.trim() ? 'Discovery results' : 'Discover more Circles'}</Text>
            <View style={styles.sectionHeaderMeta}>
              <Text style={styles.sectionHint}>{loading ? 'Refreshing' : `${filteredDiscoverCircles.length} spaces`}</Text>
              {filteredDiscoverCircles.length > CIRCLE_SECTION_PREVIEW_LIMIT ? (
                <TouchableOpacity onPress={() => setShowAllDiscoverCircles((value) => !value)}>
                  <Text style={styles.sectionLink}>{showAllDiscoverCircles ? 'Show less' : 'See all'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          {filteredDiscoverCircles.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
              {visibleDiscoverCircles.map((circle) => (
                <CircleHeroCard
                  key={`discover:${circle.id}`}
                  circle={circle}
                  imageUrl={imageUrls[circle.id]}
                  memberPreviews={memberPreviewsByCircleId[circle.id]}
                  mode="discover"
                  onOpen={() => openCircle(circle.id)}
                  onJoin={() => void handleJoin(circle)}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyPanel}>
              <View style={styles.emptyBadge}>
                <MaterialCommunityIcons name="earth" size={18} color={theme.tint} />
              </View>
              <Text style={styles.emptyTitle}>{discoveryQuery.trim() ? 'No matching Circles' : 'No local Circles yet'}</Text>
              <Text style={styles.emptyBody}>
                {discoveryQuery.trim()
                  ? 'Try a broader term or switch discovery scope.'
                  : 'Switch scope or request a values-led Circle for your community.'}
              </Text>
              <View style={styles.emptyActions}>
                {discoveryQuery.trim() ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setDiscoveryQuery('')}>
                    <Text style={styles.secondaryButtonText}>Clear search</Text>
                  </TouchableOpacity>
                ) : scope !== 'global' ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setScope('global')}>
                    <Text style={styles.secondaryButtonText}>Explore global</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void loadCircles()}>
                    <Text style={styles.secondaryButtonText}>Refresh</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={gistReaderOpen} animationType="slide" onRequestClose={() => {
        void flushGistReaderProgress();
        setGistLensPickerContext(null);
        setGistReaderOpen(false);
      }}>
        <SafeAreaView style={styles.readerScreen}>
          <View style={styles.readerTopRow}>
            <View style={styles.readerTopCopy}>
              <Text style={styles.readerKicker}>Relationship Gist</Text>
              <Text style={styles.readerTitle}>{gist?.title ?? 'Reader'}</Text>
            </View>
            <View style={styles.readerTopActions}>
              <TouchableOpacity style={styles.readerActionButton} onPress={handleToggleSaveGist}>
                <MaterialCommunityIcons
                  name={currentGistLocalState?.saved ? 'bookmark' : 'bookmark-outline'}
                  size={17}
                  color={theme.text}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.readerActionButton} onPress={() => void handleShareGist()}>
                <MaterialCommunityIcons name="share-variant-outline" size={17} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.readerCloseButton} onPress={() => {
                void flushGistReaderProgress();
                setGistLensPickerContext(null);
                setGistReaderOpen(false);
              }}>
                <MaterialCommunityIcons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <Animated.ScrollView
            style={[
              styles.readerScroll,
              {
                opacity: gistReaderAnim,
                transform: [
                  {
                    translateY: gistReaderAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
            contentContainerStyle={styles.readerScrollContent}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              const contentHeight = nativeEvent.contentSize.height;
              const viewportHeight = nativeEvent.layoutMeasurement.height;
              const maxOffset = Math.max(1, contentHeight - viewportHeight);
              const progress = clampRelationshipGistProgress(nativeEvent.contentOffset.y / maxOffset);
              queuePersistGistReaderProgress(progress);
            }}
          >
            <View style={styles.readerHeroCard}>
              <View style={styles.readerHeroGlow} />
              <View style={styles.readerLensRow}>
                <View style={styles.readerLensPill}>
                  <MaterialCommunityIcons name="tune-variant" size={14} color={theme.tint} />
                  <Text style={styles.readerLensPillText}>{gistLensLabel}</Text>
                </View>
                {availableGistPerspectives.length > 1 ? (
                  <TouchableOpacity style={styles.readerLensAction} onPress={handleOpenReaderGistLensPicker}>
                    <Text style={styles.readerLensActionText}>Change lens</Text>
                    <MaterialCommunityIcons name="chevron-down" size={15} color={theme.tint} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {gistLensPickerContext === 'reader' && availableGistPerspectives.length > 1 ? (
                <View style={styles.readerLensDropdownOverlay}>
                  <View style={styles.readerLensDropdown}>
                  {availableGistPerspectives.map((item) => {
                    const active = gistPerspective === item;
                    return (
                      <TouchableOpacity
                        key={`reader-lens:${item}`}
                        style={[styles.readerLensDropdownItem, active && styles.readerLensDropdownItemActive]}
                        onPress={() => handleSelectGistPerspective(item)}
                      >
                        <View style={styles.readerLensDropdownLead}>
                          <MaterialCommunityIcons
                            name={getGistPerspectiveIcon(item)}
                            size={18}
                            color={active ? theme.tint : theme.textMuted}
                          />
                        </View>
                        <Text style={[styles.readerLensDropdownTitle, active && styles.readerLensDropdownTitleActive]}>
                          {getGistPerspectiveLabel(item)}
                        </Text>
                        {active ? <MaterialCommunityIcons name="check" size={17} color={theme.tint} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                  </View>
                </View>
              ) : null}
              <Text style={styles.readerPerspectiveLabel}>
                {gistPerspective === 'general' ? 'General' : `${gistPerspective[0].toUpperCase()}${gistPerspective.slice(1)} lens`}
              </Text>
              <Text style={styles.readerLeadText}>{gistReaderContent.lead}</Text>
              <Text style={styles.readerSubtitle}>Editorial guidance from Betweener, shaped through the lens you choose.</Text>
            </View>
            <View style={styles.readerFramingCard}>
              <Text style={styles.readerSectionKicker}>Read this when</Text>
              <Text style={styles.readerFramingText}>{gistReaderContent.framing}</Text>
            </View>
            {gistReaderContent.sections.length ? (
              <View style={styles.readerSectionStack}>
                {gistReaderContent.sections.map((section, index) => (
                  <View key={section.id} style={styles.readerSectionCard}>
                    <Text style={styles.readerSectionIndex}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.readerSectionTitle}>{section.title}</Text>
                    <Text style={styles.readerSectionBody}>{section.body}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.readerTakeawayCard}>
              <Text style={styles.readerSectionKicker}>Carry this with you</Text>
              <Text style={styles.readerTakeawayText}>{gistReaderContent.takeaway}</Text>
            </View>
            <View style={styles.readerMetaRow}>
              <View style={styles.readerMetaPill}>
                <MaterialCommunityIcons name="book-open-page-variant-outline" size={14} color={theme.tint} />
                <Text style={styles.readerMetaText}>{gistReadTimeLabel}</Text>
              </View>
              <View style={styles.readerMetaPill}>
                <MaterialCommunityIcons name="progress-clock" size={14} color={theme.tint} />
                <Text style={styles.readerMetaText}>{gistProgressLabel}</Text>
              </View>
              <View style={styles.readerMetaPill}>
                <MaterialCommunityIcons name="earth" size={14} color={theme.tint} />
                <Text style={styles.readerMetaText}>Open to every Betweener member</Text>
              </View>
              <View style={styles.readerMetaPill}>
                <MaterialCommunityIcons name="tune-variant" size={14} color={theme.tint} />
                <Text style={styles.readerMetaText}>{gistLensLabel}</Text>
              </View>
            </View>
          </Animated.ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={gistLensPickerOpen && gistLensPickerContext === 'preview'}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setGistLensPickerOpen(false);
          setGistLensMenuAnchor(null);
          setGistLensPickerContext(null);
        }}
      >
        <Pressable
          style={styles.lensPickerBackdrop}
          onPress={() => {
            setGistLensPickerOpen(false);
            setGistLensMenuAnchor(null);
            setGistLensPickerContext(null);
          }}
        >
          <Pressable
            style={[
              styles.lensPickerDropdown,
              gistLensMenuAnchor ? { left: gistLensMenuAnchor.left, top: gistLensMenuAnchor.top } : styles.lensPickerDropdownFallback,
            ]}
            onPress={() => undefined}
          >
            <View style={styles.lensPickerDropdownHeader}>
              <View style={styles.readerLensPill}>
                <MaterialCommunityIcons name="tune-variant" size={14} color={theme.tint} />
                <Text style={styles.readerLensPillText}>{gistLensLabel}</Text>
              </View>
            </View>
            <View style={styles.lensPickerList}>
              {availableGistPerspectives.map((item) => {
                const active = gistPerspective === item;
                return (
                  <TouchableOpacity
                    key={`lens:${item}`}
                    style={[styles.lensPickerItem, active && styles.lensPickerItemActive]}
                    onPress={() => handleSelectGistPerspective(item)}
                  >
                    <View style={styles.lensPickerItemLead}>
                      <MaterialCommunityIcons
                        name={getGistPerspectiveIcon(item)}
                        size={18}
                        color={active ? theme.tint : theme.textMuted}
                      />
                    </View>
                    <View style={styles.lensPickerItemCopy}>
                      <Text style={[styles.lensPickerItemTitle, active && styles.lensPickerItemTitleActive]}>
                        {getGistPerspectiveLabel(item)}
                      </Text>
                    </View>
                    {active ? <MaterialCommunityIcons name="check" size={18} color={theme.tint} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={actionsMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionsMenuOpen(false)}
      >
        <Pressable style={styles.actionsMenuBackdrop} onPress={() => setActionsMenuOpen(false)}>
          <Pressable style={styles.actionsMenuCard} onPress={() => undefined}>
            {creatorStudioVisible ? (
              <TouchableOpacity
                style={styles.actionsMenuItem}
                onPress={() => {
                  setActionsMenuOpen(false);
                  router.push('/circles/manage');
                }}
              >
                <View style={styles.actionsMenuItemCopy}>
                  <Text style={styles.actionsMenuItemTitle}>Creator studio</Text>
                  <Text style={styles.actionsMenuItemBody}>
                    {creatorQueueCount ? `Manage ${creatorQueueCount} submissions` : 'Open your operator tools'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.actionsMenuItem}
              onPress={() => {
                setActionsMenuOpen(false);
                setCommandOpen(true);
              }}
            >
              <View style={styles.actionsMenuItemCopy}>
                <Text style={styles.actionsMenuItemTitle}>Circle Command</Text>
                <Text style={styles.actionsMenuItemBody}>
                  {heroLeadSignal ? heroLeadSignal.summary : 'See which Circle deserves your attention first.'}
                </Text>
              </View>
              <MaterialCommunityIcons name="radar" size={18} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionsMenuItem}
              onPress={() => {
                setActionsMenuOpen(false);
                handleCreatePress();
              }}
            >
              <View style={styles.actionsMenuItemCopy}>
                <Text style={styles.actionsMenuItemTitle}>Request Circle</Text>
                <Text style={styles.actionsMenuItemBody}>Propose a new trusted space.</Text>
              </View>
              <MaterialCommunityIcons name="plus-circle-outline" size={18} color={theme.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionsMenuItem}
              onPress={() => {
                setActionsMenuOpen(false);
                handleCreateGatheringPress();
              }}
            >
              <View style={styles.actionsMenuItemCopy}>
                <Text style={styles.actionsMenuItemTitle}>Request Gathering</Text>
                <Text style={styles.actionsMenuItemBody}>Propose an event for your Circle.</Text>
              </View>
              <MaterialCommunityIcons name="calendar-plus" size={18} color={theme.textMuted} />
            </TouchableOpacity>

            {isAdmin ? (
              <TouchableOpacity
                style={styles.actionsMenuItem}
                onPress={() => {
                  setActionsMenuOpen(false);
                  router.push('/circles/manage');
                }}
              >
                <View style={styles.actionsMenuItemCopy}>
                  <Text style={styles.actionsMenuItemTitle}>Editorial studio</Text>
                  <Text style={styles.actionsMenuItemBody}>Manage global Relationship Gists in Creator Studio.</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={commandOpen} transparent animationType="fade" onRequestClose={() => setCommandOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCommandOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.heroCommandDeck}>
                <View style={styles.heroCommandHeader}>
                  <View style={styles.heroCommandCopy}>
                    <Text style={styles.heroCommandEyebrow}>Circle Command</Text>
                    <Text style={styles.heroCommandTitle}>{heroTitle}</Text>
                    <Text style={styles.heroCommandBody}>{heroBody}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.headerAction}
                    onPress={() => {
                      setCommandOpen(false);
                      if (heroLeadSignal) {
                        openCircle(heroLeadSignal.circle.id);
                        return;
                      }
                      if (!joinedCircles.length) {
                        handleCreatePress();
                        return;
                      }
                      setScope('near_me');
                    }}
                  >
                    <MaterialCommunityIcons
                      name={heroLeadSignal ? 'arrow-top-right' : !joinedCircles.length ? 'plus' : 'compass-outline'}
                      size={18}
                      color={theme.text}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatCard}>
                    <Text style={styles.heroStatValue}>{joinedCircles.length}</Text>
                    <Text style={styles.heroStatLabel}>Joined</Text>
                  </View>
                  <View style={styles.heroStatCard}>
                    <Text style={styles.heroStatValue}>{liveCircleSignals.length}</Text>
                    <Text style={styles.heroStatLabel}>Warm Now</Text>
                  </View>
                  <View style={styles.heroStatCard}>
                    <Text style={styles.heroStatValue}>{heroAttentionCount}</Text>
                    <Text style={styles.heroStatLabel}>Needs You</Text>
                  </View>
                </View>

                {liveCircleSignals.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroSignalRail}>
                    {liveCircleSignals.map((signal) => (
                      <Pressable
                        key={signal.circle.id}
                        style={styles.heroSignalCard}
                        onPress={() => {
                          setCommandOpen(false);
                          openCircle(signal.circle.id);
                        }}
                      >
                        <Text style={styles.heroSignalEyebrow}>{signal.eyebrow}</Text>
                        <Text style={styles.heroSignalTitle} numberOfLines={1}>{signal.circle.name}</Text>
                        <Text style={styles.heroSignalBody} numberOfLines={2}>{signal.summary}</Text>
                        <View style={styles.heroSignalMetaRow}>
                          <Text style={styles.heroSignalMeta} numberOfLines={1}>
                            {[signal.circle.member_count ? `${signal.circle.member_count} inside` : null, signal.circle.city ?? signal.circle.country_name ?? null].filter(Boolean).join(' · ')}
                          </Text>
                          <MaterialCommunityIcons name="arrow-top-right" size={14} color={circlePalette.tealStrong} />
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                <View style={styles.heroActionRow}>
                  {heroLeadSignal ? (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => {
                        setCommandOpen(false);
                        openCircle(heroLeadSignal.circle.id);
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Open warmest Circle</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      setCommandOpen(false);
                      setScope(joinedCircles.length ? 'near_me' : 'my_country');
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>{joinedCircles.length ? 'Browse nearby' : 'Browse local'}</Text>
                  </TouchableOpacity>
                  {!joinedCircles.length ? (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => {
                        setCommandOpen(false);
                        handleCreatePress();
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>Request a Circle</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={gistComposerOpen} transparent animationType="fade" onRequestClose={() => setGistComposerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGistComposerOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Publish Gist</Text>
                <Text style={styles.modalBody}>Publish editorial relationship guidance for every member on Betweener.</Text>
                <TextInput
                  value={gistTitleDraft}
                  onChangeText={setGistTitleDraft}
                  placeholder="Gist title"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                />
                <TextInput
                  value={gistShortBodyDraft}
                  onChangeText={setGistShortBodyDraft}
                  placeholder="Short summary for the card"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                />
                <TextInput
                  value={gistBodyDraft}
                  onChangeText={setGistBodyDraft}
                  placeholder="Full relationship guidance"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[styles.input, styles.multiline, styles.gistBodyInput]}
                />
                <View style={styles.visibilityRow}>
                  {GIST_PERSPECTIVES.map((item) => (
                    <Pressable
                      key={item}
                      style={[styles.visibilityPill, gistPerspectiveDraft === item && styles.visibilityPillActive]}
                      onPress={() => setGistPerspectiveDraft(item)}
                    >
                      <Text style={[styles.visibilityText, gistPerspectiveDraft === item && styles.visibilityTextActive]}>
                        {item === 'general' ? 'General' : item[0].toUpperCase() + item.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setGistComposerOpen(false)}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={creatingGist} onPress={handleSubmitGist}>
                    <Text style={styles.primaryButtonText}>{creatingGist ? 'Publishing...' : 'Publish Gist'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={paywallOpen} transparent animationType="fade" onRequestClose={() => setPaywallOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPaywallOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Create trusted spaces with Gold</Text>
            <Text style={styles.modalBody}>Gold members can request community Circles and host curated Gatherings.</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setPaywallOpen(false);
                router.push('/premium-plans');
              }}
            >
              <Text style={styles.primaryButtonText}>Upgrade to Gold</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Request Circle</Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Circle name"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                />
                <TextInput
                  value={newPurpose}
                  onChangeText={setNewPurpose}
                  placeholder="Purpose and who it is for"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[styles.input, styles.multiline]}
                />
                <TextInput
                  value={newCity}
                  onChangeText={setNewCity}
                  placeholder="City"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  returnKeyType="done"
                />
                <View style={styles.visibilityRow}>
                  {(['country', 'local', 'diaspora', 'global', 'invite_only'] as const).map((item) => (
                    <Pressable
                      key={item}
                      style={[styles.visibilityPill, newScope === item && styles.visibilityPillActive]}
                      onPress={() => setNewScope(item)}
                    >
                      <Text style={[styles.visibilityText, newScope === item && styles.visibilityTextActive]}>
                        {item === 'invite_only' ? 'Private' : item[0].toUpperCase() + item.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setCreateOpen(false)}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={creating} onPress={handleSubmitCircle}>
                    <Text style={styles.primaryButtonText}>{creating ? 'Submitting' : 'Submit for review'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={gatheringOpen} transparent animationType="fade" onRequestClose={() => setGatheringOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGatheringOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={styles.modalCard} onPress={() => undefined}>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Request Gathering</Text>
                <TextInput
                  value={newGatheringTitle}
                  onChangeText={setNewGatheringTitle}
                  placeholder="Gathering title"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                />
                <TextInput
                  value={newGatheringDescription}
                  onChangeText={setNewGatheringDescription}
                  placeholder="What is this Gathering for?"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[styles.input, styles.multiline]}
                />
                {approvedCreatorCircles.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visibilityRow} keyboardShouldPersistTaps="handled">
                    <Pressable
                      style={[styles.visibilityPill, !newGatheringCircleId && styles.visibilityPillActive]}
                      onPress={() => setNewGatheringCircleId(null)}
                    >
                      <Text style={[styles.visibilityText, !newGatheringCircleId && styles.visibilityTextActive]}>General</Text>
                    </Pressable>
                    {approvedCreatorCircles.map((circle) => (
                      <Pressable
                        key={circle.id}
                        style={[styles.visibilityPill, newGatheringCircleId === circle.id && styles.visibilityPillActive]}
                        onPress={() => setNewGatheringCircleId(circle.id)}
                      >
                        <Text style={[styles.visibilityText, newGatheringCircleId === circle.id && styles.visibilityTextActive]}>{circle.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.visibilityRow}>
                  {(['physical', 'online', 'hybrid'] as const).map((item) => (
                    <Pressable
                      key={item}
                      style={[styles.visibilityPill, newGatheringType === item && styles.visibilityPillActive]}
                      onPress={() => setNewGatheringType(item)}
                    >
                      <Text style={[styles.visibilityText, newGatheringType === item && styles.visibilityTextActive]}>
                        {item[0].toUpperCase() + item.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.rowInputs}>
                  <TextInput
                    value={newGatheringDate}
                    onChangeText={setNewGatheringDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textMuted}
                    style={[styles.input, styles.rowInput]}
                    returnKeyType="next"
                  />
                  <TextInput
                    value={newGatheringTime}
                    onChangeText={setNewGatheringTime}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.textMuted}
                    style={[styles.input, styles.rowInput]}
                    returnKeyType="next"
                  />
                </View>
                <TextInput
                  value={newGatheringCity}
                  onChangeText={setNewGatheringCity}
                  placeholder="City"
                  placeholderTextColor={theme.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                />
                {newGatheringType !== 'online' ? (
                  <TextInput
                    value={newGatheringVenue}
                    onChangeText={setNewGatheringVenue}
                    placeholder="Venue name"
                    placeholderTextColor={theme.textMuted}
                    style={styles.input}
                    returnKeyType="done"
                  />
                ) : null}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setGatheringOpen(false)}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={creatingGathering} onPress={handleSubmitGathering}>
                    <Text style={styles.primaryButtonText}>{creatingGathering ? 'Submitting' : 'Submit for review'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={promptAnswerOpen} transparent animationType="fade" onRequestClose={() => setPromptAnswerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPromptAnswerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Circle Prompt</Text>
            <Text style={styles.modalBody}>{activePrompt?.prompt}</Text>
            <TextInput
              value={promptAnswer}
              onChangeText={setPromptAnswer}
              placeholder="Share a thoughtful answer"
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={500}
              style={[styles.input, styles.multiline]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setPromptAnswerOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSubmitPromptAnswer}>
                <Text style={styles.primaryButtonText}>Share answer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => {
  const palette = getCirclePulsePalette(isDark ? 'dark' : 'light');
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.surface },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 34, gap: 24 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { fontSize: 40, color: palette.text, fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { marginTop: 4, fontSize: 13, color: palette.textSoft },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAction: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.tealSoft,
      borderWidth: 1,
      borderColor: palette.tealBorder,
    },
    headerActionPrimary: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.tealStrong,
      shadowColor: palette.tealStrong,
      shadowOpacity: 0.24,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    heroStage: { gap: 14 },
    heroCommandDeck: {
      padding: 16,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      gap: 14,
    },
    heroCommandHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    heroCommandCopy: { flex: 1, gap: 6 },
    heroCommandEyebrow: {
      color: palette.tealStrong,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.7,
      textTransform: 'uppercase',
    },
    heroCommandTitle: { color: palette.text, fontSize: 20, lineHeight: 25, fontFamily: 'PlayfairDisplay_700Bold' },
    heroCommandBody: { color: palette.textSoft, fontSize: 12, lineHeight: 18 },
    heroStatsRow: { flexDirection: 'row', gap: 10 },
    heroStatCard: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceMuted,
      gap: 4,
    },
    heroStatValue: { color: palette.text, fontSize: 20, fontWeight: '900' },
    heroStatLabel: { color: palette.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    heroSignalRail: { gap: 10, paddingRight: 8 },
    heroSignalCard: {
      width: 214,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceMuted,
      gap: 6,
    },
    heroSignalEyebrow: {
      color: palette.tealStrong,
      fontSize: 10.5,
      fontWeight: '900',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    heroSignalTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    heroSignalBody: { color: palette.textSoft, fontSize: 12, lineHeight: 17 },
    heroSignalMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
    heroSignalMeta: { flex: 1, color: palette.textMuted, fontSize: 11, fontWeight: '700' },
    heroActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    scopeRow: { gap: 8, paddingRight: 18 },
    scopePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceMuted,
    },
    scopePillActive: { backgroundColor: palette.tealStrong, borderColor: palette.tealStrong },
    scopeText: { color: palette.textSoft, fontSize: 12, fontWeight: '700' },
    scopeTextActive: { color: palette.tealInk },
    discoveryBanner: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      gap: 12,
    },
    discoveryBannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    discoveryKicker: {
      color: palette.tealStrong,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.7,
      textTransform: 'uppercase',
    },
    discoveryScopePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: palette.tealSoft,
      borderWidth: 1,
      borderColor: palette.tealBorder,
    },
    discoveryScopeText: { color: palette.teal, fontSize: 11, fontWeight: '800' },
    discoveryTitle: { color: palette.text, fontSize: 22, lineHeight: 28, fontFamily: 'PlayfairDisplay_700Bold' },
    discoveryBody: { color: palette.textSoft, fontSize: 12, lineHeight: 18 },
    discoverySearchShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 2,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceMuted,
    },
    discoverySearchText: { flex: 1, color: palette.textMuted, fontSize: 12, fontWeight: '600' },
    discoverySearchInput: {
      flex: 1,
      color: palette.text,
      fontSize: 12,
      fontWeight: '600',
      paddingVertical: 0,
    },
    section: { gap: 13 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
    sectionHint: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
    manageLink: { color: palette.teal, fontSize: 12, fontWeight: '800' },
    creatorStudioCard: {
      gap: 10,
      padding: 16,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
    },
    creatorStudioTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
    creatorStudioBody: { color: palette.textSoft, fontSize: 12, lineHeight: 18 },
    creatorCard: {
      width: 244,
      padding: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surface,
      gap: 10,
    },
    creatorCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    creatorCardType: {
      color: palette.tealStrong,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    creatorStatusPill: {
      color: palette.text,
      fontSize: 10,
      fontWeight: '800',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: palette.purpleSoft,
      borderWidth: 1,
      borderColor: palette.purpleBorder,
    },
    creatorCardTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    creatorCardMeta: { color: palette.textSoft, fontSize: 12, lineHeight: 18 },
    creatorCardWarning: { color: '#F6B885', fontSize: 11, lineHeight: 16, fontWeight: '700' },
    creatorCardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 32 },
    horizontalList: { gap: 12, paddingRight: 18 },
    sectionHeaderMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sectionLink: { color: palette.tealStrong, fontSize: 11, fontWeight: '800' },
    circleCard: {
      width: 260,
      minHeight: 248,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceStrong,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    circleHero: {
      height: 144,
      position: 'relative',
      backgroundColor: palette.tealSoft,
    },
    circleImageWrap: {
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(139,92,255,0.14)',
    },
    circleImage: { width: '100%', height: '100%' },
    circleImageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    circleHeroOverlay: {
      ...StyleSheet.absoluteFill,
    },
    circleHeroTop: {
      position: 'absolute',
      top: 10,
      left: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    circleHeroBottom: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      gap: 4,
    },
    circleBadgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    heroBadge: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      color: '#F4E8D0',
      backgroundColor: 'rgba(7,30,34,0.74)',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.16)',
      fontSize: 10,
      fontWeight: '800',
    },
    circleSeal: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(7,30,34,0.62)',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.16)',
    },
    circleCardBody: { padding: 12, gap: 10 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardTitle: { flex: 1, color: '#F4E8D0', fontSize: 15, fontWeight: '800' },
    trustPill: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 3,
      color: '#A8F1EE',
      backgroundColor: 'rgba(19,168,168,0.16)',
      fontSize: 10,
      fontWeight: '800',
    },
    cardMeta: { color: 'rgba(244,232,208,0.6)', fontSize: 11 },
    cardBody: { color: 'rgba(244,232,208,0.76)', fontSize: 12, lineHeight: 17 },
    cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    softBadge: { color: '#7FE2E2', fontSize: 11, fontWeight: '800' },
    avatarStack: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
    avatarStackDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#8B5CFF',
      borderWidth: 2,
      borderColor: '#0B2427',
      marginRight: -6,
    },
    avatarStackDotSecondary: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#13A8A8',
      borderWidth: 2,
      borderColor: '#0B2427',
      marginRight: -6,
    },
    avatarStackDotTertiary: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#F4E8D0',
      borderWidth: 2,
      borderColor: '#0B2427',
    },
    cardActionTrail: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    openLabel: { color: '#A8F1EE', fontSize: 12, fontWeight: '800' },
    joinButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(19,168,168,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(19,168,168,0.45)',
    },
    joinButtonText: { color: '#A8F1EE', fontSize: 11, fontWeight: '800' },
    emptyPanel: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceStrong,
      gap: 12,
    },
    emptyBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.tealSoft,
      borderWidth: 1,
      borderColor: palette.tealBorder,
    },
    emptyTitle: { color: palette.text, fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
    emptyBody: { color: palette.textSoft, fontSize: 13, lineHeight: 19 },
    emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    compactPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 13,
      borderRadius: 16,
      backgroundColor: palette.surfaceStrong,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
    },
    compactText: { flex: 1, color: palette.textSoft, fontSize: 12 },
    pickCard: {
      width: 272,
      padding: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(10,36,39,0.88)',
      gap: 10,
    },
    pickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    pickIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    pickIdentityText: { flex: 1, gap: 4 },
    pickAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.backgroundSubtle },
    pickAvatarFallback: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(244,232,208,0.08)',
    },
    pickHeartBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#8B5CFF',
    },
    pickName: { color: '#F4E8D0', fontSize: 13, fontWeight: '800' },
    pickCircle: { color: '#13A8A8', fontSize: 11, fontWeight: '700' },
    pickChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    pickChip: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      color: '#D9FAFA',
      backgroundColor: 'rgba(19,168,168,0.14)',
      fontSize: 10,
      fontWeight: '800',
    },
    pickReason: { color: 'rgba(244,232,208,0.68)', fontSize: 11, lineHeight: 16 },
    featuredPanel: {
      padding: 17,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: 'rgba(19,168,168,0.3)',
      gap: 10,
      overflow: 'hidden',
    },
    kicker: {
      color: '#13A8A8',
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    featuredTitle: { color: '#F4E8D0', fontSize: 20, lineHeight: 25, fontFamily: 'PlayfairDisplay_700Bold' },
    featuredBody: { color: 'rgba(244,232,208,0.74)', fontSize: 13, lineHeight: 20 },
    featuredActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    warmIntroBodies: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    introProfile: { alignItems: 'center', gap: 8, minWidth: 72 },
    introAvatarShell: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(244,232,208,0.12)',
      borderWidth: 2,
      borderColor: 'rgba(244,232,208,0.18)',
    },
    introAvatarShellAlt: {
      borderColor: 'rgba(139,92,255,0.8)',
    },
    introProfileLabel: { color: '#F4E8D0', fontSize: 12, fontWeight: '700' },
    introConnector: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    introLine: { flex: 1, height: 2, backgroundColor: 'rgba(244,232,208,0.18)' },
    introHeart: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(139,92,255,0.22)',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.16)',
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    infoChip: {
      alignSelf: 'flex-start',
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      color: '#D8CCFF',
      backgroundColor: 'rgba(139,92,255,0.17)',
      fontSize: 11,
      fontWeight: '800',
    },
    storyCard: {
      width: 196,
      minHeight: 116,
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(255,255,255,0.045)',
      gap: 9,
    },
    storyTitle: { color: '#F4E8D0', fontSize: 15, lineHeight: 20, fontWeight: '800' },
    storyMeta: { color: 'rgba(244,232,208,0.62)', fontSize: 11 },
    gistPanel: {
      padding: 16,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: 'rgba(139,92,255,0.22)',
      gap: 9,
      overflow: 'hidden',
    },
    gistCaption: { color: 'rgba(244,232,208,0.7)', fontSize: 12 },
    gistPerspectiveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    gistPerspectivePill: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      color: 'rgba(244,232,208,0.72)',
      backgroundColor: 'rgba(255,255,255,0.05)',
      fontSize: 11,
      fontWeight: '700',
    },
    gistPerspectivePillActive: {
      color: '#071E22',
      backgroundColor: '#F4E8D0',
    },
    discoverList: { gap: 12 },
    primaryButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: palette.tealStrong,
    },
    primaryButtonText: { color: palette.tealInk, fontSize: 12, fontWeight: '900' },
    secondaryButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.outline,
    },
    secondaryButtonText: { color: palette.text, fontSize: 12, fontWeight: '800' },
    actionsMenuBackdrop: {
      flex: 1,
      backgroundColor: palette.overlay,
      alignItems: 'flex-end',
      paddingTop: 88,
      paddingHorizontal: 18,
    },
    actionsMenuCard: {
      width: 280,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      overflow: 'hidden',
    },
    actionsMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: palette.outlineSoft,
    },
    actionsMenuItemCopy: { flex: 1, gap: 3 },
    actionsMenuItemTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    actionsMenuItemBody: { color: palette.textSoft, fontSize: 11, lineHeight: 16 },
    readerScreen: {
      flex: 1,
      backgroundColor: palette.surface,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 22,
      gap: 16,
    },
    readerTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    readerTopCopy: { flex: 1, gap: 6 },
    readerTopActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    readerKicker: {
      color: palette.tealStrong,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.7,
      textTransform: 'uppercase',
    },
    readerTitle: { color: palette.text, fontSize: 30, lineHeight: 36, fontFamily: 'PlayfairDisplay_700Bold' },
    readerSubtitle: { color: palette.textSoft, fontSize: 14, lineHeight: 21 },
    readerActionButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surfaceStrong,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
    },
    readerCloseButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surfaceStrong,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
    },
    readerLensRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    readerLensPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceMuted,
    },
    readerLensPillText: { color: palette.text, fontSize: 12, fontWeight: '800' },
    readerLensAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: palette.surfaceStrong,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
    },
    readerLensActionText: { color: palette.tealStrong, fontSize: 12, fontWeight: '800' },
    readerLensDropdownOverlay: {
      position: 'absolute',
      top: 64,
      right: 20,
      zIndex: 8,
      alignItems: 'flex-end',
    },
    readerLensDropdown: {
      width: 224,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    readerLensDropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: palette.outlineSoft,
      backgroundColor: 'transparent',
    },
    readerLensDropdownItemActive: {
      backgroundColor: palette.tealSoft,
    },
    readerLensDropdownLead: {
      width: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    readerLensDropdownTitle: {
      flex: 1,
      color: palette.text,
      fontSize: 14,
      fontWeight: '800',
    },
    readerLensDropdownTitleActive: { color: palette.teal },
    readerScroll: { flex: 1 },
    readerScrollContent: { gap: 18, paddingBottom: 40, paddingTop: 4 },
    readerHeroCard: {
      overflow: 'hidden',
      padding: 20,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.surfaceStrong,
      gap: 14,
    },
    readerHeroGlow: {
      position: 'absolute',
      top: -30,
      right: -12,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: 'rgba(123,97,255,0.14)',
    },
    readerPerspectiveLabel: {
      alignSelf: 'flex-start',
      color: palette.tealStrong,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    readerLeadText: { color: palette.text, fontSize: 25, lineHeight: 35, fontFamily: 'PlayfairDisplay_700Bold' },
    readerBody: { color: palette.textSoft, fontSize: 17, lineHeight: 31 },
    readerFramingCard: {
      padding: 18,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      gap: 8,
    },
    readerFramingText: { color: palette.textSoft, fontSize: 14, lineHeight: 22 },
    readerSectionStack: { gap: 14 },
    readerSectionCard: {
      padding: 18,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      gap: 8,
    },
    readerSectionKicker: {
      color: palette.tealStrong,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    readerSectionIndex: {
      color: palette.textMuted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    readerSectionTitle: { color: palette.text, fontSize: 20, lineHeight: 26, fontFamily: 'PlayfairDisplay_700Bold' },
    readerSectionBody: { color: palette.textSoft, fontSize: 15, lineHeight: 25 },
    readerTakeawayCard: {
      padding: 18,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.tealBorder,
      backgroundColor: palette.tealSoft,
      gap: 8,
    },
    readerTakeawayText: { color: palette.text, fontSize: 16, lineHeight: 26, fontWeight: '700' },
    readerMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    readerMetaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: palette.surfaceStrong,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
    },
    readerMetaText: { color: palette.textSoft, fontSize: 12, fontWeight: '700' },
    lensPickerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(3, 14, 16, 0.06)',
    },
    lensPickerDropdown: {
      position: 'absolute',
      width: 236,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      overflow: 'hidden',
      padding: 12,
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    lensPickerDropdownFallback: {
      top: 108,
      right: 16,
    },
    lensPickerDropdownHeader: {
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: palette.outlineSoft,
    },
    lensPickerList: { gap: 4 },
    lensPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 13,
      borderRadius: 16,
      backgroundColor: 'transparent',
    },
    lensPickerItemActive: {
      backgroundColor: palette.tealSoft,
    },
    lensPickerItemLead: {
      width: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lensPickerItemCopy: { flex: 1 },
    lensPickerItemTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    lensPickerItemTitleActive: { color: palette.teal },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      padding: 20,
      backgroundColor: palette.overlay,
    },
    modalKeyboardWrap: {
      width: '100%',
      justifyContent: 'center',
    },
    modalCard: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceStrong,
      gap: 12,
    },
    modalScroll: {
      maxHeight: '88%',
    },
    modalScrollContent: {
      gap: 12,
    },
    modalTitle: { color: palette.text, fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
    modalBody: { color: palette.textSoft, fontSize: 13, lineHeight: 20 },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: palette.text,
      fontSize: 13,
    },
    multiline: { minHeight: 92, textAlignVertical: 'top' },
    gistBodyInput: { minHeight: 132 },
    rowInputs: { flexDirection: 'row', gap: 10 },
    rowInput: { flex: 1 },
    visibilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    visibilityPill: {
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    visibilityPillActive: { backgroundColor: palette.tealStrong, borderColor: palette.tealStrong },
    visibilityText: { color: palette.textSoft, fontSize: 11, fontWeight: '800' },
    visibilityTextActive: { color: palette.tealInk },
    modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  });
};
