import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ChevronDown, ChevronUp, Send, Sparkles } from 'lucide-react-native';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type {
  LiveAudiencePulseSnapshot,
  LiveComment,
  LiveJoinNotice,
  LiveMemberPreview,
  LiveReactionKind,
} from '../application/index.ts';
import { LiveAudiencePulseCard } from './LiveAudiencePulseCard.tsx';
import { type LiveVisualTheme, useLiveVisualTheme } from './live-visual-tokens.ts';

const REACTIONS: readonly { kind: LiveReactionKind; symbol: string; label: string }[] = [
  { kind: 'heart', symbol: '\u2661', label: 'Heart' },
  { kind: 'spark', symbol: '\u2726', label: 'Spark' },
  { kind: 'applause', symbol: '\u{1F44F}', label: 'Applause' },
  { kind: 'support', symbol: '\u{1FAF6}', label: 'Support' },
];

type PendingComment = {
  body: string;
  clientCommentId: string;
  status: 'sending' | 'failed';
};

type Props = {
  comments: readonly LiveComment[];
  commentCount: number;
  currentUserId: string | null;
  canModerate: boolean;
  audiencePulse: LiveAudiencePulseSnapshot;
  pollBusy?: boolean;
  disabled?: boolean;
  loadingEarlier?: boolean;
  onLoadEarlier: () => Promise<unknown>;
  onComment: (body: string, clientCommentId: string) => Promise<boolean>;
  onModerate: (commentId: string) => Promise<unknown>;
  onReport: (comment: LiveComment) => Promise<unknown>;
  onReaction: (reaction: LiveReactionKind) => Promise<unknown>;
  onOpenPoll: (templateKey: string) => Promise<unknown>;
  onVotePoll: (pollId: string, optionId: string) => Promise<unknown>;
  onClosePoll: (pollId: string) => Promise<unknown>;
  joinNotice?: LiveJoinNotice | null;
  onOpenMember?: (member: LiveMemberPreview) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  variant?: 'solid' | 'glass';
  audiencePulseOpenRequest?: number;
};

const CommentRow = memo(function CommentRow({
  comment,
  canModerate,
  currentUserId,
  onModerate,
  onReport,
  onOpenMember,
}: {
  comment: LiveComment;
  canModerate: boolean;
  currentUserId: string | null;
  onModerate: (commentId: string) => Promise<unknown>;
  onReport: (comment: LiveComment) => Promise<unknown>;
  onOpenMember?: (member: LiveMemberPreview) => void;
}) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const roleLabel = comment.role === 'host'
    ? 'HOST'
    : comment.role === 'moderator' || comment.role === 'internal_admin'
      ? 'MOD'
      : null;

  const openActions = () => {
    const buttons = [];
    if (canModerate) {
      buttons.push({
        text: 'Remove comment',
        style: 'destructive' as const,
        onPress: () => void onModerate(comment.id),
      });
    }
    if (comment.userId !== currentUserId) {
      buttons.push({
        text: 'Report comment',
        onPress: () => Alert.alert(
          'Report this comment?',
          'Betweener will send it to the safety queue for review.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Report', style: 'destructive', onPress: () => void onReport(comment) },
          ],
        ),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' as const });
    Alert.alert(comment.fullName || 'Member', undefined, buttons);
  };

  return (
    <View style={styles.commentRow}>
      <Pressable
        accessibilityLabel={`View ${comment.fullName || 'member'}`}
        accessibilityRole="button"
        hitSlop={5}
        onPress={() => onOpenMember?.({
          userId: comment.userId,
          profileId: comment.profileId,
          fullName: comment.fullName,
          avatarUrl: comment.avatarUrl,
          role: comment.role,
        })}
        style={styles.commentAvatarShell}
      >
        {comment.avatarUrl ? (
          <Image contentFit="cover" source={{ uri: comment.avatarUrl }} style={styles.commentAvatar} transition={100} />
        ) : (
          <Text style={styles.commentInitial}>{(comment.fullName?.trim()[0] || 'B').toUpperCase()}</Text>
        )}
      </Pressable>
      <Pressable
        accessibilityHint={canModerate || comment.userId !== currentUserId ? 'Long press for safety actions' : undefined}
        delayLongPress={450}
        onLongPress={canModerate || comment.userId !== currentUserId ? openActions : undefined}
        style={styles.commentCopy}
      >
        <Text style={styles.comment}>
          <Text style={styles.name}>{comment.fullName || 'Member'}  </Text>
          {roleLabel ? <Text style={styles.roleBadge}>{roleLabel}  </Text> : null}
          {comment.body}
        </Text>
      </Pressable>
    </View>
  );
});

