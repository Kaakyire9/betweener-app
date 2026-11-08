import React, { memo, useContext } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { withAlpha } from '@/lib/chat/ui/color-utils';
import { ChatBackground } from '@/components/chat/ChatBackground';
import type { JournalEntry } from './journal-types';
import { formatJournalDuration, journalDuration, journalLabel, journalNeedsAttention, journalTime } from './journal-presentation';
import { JournalPulse, JournalPulseValue } from './JournalPulse';

export function useJournalTheme() { const dark = useColorScheme() === 'dark'; return { dark, colors: Colors[dark ? 'dark' : 'light'] }; }
export function JournalCanvas({ children }: { children: React.ReactNode }) {
  const { colors, dark } = useJournalTheme();
  return <View style={{ flex: 1, backgroundColor: colors.background }}><ChatBackground tone={dark ? 'dark' : 'light'} intensity="subtle" />{children}</View>;
}
export function JournalAvatar({ entry, size = 54 }: { entry: JournalEntry; size?: number }) {
  const { colors } = useJournalTheme(), pulse = useContext(JournalPulseValue);
  return <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, padding: 2, borderWidth: 1,
    borderColor: withAlpha(colors.accent, .44), backgroundColor: withAlpha(colors.tint, .08) }}>
    {entry.peer.avatar ? <Image source={{ uri: entry.peer.avatar }} contentFit="cover" cachePolicy="memory-disk" transition={0} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
      : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.tint, fontFamily: 'Manrope_600SemiBold', fontSize: size * .32 }}>{entry.peer.name.slice(0, 1).toLocaleUpperCase()}</Text></View>}
    {pulse && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: size / 2 + 2, borderWidth: 2,
      borderColor: colors.secondary, opacity: pulse.interpolate({ inputRange: [0, .45, 1], outputRange: [0, .75, 0] }) }} />}
  </View>;
}
export function JournalIconButton({ icon, label, onPress, disabled = false, selected = false }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress(): void; disabled?: boolean; selected?: boolean;
}) {
  const { colors } = useJournalTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', opacity: disabled ? .35 : pressed ? .6 : 1,
      borderWidth: 1, borderColor: withAlpha(colors.tint, selected ? .55 : .16), backgroundColor: withAlpha(colors.tint, selected ? .15 : .05) })}>
    <Ionicons name={icon} size={21} color={colors.tint} accessible={false} />
  </Pressable>;
}
export const JournalRow = memo(function JournalRow({ entry, fresh = false, canRedial = false, onDetails, onRedial }: {
  entry: JournalEntry; fresh?: boolean; canRedial?: boolean; onDetails(entry: JournalEntry): void; onRedial(entry: JournalEntry): void;
}) {
  const { colors } = useJournalTheme(), duration = journalDuration(entry), attention = journalNeedsAttention(entry);
  const label = journalLabel(entry), direction = entry.direction === 'incoming' ? 'Incoming' : 'Outgoing';
  return <JournalPulse id={entry.call.id} fresh={fresh}><View style={[styles.row, { backgroundColor: withAlpha(colors.backgroundSubtle, .90), borderColor: withAlpha(colors.outline, .8) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${entry.peer.name}. ${label}. ${direction}. ${journalTime(entry.call.created_at)}${duration !== null ? `. ${formatJournalDuration(duration)}` : ''}. View call details`}
      onPress={() => onDetails(entry)} style={styles.rowMain}>
      <JournalAvatar entry={entry} />
      <View style={styles.rowCopy}>
        <Text style={[styles.name, { color: colors.text }]}>{entry.peer.name}</Text>
        <View style={styles.line}><Ionicons name={entry.direction === 'incoming' ? 'arrow-down-outline' : 'arrow-up-outline'} size={13} color={attention ? colors.danger : colors.tint} accessible={false} />
          <Text style={[styles.outcome, { color: attention ? colors.danger : colors.textMuted }]}>{label}</Text></View>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{entry.call.media === 'video' ? 'Video' : 'Voice'} · {journalTime(entry.call.created_at)}{duration !== null ? ` · ${formatJournalDuration(duration)}` : ''}</Text>
      </View>
    </Pressable>
    {canRedial && <JournalIconButton icon={entry.call.media === 'video' ? 'videocam-outline' : 'call-outline'} label={`Call ${entry.peer.name} again by ${entry.call.media === 'video' ? 'video' : 'voice'}`} onPress={() => onRedial(entry)} />}
    {!canRedial && <Ionicons name="chevron-forward" color={colors.textMuted} size={16} accessible={false} />}
  </View></JournalPulse>;
});
export function JournalEmpty({ filter, search, unavailable = false }: { filter: string; search: string; unavailable?: boolean }) {
  const { colors } = useJournalTheme();
  const title = search ? 'No connections found' : filter === 'missed' ? 'All caught up' : filter === 'video' ? 'No video calls yet' : filter === 'voice' ? 'No voice calls yet' : 'Your conversations will find a home here.';
  return <View style={styles.empty}><View style={[styles.emptyHalo, { borderColor: withAlpha(colors.accent, .25), backgroundColor: withAlpha(colors.tint, .07) }]}>
    <Ionicons name="heart-outline" size={35} color={colors.tint} accessible={false} /></View>
    <Text accessibilityRole="header" style={[styles.emptyTitle, { color: colors.text }]}>{unavailable ? 'History is unavailable' : title}</Text>
    <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>{unavailable ? 'Reconnect and refresh to see your connections.' : search ? 'Try another name or adjust your filters.' : filter === 'missed' ? 'You have no missed calls in this view.' : 'When you connect through a voice or video call, your history will appear here.'}</Text>
  </View>;
}
export const journalStyles = StyleSheet.create({
  fill: { flex: 1 }, padded: { paddingHorizontal: 22 }, eyebrow: { fontFamily: 'Manrope_600SemiBold', fontSize: 10, letterSpacing: 2.4 },
  title: { fontFamily: Fonts.serif, fontSize: 36, lineHeight: 44 }, body: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 21 },
});
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 23, paddingRight: 12, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: 20, marginBottom: 10, minHeight: 102 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 }, rowCopy: { flex: 1, gap: 5 },
  name: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, lineHeight: 22 }, outcome: { fontSize: 12, lineHeight: 18, flexShrink: 1 }, line: { flexDirection: 'row', alignItems: 'center', gap: 5 }, meta: { fontSize: 11 },
  empty: { alignItems: 'center', padding: 30, paddingVertical: 54, gap: 18 }, emptyHalo: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { textAlign: 'center', fontFamily: Fonts.serif, fontSize: 26, lineHeight: 33 }, emptyCopy: { textAlign: 'center', fontSize: 14, lineHeight: 23, maxWidth: 310 },
});
