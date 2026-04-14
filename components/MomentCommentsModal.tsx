import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';

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
  highlightCommentId?: string | null;
  relationshipCue?: string | null;
  onClose: () => void;
};

const normalizeCommentText = (value: string | null | undefined) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const getSuggestedReplies = (body: string) => {
  const normalized = normalizeCommentText(body);
  if (!normalized) {
    return ['That stood out to me too.', 'Tell me a little more about that.'];
  }
  if (normalized.includes('?')) {
    return ['That made me think too. What would your answer be?', 'Good question. What led you there?'];
  }
  if (/^(what|why|how|when|where|who)\b/i.test(normalized)) {
    return ['That is a good question to sit with.', 'What made you frame it that way?'];
  }
  if (/^(i|this|it|that|feels?|feeling|honestly|really|sometimes|lately)\b/i.test(normalized)) {
    return ['I liked how you put this.', 'Tell me a little more about what you meant.'];
  }
  return ['That stood out to me too.', 'What made this your response?'];
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

export default function MomentCommentsModal({
  visible,
  momentId,
  highlightCommentId = null,
  relationshipCue = null,
  onClose,
}: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'dark') === 'light' ? 'light' : 'dark'];
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activeHighlightCommentId, setActiveHighlightCommentId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const commentLayoutsRef = useRef<Record<string, number>>({});
  const styles = useMemo(() => createStyles(theme), [theme]);
  const highlightedComment = useMemo(
    () => comments.find((comment) => comment.id === activeHighlightCommentId) ?? null,
    [activeHighlightCommentId, comments],
  );
  const highlightedCommentProfile = highlightedComment ? profiles[highlightedComment.user_id] : null;
  const replySuggestions = useMemo(
    () => (highlightedComment ? getSuggestedReplies(highlightedComment.body) : []),
    [highlightedComment],
  );
  const canContinueInChat = Boolean(
    highlightedComment &&
      highlightedComment.user_id !== user?.id &&
      highlightedCommentProfile?.id,
  );
  const continueInChatPrefill = useMemo(() => {
    const drafted = text.trim();
    if (drafted) return drafted;
    return replySuggestions[0] || 'This comment stayed with me. Want to continue in chat?';
  }, [replySuggestions, text]);
  const continueInChatLabel = useMemo(() => {
    if (relationshipCue === 'Door reopened') return 'Reopen in chat';
    if (relationshipCue === 'You matched') return 'Pick it up privately';
    if (relationshipCue === 'You liked each other') return 'Start privately';
    if (relationshipCue === 'Liked you') return 'Answer in chat';
    if (relationshipCue === 'You reached out') return 'Follow through in chat';
    if (relationshipCue === 'They reached out') return 'Reply in chat';
    if (relationshipCue === 'You liked them') return 'Say hello in chat';
    return 'Continue in chat';
  }, [relationshipCue]);

  const fetchComments = useCallback(async () => {
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
  }, [momentId]);

  useEffect(() => {
    if (visible) {
      void fetchComments();
    } else {
      setText('');
      setError(null);
      setActiveHighlightCommentId(null);
    }
  }, [fetchComments, visible]);

  useEffect(() => {
    if (!visible || !highlightCommentId) return;
    setActiveHighlightCommentId(highlightCommentId);
    const timeout = setTimeout(() => setActiveHighlightCommentId((prev) => (prev === highlightCommentId ? null : prev)), 2400);
    return () => clearTimeout(timeout);
  }, [highlightCommentId, visible]);

  useEffect(() => {
    if (!visible || !highlightCommentId || comments.length === 0) return;
    const targetExists = comments.some((comment) => comment.id === highlightCommentId);
    if (!targetExists) return;
    const y = commentLayoutsRef.current[highlightCommentId];
    if (typeof y !== 'number') return;
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 80);
    return () => clearTimeout(timeout);
  }, [comments, highlightCommentId, visible]);

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
        setError('Could not send your comment right now. Please try again.');
        return;
      }
      setText('');
      await fetchComments();
    } finally {
      setLoading(false);
    }
  };

  const handleContinueInChat = () => {
    if (!highlightedCommentProfile?.id || !highlightedComment) return;
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: String(highlightedCommentProfile.id),
        userName: highlightedCommentProfile.full_name || 'Member',
        userAvatar: highlightedCommentProfile.avatar_url || '',
        prefill: continueInChatPrefill,
      },
    });
    onClose();
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

          <ScrollView ref={scrollViewRef} style={styles.list} contentContainerStyle={styles.listContent}>
            {comments.length === 0 && !loading ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyBadge}>
                  <Text style={styles.emptyBadgeText}>Start the thread</Text>
                </View>
                <Text style={styles.emptyTitle}>No comments yet</Text>
                <Text style={styles.emptyText}>
                  Be the first to add something warm, specific, and worth replying to.
                </Text>
                <View style={styles.emptyHighlights}>
                  <View style={styles.emptyHighlightRow}>
                    <MaterialCommunityIcons name="message-text-outline" size={15} color={theme.secondary} />
                    <Text style={styles.emptyHighlightText}>Short, thoughtful comments usually get better responses.</Text>
                  </View>
                  <View style={styles.emptyHighlightRow}>
                    <MaterialCommunityIcons name="heart-outline" size={15} color={theme.secondary} />
                    <Text style={styles.emptyHighlightText}>React to the moment itself instead of sending something generic.</Text>
                  </View>
                </View>
              </View>
            ) : (
              comments.map((comment) => {
                const profile = profiles[comment.user_id];
                const safeAvatarUrl = getSafeRemoteImageUri(profile?.avatar_url);
                const isHighlighted = activeHighlightCommentId === comment.id;
                return (
                  <View
                    key={comment.id}
                    style={[styles.commentRow, isHighlighted && styles.commentRowHighlighted]}
                    onLayout={(event) => {
                      commentLayoutsRef.current[comment.id] = event.nativeEvent.layout.y;
                    }}
                  >
                    {safeAvatarUrl ? (
                      <Image source={{ uri: safeAvatarUrl }} style={styles.commentAvatarImage} contentFit="cover" />
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

          {highlightedComment && !text.trim() ? (
            <View style={styles.replyAssistCard}>
              <View style={styles.replyAssistHeader}>
                <MaterialCommunityIcons name="message-reply-text-outline" size={15} color={theme.secondary} />
                <Text style={styles.replyAssistEyebrow}>
                  Reply to {highlightedCommentProfile?.full_name?.split(' ')[0] || 'this comment'}
                </Text>
              </View>
              <Text style={styles.replyAssistBody} numberOfLines={2}>
                {highlightedComment.body}
              </Text>
              <View style={styles.replyAssistChips}>
                {replySuggestions.slice(0, 2).map((suggestion) => (
                  <Pressable key={suggestion} style={styles.replyAssistChip} onPress={() => setText(suggestion)}>
                    <Text style={styles.replyAssistChipText} numberOfLines={2}>
                      {suggestion}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {canContinueInChat ? (
                <Pressable style={styles.replyAssistChatButton} onPress={handleContinueInChat}>
                  <MaterialCommunityIcons name="chat-processing-outline" size={15} color="#081313" />
                  <Text style={styles.replyAssistChatButtonText}>{continueInChatLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              style={styles.input}
              placeholder="Add a comment"
              placeholderTextColor={theme.textMuted}
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

const createStyles = (theme: typeof Colors.dark) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: theme.text, fontSize: 16, fontFamily: 'Archivo_700Bold' },
  closeButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  list: { maxHeight: 280 },
  listContent: { paddingBottom: 12, gap: 12 },
  emptyCard: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    backgroundColor: theme.backgroundSubtle,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyBadgeText: {
    color: theme.textMuted,
    fontSize: 10,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.3,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: 'Archivo_700Bold',
  },
  emptyText: { color: theme.textMuted, fontFamily: 'Manrope_500Medium', lineHeight: 20 },
  emptyHighlights: { gap: 8 },
  emptyHighlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  emptyHighlightText: { flex: 1, color: theme.text, fontFamily: 'Manrope_500Medium', fontSize: 12, lineHeight: 18 },
  commentRow: { flexDirection: 'row', gap: 10, borderRadius: 16, padding: 8, marginHorizontal: -8 },
  commentRowHighlighted: {
    backgroundColor: 'rgba(91,193,187,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.24)',
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarImage: { width: 34, height: 34, borderRadius: 17 },
  commentAvatarText: { color: theme.text, fontFamily: 'Archivo_700Bold' },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  commentName: { color: theme.text, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  commentTime: { color: theme.textMuted, fontSize: 12, fontFamily: 'Manrope_500Medium' },
  commentText: { color: theme.text, fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.backgroundSubtle,
    color: theme.text,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontFamily: 'Manrope_500Medium',
  },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  errorText: { color: theme.danger, fontSize: 12, marginTop: 6, fontFamily: 'Manrope_500Medium' },
  replyAssistCard: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: 'rgba(91,193,187,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.18)',
    gap: 8,
  },
  replyAssistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replyAssistEyebrow: {
    color: theme.secondary,
    fontSize: 11,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.2,
  },
  replyAssistBody: {
    color: theme.text,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
  },
  replyAssistChips: {
    flexDirection: 'row',
    gap: 8,
  },
  replyAssistChip: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: theme.backgroundSubtle,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
  },
  replyAssistChipText: {
    color: theme.text,
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: 'Manrope_600SemiBold',
  },
  replyAssistChatButton: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.tint,
  },
  replyAssistChatButtonText: {
    color: '#081313',
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
  },
});
