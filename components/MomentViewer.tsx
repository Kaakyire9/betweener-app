import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image as RNImage,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { fetchMomentConversationState } from '@/lib/moments-eligibility';
import type { Moment, MomentUser } from '@/hooks/useMoments';
import { createSignedUrl } from '@/lib/moments';
import { markMomentViewed } from '@/lib/moments-views';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import type { MomentRelationshipContext } from '@/types/moment-context';
import MomentCommentsModal from '@/components/MomentCommentsModal';
import TextMomentCard from '@/components/moments/TextMomentCard';
import OfflineImage from '@/components/media/OfflineImage';
import { syncMomentReactionOfflineSafe } from '@/lib/moment-interactions-offline-actions';
import {
  readMomentCommentsSnapshot,
  readMomentReactorsSnapshot,
  upsertMomentReactorSnapshot,
  writeMomentReactorsSnapshot,
} from '@/lib/offline/moments-store';
import { useResponsiveMetrics } from '@/lib/responsive';
import { getMomentOfflineMutationSnapshot, subscribeToOfflineMutationEvents } from '@/lib/offline/mutation-queue';

const PHOTO_MOMENT_DURATION = 5800;
const TEXT_MOMENT_DURATION = 7000;
const VIDEO_MOMENT_DURATION = 12000;
const PHOTO_READY_FAILSAFE_MS = 1400;
const VIDEO_READY_STABILIZE_MS = 650;

const emoji = (...codes: number[]) => String.fromCodePoint(...codes);
const REACTIONS = [emoji(0x2764, 0xfe0f), emoji(0x1f525), emoji(0x1f60d), emoji(0x1f44f)];

const normalizeMomentText = (value: string | null | undefined) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const resolveMomentProfileAvatar = (profile?: {
  avatar_url?: string | null;
  photos?: string[] | null;
} | null) => {
  const avatar = normalizeProfilePhotoUri(profile?.avatar_url);
  if (avatar) return avatar;
  const photos = Array.isArray(profile?.photos) ? profile.photos : [];
  const firstPhoto = photos.find((photo) => normalizeProfilePhotoUri(photo));
  return firstPhoto ? normalizeProfilePhotoUri(firstPhoto) : null;
};

const hasUsableViewerProfileSnapshot = (profile?: {
  full_name?: string | null;
  avatar_url?: string | null;
  photos?: string[] | null;
} | null) => Boolean(profile?.full_name || resolveMomentProfileAvatar(profile));

const momentLooksLikeQuestion = (value: string) => value.includes('?');

const momentStartsReflective = (value: string) =>
  /^(what|why|how|when|where|who|which|i|it|this|today|lately|sometimes|feels?|feeling|learning|realized|ready)\b/i.test(
    value,
  );

const formatSignalRecency = (value?: string | null) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return 'recently';
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return 'recently';
};

const getContentAwarePrompts = (moment: Moment | undefined) => {
  const textSnippet = normalizeMomentText(moment?.text_body);
  const captionSnippet = normalizeMomentText(moment?.caption);
  const subject = textSnippet || captionSnippet;

  if (subject && momentLooksLikeQuestion(subject)) {
    return [
      'Your question stayed with me. What answer were you hoping for?',
      'This made me curious. What led you here?',
    ];
  }

  if (moment?.type === 'text' && subject) {
    if (momentStartsReflective(subject)) {
      return [
        'This felt honest. What was sitting on your mind here?',
        'There is more behind this. Tell me the part you nearly left out.',
      ];
    }
    return [
      'What was happening behind this thought?',
      'This stayed with me. Tell me more about it.',
    ];
  }

  if ((moment?.type === 'photo' || moment?.type === 'video') && captionSnippet) {
    return [
      'There is a story in this one. What was happening here?',
      'I paused on this. What made it worth sharing?',
    ];
  }

  if (moment?.type === 'photo' || moment?.type === 'video') {
    return [
      'This looks like a good memory. What was the moment like?',
      'What did this feel like in real life?',
    ];
  }

  if (subject) {
    return [
      'What made you share this now?',
      'This felt real. Tell me more about it.',
    ];
  }

  return [
    'This caught my attention in a good way.',
    'I wanted to say hello after seeing this.',
  ];
};

const getMomentReplyPrompts = (moment: Moment | undefined, relationshipCue: string | null) => {
  const textSnippet = normalizeMomentText(moment?.text_body);
  const captionSnippet = normalizeMomentText(moment?.caption);
  const subject = textSnippet || captionSnippet;
  const contentAwarePrompts = getContentAwarePrompts(moment);

  if (relationshipCue === 'Door reopened') {
    return [
      subject
        ? 'This made me want to reopen the conversation.'
        : 'This feels like a good reason to reopen the conversation.',
      momentLooksLikeQuestion(subject)
        ? 'You asked this at the right time. What answer were you hoping for?'
        : 'You shared this at the right time. What changed?',
    ];
  }
  if (relationshipCue === 'You matched') {
    return [
      subject
        ? 'This feels like a good place to pick things back up.'
        : 'This feels like the right moment to pick things back up.',
      momentLooksLikeQuestion(subject)
        ? 'I liked this. Want to continue from what you asked?'
        : 'I liked this. Want to continue where we paused?',
    ];
  }
  if (relationshipCue === 'Liked you') {
    return [
      contentAwarePrompts[0],
      subject ? 'This stood out to me in a good way.' : contentAwarePrompts[1],
    ];
  }
  if (relationshipCue === 'You liked each other') {
    return [
      'This makes me want to finally say hello properly.',
      moment?.type === 'photo' || moment?.type === 'video'
        ? 'I liked this. What is the story behind it?'
        : contentAwarePrompts[0],
    ];
  }
  return contentAwarePrompts;
};

