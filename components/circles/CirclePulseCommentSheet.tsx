import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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
import CirclePulseCommentActionsSheet from '@/components/circles/CirclePulseCommentActionsSheet';
import { useCirclePulseComments } from '@/lib/circles/pulse/use-circle-pulse-comments';
import { useCirclePulseLiveDiscussion } from '@/lib/circles/pulse/use-circle-pulse-live-discussion';
import type {
  CirclePulseComment,
  CirclePulseCommentReaction,
  CirclePulseItem,
} from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';
import { logger } from '@/lib/telemetry/logger';

type Props = {
  visible: boolean;
  item: CirclePulseItem | null;
  actorProfileId: string | null;
  actorDisplayName?: string | null;
  targetCommentId?: string | null;
  targetParentCommentId?: string | null;
  onClose: () => void;
  onOpenProfile?: (profileId: string) => void;
  onCommentsChanged?: (count: number) => void;
};

const REACTION_EMOJI: Record<CirclePulseCommentReaction, string> = {
  heart: '\u2764\uFE0F',
  laugh: '\u{1F602}',
  love: '\u{1F60D}',
  thumbs_up: '\u{1F44D}',
  fire: '\u{1F525}',
  clap: '\u{1F44F}',
};

const getFirstName = (value?: string | null) => String(value ?? '').trim().split(/\s+/)[0] || 'member';

const getSheetCopy = (item: CirclePulseItem | null, isViewingOwnWelcomeProfile: boolean) => {
  if (item?.type === 'prompt') return ['Circle Prompt', 'Share your answer with the Circle.'];
  if (item?.type === 'gathering') {
    if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'welcome') {
      return ['Welcome Gathering', `Say hello and help ${getFirstName(item.featuredProfileName)} feel at home.`];
    }
    if (item.gatheringPresentationMode === 'seat_linked' && item.gatheringSeatContext === 'love') {
      return ['Love Seat Gathering', 'Keep the conversation thoughtful and intentional.'];
    }
    return ['Gathering Discussion', 'Ask questions and connect before attending.'];
  }
  if (item?.type === 'media') return ['Circle Media', 'Keep it warm, respectful, and intentional.'];
  if (item?.type === 'welcome') {
    if (isViewingOwnWelcomeProfile) {
      return ['Your Welcome Seat', 'See how the Circle is welcoming you in, and reply in your own voice.'];
    }
    return [`Welcome ${getFirstName(item.welcomeProfiles[0]?.name)}`, `Say something warm to help ${getFirstName(item.welcomeProfiles[0]?.name)} feel at home.`];
  }
  if (item?.type === 'love_seat') {
    const firstName = getFirstName(item.featuredProfileName);
    return [`${firstName}'s Love Seat`, 'Ask something thoughtful or celebrate this member.'];
  }
  return ['Host Note', 'Keep it warm, respectful, and intentional.'];
};

const getEmptyStateCopy = (item: CirclePulseItem | null, isViewingOwnWelcomeProfile: boolean) => {
  if (item?.type === 'welcome') {
    if (isViewingOwnWelcomeProfile) {
      return ['Your Circle is waiting', 'Break the ice and reply to the members welcoming you.'];
    }
    const firstName = getFirstName(item.welcomeProfiles[0]?.name);
    return ['Start the welcome', `Be the first to help ${firstName} feel at home.`];
  }
  if (item?.type === 'love_seat') return ['Start the conversation', 'Keep it thoughtful, warm, and intentional.'];
  return ['Start the discussion', 'Keep it warm, respectful, and intentional.'];
};

const getComposerPlaceholder = (item: CirclePulseItem | null, isViewingOwnWelcomeProfile: boolean) => {
  if (item?.type === 'love_seat' && item.featuredProfileName) {
    return `Ask ${getFirstName(item.featuredProfileName)} something thoughtful...`;
  }
  if (item?.type === 'welcome') {
    if (isViewingOwnWelcomeProfile) return 'Reply warmly to your Circle...';
    return `Welcome ${getFirstName(item.welcomeProfiles[0]?.name)} thoughtfully...`;
  }
  return 'Write something thoughtful...';
};

const formatDay = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatCommentMeta = (comment: CirclePulseComment) => {
  const parts = [formatDay(comment.createdAt)];
  if (comment.editedAt) parts.push('edited');
  return parts.filter(Boolean).join(' · ');
};

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const truncateCopy = (value?: string | null, limit = 92) => {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
};

