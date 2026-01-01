import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type CommentRow = {
  id: string;
  moment_id: string;
  user_id: string;
  body: string;
  created_at: string;
  is_deleted: boolean;
};

type ProfileMini = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Props = {
  visible: boolean;
  momentId: string | null;
  onClose: () => void;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export default function MomentCommentsModal({ visible, momentId, onClose }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const fetchComments = async () => {
    if (!momentId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('moment_comments')
        .select('id,moment_id,user_id,body,created_at,is_deleted')
        .eq('moment_id', momentId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (fetchErr || !data) {
        setComments([]);
        return;
      }
      setComments(data as CommentRow[]);

      const userIds = Array.from(new Set((data as CommentRow[]).map((c) => c.user_id)));
      if (userIds.length === 0) return;
      const { data: profileRows } = await supabase.from('profiles').select('id, user_id, full_name, avatar_url').in('user_id', userIds);
      const nextProfiles: Record<string, ProfileMini> = {};
      (profileRows || []).forEach((p: any) => {
        if (!p.user_id) return;
        nextProfiles[p.user_id] = {
          id: p.id,
          full_name: p.full_name ?? null,
          avatar_url: p.avatar_url ?? null,
        };
      });
      setProfiles(nextProfiles);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      void fetchComments();
    } else {
      setText('');
      setError(null);
    }
  }, [visible, momentId]);

  useEffect(() => {
    if (!visible || !momentId) return;
    const channel = supabase
      .channel(`moment-comments-${momentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moment_comments', filter: `moment_id=eq.${momentId}` },
        () => {
          void fetchComments();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchComments, momentId, visible]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const canSubmit = useMemo(() => text.trim().length > 0 && text.trim().length <= 240, [text]);

  const handleSubmit = async () => {
    if (!momentId || !user?.id) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 240) {
      setError('Comment must be 240 characters or less.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('moment_comments').insert({
        moment_id: momentId,
        user_id: user.id,
        body: trimmed,
      });
      if (insertErr) {
        setError(insertErr.message);
        return;
      }
      setText('');
      await fetchComments();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
        style={[
          styles.sheetWrapper,
          keyboardHeight ? { paddingBottom: Math.max(0, keyboardHeight) } : null,
        ]}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 12) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={18} color="#fff" />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {comments.length === 0 && !loading ? (
              <Text style={styles.emptyText}>No comments yet.</Text>
            ) : (
              comments.map((comment) => {
                const profile = profiles[comment.user_id];
                return (
                  <View key={comment.id} style={styles.commentRow}>
                    {profile?.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={styles.commentAvatarImage} contentFit="cover" />
                    ) : (
                      <View style={styles.commentAvatar}>
                        <Text style={styles.commentAvatarText}>{(profile?.full_name || 'U').slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.commentBody}>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentName}>{profile?.full_name || 'Member'}</Text>
                        <Text style={styles.commentTime}>{formatTime(comment.created_at)}</Text>
                      </View>
                      <Text style={styles.commentText}>{comment.body}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              style={styles.input}
              placeholder="Add a comment"
              placeholderTextColor="#9ca3af"
              maxLength={240}
            />
            <Pressable onPress={handleSubmit} style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]} disabled={!canSubmit || loading}>
              <MaterialCommunityIcons name="send" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0b1220',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: '#fff', fontSize: 16, fontFamily: 'Archivo_700Bold' },
  closeButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  list: { maxHeight: 280 },
  listContent: { paddingBottom: 12, gap: 12 },
  emptyText: { color: '#9ca3af', fontFamily: 'Manrope_500Medium' },
  commentRow: { flexDirection: 'row', gap: 10 },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarImage: { width: 34, height: 34, borderRadius: 17 },
  commentAvatarText: { color: '#fff', fontFamily: 'Archivo_700Bold' },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  commentName: { color: '#e5e7eb', fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  commentTime: { color: '#6b7280', fontSize: 12, fontFamily: 'Manrope_500Medium' },
  commentText: { color: '#e5e7eb', fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#0f172a',
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontFamily: 'Manrope_500Medium',
  },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ec4899', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  errorText: { color: '#f87171', fontSize: 12, marginTop: 6, fontFamily: 'Manrope_500Medium' },
});