const getWhyNowText = (relationshipContext: MomentRelationshipContext | null) => {
  const relationshipCue = relationshipContext?.cue ?? null;
  const recency = formatSignalRecency(relationshipContext?.happenedAt);
  if (relationshipCue === 'Door reopened') {
    return recency
      ? `You reopened this connection ${recency}. This moment is a natural place to restart with more clarity.`
      : 'There is already history here. This moment is a natural place to restart with more clarity.';
  }
  if (relationshipCue === 'You matched') {
    return recency
      ? `You chose each other ${recency}. This is a low-pressure reason to pick the thread back up.`
      : 'You already chose each other once. This is a low-pressure reason to pick the thread back up.';
  }
  if (relationshipCue === 'You liked each other') {
    return recency
      ? `The interest was already mutual ${recency}. This moment makes the next move feel more natural.`
      : 'The interest was already mutual. This moment makes the next move feel more natural.';
  }
  if (relationshipCue === 'Liked you') {
    return recency
      ? `They signaled interest ${recency}. A warm response here can turn attention into conversation.`
      : 'They already signaled interest. A warm response here can turn attention into conversation.';
  }
  if (relationshipCue === 'You liked them') {
    return recency
      ? `You noticed them ${recency}. This moment gives you a better opening than a cold hello.`
      : 'You noticed them before. This moment gives you a better opening than a cold hello.';
  }
  if (relationshipCue === 'You reached out') {
    return recency
      ? `You opened the door ${recency}. This is a better moment to follow through with intention.`
      : 'You opened the door earlier. This is a better moment to follow through with intention.';
  }
  if (relationshipCue === 'They reached out') {
    return recency
      ? `They reached out ${recency}. This moment gives you a softer, more human way to answer it.`
      : 'They made a move before. This moment gives you a softer, more human way to answer it.';
  }
  return 'This moment offers a natural opening. Betweener works best when interest turns into thoughtful follow-through.';
};

const getMomentReadText = (
  moment: Moment | undefined,
  relationshipContext: MomentRelationshipContext | null,
) => {
  const relationshipCue = relationshipContext?.cue ?? null;
  const textSnippet = normalizeMomentText(moment?.text_body);
  const captionSnippet = normalizeMomentText(moment?.caption);
  const subject = textSnippet || captionSnippet;
  const isQuestion = subject ? momentLooksLikeQuestion(subject) : false;
  const isReflective = subject ? momentStartsReflective(subject) : false;
  const isVisual = moment?.type === 'photo' || moment?.type === 'video';

  if (relationshipCue === 'Door reopened') {
    if (isQuestion) return 'This feels like a soft reopening with a real question behind it.';
    if (isVisual) return 'This feels like a soft reopening, not a casual drop-in.';
    return 'This feels like a real reopening, not just a random check-in.';
  }
  if (relationshipCue === 'You matched') {
    return isQuestion
      ? 'This reads like an easy invitation to answer and pick things back up.'
      : 'This feels like a natural way to pick things back up.';
  }
  if (relationshipCue === 'You liked each other') {
    return isVisual
      ? 'This feels warmer than a first hello.'
      : 'This reads like mutual interest finding a more human tone.';
  }
  if (relationshipCue === 'Liked you') {
    return isQuestion
      ? 'This reads like something worth answering, not just noticing.'
      : 'This feels more personal than casual.';
  }
  if (relationshipCue === 'You liked them') {
    return 'This gives you a softer opening than leading cold.';
  }
  if (relationshipCue === 'You reached out') {
    return 'This reads like a better follow-through moment than a cold check-in.';
  }
  if (relationshipCue === 'They reached out') {
    return 'This feels easier to answer here than from scratch.';
  }

  if (isQuestion) return 'This reads like an invitation to answer.';
  if (moment?.type === 'text' && isReflective) return 'This feels more personal than casual.';
  if (isVisual && captionSnippet) return 'This feels like a memory with a reason behind it.';
  if (isVisual) return 'This feels like a glimpse into their real life.';
  if (subject) return 'This feels more intentional than random.';
  return 'This feels like the kind of moment that is easier to answer than ignore.';
};

const MomentVideo = ({
  uri,
  shouldPlay,
  onReady,
}: {
  uri: string;
  shouldPlay: boolean;
  onReady?: () => void;
}) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.keepScreenOnWhilePlaying = false;
    if (shouldPlay) {
      try { p.play(); } catch {}
    }
  });

  useEffect(() => {
    if (shouldPlay) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [player, shouldPlay]);

  useEffect(() => {
    if (!onReady) return;
    const timeout = setTimeout(() => {
      onReady();
    }, VIDEO_READY_STABILIZE_MS);
    return () => clearTimeout(timeout);
  }, [onReady, uri]);

  return <VideoView style={styles.media} player={player} contentFit="cover" nativeControls={false} />;
};

type Props = {
  visible: boolean;
  users: MomentUser[];
  startUserId?: string | null;
  startMomentId?: string | null;
  startWithCommentsOpen?: boolean;
  startEntrySource?: 'comment' | 'reaction' | null;
  startHighlightedCommentId?: string | null;
  startHighlightedReactionEmoji?: string | null;
  relationshipContextByProfileId?: Record<string, MomentRelationshipContext>;
  preferredMediaUrlsByMomentId?: Record<string, string>;
  onPressIntent?: (user: MomentUser) => void;
  onMomentViewed?: (momentId: string) => void;
  onCommentCountChange?: (momentId: string, count: number) => void;
  onReactionCountChange?: (momentId: string, count: number) => void;
  onClose: () => void;
};

const formatTimeLeft = (expiresAt: string) => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  return `${hours}h left`;
};

