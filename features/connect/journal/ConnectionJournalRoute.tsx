import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useJournalFeed } from './use-journal-feed';
import { JournalScreen } from './JournalScreen';
import { JournalDetailHost } from './JournalDetailRoute';
import { useJournalActions } from './use-journal-actions';
import type { JournalQuery } from './journal-types';

export function ConnectionJournalRoute() {
  const router = useRouter(), [search, setSearch] = useState(''), [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<NonNullable<JournalQuery['filter']>>('all'), [direction, setDirection] = useState<NonNullable<JournalQuery['direction']>>('all');
  const [from, setFrom] = useState<string | undefined>(), [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<NonNullable<JournalQuery['outcome']>>('all');
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const feed = useJournalFeed({ search: debounced, filter, direction, outcome, from }), actions = useJournalActions();
  return <>
    <JournalScreen {...feed} error={actions.error ?? feed.error ?? (!feed.ready ? 'Your call history is not available in this session.' : null)}
      search={search} filter={filter} direction={direction} outcome={outcome} onOutcome={setOutcome} from={from} callingAvailable={actions.callingAvailable}
      onSearch={setSearch} onFilter={setFilter} onDirection={setDirection} onDateRange={setFrom}
      onRefresh={() => { void feed.refresh(); }} onMore={() => { void feed.more(); }} onClose={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/chat')}
      onDetails={entry => setSelected(entry.call.id)} onRedial={entry => { void actions.redial(entry); }} canRedial={actions.canRedial} />
    {selected && <JournalDetailHost key={selected} callId={selected} modal onClose={() => setSelected(null)} />}
  </>;
}
