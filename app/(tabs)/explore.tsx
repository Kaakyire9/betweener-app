import {
  CircleHeroCard,
  CirclePickCard,
  CircleStoryCard,
  FeaturedSlotCard,
  RelationshipGistCard,
} from '@/components/circles/CirclesHomeCards';
import CircleInvitationInbox from '@/components/circles/CircleInvitationInbox';
import Notice from '@/components/ui/Notice';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { getCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import { canCreateCircle, canCreateGathering, type CircleAccessEntitlements } from '@/lib/circles/circle-access';
import {
  type CircleDiscoveryScope,
  sortCirclesByRelevance,
} from '@/lib/circles/circle-localization';
import { readCache, writeCache } from '@/lib/persisted-cache';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  starts_at: string;
  city?: string | null;
  country_code?: string | null;
  gathering_type?: string | null;
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

type CirclesCache = {
  myCircles: CircleMembership[];
  discoverCircles: CircleV2[];
  creatorCircles: CircleV2[];
  creatorGatherings: Gathering[];
  prompts: CirclePrompt[];
  gatherings: Gathering[];
  gists: RelationshipGist[];
  warmIntros: WarmIntro[];
  picks: CirclePick[];
  imageUrls: Record<string, string>;
  memberPreviewsByCircleId: Record<string, CircleMemberPreview[]>;
};

const db = supabase as any;

const SCOPES: { key: CircleDiscoveryScope; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'near_me', label: 'Near me', icon: 'map-marker-radius-outline' },
  { key: 'my_country', label: 'My country', icon: 'flag-outline' },
  { key: 'diaspora', label: 'Diaspora', icon: 'earth' },
  { key: 'global', label: 'Global', icon: 'web' },
];

const normalizeCircle = (input: CircleV2 | CircleV2[] | null | undefined): CircleV2 | null => {
  if (!input) return null;
  return Array.isArray(input) ? (input[0] ?? null) : input;
};

