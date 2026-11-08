import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  fetchSavedCircleMediaIds,
  fetchCircleMediaReactionSummaries,
  toggleCircleMediaReaction,
  toggleSavedCircleMedia,
} from '@/lib/circles/pulse/circle-pulse-service';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Filter = 'all' | 'video' | 'image' | 'saved';
type Reaction = 'love' | 'spark' | 'laugh' | 'useful';

type Props = {
  circleId: string;
  viewerProfileId?: string | null;
  items: CirclePulseItem[];
  renderItem: (item: CirclePulseItem) => ReactNode;
  onSubmitMedia?: () => void;
};

const REACTIONS: { value: Reaction; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }[] = [
  { value: 'love', icon: 'heart-outline', label: 'Love' },
  { value: 'spark', icon: 'creation-outline', label: 'Spark' },
  { value: 'laugh', icon: 'emoticon-happy-outline', label: 'Laugh' },
  { value: 'useful', icon: 'lightbulb-outline', label: 'Useful' },
];

export default function CircleMediaHubSection({ circleId, viewerProfileId, items, renderItem, onSubmitMedia }: Props) {
  const palette = useCirclePulsePalette();
  const [filter, setFilter] = useState<Filter>('all');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<Record<string, Reaction | null>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, Partial<Record<Reaction, number>>>>({});

  useEffect(() => {
    let active = true;
    if (!circleId || !viewerProfileId) return;
    void Promise.all([
      fetchSavedCircleMediaIds(circleId, viewerProfileId),
      fetchCircleMediaReactionSummaries(circleId, viewerProfileId),
    ])
      .then(([ids, summaries]) => {
        if (!active) return;
        setSavedIds(ids);
        const nextReactions: Record<string, Reaction | null> = {};
        const nextCounts: Record<string, Partial<Record<Reaction, number>>> = {};
        summaries.forEach((summary) => {
          nextCounts[summary.pulse_item_id] = {
            ...(nextCounts[summary.pulse_item_id] ?? {}),
            [summary.reaction]: Number(summary.reaction_count) || 0,
          };
          if (summary.my_reaction) nextReactions[summary.pulse_item_id] = summary.reaction;
        });
        setReactions(nextReactions);
        setReactionCounts(nextCounts);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [circleId, viewerProfileId]);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (filter === 'saved') return savedIds.has(item.id);
    if (filter === 'video') return item.mediaType === 'video';
    if (filter === 'image') return item.mediaType !== 'video';
    return true;
  }), [filter, items, savedIds]);

  const toggleSaved = async (itemId: string) => {
    if (!viewerProfileId) return;
    try {
      const saved = await toggleSavedCircleMedia(itemId, viewerProfileId);
      setSavedIds((current) => {
        const next = new Set(current);
        if (saved) next.add(itemId); else next.delete(itemId);
        return next;
      });
    } catch {}
  };

  const react = async (itemId: string, reaction: Reaction) => {
    if (!viewerProfileId) return;
    try {
      const previous = reactions[itemId] ?? null;
      const selected = await toggleCircleMediaReaction(itemId, viewerProfileId, reaction) as Reaction | null;
      setReactions((current) => ({ ...current, [itemId]: selected }));
      setReactionCounts((current) => {
        const itemCounts = { ...(current[itemId] ?? {}) };
        if (previous) itemCounts[previous] = Math.max(0, (itemCounts[previous] ?? 1) - 1);
        if (selected) itemCounts[selected] = (itemCounts[selected] ?? 0) + 1;
        return { ...current, [itemId]: itemCounts };
      });
    } catch {}
  };

  return (
    <View style={styles.root}>
      <View style={styles.filters} accessibilityRole="tablist">
        {(['all', 'video', 'image', 'saved'] as Filter[]).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === value }}
            style={[styles.filter, { borderColor: filter === value ? palette.teal : palette.outline, backgroundColor: filter === value ? palette.tealSoft : palette.surfaceMuted }]}
            onPress={() => setFilter(value)}
          >
            <Text style={[styles.filterText, { color: filter === value ? palette.teal : palette.textSoft }]}>{value === 'all' ? 'All' : value === 'video' ? 'Videos' : value === 'image' ? 'Photos' : 'Saved'}</Text>
          </Pressable>
        ))}
      </View>
      {filteredItems.length === 0 ? (
        <View style={[styles.empty, { borderColor: palette.outline }]}>
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Nothing in this view yet.</Text>
        </View>
      ) : filteredItems.map((item) => (
        <View key={item.id} style={styles.item}>
          {renderItem(item)}
          <View style={styles.actions}>
            <Pressable accessibilityLabel={savedIds.has(item.id) ? 'Remove from saved media' : 'Save media'} style={[styles.action, { borderColor: palette.outline }]} onPress={() => void toggleSaved(item.id)}>
              <MaterialCommunityIcons name={savedIds.has(item.id) ? 'bookmark' : 'bookmark-outline'} size={17} color={palette.teal} />
              <Text style={[styles.actionText, { color: palette.textSoft }]}>{savedIds.has(item.id) ? 'Saved' : 'Save'}</Text>
            </Pressable>
            {REACTIONS.map((entry) => (
              <Pressable key={entry.value} accessibilityLabel={`React ${entry.label}`} style={[styles.reaction, { borderColor: reactions[item.id] === entry.value ? palette.purple : palette.outline }]} onPress={() => void react(item.id, entry.value)}>
                <MaterialCommunityIcons name={entry.icon} size={16} color={reactions[item.id] === entry.value ? palette.purple : palette.textMuted} />
                {(reactionCounts[item.id]?.[entry.value] ?? 0) > 0 ? <Text style={[styles.reactionCount, { color: palette.textMuted }]}>{reactionCounts[item.id]?.[entry.value]}</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {onSubmitMedia ? (
        <Pressable style={[styles.submit, { borderColor: palette.tealBorder, backgroundColor: palette.tealSoft }]} onPress={onSubmitMedia}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={18} color={palette.teal} />
          <View style={styles.submitCopy}>
            <Text style={[styles.submitTitle, { color: palette.text }]}>Share with the Circle</Text>
            <Text style={[styles.submitText, { color: palette.textMuted }]}>Submit media privately for host review.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={palette.teal} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, borderWidth: 1 },
  filterText: { fontSize: 11, fontWeight: '900' },
  item: { gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3 },
  action: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1 },
  actionText: { fontSize: 10, fontWeight: '900' },
  reaction: { minWidth: 34, height: 34, paddingHorizontal: 8, gap: 3, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  reactionCount: { fontSize: 9, fontWeight: '900' },
  empty: { minHeight: 88, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 18 },
  emptyText: { fontSize: 12, fontWeight: '700' },
  submit: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  submitCopy: { flex: 1, gap: 2 },
  submitTitle: { fontSize: 12, fontWeight: '900' },
  submitText: { fontSize: 10, lineHeight: 14 },
});
