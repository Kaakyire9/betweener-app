import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { canCreateCircle, canCreateGathering, type CircleAccessEntitlements } from '@/lib/circles/circle-access';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type CreatorCircle = {
  id: string;
  name: string;
  description?: string | null;
  short_description?: string | null;
  city?: string | null;
  country_name?: string | null;
  status?: string | null;
  rejected_reason?: string | null;
  visibility_scope?: string | null;
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

type CreatorGist = {
  id: string;
  circle_id?: string | null;
  title: string;
  short_body?: string | null;
  body?: string | null;
  perspective?: string | null;
  status?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const db = supabase as any;
const GIST_PERSPECTIVES = ['general', 'christian', 'muslim', 'culture', 'safety', 'communication'] as const;

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

export default function CircleCreatorManageScreen() {
  const { profile, user } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(profile?.id ?? null);
  const currentProfileId = resolvedProfileId;
  const [creatorCircles, setCreatorCircles] = useState<CreatorCircle[]>([]);
  const [creatorGatherings, setCreatorGatherings] = useState<CreatorGathering[]>([]);
  const [creatorGists, setCreatorGists] = useState<CreatorGist[]>([]);
  const [premiumState, setPremiumState] = useState<CircleAccessEntitlements | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [gatheringOpen, setGatheringOpen] = useState(false);
  const [gistEditorOpen, setGistEditorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingGathering, setCreatingGathering] = useState(false);
  const [savingGist, setSavingGist] = useState(false);
  const [editingCircleId, setEditingCircleId] = useState<string | null>(null);
  const [editingGatheringId, setEditingGatheringId] = useState<string | null>(null);
  const [editingGistId, setEditingGistId] = useState<string | null>(null);
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
  const [gistTitleDraft, setGistTitleDraft] = useState('');
  const [gistShortBodyDraft, setGistShortBodyDraft] = useState('');
  const [gistBodyDraft, setGistBodyDraft] = useState('');
  const [gistPerspectiveDraft, setGistPerspectiveDraft] = useState<(typeof GIST_PERSPECTIVES)[number]>('general');

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

  const loadCreatorData = useCallback(async () => {
    if (!currentProfileId) return;
    setLoading(true);
    try {
      const [{ data: circles }, { data: gatherings }, gistResponse] = await Promise.all([
        db
          .from('circles')
          .select('id,name,description,short_description,city,country_name,status,rejected_reason,visibility_scope,circle_type,created_at')
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
        isAdmin
          ? db.rpc('rpc_admin_get_relationship_gists')
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (gistResponse?.error) throw gistResponse.error;

      setCreatorCircles((circles ?? []) as CreatorCircle[]);
      setCreatorGatherings((gatherings ?? []) as CreatorGathering[]);
      setCreatorGists((gistResponse?.data ?? []) as CreatorGist[]);
    } catch (error) {
      Alert.alert('Creator studio', error instanceof Error ? error.message : 'Could not load your submissions.');
    } finally {
      setLoading(false);
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
    setNewScope('country');
    setEditingCircleId(null);
    setCreateOpen(true);
  }, [canSubmitCircle, profile?.city]);

  const openCreateGathering = useCallback(() => {
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
    setNewGatheringCircleId(approvedCreatorCircles[0]?.id ?? null);
    setEditingGatheringId(null);
    setGatheringOpen(true);
  }, [approvedCreatorCircles, canSubmitGathering, profile?.city]);

  const prefillCircleRequest = useCallback((circle: CreatorCircle) => {
    setEditingCircleId(circle.id);
    setNewName(circle.name ?? '');
    setNewPurpose(circle.description ?? circle.short_description ?? '');
    setNewCity(circle.city ?? (profile?.city ?? ''));
    setNewScope(['country', 'local', 'diaspora', 'global', 'invite_only'].includes(String(circle.visibility_scope ?? ''))
      ? (circle.visibility_scope as 'country' | 'local' | 'diaspora' | 'global' | 'invite_only')
      : 'country');
    setCreateOpen(true);
  }, [profile?.city]);

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

  const resetGistEditor = useCallback(() => {
    setEditingGistId(null);
    setGistTitleDraft('');
    setGistShortBodyDraft('');
    setGistBodyDraft('');
    setGistPerspectiveDraft('general');
  }, []);

  const openCreateGist = useCallback(() => {
    resetGistEditor();
    setGistEditorOpen(true);
  }, [resetGistEditor]);

  const openEditGist = useCallback((gist: CreatorGist) => {
    setEditingGistId(gist.id);
    setGistTitleDraft(gist.title ?? '');
    setGistShortBodyDraft(gist.short_body ?? '');
    setGistBodyDraft(gist.body ?? '');
    setGistPerspectiveDraft(
      GIST_PERSPECTIVES.includes(String(gist.perspective ?? '').toLowerCase() as (typeof GIST_PERSPECTIVES)[number])
        ? (String(gist.perspective ?? '').toLowerCase() as (typeof GIST_PERSPECTIVES)[number])
        : 'general',
    );
    setGistEditorOpen(true);
  }, []);

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
      const rpcName = editingCircleId ? 'rpc_update_circle_request' : 'rpc_create_circle_request';
      const { error } = await db.rpc(rpcName, {
        ...(editingCircleId ? { p_circle_id: editingCircleId } : {}),
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
      setEditingCircleId(null);
      await loadCreatorData();
      Alert.alert(
        isAdmin ? 'Circle published' : editingCircleId ? 'Resubmitted for review' : 'Submitted for review',
        isAdmin ? 'Your official Circle is live.' : editingCircleId ? 'Your Circle changes were saved and sent back for review.' : "We'll notify you once Betweener approves it.",
      );
    } catch (error) {
      Alert.alert('Circle request failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreating(false);
    }
  }, [creating, editingCircleId, isAdmin, loadCreatorData, newCity, newName, newPurpose, newScope, profile]);

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
      Alert.alert('Gathering request failed', error instanceof Error ? error.message : 'Please try again.');
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

  const handleSaveGist = useCallback(async (status: 'draft' | 'published') => {
    Keyboard.dismiss();
    const title = gistTitleDraft.trim();
    const shortBody = gistShortBodyDraft.trim();
    const body = gistBodyDraft.trim();
    if (!currentProfileId) {
      Alert.alert('Relationship Gist', 'Your profile is still loading. Try again in a moment.');
      return;
    }
    if (!title || title.length < 3) {
      Alert.alert('Relationship Gist', 'Add a clear gist title.');
      return;
    }
    if (!body || body.length < 20) {
      Alert.alert('Relationship Gist', 'Add fuller guidance before saving.');
      return;
    }
    if (savingGist) return;
    setSavingGist(true);
    try {
      const { error } = await db.rpc('rpc_upsert_relationship_gist_editorial', {
        p_gist_id: editingGistId,
        p_actor_profile_id: currentProfileId,
        p_title: title,
        p_short_body: shortBody || null,
        p_body: body,
        p_perspective: gistPerspectiveDraft,
        p_status: status,
      });
      if (error) throw error;
      setGistEditorOpen(false);
      resetGistEditor();
      await loadCreatorData();
      Alert.alert(
        status === 'published' ? 'Gist published' : 'Draft saved',
        status === 'published'
          ? 'This Relationship Gist is now live for everyone on Betweener.'
          : 'Your editorial draft was saved.',
      );
    } catch (error) {
      Alert.alert('Relationship Gist', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingGist(false);
    }
  }, [
    currentProfileId,
    editingGistId,
    gistBodyDraft,
    gistPerspectiveDraft,
    gistShortBodyDraft,
    gistTitleDraft,
    loadCreatorData,
    resetGistEditor,
    savingGist,
  ]);

  const handleDeleteGist = useCallback(() => {
    if (!editingGistId || !currentProfileId || savingGist) return;
    Alert.alert('Delete Gist', 'This will remove the Gist from the live editorial flow.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSavingGist(true);
            try {
              const { error } = await db.rpc('rpc_archive_relationship_gist_editorial', {
                p_gist_id: editingGistId,
                p_actor_profile_id: currentProfileId,
              });
              if (error) throw error;
              setGistEditorOpen(false);
              resetGistEditor();
              await loadCreatorData();
              Alert.alert('Gist deleted', 'The editorial entry has been removed.');
            } catch (error) {
              Alert.alert('Delete failed', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setSavingGist(false);
            }
          })();
        },
      },
    ]);
  }, [currentProfileId, editingGistId, loadCreatorData, resetGistEditor, savingGist]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Creator Studio</Text>
            <Text style={styles.headerSubtitle}>
              {isAdmin ? 'Manage Circle requests, Gathering requests, and global Relationship Gist editorial.' : 'Manage your Circle and Gathering submissions.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={() => void loadCreatorData()}>
            <MaterialCommunityIcons name="refresh" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>Trusted creation</Text>
          <Text style={styles.heroTitle}>Request, review, and refine the spaces you want Betweener to stand behind.</Text>
          <Text style={styles.heroBody}>
            {isAdmin
              ? 'Keep public creation curated. Review community submissions and publish only the Relationship Gists strong enough for every member on Betweener.'
              : 'Keep public community creation curated. Use this studio to track review states and resubmit with stronger details when needed.'}
          </Text>
          <View style={styles.snapshotRow}>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{approvedCreatorCircles.length}</Text>
              <Text style={styles.snapshotLabel}>Live Circles</Text>
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{approvedGatheringCount}</Text>
              <Text style={styles.snapshotLabel}>Live Gatherings</Text>
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{isAdmin ? creatorGists.filter((gist) => gist.status === 'published').length : creatorGists.length}</Text>
              <Text style={styles.snapshotLabel}>{isAdmin ? 'Live Gists' : 'Published Gists'}</Text>
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotValue}>{pendingReviewCount}</Text>
              <Text style={styles.snapshotLabel}>In Review</Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={openCreateCircle}>
              <Text style={styles.primaryText}>Request Circle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={openCreateGathering}>
              <Text style={styles.secondaryText}>Request Gathering</Text>
            </TouchableOpacity>
            {isAdmin ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={openCreateGist}>
                <Text style={styles.secondaryText}>Write Gist</Text>
              </TouchableOpacity>
            ) : null}
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
                {circle.status === 'approved' ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => openCircle(circle.id, 'overview')}>
                    <Text style={styles.secondaryText}>Open Circle</Text>
                  </TouchableOpacity>
                ) : null}
                {['draft', 'pending_review', 'rejected'].includes(String(circle.status ?? '')) ? (
                  <TouchableOpacity
                    style={circle.status === 'rejected' ? styles.primaryButton : styles.secondaryButton}
                    onPress={() => prefillCircleRequest(circle)}
                  >
                    <Text style={circle.status === 'rejected' ? styles.primaryText : styles.secondaryText}>
                      {circle.status === 'rejected' ? 'Edit and resubmit' : 'Open request'}
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
              <Text style={styles.emptyBody}>Propose intimate, safe events once you have a clear reason for people to attend.</Text>
            </View>
          )}
        </View>
        {isAdmin ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Relationship Gist editorial</Text>
            <Text style={styles.sectionHint}>{loading ? 'Refreshing' : `${creatorGists.length} items`}</Text>
          </View>
          {creatorGists.length ? creatorGists.map((gist) => (
            <View key={`editorial:${gist.id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>Relationship Gist</Text>
                <Text style={styles.statusPill}>{creatorStatusLabel(gist.status)}</Text>
              </View>
              <Text style={styles.cardTitle}>{gist.title}</Text>
              <Text style={styles.linkedMeta}>
                {String(gist.perspective ?? 'general').replace(/^\w/, (match) => match.toUpperCase())}
              </Text>
              <Text style={styles.cardMeta}>
                {[gist.status === 'published' ? compactDate(gist.published_at) : null, compactDate(gist.updated_at || gist.created_at)].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.cardBody}>{gist.short_body || gist.body || 'No summary yet.'}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => openEditGist(gist)}>
                  <Text style={styles.primaryText}>{gist.status === 'draft' ? 'Open draft' : 'Open editor'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No editorial Gists yet</Text>
              <Text style={styles.emptyBody}>Draft relationship guidance here, then publish only when it is strong enough for everyone on Betweener.</Text>
            </View>
          )}
        </View>
        ) : null}


        {false ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Relationship Gist editorial</Text>
            <Text style={styles.sectionHint}>{loading ? 'Refreshing' : `${creatorGists.length} items`}</Text>
          </View>
          {creatorGists.length ? creatorGists.map((gist) => (
            <View key={gist.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>Relationship Gist</Text>
                <Text style={styles.statusPill}>{creatorStatusLabel(gist.status)}</Text>
              </View>
              <Text style={styles.cardTitle}>{gist.title}</Text>
              <Text style={styles.cardMeta}>
                {[gist.circle_id ? circleNameById[gist.circle_id] ?? 'Circle' : null, compactDate(gist.updated_at || gist.created_at)].filter(Boolean).join(' Â· ')}
              </Text>
              <Text style={styles.cardBody}>{gist.short_body || gist.body || 'No summary yet.'}</Text>
              <View style={styles.cardActions}>
                {gist.circle_id ? (
                  <TouchableOpacity style={styles.primaryButton} onPress={() => openCircle(gist.circle_id, 'gist')}>
                    <Text style={styles.primaryText}>Edit in Circle</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Circle-specific gists yet</Text>
              <Text style={styles.emptyBody}>Publish Circle guidance from the Circle detail screen, then track it here like the rest of your signature content.</Text>
            </View>
          )}
        </View>
        ) : null}
      </ScrollView>

      <Modal visible={gistEditorOpen} transparent animationType="fade" onRequestClose={() => { setGistEditorOpen(false); resetGistEditor(); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setGistEditorOpen(false); resetGistEditor(); }}>
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
                <Text style={styles.modalTitle}>{editingGistId ? 'Edit Relationship Gist' : 'Write Relationship Gist'}</Text>
                <Text style={styles.modalBody}>Global editorial guidance for everyone on Betweener. Save drafts here, publish only when the piece is ready.</Text>
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
                  placeholder="Short summary for the preview card"
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
                  {editingGistId ? (
                    <TouchableOpacity style={styles.secondaryButton} disabled={savingGist} onPress={handleDeleteGist}>
                      <Text style={styles.secondaryText}>{savingGist ? 'Working...' : 'Delete'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => { setGistEditorOpen(false); resetGistEditor(); }}>
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} disabled={savingGist} onPress={() => void handleSaveGist('draft')}>
                    <Text style={styles.secondaryText}>{savingGist ? 'Saving...' : 'Save draft'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={savingGist} onPress={() => void handleSaveGist('published')}>
                    <Text style={styles.primaryText}>{savingGist ? 'Publishing...' : 'Publish live'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => { setCreateOpen(false); setEditingCircleId(null); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setCreateOpen(false); setEditingCircleId(null); }}>
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
                <Text style={styles.modalTitle}>{editingCircleId ? 'Edit Circle request' : 'Request Circle'}</Text>
                <TextInput value={newName} onChangeText={setNewName} placeholder="Circle name" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType="next" />
                <TextInput value={newPurpose} onChangeText={setNewPurpose} placeholder="Purpose and who it is for" placeholderTextColor={theme.textMuted} multiline style={[styles.input, styles.multiline]} returnKeyType="default" />
                <TextInput value={newCity} onChangeText={setNewCity} placeholder="City" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType="done" />
                <View style={styles.visibilityRow}>
                  {(['country', 'local', 'diaspora', 'global', 'invite_only'] as const).map((item) => (
                    <Pressable key={item} style={[styles.visibilityPill, newScope === item && styles.visibilityPillActive]} onPress={() => setNewScope(item)}>
                      <Text style={[styles.visibilityText, newScope === item && styles.visibilityTextActive]}>
                        {item === 'invite_only' ? 'Private' : item[0].toUpperCase() + item.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => { setCreateOpen(false); setEditingCircleId(null); }}>
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={creating} onPress={handleSubmitCircle}>
                    <Text style={styles.primaryText}>{creating ? 'Submitting' : editingCircleId ? 'Save and resubmit' : 'Submit for review'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={gatheringOpen} transparent animationType="fade" onRequestClose={() => { setGatheringOpen(false); setEditingGatheringId(null); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setGatheringOpen(false); setEditingGatheringId(null); }}>
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
                <Text style={styles.modalTitle}>{editingGatheringId ? 'Edit Gathering request' : 'Request Gathering'}</Text>
                <TextInput value={newGatheringTitle} onChangeText={setNewGatheringTitle} placeholder="Gathering title" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType="next" />
                <TextInput value={newGatheringDescription} onChangeText={setNewGatheringDescription} placeholder="What is this Gathering for?" placeholderTextColor={theme.textMuted} multiline style={[styles.input, styles.multiline]} returnKeyType="default" />
                {approvedCreatorCircles.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.visibilityRow} keyboardShouldPersistTaps="handled">
                    <Pressable style={[styles.visibilityPill, !newGatheringCircleId && styles.visibilityPillActive]} onPress={() => setNewGatheringCircleId(null)}>
                      <Text style={[styles.visibilityText, !newGatheringCircleId && styles.visibilityTextActive]}>General</Text>
                    </Pressable>
                    {approvedCreatorCircles.map((circle) => (
                      <Pressable key={circle.id} style={[styles.visibilityPill, newGatheringCircleId === circle.id && styles.visibilityPillActive]} onPress={() => setNewGatheringCircleId(circle.id)}>
                        <Text style={[styles.visibilityText, newGatheringCircleId === circle.id && styles.visibilityTextActive]}>{circle.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.visibilityRow}>
                  {(['physical', 'online', 'hybrid'] as const).map((item) => (
                    <Pressable key={item} style={[styles.visibilityPill, newGatheringType === item && styles.visibilityPillActive]} onPress={() => setNewGatheringType(item)}>
                      <Text style={[styles.visibilityText, newGatheringType === item && styles.visibilityTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.rowInputs}>
                  <TextInput value={newGatheringDate} onChangeText={setNewGatheringDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textMuted} style={[styles.input, styles.rowInput]} returnKeyType="next" />
                  <TextInput value={newGatheringTime} onChangeText={setNewGatheringTime} placeholder="HH:MM" placeholderTextColor={theme.textMuted} style={[styles.input, styles.rowInput]} returnKeyType="next" />
                </View>
                <TextInput value={newGatheringCity} onChangeText={setNewGatheringCity} placeholder="City" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType={newGatheringType !== 'online' ? 'next' : 'done'} />
                {newGatheringType !== 'online' ? (
                  <TextInput value={newGatheringVenue} onChangeText={setNewGatheringVenue} placeholder="Venue name" placeholderTextColor={theme.textMuted} style={styles.input} returnKeyType="done" />
                ) : null}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => { setGatheringOpen(false); setEditingGatheringId(null); }}>
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} disabled={creatingGathering} onPress={handleSubmitGathering}>
                    <Text style={styles.primaryText}>{creatingGathering ? 'Submitting' : editingGatheringId ? 'Save and resubmit' : 'Submit for review'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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
    modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
    modalKeyboardWrap: {
      width: '100%',
      justifyContent: 'center',
    },
    modalCard: {
      padding: 18,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: 'rgba(244,232,208,0.12)',
      backgroundColor: '#0B2427',
      gap: 12,
    },
    modalScroll: {
      maxHeight: '88%',
    },
    modalScrollContent: {
      gap: 12,
    },
    modalTitle: { color: '#F4E8D0', fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
    modalBody: { color: 'rgba(244,232,208,0.72)', fontSize: 13, lineHeight: 19 },
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
    gistBodyInput: { minHeight: 148 },
    rowInputs: { flexDirection: 'row', gap: 10 },
    rowInput: { flex: 1 },
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
