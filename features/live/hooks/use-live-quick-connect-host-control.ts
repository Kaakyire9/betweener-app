import { useCallback, useEffect, useRef, useState } from 'react';

import {
  liveRepository,
  type LiveQuickConnectConcurrency,
  type LiveQuickConnectHostAction,
  type LiveQuickConnectHostSnapshot,
  type LiveQuickConnectRoundSeconds,
} from '../application/index.ts';

export const useLiveQuickConnectHostControl = (sessionId: string, enabled: boolean) => {
  const [snapshot, setSnapshot] = useState<LiveQuickConnectHostSnapshot | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const actionInFlightRef = useRef(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionId) return;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    if (mountedRef.current) setRefreshing(true);
    const operation = liveRepository.getQuickConnectHostControl(sessionId)
      .then((next) => {
        if (!mountedRef.current) return;
        setSnapshot(next);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!mountedRef.current) return;
        setError(nextError instanceof Error ? nextError.message : 'live_quick_connect_control_unavailable');
      })
      .finally(() => {
        refreshInFlightRef.current = null;
        if (mountedRef.current) setRefreshing(false);
      });
    refreshInFlightRef.current = operation;
    return operation;
  }, [enabled, sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setSnapshot(null);
      setError(null);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    return liveRepository.subscribeQuickConnect(sessionId, () => void refresh());
  }, [enabled, refresh, sessionId]);

  const run = useCallback(async (
    key: string,
    operation: () => Promise<LiveQuickConnectHostSnapshot>,
  ) => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    setBusyAction(key);
    setError(null);
    try {
      const next = await operation();
      if (mountedRef.current) setSnapshot(next);
      return true;
    } catch (nextError) {
      if (mountedRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_quick_connect_control_failed');
      }
      return false;
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setBusyAction(null);
    }
  }, []);

  const configure = useCallback((
    roundSeconds: LiveQuickConnectRoundSeconds,
    maxConcurrentPairs: LiveQuickConnectConcurrency,
  ) => run(
    'configure',
    () => liveRepository.configureQuickConnectHostControl(sessionId, roundSeconds, maxConcurrentPairs),
  ), [run, sessionId]);

  const control = useCallback((action: LiveQuickConnectHostAction) => run(
    action,
    () => liveRepository.controlQuickConnect(sessionId, action),
  ), [run, sessionId]);

  return {
    snapshot,
    busyAction,
    error,
    refreshing,
    refresh,
    configure,
    control,
  };
};
