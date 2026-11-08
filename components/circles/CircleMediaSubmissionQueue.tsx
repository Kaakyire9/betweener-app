import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  fetchCircleMediaSubmissionQueue,
  reviewCircleMediaSubmission,
  type CircleMediaSubmissionQueueItem,
} from '@/lib/circles/pulse/circle-pulse-service';
import { useCirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = { circleId: string; actorProfileId: string; onChanged: () => void | Promise<void> };

export default function CircleMediaSubmissionQueue({ circleId, actorProfileId, onChanged }: Props) {
  const palette = useCirclePulsePalette();
  const [items, setItems] = useState<CircleMediaSubmissionQueueItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems(await fetchCircleMediaSubmissionQueue(circleId)); } catch { setItems([]); }
  }, [circleId]);
  useEffect(() => { void load(); }, [load]);

  const review = async (item: CircleMediaSubmissionQueueItem, approve: boolean) => {
    setBusyId(item.submissionId);
    try {
      await reviewCircleMediaSubmission(item.submissionId, actorProfileId, approve);
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      Alert.alert('Media review', error instanceof Error ? error.message : 'Could not update this submission.');
    } finally { setBusyId(null); }
  };

  if (items.length === 0) return null;
  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <MaterialCommunityIcons name="inbox-arrow-down-outline" size={18} color={palette.purple} />
        <Text style={[styles.headingText, { color: palette.text }]}>Member submission queue</Text>
        <Text style={[styles.count, { color: palette.textMuted }]}>{items.length}</Text>
      </View>
      {items.map((item) => (
        <View key={item.submissionId} style={[styles.card, { borderColor: palette.outline, backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.eyebrow, { color: palette.teal }]}>{item.mediaType} · {item.submitterName}</Text>
          <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
          <Text style={[styles.status, { color: palette.textMuted }]}>{item.status === 'pending_moderation' ? 'Safety or subject approval pending' : 'Ready for host review'}</Text>
          {item.status === 'pending_host_review' ? (
            <View style={styles.actions}>
              <Pressable disabled={busyId === item.submissionId} style={[styles.secondary, { borderColor: palette.outline }]} onPress={() => void review(item, false)}><Text style={[styles.secondaryText, { color: palette.textSoft }]}>Decline</Text></Pressable>
              <Pressable disabled={busyId === item.submissionId} style={[styles.primary, { backgroundColor: palette.teal }]} onPress={() => void review(item, true)}><Text style={[styles.primaryText, { color: palette.tealInk }]}>Publish</Text></Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 9 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headingText: { flex: 1, fontSize: 12, fontWeight: '900' },
  count: { fontSize: 11, fontWeight: '900' },
  card: { gap: 5, padding: 11, borderWidth: 1, borderRadius: 14 },
  eyebrow: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { fontSize: 13, fontWeight: '900' },
  status: { fontSize: 10, lineHeight: 14 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7, marginTop: 3 },
  secondary: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, borderWidth: 1 },
  secondaryText: { fontSize: 10, fontWeight: '900' },
  primary: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 17 },
  primaryText: { fontSize: 10, fontWeight: '900' },
});
