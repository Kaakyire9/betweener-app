import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  liveRepository,
  type LiveQuickConnectIntent,
  type LiveQuickConnectPoolSnapshot,
  type LiveQuickConnectStageLayout,
} from '../application/index.ts';

const HEARTBEAT_INTERVAL_MS = 15_000;

export const useLiveQuickConnectPool = (sessionId: string, enabled: boolean) => {
  const [snapshot, setSnapshot] = useState<LiveQuickConnectPoolSnapshot | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const hasSnapshotRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const actionInFlightRef = useRef(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionId) return;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const showInitialLoading = !hasSnapshotRef.current;
    if (mountedRef.current && showInitialLoading) setInitialLoading(true);
    const operation = liveRepository.getQuickConnectPool(sessionId)
      .then((next) => {
        if (!mountedRef.current) return;
        hasSnapshotRef.current = true;
        setSnapshot(next);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!mountedRef.current) return;
        if (!hasSnapshotRef.current) {
          setError(nextError instanceof Error ? nextError.message : 'live_quick_connect_pool_unavailable');
        }
      })
      .finally(() => {
        refreshInFlightRef.current = null;
        if (mountedRef.current && showInitialLoading) setInitialLoading(false);
      });
    refreshInFlightRef.current = operation;
    return operation;
  }, [enabled, sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      hasSnapshotRef.current = false;
      setSnapshot(null);
      setError(null);
      setBusyAction(null);
      setInitialLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    return liveRepository.subscribeQuickConnect(sessionId, () => void refresh());
  }, [enabled, refresh, sessionId]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !sessionId || !snapshot?.isOptedIn || snapshot.queue?.pairing) return;
    const heartbeat = () => {
      void liveRepository.heartbeatQuickConnect(sessionId, true)
        .then(() => refresh())
        .catch(() => refresh());
    };
    const timer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh, sessionId, snapshot?.isOptedIn, snapshot?.queue?.pairing]);

  const run = useCallback(async (key: string, operation: () => Promise<void>) => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    setBusyAction(key);
    setError(null);
    try {
      await operation();
      await refresh();
      return true;
    } catch (nextError) {
      if (mountedRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_quick_connect_pool_action_failed');
      }
      return false;
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setBusyAction(null);
    }
  }, [refresh]);

  const optIn = useCallback((connectionIntent: LiveQuickConnectIntent) => run('opt-in', async () => {
    await liveRepository.joinQuickConnect(sessionId, connectionIntent);
  }), [run, sessionId]);

  const leave = useCallback(() => run('leave', async () => {
    await liveRepository.leaveQuickConnect(sessionId);
  }), [run, sessionId]);

  const signalInterest = useCallback((profileId: string) => run(`interest:${profileId}`, async () => {
    await liveRepository.signalQuickConnectInterest(sessionId, profileId);
  }), [run, sessionId]);

  const setStageLayout = useCallback((stageLayout: LiveQuickConnectStageLayout) => run('layout', async () => {
    await liveRepository.setQuickConnectStageLayout(sessionId, stageLayout);
  }), [run, sessionId]);

  return {
    snapshot,
    busyAction,
    error,
    initialLoading,
    refresh,
    optIn,
    leave,
    signalInterest,
    setStageLayout,
  };
};
