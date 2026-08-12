import { Send, Sparkles } from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LiveComment, LiveReactionKind } from '../application/index.ts';

const REACTIONS: readonly { kind: LiveReactionKind; symbol: string; label: string }[] = [
  { kind: 'heart', symbol: '♡', label: 'Heart' },
  { kind: 'spark', symbol: '✦', label: 'Spark' },
  { kind: 'applause', symbol: '👏', label: 'Applause' },
  { kind: 'support', symbol: '🤍', label: 'Support' },
];

type Props = {
  comments: readonly LiveComment[];
  disabled?: boolean;
  onComment: (body: string) => Promise<unknown>;
  onReaction: (reaction: LiveReactionKind) => Promise<unknown>;
};

export const LiveConversationPanel = memo(function LiveConversationPanel({
  comments,
  disabled,
  onComment,
  onReaction,
}: Props) {
  const [draft, setDraft] = useState('');
  const visible = useMemo(() => [...comments].slice(-30), [comments]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || disabled) return;
    setDraft('');
    const sent = await onComment(body);
    if (sent === false) setDraft((current) => current || body);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Sparkles size={14} color="#D7B56D" />
        <Text style={styles.heading}>ROOM PULSE</Text>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Text style={styles.comment}>
            <Text style={styles.name}>{item.fullName || 'Member'}  </Text>
            {item.body}
          </Text>
        )}
        ListEmptyComponent={<Text style={styles.empty}>The first thoughtful note can be yours.</Text>}
      />
      <View style={styles.reactions}>
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
      </View>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!disabled}
          maxLength={500}
          placeholder="Add something thoughtful…"
          placeholderTextColor="#8FA19D"
          style={styles.input}
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          disabled={disabled || !draft.trim()}
          onPress={() => void submit()}
          style={[styles.send, (disabled || !draft.trim()) && styles.sendDisabled]}
        >
          <Send size={17} color="#0D2422" />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 220, backgroundColor: '#0D1D1B', paddingHorizontal: 16, paddingTop: 14 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heading: { color: '#D7B56D', fontSize: 10, letterSpacing: 1.8, fontFamily: 'Manrope_700Bold' },
  list: { flex: 1, minHeight: 72 },
  listContent: { paddingVertical: 10, gap: 8 },
  comment: { color: '#DDE9E5', fontSize: 13, lineHeight: 19, fontFamily: 'Manrope_400Regular' },
  name: { color: '#FFF7EB', fontFamily: 'Manrope_700Bold' },
  empty: { color: '#8FA19D', fontSize: 12, marginTop: 12, fontFamily: 'Manrope_500Medium' },
  reactions: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  reaction: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#172B28', borderWidth: 1, borderColor: '#29423D' },
  reactionText: { color: '#FFF7EB', fontSize: 18 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 10 },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 17, color: '#FFF7EB', backgroundColor: '#172724', borderWidth: 1, borderColor: '#30423F', fontFamily: 'Manrope_500Medium' },
  send: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7B56D' },
  sendDisabled: { opacity: 0.45 },
});
