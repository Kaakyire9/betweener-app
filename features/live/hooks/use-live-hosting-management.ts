import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LiveHostingManagementSnapshot } from '../application/live-models.ts';
import { liveRepository } from '../application/live-repository.ts';

export type LiveHostingManagementController = {
  snapshot: LiveHostingManagementSnapshot | null;
  loading: boolean;
  busyAction: 'delegate' | 'revoke' | 'extend' | 'keep_open' | null;
  error: string | null;
  refresh: () => Promise<void>;
  delegate: (username: string) => Promise<void>;
  revoke: () => Promise<void>;
  extend: (minutes: number) => Promise<void>;
  keepOpen: () => Promise<void>;
};

export const useLiveHostingManagement = (options: {
  sessionId: string;
  enabled: boolean;
}): LiveHostingManagementController => {
  const [snapshot, setSnapshot] = useState<LiveHostingManagementSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<LiveHostingManagementController['busyAction']>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await liveRepository.getHostingManagement(options.sessionId);
      if (requestId === requestIdRef.current) setSnapshot(next);
    } catch (nextError) {
      if (requestId === requestIdRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_hosting_management_failed');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [options.enabled, options.sessionId]);

  useEffect(() => {
    if (!options.enabled || !options.sessionId) return;
    void refresh();
    return liveRepository.subscribe(options.sessionId, () => void refresh());
  }, [options.enabled, options.sessionId, refresh]);

  const run = useCallback(async (
    action: NonNullable<LiveHostingManagementController['busyAction']>,
    operation: () => Promise<LiveHostingManagementSnapshot>,
  ) => {
    if (busyAction) return;
    setBusyAction(action);
    setError(null);
    try {
      setSnapshot(await operation());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_hosting_action_failed');
    } finally {
      setBusyAction(null);
    }
  }, [busyAction]);

  return useMemo(() => ({
    snapshot,
    loading,
    busyAction,
    error,
    refresh,
    delegate: async (username: string) => run(
      'delegate',
      () => liveRepository.delegateHost(options.sessionId, username),
    ),
    revoke: async () => run(
      'revoke',
      () => liveRepository.revokeDelegatedHost(options.sessionId),
    ),
    extend: async (minutes: number) => run(
      'extend',
      () => liveRepository.extendHostingRuntime(options.sessionId, { extensionMinutes: minutes }),
    ),
    keepOpen: async () => run(
      'keep_open',
      () => liveRepository.extendHostingRuntime(options.sessionId, { keepOpen: true }),
    ),
  }), [busyAction, error, loading, options.sessionId, refresh, run, snapshot]);
};