const getActionErrorDetail = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === 'object') {
    const value = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [
      typeof value.message === 'string' ? value.message.trim() : '',
      typeof value.details === 'string' ? value.details.trim() : '',
      typeof value.hint === 'string' ? value.hint.trim() : '',
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  return '';
};

const getSubmitErrorMessage = (error: unknown, isEditing: boolean) => {
  const detail = getActionErrorDetail(error);
  const normalized = detail.toLowerCase();

  if (normalized.includes('not_authorized')) {
    return isEditing
      ? 'This comment can no longer be edited from this account.'
      : 'This account can no longer post in this discussion.';
  }
  if (normalized.includes('comment_not_found')) {
    return isEditing
      ? 'This comment is no longer available to edit.'
      : 'This discussion note is no longer available.';
  }
  if (normalized.includes('invalid_comment')) {
    return 'Comments must be between 1 and 500 characters.';
  }
  if (normalized.includes('unauthenticated')) {
    return 'Please sign in again and retry.';
  }
  if (normalized.includes('circle_membership_required')) {
    return 'You need to be an active Circle member to join this discussion.';
  }
  if (normalized.includes('offline') || normalized.includes('network')) {
    return isEditing
      ? 'Could not save your edit yet. Your text is still here.'
      : 'Reconnect to comment. Your message is still here.';
  }

  if (detail) {
    return detail.length > 160 ? `${detail.slice(0, 159).trimEnd()}...` : detail;
  }

  return isEditing
    ? 'Could not save your edit yet. Your text is still here.'
    : 'Reconnect to comment. Your message is still here.';
};

export default function CirclePulseCommentSheet({
  visible,
  item,
  actorProfileId,
  actorDisplayName,
  targetCommentId,
  targetParentCommentId,
  onClose,
  onOpenProfile,
  onCommentsChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const palette = useCirclePulsePalette();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CirclePulseComment | null>(null);
  const [editingComment, setEditingComment] = useState<CirclePulseComment | null>(null);
  const [actionComment, setActionComment] = useState<CirclePulseComment | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const draftMemoryRef = useRef<Record<string, string>>({});
  const inputRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const commentLayoutYRef = useRef<Record<string, number>>({});
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledTargetCommentRef = useRef<string | null>(null);
  const parentSequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const welcomeProfile = item?.type === 'welcome' ? item.welcomeProfiles[0] ?? null : null;
  const isViewingOwnWelcomeProfile = !!welcomeProfile && !!actorProfileId && welcomeProfile.profileId === actorProfileId;
  const [title, subtitle] = getSheetCopy(item, isViewingOwnWelcomeProfile);
  const [emptyTitle, emptyBody] = getEmptyStateCopy(item, isViewingOwnWelcomeProfile);
  const composerPlaceholder = getComposerPlaceholder(item, isViewingOwnWelcomeProfile);
  const {
    comments = [],
    loading = false,
    loadingMore = false,
    hasMore = false,
    error = null,
    loadMore = async () => undefined,
    send,
    update = async () => undefined,
    pin = async () => undefined,
    remove = async () => undefined,
    report = async () => undefined,
    toggleReaction = async () => undefined,
    moderationSyncByCommentId = {},
    retryModerationSync = async () => undefined,
    firstUnreadCommentId = null,
    markDiscussionSeen = async () => undefined,
  } = useCirclePulseComments({
    itemId: item?.id ?? null,
    circleId: item?.circleId ?? null,
    actorProfileId,
    actorDisplayName,
    enabled: visible && !!item,
  });
  const {
    activeViewerCount = 0,
    activeMemberNames = [],
    activityEvents = [],
    presenceLabel = 'Live discussion',
    typingLabel = null,
    notifyTyping,
    announceDiscussionChanged = () => undefined,
  } = useCirclePulseLiveDiscussion({
    itemId: item?.id ?? null,
    actorProfileId,
    actorDisplayName,
    enabled: visible && !!item,
  });
  const styles = useMemo(() => createStyles(insets.bottom, palette), [insets.bottom, palette]);
  const commentById = useMemo(
    () => new Map(comments.map((comment) => [comment.id, comment])),
    [comments],
  );
  const notificationTargetKey = `${targetCommentId ?? ''}:${targetParentCommentId ?? ''}`;
  const getModerationState = useCallback(
    (commentId: string) =>
      moderationSyncByCommentId[commentId] ?? {
        pinStatus: null,
        reportStatus: null,
        pinFailedMutationId: null,
        reportFailedMutationId: null,
      },
    [moderationSyncByCommentId],
  );
  const pinnedComment = useMemo(() => {
    const pinned = comments
      .filter((comment) => !!comment.pinnedAt)
      .sort((left, right) => {
        const leftKey = new Date(left.pinnedAt ?? left.createdAt).getTime();
        const rightKey = new Date(right.pinnedAt ?? right.createdAt).getTime();
        return rightKey - leftKey;
      });
    return pinned[0] ?? null;
  }, [comments]);
  const visibleComments = useMemo(
    () => (pinnedComment ? comments.filter((comment) => comment.id !== pinnedComment.id) : comments),
    [comments, pinnedComment],
  );
  const hasOwnWelcomeComment = useMemo(
    () => item?.type === 'welcome' && comments.some((comment) => comment.isOwn),
    [comments, item?.type],
  );

  useEffect(() => {
    const nextDraft = item?.id ? draftMemoryRef.current[item.id] ?? '' : '';
    setDraft(nextDraft);
    setReplyingTo(null);
    setEditingComment(null);
    setActionComment(null);
    setSubmitError(null);
    setHighlightedCommentId(null);
    commentLayoutYRef.current = {};
    handledTargetCommentRef.current = null;
    if (parentSequenceTimerRef.current) {
      clearTimeout(parentSequenceTimerRef.current);
      parentSequenceTimerRef.current = null;
    }
    notifyTyping(false);
  }, [item?.id, notifyTyping]);

  useEffect(() => {
    if (!visible) {
      void markDiscussionSeen();
    }
  }, [markDiscussionSeen, visible]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
      if (parentSequenceTimerRef.current) {
        clearTimeout(parentSequenceTimerRef.current);
        parentSequenceTimerRef.current = null;
      }
      void markDiscussionSeen();
    };
  }, [markDiscussionSeen]);

  useEffect(() => {
    if (!item?.id) return;
    draftMemoryRef.current[item.id] = draft;
  }, [draft, item?.id]);

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

  const submitBody = async (body: string, parentCommentId?: string | null) => {
    if (!body || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editingComment) {
        await update(editingComment.id, body);
      } else {
        await send(body, parentCommentId ?? null);
      }
      setDraft('');
      setReplyingTo(null);
      setEditingComment(null);
      notifyTyping(false);
      if (item?.id) draftMemoryRef.current[item.id] = '';
      onCommentsChanged?.(comments.length + (editingComment ? 0 : 1));
    } catch (error) {
      logger.warn('[circles] pulse_comment_submit_failed', {
        itemId: item?.id ?? null,
        editingCommentId: editingComment?.id ?? null,
        parentCommentId: parentCommentId ?? null,
        message: getActionErrorDetail(error) || 'unknown_error',
      });
      setSubmitError(getSubmitErrorMessage(error, !!editingComment));
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    await submitBody(body, replyingTo?.id ?? null);
  };

  const welcomeMember = async () => {
    if (!welcomeProfile || isViewingOwnWelcomeProfile || editingComment || replyingTo) return;
    await submitBody(`Welcome to the Circle, ${welcomeProfile.name.split(/\s+/)[0] || 'friend'}.`);
  };

  const startReply = useCallback((comment: CirclePulseComment) => {
    setEditingComment(null);
    setReplyingTo(comment);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const startEdit = useCallback((comment: CirclePulseComment) => {
    setReplyingTo(null);
    setEditingComment(comment);
    setDraft(comment.body);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const toggleReactionForComment = useCallback(async (
    comment: CirclePulseComment,
    reaction: CirclePulseCommentReaction = 'heart',
  ) => {
    try {
      await toggleReaction(comment.id, reaction);
      announceDiscussionChanged();
    } catch {
      Alert.alert('Circle Pulse', 'Could not update your reaction right now.');
    }
  }, [announceDiscussionChanged, toggleReaction]);

  const togglePinForComment = useCallback(async (comment: CirclePulseComment, nextPinned: boolean) => {
    try {
      await pin(comment.id, nextPinned);
    } catch {
      Alert.alert('Circle Pulse', 'Could not update the pinned note right now.');
    }
  }, [pin]);

  const copyComment = useCallback(async (comment: CirclePulseComment) => {
    const text = comment.body.trim();
    if (!text) {
      Alert.alert('Copy', 'Nothing to copy from this comment.');
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', 'Comment copied to clipboard.');
    } catch {
      Alert.alert('Copy', 'Unable to copy this comment right now.');
    }
  }, []);

  const confirmRemove = useCallback((comment: CirclePulseComment) => {
    Alert.alert(comment.isOwn ? 'Delete comment?' : 'Remove comment?', 'This comment will no longer appear in the discussion.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: comment.isOwn ? 'Delete' : 'Remove',
        style: 'destructive',
        onPress: () => {
          void remove(comment.id).catch(() => Alert.alert('Circle Pulse', 'Could not remove this comment right now.'));
        },
      },
    ]);
  }, [remove]);

  const confirmReport = useCallback((comment: CirclePulseComment) => {
    Alert.alert('Report concern?', 'Hosts can review this comment and protect the tone of the Circle.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report concern',
        style: 'destructive',
        onPress: () => {
          void report(comment.id)
            .then(() => Alert.alert('Concern reported', 'Thank you. The Circle team can now review it.'))
            .catch(() => Alert.alert('Circle Pulse', 'Could not report this comment right now.'));
        },
      },
    ]);
  }, [report]);

  const openCommentActions = useCallback((comment: CirclePulseComment) => {
    setActionComment(comment);
  }, []);

  const openCommentProfile = useCallback((profileId: string) => {
    if (!onOpenProfile) return;
    onClose();
    onOpenProfile(profileId);
  }, [onClose, onOpenProfile]);

  const jumpToComment = useCallback((commentId: string) => {
    const y = commentLayoutYRef.current[commentId];
    if (typeof y !== 'number') return false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 104), animated: true });
    setHighlightedCommentId(commentId);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedCommentId((current) => (current === commentId ? null : current));
    }, 2600);
    return true;
  }, []);

  useEffect(() => {
    if (!visible || !notificationTargetKey) return;
    if (handledTargetCommentRef.current === `done:${notificationTargetKey}`) return;
    const effectiveTargetCommentId = targetCommentId ?? targetParentCommentId;
    if (!effectiveTargetCommentId) return;
    const targetExists =
      pinnedComment?.id === effectiveTargetCommentId ||
      visibleComments.some((comment) => comment.id === effectiveTargetCommentId);
    const parentExists = !targetParentCommentId ||
      pinnedComment?.id === targetParentCommentId ||
      visibleComments.some((comment) => comment.id === targetParentCommentId);
    if (!targetExists || !parentExists) {
      if (hasMore && !loadingMore) {
        void loadMore();
      }
      return;
    }
    if (
      targetCommentId &&
      targetParentCommentId &&
      targetCommentId !== targetParentCommentId
    ) {
      if (handledTargetCommentRef.current !== `parent:${notificationTargetKey}`) {
        if (!jumpToComment(targetParentCommentId)) return;
        handledTargetCommentRef.current = `parent:${notificationTargetKey}`;
        if (parentSequenceTimerRef.current) {
          clearTimeout(parentSequenceTimerRef.current);
        }
        parentSequenceTimerRef.current = setTimeout(() => {
          if (jumpToComment(targetCommentId)) {
            handledTargetCommentRef.current = `done:${notificationTargetKey}`;
          }
          parentSequenceTimerRef.current = null;
        }, 900);
      }
      return;
    }
    if (!jumpToComment(effectiveTargetCommentId)) return;
    handledTargetCommentRef.current = `done:${notificationTargetKey}`;
  }, [
    hasMore,
    jumpToComment,
    loadMore,
    loadingMore,
    notificationTargetKey,
    pinnedComment?.id,
    targetCommentId,
    targetParentCommentId,
    visible,
    visibleComments,
  ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          style={[
            styles.keyboardArea,
            Platform.OS === 'android' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
          ]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
        >
          <BlurViewSafe intensity={38} tint={palette.dark ? 'dark' : 'light'} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Circle Pulse</Text>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
                <View style={styles.liveRow}>
                  <View style={styles.liveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>{presenceLabel}</Text>
                  </View>
                  {activeViewerCount > 1 ? (
                    <View style={styles.liveCountPill}>
                      <Text style={styles.liveCountText}>{activeViewerCount} live</Text>
                    </View>
                  ) : null}
                </View>
                {activeMemberNames.length > 0 ? (
                  <View style={styles.presenceRow}>
                    {activeMemberNames.slice(0, 3).map((memberName) => (
                      <View key={memberName} style={styles.presencePill}>
                        <Text style={styles.presencePillText} numberOfLines={1}>{memberName}</Text>
                      </View>
                    ))}
                    {activeMemberNames.length > 3 ? (
                      <View style={styles.presencePill}>
                        <Text style={styles.presencePillText}>{`+${activeMemberNames.length - 3}`}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Pressable accessibilityLabel="Close discussion" style={styles.iconButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={18} color={palette.text} />
              </Pressable>
            </View>

            {item?.title ? <Text style={styles.context} numberOfLines={2}>{item.title}</Text> : null}

            {activityEvents.length > 0 ? (
              <View style={styles.activityRail}>
                {activityEvents.slice(-3).map((event) => (
                  <View
                    key={event.id}
                    style={[
                      styles.activityPill,
                      event.type === 'join' ? styles.activityPillJoin : styles.activityPillLeave,
                    ]}
                  >
                    <Text
                      style={[
                        styles.activityPillText,
                        event.type === 'join' ? styles.activityPillTextJoin : styles.activityPillTextLeave,
                      ]}
                      numberOfLines={1}
                    >
                      {event.type === 'join' ? `${event.displayName} joined` : `${event.displayName} left`}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {pinnedComment && firstUnreadCommentId === pinnedComment.id ? (
              <View style={styles.unreadDividerRow}>
                <View style={styles.unreadDividerLine} />
                <Text style={styles.unreadDividerText}>New since your last visit</Text>
                <View style={styles.unreadDividerLine} />
              </View>
            ) : null}

            {pinnedComment ? (
              <View style={styles.discussionUtilityStack}>
                <Pressable
                  accessibilityLabel={`Open pinned note from ${pinnedComment.isOwn ? 'you' : pinnedComment.displayName}`}
                  style={[
                    styles.pinnedSpotlight,
                    highlightedCommentId === pinnedComment.id && styles.highlightedThreadCard,
                  ]}
                  onLayout={(event) => {
                    commentLayoutYRef.current[pinnedComment.id] = event.nativeEvent.layout.y;
                    const pinnedIsFocusTarget =
                      targetCommentId === pinnedComment.id ||
                      (!targetCommentId && targetParentCommentId === pinnedComment.id);
                    if (pinnedIsFocusTarget && handledTargetCommentRef.current !== `done:${notificationTargetKey}`) {
                      if (jumpToComment(pinnedComment.id)) {
                        handledTargetCommentRef.current = `done:${notificationTargetKey}`;
                      }
                    }
                  }}
                  onPress={() => openCommentActions(pinnedComment)}
                  onLongPress={() => openCommentActions(pinnedComment)}
                >
                  <View style={styles.pinnedSpotlightHeader}>
                    <View style={styles.pinnedBadgeRow}>
                      <View style={styles.pinnedBadge}>
                        <MaterialCommunityIcons name="pin" size={10} color={palette.purple} />
                        <Text style={styles.pinnedBadgeText}>Pinned</Text>
                      </View>
                      {getModerationState(pinnedComment.id).pinStatus ? (
                        <View
                          style={[
                            styles.syncBadge,
                            getModerationState(pinnedComment.id).pinStatus === 'failed'
                              ? styles.syncBadgeFailed
                              : styles.syncBadgeQueued,
                          ]}
                        >
                          <Text
                            style={[
                              styles.syncBadgeText,
                              getModerationState(pinnedComment.id).pinStatus === 'failed'
                                ? styles.syncBadgeTextFailed
                                : styles.syncBadgeTextQueued,
                            ]}
                          >
                            {getModerationState(pinnedComment.id).pinStatus === 'failed' ? 'Pin failed' : 'Pin syncing'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.pinnedSpotlightMeta}>
                      <Text style={styles.pinnedMeta}>{pinnedComment.isOwn ? 'You' : pinnedComment.displayName}</Text>
                      <MaterialCommunityIcons name="dots-horizontal" size={14} color={palette.textMuted} />
                    </View>
                  </View>
                  <Text style={styles.pinnedBody} numberOfLines={1}>{pinnedComment.body}</Text>
                  <Text style={styles.pinnedMeta}>{formatCommentMeta(pinnedComment)}</Text>
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={styles.list}
              contentContainerStyle={comments.length === 0 ? styles.emptyList : styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {hasMore && comments.length > 0 ? (
                <Pressable
                  accessibilityLabel="Load earlier comments"
                  disabled={loadingMore}
                  style={[styles.loadMoreButton, loadingMore && styles.sendButtonDisabled]}
                  onPress={() => void loadMore()}
                >
                  <MaterialCommunityIcons name="chevron-up" size={14} color={palette.teal} />
                  <Text style={styles.loadMoreText}>{loadingMore ? 'Loading earlier comments...' : 'Load earlier comments'}</Text>
                </Pressable>
              ) : null}

              {loading && comments.length === 0 ? (
                <Text style={styles.muted}>Opening discussion...</Text>
              ) : comments.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="message-text-outline" size={26} color={palette.teal} />
                  <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                  <Text style={styles.muted}>{emptyBody}</Text>
                </View>
              ) : (
                <>
                  {visibleComments.map((comment) => {
                    const parent = comment.parentCommentId ? commentById.get(comment.parentCommentId) : null;
                    const reactionSummary = Array.isArray(comment.reactionSummary) ? comment.reactionSummary : [];
                    const replyName =
                      comment.replyPreviewProfileId === actorProfileId
                        ? 'you'
                        : comment.replyPreviewDisplayName ?? (parent?.isOwn ? 'you' : parent?.displayName) ?? 'member';
                    const replyPreview = truncateCopy(comment.replyPreviewBody ?? parent?.body);
                    const moderationState = getModerationState(comment.id);
                    return (
                      <View key={comment.id}>
                        {firstUnreadCommentId === comment.id ? (
                          <View style={styles.unreadDividerRow}>
                            <View style={styles.unreadDividerLine} />
                            <Text style={styles.unreadDividerText}>New since your last visit</Text>
                            <View style={styles.unreadDividerLine} />
                          </View>
                        ) : null}
                        <View
                          style={[styles.commentRow, comment.parentCommentId && styles.replyRow]}
                          onLayout={(event) => {
                            commentLayoutYRef.current[comment.id] = event.nativeEvent.layout.y;
                            if (targetCommentId === comment.id && handledTargetCommentRef.current !== `done:${notificationTargetKey}`) {
                              if (jumpToComment(targetCommentId)) {
                                handledTargetCommentRef.current = `done:${notificationTargetKey}`;
                              }
                            }
                            if (!targetCommentId && targetParentCommentId === comment.id && handledTargetCommentRef.current !== `done:${notificationTargetKey}`) {
                              if (jumpToComment(targetParentCommentId)) {
                                handledTargetCommentRef.current = `done:${notificationTargetKey}`;
                              }
                            }
                          }}
                        >
                          <Pressable
                            accessibilityLabel={`View ${comment.displayName} profile`}
                            disabled={!onOpenProfile}
                            style={styles.avatar}
                            onPress={() => openCommentProfile(comment.profileId)}
                          >
                            {comment.avatarUrl ? (
                              <Image source={{ uri: comment.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                            ) : (
                              <Text style={styles.avatarText}>{initials(comment.displayName)}</Text>
                            )}
                          </Pressable>

                          <Pressable
                            accessibilityLabel={`Open actions for ${comment.displayName}`}
                            style={[
                              styles.commentBody,
                              highlightedCommentId === comment.id && styles.highlightedCommentBody,
                            ]}
                            onLongPress={() => openCommentActions(comment)}
                          >
                            <View style={styles.commentHeader}>
                              <View style={styles.commentHeaderMain}>
                                <Text style={styles.commentName} numberOfLines={1}>{comment.isOwn ? 'You' : comment.displayName}</Text>
                                {comment.pinnedAt ? (
                                  <View style={styles.inlineBadge}>
                                    <MaterialCommunityIcons name="pin" size={10} color={palette.purple} />
                                    <Text style={styles.inlineBadgeText}>Pinned</Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text style={styles.commentTime}>{formatCommentMeta(comment)}</Text>
                            </View>

                            {replyPreview ? (
                              <View style={styles.replyPreviewCard}>
                                <Text style={styles.replyingToText} numberOfLines={1}>
                                  {`Replying to ${replyName}`}
                                </Text>
                                <Text style={styles.replyPreviewBody} numberOfLines={2}>{replyPreview}</Text>
                              </View>
                            ) : null}

                            <Text style={styles.commentText}>{comment.body}</Text>

                          {moderationState.pinStatus || moderationState.reportStatus ? (
                            <View style={styles.commentSyncRow}>
                              {moderationState.pinStatus ? (
                                <View
                                  style={[
                                    styles.syncBadge,
                                    moderationState.pinStatus === 'failed'
                                      ? styles.syncBadgeFailed
                                      : styles.syncBadgeQueued,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.syncBadgeText,
                                      moderationState.pinStatus === 'failed'
                                        ? styles.syncBadgeTextFailed
                                        : styles.syncBadgeTextQueued,
                                    ]}
                                  >
                                    {moderationState.pinStatus === 'failed'
                                      ? 'Pin failed'
                                      : comment.pinnedAt
                                        ? 'Pin syncing'
                                        : 'Unpin syncing'}
                                  </Text>
                                </View>
                              ) : null}
                              {moderationState.reportStatus ? (
                                <View
                                  style={[
                                    styles.syncBadge,
                                    moderationState.reportStatus === 'failed'
                                      ? styles.syncBadgeFailed
                                      : styles.syncBadgeQueued,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.syncBadgeText,
                                      moderationState.reportStatus === 'failed'
                                        ? styles.syncBadgeTextFailed
                                        : styles.syncBadgeTextQueued,
                                    ]}
                                  >
                                    {moderationState.reportStatus === 'failed' ? 'Report failed' : 'Report syncing'}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}

                          <View style={styles.commentFooter}>
                            <Pressable accessibilityLabel={`Reply to ${comment.displayName}`} style={styles.inlineCommentAction} onPress={() => startReply(comment)}>
                              <MaterialCommunityIcons name="reply-outline" size={14} color={palette.textMuted} />
                              <Text style={styles.inlineCommentActionText}>Reply</Text>
                            </Pressable>
                            <Pressable
                              accessibilityLabel={`${comment.myReaction ? 'Remove reaction from' : 'React to'} ${comment.displayName}`}
                              style={[styles.inlineCommentAction, styles.inlineReactionAction]}
                              onPress={() => void toggleReactionForComment(comment, 'heart')}
                              onLongPress={() => openCommentActions(comment)}
                            >
                              {comment.myReaction ? (
                                <Text style={styles.reactionEmoji}>{REACTION_EMOJI[comment.myReaction]}</Text>
                              ) : (
                                <MaterialCommunityIcons name="heart-outline" size={14} color={palette.textMuted} />
                              )}
                              <Text style={[styles.inlineCommentActionText, comment.myReaction && styles.inlineCommentActionTextActive]}>
                                {comment.myReaction ? 'Reacted' : 'Like'}
                              </Text>
                            </Pressable>
                          </View>

                          {reactionSummary.length > 0 ? (
                            <View style={styles.reactionSummaryRow}>
                              {reactionSummary.map((entry) => (
                                <Pressable
                                  key={`${comment.id}-${entry.reaction}`}
                                  accessibilityLabel={`Open reaction options for ${comment.displayName}`}
                                  style={[
                                    styles.reactionSummaryPill,
                                    comment.myReaction === entry.reaction && styles.reactionSummaryPillActive,
                                  ]}
                                  onPress={() => openCommentActions(comment)}
                                >
                                  <Text style={styles.reactionSummaryEmoji}>{REACTION_EMOJI[entry.reaction]}</Text>
                                  <Text style={styles.reactionSummaryCount}>{entry.count}</Text>
                                </Pressable>
                              ))}
                            </View>
                          ) : null}
                          </Pressable>

                          <Pressable
                            accessibilityLabel={`Options for ${comment.displayName}`}
                            style={styles.commentAction}
                            onPress={() => openCommentActions(comment)}
                          >
                            <MaterialCommunityIcons name="dots-horizontal" size={16} color={palette.textMuted} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

            {typingLabel ? (
              <View style={styles.typingRow}>
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
                <Text style={styles.typingText}>{typingLabel}</Text>
              </View>
            ) : null}

            {replyingTo ? (
              <View style={styles.modeBanner}>
                <View style={styles.modeBannerCopy}>
                  <Text style={styles.modeBannerEyebrow}>Replying to {replyingTo.isOwn ? 'your comment' : replyingTo.displayName}</Text>
                  <Text style={styles.modeBannerBody} numberOfLines={1}>{replyingTo.body}</Text>
                </View>
                <Pressable accessibilityLabel="Cancel reply" style={styles.modeBannerClose} onPress={() => setReplyingTo(null)}>
                  <MaterialCommunityIcons name="close" size={15} color={palette.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {editingComment ? (
              <View style={styles.modeBanner}>
                <View style={styles.modeBannerCopy}>
                  <Text style={styles.modeBannerEyebrow}>Editing your comment</Text>
                  <Text style={styles.modeBannerBody} numberOfLines={1}>{editingComment.body}</Text>
                </View>
                <Pressable accessibilityLabel="Cancel edit" style={styles.modeBannerClose} onPress={() => setEditingComment(null)}>
                  <MaterialCommunityIcons name="close" size={15} color={palette.textMuted} />
                </Pressable>
              </View>
            ) : null}

            {welcomeProfile && !isViewingOwnWelcomeProfile && !hasOwnWelcomeComment && !replyingTo && !editingComment ? (
              <Pressable
                accessibilityLabel={`Welcome ${welcomeProfile.name}`}
                disabled={submitting || !actorProfileId}
                style={[styles.welcomeAction, (submitting || !actorProfileId) && styles.sendButtonDisabled]}
                onPress={() => void welcomeMember()}
              >
                <MaterialCommunityIcons name="hand-wave-outline" size={16} color={palette.purple} />
                <Text style={styles.welcomeActionText}>Welcome {welcomeProfile.name.split(/\s+/)[0] || 'member'}</Text>
              </Pressable>
            ) : null}

            <View style={styles.composer}>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={(value) => {
                  setDraft(value);
                  notifyTyping(!!value.trim());
                }}
                placeholder={editingComment ? 'Refine your comment...' : composerPlaceholder}
                placeholderTextColor={palette.textFaint}
                style={styles.input}
                multiline
                maxLength={500}
              />
              <Pressable
                accessibilityLabel={editingComment ? 'Save comment edit' : 'Send comment'}
                disabled={!draft.trim() || submitting || !actorProfileId}
                style={[styles.sendButton, (!draft.trim() || submitting || !actorProfileId) && styles.sendButtonDisabled]}
                onPress={() => void submit()}
              >
                <MaterialCommunityIcons name={editingComment ? 'check' : 'arrow-up'} size={19} color={palette.tealInk} />
              </Pressable>
            </View>
          </BlurViewSafe>
        </KeyboardAvoidingView>
      </View>

      <CirclePulseCommentActionsSheet
        visible={!!actionComment}
        comment={actionComment}
        palette={palette}
        moderationState={actionComment ? getModerationState(actionComment.id) : null}
        onClose={() => setActionComment(null)}
        onReply={startReply}
        onCopy={(comment) => void copyComment(comment)}
        onEdit={startEdit}
        onReact={(comment, reaction) => void toggleReactionForComment(comment, reaction)}
        onTogglePin={(comment, nextPinned) => void togglePinForComment(comment, nextPinned)}
        onRemove={confirmRemove}
        onReport={confirmReport}
        onRetryModerationSync={(comment, kind) => {
          void retryModerationSync(comment.id, kind).then((retried) => {
            if (!retried) {
              Alert.alert('Circle Pulse', 'Nothing was available to retry.');
            }
          });
        }}
      />
    </Modal>
  );
}

const createStyles = (bottomInset: number, palette: CirclePulsePalette) =>
  StyleSheet.create({
    modal: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: palette.overlay },
    keyboardArea: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      height: '86%',
      maxHeight: 720,
      flexShrink: 1,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: Math.max(bottomInset, 14),
      gap: 12,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.dark ? 'rgba(7,30,34,0.8)' : 'rgba(255,249,243,0.9)',
      overflow: 'hidden',
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.outline },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    headerCopy: { flex: 1, gap: 3 },
    eyebrow: { color: palette.teal, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
    title: { color: palette.text, fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
    subtitle: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 3 },
    liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.tealStrong },
    liveText: { color: palette.teal, fontSize: 10, fontWeight: '800' },
    liveCountPill: {
      minHeight: 20,
      paddingHorizontal: 8,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    liveCountText: { color: palette.textMuted, fontSize: 9, fontWeight: '900' },
    presenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
    presencePill: {
      maxWidth: 132,
      minHeight: 22,
      paddingHorizontal: 8,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    presencePillText: { color: palette.textMuted, fontSize: 10, fontWeight: '800' },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    context: {
      padding: 10,
      borderRadius: 12,
      color: palette.teal,
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: palette.tealSoft,
    },
    discussionUtilityStack: { gap: 8 },
    pinnedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    list: { flex: 1, minHeight: 76 },
    listContent: { gap: 14, paddingVertical: 4 },
    emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 24 },
    emptyState: { alignItems: 'center', gap: 7 },
    loadMoreButton: {
      alignSelf: 'center',
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    loadMoreText: { color: palette.teal, fontSize: 11, fontWeight: '800' },
    emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
    muted: { color: palette.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
    pinnedSpotlight: {
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.purpleSoft,
    },
    highlightedThreadCard: {
      borderColor: palette.tealBorder,
      backgroundColor: palette.tealSoft,
    },
    pinnedSpotlightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pinnedSpotlightMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pinnedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: palette.surfaceStrong,
    },
    pinnedBadgeText: { color: palette.purple, fontSize: 10, fontWeight: '900' },
    syncBadge: {
      minHeight: 20,
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    syncBadgeQueued: {
      borderColor: palette.tealBorder,
      backgroundColor: palette.tealSoft,
    },
    syncBadgeFailed: {
      borderColor: palette.purpleBorder,
      backgroundColor: palette.purpleSoft,
    },
    syncBadgeText: { fontSize: 9, fontWeight: '900' },
    syncBadgeTextQueued: { color: palette.teal },
    syncBadgeTextFailed: { color: palette.purpleStrong },
    pinnedBody: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    pinnedMeta: { color: palette.textMuted, fontSize: 11, fontWeight: '700' },
    commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    replyRow: {
      marginLeft: 24,
      paddingLeft: 10,
      borderLeftWidth: 1,
      borderLeftColor: palette.purpleBorder,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.tealSoft,
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: palette.teal, fontSize: 10, fontWeight: '900' },
    commentBody: { flex: 1, gap: 4, borderRadius: 14, padding: 4, margin: -4 },
    highlightedCommentBody: {
      backgroundColor: palette.tealSoft,
      borderWidth: 1,
      borderColor: palette.tealBorder,
    },
    commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    commentHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
    commentName: { flexShrink: 1, color: palette.text, fontSize: 12, fontWeight: '900' },
    commentTime: { color: palette.textMuted, fontSize: 10 },
    inlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: palette.purpleSoft,
    },
    inlineBadgeText: { color: palette.purple, fontSize: 9, fontWeight: '900' },
    replyPreviewCard: {
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      borderLeftWidth: 2,
      borderLeftColor: palette.purpleBorder,
      backgroundColor: palette.surfaceMuted,
    },
    replyingToText: { color: palette.purpleStrong, fontSize: 10, fontWeight: '800' },
    replyPreviewBody: { color: palette.textMuted, fontSize: 11, lineHeight: 15 },
    commentText: { color: palette.textSoft, fontSize: 13, lineHeight: 18 },
    commentSyncRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
    commentAction: { padding: 7 },
    commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
    inlineCommentAction: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 4 },
    inlineReactionAction: {
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    inlineCommentActionText: { color: palette.textMuted, fontSize: 10, fontWeight: '800' },
    inlineCommentActionTextActive: { color: palette.teal },
    reactionEmoji: { fontSize: 13 },
    reactionCount: { color: palette.purple, fontSize: 10, fontWeight: '900' },
    reactionSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 2 },
    reactionSummaryPill: {
      minHeight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.outline,
      backgroundColor: palette.surfaceMuted,
    },
    reactionSummaryPillActive: {
      borderColor: palette.tealBorder,
      backgroundColor: palette.tealSoft,
    },
    reactionSummaryEmoji: { fontSize: 11 },
    reactionSummaryCount: { color: palette.textMuted, fontSize: 9, fontWeight: '900' },
    errorText: { color: palette.warning, fontSize: 11, lineHeight: 16 },
    unreadDividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    unreadDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: palette.tealBorder,
    },
    unreadDividerText: {
      color: palette.teal,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    activityRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    activityPill: {
      maxWidth: '100%',
      minHeight: 22,
      paddingHorizontal: 8,
      borderRadius: 999,
      justifyContent: 'center',
      borderWidth: 1,
    },
    activityPillJoin: {
      borderColor: palette.tealBorder,
      backgroundColor: palette.tealSoft,
    },
    activityPillLeave: {
      borderColor: palette.purpleBorder,
      backgroundColor: palette.purpleSoft,
    },
    activityPillText: { fontSize: 10, fontWeight: '800' },
    activityPillTextJoin: { color: palette.teal },
    activityPillTextLeave: { color: palette.purpleStrong },
    typingRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 4 },
    typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.teal },
    typingText: { marginLeft: 3, color: palette.textMuted, fontSize: 10, fontWeight: '700' },
    modeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.purpleSoft,
    },
    modeBannerCopy: { flex: 1, gap: 2 },
    modeBannerEyebrow: { color: palette.purple, fontSize: 10, fontWeight: '900' },
    modeBannerBody: { color: palette.textMuted, fontSize: 11 },
    modeBannerClose: { padding: 4 },
    welcomeAction: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: palette.purpleBorder,
      backgroundColor: palette.purpleSoft,
    },
    welcomeActionText: { color: palette.purple, fontSize: 12, fontWeight: '900' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 9,
      padding: 7,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: palette.tealBorder,
      backgroundColor: palette.surfaceMuted,
    },
    input: {
      flex: 1,
      maxHeight: 96,
      paddingHorizontal: 7,
      paddingVertical: 7,
      color: palette.text,
      fontSize: 13,
      lineHeight: 18,
    },
    sendButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.tealStrong,
    },
    sendButtonDisabled: { opacity: 0.42 },
  });
