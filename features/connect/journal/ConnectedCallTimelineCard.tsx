import React from 'react';
import { useRouter } from 'expo-router';
import type { JournalEntry } from './journal-types';
import { CallTimelineCard } from './CallTimelineCard';
import { useJournalActions } from './use-journal-actions';
export function ConnectedCallTimelineCard({ entry, fresh }: { entry: JournalEntry; fresh?: boolean }) {
  const router = useRouter(), actions = useJournalActions();
  return <CallTimelineCard entry={entry} fresh={fresh} canRedial={actions.canRedial(entry)} busy={!!actions.busyId} error={actions.error}
    onRedial={() => { void actions.redial(entry); }} onDetails={() => router.push({ pathname: '/connect/history/[callId]', params: { callId: entry.call.id } })} />;
}
