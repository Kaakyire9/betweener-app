import { useCallback, useEffect, useState } from 'react';

import {
  getOfflineMutationQueueSnapshot,
  retryFailedOfflineMutations,
  subscribeToOfflineMutationEvents,
  type FailedOfflineMutation,
  type OfflineMutation,
} from '@/lib/offline/mutation-queue';

const isPremiumMutation = (mutation: OfflineMutation | FailedOfflineMutation) =>
  mutation.kind === 'profile_gift_send' ||
  mutation.kind === 'profile_gift_reveal' ||
  mutation.kind === 'profile_gift_archive' ||
  mutation.kind === 'profile_boost_create';

type PremiumOfflineQueueStatus = {
  visible: boolean;
  pendingCount: number;
  failedCount: number;
  hasPending: boolean;
  hasFailed: boolean;
  title: string;
  message: string;
  refresh: () => Promise<void>;
  retryFailed: () => Promise<number>;
};

const EMPTY_STATE = {
  visible: false,
  pendingCount: 0,
  failedCount: 0,
  hasPending: false,
  hasFailed: false,
  title: '',
  message: '',
};

export function usePremiumOfflineQueueStatus(): PremiumOfflineQueueStatus {
  const [state, setState] = useState(EMPTY_STATE);

  const refresh = useCallback(async () => {
    const snapshot = await getOfflineMutationQueueSnapshot();
    const pendingCount = snapshot.pending.filter(isPremiumMutation).length;
    const failedCount = snapshot.failed.filter(isPremiumMutation).length;

    if (failedCount > 0) {
      setState({
        visible: true,
        pendingCount,
        failedCount,
        hasPending: pendingCount > 0,
        hasFailed: true,
        title: failedCount === 1 ? 'Premium action needs review' : 'Premium actions need review',
        message:
          failedCount === 1
            ? 'One saved gift or boost action did not finish syncing. Retry it when your connection is stable.'
            : `${failedCount} saved premium actions did not finish syncing. Retry them when your connection is stable.`,
      });
      return;
    }

    if (pendingCount > 0) {
      setState({
        visible: true,
        pendingCount,
        failedCount,
        hasPending: true,
        hasFailed: false,
        title: pendingCount === 1 ? 'Premium action is queued' : 'Premium actions are queued',
        message:
          pendingCount === 1
            ? 'One saved gift or boost action will sync automatically when your connection returns.'
            : `${pendingCount} saved premium actions will sync automatically when your connection returns.`,
      });
      return;
    }

    setState(EMPTY_STATE);
  }, []);

  const retryFailed = useCallback(async () => {
    return retryFailedOfflineMutations(isPremiumMutation);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeToOfflineMutationEvents(() => {
      void refresh();
    });
  }, [refresh]);

  return {
    ...state,
    refresh,
    retryFailed,
  };
}
