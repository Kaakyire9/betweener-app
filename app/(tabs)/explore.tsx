import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

type CircleMembership = {
  id: string;
  circle_id: string;
  role: 'leader' | 'matchmaker' | 'member';
  status: 'active' | 'pending' | 'invited';
  circles?: Circle | null;
};

const normalizeCircle = (input: Circle | Circle[] | null | undefined): Circle | null => {
  if (!input) return null;
  return Array.isArray(input) ? (input[0] ?? null) : input;
};

export default function CirclesScreen() {
  const { profile, user } = useAuth();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = (colorScheme ?? 'light') === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(profile?.id ?? null);
  const currentProfileId = resolvedProfileId;
  const [myCircles, setMyCircles] = useState<CircleMembership[]>([]);
  const [discoverCircles, setDiscoverCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [circleImageUrls, setCircleImageUrls] = useState<Record<string, string>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState<'public' | 'private'>('public');

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

  const loadCircles = useCallback(async () => {
    if (!currentProfileId) return;
    setLoading(true);
    try {
      const { data: membershipRows } = await supabase
        .from('circle_members')
        .select('id,circle_id,role,status,circles (id,name,description,visibility,category,created_by_profile_id,image_path,image_updated_at)')
        .eq('profile_id', currentProfileId);

      const memberships: CircleMembership[] = (membershipRows || []).map((row: any) => ({
        id: String(row.id),
        circle_id: String(row.circle_id),
        role: row.role,
        status: row.status,
        circles: normalizeCircle(row.circles),
      }));
      setMyCircles(memberships);

      const { data: circlesRows } = await supabase
        .from('circles')
        .select('id,name,description,visibility,category,created_by_profile_id,image_path,image_updated_at')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(24);

      const joinedIds = new Set(memberships.map((m) => String(m.circle_id)));
      const filtered = (circlesRows || []).filter((c) => !joinedIds.has(String(c.id)));
      setDiscoverCircles(filtered as Circle[]);

      const allCircles: Circle[] = [
        ...memberships.map((m) => m.circles).filter(Boolean) as Circle[],
        ...(filtered as Circle[]),
      ];
      const imagePairs = await Promise.all(
        allCircles.map(async (circle) => {
          if (!circle.image_path) return [circle.id, null] as const;
          const { data } = await supabase.storage
            .from('circle-images')
            .createSignedUrl(circle.image_path, 3600);
          return [circle.id, data?.signedUrl ?? null] as const;
        }),
      );
      const nextMap: Record<string, string> = {};
      imagePairs.forEach(([id, url]) => {
        if (url) nextMap[id] = url;
      });
      setCircleImageUrls(nextMap);
    } finally {
      setLoading(false);
    }
  }, [currentProfileId]);

  useFocusEffect(
    useCallback(() => {
      void loadCircles();
    }, [loadCircles]),
  );

  const handleCreate = useCallback(async () => {
    if (!currentProfileId) {
      Alert.alert('Create circle', 'No profile found for this account.');
      return;
    }
    if (!newName.trim()) {
      Alert.alert('Create circle', 'Please add a circle name.');
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('rpc_create_circle', {
        p_profile_id: currentProfileId,
        p_name: newName.trim(),
        p_description: newDescription.trim() || null,
        p_visibility: newVisibility,
        p_category: null,
      });
      if (error) throw error;
      if (!data) {
        Alert.alert('Create circle', 'No circle was created. Please try again.');
        setCreating(false);
        return;
      }
      const circleId = String(data);
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setNewVisibility('public');
      await loadCircles();
      router.push({ pathname: '/circles/[id]', params: { id: circleId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create circle.';
      Alert.alert('Create circle failed', msg);
    } finally {
      setCreating(false);
    }
  }, [creating, currentProfileId, newDescription, newName, newVisibility, loadCircles]);

  const handleJoin = useCallback(
    async (circle: Circle) => {
      if (!currentProfileId || !circle?.id) return;
      try {
        const { error } = await supabase.rpc('rpc_join_circle', {
          p_circle_id: circle.id,
          p_profile_id: currentProfileId,
        });
        if (error) throw error;
        await loadCircles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to join circle.';
        Alert.alert('Join circle failed', msg);
      }
    },
    [currentProfileId, loadCircles],
  );

  const openCircle = useCallback((circleId?: string | null) => {
    if (!circleId) return;
    router.push({ pathname: '/circles/[id]', params: { id: String(circleId) } });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Circles</Text>
          <Text style={styles.headerSubtitle}>Community-led introductions, handled with care.</Text>
        </View>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateOpen(true)}>
          <MaterialCommunityIcons name="plus" size={18} color={Colors.light.background} />
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My circles</Text>
        {myCircles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No circles yet.</Text>
            <Text style={styles.emptyHint}>Create a trusted space or join one.</Text>
          </View>
        ) : (
          myCircles.map((membership) => {
            const circle = membership.circles;
            if (!circle) return null;
            return (
              <Pressable key={membership.id} style={styles.card} onPress={() => openCircle(circle.id)}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleRow}>
                    <View style={styles.circleAvatar}>
                      {circleImageUrls[circle.id] ? (
                        <Image source={{ uri: circleImageUrls[circle.id] }} style={styles.circleAvatarImage} />
                      ) : (
                        <MaterialCommunityIcons name="account-group" size={18} color={theme.textMuted} />
                      )}
                    </View>
                    <Text style={styles.cardTitle}>{circle.name}</Text>
                  </View>
                  <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {membership.role === 'leader' ? 'Leader' : membership.role === 'matchmaker' ? 'Matchmaker' : 'Member'}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{circle.visibility === 'private' ? 'Private' : 'Public'}</Text>
                    </View>
                  </View>
                </View>
                {circle.description ? <Text style={styles.cardBody}>{circle.description}</Text> : null}
              </Pressable>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Discover circles</Text>
        {loading && discoverCircles.length === 0 ? (
          <Text style={styles.emptyText}>Loading circles...</Text>
        ) : discoverCircles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No public circles right now.</Text>
            <Text style={styles.emptyHint}>Start one to set the tone.</Text>
          </View>
        ) : (
          discoverCircles.map((circle) => (
            <View key={circle.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.circleAvatar}>
                    {circleImageUrls[circle.id] ? (
                      <Image source={{ uri: circleImageUrls[circle.id] }} style={styles.circleAvatarImage} />
                    ) : (
                      <MaterialCommunityIcons name="account-group" size={18} color={theme.textMuted} />
                    )}
                  </View>
                  <Text style={styles.cardTitle}>{circle.name}</Text>
                </View>
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{circle.visibility === 'private' ? 'Private' : 'Public'}</Text>
                  </View>
                </View>
              </View>
              {circle.description ? <Text style={styles.cardBody}>{circle.description}</Text> : null}
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => openCircle(circle.id)}>
                  <Text style={styles.secondaryText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={() => handleJoin(circle)}>
                  <Text style={styles.primaryText}>{circle.visibility === 'private' ? 'Request' : 'Join'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Create circle</Text>
            <TextInput
              style={styles.input}
              placeholder="Circle name"
              placeholderTextColor={theme.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Description (optional)"
              placeholderTextColor={theme.textMuted}
              value={newDescription}
              onChangeText={setNewDescription}
              multiline
            />
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.togglePill, newVisibility === 'public' && styles.togglePillActive]}
                onPress={() => setNewVisibility('public')}
              >
                <Text style={[styles.toggleText, newVisibility === 'public' && styles.toggleTextActive]}>Public</Text>
              </Pressable>
              <Pressable
                style={[styles.togglePill, newVisibility === 'private' && styles.togglePillActive]}
                onPress={() => setNewVisibility('private')}
              >
                <Text style={[styles.toggleText, newVisibility === 'private' && styles.toggleTextActive]}>Private</Text>
              </Pressable>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setCreateOpen(false)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={creating}>
                <Text style={styles.primaryText}>{creating ? 'Creating...' : 'Create'}</Text>
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
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    headerTitle: { fontSize: 30, color: theme.text, fontFamily: 'PlayfairDisplay_700Bold' },
    headerSubtitle: { marginTop: 6, fontSize: 12, color: theme.textMuted, maxWidth: 220 },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    createButtonText: { color: Colors.light.background, fontWeight: '700', fontSize: 12 },
    section: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12, gap: 10 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    card: {
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      gap: 10,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1 },
    circleAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSubtle,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    circleAvatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 19,
    },
    cardBody: { fontSize: 12, color: theme.textMuted },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
    },
    badgeText: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    primaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.tint,
    },
    primaryText: { color: Colors.light.background, fontWeight: '700', fontSize: 12 },
    secondaryButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.background,
    },
    secondaryText: { color: theme.text, fontWeight: '600', fontSize: 12 },
    emptyCard: {
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
      backgroundColor: theme.backgroundSubtle,
      gap: 6,
    },
    emptyText: { fontSize: 12, color: theme.textMuted },
    emptyHint: { fontSize: 11, color: theme.textMuted },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      borderRadius: 20,
      padding: 18,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.outline,
      gap: 12,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    input: {
      borderWidth: 1,
      borderColor: theme.outline,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      backgroundColor: theme.backgroundSubtle,
      fontSize: 13,
    },
    inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
    toggleRow: { flexDirection: 'row', gap: 10 },
    togglePill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.outline,
      alignItems: 'center',
      backgroundColor: theme.backgroundSubtle,
    },
    togglePillActive: { backgroundColor: theme.tint, borderColor: theme.tint },
    toggleText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    toggleTextActive: { color: Colors.light.background },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  });
