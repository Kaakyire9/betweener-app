import IntentRequestSheet from '@/components/IntentRequestSheet';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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

type DetailTab = 'overview' | 'members' | 'prompts' | 'gatherings' | 'gist';

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
};

type MemberRow = {
  id: string;
  role: string;
  status: string;
  is_visible: boolean;
  profile_id: string;
  profiles?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    age?: number | null;
    location?: string | null;
    city?: string | null;
    region?: string | null;
  } | null;
};

type CirclePrompt = {
  id: string;
  title: string;
  prompt: string;
  prompt_type?: string | null;
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

type RelationshipGist = {
  id: string;
  title: string;
  short_body?: string | null;
  body: string;
  perspective?: string | null;
};

const db = supabase as any;

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
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [gists, setGists] = useState<RelationshipGist[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [promptAnswerOpen, setPromptAnswerOpen] = useState(false);
  const [promptTarget, setPromptTarget] = useState<CirclePrompt | null>(null);
  const [promptAnswer, setPromptAnswer] = useState('');
  const [intentSheetOpen, setIntentSheetOpen] = useState(false);
  const [intentTarget, setIntentTarget] = useState<{ id: string; name?: string | null } | null>(null);

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
        .select('id,name,slug,description,short_description,visibility,category,created_by_profile_id,cover_image_url,icon_url,image_path,image_updated_at,circle_type,status,visibility_scope,country_code,country_name,region,city,is_official,is_partner,is_featured,requires_join_approval,rules,safety_note,member_count,active_this_week_count,gathering_count')
        .eq('id', circleId)
        .maybeSingle();

      const membershipPromise = currentProfileId
        ? db.from('circle_members').select('id,role,status,is_visible,profile_id').eq('circle_id', circleId).eq('profile_id', currentProfileId).maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const membersPromise = db
        .from('circle_members')
        .select('id,role,status,is_visible,profile_id,profiles(id,full_name,avatar_url,age,location,city,region)')
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

      const gistsPromise = db
        .from('relationship_gists')
        .select('id,title,short_body,body,perspective')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(6);

      const [
        { data: circleRow },
        { data: myMembership },
        { data: memberRows },
        { data: promptRows },
        { data: gatheringRows },
        { data: gistRows },
      ] = await Promise.all([
        circlePromise,
        membershipPromise,
        membersPromise,
        promptsPromise,
        gatheringsPromise,
        gistsPromise,
      ]);

      setCircle((circleRow as Circle) || null);
      setMembership((myMembership as MemberRow) || null);
      setPrompts((promptRows ?? []) as CirclePrompt[]);
      setGatherings((gatheringRows ?? []) as Gathering[]);
      setGists((gistRows ?? []) as RelationshipGist[]);

      const rows: MemberRow[] = (memberRows || []).map((row: any) => ({
        id: String(row.id),
        role: String(row.role),
        status: String(row.status),
        is_visible: row.is_visible !== false,
        profile_id: String(row.profile_id),
        profiles: normalizeMemberProfile(row.profiles),
      }));
      setMembers(rows.filter((row) => row.status === 'active' && row.is_visible !== false));
      setPendingMembers(rows.filter((row) => row.status === 'pending'));
    } finally {
      setLoading(false);
    }
  }, [circleId, currentProfileId]);

  useEffect(() => {
    void loadCircle();
  }, [loadCircle]);

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
  const isLeader = isOwner || (membership?.status === 'active' && ['leader', 'host', 'admin', 'moderator', 'matchmaker'].includes(membership.role));
  const isMember = isOwner || membership?.status === 'active';
  const joinLabel = circle?.requires_join_approval || circle?.visibility === 'private' ? 'Request to join' : 'Join Circle';

  const handleJoin = useCallback(async () => {
    if (!currentProfileId || !circleId) return;
    const { error } = await db.rpc('rpc_join_circle', {
      p_circle_id: circleId,
      p_profile_id: currentProfileId,
    });
    if (error) {
      Alert.alert('Join failed', error.message || 'Please try again.');
      return;
    }
    await loadCircle();
  }, [circleId, currentProfileId, loadCircle]);

  const handleApprove = useCallback(async (memberId: string) => {
    if (!currentProfileId || !circleId) return;
    await db.rpc('rpc_approve_circle_member', {
      p_circle_id: circleId,
      p_member_id: memberId,
      p_profile_id: currentProfileId,
    });
    await loadCircle();
  }, [circleId, currentProfileId, loadCircle]);

  const handleSetRole = useCallback(async (memberId: string, role: 'matchmaker' | 'member') => {
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

  const handleSaveName = useCallback(async () => {
    if (!circleId || !currentProfileId) return;
    const trimmed = nameValue.trim();
    if (!trimmed) {
      Alert.alert('Circle name', 'Please enter a Circle name.');
      return;
    }
    const { error } = await db
      .from('circles')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', circleId)
      .eq('created_by_profile_id', currentProfileId);
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
      const { error: updateError } = await db
        .from('circles')
        .update({ image_path: filePath, image_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', circleId)
        .eq('created_by_profile_id', currentProfileId);
      if (updateError) throw updateError;
      await loadCircle();
    } catch (error) {
      logger.error('[circles] upload_image_failed', error, { circleId });
      Alert.alert('Upload failed', typeof __DEV__ !== 'undefined' && __DEV__ && error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setImageUploading(false);
    }
  }, [circleId, currentProfileId, imageUploading, loadCircle]);

  const handleAttend = useCallback(async (gathering: Gathering) => {
    const { error } = await db.rpc('rpc_attend_gathering', {
      p_gathering_id: gathering.id,
      p_status: 'attending',
      p_visible_to_others: false,
    });
    if (error) {
      Alert.alert('Attend failed', error.message || 'Please try again.');
      return;
    }
    Alert.alert('You are attending', 'This Gathering is saved for you.');
    await loadCircle();
  }, [loadCircle]);

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
    Alert.alert('Answer shared', 'Your Circle Prompt answer is saved.');
  }, [promptAnswer, promptTarget?.id]);

  const openProfile = useCallback((profileId?: string | null) => {
    if (!profileId) return;
    router.push({ pathname: '/profile-view', params: { profileId: String(profileId) } });
  }, []);

  const openIntentSheet = useCallback((profileId?: string | null, name?: string | null) => {
    if (!profileId || profileId === currentProfileId) return;
    setIntentTarget({ id: profileId, name: name ?? null });
    setIntentSheetOpen(true);
  }, [currentProfileId]);

  const activePrompt = prompts[0] ?? null;
  const upcomingGathering = gatherings[0] ?? null;
  const gist = gists.find((item) => item.perspective === 'general') ?? gists[0] ?? null;

  const renderMember = ({ item }: { item: MemberRow }) => {
    const member = item.profiles;
    if (!member) return null;
    const canModerate = isLeader && item.profile_id !== currentProfileId;
    const isMatchmaker = item.role === 'matchmaker';
    const isSelf = item.profile_id === currentProfileId;
    return (
      <View style={styles.memberCard}>
        {member.avatar_url ? (
          <Image source={{ uri: member.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <MaterialCommunityIcons name="account-circle" size={34} color={theme.textMuted} />
          </View>
        )}
        <View style={styles.memberContent}>
          <Text style={styles.memberName}>
            {member.full_name ?? 'Member'}{member.age ? `, ${member.age}` : ''}
          </Text>
          <Text style={styles.memberMeta}>{member.city || member.region || member.location || 'Location hidden'}</Text>
          {item.role !== 'member' ? <Text style={styles.roleBadge}>{item.role === 'leader' ? 'Host' : item.role}</Text> : null}
          <View style={styles.inlineActions}>
            <TouchableOpacity style={styles.ghostButton} onPress={() => openProfile(member.id)}>
              <Text style={styles.ghostText}>View</Text>
            </TouchableOpacity>
            {!isSelf ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => openIntentSheet(member.id, member.full_name)}>
                <Text style={styles.primaryText}>Request</Text>
              </TouchableOpacity>
            ) : null}
            {canModerate ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => handleSetRole(item.profile_id, isMatchmaker ? 'member' : 'matchmaker')}>
                <Text style={styles.secondaryText}>{isMatchmaker ? 'Member' : 'Matchmaker'}</Text>
              </TouchableOpacity>
            ) : null}
            {canModerate ? (
              <TouchableOpacity style={styles.ghostButton} onPress={() => handleRemove(item.profile_id)}>
                <Text style={styles.ghostText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace({ pathname: '/(tabs)/explore' })}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
          </TouchableOpacity>
          <Pressable style={styles.circleAvatar} onPress={isLeader ? handlePickImage : undefined}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.circleAvatarImage} />
            ) : (
              <MaterialCommunityIcons name="account-group" size={24} color={theme.textMuted} />
            )}
            {isLeader ? (
              <View style={styles.circleAvatarBadge}>
                <MaterialCommunityIcons name={imageUploading ? 'loading' : 'pencil'} size={12} color={theme.text} />
              </View>
            ) : null}
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle} numberOfLines={1}>{circle?.name ?? 'Circle'}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {[
                circle?.is_official ? 'Official Circle' : circle?.is_partner ? 'Partner Circle' : circle?.circle_type === 'private' ? 'Private Circle' : 'Community Circle',
                circle?.city || circle?.country_name,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.badgeRow}>
            {circle?.is_official ? <Text style={styles.trustBadge}>Official</Text> : null}
            {circle?.is_partner ? <Text style={styles.trustBadge}>Partner</Text> : null}
            {circle?.is_featured ? <Text style={styles.trustBadge}>Featured</Text> : null}
            <Text style={styles.trustBadge}>{circle?.visibility_scope ?? 'country'}</Text>
          </View>
          <Text style={styles.heroTitle}>{circle?.short_description || circle?.description || 'Trusted community space for intentional connection.'}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statValue}>{circle?.member_count ?? members.length}</Text><Text style={styles.statLabel}>Members</Text></View>
            <View style={styles.statCard}><Text style={styles.statValue}>{prompts.length}</Text><Text style={styles.statLabel}>Prompts</Text></View>
            <View style={styles.statCard}><Text style={styles.statValue}>{gatherings.length}</Text><Text style={styles.statLabel}>Gatherings</Text></View>
          </View>
          {!isMember ? (
            <TouchableOpacity style={styles.joinWideButton} onPress={handleJoin}>
              <Text style={styles.joinWideButtonText}>{joinLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {isLeader && editingName ? (
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

        {isLeader && pendingMembers.length > 0 ? (
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
            {activePrompt ? (
              <View style={styles.featureCard}>
                <Text style={styles.kicker}>Active Circle Prompt</Text>
                <Text style={styles.featureTitle}>{activePrompt.title}</Text>
                <Text style={styles.featureBody}>{activePrompt.prompt}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => openPromptAnswer(activePrompt)}>
                  <Text style={styles.primaryText}>Answer</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {upcomingGathering ? (
              <View style={styles.featureCard}>
                <Text style={styles.kicker}>Upcoming Gathering</Text>
                <Text style={styles.featureTitle}>{upcomingGathering.title}</Text>
                <Text style={styles.featureBody}>{[compactDate(upcomingGathering.starts_at), upcomingGathering.city, upcomingGathering.gathering_type].filter(Boolean).join(' · ')}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => void handleAttend(upcomingGathering)}>
                  <Text style={styles.primaryText}>Attend</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Rules and safety</Text>
              <Text style={styles.infoText}>{circle?.rules || 'Hosts keep this Circle respectful, intentional, and safe for warm connection.'}</Text>
              {circle?.safety_note ? <Text style={styles.infoText}>{circle.safety_note}</Text> : null}
            </View>
          </View>
        ) : null}

        {activeTab === 'members' ? (
          <View style={styles.section}>
            {loading && members.length === 0 ? <Text style={styles.emptyText}>Loading members...</Text> : null}
            {members.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>This Circle is still taking shape</Text>
                <Text style={styles.emptyHint}>The first few members usually define the quality of every introduction after that.</Text>
              </View>
            ) : (
              <FlatList data={members} keyExtractor={(item) => item.id} renderItem={renderMember} scrollEnabled={false} contentContainerStyle={styles.memberList} />
            )}
          </View>
        ) : null}

        {activeTab === 'prompts' ? (
          <View style={styles.section}>
            {prompts.length === 0 ? <Text style={styles.emptyText}>No Circle Prompts are live right now.</Text> : null}
            {prompts.map((prompt) => (
              <View key={prompt.id} style={styles.featureCard}>
                <Text style={styles.kicker}>{prompt.prompt_type ?? 'Prompt'}</Text>
                <Text style={styles.featureTitle}>{prompt.title}</Text>
                <Text style={styles.featureBody}>{prompt.prompt}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => openPromptAnswer(prompt)}>
                  <Text style={styles.primaryText}>Answer</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === 'gatherings' ? (
          <View style={styles.section}>
            {gatherings.length === 0 ? <Text style={styles.emptyText}>No approved Gatherings are scheduled yet.</Text> : null}
            {gatherings.map((gathering) => (
              <View key={gathering.id} style={styles.featureCard}>
                <Text style={styles.kicker}>{gathering.gathering_type ?? 'Gathering'}</Text>
                <Text style={styles.featureTitle}>{gathering.title}</Text>
                <Text style={styles.featureBody}>{[compactDate(gathering.starts_at), gathering.city, gathering.venue_name].filter(Boolean).join(' · ')}</Text>
                <View style={styles.badgeRow}>
                  {gathering.is_partner_venue ? <Text style={styles.trustBadge}>Partner venue</Text> : null}
                  {gathering.safe_first_date_space ? <Text style={styles.trustBadge}>Safe first-date space</Text> : null}
                  <Text style={styles.trustBadge}>{gathering.attendee_count ?? 0} attending</Text>
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={() => void handleAttend(gathering)}>
                  <Text style={styles.primaryText}>Attend</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === 'gist' ? (
          <View style={styles.section}>
            {gist ? (
              <View style={styles.featureCard}>
                <Text style={styles.kicker}>Relationship Gist</Text>
                <Text style={styles.featureTitle}>{gist.title}</Text>
                <Text style={styles.featureBody}>{gist.short_body || gist.body}</Text>
                <Text style={styles.trustBadge}>{gist.perspective ?? 'general'}</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>No Relationship Gist is published for this Circle yet.</Text>
            )}
          </View>
        ) : null}

        {isLeader ? (
          <View style={styles.deleteSection}>
            <TouchableOpacity style={styles.actionButton} onPress={() => setEditingName(true)} disabled={editingName}>
              <Text style={styles.actionText}>Edit name</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

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

      <IntentRequestSheet
        visible={intentSheetOpen}
        onClose={() => setIntentSheetOpen(false)}
        recipientId={intentTarget?.id}
        recipientName={intentTarget?.name ?? null}
        metadata={{ source: 'circles', circle_id: circle?.id, circle_name: circle?.name }}
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
    headerCopy: { flex: 1 },
    headerTitle: { fontSize: 24, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { marginTop: 3, fontSize: 12, color: theme.textMuted },
    heroCard: {
      padding: 16,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.13 : 0.08),
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.76 : 0.92),
      gap: 12,
    },
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
    heroTitle: { color: theme.text, fontSize: 18, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: {
      flex: 1,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.7),
    },
    statValue: { color: theme.text, fontSize: 18, fontWeight: '800' },
    statLabel: { marginTop: 2, color: theme.textMuted, fontSize: 11, fontWeight: '700' },
    joinWideButton: {
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    joinWideButtonText: { color: Colors.light.background, fontWeight: '900', fontSize: 13 },
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
    section: { gap: 12 },
    sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '800' },
    pendingCard: {
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      gap: 10,
    },
    tabRow: { gap: 8, paddingRight: 18 },
    tabButton: {
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    tabButtonActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    tabText: { color: theme.textMuted, fontSize: 12, fontWeight: '800' },
    tabTextActive: { color: Colors.light.background },
    featureCard: {
      padding: 15,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: theme.backgroundSubtle,
      gap: 10,
    },
    kicker: { color: theme.tint, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
    featureTitle: { color: theme.text, fontSize: 18, lineHeight: 24, fontFamily: 'PlayfairDisplay_700Bold' },
    featureBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    infoCard: {
      padding: 15,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.08),
      backgroundColor: theme.backgroundSubtle,
      gap: 8,
    },
    infoText: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
    memberList: { gap: 12 },
    memberCard: {
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
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
    roleBadge: { alignSelf: 'flex-start', color: theme.tint, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
    inlineActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
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
      padding: 15,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      gap: 8,
    },
    emptyTitle: { fontSize: 18, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold' },
    emptyHint: { fontSize: 13, lineHeight: 20, color: theme.textMuted },
    deleteSection: { alignItems: 'center', paddingBottom: 10 },
    actionButton: {
      minWidth: 120,
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    actionText: { fontSize: 12, fontWeight: '700', color: theme.text },
    modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.56)' },
    modalCard: {
      padding: 18,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
      gap: 12,
    },
    modalTitle: { color: theme.text, fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
    modalBody: { color: theme.textMuted, fontSize: 13, lineHeight: 20 },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
