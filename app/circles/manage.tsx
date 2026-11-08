import { Colors } from '@/constants/theme';
import { CircleComposer } from '@/features/studio/circles/CircleComposer';
import { GatheringComposer } from '@/features/studio/gatherings/GatheringComposer';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResolvedProfileId } from '@/hooks/useResolvedProfileId';
import { useAuth } from '@/lib/auth-context';
import { useAdminAccess } from '@/lib/admin/admin-access';
import { canCreateCircle, canCreateGathering, type CircleAccessEntitlements } from '@/lib/circles/circle-access';
import {
  resolveLegacyCircleAudience,
  type CircleReachScope,
  type CircleAccessPolicy,
  type CircleLiveDiscoveryPolicy,
  type CircleMembershipEligibilityPolicy,
} from '@/lib/circles/circle-audience';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CreatorCircle = {
  id: string;
  name: string;
  description?: string | null;
  short_description?: string | null;
  city?: string | null;
  region?: string | null;
  country_name?: string | null;
  country_code?: string | null;
  status?: string | null;
  rejected_reason?: string | null;
  visibility_scope?: string | null;
  visibility?: string | null;
  requires_join_approval?: boolean | null;
  reach_scope?: string | null;
  reach_scopes?: string[] | null;
  access_policy?: string | null;
  diaspora_origin_country_codes?: string[] | null;
  diaspora_destination_country_codes?: string[] | null;
  membership_eligibility_policy?: string | null;
  live_discovery_policy?: string | null;
  circle_type?: string | null;
  created_at?: string | null;
};

type CreatorGathering = {
  id: string;
  circle_id?: string | null;
  title: string;
  description?: string | null;
  starts_at: string;
  city?: string | null;
  status?: string | null;
  venue_name?: string | null;
  gathering_type?: string | null;
  rejected_reason?: string | null;
  created_at?: string | null;
};

const db = supabase as any;

const compactDate = (value?: string | null) => {
  if (!value) return 'Soon';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Soon';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    case 'published':
      return 'Published';
    case 'archived':
      return 'Archived';
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return 'Completed';
    default:
      return 'In progress';
  }
};

