import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IntentRequestSheet from '@/components/IntentRequestSheet';

type Circle = {
  id: string;
  name: string;
  description?: string | null;
  visibility?: 'public' | 'private' | string | null;
  category?: string | null;
  created_by_profile_id?: string | null;
  image_path?: string | null;
  image_updated_at?: string | null;
};

type MemberRow = {
  id: string;
  role: 'leader' | 'matchmaker' | 'member';
  status: 'active' | 'pending' | 'invited';
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
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingMembers, setPendingMembers] = useState<MemberRow[]>([]);
  const [membership, setMembership] = useState<MemberRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

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
    const loadProfileId = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setResolvedProfileId(data?.id ?? null);
    };
    void loadProfileId();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, user?.id]);

  const loadCircle = useCallback(async () => {
    if (!circleId) return;
    setLoading(true);
    try {
      const { data: circleRow, error: circleErr } = await supabase
        .from('circles')
        .select('id,name,description,visibility,category,created_by_profile_id,image_path,image_updated_at')
        .eq('id', circleId)
        .maybeSingle();
      setCircle((circleRow as Circle) || null);

      if (currentProfileId) {
        const { data: myMembership, error: memberErr } = await supabase
          .from('circle_members')
          .select('id,role,status,is_visible,profile_id')
          .eq('circle_id', circleId)
          .eq('profile_id', currentProfileId)
          .maybeSingle();
        setMembership((myMembership as MemberRow) || null);
      } else {
        setMembership(null);
      }

      const { data: memberRows, error: membersErr } = await supabase
        .from('circle_members')
        .select('id,role,status,is_visible,profile_id,profiles (id,full_name,avatar_url,age,location,city,region)')
        .eq('circle_id', circleId);

      const rows = (memberRows || []) as MemberRow[];
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
    if (circle?.name) {
      setNameValue(circle.name);
    }
  }, [circle?.name]);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!circle?.image_path) {
        setImageUrl(null);
        return;
      }
      const { data, error } = await supabase.storage
        .from('circle-images')
        .createSignedUrl(circle.image_path, 3600);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setImageUrl(null);
        return;
      }
      setImageUrl(data.signedUrl);
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [circle?.image_path, circle?.image_updated_at]);

  const handleJoin = useCallback(async () => {
    if (!currentProfileId || !circleId) return;
    await supabase.rpc('rpc_join_circle', {
      p_circle_id: circleId,
      p_profile_id: currentProfileId,
    });
    await loadCircle();
  }, [circleId, currentProfileId, loadCircle]);

  const handleApprove = useCallback(
    async (memberId: string) => {
      if (!currentProfileId || !circleId) return;
      await supabase.rpc('rpc_approve_circle_member', {
        p_circle_id: circleId,
        p_member_id: memberId,
        p_profile_id: currentProfileId,
      });
      await loadCircle();
    },
    [circleId, currentProfileId, loadCircle],
  );

  const handleSetRole = useCallback(
    async (memberId: string, role: 'matchmaker' | 'member') => {
      if (!currentProfileId || !circleId) return;
      const { error } = await supabase.rpc('rpc_set_circle_member_role', {
        p_circle_id: circleId,
        p_member_id: memberId,
        p_profile_id: currentProfileId,
        p_role: role,
      });
      if (error) {
        Alert.alert('Update failed', error.message);
        return;
      }
      await loadCircle();
    },
    [circleId, currentProfileId, loadCircle],
  );

  const handleRemove = useCallback(
    async (memberId: string) => {
      if (!currentProfileId || !circleId) return;
      Alert.alert('Remove member', 'Remove this person from the circle?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('rpc_remove_circle_member', {
              p_circle_id: circleId,
              p_member_id: memberId,
              p_profile_id: currentProfileId,
            });
            if (error) {
              Alert.alert('Remove failed', error.message);
              return;
            }
            await loadCircle();
          },
        },
      ]);
    },
    [circleId, currentProfileId, loadCircle],
  );

  const openProfile = useCallback((profileId?: string | null) => {
    if (!profileId) return;
    router.push({ pathname: '/profile-view', params: { profileId: String(profileId) } });
  }, []);

  const openIntentSheet = useCallback(
    (profileId?: string | null, name?: string | null) => {
      if (!profileId) return;
      if (currentProfileId && profileId === currentProfileId) return;
      setIntentTarget({ id: profileId, name: name ?? null });
      setIntentSheetOpen(true);
    },
    [currentProfileId],
  );

  const isOwner = !!(circle?.created_by_profile_id && circle?.created_by_profile_id === currentProfileId);
  const isLeader = isOwner || (membership?.role === 'leader' && membership?.status === 'active');
  const isMember = isOwner || membership?.status === 'active';
  const joinLabel = circle?.visibility === 'private' ? 'Request to join' : 'Join circle';

  const handleSaveName = useCallback(async () => {
    if (!circleId || !currentProfileId) return;
    const trimmed = nameValue.trim();
    if (!trimmed) {
      Alert.alert('Circle name', 'Please enter a circle name.');
      return;
    }
    const { error } = await supabase
      .from('circles')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', circleId)
      .eq('created_by_profile_id', currentProfileId);
    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }
    setEditingName(false);
    await loadCircle();
  }, [circleId, currentProfileId, nameValue, loadCircle]);

  const handlePickImage = useCallback(async () => {
    if (!circleId || !currentProfileId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo permissions to upload a circle image.');
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
      const fileName = `${Date.now()}.${fileExtension}`;
      const filePath = `${circleId}/${fileName}`;
      const response = await fetch(uri);
      const blob = await response.arrayBuffer();
      const uint8Array = new Uint8Array(blob);
      const { error: uploadError } = await supabase.storage
        .from('circle-images')
        .upload(filePath, uint8Array, {
          contentType: `image/${fileExtension}`,
          upsert: true,
        });
      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message);
        return;
      }
      const { error: updateError } = await supabase
        .from('circles')
        .update({
          image_path: filePath,
          image_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', circleId)
        .eq('created_by_profile_id', currentProfileId);
      if (updateError) {
        Alert.alert('Update failed', updateError.message);
        return;
      }
      await loadCircle();
    } finally {
      setImageUploading(false);
    }
  }, [circleId, currentProfileId, loadCircle]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace({ pathname: '/(tabs)/explore' })}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <Pressable
          style={styles.circleAvatar}
          onPress={isLeader ? handlePickImage : undefined}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.circleAvatarImage} />
          ) : (
            <MaterialCommunityIcons name="account-group" size={22} color={theme.textMuted} />
          )}
          {isLeader ? (
            <View style={styles.circleAvatarBadge}>
              <MaterialCommunityIcons name="pencil" size={12} color={theme.text} />
            </View>
          ) : null}
        </Pressable>
        <View style={{ flex: 1 }}>
          {editingName ? (
            <Text style={styles.headerTitle}>{circle?.name ?? 'Circle'}</Text>
          ) : (
            <Text style={styles.headerTitle}>{circle?.name ?? 'Circle'}</Text>
          )}
          <Text style={styles.headerSubtitle}>
            {circle?.visibility === 'private' ? 'Private circle' : 'Public circle'}
          </Text>
        </View>
      </View>

      {isLeader && editingName ? (
        <View style={styles.editNameCard}>
          <Text style={styles.inputLabel}>Circle name</Text>
          <TextInput
            value={nameValue}
            onChangeText={setNameValue}
            placeholder="Circle name"
            placeholderTextColor={theme.textMuted}
            style={styles.inlineInput}
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() => {
                setEditingName(false);
                setNameValue(circle?.name ?? '');
              }}
            >
              <Text style={styles.ghostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleSaveName}>
              <Text style={styles.secondaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {circle?.description ? <Text style={styles.description}>{circle.description}</Text> : null}

      {!isMember ? (
        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleJoin}>
            <Text style={styles.primaryText}>{joinLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isLeader && pendingMembers.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending requests</Text>
          {pendingMembers.map((row) => (
            <View key={row.id} style={styles.pendingCard}>
              <Text style={styles.memberName}>{row.profiles?.full_name ?? 'Member'}</Text>
              <View style={styles.pendingActions}>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members</Text>
        {loading && members.length === 0 ? (
          <Text style={styles.emptyText}>Loading members...</Text>
        ) : members.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No members yet.</Text>
            <Text style={styles.emptyHint}>Invite trusted people to join this circle.</Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 12 }}
            renderItem={({ item }) => {
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
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {member.full_name ?? 'Member'}
                      {member.age ? `, ${member.age}` : ''}
                    </Text>
                    <Text style={styles.memberMeta}>
                      {member.city || member.region || member.location || ''}
                    </Text>
                    {item.role !== 'member' ? (
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText}>
                          {item.role === 'leader' ? 'Leader' : 'Matchmaker'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.memberActions}>
                    <TouchableOpacity style={styles.ghostButton} onPress={() => openProfile(member.id)}>
                      <Text style={styles.ghostText}>View</Text>
                    </TouchableOpacity>
                    {canModerate ? (
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => handleSetRole(item.profile_id, isMatchmaker ? 'member' : 'matchmaker')}
                      >
                        <Text style={styles.secondaryText}>{isMatchmaker ? 'Member' : 'Matchmaker'}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {canModerate ? (
                      <TouchableOpacity style={styles.ghostButton} onPress={() => handleRemove(item.profile_id)}>
                        <Text style={styles.ghostText}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                    {!isSelf ? (
                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => openIntentSheet(member.id, member.full_name)}
                      >
                        <Text style={styles.primaryText}>Request</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {isLeader ? (
        <View style={styles.deleteSection}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setEditingName(true)}
            disabled={editingName}
          >
            <Text style={styles.actionText}>Edit name</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteCircleButton}
            onPress={() => {
              Alert.alert('Delete circle', 'This will permanently delete the circle.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    if (!circleId || !currentProfileId) return;
                    const { error } = await supabase
                      .from('circles')
                      .delete()
                      .eq('id', circleId)
                      .eq('created_by_profile_id', currentProfileId);
                    if (error) {
                      Alert.alert('Delete failed', error.message);
                      return;
                    }
                    router.replace({ pathname: '/(tabs)/explore' });
                  },
                },
              ]);
            }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.text} />
            <Text style={styles.deleteCircleText}>Delete circle</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <IntentRequestSheet
        visible={intentSheetOpen}
        onClose={() => setIntentSheetOpen(false)}
        recipientId={intentTarget?.id}
        recipientName={intentTarget?.name ?? null}
        metadata={{
          source: 'circles',
          circle_id: circle?.id,
          circle_name: circle?.name,
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, paddingHorizontal: 18 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingBottom: 6 },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    headerTitle: { fontSize: 22, fontWeight: '700', color: theme.text },
    headerSubtitle: { fontSize: 12, color: theme.textMuted },
    description: { fontSize: 13, color: theme.textMuted, marginTop: 8 },
    circleAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    circleAvatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 26,
    },
    circleAvatarBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    editRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    editNameCard: {
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      gap: 10,
    },
    editActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.textMuted,
      marginBottom: 4,
    },
    inlineInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.outline,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.backgroundSubtle,
    },
    ctaRow: { marginTop: 12, marginBottom: 6, alignItems: 'flex-start' },
    primaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    primaryText: { color: Colors.light.background, fontWeight: '700', fontSize: 12 },
    secondaryButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    secondaryText: { color: theme.text, fontWeight: '600', fontSize: 12 },
    ghostButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    ghostText: { color: theme.tint, fontWeight: '600', fontSize: 12 },
    pendingActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    section: { marginTop: 18, gap: 10 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    emptyText: { fontSize: 12, color: theme.textMuted },
    memberCard: {
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundSubtle },
    avatarFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    memberName: { fontSize: 13, fontWeight: '700', color: theme.text },
    memberMeta: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
    roleBadge: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    roleBadgeText: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
    memberActions: { flexDirection: 'row', gap: 8 },
    deleteSection: {
      marginTop: 16,
      alignItems: 'center',
      paddingBottom: 24,
      gap: 10,
    },
    deleteCircleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center',
      minWidth: 120,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withAlpha('#E0565B', 0.5),
      backgroundColor: withAlpha('#E0565B', 0.14),
    },
    deleteCircleText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#E0565B',
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 120,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
    },
    actionText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
    },
    pendingCard: {
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    emptyCard: {
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      gap: 6,
    },
    emptyHint: { fontSize: 11, color: theme.textMuted },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
