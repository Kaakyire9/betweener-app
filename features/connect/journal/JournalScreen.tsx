import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withAlpha } from '@/lib/chat/ui/color-utils';
import { JournalCanvas, JournalEmpty, JournalIconButton, JournalRow, journalStyles, useJournalTheme } from './JournalPrimitives';
import { journalSections, nearbyJournalGroups } from './journal-presentation';
import type { JournalEntry, JournalQuery } from './journal-types';
import { useJournalReducedMotion } from './JournalPulse';

export interface JournalScreenProps {
  rows: JournalEntry[]; busy: boolean; error: string | null; offline?: boolean; hasMore: boolean;
  search: string; filter: NonNullable<JournalQuery['filter']>; direction: NonNullable<JournalQuery['direction']>;
  from?: string; freshIds?: ReadonlySet<string>; callingAvailable?: boolean;
  outcome?: NonNullable<JournalQuery['outcome']>; onOutcome?(value: NonNullable<JournalQuery['outcome']>): void;
  onSearch(value: string): void; onFilter(value: NonNullable<JournalQuery['filter']>): void; onDirection(value: NonNullable<JournalQuery['direction']>): void;
  onDateRange(value?: string): void; onRefresh(): void; onMore(): void; onClose(): void;
  onDetails(entry: JournalEntry): void; onRedial(entry: JournalEntry): void; canRedial(entry: JournalEntry): boolean;
}
export function JournalScreen(props: JournalScreenProps) {
  const { colors } = useJournalTheme(), [searchOpen, setSearchOpen] = useState(!!props.search), [sheet, setSheet] = useState(false);
  const reduced = useJournalReducedMotion();
  const sections = useMemo(() => journalSections(props.rows), [props.rows]);
  const groups = useMemo(() => nearbyJournalGroups(props.rows), [props.rows]);
  const choice = (label: string, selected: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { backgroundColor: withAlpha(colors.tint, selected ? .15 : .03), borderColor: withAlpha(colors.tint, selected ? .5 : .12) }]}>
    <Text style={{ color: selected ? colors.tint : colors.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 13 }}>{label}</Text></Pressable>;
  const header = <View style={styles.header}>
    <View style={styles.top}><View style={{ flex: 1, gap: 8 }}><Text style={[journalStyles.eyebrow, { color: colors.tint }]}>BETWEENER CONNECT</Text>
      <Text accessibilityRole="header" style={[journalStyles.title, { color: colors.text }]}>Your Connections</Text><Text style={[journalStyles.body, { color: colors.textMuted }]}>Every call has a story.</Text></View>
      <JournalIconButton label={searchOpen ? 'Close call search' : 'Search call history'} icon={searchOpen ? 'close-outline' : 'search-outline'} selected={searchOpen} onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) props.onSearch(''); }} />
    </View>
    {searchOpen && <TextInput accessibilityLabel="Search connections by contact name" placeholder="Find a familiar name" placeholderTextColor={colors.textMuted}
      value={props.search} onChangeText={props.onSearch} returnKeyType="search" autoCapitalize="none" autoCorrect={false}
      style={[styles.search, { color: colors.text, backgroundColor: colors.backgroundSubtle, borderColor: colors.outline }]} />}
    <View style={styles.filters}>{(['all', 'missed', 'voice', 'video'] as const).map(filter => choice(filter[0].toUpperCase() + filter.slice(1), props.filter === filter, () => props.onFilter(filter)))}</View>
    <View style={styles.subheader}><Text style={[styles.sectionHint, { color: colors.textMuted }]}>CONNECTION JOURNAL</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Filter calls by direction, date and outcome" onPress={() => setSheet(true)} style={styles.filterLink}><Text style={[styles.filterText, { color: colors.tint }]}>Refine{props.direction !== 'all' || props.from || (props.outcome && props.outcome !== 'all') ? ' · On' : ''}</Text></Pressable></View>
    {props.offline && <Text accessibilityLiveRegion="polite" style={[journalStyles.body, { color: colors.textMuted }]}>Showing this session’s saved view. Reconnect to refresh.</Text>}
    {!props.callingAvailable && <Text style={[styles.availability, { color: colors.textMuted }]}>History is available independently of calling. New calls are currently unavailable.</Text>}
    {!!props.error && <View style={styles.error}><Text accessibilityRole="alert" style={[journalStyles.body, { color: colors.danger }]}>{props.error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry call history" onPress={props.onRefresh} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.tint }}>Try again</Text></Pressable></View>}
  </View>;
  return <JournalCanvas><SafeAreaView style={journalStyles.fill}>
    <SectionList testID="connection-journal-list" sections={sections} keyExtractor={row => row.call.id} stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
      ListHeaderComponent={header} initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={[styles.day, { color: colors.textMuted }]}>{section.title}</Text>}
      renderItem={({ item }) => <View>{groups.has(item.call.id) && <Text style={[styles.group, { color: colors.textMuted }]}>{groups.get(item.call.id)} nearby {item.call.media} calls · {item.peer.name}</Text>}
        <JournalRow entry={item} fresh={props.freshIds?.has(item.call.id)} canRedial={props.canRedial(item)} onDetails={props.onDetails} onRedial={props.onRedial} /></View>}
      ListEmptyComponent={props.busy ? <ActivityIndicator color={colors.tint} accessibilityLabel="Loading connections" style={{ padding: 50 }} /> : <JournalEmpty filter={props.filter} search={props.search} unavailable={!!props.error} />}
      onEndReached={() => { if (props.hasMore && !props.busy) props.onMore(); }} onEndReachedThreshold={.4}
      refreshing={props.busy && props.rows.length > 0} onRefresh={props.onRefresh}
      ListFooterComponent={<View style={styles.footer}>{props.busy && props.rows.length > 0 && <ActivityIndicator accessibilityLabel="Loading more calls" color={colors.tint} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Back from Connection Journal" onPress={props.onClose} style={styles.filterLink}><Text style={{ color: colors.textMuted }}>Back to conversations</Text></Pressable></View>}
    />
    <Modal visible={sheet} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setSheet(false)}><View style={[styles.scrim, { backgroundColor: withAlpha(colors.text, .25) }]}>
      <ScrollView accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.outline }]} contentContainerStyle={{ gap: 18 }}>
        <View style={styles.top}><Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>Your view</Text><JournalIconButton label="Close call filters" icon="close-outline" onPress={() => setSheet(false)} /></View>
        <Text style={[journalStyles.body, { color: colors.textMuted }]}>Direction</Text><View style={styles.filters}>{(['all', 'incoming', 'outgoing'] as const).map(direction => choice(direction[0].toUpperCase() + direction.slice(1), props.direction === direction, () => props.onDirection(direction)))}</View>
        <Text style={[journalStyles.body, { color: colors.textMuted }]}>Date range</Text><View style={styles.filters}>{[0, 7, 30].map(days => {
          const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - days);
          const from = days ? date.toISOString() : undefined;
          return choice(days ? `Last ${days} days` : 'Any time', props.from === from, () => props.onDateRange(from));
        })}</View>
        {!!props.onOutcome && <><Text style={[journalStyles.body, { color: colors.textMuted }]}>Outcome</Text><View style={styles.filters}>{(['all', 'ended', 'declined', 'cancelled', 'interrupted', 'failed'] as const).map(outcome => choice(outcome === 'all' ? 'All outcomes' : outcome === 'ended' ? 'Completed' : outcome[0].toUpperCase() + outcome.slice(1), (props.outcome ?? 'all') === outcome, () => props.onOutcome?.(outcome)))}</View></>}
        <Pressable accessibilityRole="button" accessibilityLabel="Apply call filters" onPress={() => setSheet(false)} style={[styles.done, { backgroundColor: colors.tint }]}><Text style={{ color: colors.background, fontFamily: 'Manrope_600SemiBold' }}>Done</Text></Pressable>
      </ScrollView>
    </View></Modal>
  </SafeAreaView></JournalCanvas>;
}
const styles = StyleSheet.create({
  header: { paddingHorizontal: 23, paddingTop: 22, gap: 20, paddingBottom: 10 }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  search: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 19, minHeight: 51, paddingHorizontal: 17, fontSize: 15 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { minHeight: 44, paddingHorizontal: 17, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', alignItems: 'center' },
  subheader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionHint: { fontSize: 9, letterSpacing: 2.1, fontFamily: 'Manrope_600SemiBold' },
  filterLink: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }, filterText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  day: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', paddingHorizontal: 25, paddingVertical: 13 }, availability: { fontSize: 11, lineHeight: 19 }, error: { gap: 1 },
  group: { paddingHorizontal: 26, paddingTop: 7, paddingBottom: 11, fontSize: 11, lineHeight: 19 },
  footer: { alignItems: 'center', gap: 12, padding: 28, paddingBottom: 40 }, scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: StyleSheet.hairlineWidth, padding: 25, paddingBottom: 40 }, sheetTitle: { fontSize: 22, fontFamily: 'Manrope_600SemiBold' },
  done: { minHeight: 52, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