const compactDate = (value?: string | null) => {
  if (!value) return 'Soon';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Soon';
  return date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

const creatorStatusLabel = (status?: string | null) => {
  switch (String(status ?? '')) {
    case 'pending_review':
      return 'Pending review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Needs changes';
    case 'draft':
      return 'Draft';
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return 'Completed';
    default:
      return 'In progress';
  }
};

export default function CirclesScreen() {
  const { profile, user } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
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
  const [warmIntros, setWarmIntros] = useState<WarmIntro[]>([]);
  const [picks, setPicks] = useState<CirclePick[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [memberPreviewsByCircleId, setMemberPreviewsByCircleId] = useState<Record<string, CircleMemberPreview[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  const circlesCacheKey = useMemo(
    () => (currentProfileId ? `cache:circles:v2:${currentProfileId}:${scope}` : null),
    [currentProfileId, scope],
  );
  const cacheLoadedRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (!circlesCacheKey || cacheLoadedRef.current === circlesCacheKey) return;
    cacheLoadedRef.current = circlesCacheKey;
    let cancelled = false;
    void (async () => {
      const cached = await readCache<CirclesCache>(circlesCacheKey, 15 * 60_000);
      if (cancelled || !cached) return;
      setMyCircles((prev) => (prev.length ? prev : cached.myCircles ?? []));
      setDiscoverCircles((prev) => (prev.length ? prev : cached.discoverCircles ?? []));
      setCreatorCircles((prev) => (prev.length ? prev : cached.creatorCircles ?? []));
      setCreatorGatherings((prev) => (prev.length ? prev : cached.creatorGatherings ?? []));
      setPrompts((prev) => (prev.length ? prev : cached.prompts ?? []));
      setGatherings((prev) => (prev.length ? prev : cached.gatherings ?? []));
      setGists((prev) => (prev.length ? prev : cached.gists ?? []));
      setWarmIntros((prev) => (prev.length ? prev : cached.warmIntros ?? []));
      setPicks((prev) => (prev.length ? prev : cached.picks ?? []));
      setImageUrls((prev) => (Object.keys(prev).length ? prev : cached.imageUrls ?? {}));
      setMemberPreviewsByCircleId((prev) => (
        Object.keys(prev).length ? prev : cached.memberPreviewsByCircleId ?? {}
      ));
    })();
    return () => {
      cancelled = true;
    };
  }, [circlesCacheKey]);

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
      return (suggestionRows ?? []).slice(0, 3).map((row: any) => ({
        profile_id: String(row.profile_id),
        full_name: row.full_name,
        age: typeof row.age === 'number' ? row.age : null,
        avatar_url: row.avatar_url ?? null,
        circleName: row.circle_name ?? 'Shared Circle',
        reason: row.reason || 'Shared Circle',
      })) as CirclePick[];
    }
    logger.warn('[circles] profile_suggestions_rpc_failed', {
      error: String(suggestionError.message || suggestionError),
    });

    const { data } = await db
      .from('circle_members')
      .select('circle_id,profile_id,circles(name),profiles(id,full_name,age,avatar_url,looking_for,current_country,city)')
      .in('circle_id', activeCircleIds)
      .eq('status', 'active')
      .neq('profile_id', currentProfileId)
      .limit(24);

    const seen = new Set<string>();
    return (data ?? [])
      .map((row: any) => {
        const pickedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const pickedCircle = normalizeCircle(row.circles);
        if (!pickedProfile?.id || seen.has(String(pickedProfile.id))) return null;
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
  }, [currentProfileId]);

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

    return (data ?? []).reduce((acc: Record<string, CircleMemberPreview[]>, row: any) => {
      const circleId = String(row.circle_id);
      const pickedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!pickedProfile?.id || !pickedProfile.avatar_url) return acc;
      const existing = acc[circleId] ?? [];
      if (existing.length >= 3 || existing.some((item) => item.profile_id === String(pickedProfile.id))) return acc;
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
  }, []);

  const loadCircles = useCallback(async () => {
    if (!currentProfileId) return;
    setLoading(true);
    setLoadError(null);

    try {
      const membershipsPromise = db
        .from('circle_members')
        .select('id,circle_id,role,status,circles(id,name,slug,description,short_description,visibility,category,created_by_profile_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,diaspora_tags,culture_tags,faith_tags,interest_tags,audience_tags,is_official,is_partner,is_featured,requires_join_approval,member_count,active_this_week_count,gathering_count,archived_at)')
        .eq('profile_id', currentProfileId);

      const circlesPromise = db
        .from('circles')
        .select('id,name,slug,description,short_description,visibility,category,created_by_profile_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,diaspora_tags,culture_tags,faith_tags,interest_tags,audience_tags,is_official,is_partner,is_featured,requires_join_approval,member_count,active_this_week_count,gathering_count,archived_at')
        .eq('status', 'approved')
        .is('archived_at', null)
        .order('is_featured', { ascending: false })
        .order('member_count', { ascending: false })
        .limit(48);

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
        .select('id,circle_id,title,starts_at,city,country_code,gathering_type,is_partner_venue,safe_first_date_space,attendee_count')
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
      if (circlesError) throw circlesError;

      const memberships: CircleMembership[] = (membershipRows ?? []).map((row: any) => ({
        id: String(row.id),
        circle_id: String(row.circle_id),
        role: String(row.role),
        status: String(row.status),
        circles: normalizeCircle(row.circles),
      }));
      const joinedIds = new Set(memberships.map((membership) => membership.circle_id));
      const visibleCircles = ((circleRows ?? []) as CircleV2[]).filter((circle) => !joinedIds.has(String(circle.id)));
      const sortedDiscover = sortCirclesByRelevance<CircleV2>(
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
      });

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
      setCreatorCircles((creatorCircleRows ?? []) as CircleV2[]);
      setCreatorGatherings((creatorGatheringRows ?? []) as Gathering[]);
      setPrompts((promptRows ?? []) as CirclePrompt[]);
      setGatherings((gatheringRows ?? []) as Gathering[]);
      const globalGists = ((gistRows ?? []) as RelationshipGist[]).filter((item) => !item.circle_id);
      setGists(globalGists);
      setWarmIntros((warmIntroRows ?? []) as WarmIntro[]);
      setPicks(nextPicks);
      setImageUrls(nextImages);
      setMemberPreviewsByCircleId(nextMemberPreviews);

      if (circlesCacheKey) {
        void writeCache(circlesCacheKey, {
          myCircles: memberships,
          discoverCircles: sortedDiscover,
          creatorCircles: (creatorCircleRows ?? []) as CircleV2[],
          creatorGatherings: (creatorGatheringRows ?? []) as Gathering[],
          prompts: (promptRows ?? []) as CirclePrompt[],
          gatherings: (gatheringRows ?? []) as Gathering[],
          gists: globalGists,
          warmIntros: (warmIntroRows ?? []) as WarmIntro[],
          picks: nextPicks,
          imageUrls: nextImages,
          memberPreviewsByCircleId: nextMemberPreviews,
        });
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load Circles.');
    } finally {
      setLoading(false);
    }
  }, [circlesCacheKey, currentProfileId, loadCircleMemberPreviews, loadCirclePicks, profile, refreshImageUrls, scope]);

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
      Alert.alert('Circle name', 'Add a clear Circle name.');
      return;
    }
    if (!purpose || purpose.length < 10) {
      Alert.alert('Circle purpose', 'Add a short purpose so Betweener can review it.');
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
        Alert.alert(
          isAdmin ? 'Circle published' : 'Submitted for review',
          isAdmin ? 'Your official Circle is live.' : "We'll notify you once Betweener approves it.",
        );
      }
    } catch (error) {
      Alert.alert('Circle request failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreating(false);
    }
  }, [creating, isAdmin, loadCircles, newCity, newName, newPurpose, newScope, profile]);

  const prefillCircleRequest = useCallback((circle: CircleV2) => {
    setNewName(circle.name ?? '');
    setNewPurpose(circle.description ?? circle.short_description ?? '');
    setNewCity(circle.city ?? (profile?.city ?? ''));
    const nextScope = ['country', 'local', 'diaspora', 'global', 'invite_only'].includes(String(circle.visibility_scope ?? ''))
      ? (circle.visibility_scope as 'country' | 'local' | 'diaspora' | 'global' | 'invite_only')
      : 'country';
    setNewScope(nextScope);
    setCreateOpen(true);
  }, [profile?.city]);

  const handleSubmitGathering = useCallback(async () => {
    Keyboard.dismiss();
    const title = newGatheringTitle.trim();
    const description = newGatheringDescription.trim();
    const datePart = newGatheringDate.trim();
    const timePart = newGatheringTime.trim();
    if (!title || title.length < 3) {
      Alert.alert('Gathering title', 'Add a clear Gathering title.');
      return;
    }
    if (!description || description.length < 10) {
      Alert.alert('Gathering details', 'Add a short description so Betweener can review it.');
      return;
    }
    if (!datePart || !timePart) {
      Alert.alert('Start time', 'Add a valid date and time.');
      return;
    }
    const startsAt = new Date(`${datePart}T${timePart}`);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      Alert.alert('Start time', 'Use a future date and time.');
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
        Alert.alert(
          isAdmin ? 'Gathering published' : 'Submitted for review',
          isAdmin ? 'Your Gathering is live.' : "We'll notify you once Betweener approves it.",
        );
      }
    } catch (error) {
      Alert.alert('Gathering request failed', error instanceof Error ? error.message : 'Please try again.');
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

  const prefillGatheringRequest = useCallback((gathering: Gathering) => {
    setNewGatheringTitle(gathering.title ?? '');
    setNewGatheringDescription(gathering.description ?? '');
    setNewGatheringCity(gathering.city ?? (profile?.city ?? ''));
    setNewGatheringVenue(gathering.venue_name ?? '');
    const type = ['physical', 'online', 'hybrid'].includes(String(gathering.gathering_type ?? ''))
      ? (gathering.gathering_type as 'physical' | 'online' | 'hybrid')
      : 'physical';
    setNewGatheringType(type);
    setNewGatheringCircleId(gathering.circle_id ?? null);
    if (gathering.starts_at) {
      const parsed = new Date(gathering.starts_at);
      if (!Number.isNaN(parsed.getTime())) {
        setNewGatheringDate(parsed.toISOString().slice(0, 10));
        setNewGatheringTime(parsed.toTimeString().slice(0, 5));
      }
    }
    setGatheringOpen(true);
  }, [profile?.city]);

  const handleJoin = useCallback(async (circle: CircleV2) => {
    if (!currentProfileId) return;
    try {
      const { error } = await db.rpc('rpc_join_circle', {
        p_circle_id: circle.id,
        p_profile_id: currentProfileId,
      });
      if (error) throw error;
      await loadCircles();
    } catch (error) {
      Alert.alert('Join failed', error instanceof Error ? error.message : 'Please try again.');
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
      Alert.alert('You are attending', 'We will keep this Gathering saved for you.');
      await loadCircles();
    } catch (error) {
      Alert.alert('Attend failed', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [loadCircles]);

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
      Alert.alert('Warm Introduction', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [loadCircles]);

  const activePrompt = prompts[0] ?? null;

  const handleSubmitPromptAnswer = useCallback(async () => {
    Keyboard.dismiss();
    if (!activePrompt?.id) return;
    const body = promptAnswer.trim();
    if (!body) {
      Alert.alert('Circle Prompt', 'Add your answer first.');
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
      Alert.alert('Answer shared', 'Your answer has been shared with the Circle.');
    } catch (error) {
      Alert.alert('Circle Prompt', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePrompt?.id, promptAnswer]);

  const upcomingGathering = gatherings[0] ?? null;
  const warmIntro = warmIntros[0] ?? null;
  const availableGistPerspectives = [...new Set(gists.map((item) => String(item.perspective ?? 'general').toLowerCase()))];
  const gist = gists.find((item) => String(item.perspective ?? 'general').toLowerCase() === gistPerspective)
    ?? gists.find((item) => item.perspective === 'general')
    ?? gists[0]
    ?? null;
  const joinedCircles = myCircles
    .filter((membership) => membership.status === 'active')
    .map((membership) => membership.circles)
    .filter(Boolean) as CircleV2[];
  const approvedCreatorCircles = creatorCircles.filter((circle) => circle.status === 'approved');
  const creatorStudioVisible = canSubmitCircle || canSubmitGathering || creatorCircles.length > 0 || creatorGatherings.length > 0;
  const scopeLabel = SCOPES.find((item) => item.key === scope)?.label ?? 'My country';
  const discoverySnapshot = loading
    ? 'Refreshing circles, prompts, and gatherings for your community.'
    : `${discoverCircles.length} circles to explore · ${joinedCircles.length} joined · ${picks.length} Circle Picks`;

  const joinedCirclesSection = (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Circles</Text>
        <Text style={styles.sectionHint}>{joinedCircles.length ? `${joinedCircles.length} joined` : 'Find your people'}</Text>
      </View>
      {joinedCircles.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
          {joinedCircles.map((circle) => (
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
            <TouchableOpacity style={styles.headerActionPrimary} onPress={handleCreatePress}>
              <MaterialCommunityIcons name="plus" size={18} color={theme.backgroundSubtle} />
            </TouchableOpacity>
          </View>
        </View>

        {joinedCirclesSection}

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
            <Text style={styles.discoverySearchText}>Search circles, prompts, gatherings</Text>
            <MaterialCommunityIcons name="tune-variant" size={16} color={theme.textMuted} />
          </View>
        </View>

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
              onSelectPerspective={setGistPerspective}
            />
          </View>
        ) : null}

        {creatorStudioVisible ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Creator studio</Text>
              <TouchableOpacity onPress={() => router.push('/circles/manage')}>
                <Text style={styles.manageLink}>
                  {creatorCircles.length + creatorGatherings.length
                    ? `Manage ${creatorCircles.length + creatorGatherings.length}`
                    : 'Open studio'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.creatorStudioCard}>
              <Text style={styles.creatorStudioTitle}>Build trusted spaces with approval, not noise.</Text>
              <Text style={styles.creatorStudioBody}>
                Request new Circles, propose Gatherings, and keep track of pending or rejected submissions in one place.
              </Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePress}>
                  <Text style={styles.primaryButtonText}>Request Circle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={handleCreateGatheringPress}>
                  <Text style={styles.secondaryButtonText}>Request Gathering</Text>
                </TouchableOpacity>
              </View>
              {creatorCircles.length || creatorGatherings.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                  {creatorCircles.map((circle) => (
                    <View key={`creator-circle:${circle.id}`} style={styles.creatorCard}>
                      <View style={styles.creatorCardTop}>
                        <Text style={styles.creatorCardType}>Circle</Text>
                        <Text style={styles.creatorStatusPill}>{creatorStatusLabel(circle.status)}</Text>
                      </View>
                      <Text style={styles.creatorCardTitle} numberOfLines={1}>{circle.name}</Text>
                      <Text style={styles.creatorCardMeta} numberOfLines={2}>
                        {circle.short_description || circle.description || 'Awaiting curation details.'}
                      </Text>
                      {circle.rejected_reason ? <Text style={styles.creatorCardWarning}>Reason: {circle.rejected_reason}</Text> : null}
                      <View style={styles.creatorCardActions}>
                        {circle.status === 'approved' ? (
                          <TouchableOpacity style={styles.secondaryButton} onPress={() => openCircle(circle.id)}>
                            <Text style={styles.secondaryButtonText}>Open</Text>
                          </TouchableOpacity>
                        ) : null}
                        {circle.status === 'rejected' ? (
                          <TouchableOpacity style={styles.secondaryButton} onPress={() => prefillCircleRequest(circle)}>
                            <Text style={styles.secondaryButtonText}>Use details again</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ))}
                  {creatorGatherings.map((gathering) => (
                    <View key={`creator-gathering:${gathering.id}`} style={styles.creatorCard}>
                      <View style={styles.creatorCardTop}>
                        <Text style={styles.creatorCardType}>Gathering</Text>
                        <Text style={styles.creatorStatusPill}>{creatorStatusLabel(gathering.status)}</Text>
                      </View>
                      <Text style={styles.creatorCardTitle} numberOfLines={1}>{gathering.title}</Text>
                      <Text style={styles.creatorCardMeta} numberOfLines={2}>
                        {[compactDate(gathering.starts_at), gathering.city, gathering.venue_name].filter(Boolean).join(' · ')}
                      </Text>
                      {gathering.rejected_reason ? <Text style={styles.creatorCardWarning}>Reason: {gathering.rejected_reason}</Text> : null}
                      <View style={styles.creatorCardActions}>
                        {gathering.status === 'rejected' ? (
                          <TouchableOpacity style={styles.secondaryButton} onPress={() => prefillGatheringRequest(gathering)}>
                            <Text style={styles.secondaryButtonText}>Use details again</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          </View>
        ) : null}

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
                  onOpenProfile={() => router.push({ pathname: '/profile-view', params: { profileId: item.profile_id } })}
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

        <FeaturedSlotCard
          warmIntro={warmIntro}
          upcomingGathering={upcomingGathering}
          activePrompt={activePrompt}
          compactDate={compactDate}
          onAcceptIntro={() => void handleWarmIntroDecision(warmIntro, 'accept')}
          onDeclineIntro={() => void handleWarmIntroDecision(warmIntro, 'decline')}
          onAttend={() => void handleAttend(upcomingGathering)}
          onAnswerPrompt={() => setPromptAnswerOpen(true)}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today in your Circles</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
            {activePrompt ? <CircleStoryCard label="Circle Prompt" title={activePrompt.prompt} /> : null}
            {upcomingGathering ? <CircleStoryCard label="Gathering" title={upcomingGathering.title} meta={compactDate(upcomingGathering.starts_at)} /> : null}
            {!activePrompt && !upcomingGathering ? <CircleStoryCard label="Quiet now" title="Fresh prompts and Gatherings will appear here." /> : null}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discover more Circles</Text>
            <Text style={styles.sectionHint}>{loading ? 'Refreshing' : `${discoverCircles.length} spaces`}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
            {discoverCircles.slice(0, 8).map((circle) => (
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
            {discoverCircles.length === 0 ? (
              <View style={styles.emptyPanel}>
                <View style={styles.emptyBadge}>
                  <MaterialCommunityIcons name="earth" size={18} color={theme.tint} />
                </View>
                <Text style={styles.emptyTitle}>No local Circles yet</Text>
                <Text style={styles.emptyBody}>Switch scope or request a values-led Circle for your community.</Text>
                <View style={styles.emptyActions}>
                  {scope !== 'global' ? (
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
            ) : null}
          </ScrollView>
        </View>
      </ScrollView>

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
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28, gap: 22 },
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
      padding: 16,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: palette.outlineSoft,
      backgroundColor: palette.surfaceStrong,
      gap: 10,
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
    discoveryTitle: { color: palette.text, fontSize: 19, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
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
    section: { gap: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
    sectionHint: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
    manageLink: { color: palette.teal, fontSize: 12, fontWeight: '800' },
    creatorStudioCard: {
      gap: 8,
    },
    creatorStudioTitle: { display: 'none' },
    creatorStudioBody: { display: 'none' },
    creatorCard: {
      display: 'none',
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
      ...StyleSheet.absoluteFillObject,
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