export default function CircleGatheringStudioScreen() {
  const { profile, user } = useAuth();
  const createIntent = useLocalSearchParams<{ create?: string; circleId?: string }>();
  const { profileId: currentProfileId } = useResolvedProfileId(user?.id ?? null, profile?.id ?? null);
  const adminAccess = useAdminAccess();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [creatorCircles, setCreatorCircles] = useState<CreatorCircle[]>([]);
  const [creatorGatherings, setCreatorGatherings] = useState<CreatorGathering[]>([]);
  const [premiumState, setPremiumState] = useState<CircleAccessEntitlements | null>(null);
  const [entitlementsLoaded, setEntitlementsLoaded] = useState(false);
  const [creatorDataLoaded, setCreatorDataLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [gatheringOpen, setGatheringOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingGathering, setCreatingGathering] = useState(false);
  const [editingCircleId, setEditingCircleId] = useState<string | null>(null);
  const [editingCircleStatus, setEditingCircleStatus] = useState<string | null>(null);
  const [editingGatheringId, setEditingGatheringId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const [newCity, setNewCity] = useState(profile?.city ?? '');
  const [newRegion, setNewRegion] = useState(String((profile as any)?.region ?? ''));
  const [newReachScope, setNewReachScope] = useState<CircleReachScope>('country');
  const [newReachScopes, setNewReachScopes] = useState<CircleReachScope[]>(['country']);
  const [newAccessPolicy, setNewAccessPolicy] = useState<CircleAccessPolicy>('open');
  const [newCountryCode, setNewCountryCode] = useState(String((profile as any)?.current_country_code ?? ''));
  const [newCountryName, setNewCountryName] = useState(String((profile as any)?.current_country ?? ''));
  const [newDiasporaOriginCountryCodes, setNewDiasporaOriginCountryCodes] = useState<string[]>([]);
  const [newDiasporaDestinationCountryCodes, setNewDiasporaDestinationCountryCodes] = useState<string[]>([]);
  const [newMembershipEligibilityPolicy, setNewMembershipEligibilityPolicy] = useState<CircleMembershipEligibilityPolicy>('recommend_only');
  const [newLiveDiscoveryPolicy, setNewLiveDiscoveryPolicy] = useState<CircleLiveDiscoveryPolicy>('members_only');
  const [newGatheringTitle, setNewGatheringTitle] = useState('');
  const [newGatheringDescription, setNewGatheringDescription] = useState('');
  const [newGatheringDate, setNewGatheringDate] = useState('');
  const [newGatheringTime, setNewGatheringTime] = useState('');
  const [newGatheringCity, setNewGatheringCity] = useState(profile?.city ?? '');
  const [newGatheringVenue, setNewGatheringVenue] = useState('');
  const [newGatheringType, setNewGatheringType] = useState<'physical' | 'online' | 'hybrid'>('physical');
  const [newGatheringCircleId, setNewGatheringCircleId] = useState<string | null>(null);
  const createIntentHandledRef = useRef<string | null>(null);
  const isAdmin = adminAccess.can('community');

  useEffect(() => {
    let cancelled = false;
    setEntitlementsLoaded(false);
    if (!user?.id) {
      setEntitlementsLoaded(true);
      return;
    }
    void (async () => {
      const { data: premium } = await db.rpc('rpc_get_my_premium_state');
      if (cancelled) return;
      setPremiumState(premium ?? null);
      setEntitlementsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const loadCreatorData = useCallback(async () => {
    if (!currentProfileId) return;
    setLoading(true);
    try {
      const [{ data: circles }, { data: gatherings }] = await Promise.all([
        db
          .from('circles')
          .select('id,name,description,short_description,city,region,country_code,country_name,status,rejected_reason,visibility,visibility_scope,requires_join_approval,reach_scope,reach_scopes,access_policy,diaspora_origin_country_codes,diaspora_destination_country_codes,membership_eligibility_policy,live_discovery_policy,circle_type,created_at')
          .eq('created_by_profile_id', currentProfileId)
          .in('status', ['draft', 'pending_review', 'approved', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(20),
        db
          .from('gatherings')
          .select('id,circle_id,title,description,starts_at,city,status,venue_name,gathering_type,rejected_reason,created_at')
          .eq('created_by_profile_id', currentProfileId)
          .in('status', ['draft', 'pending_review', 'approved', 'rejected', 'cancelled', 'completed'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setCreatorCircles((circles ?? []) as CreatorCircle[]);
      setCreatorGatherings((gatherings ?? []) as CreatorGathering[]);
    } catch (error) {
      Alert.alert('Circle & Gathering Studio', error instanceof Error ? error.message : 'Could not load your submissions.');
    } finally {
      setLoading(false);
      setCreatorDataLoaded(true);
    }
  }, [currentProfileId, isAdmin]);

  useEffect(() => {
    void loadCreatorData();
  }, [loadCreatorData]);

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
  const approvedCreatorCircles = creatorCircles.filter((circle) => circle.status === 'approved');
  const circleNameById = useMemo(
    () => creatorCircles.reduce<Record<string, string>>((acc, circle) => {
      acc[circle.id] = circle.name;
      return acc;
    }, {}),
    [creatorCircles],
  );
  const pendingReviewCount = creatorCircles.filter((circle) => circle.status === 'pending_review').length
    + creatorGatherings.filter((gathering) => gathering.status === 'pending_review').length;
  const approvedGatheringCount = creatorGatherings.filter((gathering) => gathering.status === 'approved').length;

  const openCircle = useCallback((circleId?: string | null, tab?: 'overview' | 'members' | 'prompts' | 'gatherings' | 'moments' | 'gist') => {
    if (!circleId) return;
    router.push({ pathname: '/circles/[id]', params: { id: String(circleId), ...(tab ? { tab } : {}) } });
  }, []);

  const openCreateCircle = useCallback(() => {
    if (!canSubmitCircle) {
      router.push('/premium-plans');
      return;
    }
    setNewName('');
    setNewPurpose('');
    setNewCity(profile?.city ?? '');
    setNewRegion(String((profile as any)?.region ?? ''));
    setNewReachScope('country');
    setNewReachScopes(['country']);
    setNewAccessPolicy('open');
    setNewCountryCode(String((profile as any)?.current_country_code ?? ''));
    setNewCountryName(String((profile as any)?.current_country ?? ''));
    setNewDiasporaOriginCountryCodes([]);
    setNewDiasporaDestinationCountryCodes([]);
    setNewMembershipEligibilityPolicy('recommend_only');
    setNewLiveDiscoveryPolicy('members_only');
    setEditingCircleId(null);
    setEditingCircleStatus(null);
    setCreateOpen(true);
  }, [canSubmitCircle, profile]);

  const openCreateGathering = useCallback((preferredCircleId?: string | null) => {
    if (!canSubmitGathering) {
      router.push('/premium-plans');
      return;
    }
    setNewGatheringTitle('');
    setNewGatheringDescription('');
    setNewGatheringDate('');
    setNewGatheringTime('');
    setNewGatheringCity(profile?.city ?? '');
    setNewGatheringVenue('');
    setNewGatheringType('physical');
    setNewGatheringCircleId(preferredCircleId ?? approvedCreatorCircles[0]?.id ?? null);
    setEditingGatheringId(null);
    setGatheringOpen(true);
  }, [approvedCreatorCircles, canSubmitGathering, profile?.city]);

  useEffect(() => {
    const intentKey = `${createIntent.create ?? ''}:${createIntent.circleId ?? ''}`;
    if (createIntentHandledRef.current === intentKey || !entitlementsLoaded || adminAccess.loading || !creatorDataLoaded) return;
    if (createIntent.create !== 'circle' && createIntent.create !== 'gathering') return;
    createIntentHandledRef.current = intentKey;
    if (createIntent.create === 'circle') {
      openCreateCircle();
      return;
    }
    openCreateGathering(createIntent.circleId ?? null);
  }, [adminAccess.loading, createIntent.circleId, createIntent.create, creatorDataLoaded, entitlementsLoaded, openCreateCircle, openCreateGathering]);

  const prefillCircleRequest = useCallback((circle: CreatorCircle) => {
    const audience = resolveLegacyCircleAudience(circle);
    setEditingCircleId(circle.id);
    setEditingCircleStatus(circle.status ?? null);
    setNewName(circle.name ?? '');
    setNewPurpose(circle.description ?? circle.short_description ?? '');
    setNewCity(circle.city ?? (profile?.city ?? ''));
    setNewRegion(circle.region ?? String((profile as any)?.region ?? ''));
    setNewCountryCode(circle.country_code ?? String((profile as any)?.current_country_code ?? ''));
    setNewCountryName(circle.country_name ?? String((profile as any)?.current_country ?? ''));
    setNewReachScope(audience.reachScope);
    setNewReachScopes(audience.reachScopes);
    setNewAccessPolicy(audience.accessPolicy);
    setNewDiasporaOriginCountryCodes(circle.diaspora_origin_country_codes ?? []);
    setNewDiasporaDestinationCountryCodes(circle.diaspora_destination_country_codes ?? []);
    setNewMembershipEligibilityPolicy(circle.membership_eligibility_policy === 'target_only' ? 'target_only' : 'recommend_only');
    setNewLiveDiscoveryPolicy(circle.live_discovery_policy === 'discoverable_join_required' ? 'discoverable_join_required' : 'members_only');
    setCreateOpen(true);
  }, [profile]);

  const prefillGatheringRequest = useCallback((gathering: CreatorGathering) => {
    setEditingGatheringId(gathering.id);
    setNewGatheringTitle(gathering.title ?? '');
    setNewGatheringDescription(gathering.description ?? '');
    setNewGatheringCity(gathering.city ?? (profile?.city ?? ''));
    setNewGatheringVenue(gathering.venue_name ?? '');
    setNewGatheringType(['physical', 'online', 'hybrid'].includes(String(gathering.gathering_type ?? ''))
      ? (gathering.gathering_type as 'physical' | 'online' | 'hybrid')
      : 'physical');
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

  const openGatheringSubmission = useCallback((gathering: CreatorGathering, mode: 'open' | 'edit' = 'open') => {
    if (gathering.circle_id) {
      openCircle(gathering.circle_id, 'gatherings');
      return;
    }
    if (mode === 'edit' || !gathering.circle_id) {
      prefillGatheringRequest(gathering);
    }
  }, [openCircle, prefillGatheringRequest]);

  const handleSubmitCircle = useCallback(async () => {
    Keyboard.dismiss();
    const name = newName.trim();
    const purpose = newPurpose.trim();
    const hasGlobalReach = newReachScopes.includes('global');
    const hasCountryReach = newReachScopes.includes('country');
    const hasLocalReach = newReachScopes.includes('local');
    const hasLocationReach = hasCountryReach || hasLocalReach;
    const hasDiasporaReach = newReachScopes.includes('diaspora');
    if (!name || name.length < 3) {
      Alert.alert('Circle name', 'Add a clear Circle name.');
      return;
    }
    if (!purpose || purpose.length < 10) {
      Alert.alert('Circle purpose', 'Add a short purpose so Betweener can review it.');
      return;
    }
    if (!hasGlobalReach && (hasLocationReach || hasDiasporaReach) && !/^[A-Z]{2}$/.test(newCountryCode.trim().toUpperCase())) {
      Alert.alert('Circle country', 'Add the two-letter country code for the audience this Circle serves.');
      return;
    }
    if (!hasGlobalReach && (hasLocationReach || hasDiasporaReach) && !newCountryName.trim()) {
      Alert.alert('Circle country', 'Add the country name for this Circle.');
      return;
    }
    if (hasLocalReach && !newCity.trim()) {
      Alert.alert('Circle city', 'Add the city this local Circle serves.');
      return;
    }
    if (hasDiasporaReach && newDiasporaOriginCountryCodes.length === 0) {
      Alert.alert('Diaspora origin', 'Add at least one heritage country code, for example GH.');
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const rpcName = editingCircleId ? 'rpc_update_circle_request_v3' : 'rpc_create_circle_request_v3';
      const { error } = await db.rpc(rpcName, {
        ...(editingCircleId ? { p_circle_id: editingCircleId } : {}),
        p_name: name,
        p_description: purpose,
        p_short_description: purpose.slice(0, 140),
        p_circle_type: isAdmin ? 'official' : 'gold_community',
        p_reach_scope: newReachScope,
        p_reach_scopes: newReachScopes,
        p_access_policy: newAccessPolicy,
        p_country_code: hasGlobalReach ? null : newCountryCode.trim().toUpperCase(),
        p_country_name: hasGlobalReach ? null : newCountryName.trim(),
        p_region: hasLocalReach ? newRegion.trim() || null : null,
        p_city: hasLocalReach ? newCity.trim() : null,
        p_diaspora_origin_country_codes: hasDiasporaReach ? newDiasporaOriginCountryCodes : [],
        p_diaspora_destination_country_codes: hasDiasporaReach ? newDiasporaDestinationCountryCodes : [],
        p_membership_eligibility_policy: newMembershipEligibilityPolicy,
        p_live_discovery_policy: newAccessPolicy === 'invite_only' ? 'members_only' : newLiveDiscoveryPolicy,
        p_culture_tags: [],
        p_faith_tags: [],
        p_interest_tags: [],
        p_audience_tags: [],
        p_rules: null,
      });
      if (error) throw error;
      setCreateOpen(false);
      setEditingCircleId(null);
      setEditingCircleStatus(null);
      await loadCreatorData();
      Alert.alert(
        isAdmin
          ? 'Circle published'
          : editingCircleId
            ? editingCircleStatus === 'approved'
              ? 'Changes sent for review'
              : 'Resubmitted for review'
            : 'Submitted for review',
        isAdmin
          ? 'Your official Circle is live.'
          : editingCircleId
            ? editingCircleStatus === 'approved'
              ? 'Your Circle changes were saved. Once reviewed, the updated details will go live.'
              : 'Your Circle changes were saved and sent back for review.'
            : "We'll notify you once Betweener approves it.",
      );
    } catch (error) {
      Alert.alert('Circle request failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreating(false);
    }
  }, [creating, editingCircleId, editingCircleStatus, isAdmin, loadCreatorData, newAccessPolicy, newCity, newCountryCode, newCountryName, newDiasporaDestinationCountryCodes, newDiasporaOriginCountryCodes, newLiveDiscoveryPolicy, newMembershipEligibilityPolicy, newName, newPurpose, newReachScope, newReachScopes, newRegion]);

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
      const rpcName = editingGatheringId ? 'rpc_update_gathering_request' : 'rpc_create_gathering_request';
      const { error } = await db.rpc(rpcName, {
        ...(editingGatheringId ? { p_gathering_id: editingGatheringId } : {}),
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
      setEditingGatheringId(null);
      await loadCreatorData();
      Alert.alert(
        isAdmin ? 'Gathering published' : editingGatheringId ? 'Resubmitted for review' : 'Submitted for review',
        isAdmin ? 'Your Gathering is live.' : editingGatheringId ? 'Your Gathering changes were saved and sent back for review.' : "We'll notify you once Betweener approves it.",
      );
    } catch (error) {
      Alert.alert('Gathering could not be submitted', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreatingGathering(false);
    }
  }, [
    creatingGathering,
    editingGatheringId,
    isAdmin,
    loadCreatorData,
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Circle & Gathering Studio</Text>
          <Text style={styles.headerSubtitle}>Create trusted spaces and events, then follow them through review.</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={() => void loadCreatorData()}>
            <MaterialCommunityIcons name="refresh" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>Community creation</Text>
          <Text style={styles.heroTitle}>Create and refine the spaces and events you want Betweener to stand behind.</Text>
          <Text style={styles.heroBody}>Track review states, refine your ideas, and resubmit with stronger details when needed.</Text>
          <View style={styles.snapshotRow}>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{approvedCreatorCircles.length}</Text>
              <Text style={styles.snapshotLabel}>Live Circles</Text>
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{approvedGatheringCount}</Text>
              <Text style={styles.snapshotLabel}>Published Gatherings</Text>
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{creatorCircles.length + creatorGatherings.length}</Text>
              <Text style={styles.snapshotLabel}>Total submissions</Text>
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{pendingReviewCount}</Text>
              <Text style={styles.snapshotLabel}>In Review</Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={openCreateCircle}>
              <Text style={styles.primaryText}>Create Circle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openCreateGathering()}>
              <Text style={styles.secondaryText}>Create Gathering</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Circle submissions</Text>
            <Text style={styles.sectionHint}>{loading ? 'Refreshing' : `${creatorCircles.length} items`}</Text>
          </View>
          {creatorCircles.length ? creatorCircles.map((circle) => (
            <View key={circle.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>Circle</Text>
                <Text style={styles.statusPill}>{creatorStatusLabel(circle.status)}</Text>
              </View>
              <Text style={styles.cardTitle}>{circle.name}</Text>
              <Text style={styles.cardMeta}>
                {[circle.city, circle.country_name, circle.visibility_scope].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.cardBody}>{circle.short_description || circle.description || 'Awaiting curation details.'}</Text>
              {circle.rejected_reason ? <Text style={styles.warningText}>Reason: {circle.rejected_reason}</Text> : null}
              <View style={styles.cardActions}>
                {['draft', 'pending_review', 'rejected', 'approved'].includes(String(circle.status ?? '')) ? (
                  <TouchableOpacity
                    style={circle.status === 'rejected' ? styles.primaryButton : styles.secondaryButton}
                    onPress={() => prefillCircleRequest(circle)}
                  >
                    <Text style={circle.status === 'rejected' ? styles.primaryText : styles.secondaryText}>
                      {circle.status === 'approved' ? 'Edit Circle' : circle.status === 'rejected' ? 'Edit and resubmit' : 'Open request'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Circle submissions yet</Text>
              <Text style={styles.emptyBody}>Request your first trusted Circle when you are ready to host with clear intent.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Gathering submissions</Text>
            <Text style={styles.sectionHint}>{loading ? 'Refreshing' : `${creatorGatherings.length} items`}</Text>
          </View>
          {creatorGatherings.length ? creatorGatherings.map((gathering) => (
            <View key={gathering.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>Gathering</Text>
                <Text style={styles.statusPill}>{creatorStatusLabel(gathering.status)}</Text>
              </View>
              <Text style={styles.cardTitle}>{gathering.title}</Text>
              <Text style={styles.cardMeta}>
                {[compactDate(gathering.starts_at), gathering.city, gathering.venue_name].filter(Boolean).join(' · ')}
              </Text>
              {gathering.circle_id ? (
                <Text style={styles.linkedMeta}>Linked Circle: {circleNameById[gathering.circle_id] ?? 'Circle event'}</Text>
              ) : null}
              <Text style={styles.cardBody}>{gathering.description || 'Awaiting curation details.'}</Text>
              {gathering.rejected_reason ? <Text style={styles.warningText}>Reason: {gathering.rejected_reason}</Text> : null}
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => openGatheringSubmission(gathering, 'open')}>
                  <Text style={styles.secondaryText}>{gathering.circle_id ? 'Open Circle' : 'Open request'}</Text>
                </TouchableOpacity>
                {['draft', 'pending_review', 'approved', 'rejected'].includes(String(gathering.status ?? '')) ? (
                  <TouchableOpacity
                    style={gathering.status === 'rejected' ? styles.primaryButton : styles.secondaryButton}
                    onPress={() => openGatheringSubmission(gathering, 'edit')}
                  >
                    <Text style={gathering.status === 'rejected' ? styles.primaryText : styles.secondaryText}>
                      {gathering.circle_id
                        ? 'Edit in Circle'
                        : gathering.status === 'rejected'
                          ? 'Edit and resubmit'
                          : 'Edit'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Gathering submissions yet</Text>
              <Text style={styles.emptyBody}>Create your first trusted event when you have a clear reason for people to attend.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <CircleComposer
        visible={createOpen}
        name={newName}
        purpose={newPurpose}
        city={newCity}
        region={newRegion}
        countryCode={newCountryCode}
        countryName={newCountryName}
        reachScope={newReachScope}
        reachScopes={newReachScopes}
        accessPolicy={newAccessPolicy}
        diasporaOriginCountryCodes={newDiasporaOriginCountryCodes}
        diasporaDestinationCountryCodes={newDiasporaDestinationCountryCodes}
        membershipEligibilityPolicy={newMembershipEligibilityPolicy}
        liveDiscoveryPolicy={newLiveDiscoveryPolicy}
        editing={Boolean(editingCircleId)}
        editingApproved={editingCircleStatus === 'approved'}
        saving={creating}
        onNameChange={setNewName}
        onPurposeChange={setNewPurpose}
        onCityChange={setNewCity}
        onRegionChange={setNewRegion}
        onCountryChange={(code, name) => {
          setNewCountryCode(code);
          setNewCountryName(name);
        }}
        onReachScopeChange={(value) => {
          setNewReachScope(value);
          if (value === 'diaspora' && newDiasporaOriginCountryCodes.length === 0 && /^[A-Z]{2}$/.test(newCountryCode)) {
            setNewDiasporaOriginCountryCodes([newCountryCode]);
          }
        }}
        onReachScopesChange={(values) => {
          setNewReachScopes(values);
          if (values.includes('diaspora') && newDiasporaOriginCountryCodes.length === 0 && /^[A-Z]{2}$/.test(newCountryCode)) {
            setNewDiasporaOriginCountryCodes([newCountryCode]);
          }
        }}
        onAccessPolicyChange={(value) => {
          setNewAccessPolicy(value);
          if (value === 'invite_only') setNewLiveDiscoveryPolicy('members_only');
        }}
        onDiasporaOriginCountryCodesChange={setNewDiasporaOriginCountryCodes}
        onDiasporaDestinationCountryCodesChange={setNewDiasporaDestinationCountryCodes}
        onMembershipEligibilityPolicyChange={setNewMembershipEligibilityPolicy}
        onLiveDiscoveryPolicyChange={setNewLiveDiscoveryPolicy}
        onClose={() => { setCreateOpen(false); setEditingCircleId(null); setEditingCircleStatus(null); }}
        onSubmit={() => void handleSubmitCircle()}
      />

      <GatheringComposer
        visible={gatheringOpen}
        title={newGatheringTitle}
        description={newGatheringDescription}
        date={newGatheringDate}
        time={newGatheringTime}
        city={newGatheringCity}
        venue={newGatheringVenue}
        format={newGatheringType}
        circleId={newGatheringCircleId}
        circles={approvedCreatorCircles}
        editing={Boolean(editingGatheringId)}
        saving={creatingGathering}
        onTitleChange={setNewGatheringTitle}
        onDescriptionChange={setNewGatheringDescription}
        onDateChange={setNewGatheringDate}
        onTimeChange={setNewGatheringTime}
        onCityChange={setNewGatheringCity}
        onVenueChange={setNewGatheringVenue}
        onFormatChange={setNewGatheringType}
        onCircleChange={setNewGatheringCircleId}
        onClose={() => { setGatheringOpen(false); setEditingGatheringId(null); }}
        onSubmit={() => void handleSubmitGathering()}
      />
    </SafeAreaView>
  );
}

const createStyles = (_theme: typeof Colors.light, _isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#071E22' },
    content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28, gap: 20 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.1)',
    },
    refreshButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(19,168,168,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(19,168,168,0.24)',
    },
    headerCopy: { flex: 1, gap: 4 },
    headerTitle: { color: '#F4E8D0', fontSize: 26, fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { color: 'rgba(244,232,208,0.7)', fontSize: 12, lineHeight: 18 },
    heroCard: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: 'rgba(12,39,43,0.9)',
      gap: 12,
    },
    heroKicker: { color: '#13A8A8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
    heroTitle: { color: '#F4E8D0', fontSize: 22, lineHeight: 28, fontFamily: 'PlayfairDisplay_700Bold' },
    heroBody: { color: 'rgba(244,232,208,0.74)', fontSize: 13, lineHeight: 19 },
    snapshotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    snapshotCard: {
      minWidth: 132,
      flexGrow: 1,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.1)',
      backgroundColor: 'rgba(255,255,255,0.03)',
      gap: 3,
    },
    snapshotValue: { color: '#F4E8D0', fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
    snapshotLabel: { color: 'rgba(244,232,208,0.64)', fontSize: 11, fontWeight: '700' },
    heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    section: { gap: 12 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    sectionTitle: { color: '#F4E8D0', fontSize: 17, fontWeight: '800' },
    sectionHint: { color: 'rgba(244,232,208,0.58)', fontSize: 12, fontWeight: '600' },
    card: {
      padding: 15,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.1)',
      backgroundColor: 'rgba(9,32,36,0.94)',
      gap: 10,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardType: { color: '#13A8A8', fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
    statusPill: {
      color: '#F4E8D0',
      fontSize: 10,
      fontWeight: '800',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: 'rgba(139,92,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(139,92,255,0.28)',
    },
    cardTitle: { color: '#F4E8D0', fontSize: 16, fontWeight: '800' },
    cardMeta: { color: 'rgba(244,232,208,0.62)', fontSize: 12 },
    linkedMeta: { color: '#13A8A8', fontSize: 11, fontWeight: '700' },
    cardBody: { color: 'rgba(244,232,208,0.76)', fontSize: 13, lineHeight: 19 },
    warningText: { color: '#F6B885', fontSize: 11, lineHeight: 16, fontWeight: '700' },
    cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    emptyCard: {
      padding: 18,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.1)',
      backgroundColor: 'rgba(12,39,43,0.82)',
      gap: 10,
    },
    emptyTitle: { color: '#F4E8D0', fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
    emptyBody: { color: 'rgba(244,232,208,0.72)', fontSize: 13, lineHeight: 19 },
    primaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: '#13A8A8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: '#071E22', fontSize: 12, fontWeight: '800' },
    secondaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.14)',
      backgroundColor: 'rgba(255,255,255,0.04)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: '#F4E8D0', fontSize: 12, fontWeight: '800' },
  });
