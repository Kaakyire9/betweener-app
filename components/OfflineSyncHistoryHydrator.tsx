import { useEffect } from 'react';

import { appendOfflineSyncHistoryEntry } from '@/lib/offline/offline-sync-history';
import { subscribeToOfflineMutationEvents } from '@/lib/offline/mutation-queue';

export default function OfflineSyncHistoryHydrator() {
  useEffect(() => {
    return subscribeToOfflineMutationEvents((event) => {
      if (event.type !== 'completed' && event.type !== 'failed') return;
      void appendOfflineSyncHistoryEntry({
        eventType: event.type,
        mutation: event.mutation,
      });
    });
  }, []);

  return null;
}
