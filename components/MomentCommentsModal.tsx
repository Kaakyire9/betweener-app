import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import {
  createMomentCommentOfflineSafe,
  deleteMomentCommentOfflineSafe,
  updateMomentCommentOfflineSafe,
} from '@/lib/moment-interactions-offline-actions';
import { collectMomentSyncIssues } from '@/lib/offline/moment-sync-issues';
import {
  readMomentCommentsSnapshot,
  removeMomentCommentSnapshot,
  upsertMomentCommentSnapshot,
  writeMomentCommentsSnapshot,
} from '@/lib/offline/moments-store';
import {
  getMomentOfflineMutationSnapshot,
  retryFailedOfflineMutations,
  subscribeToOfflineMutationEvents,
} from '@/lib/offline/mutation-queue';
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

const isQueuedMomentCommentMutation = (
  mutation: Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number] | Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['failed'][number],
): mutation is Extract<
  Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number],
  { kind: 'moment_comment_create' }
> => mutation.kind === 'moment_comment_create';

const isQueuedMomentCommentUpdateMutation = (
  mutation: Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number] | Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['failed'][number],
): mutation is Extract<
  Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number],
  { kind: 'moment_comment_update' }
> => mutation.kind === 'moment_comment_update';

const isQueuedMomentCommentDeleteMutation = (
  mutation: Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number] | Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['failed'][number],
): mutation is Extract<
  Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number],
  { kind: 'moment_comment_delete' }
> => mutation.kind === 'moment_comment_delete';

