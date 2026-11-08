import React, { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '@/lib/chat/ui/color-utils';
import type { JournalEntry } from './journal-types';
import { formatJournalDuration, journalDay, journalDuration, journalLabel, journalNeedsAttention, journalOutcome, journalTime } from './journal-presentation';
import { useJournalTheme } from './JournalPrimitives';
import { JournalPulse } from './JournalPulse';

export const CallTimelineCard = memo(function CallTimelineCard({ entry, fresh = false, canRedial = false, busy = false, error, onRedial, onDetails }: {
  entry: JournalEntry; fresh?: boolean; canRedial?: boolean; busy?: boolean; error?: string | null; onRedial(): void; onDetails(): void;
}) {
  const { colors } = useJournalTheme();
  const duration = journalDuration(entry), attention = journalNeedsAttention(entry), outcome = journalOutcome(entry);
  return <JournalPulse id={`chat:${entry.call.id}`} fresh={fresh}><View style={[styles.card, { backgroundColor: withAlpha(colors.backgroundSubtle, .94), borderColor: withAlpha(attention ? colors.danger : colors.tint, .22) }]}>
    <View style={styles.header}><View style={[styles.icon, { backgroundColor: withAlpha(attention ? colors.danger : colors.tint, .09) }]}>
      <Ionicons name={entry.call.media === 'video' ? 'videocam-outline' : 'call-outline'} size={22} color={attention ? colors.danger : colors.tint} accessible={false} /></View>
      <View style={styles.copy}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{journalLabel(entry)}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{entry.direction === 'incoming' ? 'Incoming' : 'Outgoing'} {entry.call.media} · {journalDay(entry.call.created_at)} · {journalTime(entry.call.created_at)}{duration !== null ? ` · ${formatJournalDuration(duration)}` : ''}</Text></View>
    </View>
    <View style={[styles.actions, { borderTopColor: withAlpha(colors.outline, .6) }]}>
      {canRedial && entry.redialAllowed && entry.peer.available && !entry.peer.blocked && <Pressable accessibilityRole="button" accessibilityLabel={`${outcome === 'missed' ? 'Return' : 'Repeat'} ${entry.call.media} call with ${entry.peer.name}`} disabled={busy} onPress={onRedial} style={styles.action}>
        <Text style={[styles.actionLabel, { color: colors.tint }]}>{outcome === 'missed' ? 'Return call' : 'Call again'}</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Details of ${journalLabel(entry).toLowerCase()}`} onPress={onDetails} style={styles.action}>
        <Text style={[styles.actionLabel, { color: colors.textMuted }]}>Details</Text><Ionicons name="chevron-forward" size={13} color={colors.textMuted} accessible={false} /></Pressable>
    </View>
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text>}
  </View></JournalPulse>;
});
const styles = StyleSheet.create({
  card: { width: '88%', maxWidth: 360, alignSelf: 'center', marginVertical: 13, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 11 }, icon: { height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 5 }, title: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, lineHeight: 20 }, meta: { fontSize: 11, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', borderTopWidth: StyleSheet.hairlineWidth }, action: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12 }, error: { fontSize: 12, lineHeight: 19, paddingBottom: 12 },
});
