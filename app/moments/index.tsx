import MomentCreateModal from '@/components/MomentCreateModal';
import MomentViewer from '@/components/MomentViewer';
import MomentsRow from '@/components/MomentsRow';
import { Colors } from '@/constants/theme';
import type { Moment } from '@/hooks/useMoments';
import { useMoments } from '@/hooks/useMoments';
import { useAuth } from '@/lib/auth-context';
import { createSignedUrl } from '@/lib/moments';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MomentsScreen() {
  const { profile, user } = useAuth();
  const { momentUsers, loading, refresh } = useMoments({
    currentUserId: user?.id,
    currentUserProfile: profile,
  });
  const [viewerVisible, setViewerVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [startUserId, setStartUserId] = useState<string | null>(null);
  const [startMomentId, setStartMomentId] = useState<string | null>(null);
  const [myMoments, setMyMoments] = useState<Moment[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});

  const momentUsersWithContent = useMemo(
    () => momentUsers.filter((u) => u.moments.length > 0),
    [momentUsers],
  );
  const hasOwnMoment = useMemo(
    () => momentUsers.some((u) => u.isOwn && u.moments.length > 0),
    [momentUsers],
  );

  const openViewer = (userId: string) => {
    setStartUserId(userId);
    setStartMomentId(null);
    setViewerVisible(true);
  };
  const openOwnMoment = (momentId?: string) => {
    if (!user?.id) return;
    setStartUserId(user.id);
    setStartMomentId(momentId ?? null);
    setViewerVisible(true);
  };
  const handleOwnPress = () => {
    if (!hasOwnMoment) {
      setCreateVisible(true);
      return;
    }
    openOwnMoment();
  };

  const fetchMyMoments = useCallback(async () => {
    if (!user?.id) return;
    setMyLoading(true);
    try {
      const { data, error } = await supabase
        .from('moments')
        .select('id,user_id,type,media_url,thumbnail_url,text_body,caption,created_at,expires_at,visibility,is_deleted,moment_reactions(id)')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error || !data) {
        setMyMoments([]);
        setReactionCounts({});
        return;
      }

      const counts: Record<string, number> = {};
      const cleaned = (data as any[]).map((row) => {
        const reactions = Array.isArray(row.moment_reactions) ? row.moment_reactions.length : 0;
        counts[row.id] = reactions;
        const { moment_reactions: _momentReactions, ...rest } = row;
        return rest as Moment;
      });
      setReactionCounts(counts);
      setMyMoments(cleaned);
    } finally {
      setMyLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchMyMoments();
  }, [fetchMyMoments]);

  useEffect(() => {
    const resolveUrls = async () => {
      const pending = myMoments.filter((m) => m.media_url && !m.media_url.startsWith('http') && !signedUrls[m.id]);
      if (pending.length === 0) return;
      const resolved: Record<string, string> = {};
      await Promise.all(
        pending.map(async (m) => {
          const url = await createSignedUrl(m.media_url || '', 3600);
          if (url) resolved[m.id] = url;
        }),
      );
      if (Object.keys(resolved).length > 0) {
        setSignedUrls((prev) => ({ ...prev, ...resolved }));
      }
    };
    void resolveUrls();
  }, [myMoments, signedUrls]);

  const handleDelete = (moment: Moment) => {
    Alert.alert('Delete Moment?', 'This will remove the Moment for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) {
            Alert.alert('Session expired', 'Please sign in again and retry.');
            return;
          }
          setMyMoments((prev) => prev.filter((m) => m.id !== moment.id));
          setReactionCounts((prev) => {
            const next = { ...prev };
            delete next[moment.id];
            return next;
          });
          setSignedUrls((prev) => {
            const next = { ...prev };
            delete next[moment.id];
            return next;
          });
          try {
            const { data, error } = await supabase
              .from('moments')
              .update({ is_deleted: true })
              .eq('id', moment.id)
              .select('id');
            if (error) {
              const { error: deleteError } = await supabase.from('moments').delete().eq('id', moment.id);
              if (deleteError) throw deleteError;
            } else if (!data || data.length === 0) {
              const { error: deleteError } = await supabase.from('moments').delete().eq('id', moment.id);
              if (deleteError) throw deleteError;
            }
            if (moment.media_url && !moment.media_url.startsWith('http')) {
              await supabase.storage.from('moments').remove([moment.media_url]);
            }
          } catch (err) {
            console.log('Delete moment failed', err);
            const message = err instanceof Error ? err.message : 'Please try again.';
            Alert.alert('Delete failed', message);
            void fetchMyMoments();
          }
        },
      },
    ]);
  };

  const handleShare = async (moment: Moment) => {
    const url = moment.media_url?.startsWith('http') ? moment.media_url : signedUrls[moment.id];
    const message =
      moment.type === 'text'
        ? moment.text_body || 'My Moment'
        : url
        ? `My Moment: ${url}`
        : 'My Moment';
    try {
      await Share.share({ message });
    } catch (e) {
      console.log('Share moment failed', e);
    }
  };

  const openMomentActions = (moment: Moment) => {
    Alert.alert('Moment options', undefined, [
      { text: 'Share', onPress: () => handleShare(moment) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(moment) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const formatTimeAgo = (iso: string) => {
    const created = new Date(iso).getTime();
    if (Number.isNaN(created)) return '';
    const diffMs = Date.now() - created;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
  };

  const emptyMyMoments = !myLoading && myMoments.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>Moments</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setCreateVisible(true)}>
            <MaterialCommunityIcons name="plus-circle" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Post a Moment</Text>
          </TouchableOpacity>
        </View>

        {momentUsers.length > 0 ? (
          <MomentsRow
            users={momentUsers}
            isLoading={loading}
            onPressUser={openViewer}
            onPressCreate={() => setCreateVisible(true)}
            onPressOwn={handleOwnPress}
          />
        ) : (
          <Text style={styles.emptyText}>No moments yet. Post your first moment.</Text>
        )}

        {emptyMyMoments ? null : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Moments</Text>
              <Text style={styles.sectionHint}>{myLoading ? 'Loading...' : `${myMoments.length} active`}</Text>
            </View>

            {myMoments.map((moment) => {
              const mediaUrl = moment.media_url?.startsWith('http') ? moment.media_url : signedUrls[moment.id];
              const timeLabel = formatTimeAgo(moment.created_at);
              const reactions = reactionCounts[moment.id] ?? 0;
              const title =
                moment.caption?.trim() ||
                (moment.type === 'text' ? 'Text Moment' : moment.type === 'video' ? 'Video Moment' : 'Photo Moment');
              return (
                <View key={moment.id} style={styles.momentRow}>
                  <TouchableOpacity
                    style={styles.momentPressable}
                    activeOpacity={0.82}
                    onPress={() => openOwnMoment(moment.id)}
                  >
                    <View style={styles.momentCircle}>
                      {moment.type === 'photo' && mediaUrl ? (
                        <Image source={{ uri: mediaUrl }} style={styles.momentCircleImage} contentFit="cover" />
                      ) : moment.type === 'text' ? (
                        <Text style={styles.textBadge}>Aa</Text>
                      ) : (
                        <View style={styles.momentCircleFallback}>
                          <MaterialCommunityIcons
                            name={moment.type === 'video' ? 'video' : 'image-outline'}
                            size={20}
                            color="#e5e7eb"
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.momentMeta}>
                      <Text style={styles.momentTitle}>{title}</Text>
                      <View style={styles.momentSubRow}>
                        <View style={styles.momentMetaItem}>
                          <MaterialCommunityIcons name="clock-outline" size={13} color="#6b7280" />
                          <Text style={styles.momentMetaText}>{timeLabel}</Text>
                        </View>
                        <View style={styles.momentMetaItem}>
                          <MaterialCommunityIcons name="heart" size={13} color="#ef4444" />
                          <Text style={styles.momentMetaText}>{reactions}</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.moreButton} onPress={() => openMomentActions(moment)}>
                    <MaterialCommunityIcons name="dots-horizontal" size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity style={styles.addButton} onPress={() => setCreateVisible(true)}>
              <MaterialCommunityIcons name="plus-circle" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Moment</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.footer}>Moments expire after 24 hours.</Text>
      </ScrollView>

      <MomentViewer
        visible={viewerVisible}
        users={momentUsersWithContent}
        startUserId={startUserId}
        startMomentId={startMomentId}
        onClose={() => {
          setViewerVisible(false);
          setStartUserId(null);
          setStartMomentId(null);
        }}
      />
      <MomentCreateModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={() => {
          setCreateVisible(false);
          void refresh();
          void fetchMyMoments();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Archivo_700Bold',
    color: '#0f172a',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginRight: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    marginLeft: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Archivo_700Bold',
    color: '#0f172a',
  },
  sectionHint: {
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: 'Manrope_600SemiBold',
  },
  emptyCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Archivo_700Bold', color: '#111827', marginBottom: 6 },
  emptySubtitle: { color: '#6b7280', fontFamily: 'Manrope_500Medium' },
  momentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  momentPressable: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  momentCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentCircleImage: { width: '100%', height: '100%' },
  momentCircleFallback: { alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  textBadge: { color: '#f9fafb', fontFamily: 'Archivo_700Bold', fontSize: 16 },
  momentMeta: { marginLeft: 12, flex: 1 },
  momentTitle: { color: '#111827', fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
  momentSubRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  momentMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  momentMetaText: { color: '#6b7280', fontFamily: 'Manrope_500Medium', fontSize: 12 },
  moreButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.light.tint,
    marginTop: 6,
  },
  addButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 12,
  },
  footer: {
    marginTop: 16,
    color: '#94a3b8',
    fontSize: 12,
  },
});
