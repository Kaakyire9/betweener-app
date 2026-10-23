import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  getRelationshipGistReactionLabel,
  RELATIONSHIP_GIST_REACTIONS,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement';
import type { useRelationshipGistEngagement } from '@/features/relationship-gists/hooks/use-relationship-gist-engagement';

type Engagement = ReturnType<typeof useRelationshipGistEngagement>;

export function RelationshipGistEngagementPanel({
  engagement,
  colors,
}: {
  engagement: Engagement;
  colors: { text: string; textMuted: string; tint: string; backgroundSubtle: string; outline: string; danger: string };
}) {
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const styles = createStyles(colors);

  useEffect(() => {
    setDraft(engagement.snapshot?.reflection?.body ?? '');
  }, [engagement.snapshot?.editionId, engagement.snapshot?.reflection?.updatedAt]);

  if (!engagement.enabled) return null;

  const saveReflection = async () => {
    if (await engagement.saveReflection(draft)) setReflectionOpen(false);
  };
  const deleteReflection = async () => {
    if (await engagement.removeReflection()) {
      setDraft('');
      setReflectionOpen(false);
    }
  };

  return (
    <View style={styles.container} accessibilityLabel="Relationship Gist engagement">
      {engagement.reactionsEnabled ? (
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Your response</Text>
          <Text style={styles.title}>What stayed with you?</Text>
          <View style={styles.reactions} accessibilityRole="radiogroup">
            {RELATIONSHIP_GIST_REACTIONS.map((reaction) => {
              const selected = engagement.selectedReaction === reaction;
              const count = engagement.snapshot?.reactionCounts[reaction] ?? 0;
              const label = getRelationshipGistReactionLabel(reaction);
              return (
                <TouchableOpacity
                  key={reaction}
                  style={[styles.reaction, selected && styles.reactionSelected]}
                  onPress={() => void engagement.selectReaction(reaction)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${label}, ${count} reactions`}
                  accessibilityHint={selected ? 'Double tap to remove your reaction' : 'Double tap to choose this reaction'}
                >
                  <MaterialCommunityIcons
                    name={reaction === 'helpful' ? 'hand-heart-outline' : reaction === 'resonated' ? 'heart-pulse' : 'head-lightbulb-outline'}
                    size={18}
                    color={selected ? colors.tint : colors.textMuted}
                  />
                  <Text style={[styles.reactionLabel, selected && styles.reactionLabelSelected]}>{label}</Text>
                  <Text style={styles.count}>{count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.supporting}>Counts come from verified member responses. Your identity is never shown.</Text>
        </View>
      ) : null}

      {engagement.reflectionsEnabled ? (
        <View style={styles.section}>
          <View style={styles.reflectionHeader}>
            <View style={styles.reflectionCopy}>
              <Text style={styles.eyebrow}>Private reflection</Text>
              <Text style={styles.title}>Keep a note for yourself</Text>
            </View>
            <MaterialCommunityIcons name="lock-outline" size={19} color={colors.tint} />
          </View>
          <Text style={styles.supporting}>
            Only you can read this. It is not used for matching, Connection Compass, comments, or analytics.
          </Text>
          {reflectionOpen ? (
            <View style={styles.editor}>
              <TextInput
                value={draft}
                onChangeText={(value) => setDraft(value.slice(0, 2000))}
                style={styles.input}
                multiline
                maxLength={2000}
                placeholder="What do you want to remember?"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Private reflection"
                accessibilityHint="This text is visible only to you"
              />
              <Text style={styles.characterCount} accessibilityLiveRegion="polite">{draft.length}/2000</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.action, styles.primaryAction]}
                  onPress={() => void saveReflection()}
                  disabled={engagement.busy || draft.trim().length === 0}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: engagement.busy || draft.trim().length === 0 }}
                >
                  <Text style={styles.primaryActionText}>{engagement.busy ? 'Saving…' : 'Save privately'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.action}
                  onPress={() => setReflectionOpen(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionText}>Cancel</Text>
                </TouchableOpacity>
                {engagement.snapshot?.reflection ? (
                  <TouchableOpacity
                    style={styles.action}
                    onPress={() => void deleteReflection()}
                    disabled={engagement.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Delete private reflection"
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.reflectionButton}
              onPress={() => setReflectionOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={engagement.snapshot?.reflection ? 'Edit private reflection' : 'Add private reflection'}
            >
              <MaterialCommunityIcons name="notebook-edit-outline" size={18} color={colors.tint} />
              <Text style={styles.actionText}>
                {engagement.snapshot?.reflection ? 'Edit your reflection' : 'Add a private reflection'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {engagement.notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">{engagement.notice}</Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: {
  text: string;
  textMuted: string;
  tint: string;
  backgroundSubtle: string;
  outline: string;
  danger: string;
}) => StyleSheet.create({
  container: { gap: 14 },
  section: {
    gap: 10,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.backgroundSubtle,
  },
  eyebrow: { color: colors.tint, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reaction: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 10,
    borderRadius: 999, borderWidth: 1, borderColor: colors.outline,
  },
  reactionSelected: { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
  reactionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  reactionLabelSelected: { color: colors.text },
  count: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  supporting: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  reflectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  reflectionCopy: { flex: 1, gap: 4 },
  editor: { gap: 8 },
  input: {
    minHeight: 112, padding: 12, textAlignVertical: 'top', color: colors.text,
    borderWidth: 1, borderColor: colors.outline, borderRadius: 14,
  },
  characterCount: { color: colors.textMuted, fontSize: 11, textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  action: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.outline },
  primaryAction: { backgroundColor: colors.tint, borderColor: colors.tint },
  primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  deleteText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  reflectionButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  notice: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
});
