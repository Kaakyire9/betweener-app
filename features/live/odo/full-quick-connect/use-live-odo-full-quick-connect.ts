import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { liveRepository } from '../../application/live-repository.ts';
import type { OdoFullQuickConnectState } from './odo-full-quick-connect-contracts.ts';

type BusyAction = 'enable' | 'takeover' | 'resume' | 'finish' | null;

export type LiveOdoFullQuickConnectController = {
  state: OdoFullQuickConnectState | null;
  loading: boolean;
  busyAction: BusyAction;
  error: string | null;
  refresh: () => Promise<void>;
  enable: () => Promise<void>;
  takeControl: () => Promise<void>;
  resume: () => Promise<void>;
  finishCurrent: () => Promise<void>;
};
const friendlyError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'odo_full_quick_connect_unavailable';
  if (message.includes('internal_rollout') || message.includes('allowlist')) {
    return 'Full Quick Connect Autopilot is currently limited to internal Hosts.';
  }
  if (message.includes('policy_clearance')) {
    return 'Odo is paused by Safety and cannot resume until the pause is cleared.';
  }
  if (message.includes('quick_connect_required')) {
    return 'Full Autopilot is available only in a Quick Connect Live.';
  }
  if (message.includes('already_ended')) return 'This Quick Connect rotation has ended.';
  return 'Odo could not update Full Quick Connect Autopilot. Try again.';
};

export const useLiveOdoFullQuickConnect = (options: {
  enabled: boolean;
  sessionId: string;
}): LiveOdoFullQuickConnectController => {
  const [state, setState] = useState<OdoFullQuickConnectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshRef = useRef<Promise<void> | null>(null);
  const wakeRunningRef = useRef(false);
  const wakeQueuedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    if (refreshRef.current) return refreshRef.current;
    setLoading(true);
    const operation = liveRepository.getOdoFullQuickConnect(options.sessionId)
      .then((next) => {
        if (!mountedRef.current) return;
        setState(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (mountedRef.current) setError(friendlyError(caught));
      })
      .finally(() => {
        refreshRef.current = null;
        if (mountedRef.current) setLoading(false);
      });
    refreshRef.current = operation;
    return operation;
  }, [options.enabled, options.sessionId]);

  const wake = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    if (wakeRunningRef.current) {
      wakeQueuedRef.current = true;
      return;
    }
    wakeRunningRef.current = true;
    try {
      do {
        wakeQueuedRef.current = false;
        await liveRepository.wakeOdoFullQuickConnect(options.sessionId);
      } while (wakeQueuedRef.current);
      await refresh();
    } catch (caught) {
      if (mountedRef.current) setError(friendlyError(caught));
    } finally {
      wakeRunningRef.current = false;
    }
  }, [options.enabled, options.sessionId, refresh]);

  useEffect(() => {
    setState(null);
    setError(null);
    if (!options.enabled || !options.sessionId) return undefined;
    const unsubscribeState = liveRepository.subscribeOdoFullQuickConnect(
      options.sessionId,
      () => { void refresh(); },
    );
    const unsubscribeQuickConnect = liveRepository.subscribeQuickConnect(
      options.sessionId,
      () => { void wake(); },
    );
    void refresh();
    return () => {
      unsubscribeState();
      unsubscribeQuickConnect();
    };
  }, [options.enabled, options.sessionId, refresh, wake]);

  useEffect(() => {
    if (!options.enabled || state?.enabled !== true || !state.nextWakeAt) return undefined;
    const delay = Math.max(250, Math.min(60_000, Date.parse(state.nextWakeAt) - Date.now()));
    const timer = setTimeout(() => { void wake(); }, delay);
    return () => clearTimeout(timer);
  }, [options.enabled, state?.enabled, state?.nextWakeAt, wake]);

  const perform = useCallback(async (
    action: Exclude<BusyAction, null>,
    operation: () => Promise<void>,
    shouldWake = true,
  ) => {
    setBusyAction(action);
    setError(null);
    try {
      await operation();
      if (shouldWake) await wake();
      else await refresh();
    } catch (caught) {
      if (mountedRef.current) setError(friendlyError(caught));
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }, [refresh, wake]);

  const enable = useCallback(() => perform('enable', () =>
    liveRepository.enableOdoFullQuickConnect(options.sessionId)),
  [options.sessionId, perform]);
  const takeControl = useCallback(() => perform('takeover', () =>
    liveRepository.takeOverOdo(options.sessionId), false),
  [options.sessionId, perform]);
  const resume = useCallback(() => perform('resume', () =>
    liveRepository.resumeOdoFullQuickConnect(options.sessionId)),
  [options.sessionId, perform]);
  const finishCurrent = useCallback(() => perform('finish', () =>
    liveRepository.finishOdoQuickConnect(options.sessionId)),
  [options.sessionId, perform]);

  return useMemo(() => ({
    state,
    loading,
    busyAction,
    error,
    refresh,
    enable,
    takeControl,
    resume,
    finishCurrent,
  }), [busyAction, enable, error, finishCurrent, loading, refresh, resume, state, takeControl]);
};
