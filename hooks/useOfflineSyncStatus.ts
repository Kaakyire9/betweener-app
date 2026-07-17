import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  drainOfflineMutationQueue,
  getOfflineMutationQueueSnapshot,
  retryFailedOfflineMutations,
  subscribeToOfflineMutationQueue,
} from '@/lib/offline/mutation-queue';

type OfflineSyncStatus = {
  pendingCount: number;
  failedCount: number;
  readyCount: number;
  nextAttemptAt: number | null;
  loading: boolean;
  refresh: () => Promise<void>;
  retryNow: () => Promise<void>;
};

const EMPTY_STATUS = {
  pendingCount: 0,
  failedCount: 0,
  readyCount: 0,
  nextAttemptAt: null,
};

export function useOfflineSyncStatus(): OfflineSyncStatus {
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const snapshot = await getOfflineMutationQueueSnapshot();
    setStatus({
      pendingCount: snapshot.pendingCount,
      failedCount: snapshot.failedCount,
      readyCount: snapshot.readyCount,
      nextAttemptAt: snapshot.nextAttemptAt,
    });
    setLoading(false);
  }, []);

  const retryNow = useCallback(async () => {
    await retryFailedOfflineMutations();
    await drainOfflineMutationQueue();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const safeRefresh = async () => {
      if (cancelled) return;
      await refresh();
    };

    void safeRefresh();
    const unsubscribeQueue = subscribeToOfflineMutationQueue(() => {
      void safeRefresh();
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void safeRefresh();
      }
    });
    const interval = setInterval(() => {
      void safeRefresh();
    }, 30_000);

    return () => {
      cancelled = true;
      unsubscribeQueue();
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [refresh]);

  return {
    ...status,
    loading,
    refresh,
    retryNow,
  };
}