type ProfileMini = {
  id: string | null;
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
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[(colorScheme ?? 'dark') === 'light' ? 'light' : 'dark'];
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentSyncStateById, setCommentSyncStateById] = useState<
    Record<string, { state: 'pending' | 'failed'; label: string; mutationIds: string[] }>
  >({});
  const [commentsUnavailableOffline, setCommentsUnavailableOffline] = useState(false);
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
    setCommentsUnavailableOffline(false);
    try {
      let hadCachedComments = false;
      let nextComments: CommentRow[] = [];
      const nextProfiles: Record<string, ProfileMini> = {};
      if (user?.id) {
        const cached = await readMomentCommentsSnapshot(user.id, momentId);
        if (cached) {
          hadCachedComments = cached.comments.length > 0;
          setComments(cached.comments);
          setProfiles(cached.profilesByUserId as Record<string, ProfileMini>);
          nextComments = cached.comments as CommentRow[];
          Object.assign(nextProfiles, cached.profilesByUserId as Record<string, ProfileMini>);
        }
      }

      const { data, error: fetchErr } = await supabase
        .from('moment_comments')
        .select('id,moment_id,user_id,body,created_at,is_deleted')
        .eq('moment_id', momentId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (fetchErr && !hadCachedComments) {
        setCommentsUnavailableOffline(true);
      }

      if (!fetchErr && data) {
        nextComments = data as CommentRow[];
        Object.keys(nextProfiles).forEach((key) => delete nextProfiles[key]);

        const userIds = Array.from(new Set(nextComments.map((c) => c.user_id)));
        if (userIds.length > 0) {
          const { data: profileRows } = await supabase.from('profiles').select('id, user_id, full_name, avatar_url').in('user_id', userIds);
          (profileRows || []).forEach((p: any) => {
            if (!p.user_id) return;
            nextProfiles[p.user_id] = {
              id: p.id,
              full_name: p.full_name ?? null,
              avatar_url: p.avatar_url ?? null,
            };
          });
        }
      }
      const offlineSnapshot = await getMomentOfflineMutationSnapshot();
      const localMutations = [...offlineSnapshot.failed, ...offlineSnapshot.pending];
      const localComments = localMutations
        .filter(isQueuedMomentCommentMutation)
        .filter((mutation) => mutation.payload.momentId === momentId)
        .map((mutation) => ({
          id: mutation.payload.tempId,
          moment_id: mutation.payload.momentId,
          user_id: mutation.payload.userId,
          body: mutation.payload.body,
          created_at: mutation.payload.createdAt,
          is_deleted: false,
        }));

      nextComments = [
        ...localComments,
        ...nextComments.filter((comment) => !localComments.some((localComment) => localComment.id === comment.id)),
      ];

      localMutations
        .filter(isQueuedMomentCommentUpdateMutation)
        .filter((mutation) => mutation.payload.momentId === momentId)
        .forEach((mutation) => {
          nextComments = nextComments.map((comment) =>
            comment.id === mutation.payload.commentId ? { ...comment, body: mutation.payload.body } : comment,
          );
        });

      const deletedCommentIds = new Set(
        localMutations
          .filter(isQueuedMomentCommentDeleteMutation)
          .filter((mutation) => mutation.payload.momentId === momentId)
          .map((mutation) => mutation.payload.commentId),
      );

      nextComments = nextComments
        .filter((comment) => !deletedCommentIds.has(comment.id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const nextCommentSyncStateById: Record<
        string,
        { state: 'pending' | 'failed'; label: string; mutationIds: string[] }
      > = {};

      nextComments.forEach((comment) => {
        const issues = localMutations
          .filter(
            (mutation) =>
              (mutation.kind === 'moment_comment_create' && mutation.payload.tempId === comment.id) ||
              (mutation.kind === 'moment_comment_update' && mutation.payload.commentId === comment.id),
          )
          .map((mutation) => ({
            id: mutation.id,
            state: 'failed' in mutation ? ('failed' as const) : ('pending' as const),
          }));
        if (issues.length === 0) return;
        nextCommentSyncStateById[comment.id] = {
          state: issues.some((issue) => issue.state === 'failed') ? 'failed' : 'pending',
          label: issues.some((issue) => issue.state === 'failed') ? 'Needs review' : 'Syncing…',
          mutationIds: issues.map((issue) => issue.id),
        };
      });

      if (user?.id && !nextProfiles[user.id]) {
        nextProfiles[user.id] = {
          id: profile?.id ?? null,
          full_name: profile?.full_name ?? 'You',
          avatar_url: profile?.avatar_url ?? null,
        };
      }

      setComments(nextComments);
      setProfiles(nextProfiles);
      setCommentSyncStateById(nextCommentSyncStateById);
      if (user?.id) {
        await writeMomentCommentsSnapshot(user.id, momentId, {
          comments: nextComments,
          profilesByUserId: nextProfiles,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [momentId, profile?.avatar_url, profile?.full_name, profile?.id, user?.id]);

  useEffect(() => {
    if (visible) {
      void fetchComments();
    } else {
      setText('');
      setEditingCommentId(null);
      setError(null);
      setActiveHighlightCommentId(null);
      setCommentSyncStateById({});
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
    if (!visible) return;
    return subscribeToOfflineMutationEvents((event) => {
      if (
        event.mutation.kind === 'moment_comment_create' ||
        event.mutation.kind === 'moment_comment_update' ||
        event.mutation.kind === 'moment_comment_delete'
      ) {
        void fetchComments();
      }
    });
  }, [fetchComments, visible]);

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
      if (editingCommentId) {
        const result = await updateMomentCommentOfflineSafe({
          commentId: editingCommentId,
          momentId,
          userId: user.id,
          body: trimmed,
        });
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === editingCommentId ? { ...comment, body: trimmed } : comment,
          ),
        );
        if (user.id) {
          await upsertMomentCommentSnapshot(
            user.id,
            momentId,
            {
              id: editingCommentId,
              moment_id: momentId,
              user_id: user.id,
              body: trimmed,
              created_at:
                comments.find((comment) => comment.id === editingCommentId)?.created_at ??
                new Date().toISOString(),
              is_deleted: false,
            },
            {
              id: profile?.id ?? null,
              full_name: profile?.full_name ?? 'You',
              avatar_url: profile?.avatar_url ?? null,
            },
          );
        }
        setText('');
        setEditingCommentId(null);
        if (result.status === 'synced') {
          await fetchComments();
        }
        return;
      }

      const result = await createMomentCommentOfflineSafe({
        momentId,
        userId: user.id,
        body: trimmed,
      });
      const nextComment = {
        id: result.comment.id,
        moment_id: result.comment.moment_id,
        user_id: result.comment.user_id,
        body: result.comment.body,
        created_at: result.comment.created_at,
        is_deleted: false,
      };
      setText('');
      setComments((prev) => {
        return [nextComment, ...prev.filter((comment) => comment.id !== nextComment.id)];
      });
      if (user.id && !profiles[user.id]) {
        setProfiles((prev) => ({
          ...prev,
          [user.id]: {
            id: profile?.id ?? null,
            full_name: profile?.full_name ?? 'You',
            avatar_url: profile?.avatar_url ?? null,
          },
        }));
      }
      await upsertMomentCommentSnapshot(
        user.id,
        momentId,
        nextComment,
        {
          id: profile?.id ?? null,
          full_name: profile?.full_name ?? 'You',
          avatar_url: profile?.avatar_url ?? null,
        },
      );
      if (result.status === 'synced') {
        await fetchComments();
      }
    } catch {
      setError(editingCommentId ? 'Could not update your comment right now.' : 'Could not send your comment right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openCommentActions = useCallback(
    (comment: CommentRow) => {
      const isOwnComment = comment.user_id === user?.id;
      if (!isOwnComment || !momentId || !user?.id) return;
      const syncState = commentSyncStateById[comment.id] ?? null;
      const syncIssueMutationIds = syncState?.mutationIds ?? [];
      Alert.alert('Comment options', undefined, [
        ...(syncState
          ? [
              {
                text: 'Review sync issue',
                onPress: async () => {
                  const snapshot = await getMomentOfflineMutationSnapshot();
                  const issues = collectMomentSyncIssues(
                    [...snapshot.failed, ...snapshot.pending],
                    momentId,
                  ).filter(
                    (issue) =>
                      issue.kind === 'moment_comment_create' || issue.kind === 'moment_comment_update',
                  );
                  Alert.alert(
                    'Comment sync status',
                    issues
                      .filter((issue) => syncIssueMutationIds.includes(issue.id))
                      .map((issue, index) => `${index + 1}. ${issue.title}\n${issue.detail}`)
                      .join('\n\n'),
                  );
                },
              },
            ]
          : []),
        ...(syncState?.state === 'failed'
          ? [
              {
                text: 'Retry sync',
                onPress: async () => {
                  await retryFailedOfflineMutations((mutation) =>
                    syncIssueMutationIds.includes(mutation.id),
                  );
                  void fetchComments();
                },
              },
            ]
          : []),
        {
          text: 'Edit',
          onPress: () => {
            setText(comment.body);
            setEditingCommentId(comment.id);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setComments((prev) => prev.filter((entry) => entry.id !== comment.id));
            if (user.id) {
              await removeMomentCommentSnapshot(user.id, momentId, comment.id);
            }
            try {
              await deleteMomentCommentOfflineSafe({
                commentId: comment.id,
                momentId,
                userId: user.id,
              });
            } catch {
              setError('Could not delete your comment right now.');
              await fetchComments();
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [commentSyncStateById, fetchComments, momentId, user?.id],
  );

  const handleContinueInChat = () => {
    if (!highlightedComment?.user_id || !highlightedComment) return;
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: String(highlightedComment.user_id),
        userName: highlightedCommentProfile.full_name || 'Member',
        userAvatar: highlightedCommentProfile.avatar_url || '',
        prefill: continueInChatPrefill,
      },
    });
    onClose();
  };

  const openCommentProfile = useCallback(
    (profileId?: string | null, commentUserId?: string | null) => {
      if (commentUserId && commentUserId === user?.id) {
        onClose();
        router.push('/(tabs)/profile');
        return;
      }
      if (!profileId) return;
      onClose();
      router.push({ pathname: '/profile-view', params: { profileId: String(profileId) } });
    },
    [onClose, router, user?.id],
  );

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
                  <Text style={styles.emptyBadgeText}>
                    {commentsUnavailableOffline ? 'Offline preview' : 'Start the thread'}
                  </Text>
                </View>
                <Text style={styles.emptyTitle}>
                  {commentsUnavailableOffline ? 'Comments are not cached here yet' : 'No comments yet'}
                </Text>
                <Text style={styles.emptyText}>
                  {commentsUnavailableOffline
                    ? 'This moment has no local comment thread on this device yet. Open it once online to keep the thread available offline.'
                    : 'Be the first to add something warm, specific, and worth replying to.'}
                </Text>
                <View style={styles.emptyHighlights}>
                  <View style={styles.emptyHighlightRow}>
                    <MaterialCommunityIcons name="message-text-outline" size={15} color={theme.secondary} />
                    <Text style={styles.emptyHighlightText}>
                      {commentsUnavailableOffline
                        ? 'Your own offline comments will still appear here immediately after you add them.'
                        : 'Short, thoughtful comments usually get better responses.'}
                    </Text>
                  </View>
                  <View style={styles.emptyHighlightRow}>
                    <MaterialCommunityIcons name="heart-outline" size={15} color={theme.secondary} />
                    <Text style={styles.emptyHighlightText}>
                      {commentsUnavailableOffline
                        ? 'This is a cache gap, not proof that the moment has no comments.'
                        : 'React to the moment itself instead of sending something generic.'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              comments.map((comment) => {
                const profile = profiles[comment.user_id];
                const safeAvatarUrl = getSafeRemoteImageUri(profile?.avatar_url);
                const isHighlighted = activeHighlightCommentId === comment.id;
                const displayName = comment.user_id === user?.id ? 'You' : profile?.full_name || 'Member';
                return (
                  <View
                    key={comment.id}
                    style={[styles.commentRow, isHighlighted && styles.commentRowHighlighted]}
                    onLayout={(event) => {
                      commentLayoutsRef.current[comment.id] = event.nativeEvent.layout.y;
                    }}
                  >
                    <Pressable onPress={() => openCommentProfile(profile?.id, comment.user_id)} style={styles.commentAvatarPressable}>
                      {safeAvatarUrl ? (
                        <Image source={{ uri: safeAvatarUrl }} style={styles.commentAvatarImage} contentFit="cover" />
                      ) : (
                        <View style={styles.commentAvatar}>
                          <Text style={styles.commentAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
                        </View>
                      )}
                    </Pressable>
                    <View style={styles.commentBody}>
                      <View style={styles.commentMeta}>
                        <View style={styles.commentMetaLeft}>
                          <Text style={styles.commentName}>{displayName}</Text>
                          {commentSyncStateById[comment.id] ? (
                            <View
                              style={[
                                styles.commentSyncPill,
                                commentSyncStateById[comment.id]?.state === 'failed'
                                  ? styles.commentSyncPillFailed
                                  : styles.commentSyncPillPending,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.commentSyncText,
                                  commentSyncStateById[comment.id]?.state === 'failed'
                                    ? styles.commentSyncTextFailed
                                    : styles.commentSyncTextPending,
                                ]}
                              >
                                {commentSyncStateById[comment.id]?.label}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.commentMetaRight}>
                          <Text style={styles.commentTime}>{formatTime(comment.created_at)}</Text>
                          {comment.user_id === user?.id ? (
                            <Pressable onPress={() => openCommentActions(comment)} style={styles.commentMoreButton}>
                              <MaterialCommunityIcons name="dots-horizontal" size={15} color={theme.textMuted} />
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                      <Text style={styles.commentText}>{comment.body}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {editingCommentId ? (
            <View style={styles.editingBanner}>
              <Text style={styles.editingBannerText}>Editing comment</Text>
              <Pressable
                onPress={() => {
                  setEditingCommentId(null);
                  setText('');
                }}
              >
                <Text style={styles.editingBannerAction}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

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
  commentAvatarPressable: {
    borderRadius: 17,
  },
  commentAvatarImage: { width: 34, height: 34, borderRadius: 17 },
  commentAvatarText: { color: theme.text, fontFamily: 'Archivo_700Bold' },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  commentMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  commentMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { color: theme.text, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  commentTime: { color: theme.textMuted, fontSize: 12, fontFamily: 'Manrope_500Medium' },
  commentSyncPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  commentSyncPillPending: {
    backgroundColor: 'rgba(91,193,187,0.08)',
    borderColor: 'rgba(91,193,187,0.18)',
  },
  commentSyncPillFailed: {
    backgroundColor: 'rgba(215,104,104,0.08)',
    borderColor: 'rgba(215,104,104,0.18)',
  },
  commentSyncText: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
  },
  commentSyncTextPending: {
    color: theme.secondary,
  },
  commentSyncTextFailed: {
    color: theme.danger,
  },
  commentMoreButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
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
  editingBanner: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(91,193,187,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editingBannerText: {
    color: theme.text,
    fontSize: 12.5,
    fontFamily: 'Manrope_600SemiBold',
  },
  editingBannerAction: {
    color: theme.secondary,
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
  },
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
