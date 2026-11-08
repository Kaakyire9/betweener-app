import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '@/lib/chat/ui/color-utils';
import { JournalAvatar, JournalCanvas, JournalIconButton, journalStyles, useJournalTheme } from './JournalPrimitives';
import { formatJournalDuration, journalDuration, journalLabel, journalTime, journalDay } from './journal-presentation';
import type { JournalEntry } from './journal-types';
import { useJournalReducedMotion } from './JournalPulse';

export interface JournalDetailsProps {
  entry: JournalEntry | null; busy?: boolean; error?: string | null; fresh?: boolean;
  canRedial?: boolean; activeOwned?: boolean; onClose(): void; onRedial(): void; onChat(): void; onProfile(): void;
  onBlock(): void; onReport(): void; onRetry(): void;
}
export function JournalDetails(props: JournalDetailsProps) {
  const { colors } = useJournalTheme(), { entry } = props;
  const duration = entry ? journalDuration(entry) : null;
  const metadata = entry ? [
    ['Direction', entry.direction === 'incoming' ? 'Incoming' : 'Outgoing'],
    ['Started', `${journalDay(entry.call.created_at)} · ${journalTime(entry.call.created_at)}`],
    ...(entry.call.accepted_at ? [['Answered', journalTime(entry.call.accepted_at)]] : []),
    ...(entry.call.ended_at ? [['Ended', journalTime(entry.call.ended_at)]] : []),
    ...(duration !== null ? [['Connected duration', formatJournalDuration(duration)]] : []),
  ] : [];
  const action = (label: string, icon: React.ComponentProps<typeof Ionicons>['name'], onPress: () => void, disabled = false, danger = false) => <Pressable key={label}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.action, { borderColor: withAlpha(danger ? colors.danger : colors.tint, .18), backgroundColor: withAlpha(danger ? colors.danger : colors.tint, .06), opacity: disabled ? .4 : 1 }]}>
    <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.tint} accessible={false} /><Text style={[styles.actionText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
    <Ionicons name="chevron-forward" color={colors.textMuted} size={16} accessible={false} />
  </Pressable>;
  return <JournalCanvas><SafeAreaView style={journalStyles.fill}><View style={styles.top}>
    <Text style={[journalStyles.eyebrow, { color: colors.tint }]}>CONNECTION DETAILS</Text><JournalIconButton label="Close call details" icon="close-outline" onPress={props.onClose} />
  </View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {entry ? <>
      <View style={styles.identity}><JournalAvatar entry={entry} size={90} /><Text accessibilityRole="header" style={[journalStyles.title, { color: colors.text, textAlign: 'center' }]}>{entry.peer.name}</Text>
        <View style={styles.status}><Ionicons name={entry.call.media === 'video' ? 'videocam-outline' : 'call-outline'} size={18} color={colors.tint} accessible={false} />
          <Text style={[styles.statusText, { color: colors.textMuted }]}>{journalLabel(entry)}</Text></View>
      </View>
      <View style={[styles.metadata, { backgroundColor: withAlpha(colors.backgroundSubtle, .94), borderColor: colors.outline }]}>
        {metadata.map(([label, value]) => <View key={label} style={styles.detailRow}><Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text></View>)}
      </View>
      {entry.cleanup === 'pending' && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.textMuted }]}>Finalising call details… Your conversation can continue when the call screen is safe to close.</Text>}
      {entry.peer.blocked && <Text style={[styles.note, { color: colors.danger }]}>Calling and chat are unavailable for this blocked connection.</Text>}
      {props.canRedial && action('Call again', entry.call.media === 'video' ? 'videocam-outline' : 'call-outline', props.onRedial, !props.fresh || props.busy)}
      {entry.peer.available && !entry.peer.blocked && action('Send message', 'chatbubble-ellipses-outline', props.onChat, !props.fresh || props.busy)}
      {entry.peer.available && action('View profile', 'person-outline', props.onProfile, !props.fresh || props.busy)}
      <Text style={[journalStyles.eyebrow, { color: colors.textMuted, marginTop: 15 }]}>YOUR PEACE OF MIND</Text>
      {!entry.peer.blocked && action(props.activeOwned ? 'End Call & Block' : 'Block user', 'shield-outline', props.onBlock, !props.fresh || props.busy, true)}
      {action('Report a concern', 'flag-outline', props.onReport, !props.fresh || props.busy)}
    </> : <Text style={[journalStyles.body, { color: colors.textMuted }]}>{props.busy ? 'Opening your connection…' : 'This call record is unavailable.'}</Text>}
    {props.busy && <ActivityIndicator color={colors.tint} accessibilityLabel="Refreshing call details" />}
    {!!props.error && <View style={{ gap: 6 }}><Text accessibilityRole="alert" style={[styles.note, { color: colors.danger }]}>{props.error}</Text>
      {action('Refresh details', 'refresh-outline', props.onRetry, props.busy)}</View>}
  </ScrollView></SafeAreaView></JournalCanvas>;
}
export function JournalDetailsModal({ visible, ...props }: JournalDetailsProps & { visible: boolean }) {
  const reduced = useJournalReducedMotion();
  return <Modal visible={visible} animationType={reduced ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={props.onClose}><JournalDetails {...props} /></Modal>;
}
const styles = StyleSheet.create({
  top: { paddingHorizontal: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  content: { padding: 24, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 44 }, identity: { alignItems: 'center', gap: 17, paddingBottom: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 }, statusText: { fontSize: 14, lineHeight: 22, flexShrink: 1 },
  metadata: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 19, gap: 20, marginBottom: 10 }, detailRow: { flexDirection: 'row', gap: 15, flexWrap: 'wrap', justifyContent: 'space-between' },
  detailLabel: { fontSize: 13, lineHeight: 21 }, detailValue: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, lineHeight: 21, flexShrink: 1 },
  action: { minHeight: 56, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, paddingHorizontal: 17, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, actionText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, lineHeight: 21, flex: 1 },
  note: { fontSize: 12, lineHeight: 21 },
});
