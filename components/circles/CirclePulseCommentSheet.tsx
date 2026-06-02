import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { useCirclePulseComments } from '@/lib/circles/pulse/use-circle-pulse-comments';
import { useCirclePulseLiveDiscussion } from '@/lib/circles/pulse/use-circle-pulse-live-discussion';
import type { CirclePulseComment, CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  visible: boolean;
  item: CirclePulseItem | null;
  actorProfileId: string | null;
  actorDisplayName?: string | null;
  onClose: () => void;
  onOpenProfile?: (profileId: string) => void;
  onCommentsChanged?: () => void | Promise<void>;
};

const getSheetCopy = (item: CirclePulseItem | null) => {
  if (item?.type === 'prompt') return ['Circle Prompt', 'Share your answer with the Circle.'];
  if (item?.type === 'gathering') return ['Gathering discussion', 'Ask questions before attending.'];
  if (item?.type === 'media') return ['Circle media', 'Keep it warm, respectful, and intentional.'];
  if (item?.type === 'welcome') return ['Welcome new members', 'Say hello and help new members feel at home.'];
  if (item?.type === 'love_seat') return ['Love Seat comments', 'Ask something thoughtful or celebrate this member.'];
  return ['Host Note', 'Keep it warm, respectful, and intentional.'];
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function CirclePulseCommentSheet({
  visible,
  item,
  actorProfileId,
  actorDisplayName,
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputRef = useRef<TextInput | null>(null);
  const [title, subtitle] = getSheetCopy(item);
  const welcomeProfile = item?.type === 'welcome' ? item.welcomeProfiles[0] ?? null : null;
  const { comments, loading, error, reload, send, remove, report, toggleReaction } = useCirclePulseComments({
    itemId: item?.id ?? null,
    actorProfileId,
    enabled: visible && !!item,
  });
  const {
    activeViewerCount,
    typingLabel,
    notifyTyping,
    announceDiscussionChanged,
  } = useCirclePulseLiveDiscussion({
    itemId: item?.id ?? null,
    actorProfileId,
    actorDisplayName,
    enabled: visible && !!item,
    onDiscussionChanged: reload,
  });
  const styles = useMemo(() => createStyles(insets.bottom, palette), [insets.bottom, palette]);
  const commentById = useMemo(
    () => new Map(comments.map((comment) => [comment.id, comment])),
    [comments],
  );

  useEffect(() => {
    setDraft('');
    setReplyingTo(null);
    setSubmitError(null);
    notifyTyping(false);
  }, [item?.id, notifyTyping]);

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
      await send(body, parentCommentId ?? null);
      setDraft('');
      setReplyingTo(null);
      notifyTyping(false);
      announceDiscussionChanged();
      void onCommentsChanged?.();
    } catch {
      setSubmitError('Reconnect to comment. Your message is still here.');
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
    if (!welcomeProfile) return;
    await submitBody(`Welcome to the Circle, ${welcomeProfile.name.split(/\s+/)[0] || 'friend'}.`);
  };

  const startReply = useCallback((comment: CirclePulseComment) => {
    setReplyingTo(comment);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const toggleHeart = useCallback(async (comment: CirclePulseComment) => {
    try {
      await toggleReaction(comment.id, 'heart');
      announceDiscussionChanged();
    } catch {
      Alert.alert('Circle Pulse', 'Could not update your reaction right now.');
    }
  }, [announceDiscussionChanged, toggleReaction]);

  const confirmRemove = (comment: CirclePulseComment) => {
    Alert.alert(comment.isOwn ? 'Delete comment?' : 'Remove comment?', 'This comment will no longer appear in the discussion.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: comment.isOwn ? 'Delete' : 'Remove',
        style: 'destructive',
        onPress: () => {
          void remove(comment.id)
            .then(() => {
              announceDiscussionChanged();
              void onCommentsChanged?.();
            })
            .catch(() => Alert.alert('Circle Pulse', 'Could not remove this comment right now.'));
        },
      },
    ]);
  };

  const confirmReport = (comment: CirclePulseComment) => {
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
  };

  const openCommentActions = (comment: CirclePulseComment) => {
    Alert.alert('Comment options', undefined, [
      { text: 'Reply', onPress: () => startReply(comment) },
      ...(comment.canRemove
        ? [{ text: comment.isOwn ? 'Delete comment' : 'Remove comment', style: 'destructive' as const, onPress: () => confirmRemove(comment) }]
        : [{ text: 'Report concern', style: 'destructive' as const, onPress: () => confirmReport(comment) }]),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCommentProfile = useCallback((profileId: string) => {
    if (!onOpenProfile) return;
    onClose();
    onOpenProfile(profileId);
  }, [onClose, onOpenProfile]);

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
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>
                    {activeViewerCount > 1 ? `${activeViewerCount} here now` : 'Live discussion'}
                  </Text>
                </View>
              </View>
              <Pressable accessibilityLabel="Close discussion" style={styles.iconButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={18} color={palette.text} />
              </Pressable>
            </View>
            {item?.title ? <Text style={styles.context} numberOfLines={2}>{item.title}</Text> : null}
            <ScrollView
              style={styles.list}
              contentContainerStyle={comments.length === 0 ? styles.emptyList : styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {loading && comments.length === 0 ? (
                <Text style={styles.muted}>Opening discussion...</Text>
              ) : comments.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="message-text-outline" size={26} color={palette.teal} />
                  <Text style={styles.emptyTitle}>Start the discussion</Text>
                  <Text style={styles.muted}>Keep it warm, respectful, and intentional.</Text>
                </View>
              ) : (
                comments.map((comment) => {
                  const parent = comment.parentCommentId ? commentById.get(comment.parentCommentId) : null;
                  return (
                  <View key={comment.id} style={[styles.commentRow, comment.parentCommentId && styles.replyRow]}>
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
                    <View style={styles.commentBody}>
                      <View style={styles.commentHeader}>
                        <Text style={styles.commentName} numberOfLines={1}>{comment.isOwn ? 'You' : comment.displayName}</Text>
                        <Text style={styles.commentTime}>{formatTime(comment.createdAt)}</Text>
                      </View>
                      {parent ? (
                        <Text style={styles.replyingToText} numberOfLines={1}>
                          Replying to {parent.isOwn ? 'you' : parent.displayName}
                        </Text>
                      ) : null}
                      <Text style={styles.commentText}>{comment.body}</Text>
                      <View style={styles.commentFooter}>
                        <Pressable accessibilityLabel={`Reply to ${comment.displayName}`} style={styles.inlineCommentAction} onPress={() => startReply(comment)}>
                          <MaterialCommunityIcons name="reply-outline" size={14} color={palette.textMuted} />
                          <Text style={styles.inlineCommentActionText}>Reply</Text>
                        </Pressable>
                        <Pressable accessibilityLabel={`React to ${comment.displayName}`} style={styles.inlineCommentAction} onPress={() => void toggleHeart(comment)}>
                          <MaterialCommunityIcons name={comment.myReaction === 'heart' ? 'heart' : 'heart-outline'} size={14} color={comment.myReaction === 'heart' ? palette.purpleStrong : palette.textMuted} />
                          {comment.reactionCount > 0 ? <Text style={styles.reactionCount}>{comment.reactionCount}</Text> : null}
                        </Pressable>
                      </View>
                    </View>
                    <Pressable
                      accessibilityLabel={`Options for ${comment.displayName}`}
                      style={styles.commentAction}
                      onPress={() => openCommentActions(comment)}
                    >
                      <MaterialCommunityIcons name="dots-horizontal" size={16} color={palette.textMuted} />
                    </Pressable>
                  </View>
                  );
                })
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
              <View style={styles.replyBanner}>
                <View style={styles.replyBannerCopy}>
                  <Text style={styles.replyBannerEyebrow}>Replying to {replyingTo.isOwn ? 'your comment' : replyingTo.displayName}</Text>
                  <Text style={styles.replyBannerBody} numberOfLines={1}>{replyingTo.body}</Text>
                </View>
                <Pressable accessibilityLabel="Cancel reply" style={styles.replyBannerClose} onPress={() => setReplyingTo(null)}>
                  <MaterialCommunityIcons name="close" size={15} color={palette.textMuted} />
                </Pressable>
              </View>
            ) : null}
            {welcomeProfile ? (
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
                placeholder="Write something thoughtful..."
                placeholderTextColor={palette.textFaint}
                style={styles.input}
                multiline
                maxLength={500}
              />
              <Pressable
                accessibilityLabel="Send comment"
                disabled={!draft.trim() || submitting || !actorProfileId}
                style={[styles.sendButton, (!draft.trim() || submitting || !actorProfileId) && styles.sendButtonDisabled]}
                onPress={() => void submit()}
              >
                <MaterialCommunityIcons name="arrow-up" size={19} color={palette.tealInk} />
              </Pressable>
            </View>
          </BlurViewSafe>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (bottomInset: number, palette: CirclePulsePalette) =>
  StyleSheet.create({
    modal: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.overlay },
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
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 3 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.tealStrong },
    liveText: { color: palette.teal, fontSize: 10, fontWeight: '800' },
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
    list: { flex: 1, minHeight: 76 },
    listContent: { gap: 14, paddingVertical: 4 },
    emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 24 },
    emptyState: { alignItems: 'center', gap: 7 },
    emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
    muted: { color: palette.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
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
    commentBody: { flex: 1, gap: 3 },
    commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    commentName: { flexShrink: 1, color: palette.text, fontSize: 12, fontWeight: '900' },
    commentTime: { color: palette.textMuted, fontSize: 10 },
    replyingToText: { color: palette.purpleStrong, fontSize: 10, fontWeight: '800' },
    commentText: { color: palette.textSoft, fontSize: 13, lineHeight: 18 },
    commentAction: { padding: 7 },
    commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 5 },
    inlineCommentAction: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 4 },
    inlineCommentActionText: { color: palette.textMuted, fontSize: 10, fontWeight: '800' },
    reactionCount: { color: palette.purple, fontSize: 10, fontWeight: '900' },
    errorText: { color: palette.warning, fontSize: 11, lineHeight: 16 },
    typingRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 4 },
    typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.teal },
    typingText: { marginLeft: 3, color: palette.textMuted, fontSize: 10, fontWeight: '700' },
    replyBanner: {
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
    replyBannerCopy: { flex: 1, gap: 2 },
    replyBannerEyebrow: { color: palette.purple, fontSize: 10, fontWeight: '900' },
    replyBannerBody: { color: palette.textMuted, fontSize: 11 },
    replyBannerClose: { padding: 4 },
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
    input: { flex: 1, maxHeight: 96, paddingHorizontal: 7, paddingVertical: 7, color: palette.text, fontSize: 13, lineHeight: 18 },
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
