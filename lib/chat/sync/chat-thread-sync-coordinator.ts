import { ChatOutboxService } from "@/lib/chat/outbox/chat-outbox-service";
import { isLikelyNetworkError } from "@/lib/network";
import { AppState } from "react-native";

type FlushThreadOutboxAndRefreshArgs = {
  currentUserId: string;
  peerUserId: string;
  fetchMessages: () => Promise<void> | void;
  onUnexpectedError?: (error: unknown, phase: 'flush' | 'resume_flush') => void;
};

export const flushThreadOutboxAndRefresh = async ({
  currentUserId,
  peerUserId,
  fetchMessages,
  onUnexpectedError,
}: FlushThreadOutboxAndRefreshArgs) => {
  try {
    const result = await ChatOutboxService.flushPending(currentUserId);
    if (result.sentCount > 0 && result.touchedThreadIds.includes(peerUserId)) {
      await fetchMessages();
    }
  } catch (error) {
    if (!isLikelyNetworkError(error)) {
      onUnexpectedError?.(error, 'flush');
    }
    throw error;
  }
};

type StartThreadSyncCoordinatorArgs = {
  currentUserId: string;
  peerUserId: string;
  networkReady: boolean;
  fetchMessages: () => Promise<void> | void;
  refreshPeerStatus: () => Promise<void> | void;
  onReconnectRecovered?: () => void;
  onReconnectPending?: () => void;
  onUnexpectedError?: (error: unknown, phase: 'resume_flush') => void;
};

export const startThreadSyncCoordinator = ({
  currentUserId,
  peerUserId,
  networkReady,
  fetchMessages,
  refreshPeerStatus,
  onReconnectRecovered,
  onReconnectPending,
  onUnexpectedError,
}: StartThreadSyncCoordinatorArgs) => {
  let reconnectPending = false;
  let hasSubscribed = false;
  let stopped = false;
  let chatOutboxFlushInFlight: Promise<void> | null = null;

  const flushIfNeeded = () => {
    if (!networkReady || chatOutboxFlushInFlight) return;
    chatOutboxFlushInFlight = (async () => {
      try {
        const result = await ChatOutboxService.flushPending(currentUserId);
        if (result.sentCount > 0 && result.touchedThreadIds.includes(peerUserId)) {
          await fetchMessages();
        }
      } catch (error) {
        if (!isLikelyNetworkError(error)) {
          onUnexpectedError?.(error, 'resume_flush');
        }
      } finally {
        chatOutboxFlushInFlight = null;
      }
    })();
  };

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (stopped || state !== 'active') return;
    void refreshPeerStatus();
    void fetchMessages();
    flushIfNeeded();
  });

  return {
    handleRealtimeStatus: (status: string) => {
      if (stopped) return;
      if (status === 'SUBSCRIBED') {
        hasSubscribed = true;
        if (reconnectPending) {
          reconnectPending = false;
          // Focused hydration owns the initial catch-up query. Requery only
          // after a genuine realtime gap; otherwise the first SUBSCRIBED
          // event duplicates hydration and can race navigation teardown.
          void fetchMessages();
          onReconnectRecovered?.();
        }
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!hasSubscribed) return;
        reconnectPending = true;
        onReconnectPending?.();
      }
    },
    flushIfNeeded,
    stop: () => {
      stopped = true;
      appStateSubscription.remove();
    },
  };
};
