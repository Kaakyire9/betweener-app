import MomentCreateModal from '@/components/MomentCreateModal';
import { Colors } from '@/constants/theme';
import type { Moment } from '@/hooks/useMoments';
import { useAuth } from '@/lib/auth-context';
import { createSignedUrl } from '@/lib/moments';
import { supabase } from '@/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function MyMomentsScreen() {
  const { user } = useAuth();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const fetchMoments = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('moments')
        .select('id,user_id,type,media_url,thumbnail_url,text_body,caption,created_at,expires_at,visibility,is_deleted')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error || !data) {
        setMoments([]);
        return;
      }
      setMoments(data as Moment[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchMoments();
  }, [fetchMoments]);

  useEffect(() => {
    const resolveUrls = async () => {
      const pending = moments.filter((m) => m.media_url && !m.media_url.startsWith('http') && !signedUrls[m.id]);
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
  }, [moments, signedUrls]);

  const handleDelete = (moment: Moment) => {
    Alert.alert('Delete Moment?', 'This will remove the Moment for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('moments').update({ is_deleted: true }).eq('id', moment.id);
          if (moment.media_url && !moment.media_url.startsWith('http')) {
            await supabase.storage.from('moments').remove([moment.media_url]);
          }
          void fetchMoments();
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

  const emptyState = !loading && moments.length === 0;

  const PreviewVideo = ({ uri }: { uri: string }) => {
    const player = useVideoPlayer(uri, (p) => {
      p.loop = false;
      p.muted = true;
    });

    useEffect(() => {
      try { player.pause(); } catch {}
    }, [player]);

    return <VideoView style={styles.media} player={player} contentFit="cover" nativeControls={false} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Moments</Text>
        <TouchableOpacity style={styles.editButton} onPress={() => setEditMode((prev) => !prev)}>
          <Text style={styles.editText}>{editMode ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Recent uploads</Text>
        {emptyState ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Moments yet</Text>
            <Text style={styles.emptySubtitle}>Post a Moment to share a quick update.</Text>
          </View>
        ) : (
          moments.map((moment) => {
            const mediaUrl = moment.media_url?.startsWith('http') ? moment.media_url : signedUrls[moment.id];
            return (
              <View key={moment.id} style={styles.momentCard}>
                <View style={styles.mediaContainer}>
                  {moment.type === 'text' ? (
                    <View style={styles.textMoment}>
                      <Text style={styles.textMomentBody}>{moment.text_body || ''}</Text>
                    </View>
                  ) : moment.type === 'photo' ? (
                    mediaUrl ? <Image source={{ uri: mediaUrl }} style={styles.media} /> : <View style={styles.mediaFallback} />
                  ) : mediaUrl ? (
                    <PreviewVideo uri={mediaUrl} />
                  ) : (
                    <View style={styles.mediaFallback} />
                  )}
                  {moment.type === 'video' && (
                    <View style={styles.videoBadge}>
                      <MaterialCommunityIcons name="video" size={16} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardCaption}>{moment.caption || (moment.type === 'text' ? 'Text Moment' : 'Moment')}</Text>
                  {editMode ? (
                    <View style={styles.cardActions}>
                      <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(moment)}>
                        <MaterialCommunityIcons name="share-variant" size={16} color="#111827" />
                        <Text style={styles.actionText}>Share</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionButton, styles.actionDelete]} onPress={() => handleDelete(moment)}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b91c1c" />
                        <Text style={[styles.actionText, styles.actionDeleteText]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        <TouchableOpacity style={styles.addButton} onPress={() => setCreateVisible(true)}>
          <MaterialCommunityIcons name="plus-circle" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Add Moment</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>Moments expire after 24 hours.</Text>
      </ScrollView>

      <MomentCreateModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={() => {
          setCreateVisible(false);
          void fetchMoments();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingTop: 52,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Archivo_700Bold', color: '#111827' },
  editButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#f1f5f9' },
  editText: { color: '#111827', fontFamily: 'Manrope_600SemiBold' },
  content: { padding: 18, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontFamily: 'Archivo_700Bold', color: '#111827', marginBottom: 12 },
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
  momentCard: {
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
    overflow: 'hidden',
  },
  mediaContainer: { height: 220, backgroundColor: '#0f172a' },
  media: { width: '100%', height: '100%' },
  mediaFallback: { width: '100%', height: '100%', backgroundColor: '#0f172a' },
  textMoment: { flex: 1, padding: 18, justifyContent: 'center' },
  textMomentBody: { color: '#f9fafb', fontFamily: 'Manrope_600SemiBold', fontSize: 18, lineHeight: 26 },
  videoBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: { padding: 14 },
  cardCaption: { color: '#111827', fontFamily: 'Manrope_600SemiBold', marginBottom: 6 },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  actionText: { color: '#111827', fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
  actionDelete: { backgroundColor: '#fee2e2' },
  actionDeleteText: { color: '#b91c1c' },
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
  footerText: { marginTop: 16, color: '#6b7280', textAlign: 'center', fontFamily: 'Manrope_500Medium' },
});
