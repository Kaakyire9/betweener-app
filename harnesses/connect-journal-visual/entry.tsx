// Isolated web-only presentation fixture. No Auth, Supabase, calling SDK or device capture.
import React, { useMemo, useState } from 'react';
import { AppRegistry, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { JournalScreen } from '../../features/connect/journal/JournalScreen';
import { JournalDetails } from '../../features/connect/journal/JournalDetails';
import { CallTimelineCard } from '../../features/connect/journal/CallTimelineCard';
import { JournalAvatar, JournalCanvas, useJournalTheme } from '../../features/connect/journal/JournalPrimitives';
import { journalOutcome } from '../../features/connect/journal/journal-presentation';
import type { JournalEntry, JournalQuery } from '../../features/connect/journal/journal-types';
const id = (n: number) => `a0550000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function examples(): JournalEntry[] {
  return [
    { name: 'Dufie', media: 'voice', state: 'ENDED', direction: 'outgoing', ago: 3600, duration: 744 },
    { name: 'Ama Mensah', media: 'video', state: 'MISSED', direction: 'incoming', ago: 6000, duration: null },
    { name: 'Kwame', media: 'video', state: 'ENDED', direction: 'incoming', ago: 9000, duration: 191 },
    { name: 'Dufie', media: 'voice', state: 'DECLINED', direction: 'outgoing', ago: 90000, duration: null },
    { name: 'Nana', media: 'voice', state: 'FAILED', direction: 'outgoing', ago: 102000, duration: 47 },
    { name: 'Alexandria Aduboffour', media: 'voice', state: 'CANCELLED', direction: 'outgoing', ago: 190000, duration: null },
  ].map((sample, index) => {
    const created = Date.now() - sample.ago * 1000;
    const peerIndex = sample.name === 'Dufie' ? 10 : index + 10;
    return { call: { id: id(index + 100), caller_profile_id: id(sample.direction === 'outgoing' ? 1 : peerIndex), recipient_profile_id: id(sample.direction === 'outgoing' ? peerIndex : 1),
      media: sample.media as 'voice' | 'video', authorization: 'matched', state: sample.state as JournalEntry['call']['state'], version: 6,
      created_at: new Date(created).toISOString(), accepted_at: sample.duration !== null ? new Date(created + 2000).toISOString() : null,
      connected_at: sample.duration !== null ? new Date(created + 4000).toISOString() : null,
      ended_at: new Date(created + (sample.duration !== null ? sample.duration + 4 : 45) * 1000).toISOString(), reason: null, duration_seconds: sample.duration, deadline: null },
      peer: { userId: id(peerIndex + 10), profileId: id(peerIndex), name: sample.name, avatar: `https://connect-journal-preview.invalid/${sample.name === 'Kwame' ? 'man' : 'woman'}.png`, available: true, blocked: false, chatVisible: true },
      direction: sample.direction as 'incoming' | 'outgoing', cleanup: 'acknowledged', redialAllowed: true };
  });
}
function Preview() {
  const params = new URLSearchParams(globalThis.location.search), { colors } = useJournalTheme();
  const [mode, setMode] = useState(params.get('view') ?? 'journal'), all = useMemo(examples, []);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState<NonNullable<JournalQuery['filter']>>('all');
  const [direction, setDirection] = useState<NonNullable<JournalQuery['direction']>>('all'), [from, setFrom] = useState<string | undefined>();
  const [outcome, setOutcome] = useState<NonNullable<JournalQuery['outcome']>>('all'), [selected, setSelected] = useState(all[0]);
  const missedDufie = { ...all[1], peer: all[0].peer, call: { ...all[1].call, caller_profile_id: all[0].peer.profileId } };
  const rows = mode === 'empty' ? [] : all.filter(row => row.peer.name.toLowerCase().includes(search.toLowerCase())
    && (filter === 'all' || row.call.media === filter || (filter === 'missed' && journalOutcome(row) === 'missed'))
    && (direction === 'all' || row.direction === direction) && (outcome === 'all' || journalOutcome(row) === outcome) && (!from || row.call.created_at >= from));
  const noop = () => {};
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: innerWidth, height: innerHeight }, insets: { top: 20, bottom: 16, left: 0, right: 0 } }}>
    <View style={{ flex: 1 }}>
      {mode === 'details' ? <JournalDetails entry={selected} fresh canRedial onClose={() => setMode('journal')} onRedial={noop} onChat={() => setMode('chat')} onProfile={noop} onBlock={noop} onReport={noop} onRetry={noop} />
        : mode === 'chat' ? <JournalCanvas><SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.outline }}>
            <JournalAvatar entry={all[0]} size={44} /><View><Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Manrope_600SemiBold' }}>Dufie</Text><Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>Private conversation</Text></View>
          </View><ScrollView contentContainerStyle={{ padding: 18, gap: 18 }}>
            <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 11 }}>Today</Text>
            <View style={{ alignSelf: 'flex-start', maxWidth: '78%', padding: 14, borderRadius: 21, backgroundColor: colors.backgroundSubtle }}><Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>How did your afternoon go?</Text></View>
            <View style={{ alignSelf: 'flex-end', maxWidth: '78%', padding: 14, borderRadius: 21, backgroundColor: colors.tint }}><Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 22 }}>Much better now. Let’s catch up?</Text></View>
            <CallTimelineCard entry={all[0]} canRedial onRedial={noop} onDetails={() => { setSelected(all[0]); setMode('details'); }} />
            <View style={{ alignSelf: 'flex-start', maxWidth: '78%', padding: 14, borderRadius: 21, backgroundColor: colors.backgroundSubtle }}><Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>Thanks for the conversation 😊</Text></View>
            <CallTimelineCard entry={missedDufie} canRedial onRedial={noop} onDetails={() => { setSelected(missedDufie); setMode('details'); }} />
          </ScrollView><View style={{ margin: 18, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.backgroundSubtle }}><Text style={{ color: colors.textMuted }}>Message…</Text></View>
        </SafeAreaView></JournalCanvas>
          : <JournalScreen rows={rows} busy={false} error={null} hasMore={false} search={search} filter={filter} direction={direction} outcome={outcome} from={from} callingAvailable
            onSearch={setSearch} onFilter={setFilter} onDirection={setDirection} onDateRange={setFrom} onOutcome={setOutcome}
            onRefresh={noop} onMore={noop} onClose={() => setMode('chat')} onDetails={entry => { setSelected(entry); setMode('details'); }} onRedial={noop} canRedial={entry => entry.redialAllowed} />}
      <Pressable accessibilityLabel="Presentation fixture only" onPress={noop} style={{ position: 'absolute', bottom: 0, width: '100%', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.textMuted, fontSize: 8, lineHeight: 15 }}>LOCAL PRESENTATION FIXTURE · NO CALLS OR MESSAGES SENT</Text>
      </Pressable>
    </View>
  </SafeAreaProvider>;
}
if (__DEV__ && Platform.OS === 'web') {
  AppRegistry.registerComponent('ConnectJournalVisual', () => Preview);
  AppRegistry.runApplication('ConnectJournalVisual', { rootTag: document.getElementById('root') });
}
