import Notice from '@/components/ui/Notice';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { canCreateCircle, type CircleAccessEntitlements } from '@/lib/circles/circle-access';
import {
  type CircleDiscoveryScope,
  sortCirclesByRelevance,
} from '@/lib/circles/circle-localization';
import { readCache, writeCache } from '@/lib/persisted-cache';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
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
  starts_at: string;
  city?: string | null;
  country_code?: string | null;
  gathering_type?: string | null;
  is_partner_venue?: boolean | null;
  safe_first_date_space?: boolean | null;
  attendee_count?: number | null;
};

type RelationshipGist = {
  id: string;
  title: string;
  short_body?: string | null;
  body: string;
  perspective?: string | null;
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

type CirclesCache = {
  myCircles: CircleMembership[];
  discoverCircles: CircleV2[];
  prompts: CirclePrompt[];
  gatherings: Gathering[];
  gists: RelationshipGist[];
  warmIntros: WarmIntro[];
  picks: CirclePick[];
  imageUrls: Record<string, string>;
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
  const [prompts, setPrompts] = useState<CirclePrompt[]>([]);
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [gists, setGists] = useState<RelationshipGist[]>([]);
  const [warmIntros, setWarmIntros] = useState<WarmIntro[]>([]);
  const [picks, setPicks] = useState<CirclePick[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [premiumState, setPremiumState] = useState<CircleAccessEntitlements | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const [newCity, setNewCity] = useState(profile?.city ?? '');
  const [newScope, setNewScope] = useState<'country' | 'local' | 'diaspora' | 'invite_only'>('country');
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
      setPrompts((prev) => (prev.length ? prev : cached.prompts ?? []));
      setGatherings((prev) => (prev.length ? prev : cached.gatherings ?? []));
      setGists((prev) => (prev.length ? prev : cached.gists ?? []));
      setWarmIntros((prev) => (prev.length ? prev : cached.warmIntros ?? []));
      setPicks((prev) => (prev.length ? prev : cached.picks ?? []));
      setImageUrls((prev) => (Object.keys(prev).length ? prev : cached.imageUrls ?? {}));
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

    const { data } = await db
      .from('circle_members')
      .select('circle_id,profile_id,circles(name),profiles(id,full_name,age,avatar_url,interests,relationship_intent,current_country,city)')
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
          pickedProfile.relationship_intent ? 'Serious intent' : null,
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

      const gistsPromise = db
        .from('relationship_gists')
        .select('id,title,short_body,body,perspective')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(6);

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
        { data: promptRows },
        { data: gatheringRows },
        { data: gistRows },
        { data: warmIntroRows },
      ] = await Promise.all([
        membershipsPromise,
        circlesPromise,
        promptsPromise,
        gatheringsPromise,
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
        return !circle.country_code || !userCountry || String(circle.country_code).toUpperCase() === userCountry || circle.visibility_scope === 'global';
      });

      const nextPicks = await loadCirclePicks(memberships);
      const allCircles = [
        ...memberships.map((membership) => membership.circles).filter(Boolean) as CircleV2[],
        ...sortedDiscover,
      ];
      const nextImages = await refreshImageUrls(allCircles);

      setMyCircles(memberships);
      setDiscoverCircles(sortedDiscover);
      setPrompts((promptRows ?? []) as CirclePrompt[]);
      setGatherings((gatheringRows ?? []) as Gathering[]);
      setGists((gistRows ?? []) as RelationshipGist[]);
      setWarmIntros((warmIntroRows ?? []) as WarmIntro[]);
      setPicks(nextPicks);
      setImageUrls(nextImages);

      if (circlesCacheKey) {
        void writeCache(circlesCacheKey, {
          myCircles: memberships,
          discoverCircles: sortedDiscover,
          prompts: (promptRows ?? []) as CirclePrompt[],
          gatherings: (gatheringRows ?? []) as Gathering[],
          gists: (gistRows ?? []) as RelationshipGist[],
          warmIntros: (warmIntroRows ?? []) as WarmIntro[],
          picks: nextPicks,
          imageUrls: nextImages,
        });
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load Circles.');
    } finally {
      setLoading(false);
    }
  }, [circlesCacheKey, currentProfileId, loadCirclePicks, profile, refreshImageUrls, scope]);

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
    setCreateOpen(true);
  }, [canSubmitCircle]);

  const handleSubmitCircle = useCallback(async () => {
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
      Alert.alert('Answer shared', 'Your Circle Prompt answer is saved.');
    } catch (error) {
      Alert.alert('Circle Prompt', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [activePrompt?.id, promptAnswer]);

  const upcomingGathering = gatherings[0] ?? null;
  const warmIntro = warmIntros[0] ?? null;
  const gist = gists.find((item) => item.perspective === 'general') ?? gists[0] ?? null;
  const joinedCircles = myCircles.map((membership) => membership.circles).filter(Boolean) as CircleV2[];

  const renderCircleCard = (circle: CircleV2, mode: 'joined' | 'discover') => (
    <Pressable key={`${mode}:${circle.id}`} style={styles.circleCard} onPress={() => openCircle(circle.id)}>
      <View style={styles.circleImageWrap}>
        {imageUrls[circle.id] ? (
          <Image source={{ uri: imageUrls[circle.id] }} style={styles.circleImage} />
        ) : (
          <MaterialCommunityIcons name="account-group-outline" size={28} color={theme.textMuted} />
        )}
      </View>
      <View style={styles.circleCardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{circle.name}</Text>
          {circle.is_official ? <Text style={styles.trustPill}>Official</Text> : null}
          {circle.is_partner ? <Text style={styles.trustPill}>Partner</Text> : null}
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[circle.city, circle.country_name, `${circle.member_count ?? 0} members`].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.cardBody} numberOfLines={2}>
          {circle.short_description || circle.description || 'Trusted community space for intentional connection.'}
        </Text>
        <View style={styles.cardActions}>
          <Text style={styles.softBadge}>
            {mode === 'joined' ? 'Open' : circle.requires_join_approval ? 'Request to join' : 'Join'}
          </Text>
          {mode === 'discover' ? (
            <TouchableOpacity style={styles.joinButton} onPress={() => handleJoin(circle)}>
              <Text style={styles.joinButtonText}>{circle.requires_join_approval ? 'Request' : 'Join'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Circles</Text>
            <Text style={styles.headerSubtitle}>Community spaces for intentional connection.</Text>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={handleCreatePress}>
            <MaterialCommunityIcons name="plus" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
          {SCOPES.map((item) => {
            const active = item.key === scope;
            return (
              <Pressable
                key={item.key}
                style={[styles.scopePill, active && styles.scopePillActive]}
                onPress={() => setScope(item.key)}
              >
                <MaterialCommunityIcons name={item.icon} size={15} color={active ? '#071E22' : theme.textMuted} />
                <Text style={[styles.scopeText, active && styles.scopeTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loadError && joinedCircles.length === 0 && discoverCircles.length === 0 ? (
          <Notice
            title="Circles are taking a moment"
            message="We could not refresh the hub. Cached Circles will still appear when available."
            actionLabel="Retry"
            onAction={() => void loadCircles()}
            icon="cloud-alert"
          />
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Circles</Text>
            <Text style={styles.sectionHint}>{joinedCircles.length ? `${joinedCircles.length} joined` : 'Find your people'}</Text>
          </View>
          {joinedCircles.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
              {joinedCircles.map((circle) => renderCircleCard(circle, 'joined'))}
            </ScrollView>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Find your people</Text>
              <Text style={styles.emptyBody}>Join trusted spaces shaped around culture, values, lifestyle, and intent.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePress}>
                <Text style={styles.primaryButtonText}>Request a Circle</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Circle Picks</Text>
            <Text style={styles.sectionHint}>Shared context first</Text>
          </View>
          {picks.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
              {picks.map((item) => (
                <Pressable
                  key={item.profile_id}
                  style={styles.pickCard}
                  onPress={() => router.push({ pathname: '/profile-view', params: { profileId: item.profile_id } })}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.pickAvatar} />
                  ) : (
                    <View style={styles.pickAvatarFallback}>
                      <MaterialCommunityIcons name="account-heart-outline" size={28} color={theme.textMuted} />
                    </View>
                  )}
                  <Text style={styles.pickName} numberOfLines={1}>
                    {item.full_name ?? 'Member'}{item.age ? `, ${item.age}` : ''}
                  </Text>
                  <Text style={styles.pickCircle} numberOfLines={1}>{item.circleName}</Text>
                  <Text style={styles.pickReason} numberOfLines={2}>{item.reason}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.compactPanel}>
              <MaterialCommunityIcons name="account-search-outline" size={20} color={theme.tint} />
              <Text style={styles.compactText}>Join a Circle to unlock warmer profile suggestions.</Text>
            </View>
          )}
        </View>

        {warmIntro ? (
          <View style={styles.featuredPanel}>
            <Text style={styles.kicker}>Warm Introduction</Text>
            <Text style={styles.featuredTitle}>A Circle Host thinks you two may connect.</Text>
            <Text style={styles.featuredBody}>{warmIntro.reason}</Text>
            <View style={styles.featuredActions}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void handleWarmIntroDecision(warmIntro, 'accept')}>
                <Text style={styles.primaryButtonText}>Accept intro</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleWarmIntroDecision(warmIntro, 'decline')}>
                <Text style={styles.secondaryButtonText}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : upcomingGathering ? (
          <View style={styles.featuredPanel}>
            <Text style={styles.kicker}>Upcoming Gathering</Text>
            <Text style={styles.featuredTitle}>{upcomingGathering.title}</Text>
            <Text style={styles.featuredBody}>
              {[compactDate(upcomingGathering.starts_at), upcomingGathering.city, upcomingGathering.gathering_type].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.chipRow}>
              {upcomingGathering.is_partner_venue ? <Text style={styles.infoChip}>Partner venue</Text> : null}
              {upcomingGathering.safe_first_date_space ? <Text style={styles.infoChip}>Safe first-date space</Text> : null}
              <Text style={styles.infoChip}>{upcomingGathering.attendee_count ?? 0} attending</Text>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void handleAttend(upcomingGathering)}>
              <Text style={styles.primaryButtonText}>Attend</Text>
            </TouchableOpacity>
          </View>
        ) : activePrompt ? (
          <View style={styles.featuredPanel}>
            <Text style={styles.kicker}>Circle Prompt</Text>
            <Text style={styles.featuredTitle}>{activePrompt.title}</Text>
            <Text style={styles.featuredBody}>{activePrompt.prompt}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setPromptAnswerOpen(true)}>
              <Text style={styles.primaryButtonText}>Answer</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today in your Circles</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
            {activePrompt ? (
              <View style={styles.storyCard}>
                <Text style={styles.kicker}>Circle Prompt</Text>
                <Text style={styles.storyTitle} numberOfLines={2}>{activePrompt.prompt}</Text>
              </View>
            ) : null}
            {upcomingGathering ? (
              <View style={styles.storyCard}>
                <Text style={styles.kicker}>Gathering</Text>
                <Text style={styles.storyTitle} numberOfLines={2}>{upcomingGathering.title}</Text>
                <Text style={styles.cardMeta}>{compactDate(upcomingGathering.starts_at)}</Text>
              </View>
            ) : null}
            {gist ? (
              <View style={styles.storyCard}>
                <Text style={styles.kicker}>Relationship Gist</Text>
                <Text style={styles.storyTitle} numberOfLines={2}>{gist.title}</Text>
                <Text style={styles.cardMeta}>{gist.perspective ?? 'general'}</Text>
              </View>
            ) : null}
            {!activePrompt && !upcomingGathering && !gist ? (
              <View style={styles.storyCard}>
                <Text style={styles.kicker}>Quiet now</Text>
                <Text style={styles.storyTitle}>Fresh prompts and Gatherings will appear here.</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>

        {gist ? (
          <View style={styles.gistPanel}>
            <Text style={styles.kicker}>Relationship Gist</Text>
            <Text style={styles.featuredTitle}>{gist.title}</Text>
            <Text style={styles.featuredBody} numberOfLines={3}>{gist.short_body || gist.body}</Text>
            <Text style={styles.infoChip}>{gist.perspective ?? 'general'}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discover more Circles</Text>
            <Text style={styles.sectionHint}>{loading ? 'Refreshing' : `${discoverCircles.length} spaces`}</Text>
          </View>
          <View style={styles.discoverList}>
            {discoverCircles.slice(0, 8).map((circle) => renderCircleCard(circle, 'discover'))}
            {discoverCircles.length === 0 ? (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>No local Circles yet</Text>
                <Text style={styles.emptyBody}>Switch scope or request a values-led Circle for your community.</Text>
              </View>
            ) : null}
          </View>
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
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Request Circle</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Circle name"
              placeholderTextColor={theme.textMuted}
              style={styles.input}
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
            />
            <View style={styles.visibilityRow}>
              {(['country', 'local', 'diaspora', 'invite_only'] as const).map((item) => (
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
          </Pressable>
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

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#071E22' },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28, gap: 18 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { fontSize: 40, color: '#F4E8D0', fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { marginTop: 4, fontSize: 13, color: 'rgba(244,232,208,0.74)' },
    headerAction: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(19,168,168,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(19,168,168,0.35)',
    },
    scopeRow: { gap: 8, paddingRight: 18 },
    scopePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.13)',
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    scopePillActive: { backgroundColor: '#13A8A8', borderColor: '#13A8A8' },
    scopeText: { color: 'rgba(244,232,208,0.72)', fontSize: 12, fontWeight: '700' },
    scopeTextActive: { color: '#071E22' },
    section: { gap: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    sectionTitle: { color: '#F4E8D0', fontSize: 17, fontWeight: '800' },
    sectionHint: { color: 'rgba(244,232,208,0.58)', fontSize: 12, fontWeight: '600' },
    horizontalList: { gap: 12, paddingRight: 18 },
    circleCard: {
      width: 260,
      minHeight: 156,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(15,61,62,0.72)',
    },
    circleImageWrap: {
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(139,92,255,0.14)',
    },
    circleImage: { width: '100%', height: '100%' },
    circleCardBody: { padding: 12, gap: 7 },
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
    softBadge: { color: '#13A8A8', fontSize: 11, fontWeight: '800' },
    joinButton: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: 'rgba(19,168,168,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(19,168,168,0.45)',
    },
    joinButtonText: { color: '#A8F1EE', fontSize: 11, fontWeight: '800' },
    emptyPanel: {
      padding: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(15,61,62,0.54)',
      gap: 10,
    },
    emptyTitle: { color: '#F4E8D0', fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
    emptyBody: { color: 'rgba(244,232,208,0.7)', fontSize: 13, lineHeight: 19 },
    compactPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 13,
      borderRadius: 16,
      backgroundColor: 'rgba(15,61,62,0.5)',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.1)',
    },
    compactText: { flex: 1, color: 'rgba(244,232,208,0.72)', fontSize: 12 },
    pickCard: {
      width: 150,
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(255,255,255,0.045)',
      gap: 7,
    },
    pickAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.backgroundSubtle },
    pickAvatarFallback: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(244,232,208,0.08)',
    },
    pickName: { color: '#F4E8D0', fontSize: 13, fontWeight: '800' },
    pickCircle: { color: '#13A8A8', fontSize: 11, fontWeight: '700' },
    pickReason: { color: 'rgba(244,232,208,0.68)', fontSize: 11, lineHeight: 16 },
    featuredPanel: {
      padding: 17,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: 'rgba(19,168,168,0.3)',
      backgroundColor: isDark ? 'rgba(15,61,62,0.82)' : 'rgba(15,61,62,0.76)',
      gap: 10,
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
    gistPanel: {
      padding: 16,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: 'rgba(139,92,255,0.22)',
      backgroundColor: 'rgba(139,92,255,0.1)',
      gap: 9,
    },
    discoverList: { gap: 12 },
    primaryButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: '#13A8A8',
    },
    primaryButtonText: { color: '#071E22', fontSize: 12, fontWeight: '900' },
    secondaryButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.18)',
    },
    secondaryButtonText: { color: '#F4E8D0', fontSize: 12, fontWeight: '800' },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      padding: 20,
      backgroundColor: 'rgba(0,0,0,0.56)',
    },
    modalCard: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.14)',
      backgroundColor: '#0B2427',
      gap: 12,
    },
    modalTitle: { color: '#F4E8D0', fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
    modalBody: { color: 'rgba(244,232,208,0.72)', fontSize: 13, lineHeight: 20 },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(255,255,255,0.045)',
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: '#F4E8D0',
      fontSize: 13,
    },
    multiline: { minHeight: 92, textAlignVertical: 'top' },
    visibilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    visibilityPill: {
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    visibilityPillActive: { backgroundColor: '#13A8A8', borderColor: '#13A8A8' },
    visibilityText: { color: 'rgba(244,232,208,0.72)', fontSize: 11, fontWeight: '800' },
    visibilityTextActive: { color: '#071E22' },
    modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  });