export const LiveConversationPanel = memo(function LiveConversationPanel({
  comments,
  commentCount,
  currentUserId,
  canModerate,
  audiencePulse,
  pollBusy,
  disabled,
  loadingEarlier,
  onLoadEarlier,
  onComment,
  onModerate,
  onReport,
  onReaction,
  onOpenPoll,
  onVotePoll,
  onClosePoll,
  joinNotice = null,
  onOpenMember,
  expanded = false,
  onExpandedChange,
  variant = 'solid',
  audiencePulseOpenRequest = 0,
}: Props) {
  const visual = useLiveVisualTheme();
  const styles = useMemo(() => createStyles(visual), [visual]);
  const listRef = useRef<FlatList<LiveComment>>(null);
  const inputRef = useRef<TextInput>(null);
  const shouldFollowRef = useRef(true);
  const [draft, setDraft] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [pending, setPending] = useState<PendingComment | null>(null);
  const hasEarlier = expanded && comments.length < commentCount;
  const data = useMemo(
    () => expanded ? [...comments] : comments.slice(-3),
    [comments, expanded],
  );

  const toggleExpanded = useCallback(() => {
    if (!onExpandedChange) return;
    void Haptics.selectionAsync().catch(() => undefined);
    onExpandedChange(!expanded);
  }, [expanded, onExpandedChange]);

  const send = useCallback(async (submission: PendingComment) => {
    shouldFollowRef.current = true;
    setPending({ ...submission, status: 'sending' });
    const sent = await onComment(submission.body, submission.clientCommentId);
    setPending((current) => {
      if (current?.clientCommentId !== submission.clientCommentId) return current;
      return sent ? null : { ...submission, status: 'failed' };
    });
  }, [onComment]);

  const submit = useCallback(() => {
    const body = draft.trim();
    if (!body || disabled || pending?.status === 'sending') return;
    const submission: PendingComment = {
      body,
      clientCommentId: Crypto.randomUUID(),
      status: 'sending',
    };
    setDraft('');
    void send(submission);
  }, [disabled, draft, pending?.status, send]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    shouldFollowRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 72;
  }, []);

  const revealLatestComment = useCallback(() => {
    setInputFocused(true);
    shouldFollowRef.current = true;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const dismissKeyboard = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setInputFocused(false);
  }, []);

  return (
    <View style={[styles.panel, variant === 'glass' && styles.panelGlass]}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Sparkles size={14} color={visual.color.teal} />
          <Text style={styles.heading}>ROOM PULSE</Text>
        </View>
        <View style={styles.headingActions}>
          {commentCount > 0 ? <Text style={styles.commentCount}>{commentCount}</Text> : null}
          {onExpandedChange ? (
            <Pressable
              accessibilityLabel={expanded ? 'Collapse Room Pulse' : 'Expand Room Pulse'}
              accessibilityRole="button"
              hitSlop={8}
              onPress={toggleExpanded}
              style={styles.expandButton}
            >
              {expanded
                ? <ChevronDown color={visual.color.textMuted} size={16} />
                : <ChevronUp color={visual.color.textMuted} size={16} />}
            </Pressable>
          ) : null}
        </View>
      </View>
      {joinNotice ? (
        <Pressable
          accessibilityLabel={`${joinNotice.fullName || 'A member'} joined. View member`}
          accessibilityRole="button"
          onPress={() => onOpenMember?.({ ...joinNotice, role: 'audience' })}
          style={styles.joinNotice}
        >
          <View style={styles.joinAvatarShell}>
            {joinNotice.avatarUrl ? (
              <Image contentFit="cover" source={{ uri: joinNotice.avatarUrl }} style={styles.joinAvatar} transition={100} />
            ) : (
              <Text style={styles.joinInitial}>{(joinNotice.fullName?.trim()[0] || 'B').toUpperCase()}</Text>
            )}
          </View>
          <Text numberOfLines={1} style={styles.joinCopy}>
            <Text style={styles.joinName}>{joinNotice.fullName || 'A member'}</Text> joined
          </Text>
          <Text style={styles.joinHint}>VIEW</Text>
        </Pressable>
      ) : null}
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={7}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onScroll={handleScroll}
        scrollEventThrottle={80}
        onContentSizeChange={() => {
          if (shouldFollowRef.current) listRef.current?.scrollToEnd({ animated: true });
        }}
        renderItem={({ item }) => (
          <CommentRow
            comment={item}
            canModerate={canModerate}
            currentUserId={currentUserId}
            onModerate={onModerate}
            onReport={onReport}
            onOpenMember={onOpenMember}
          />
        )}
        ListHeaderComponent={hasEarlier ? (
          <Pressable
            accessibilityRole="button"
            disabled={loadingEarlier}
            onPress={() => void onLoadEarlier()}
            style={styles.loadEarlier}
          >
            {loadingEarlier ? <ActivityIndicator size="small" color={visual.color.teal} /> : null}
            <Text style={styles.loadEarlierText}>{loadingEarlier ? 'Loading earlier notes…' : 'Load earlier notes'}</Text>
          </Pressable>
        ) : null}
        ListEmptyComponent={<Text style={styles.empty}>The first thoughtful note can be yours.</Text>}
      />
      {pending ? (
        <View style={[styles.pendingRow, pending.status === 'failed' && styles.pendingFailed]}>
          <Text numberOfLines={1} style={styles.pendingBody}>{pending.body}</Text>
          {pending.status === 'sending' ? (
            <Text style={styles.pendingStatus}>Sending…</Text>
          ) : (
            <Pressable onPress={() => void send(pending)}><Text style={styles.retryText}>Not sent · Retry</Text></Pressable>
          )}
        </View>
      ) : null}
      {!inputFocused ? <View style={styles.reactions}>
        {REACTIONS.map((reaction) => (
          <Pressable
            key={reaction.kind}
            accessibilityRole="button"
            accessibilityLabel={`Send ${reaction.label}`}
            disabled={disabled}
            onPress={() => void onReaction(reaction.kind)}
            style={styles.reaction}
          >
            <Text style={styles.reactionText}>{reaction.symbol}</Text>
          </Pressable>
        ))}
        <LiveAudiencePulseCard
          presentation="trigger"
          openRequest={audiencePulseOpenRequest}
          pulse={audiencePulse}
          busy={pollBusy}
          disabled={disabled}
          onOpen={onOpenPoll}
          onVote={onVotePoll}
          onClose={onClosePoll}
        />
      </View> : null}
      {inputFocused ? (
        <View style={styles.keyboardToolbar}>
          <Text style={styles.keyboardToolbarLabel}>COMMENTING</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss keyboard"
            hitSlop={10}
            onPress={dismissKeyboard}
          >
            <Text style={styles.keyboardDone}>Done</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          editable={!disabled}
          maxLength={500}
          placeholder="Add something thoughtful…"
          placeholderTextColor={visual.color.textMuted}
          style={styles.input}
          returnKeyType="send"
          blurOnSubmit={false}
          onBlur={() => setInputFocused(false)}
          onFocus={revealLatestComment}
          onSubmitEditing={submit}
        />
        {draft.length >= 440 ? <Text style={styles.characterCount}>{500 - draft.length}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          disabled={disabled || !draft.trim() || pending?.status === 'sending'}
          onPress={submit}
          style={[styles.send, (disabled || !draft.trim() || pending?.status === 'sending') && styles.sendDisabled]}
        >
          <Send size={17} color={visual.color.accentContrast} />
        </Pressable>
      </View>
    </View>
  );
});

const createStyles = (visual: LiveVisualTheme) => StyleSheet.create({
  panel: { flex: 1, minHeight: 0, backgroundColor: visual.color.surface, paddingHorizontal: 16, paddingTop: 14 },
  panelGlass: { backgroundColor: 'transparent' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headingCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heading: { color: visual.color.teal, fontSize: 10, letterSpacing: 1.8, fontFamily: 'Manrope_700Bold' },
  headingActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  commentCount: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_700Bold' },
  expandButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised },
  list: { flex: 1, minHeight: 40 },
  listContent: { paddingVertical: 10, gap: 2, flexGrow: 1 },
  commentRow: { paddingVertical: 4, minHeight: 31, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  commentCopy: { flex: 1, minHeight: 27, justifyContent: 'center' },
  commentAvatarShell: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: visual.color.tealSoft, borderWidth: 1, borderColor: visual.color.borderStrong },
  commentAvatar: { width: 27, height: 27, borderRadius: 14 },
  commentInitial: { color: visual.color.text, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  comment: { color: visual.color.text, fontSize: 13, lineHeight: 19, fontFamily: 'Manrope_400Regular' },
  name: { color: visual.color.text, fontFamily: 'Manrope_700Bold' },
  roleBadge: { color: visual.color.teal, fontSize: 9, letterSpacing: 0.7, fontFamily: 'Manrope_800ExtraBold' },
  empty: { color: visual.color.textMuted, fontSize: 12, marginTop: 12, fontFamily: 'Manrope_500Medium' },
  joinNotice: { minHeight: 38, marginTop: 9, paddingHorizontal: 9, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: visual.color.tealSoft, borderWidth: 1, borderColor: visual.color.borderStrong },
  joinAvatarShell: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: visual.color.tealSoft },
  joinAvatar: { width: 28, height: 28, borderRadius: 14 },
  joinInitial: { color: visual.color.text, fontSize: 9, fontFamily: 'Manrope_800ExtraBold' },
  joinCopy: { flex: 1, color: visual.color.textMuted, fontSize: 11, fontFamily: 'Manrope_500Medium' },
  joinName: { color: visual.color.text, fontFamily: 'Manrope_800ExtraBold' },
  joinHint: { color: visual.color.teal, fontSize: 8, letterSpacing: 1, fontFamily: 'Manrope_800ExtraBold' },
  loadEarlier: { height: 34, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13 },
  loadEarlierText: { color: visual.color.textMuted, fontSize: 11, fontFamily: 'Manrope_700Bold' },
  pendingRow: { minHeight: 32, marginBottom: 7, paddingHorizontal: 11, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: visual.color.surfaceRaised },
  pendingFailed: { borderWidth: 1, borderColor: visual.color.danger },
  pendingBody: { flex: 1, color: visual.color.text, fontSize: 11, fontFamily: 'Manrope_500Medium' },
  pendingStatus: { color: visual.color.textMuted, fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  retryText: { color: visual.color.teal, fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  reactions: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  reaction: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border },
  reactionText: { color: visual.color.text, fontSize: 18 },
  keyboardToolbar: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5 },
  keyboardToolbarLabel: { color: visual.color.textMuted, fontSize: 8, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  keyboardDone: { color: visual.color.teal, fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 10 },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 17, paddingRight: 44, color: visual.color.text, backgroundColor: visual.color.surfaceRaised, borderWidth: 1, borderColor: visual.color.border, fontFamily: 'Manrope_500Medium' },
  characterCount: { position: 'absolute', right: 58, color: visual.color.textMuted, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  send: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.color.teal },
  sendDisabled: { opacity: 0.45 },
});
