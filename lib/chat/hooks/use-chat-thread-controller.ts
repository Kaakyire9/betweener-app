import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useChatThreadRealtimeController } from './use-chat-thread-realtime-controller';

type StartRealtimeSubscription = () => (() => void) | void;
type StartThreadLifecycle = () => (() => void) | void;

const useFocusedThreadLifecycle = (start?: StartThreadLifecycle) => {
  useFocusEffect(
    useCallback(() => start?.() ?? (() => {}), [start]),
  );
};

/**
 * The screen's single thread-orchestration boundary. Additional lifecycle
 * concerns are migrated here as their existing behavior is extracted.
 */
export const useChatThreadController = ({
  refreshThread,
  startMessageRealtime,
  startAncillaryRealtime,
  startFocusedHydration,
  startFocusedPresence,
  startSynchronization,
}: {
  refreshThread: () => Promise<void>;
  startMessageRealtime: StartRealtimeSubscription;
  startAncillaryRealtime: StartRealtimeSubscription;
  /** Runs focused, one-shot thread loading such as local hydration and remote refresh. */
  startFocusedHydration?: StartThreadLifecycle;
  /** Runs focus-scoped presence and typing transport for the active peer. */
  startFocusedPresence?: StartThreadLifecycle;
  /** Runs non-focus-scoped recovery such as outbox flushing and sync coordination. */
  startSynchronization?: StartThreadLifecycle;
}) => {
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useChatThreadRealtimeController({
    startMessages: startMessageRealtime,
    startAncillary: startAncillaryRealtime,
  });
  useFocusedThreadLifecycle(startFocusedHydration);
  useFocusedThreadLifecycle(startFocusedPresence);

  useEffect(() => startSynchronization?.() ?? undefined, [startSynchronization]);

  const refresh = useCallback(() => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const request = refreshThread().finally(() => {
      if (refreshInFlightRef.current === request) {
        refreshInFlightRef.current = null;
      }
    });
    refreshInFlightRef.current = request;
    return request;
  }, [refreshThread]);
  return useMemo(() => ({ refresh }), [refresh]);
};
