import * as Crypto from 'expo-crypto';
import { Send, Sparkles } from 'lucide-react-native';
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
import type { LiveComment, LiveReactionKind } from '../application/index.ts';

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
  disabled?: boolean;
  loadingEarlier?: boolean;
  onLoadEarlier: () => Promise<unknown>;
  onComment: (body: string, clientCommentId: string) => Promise<boolean>;
  onModerate: (commentId: string) => Promise<unknown>;
  onReport: (comment: LiveComment) => Promise<unknown>;
  onReaction: (reaction: LiveReactionKind) => Promise<unknown>;
};

const CommentRow = memo(function CommentRow({
  comment,
  canModerate,
  currentUserId,
  onModerate,
  onReport,
}: {
  comment: LiveComment;
  canModerate: boolean;
  currentUserId: string | null;
  onModerate: (commentId: string) => Promise<unknown>;
  onReport: (comment: LiveComment) => Promise<unknown>;
}) {
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
    <Pressable
      accessibilityHint={canModerate || comment.userId !== currentUserId ? 'Long press for safety actions' : undefined}
      delayLongPress={450}
      onLongPress={canModerate || comment.userId !== currentUserId ? openActions : undefined}
      style={styles.commentRow}
    >
      <Text style={styles.comment}>
        <Text style={styles.name}>{comment.fullName || 'Member'}  </Text>
        {roleLabel ? <Text style={styles.roleBadge}>{roleLabel}  </Text> : null}
        {comment.body}
      </Text>
    </Pressable>
  );
});

export const LiveConversationPanel = memo(function LiveConversationPanel({
  comments,
  commentCount,
  currentUserId,
  canModerate,
  disabled,
  loadingEarlier,
  onLoadEarlier,
  onComment,
  onModerate,
  onReport,
  onReaction,
}: Props) {
  const listRef = useRef<FlatList<LiveComment>>(null);
  const inputRef = useRef<TextInput>(null);
  const shouldFollowRef = useRef(true);
  const [draft, setDraft] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [pending, setPending] = useState<PendingComment | null>(null);
  const hasEarlier = comments.length < commentCount;
  const data = useMemo(() => [...comments], [comments]);

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
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Sparkles size={14} color="#D7B56D" />
          <Text style={styles.heading}>ROOM PULSE</Text>
        </View>
        {commentCount > 0 ? <Text style={styles.commentCount}>{commentCount}</Text> : null}
      </View>
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
          />
        )}
        ListHeaderComponent={hasEarlier ? (
          <Pressable
            accessibilityRole="button"
            disabled={loadingEarlier}
            onPress={() => void onLoadEarlier()}
            style={styles.loadEarlier}
          >
            {loadingEarlier ? <ActivityIndicator size="small" color="#D7B56D" /> : null}
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
          placeholderTextColor="#8FA19D"
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
          <Send size={17} color="#0D2422" />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0, backgroundColor: '#0D1D1B', paddingHorizontal: 16, paddingTop: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headingCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heading: { color: '#D7B56D', fontSize: 10, letterSpacing: 1.8, fontFamily: 'Manrope_700Bold' },
  commentCount: { color: '#7E918C', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  list: { flex: 1, minHeight: 40 },
  listContent: { paddingVertical: 10, gap: 2, flexGrow: 1 },
  commentRow: { paddingVertical: 4, minHeight: 27, justifyContent: 'center' },
  comment: { color: '#DDE9E5', fontSize: 13, lineHeight: 19, fontFamily: 'Manrope_400Regular' },
  name: { color: '#FFF7EB', fontFamily: 'Manrope_700Bold' },
  roleBadge: { color: '#D7B56D', fontSize: 9, letterSpacing: 0.7, fontFamily: 'Manrope_800ExtraBold' },
  empty: { color: '#8FA19D', fontSize: 12, marginTop: 12, fontFamily: 'Manrope_500Medium' },
  loadEarlier: { height: 34, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13 },
  loadEarlierText: { color: '#B8C7C3', fontSize: 11, fontFamily: 'Manrope_700Bold' },
  pendingRow: { minHeight: 32, marginBottom: 7, paddingHorizontal: 11, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#142522' },
  pendingFailed: { borderWidth: 1, borderColor: '#704844' },
  pendingBody: { flex: 1, color: '#C4D1CD', fontSize: 11, fontFamily: 'Manrope_500Medium' },
  pendingStatus: { color: '#8FA19D', fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  retryText: { color: '#E3BE70', fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
  reactions: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  reaction: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#172B28', borderWidth: 1, borderColor: '#29423D' },
  reactionText: { color: '#FFF7EB', fontSize: 18 },
  keyboardToolbar: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5 },
  keyboardToolbarLabel: { color: '#71847F', fontSize: 8, letterSpacing: 1.2, fontFamily: 'Manrope_800ExtraBold' },
  keyboardDone: { color: '#D7B56D', fontSize: 12, fontFamily: 'Manrope_800ExtraBold' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 10 },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 17, paddingRight: 44, color: '#FFF7EB', backgroundColor: '#172724', borderWidth: 1, borderColor: '#30423F', fontFamily: 'Manrope_500Medium' },
  characterCount: { position: 'absolute', right: 58, color: '#7E918C', fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  send: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  sendDisabled: { opacity: 0.45 },
});
