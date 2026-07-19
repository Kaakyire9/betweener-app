import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import OfflineImage from '@/components/media/OfflineImage';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  createMomentCommentOfflineSafe,
  deleteMomentCommentOfflineSafe,
  syncMomentCommentReactionOfflineSafe,
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
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';

type CommentRow = {
  id: string;
  moment_id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
  is_deleted: boolean;
};

type MomentCommentReactionValue = 'heart' | 'laugh' | 'love' | 'fire' | 'clap';

type CommentReactionRow = {
  comment_id: string;
  user_id: string;
  reaction: MomentCommentReactionValue;
  created_at: string;
};

type CommentReactionState = {
  myReaction: MomentCommentReactionValue | null;
  counts: Partial<Record<MomentCommentReactionValue, number>>;
};

const MOMENT_COMMENT_REACTION_OPTIONS: {
  value: MomentCommentReactionValue;
  emoji: string;
  label: string;
}[] = [
  { value: 'heart', emoji: '\u2764\uFE0F', label: 'Heart' },
  { value: 'love', emoji: '\uD83D\uDE0D', label: 'Love' },
  { value: 'fire', emoji: '\uD83D\uDD25', label: 'Fire' },
  { value: 'clap', emoji: '\uD83D\uDC4F', label: 'Clap' },
  { value: 'laugh', emoji: '\uD83D\uDE02', label: 'Laugh' },
];

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

const isQueuedMomentCommentReactionMutation = (
  mutation: Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number] | Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['failed'][number],
): mutation is Extract<
  Awaited<ReturnType<typeof getMomentOfflineMutationSnapshot>>['pending'][number],
  { kind: 'moment_comment_reaction_sync' }
> => mutation.kind === 'moment_comment_reaction_sync';

type ProfileMini = {
  id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  photos?: string[] | null;
};