export default function MomentViewer({
  visible,
  users,
  startUserId,
  startMomentId,
  startWithCommentsOpen = false,
  startEntrySource = null,
  startHighlightedCommentId = null,
  startHighlightedReactionEmoji = null,
  relationshipContextByProfileId,
  preferredMediaUrlsByMomentId = {},
  onPressIntent,
  onMomentViewed,
  onCommentCountChange,
  onReactionCountChange,
  onClose,
}: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const responsive = useResponsiveMetrics();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTriggeredRef = useRef(false);
  const progressValueRef = useRef(0);
  const progressDurationRef = useRef(TEXT_MOMENT_DURATION);
  const progressMomentIdRef = useRef<string | null>(null);
  const [activeUserIndex, setActiveUserIndex] = useState(0);
  const [activeMomentIndex, setActiveMomentIndex] = useState(0);
  const initializedRef = useRef(false);
  const usersRef = useRef(users);
  const activeUserIndexRef = useRef(activeUserIndex);
  const activeMomentIndexRef = useRef(activeMomentIndex);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [commentCount, setCommentCount] = useState(0);
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [hasConversationHistory, setHasConversationHistory] = useState<boolean | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [pressPaused, setPressPaused] = useState(false);
  const [entryHintVisible, setEntryHintVisible] = useState(false);
  const [highlightedReactionEmoji, setHighlightedReactionEmoji] = useState<string | null>(null);
  const [mediaAspectRatios, setMediaAspectRatios] = useState<Record<string, number>>({});
  const [isCurrentMomentReady, setIsCurrentMomentReady] = useState(false);
  const pendingInitialCommentsOpenRef = useRef(false);
  const pendingEntryHintSourceRef = useRef<'comment' | 'reaction' | null>(null);
  const pendingHighlightedReactionEmojiRef = useRef<string | null>(null);
  const viewedMomentIdsRef = useRef<Set<string>>(new Set());
  const reactorsProfilesCacheRef = useRef<Record<string, { id: string | null; full_name: string | null; avatar_url: string | null }>>({});
  const commentCountRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionCountRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaReadyMomentIdRef = useRef<string | null>(null);

  const currentUser = users[activeUserIndex];
  const currentMoment = currentUser?.moments?.[activeMomentIndex];
  const safeCurrentAvatarUrl = getSafeRemoteImageUri(currentUser?.avatarUrl);
  const currentAvatarFallback = useMemo(
    () => (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarInitial}>{currentUser?.name?.slice(0, 1).toUpperCase() || 'M'}</Text>
      </View>
    ),
    [currentUser?.name, styles.avatarFallback, styles.avatarInitial],
  );
  const relationshipContext =
    !currentUser?.isOwn && currentUser?.profileId
      ? relationshipContextByProfileId?.[String(currentUser.profileId)] ?? null
      : null;
  const relationshipCue = relationshipContext?.cue ?? null;
  const primaryActionUsesIntent = relationshipCue === 'Door reopened' && hasConversationHistory === false && Boolean(onPressIntent);
  const primaryCtaText = useMemo(() => {
    if (!relationshipCue) return 'Say hello';
    if (relationshipCue === 'Door reopened') {
      return primaryActionUsesIntent ? 'Send an Intent' : 'Reopen the door';
    }
    if (relationshipCue === 'You matched') return 'Pick it back up';
    if (relationshipCue === 'You liked each other') return 'Start the spark';
    if (relationshipCue === 'Liked you') return 'Answer the signal';
    if (relationshipCue === 'You reached out') return 'Follow through';
    if (relationshipCue === 'They reached out') return 'Respond with warmth';
    if (relationshipCue === 'You liked them') return 'Say hello again';
    return 'Say hello again';
  }, [primaryActionUsesIntent, relationshipCue]);
  const secondaryCtaText = useMemo(() => {
    if (relationshipCue === 'Door reopened') return 'Reply with intention';
    if (relationshipCue === 'You matched') return 'Lead with intention';
    return 'Reply with intent';
  }, [relationshipCue]);
  const momentReadText = useMemo(
    () => getMomentReadText(currentMoment, relationshipContext),
    [currentMoment, relationshipContext],
  );
  const whyNowText = useMemo(() => getWhyNowText(relationshipContext), [relationshipContext]);
  const guidedReplyPrompts = useMemo(
    () => getMomentReplyPrompts(currentMoment, relationshipCue).slice(0, 2),
    [currentMoment, relationshipCue],
  );
  const entryHintText = useMemo(() => {
    if (startEntrySource === 'comment') return 'Opened from a comment';
    if (startEntrySource === 'reaction') return 'Someone reacted here';
    return null;
  }, [startEntrySource]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const ensureSignedUrls = useCallback(async (moments: Moment[]) => {
    const missing = moments.filter(
      (m) =>
        m.media_url &&
        !m.media_url.startsWith('http') &&
        !signedUrls[m.id] &&
        !preferredMediaUrlsByMomentId[m.id],
    );
    if (missing.length === 0) return;
    const resolved: Record<string, string> = {};
    await Promise.all(
      missing.map(async (m) => {
        const url = await createSignedUrl(m.media_url || '', 3600);
        if (url) resolved[m.id] = url;
      }),
    );
    if (Object.keys(resolved).length > 0) {
      setSignedUrls((prev) => ({ ...prev, ...resolved }));
    }
  }, [preferredMediaUrlsByMomentId, signedUrls]);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !user?.id || !currentUser?.userId || currentUser.isOwn) {
      setHasConversationHistory(null);
      return;
    }

    (async () => {
      const result = await fetchMomentConversationState({
        currentUserId: user.id,
        peerUserId: currentUser.userId,
      });
      if (!cancelled) {
        setHasConversationHistory(result.hasConversation);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.isOwn, currentUser?.userId, user?.id, visible]);

  const fetchReactions = useCallback(async (momentId: string) => {
    if (!momentId) return;
    const counts: Record<string, number> = {};
    let mine: string | null = null;
    const cachedReactors = user?.id ? await readMomentReactorsSnapshot(user.id, momentId) : null;
    if (cachedReactors?.reactions?.length) {
      cachedReactors.reactions.forEach((row) => {
        counts[row.emoji] = (counts[row.emoji] || 0) + 1;
        if (row.user_id === user?.id) mine = row.emoji;
      });
    }

    const { data, error } = await supabase
      .from('moment_reactions')
      .select('id,emoji,user_id,created_at')
      .eq('moment_id', momentId);
    if (!error && data) {
      Object.keys(counts).forEach((key) => delete counts[key]);
      mine = null;
      data.forEach((row: any) => {
        counts[row.emoji] = (counts[row.emoji] || 0) + 1;
        if (row.user_id === user?.id) mine = row.emoji;
      });
      if (user?.id) {
        const userIds = Array.from(new Set(data.map((row: any) => row.user_id))).filter(Boolean);
        const profilesByUserId: Record<string, { id: string | null; full_name: string | null; avatar_url: string | null }> = {};
        const missingUserIds = userIds.filter((userId) => !hasUsableViewerProfileSnapshot(reactorsProfilesCacheRef.current[userId]));
        userIds.forEach((userId) => {
          const cachedProfile = reactorsProfilesCacheRef.current[userId];
          if (hasUsableViewerProfileSnapshot(cachedProfile)) profilesByUserId[userId] = cachedProfile;
        });
        if (missingUserIds.length > 0) {
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id,user_id,full_name,avatar_url,photos')
            .in('user_id', missingUserIds);
          (profileRows || []).forEach((profileRow: any) => {
            if (!profileRow?.user_id) return;
            const normalizedProfile = {
              id: profileRow.id ?? null,
              full_name: profileRow.full_name ?? null,
              avatar_url: resolveMomentProfileAvatar(profileRow),
              photos: Array.isArray(profileRow.photos) ? profileRow.photos : null,
            };
            profilesByUserId[profileRow.user_id] = normalizedProfile;
            reactorsProfilesCacheRef.current[profileRow.user_id] = normalizedProfile;
          });
        }
        await writeMomentReactorsSnapshot(user.id, momentId, {
          reactions: data as { id: string; emoji: string; user_id: string; created_at: string }[],
          profilesByUserId,
        });
      }
    }
    const offlineSnapshot = await getMomentOfflineMutationSnapshot();
    [...offlineSnapshot.failed, ...offlineSnapshot.pending].forEach((mutation) => {
      if (mutation.kind !== 'moment_reaction_sync' || mutation.payload.momentId !== momentId || mutation.payload.userId !== user?.id) {
        return;
      }
      const previousEmoji = mutation.payload.previousEmoji ?? mine ?? null;
      const nextEmoji = mutation.payload.emoji ?? null;
      if (previousEmoji && previousEmoji !== nextEmoji) {
        counts[previousEmoji] = Math.max(0, (counts[previousEmoji] || 0) - 1);
      }
      if (nextEmoji) {
        counts[nextEmoji] = (counts[nextEmoji] || 0) + (previousEmoji === nextEmoji ? 0 : 1);
      }
      mine = nextEmoji;
    });
    setReactionCounts(counts);
    setUserReaction(mine);
    onReactionCountChange?.(
      momentId,
      Object.values(counts).reduce((sum, value) => sum + value, 0),
    );
  }, [onReactionCountChange, user?.id]);

  const fetchCommentCount = useCallback(async (momentId: string) => {
    if (!momentId) return;
    let nextCount = 0;
    const cachedComments = user?.id ? await readMomentCommentsSnapshot(user.id, momentId) : null;
    if (cachedComments?.comments?.length) {
      nextCount = cachedComments.comments.length;
    }
    const { count, error } = await supabase
      .from('moment_comments')
      .select('id', { count: 'exact', head: true })
      .eq('moment_id', momentId)
      .eq('is_deleted', false);
    if (!error) {
      nextCount = count ?? 0;
    }
    const offlineSnapshot = await getMomentOfflineMutationSnapshot();
    [...offlineSnapshot.failed, ...offlineSnapshot.pending].forEach((mutation) => {
      if (mutation.kind === 'moment_comment_create' && mutation.payload.momentId === momentId) {
        nextCount += 1;
        return;
      }
      if (mutation.kind === 'moment_comment_delete' && mutation.payload.momentId === momentId) {
        nextCount = Math.max(0, nextCount - 1);
      }
    });
    setCommentCount(nextCount);
    onCommentCountChange?.(momentId, nextCount);
  }, [onCommentCountChange, user?.id]);

  const handleNext = useCallback(() => {
    const usersList = usersRef.current;
    const userIndex = activeUserIndexRef.current;
    const momentIndex = activeMomentIndexRef.current;
    const userEntry = usersList[userIndex];
    if (!userEntry) {
      onClose();
      return;
    }
    if (momentIndex < userEntry.moments.length - 1) {
      setActiveMomentIndex(momentIndex + 1);
      return;
    }
    if (userIndex < usersList.length - 1) {
      setActiveUserIndex(userIndex + 1);
      setActiveMomentIndex(0);
      return;
    }
    onClose();
  }, [onClose]);

  const handlePrev = useCallback(() => {
    const usersList = usersRef.current;
    const userIndex = activeUserIndexRef.current;
    const momentIndex = activeMomentIndexRef.current;
    const userEntry = usersList[userIndex];
    if (!userEntry) {
      onClose();
      return;
    }
    if (momentIndex > 0) {
      setActiveMomentIndex(momentIndex - 1);
      return;
    }
    if (userIndex > 0) {
      const prevUser = usersList[userIndex - 1];
      setActiveUserIndex(userIndex - 1);
      setActiveMomentIndex(prevUser ? Math.max(0, prevUser.moments.length - 1) : 0);
      return;
    }
    onClose();
  }, [onClose]);

  const clearHoldTimeout = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  const startProgress = useCallback((duration: number) => {
    progressDurationRef.current = duration;
    progressValueRef.current = 0;
    progressMomentIdRef.current = currentMoment?.id ?? null;
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !commentsVisible) {
        handleNext();
      }
    });
  }, [commentsVisible, currentMoment?.id, handleNext, progressAnim]);

  const markCurrentMomentReady = useCallback((momentId?: string | null) => {
    if (!momentId) return;
    if (mediaReadyMomentIdRef.current === momentId) return;
    mediaReadyMomentIdRef.current = momentId;
    setIsCurrentMomentReady(true);
  }, []);

  const pauseProgress = useCallback(() => {
    holdTriggeredRef.current = true;
    setPressPaused(true);
    progressAnim.stopAnimation((value) => {
      progressValueRef.current = value;
    });
  }, [progressAnim]);

  const resumeProgress = useCallback(() => {
    if (!progressMomentIdRef.current) return;
    const remaining = Math.max(0, Math.round(progressDurationRef.current * (1 - progressValueRef.current)));
    if (remaining <= 0) {
      setPressPaused(false);
      handleNext();
      return;
    }
    setPressPaused(false);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !commentsVisible) {
        handleNext();
      }
    });
  }, [commentsVisible, handleNext, progressAnim]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dy) < 30,
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dy) < 30,
      onPanResponderGrant: () => {
        holdTriggeredRef.current = false;
        clearHoldTimeout();
        if (commentsVisible) return;
        holdTimeoutRef.current = setTimeout(() => {
          pauseProgress();
        }, 180);
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 12 || Math.abs(gesture.dy) > 12) {
          clearHoldTimeout();
          if (holdTriggeredRef.current) {
            resumeProgress();
            holdTriggeredRef.current = false;
          }
        }
      },
      onPanResponderRelease: (evt, gesture) => {
        clearHoldTimeout();
        const consumedByHold = holdTriggeredRef.current && Math.abs(gesture.dx) < 30 && Math.abs(gesture.dy) < 30;
        if (holdTriggeredRef.current) {
          resumeProgress();
          holdTriggeredRef.current = false;
        }
        if (consumedByHold) {
          return;
        }
        if (gesture.dx < -30) {
          handleNext();
          return;
        }
        if (gesture.dx > 30) {
          handlePrev();
          return;
        }
        if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
          const x = evt.nativeEvent.locationX;
          if (x <= responsive.width * 0.45) {
            handlePrev();
          } else if (x >= responsive.width * 0.55) {
            handleNext();
          }
        }
      },
      onPanResponderTerminate: () => {
        clearHoldTimeout();
        if (holdTriggeredRef.current) {
          resumeProgress();
          holdTriggeredRef.current = false;
        }
      },
    }),
    [clearHoldTimeout, commentsVisible, handleNext, handlePrev, pauseProgress, responsive.width, resumeProgress],
  );

  const handleReact = async (emojiValue: string) => {
    if (!currentMoment || !user?.id) return;
    const prevReaction = userReaction;
    try {
      await syncMomentReactionOfflineSafe({
        momentId: currentMoment.id,
        userId: user.id,
        emoji: emojiValue,
        previousEmoji: prevReaction,
      });
    } catch {
      return;
    }
    setUserReaction(emojiValue);
    setReactionCounts((prev) => {
      const next = { ...prev };
      if (prevReaction && prevReaction !== emojiValue) {
        next[prevReaction] = Math.max(0, (next[prevReaction] || 1) - 1);
      }
      next[emojiValue] = (next[emojiValue] || 0) + (prevReaction === emojiValue ? 0 : 1);
      return next;
    });
    await upsertMomentReactorSnapshot(
      user.id,
      currentMoment.id,
      {
        id: `local-reaction:${currentMoment.id}:${user.id}`,
        emoji: emojiValue,
        user_id: user.id,
        created_at: new Date().toISOString(),
      },
      {
        id: currentUser?.profileId ?? null,
        full_name: currentUser?.name ?? 'You',
        avatar_url: safeCurrentAvatarUrl,
      },
    );
  };

  useEffect(() => {
    if (!visible || !currentMoment?.id) return;
    return subscribeToOfflineMutationEvents((event) => {
      if (
        event.mutation.kind === 'moment_reaction_sync' ||
        event.mutation.kind === 'moment_comment_create' ||
        event.mutation.kind === 'moment_comment_delete'
      ) {
        void fetchReactions(currentMoment.id);
        void fetchCommentCount(currentMoment.id);
      }
    });
  }, [currentMoment?.id, fetchCommentCount, fetchReactions, visible]);

  const handleOpenChat = useCallback(() => {
    if (!currentUser || currentUser.isOwn || !currentUser.userId) return;
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: String(currentUser.userId),
        userName: currentUser.name,
        userAvatar: currentUser.avatarUrl ?? '',
      },
    });
  }, [currentUser, router]);

  const handleGuidedReply = useCallback((prefill: string) => {
    if (!currentUser || currentUser.isOwn || !currentUser.userId) return;
    onClose();
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: String(currentUser.userId),
        userName: currentUser.name,
        userAvatar: currentUser.avatarUrl ?? '',
        prefill,
      },
    });
  }, [currentUser, onClose, router]);

  const handleOpenIntent = useCallback(() => {
    if (!currentUser || currentUser.isOwn || !onPressIntent) return;
    onPressIntent(currentUser);
  }, [currentUser, onPressIntent]);

  const handlePrimaryAction = useCallback(() => {
    if (primaryActionUsesIntent) {
      handleOpenIntent();
      return;
    }
    handleOpenChat();
  }, [handleOpenChat, handleOpenIntent, primaryActionUsesIntent]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    activeUserIndexRef.current = activeUserIndex;
  }, [activeUserIndex]);

  useEffect(() => {
    activeMomentIndexRef.current = activeMomentIndex;
  }, [activeMomentIndex]);

  useEffect(() => {
    if (!visible) {
      initializedRef.current = false;
      pendingInitialCommentsOpenRef.current = false;
      pendingEntryHintSourceRef.current = null;
      pendingHighlightedReactionEmojiRef.current = null;
      viewedMomentIdsRef.current = new Set();
      setEntryHintVisible(false);
      setHighlightedReactionEmoji(null);
      return;
    }
    if (initializedRef.current) return;
    if (users.length === 0) return;
    initializedRef.current = true;
    const idx = startUserId ? users.findIndex((u) => u.userId === startUserId) : 0;
    const safeUserIndex = idx >= 0 ? idx : 0;
    const targetUser = users[safeUserIndex];
    let momentIndex = 0;
    if (startMomentId && targetUser?.moments?.length) {
      const foundIndex = targetUser.moments.findIndex((m) => m.id === startMomentId);
      if (foundIndex >= 0) momentIndex = foundIndex;
    }
    setActiveUserIndex(safeUserIndex);
    setActiveMomentIndex(momentIndex);
    setReactionCounts({});
    setUserReaction(null);
    pendingInitialCommentsOpenRef.current = startWithCommentsOpen;
    pendingEntryHintSourceRef.current = startEntrySource;
    pendingHighlightedReactionEmojiRef.current = startHighlightedReactionEmoji;
  }, [startEntrySource, startHighlightedReactionEmoji, startMomentId, startUserId, startWithCommentsOpen, users, visible]);

  useEffect(() => {
    if (visible && users.length === 0) {
      onClose();
    }
  }, [onClose, users.length, visible]);

  useEffect(() => {
    if (!visible || users.length === 0) return;
    const userEntry = users[activeUserIndex];
    if (!userEntry || userEntry.moments.length === 0) {
      const nextUserIndex = users.findIndex((u, idx) => idx >= activeUserIndex && u.moments.length > 0);
      if (nextUserIndex >= 0) {
        setActiveUserIndex(nextUserIndex);
        setActiveMomentIndex(0);
        return;
      }
      onClose();
      return;
    }
    if (activeMomentIndex >= userEntry.moments.length) {
      setActiveMomentIndex(Math.max(0, userEntry.moments.length - 1));
    }
  }, [activeMomentIndex, activeUserIndex, onClose, users, visible]);

  useEffect(() => {
    if (!visible) {
      setCommentsVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    setCommentsVisible(false);
  }, [currentMoment?.id]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    if (!pendingInitialCommentsOpenRef.current) return;
    pendingInitialCommentsOpenRef.current = false;
    setCommentsVisible(true);
  }, [currentMoment, visible]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    if (!pendingEntryHintSourceRef.current || !entryHintText) return;
    pendingEntryHintSourceRef.current = null;
    setEntryHintVisible(true);
    const timeout = setTimeout(() => setEntryHintVisible(false), 1800);
    return () => clearTimeout(timeout);
  }, [currentMoment, entryHintText, visible]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    const emojiValue = pendingHighlightedReactionEmojiRef.current;
    if (!emojiValue) return;
    pendingHighlightedReactionEmojiRef.current = null;
    setHighlightedReactionEmoji(emojiValue);
    const timeout = setTimeout(() => setHighlightedReactionEmoji((prev) => (prev === emojiValue ? null : prev)), 2200);
    return () => clearTimeout(timeout);
  }, [currentMoment, visible]);

  useEffect(() => {
    if (!visible || !currentUser) return;
    void ensureSignedUrls(currentUser.moments);
  }, [visible, currentUser, ensureSignedUrls]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    void fetchReactions(currentMoment.id);
  }, [currentMoment, fetchReactions, visible]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    void fetchCommentCount(currentMoment.id);
  }, [currentMoment, fetchCommentCount, visible]);

  useEffect(() => {
    if (!visible || !currentMoment?.id || currentUser?.isOwn) return;
    if (viewedMomentIdsRef.current.has(currentMoment.id)) return;

    viewedMomentIdsRef.current.add(currentMoment.id);
    onMomentViewed?.(currentMoment.id);
    void markMomentViewed(currentMoment.id);
  }, [currentMoment?.id, currentUser?.isOwn, onMomentViewed, visible]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    const channel = supabase
      .channel(`moment-comments-count-${currentMoment.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moment_comments', filter: `moment_id=eq.${currentMoment.id}` },
        () => {
          if (commentCountRefreshTimeoutRef.current) clearTimeout(commentCountRefreshTimeoutRef.current);
          commentCountRefreshTimeoutRef.current = setTimeout(() => {
            commentCountRefreshTimeoutRef.current = null;
            void fetchCommentCount(currentMoment.id);
          }, 220);
        },
      )
      .subscribe();
    return () => {
      if (commentCountRefreshTimeoutRef.current) clearTimeout(commentCountRefreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [currentMoment, fetchCommentCount, visible]);

  useEffect(() => {
    if (!visible || !currentMoment) return;
    const channel = supabase
      .channel(`moment-reactions-count-${currentMoment.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moment_reactions', filter: `moment_id=eq.${currentMoment.id}` },
        () => {
          if (reactionCountRefreshTimeoutRef.current) clearTimeout(reactionCountRefreshTimeoutRef.current);
          reactionCountRefreshTimeoutRef.current = setTimeout(() => {
            reactionCountRefreshTimeoutRef.current = null;
            void fetchReactions(currentMoment.id);
          }, 220);
        },
      )
      .subscribe();
    return () => {
      if (reactionCountRefreshTimeoutRef.current) clearTimeout(reactionCountRefreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [currentMoment, fetchReactions, visible]);

  useEffect(() => {
    if (!visible || !currentMoment || commentsVisible) return;
    if (!isCurrentMomentReady) return;
    const duration =
      currentMoment.type === 'video'
        ? VIDEO_MOMENT_DURATION
        : currentMoment.type === 'text'
          ? TEXT_MOMENT_DURATION
          : PHOTO_MOMENT_DURATION;
    if (progressMomentIdRef.current !== currentMoment.id) {
      startProgress(duration);
      return;
    }
    if (progressValueRef.current > 0 && progressValueRef.current < 1) {
      resumeProgress();
      return;
    }
    startProgress(duration);
  }, [commentsVisible, currentMoment, isCurrentMomentReady, resumeProgress, startProgress, visible]);

  useEffect(() => {
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    progressValueRef.current = 0;
    progressMomentIdRef.current = null;
    mediaReadyMomentIdRef.current = null;

    if (!visible || !currentMoment) {
      setIsCurrentMomentReady(false);
      return;
    }

    if (currentMoment.type === 'text') {
      markCurrentMomentReady(currentMoment.id);
      return;
    }

    setIsCurrentMomentReady(false);
    const timeout = setTimeout(
      () => markCurrentMomentReady(currentMoment.id),
      currentMoment.type === 'video' ? VIDEO_READY_STABILIZE_MS + 350 : PHOTO_READY_FAILSAFE_MS,
    );
    return () => clearTimeout(timeout);
  }, [currentMoment?.id, currentMoment?.type, markCurrentMomentReady, progressAnim, visible]);

  useEffect(() => {
    if (commentsVisible || pressPaused) {
      progressAnim.stopAnimation();
    }
  }, [commentsVisible, pressPaused, progressAnim]);

  useEffect(() => {
    const listenerId = progressAnim.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => {
      progressAnim.removeListener(listenerId);
    };
  }, [progressAnim]);

  useEffect(() => () => {
    clearHoldTimeout();
  }, [clearHoldTimeout]);

  const mediaUrl = useMemo(() => {
    if (!currentMoment?.media_url) return null;
    if (currentMoment.media_url.startsWith('http')) return currentMoment.media_url;
    return preferredMediaUrlsByMomentId[currentMoment.id] || signedUrls[currentMoment.id] || null;
  }, [currentMoment, preferredMediaUrlsByMomentId, signedUrls]);

  const safeMediaUrl = useMemo(() => getSafeRemoteImageUri(mediaUrl), [mediaUrl]);
  const currentMediaAspectRatio = currentMoment ? mediaAspectRatios[currentMoment.id] ?? null : null;
  const isWidePhotoMoment =
    currentMoment?.type === 'photo' &&
    typeof currentMediaAspectRatio === 'number' &&
    currentMediaAspectRatio > 1.15;
  const wideFrameMetrics = useMemo(() => {
    if (!isWidePhotoMoment || !currentMediaAspectRatio) return null;
    const frameWidth = Math.min(responsive.usableWidth - 14, 620);
    const rawHeight = frameWidth / currentMediaAspectRatio;
    const frameHeight = Math.max(210, Math.min(rawHeight, responsive.usableHeight * 0.48));
    const offsetY = Math.max(-22, -Math.round(responsive.usableHeight * 0.065));
    return {
      width: frameWidth,
      height: frameHeight,
      offsetY,
    };
  }, [currentMediaAspectRatio, isWidePhotoMoment, responsive.usableHeight, responsive.usableWidth]);

  useEffect(() => {
    if (!currentMoment || currentMoment.type !== 'photo' || !safeMediaUrl) return;
    if (mediaAspectRatios[currentMoment.id]) return;
    let cancelled = false;
    RNImage.getSize(
      safeMediaUrl,
      (width, height) => {
        if (cancelled || !width || !height) return;
        setMediaAspectRatios((prev) => {
          if (prev[currentMoment.id]) return prev;
          return { ...prev, [currentMoment.id]: width / height };
        });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [currentMoment, mediaAspectRatios, safeMediaUrl]);

  if (!visible || !currentUser || !currentMoment) {
    return null;
  }

  const isWideMoment = Boolean(isWidePhotoMoment && wideFrameMetrics);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        <LinearGradient
          colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.12)', 'transparent']}
          style={styles.topGradient}
          pointerEvents="none"
        />
        <View style={styles.progressRow}>
          {currentUser.moments.map((m, idx) => (
            <View key={m.id} style={styles.progressTrack}>
              {idx < activeMomentIndex ? <View style={styles.progressFill} /> : null}
              {idx === activeMomentIndex ? (
                <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
              ) : null}
            </View>
          ))}
        </View>
        {entryHintVisible && entryHintText ? (
          <View style={styles.entryHintWrap} pointerEvents="none">
            <View style={styles.entryHintChip}>
              <MaterialCommunityIcons
                name={startEntrySource === 'comment' ? 'comment-processing-outline' : 'heart-outline'}
                size={13}
                color="#8ed7d2"
              />
              <Text style={styles.entryHintText}>{entryHintText}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.header}>
          <View style={styles.userInfo}>
            <OfflineImage
              uri={safeCurrentAvatarUrl}
              style={styles.avatar}
              contentFit="cover"
              fallback={currentAvatarFallback}
            />
            <View>
              <Text style={styles.userName}>{currentUser.name}</Text>
              <Text style={styles.timeLeft}>{formatTimeLeft(currentMoment.expires_at)}</Text>
              {relationshipCue ? <Text style={styles.relationshipCue}>{relationshipCue}</Text> : null}
              {!relationshipCue && currentUser.locationInsight ? (
                <Text style={styles.locationCue}>{currentUser.locationInsight}</Text>
              ) : null}
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={18} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.mediaWrapper}>
          {currentMoment.type === 'text' ? (
            <TextMomentCard
              body={currentMoment.text_body || ''}
              caption={currentMoment.caption}
              metadata={currentMoment.metadata}
              variant="viewer"
              style={styles.textMomentCard}
            />
          ) : currentMoment.type === 'photo' ? (
            safeMediaUrl ? (
              isWidePhotoMoment ? (
                <View style={styles.mediaStage}>
                  <Image
                    source={{ uri: safeMediaUrl }}
                    style={styles.mediaBackdrop}
                    contentFit="cover"
                    blurRadius={24}
                  />
                  <LinearGradient
                    colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.34)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.mediaBackdropShade}
                  />
                  <View
                    style={[
                      styles.wideMediaFrameWrap,
                      wideFrameMetrics
                        ? {
                            width: wideFrameMetrics.width,
                            transform: [{ translateY: wideFrameMetrics.offsetY }],
                          }
                        : null,
                    ]}
                  >
                    <View
                      style={[
                        styles.wideMediaFrame,
                        wideFrameMetrics
                          ? {
                              width: wideFrameMetrics.width,
                              height: wideFrameMetrics.height,
                            }
                          : null,
                      ]}
                    >
                      <Image
                        source={{ uri: safeMediaUrl }}
                        style={styles.wideMediaAsset}
                        contentFit="contain"
                        onLoad={() => markCurrentMomentReady(currentMoment.id)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <Image
                  source={{ uri: safeMediaUrl }}
                  style={styles.media}
                  contentFit="cover"
                  onLoad={() => markCurrentMomentReady(currentMoment.id)}
                />
              )
            ) : (
              <View style={styles.mediaFallback} />
            )
          ) : mediaUrl ? (
            <MomentVideo
              uri={mediaUrl}
              shouldPlay={!commentsVisible && !pressPaused}
              onReady={() => markCurrentMomentReady(currentMoment.id)}
            />
          ) : (
            <View style={styles.mediaFallback} />
          )}
          {currentMoment.caption && currentMoment.type !== 'text' ? (
            <View
              style={[
                styles.captionBubble,
                isWideMoment ? styles.captionBubbleWide : null,
                isWideMoment
                  ? { bottom: Math.max(92, responsive.bottomNavReserve + 18) }
                  : null,
              ]}
            >
              <Text style={styles.captionText}>{currentMoment.caption}</Text>
            </View>
          ) : null}
          <View style={styles.gestureLayer} pointerEvents="box-only" {...panResponder.panHandlers} />
        </View>

        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.bottomGradient} pointerEvents="none" />

        {!currentUser.isOwn ? (
          <View style={[styles.replyStack, isWideMoment ? styles.replyStackWide : null]}>
            <View style={styles.momentReadCard}>
              <View style={styles.momentReadHeader}>
                <MaterialCommunityIcons name="star-four-points" size={13} color="#8ed7d2" />
                <Text style={styles.momentReadEyebrow}>What This Feels Like</Text>
              </View>
              <Text style={styles.momentReadText}>{momentReadText}</Text>
            </View>
            <View style={styles.whyNowCard}>
              <View style={styles.whyNowHeader}>
                <MaterialCommunityIcons name="star-four-points" size={14} color="#8ed7d2" />
                <Text style={styles.whyNowEyebrow}>Why This Matters Now</Text>
              </View>
              <Text style={styles.whyNowText}>{whyNowText}</Text>
            </View>
            <View style={styles.replyPromptRow}>
              {guidedReplyPrompts.map((prompt) => (
                <Pressable key={prompt} style={styles.replyPromptChip} onPress={() => handleGuidedReply(prompt)}>
                  <Text style={styles.replyPromptText} numberOfLines={2}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.replyRow}>
              <Pressable style={styles.replyPrimaryButton} onPress={handlePrimaryAction}>
                <MaterialCommunityIcons
                  name={primaryActionUsesIntent ? 'star-four-points' : 'chat-processing-outline'}
                  size={16}
                  color="#081313"
                />
                <Text style={styles.replyPrimaryText}>{primaryCtaText}</Text>
              </Pressable>
              {onPressIntent ? (
                <Pressable style={styles.replySecondaryButton} onPress={handleOpenIntent}>
                  <MaterialCommunityIcons name="star-four-points" size={15} color="#fff" />
                  <Text style={styles.replySecondaryText}>{secondaryCtaText}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={[styles.actions, isWideMoment ? styles.actionsWide : null]}>
          <LinearGradient
            colors={['rgba(15,26,26,0.36)', 'rgba(15,26,26,0.22)']}
            style={styles.actionsRail}
          >
            <View style={styles.reactionColumn}>
              {REACTIONS.map((emojiValue) => {
                const isActive = userReaction === emojiValue;
                const count = reactionCounts[emojiValue] || 0;
                return (
                  <Pressable
                    key={emojiValue}
                    onPress={() => handleReact(emojiValue)}
                    style={[
                      styles.reactionButton,
                      isActive && styles.reactionActive,
                      highlightedReactionEmoji === emojiValue && styles.reactionSpotlight,
                    ]}
                  >
                    <Text style={styles.reactionEmoji}>{emojiValue}</Text>
                    {count > 0 ? <Text style={styles.reactionCount}>{count}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.actionsDivider} />
            <Pressable style={styles.commentButton} onPress={() => setCommentsVisible(true)}>
              <MaterialCommunityIcons name="comment-outline" size={17} color="#fff" />
              {commentCount > 0 ? <Text style={styles.commentCount}>{commentCount}</Text> : null}
            </Pressable>
          </LinearGradient>
        </View>
      </View>

      <MomentCommentsModal
        visible={commentsVisible}
        momentId={currentMoment.id}
        highlightCommentId={commentsVisible ? startHighlightedCommentId : null}
        relationshipCue={relationshipCue}
        onCommentCountChange={(count) => onCommentCountChange?.(currentMoment.id, count)}
        onClose={() => setCommentsVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topGradient: { position: 'absolute', left: 0, right: 0, top: 0, height: 164, zIndex: 5 },
  progressRow: { position: 'absolute', top: 44, left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 10 },
  progressTrack: { flex: 1, height: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  progressFill: { height: 2, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 999 },
  entryHintWrap: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  entryHintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15,26,26,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.22)',
  },
  entryHintText: {
    color: '#e8f0ed',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
  },
  header: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(15,26,26,0.82)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontFamily: 'Archivo_700Bold' },
  userName: { color: '#fff', fontFamily: 'Archivo_700Bold', fontSize: 13.5 },
  timeLeft: { color: 'rgba(255,255,255,0.78)', fontFamily: 'Manrope_500Medium', fontSize: 10.5, marginTop: 1 },
  relationshipCue: {
    color: '#8ed7d2',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
    marginTop: 2,
  },
  locationCue: {
    color: 'rgba(232,240,237,0.78)',
    fontFamily: 'Manrope_500Medium',
    fontSize: 10.5,
    marginTop: 2,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,160,160,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  media: { width: '100%', height: '100%' },
  mediaStage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  mediaBackdrop: {
    ...StyleSheet.absoluteFill,
    opacity: 0.3,
  },
  mediaBackdropShade: {
    ...StyleSheet.absoluteFill,
  },
  wideMediaFrameWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  wideMediaFrame: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(7,11,15,0.3)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  wideMediaAsset: {
    width: '100%',
    height: '100%',
  },
  mediaFallback: { width: '100%', height: '100%', backgroundColor: '#0f1a1a' },
  textMomentCard: {
    width: '84%',
    maxWidth: 560,
  },
  captionBubble: {
    position: 'absolute',
    bottom: 120,
    left: 18,
    right: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(15,26,26,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.18)',
  },
  captionBubbleWide: {
    left: 18,
    right: 92,
    backgroundColor: 'rgba(10,18,18,0.78)',
    borderColor: 'rgba(91,193,187,0.22)',
  },
  captionText: { color: '#fff', fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 18 },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  replyStack: {
    position: 'absolute',
    left: 16,
    right: 84,
    bottom: 26,
    gap: 10,
  },
  replyStackWide: {
    right: 96,
    bottom: 18,
  },
  momentReadCard: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(10,19,19,0.64)',
    borderWidth: 1,
    borderColor: 'rgba(142,215,210,0.18)',
  },
  momentReadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  momentReadEyebrow: {
    color: '#8ed7d2',
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  momentReadText: {
    color: '#f3f7f5',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  whyNowCard: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(15,26,26,0.64)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.18)',
  },
  whyNowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  whyNowEyebrow: {
    color: '#8ed7d2',
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  whyNowText: {
    color: '#e8f0ed',
    fontFamily: 'Manrope_500Medium',
    fontSize: 11.5,
    lineHeight: 16,
  },
  replyPromptRow: {
    flexDirection: 'row',
    gap: 10,
  },
  replyPromptChip: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(15,26,26,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.18)',
    justifyContent: 'center',
  },
  replyPromptText: {
    color: '#e8f0ed',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11.5,
    lineHeight: 15,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  replyPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: '#5bc1bb',
  },
  replyPrimaryText: {
    color: '#081313',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12.5,
  },
  replySecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(15,26,26,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.22)',
  },
  replySecondaryText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12.5,
  },
  actions: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: [{ translateY: -46 }],
    alignItems: 'center',
  },
  actionsWide: {
    right: 10,
  },
  actionsRail: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.2)',
  },
  reactionColumn: { gap: 8, alignItems: 'center' },
  actionsDivider: {
    width: 20,
    height: 1,
    marginVertical: 8,
    backgroundColor: 'rgba(91,193,187,0.22)',
  },
  reactionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,26,26,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.18)',
  },
  reactionActive: { backgroundColor: 'rgba(0,160,160,0.24)', borderColor: 'rgba(91,193,187,0.28)' },
  reactionSpotlight: {
    backgroundColor: 'rgba(91,193,187,0.18)',
    borderColor: 'rgba(142,215,210,0.46)',
    shadowColor: '#8ed7d2',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { color: '#fff', fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  commentButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,26,26,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(91,193,187,0.18)',
    alignSelf: 'center',
  },
  commentCount: { color: '#fff', fontSize: 9, fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
  gestureLayer: {
    ...StyleSheet.absoluteFill,
  },
});