type Props = {
  visible: boolean;
  momentId: string | null;
  highlightCommentId?: string | null;
  relationshipCue?: string | null;
  onCommentCountChange?: (count: number) => void;
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

const resolveProfileMiniAvatarUri = (profile?: ProfileMini | null) => {
  const avatarUrl = getSafeRemoteImageUri(normalizeProfilePhotoUri(profile?.avatar_url));
  if (avatarUrl) return avatarUrl;
  const photos = Array.isArray(profile?.photos) ? profile.photos : [];
  const firstPhoto = photos.find((photo): photo is string => typeof photo === 'string' && photo.trim().length > 0);
  return getSafeRemoteImageUri(normalizeProfilePhotoUri(firstPhoto ?? null));
};

const hasUsableProfileMiniSnapshot = (profile?: ProfileMini | null) =>
  Boolean(profile?.full_name || resolveProfileMiniAvatarUri(profile));

const sortCommentsNewestFirst = (left: CommentRow, right: CommentRow) =>
  new Date(right.created_at).getTime() - new Date(left.created_at).getTime();

const sortCommentsOldestFirst = (left: CommentRow, right: CommentRow) =>
  new Date(left.created_at).getTime() - new Date(right.created_at).getTime();

const ensureCommentReactionState = (
  states: Record<string, CommentReactionState>,
  commentId: string,
) => {
  if (!states[commentId]) {
    states[commentId] = {
      myReaction: null,
      counts: {},
    };
  }
  return states[commentId];
};

const applyReactionDelta = (
  entry: CommentReactionState,
  reaction: MomentCommentReactionValue,
  delta: number,
) => {
  const nextValue = Math.max(0, (entry.counts[reaction] ?? 0) + delta);
  if (nextValue === 0) {
    delete entry.counts[reaction];
    return;
  }
  entry.counts[reaction] = nextValue;
};

const applyOptimisticCommentReaction = (
  entry: CommentReactionState,
  previousReaction: MomentCommentReactionValue | null,
  nextReaction: MomentCommentReactionValue | null,
) => {
  if (previousReaction && previousReaction !== nextReaction) {
    applyReactionDelta(entry, previousReaction, -1);
  }
  if (nextReaction && previousReaction !== nextReaction) {
    applyReactionDelta(entry, nextReaction, 1);
  }
  entry.myReaction = nextReaction;
};

export default function MomentCommentsModal({
  visible,
  momentId,
  highlightCommentId = null,
  relationshipCue = null,
  onCommentCountChange,
  onClose,
}: Props) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentSyncStateById, setCommentSyncStateById] = useState<
    Record<string, { state: 'pending' | 'failed'; label: string; mutationIds: string[] }>
  >({});
  const [commentReactionStateById, setCommentReactionStateById] = useState<
    Record<string, CommentReactionState>
  >({});
  const [commentReactionSyncStateById, setCommentReactionSyncStateById] = useState<
    Record<string, { state: 'pending' | 'failed'; label: string; mutationIds: string[] }>
  >({});
  const [commentsUnavailableOffline, setCommentsUnavailableOffline] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activeHighlightCommentId, setActiveHighlightCommentId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const commentLayoutsRef = useRef<Record<string, number>>({});
  const profilesRef = useRef<Record<string, ProfileMini>>({});
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const commentsById = useMemo(
    () => new Map(comments.map((comment) => [comment.id, comment])),
    [comments],
  );
  const highlightedComment = useMemo(
    () => comments.find((comment) => comment.id === activeHighlightCommentId) ?? null,
    [activeHighlightCommentId, comments],
  );
  const replyingToComment = useMemo(
    () => (replyingToCommentId ? commentsById.get(replyingToCommentId) ?? null : null),
    [commentsById, replyingToCommentId],
  );
  const replyRootComment = useMemo(() => {
    if (!replyingToComment) return null;
    if (!replyingToComment.parent_comment_id) return replyingToComment;
    return commentsById.get(replyingToComment.parent_comment_id) ?? replyingToComment;
  }, [commentsById, replyingToComment]);
  const topLevelComments = useMemo(
    () =>
      comments
        .filter(
          (comment) =>
            !comment.parent_comment_id ||
            !commentsById.has(comment.parent_comment_id),
        )
        .slice()
        .sort(sortCommentsNewestFirst),
    [comments, commentsById],
  );
  const repliesByParentId = useMemo(() => {
    const next: Record<string, CommentRow[]> = {};
    comments.forEach((comment) => {
      if (!comment.parent_comment_id || !commentsById.has(comment.parent_comment_id)) return;
      if (!next[comment.parent_comment_id]) {
        next[comment.parent_comment_id] = [];
      }
      next[comment.parent_comment_id]!.push(comment);
    });
    Object.values(next).forEach((thread) => thread.sort(sortCommentsOldestFirst));
    return next;
  }, [comments, commentsById]);
  const currentUserProfileMini = useMemo<ProfileMini>(
    () => ({
      id: profile?.id ?? null,
      full_name: profile?.full_name ?? 'You',
      avatar_url: normalizeProfilePhotoUri(profile?.avatar_url),
      photos: Array.isArray((profile as any)?.photos) ? ((profile as any).photos as string[]) : null,
    }),
    [profile],
  );
  const highlightedCommentProfile = highlightedComment ? profiles[highlightedComment.user_id] : null;
  const visibleCommentCount = useMemo(
    () => comments.filter((comment) => !comment.is_deleted).length,
    [comments],
  );
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

  useEffect(() => {
    if (!visible || !momentId || !onCommentCountChange) return;
    onCommentCountChange(visibleCommentCount);
  }, [momentId, onCommentCountChange, visible, visibleCommentCount]);

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
          profilesRef.current = cached.profilesByUserId as Record<string, ProfileMini>;
          nextComments = cached.comments as CommentRow[];
          Object.assign(nextProfiles, cached.profilesByUserId as Record<string, ProfileMini>);
        }
      }

      const { data, error: fetchErr } = await supabase
        .from('moment_comments')
        .select('id,moment_id,user_id,body,created_at,parent_comment_id,is_deleted')
        .eq('moment_id', momentId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(40);

      if (fetchErr && !hadCachedComments) {
        setCommentsUnavailableOffline(true);
      }

      if (!fetchErr && data) {
        nextComments = data as CommentRow[];
        Object.keys(nextProfiles).forEach((key) => delete nextProfiles[key]);

        const userIds = Array.from(new Set(nextComments.map((c) => c.user_id)));
        const missingUserIds = userIds.filter((userId) => !hasUsableProfileMiniSnapshot(profilesRef.current[userId]));
        userIds.forEach((userId) => {
          const cachedProfile = profilesRef.current[userId];
          if (hasUsableProfileMiniSnapshot(cachedProfile)) nextProfiles[userId] = cachedProfile;
        });
        if (missingUserIds.length > 0) {
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id, user_id, full_name, avatar_url, photos')
            .in('user_id', missingUserIds);
          (profileRows || []).forEach((p: any) => {
            if (!p.user_id) return;
            const normalizedProfile = {
              id: p.id,
              full_name: p.full_name ?? null,
              avatar_url: resolveProfileMiniAvatarUri(p),
              photos: Array.isArray(p.photos) ? p.photos : null,
            };
            nextProfiles[p.user_id] = normalizedProfile;
            profilesRef.current[p.user_id] = normalizedProfile;
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
          parent_comment_id: mutation.payload.parentCommentId ?? null,
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
        .sort(sortCommentsNewestFirst);

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
          label: issues.some((issue) => issue.state === 'failed') ? 'Needs review' : 'Syncing...',
          mutationIds: issues.map((issue) => issue.id),
        };
      });

      const nextCommentReactionStateById: Record<string, CommentReactionState> = {};
      nextComments.forEach((comment) => {
        ensureCommentReactionState(nextCommentReactionStateById, comment.id);
      });

      const serverReactionCommentIds = nextComments
        .map((comment) => comment.id)
        .filter((commentId) => !commentId.startsWith('offline-comment:'));

      if (serverReactionCommentIds.length > 0) {
        const { data: reactionRows } = await supabase
          .from('moment_comment_reactions')
          .select('comment_id,user_id,reaction,created_at')
          .in('comment_id', serverReactionCommentIds);

        (reactionRows as CommentReactionRow[] | null)?.forEach((row) => {
          if (!row?.comment_id || !row?.reaction) return;
          const entry = ensureCommentReactionState(nextCommentReactionStateById, row.comment_id);
          applyReactionDelta(entry, row.reaction, 1);
          if (row.user_id === user?.id) {
            entry.myReaction = row.reaction;
          }
        });
      }

      const nextCommentReactionSyncStateById: Record<
        string,
        { state: 'pending' | 'failed'; label: string; mutationIds: string[] }
      > = {};

      nextComments.forEach((comment) => {
        const issues = localMutations
          .filter(isQueuedMomentCommentReactionMutation)
          .filter((mutation) => mutation.payload.commentId === comment.id)
          .map((mutation) => ({
            id: mutation.id,
            state: 'failed' in mutation ? ('failed' as const) : ('pending' as const),
            payload: mutation.payload,
          }));
        if (issues.length === 0) return;

        const entry = ensureCommentReactionState(nextCommentReactionStateById, comment.id);
        issues.forEach((issue) => {
          applyOptimisticCommentReaction(
            entry,
            issue.payload.previousReaction ?? entry.myReaction ?? null,
            issue.payload.reaction ?? null,
          );
        });

        nextCommentReactionSyncStateById[comment.id] = {
          state: issues.some((issue) => issue.state === 'failed') ? 'failed' : 'pending',
          label: issues.some((issue) => issue.state === 'failed')
            ? 'Reaction needs review'
            : 'Reaction syncing...',
          mutationIds: issues.map((issue) => issue.id),
        };
      });

      if (user?.id && !nextProfiles[user.id]) {
        nextProfiles[user.id] = currentUserProfileMini;
      }

      setComments(nextComments);
      setProfiles(nextProfiles);
      profilesRef.current = nextProfiles;
      setCommentSyncStateById(nextCommentSyncStateById);
      setCommentReactionStateById(nextCommentReactionStateById);
      setCommentReactionSyncStateById(nextCommentReactionSyncStateById);
      if (user?.id) {
        await writeMomentCommentsSnapshot(user.id, momentId, {
          comments: nextComments,
          profilesByUserId: nextProfiles,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserProfileMini, momentId, profile?.avatar_url, profile?.full_name, profile?.id, user?.id]);

  useEffect(() => {
    if (visible) {
      void fetchComments();
    } else {
      setText('');
      setEditingCommentId(null);
      setReplyingToCommentId(null);
      setError(null);
      setActiveHighlightCommentId(null);
      setCommentSyncStateById({});
      setCommentReactionStateById({});
      setCommentReactionSyncStateById({});
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
    const scheduleFetchComments = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        void fetchComments();
      }, 250);
    };
    const channel = supabase
      .channel(`moment-comments-${momentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moment_comments', filter: `moment_id=eq.${momentId}` },
        scheduleFetchComments,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'moment_comment_reactions',
          filter: `moment_id=eq.${momentId}`,
        },
        scheduleFetchComments,
      )
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchComments, momentId, visible]);

  useEffect(() => {
    if (!visible) return;
    return subscribeToOfflineMutationEvents((event) => {
      if (
        event.mutation.kind === 'moment_comment_create' ||
        event.mutation.kind === 'moment_comment_update' ||
        event.mutation.kind === 'moment_comment_delete' ||
        event.mutation.kind === 'moment_comment_reaction_sync'
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
    const editingComment = editingCommentId
      ? comments.find((comment) => comment.id === editingCommentId) ?? null
      : null;
    const replyParentCommentId = replyRootComment?.id ?? null;
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
              created_at: editingComment?.created_at ?? new Date().toISOString(),
              parent_comment_id: editingComment?.parent_comment_id ?? null,
              is_deleted: false,
            },
            {
              ...currentUserProfileMini,
            },
          );
        }
        setText('');
        setEditingCommentId(null);
        setReplyingToCommentId(null);
        if (result.status === 'synced') {
          await fetchComments();
        }
        return;
      }

      const result = await createMomentCommentOfflineSafe({
        momentId,
        userId: user.id,
        body: trimmed,
        parentCommentId: replyParentCommentId,
      });
      const nextComment = {
        id: result.comment.id,
        moment_id: result.comment.moment_id,
        user_id: result.comment.user_id,
        body: result.comment.body,
        created_at: result.comment.created_at,
        parent_comment_id: result.comment.parent_comment_id ?? replyParentCommentId,
        is_deleted: false,
      };
      setText('');
      setReplyingToCommentId(null);
      setComments((prev) => {
        return [nextComment, ...prev.filter((comment) => comment.id !== nextComment.id)].sort(
          sortCommentsNewestFirst,
        );
      });
      if (user.id && !profiles[user.id]) {
        setProfiles((prev) => ({
          ...prev,
          [user.id]: {
            ...currentUserProfileMini,
          },
        }));
      }
      await upsertMomentCommentSnapshot(
        user.id,
        momentId,
        nextComment,
        {
          ...currentUserProfileMini,
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
            setReplyingToCommentId(null);
            setEditingCommentId(comment.id);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const removedCommentIds = comments
              .filter(
                (entry) =>
                  entry.id === comment.id || entry.parent_comment_id === comment.id,
              )
              .map((entry) => entry.id);
            setReplyingToCommentId((current) =>
              current && removedCommentIds.includes(current) ? null : current,
            );
            setEditingCommentId((current) =>
              current && removedCommentIds.includes(current) ? null : current,
            );
            setComments((prev) =>
              prev.filter(
                (entry) =>
                  entry.id !== comment.id && entry.parent_comment_id !== comment.id,
              ),
            );
            if (user.id) {
              await Promise.all(
                removedCommentIds.map((commentId) =>
                  removeMomentCommentSnapshot(user.id, momentId, commentId),
                ),
              );
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
    [commentSyncStateById, comments, fetchComments, momentId, user?.id],
  );

  const handleStartReply = useCallback((comment: CommentRow) => {
    setEditingCommentId(null);
    setReplyingToCommentId(comment.id);
    if (!text.trim()) {
      setText('');
    }
  }, [text]);

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

  const handleToggleReaction = useCallback(
    async (commentId: string, reaction: MomentCommentReactionValue) => {
      if (!momentId || !user?.id) return;
      const currentReaction = commentReactionStateById[commentId]?.myReaction ?? null;
      const nextReaction = currentReaction === reaction ? null : reaction;

      setCommentReactionStateById((current) => {
        const currentEntry = current[commentId] ?? { myReaction: null, counts: {} };
        const nextEntry: CommentReactionState = {
          myReaction: currentEntry.myReaction,
          counts: { ...currentEntry.counts },
        };
        applyOptimisticCommentReaction(nextEntry, currentReaction, nextReaction);
        return {
          ...current,
          [commentId]: nextEntry,
        };
      });
      setCommentReactionSyncStateById((current) => ({
        ...current,
        [commentId]: {
          state: 'pending',
          label: 'Reaction syncing...',
          mutationIds: current[commentId]?.mutationIds ?? [],
        },
      }));
      setError(null);

      try {
        const result = await syncMomentCommentReactionOfflineSafe({
          commentId,
          momentId,
          userId: user.id,
          reaction: nextReaction,
          previousReaction: currentReaction,
        });
        if (result.status === 'synced') {
          setCommentReactionSyncStateById((current) => {
            const next = { ...current };
            delete next[commentId];
            return next;
          });
          void fetchComments();
        }
      } catch {
        setError('Could not update your reaction right now.');
        void fetchComments();
      }
    },
    [commentReactionStateById, currentUserProfileMini, fetchComments, momentId, user?.id],
  );

  const renderCommentCard = useCallback(
    (comment: CommentRow, options?: { isReply?: boolean; parentComment?: CommentRow | null }) => {
      const isReply = options?.isReply === true;
      const parentComment = options?.parentComment ?? null;
      const profileRecord = profiles[comment.user_id];
      const parentProfile =
        parentComment ? profiles[parentComment.user_id] ?? null : null;
      const safeAvatarUrl = resolveProfileMiniAvatarUri(profileRecord);
      const isHighlighted = activeHighlightCommentId === comment.id;
      const displayName =
        comment.user_id === user?.id ? 'You' : profileRecord?.full_name || 'Member';
      const parentDisplayName = parentComment
        ? parentComment.user_id === user?.id
          ? 'you'
          : parentProfile?.full_name?.split(' ')[0] || 'member'
        : null;
      const reactionState = commentReactionStateById[comment.id] ?? {
        myReaction: null,
        counts: {},
      };
      const reactionSyncState = commentReactionSyncStateById[comment.id] ?? null;

      return (
        <View
          key={comment.id}
          style={[
            styles.commentRow,
            isReply && styles.replyRow,
            isHighlighted && styles.commentRowHighlighted,
          ]}
          onLayout={(event) => {
            commentLayoutsRef.current[comment.id] = event.nativeEvent.layout.y;
          }}
        >
          <Pressable
            onPress={() => openCommentProfile(profileRecord?.id, comment.user_id)}
            style={styles.commentAvatarPressable}
          >
            <OfflineImage
              uri={safeAvatarUrl}
              style={styles.commentAvatarImage}
              contentFit="cover"
              fallback={
                <View style={styles.commentAvatar}>
                  <Text style={styles.commentAvatarText}>
                    {displayName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              }
            />
          </Pressable>
          <View style={[styles.commentBody, isReply && styles.replyBody]}>
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
                  <Pressable
                    onPress={() => openCommentActions(comment)}
                    style={styles.commentMoreButton}
                  >
                    <MaterialCommunityIcons
                      name="dots-horizontal"
                      size={15}
                      color={theme.textMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
            {isReply && parentComment && parentDisplayName ? (
              <View style={styles.replyPreviewCard}>
                <Text style={styles.replyingToText} numberOfLines={1}>
                  {`Replying to ${parentDisplayName}`}
                </Text>
                <Text style={styles.replyPreviewBody} numberOfLines={2}>
                  {parentComment.body}
                </Text>
              </View>
            ) : null}
            <Text style={styles.commentText}>{comment.body}</Text>
            <View style={styles.commentActionRow}>
              <Pressable
                onPress={() => handleStartReply(comment)}
                style={styles.commentUtilityAction}
              >
                <MaterialCommunityIcons
                  name="reply-outline"
                  size={13}
                  color={theme.textMuted}
                />
                <Text style={styles.commentUtilityActionText}>Reply</Text>
              </Pressable>
              {MOMENT_COMMENT_REACTION_OPTIONS.map((option) => {
                const count = reactionState.counts[option.value] ?? 0;
                const active = reactionState.myReaction === option.value;
                return (
                  <Pressable
                    key={`${comment.id}:${option.value}`}
                    style={[
                      styles.commentReactionButton,
                      active && styles.commentReactionButtonActive,
                    ]}
                    onPress={() => {
                      void handleToggleReaction(comment.id, option.value);
                    }}
                  >
                    <Text style={styles.commentReactionEmoji}>{option.emoji}</Text>
                    {count > 0 ? (
                      <Text
                        style={[
                          styles.commentReactionCount,
                          active && styles.commentReactionCountActive,
                        ]}
                      >
                        {count}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {reactionSyncState ? (
                <View
                  style={[
                    styles.commentReactionStatusPill,
                    reactionSyncState.state === 'failed'
                      ? styles.commentReactionStatusPillFailed
                      : styles.commentReactionStatusPillPending,
                  ]}
                >
                  <Text
                    style={[
                      styles.commentReactionStatusText,
                      reactionSyncState.state === 'failed'
                        ? styles.commentReactionStatusTextFailed
                        : styles.commentReactionStatusTextPending,
                    ]}
                  >
                    {reactionSyncState.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [
      activeHighlightCommentId,
      commentReactionStateById,
      commentReactionSyncStateById,
      commentSyncStateById,
      handleStartReply,
      handleToggleReaction,
      openCommentActions,
      openCommentProfile,
      profiles,
      styles,
      theme.textMuted,
      user?.id,
    ],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View pointerEvents="none" style={styles.backdropLayer}>
          <BlurViewSafe
            intensity={isDark ? 28 : 36}
            tint={isDark ? 'dark' : 'light'}
            style={styles.backdropBlur}
          />
          <View style={styles.backdropScrim} />
        </View>
        <Pressable style={styles.backdropPressable} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
          style={[
            styles.sheetWrapper,
            keyboardHeight ? { paddingBottom: Math.max(0, keyboardHeight) } : null,
          ]}
        >
          <BlurViewSafe
            intensity={isDark ? 34 : 40}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 12) }]}
          >
            <View pointerEvents="none" style={styles.sheetGlassFill} />
            <View pointerEvents="none" style={styles.sheetGlassSheen} />
            <View pointerEvents="none" style={styles.sheetAmbientGlowPrimary} />
            <View pointerEvents="none" style={styles.sheetAmbientGlowSecondary} />
            <View pointerEvents="none" style={styles.sheetReadabilityVeil} />
            <View style={styles.header}>
              <Text style={styles.title}>Warm responses</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={18} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollViewRef}
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {comments.length === 0 && !loading ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyBadge}>
                    <Text style={styles.emptyBadgeText}>
                      {commentsUnavailableOffline ? 'Offline preview' : 'Start the thread'}
                    </Text>
                  </View>
                  <Text style={styles.emptyTitle}>
                    {commentsUnavailableOffline
                      ? 'Warm responses are not cached here yet'
                      : 'No warm responses yet'}
                  </Text>
                  <Text style={styles.emptyText}>
                    {commentsUnavailableOffline
                      ? 'This moment has no local comment thread on this device yet. Open it once online to keep the thread available offline.'
                      : 'Be the first to add something warm, specific, and worth replying to.'}
                  </Text>
                  <View style={styles.emptyHighlights}>
                    <View style={styles.emptyHighlightRow}>
                      <MaterialCommunityIcons
                        name="message-text-outline"
                        size={15}
                        color={theme.secondary}
                      />
                      <Text style={styles.emptyHighlightText}>
                        {commentsUnavailableOffline
                          ? 'Your own offline comments will still appear here immediately after you add them.'
                          : 'Short, thoughtful comments usually get better responses.'}
                      </Text>
                    </View>
                    <View style={styles.emptyHighlightRow}>
                      <MaterialCommunityIcons
                        name="heart-outline"
                        size={15}
                        color={theme.secondary}
                      />
                      <Text style={styles.emptyHighlightText}>
                        {commentsUnavailableOffline
                          ? 'This is a cache gap, not proof that the moment has no comments.'
                          : 'React to the moment itself instead of sending something generic.'}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                topLevelComments.map((comment) => {
                  const replies = repliesByParentId[comment.id] ?? [];
                  return (
                    <View key={comment.id} style={styles.commentThread}>
                      {renderCommentCard(comment)}
                      {replies.length > 0 ? (
                        <View style={styles.replyStack}>
                          {replies.map((reply) =>
                            renderCommentCard(reply, {
                              isReply: true,
                              parentComment: comment,
                            }),
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {replyingToComment ? (
              <View style={styles.modeBanner}>
                <View style={styles.modeBannerCopy}>
                  <Text style={styles.modeBannerEyebrow}>
                    Replying to{' '}
                    {replyingToComment.user_id === user?.id
                      ? 'your warm response'
                      : profiles[replyingToComment.user_id]?.full_name?.split(' ')[0] || 'member'}
                  </Text>
                  <Text style={styles.modeBannerBody} numberOfLines={1}>
                    {replyingToComment.body}
                  </Text>
                </View>
                <Pressable
                  style={styles.modeBannerClose}
                  onPress={() => setReplyingToCommentId(null)}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={15}
                    color={theme.textMuted}
                  />
                </Pressable>
              </View>
            ) : null}

            {editingCommentId ? (
              <View style={styles.modeBanner}>
                <View style={styles.modeBannerCopy}>
                  <Text style={styles.modeBannerEyebrow}>Editing warm response</Text>
                  <Text style={styles.modeBannerBody} numberOfLines={1}>
                    {
                      comments.find((comment) => comment.id === editingCommentId)?.body ??
                      'Refine your comment'
                    }
                  </Text>
                </View>
                <Pressable
                  style={styles.modeBannerClose}
                  onPress={() => {
                    setEditingCommentId(null);
                    setText('');
                  }}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={15}
                    color={theme.textMuted}
                  />
                </Pressable>
              </View>
            ) : null}

            {highlightedComment && !text.trim() && !replyingToComment && !editingCommentId ? (
              <View style={styles.replyAssistCard}>
                <View style={styles.replyAssistHeader}>
                  <MaterialCommunityIcons
                    name="message-reply-text-outline"
                    size={15}
                    color={theme.secondary}
                  />
                  <Text style={styles.replyAssistEyebrow}>
                    Reply to{' '}
                    {highlightedCommentProfile?.full_name?.split(' ')[0] || 'this comment'}
                  </Text>
                </View>
                <Text style={styles.replyAssistBody} numberOfLines={2}>
                  {highlightedComment.body}
                </Text>
                <View style={styles.replyAssistChips}>
                  {replySuggestions.slice(0, 2).map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      style={styles.replyAssistChip}
                      onPress={() => {
                        setReplyingToCommentId(highlightedComment.id);
                        setText(suggestion);
                      }}
                    >
                      <Text style={styles.replyAssistChipText} numberOfLines={2}>
                        {suggestion}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {canContinueInChat ? (
                  <Pressable
                    style={styles.replyAssistChatButton}
                    onPress={handleContinueInChat}
                  >
                    <MaterialCommunityIcons
                      name="chat-processing-outline"
                      size={15}
                      color={Colors.light.background}
                    />
                    <Text style={styles.replyAssistChatButtonText}>
                      {continueInChatLabel}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                style={styles.input}
                placeholder={
                  editingCommentId
                    ? 'Refine your warm response'
                    : replyingToComment
                      ? 'Write a thoughtful reply'
                      : 'Leave a warm response'
                }
                placeholderTextColor={theme.textMuted}
                maxLength={240}
                multiline
              />
              <Pressable
                onPress={handleSubmit}
                style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
                disabled={!canSubmit || loading}
              >
                <MaterialCommunityIcons
                  name={editingCommentId ? 'check' : 'send'}
                  size={16}
                  color={Colors.light.background}
                />
              </Pressable>
            </View>
          </BlurViewSafe>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

const createStyles = (theme: typeof Colors.dark, isDark: boolean) => StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFill,
  },
  backdropBlur: {
    ...StyleSheet.absoluteFill,
  },
  backdropScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: isDark ? 'rgba(4,10,16,0.54)' : 'rgba(10,22,34,0.26)',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  sheetWrapper: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.44)',
    shadowColor: isDark ? '#000000' : '#0f172a',
    shadowOpacity: isDark ? 0.36 : 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -10 },
    elevation: 24,
    overflow: 'hidden',
  },
  sheetGlassFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: isDark ? 'rgba(8,22,30,0.58)' : 'rgba(255,247,239,0.74)',
  },
  sheetGlassSheen: {
    position: 'absolute',
    top: -72,
    left: '8%',
    right: '8%',
    height: 164,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.42)',
    opacity: isDark ? 0.42 : 0.68,
    transform: [{ rotate: '-7deg' }],
  },
  sheetAmbientGlowPrimary: {
    position: 'absolute',
    top: -8,
    right: -36,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(92,210,215,0.10)' : 'rgba(122,232,236,0.18)',
    opacity: isDark ? 0.7 : 0.72,
  },
  sheetAmbientGlowSecondary: {
    position: 'absolute',
    bottom: 22,
    left: -28,
    width: 148,
    height: 148,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(255,178,188,0.08)' : 'rgba(255,210,218,0.16)',
    opacity: isDark ? 0.62 : 0.7,
  },
  sheetReadabilityVeil: {
    position: 'absolute',
    top: 54,
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(7,18,24,0.16)' : 'rgba(255,252,248,0.18)',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: theme.text, fontSize: 18, fontFamily: 'Archivo_700Bold', letterSpacing: -0.18 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.60)',
  },
  list: { maxHeight: 380 },
  listContent: { paddingBottom: 12, gap: 12 },
  emptyCard: {
    borderRadius: 20,
    padding: 16,
    gap: 10,
    backgroundColor: isDark ? 'rgba(18,36,45,0.60)' : 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.58)',
    shadowColor: isDark ? '#000000' : '#14213d',
    shadowOpacity: isDark ? 0.22 : 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emptyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.12),
    backgroundColor: withAlpha(theme.text, isDark ? 0.04 : 0.03),
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
  commentThread: {
    gap: 8,
  },
  replyStack: {
    marginLeft: 18,
    gap: 8,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 20,
  },
  replyRow: {
    marginLeft: 18,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: withAlpha(theme.tint, isDark ? 0.18 : 0.14),
  },
  commentRowHighlighted: {
    backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.055),
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarPressable: {
    borderRadius: 18,
    marginTop: 10,
  },
  commentAvatarImage: { width: 36, height: 36, borderRadius: 18 },
  commentAvatarText: { color: theme.text, fontFamily: 'Archivo_700Bold' },
  commentBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(18,36,45,0.56)' : 'rgba(255,255,255,0.56)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.68)',
    shadowColor: isDark ? '#000000' : '#1f2937',
    shadowOpacity: isDark ? 0.22 : 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  replyBody: {
    backgroundColor: isDark ? 'rgba(14,54,58,0.54)' : 'rgba(247,255,255,0.56)',
    borderColor: withAlpha(theme.tint, isDark ? 0.24 : 0.22),
  },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  commentMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  commentMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { color: theme.text, fontFamily: 'Manrope_700Bold', fontSize: 14 },
  commentTime: { color: theme.textMuted, fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
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
    backgroundColor: withAlpha(theme.text, isDark ? 0.04 : 0.05),
  },
  commentText: { color: theme.text, fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 21 },
  replyPreviewCard: {
    gap: 2,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderLeftWidth: 2,
    borderLeftColor: withAlpha(theme.tint, isDark ? 0.32 : 0.24),
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,250,244,0.66)',
  },
  replyingToText: {
    color: theme.secondary,
    fontSize: 10,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.2,
  },
  replyPreviewBody: {
    color: theme.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'Manrope_500Medium',
  },
  commentActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
    marginTop: 9,
  },
  commentUtilityAction: {
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.60)',
    backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.46)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentUtilityActionText: {
    color: theme.textMuted,
    fontSize: 9.5,
    fontFamily: 'Manrope_700Bold',
  },
  commentReactionButton: {
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.58)',
    backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.42)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  commentReactionButtonActive: {
    borderColor: withAlpha(theme.tint, isDark ? 0.36 : 0.24),
    backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.09),
  },
  commentReactionEmoji: {
    fontSize: 11,
  },
  commentReactionCount: {
    color: theme.textMuted,
    fontSize: 9.5,
    fontFamily: 'Manrope_700Bold',
  },
  commentReactionCountActive: {
    color: theme.secondary,
  },
  commentReactionStatusPill: {
    minHeight: 22,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentReactionStatusPillPending: {
    backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
    borderColor: withAlpha(theme.tint, isDark ? 0.22 : 0.16),
  },
  commentReactionStatusPillFailed: {
    backgroundColor: withAlpha(theme.danger, isDark ? 0.12 : 0.08),
    borderColor: withAlpha(theme.danger, isDark ? 0.22 : 0.16),
  },
  commentReactionStatusText: {
    fontSize: 9,
    fontFamily: 'Manrope_700Bold',
  },
  commentReactionStatusTextPending: {
    color: theme.secondary,
  },
  commentReactionStatusTextFailed: {
    color: theme.danger,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 8,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(14,30,38,0.58)' : 'rgba(255,255,255,0.50)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.74)',
    shadowColor: isDark ? '#000000' : '#14213d',
    shadowOpacity: isDark ? 0.16 : 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 88,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: isDark ? 'rgba(7,18,24,0.38)' : 'rgba(255,248,241,0.68)',
    color: theme.text,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.76)',
    fontFamily: 'Manrope_500Medium',
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.tint,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.tint,
    shadowOpacity: isDark ? 0.28 : 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sendButtonDisabled: { opacity: 0.5 },
  errorText: { color: theme.danger, fontSize: 12, marginTop: 6, fontFamily: 'Manrope_500Medium' },
  modeBanner: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(14,54,58,0.52)' : 'rgba(247,255,255,0.50)',
    borderWidth: 1,
    borderColor: withAlpha(theme.tint, isDark ? 0.22 : 0.20),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeBannerCopy: {
    flex: 1,
    gap: 2,
  },
  modeBannerEyebrow: {
    color: theme.secondary,
    fontSize: 11,
    fontFamily: 'Archivo_700Bold',
    letterSpacing: 0.2,
  },
  modeBannerBody: {
    color: theme.textMuted,
    fontSize: 11.5,
    fontFamily: 'Manrope_500Medium',
  },
  modeBannerClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.34)',
  },
  editingBanner: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: withAlpha(theme.tint, isDark ? 0.1 : 0.08),
    borderWidth: 1,
    borderColor: withAlpha(theme.tint, isDark ? 0.18 : 0.14),
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
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(14,54,58,0.52)' : 'rgba(247,255,255,0.50)',
    borderWidth: 1,
    borderColor: withAlpha(theme.tint, isDark ? 0.2 : 0.18),
    gap: 8,
    shadowColor: isDark ? '#000000' : '#14213d',
    shadowOpacity: isDark ? 0.16 : 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.48)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.58)',
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
    color: Colors.light.background,
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
  },
});
