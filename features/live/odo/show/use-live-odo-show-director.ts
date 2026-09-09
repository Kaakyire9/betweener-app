import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { liveRepository } from '../../application/live-repository.ts';
import type {
  LiveMusicAction,
  OdoShowDirectorState,
  OdoShowScene,
} from './odo-show-contracts.ts';

type BusyAction = 'enable' | 'takeover' | 'resume' | 'scene' | 'music' | null;

export type LiveOdoShowDirectorController = {
  state: OdoShowDirectorState | null;
  loading: boolean;
  busyAction: BusyAction;
  error: string | null;
  refresh: () => Promise<void>;
  enable: () => Promise<void>;
  takeControl: () => Promise<void>;
  resume: () => Promise<void>;
  setScene: (scene: OdoShowScene) => Promise<void>;
  controlMusic: (action: LiveMusicAction, volume?: number) => Promise<void>;
};
const friendlyError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'odo_show_unavailable';
  if (message.includes('internal_rollout')) {
    return 'Show Director is currently limited to internal Hosts.';
  }
  if (message.includes('policy_clearance') || message.includes('circuit_breaker')) {
    return 'Show Director is paused by Safety.';
  }
  if (message.includes('stale_show_version')) {
    return 'The programme changed. Refresh and try again.';
  }
  if (message.includes('approved_track_unavailable')) {
    return 'No approved, licensed track is available for that action.';
  }
  return 'Odo could not update the show. Try again.';
};

export const useLiveOdoShowDirector = (options: {
  enabled: boolean;
  sessionId: string;
}): LiveOdoShowDirectorController => {
  const [state, setState] = useState<OdoShowDirectorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshRef = useRef<Promise<void> | null>(null);
  const wakeRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    if (refreshRef.current) return refreshRef.current;
    setLoading(true);
    const operation = liveRepository.getOdoShowDirector(options.sessionId)
      .then((next) => {
        if (mountedRef.current) { setState(next); setError(null); }
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
    if (wakeRef.current) return wakeRef.current;
    const operation = liveRepository.wakeOdoShowDirector(options.sessionId)
      .then(refresh)
      .catch((caught: unknown) => {
        if (mountedRef.current) setError(friendlyError(caught));
      })
      .finally(() => { wakeRef.current = null; });
    wakeRef.current = operation;
    return operation;
  }, [options.enabled, options.sessionId, refresh]);

  useEffect(() => {
    setState(null);
    setError(null);
    if (!options.enabled || !options.sessionId) return undefined;
    const unsubscribe = liveRepository.subscribeOdoShow(options.sessionId, () => {
      void refresh();
    });
    void refresh();
    return unsubscribe;
  }, [options.enabled, options.sessionId, refresh]);

  useEffect(() => {
    if (!options.enabled || state?.enabled !== true || !state.nextWakeAt
      || state.pausedByHost) return undefined;
    const delay = Math.max(250, Math.min(60_000, Date.parse(state.nextWakeAt) - Date.now()));
    const timer = setTimeout(() => { void wake(); }, delay);
    return () => clearTimeout(timer);
  }, [options.enabled, state?.enabled, state?.nextWakeAt, state?.pausedByHost, wake]);

  const perform = useCallback(async (
    action: Exclude<BusyAction, null>,
    operation: () => Promise<void>,
    wakeAfter = true,
  ) => {
    setBusyAction(action);
    setError(null);
    try {
      await operation();
      if (wakeAfter) await wake();
      else await refresh();
    } catch (caught) {
      if (mountedRef.current) setError(friendlyError(caught));
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }, [refresh, wake]);

  const enable = useCallback(() => perform('enable', () =>
    liveRepository.enableOdoShowDirector(options.sessionId)),
  [options.sessionId, perform]);
  const takeControl = useCallback(() => perform('takeover', () =>
    liveRepository.takeOverOdoShow(options.sessionId), false),
  [options.sessionId, perform]);
  const resume = useCallback(() => perform('resume', () =>
    liveRepository.resumeOdoShow(options.sessionId)),
  [options.sessionId, perform]);
  const setScene = useCallback((scene: OdoShowScene) => {
    if (!state) return Promise.resolve();
    return perform('scene', () => liveRepository.setLiveShowScene(
      options.sessionId, scene, state.stateVersion,
    ), false);
  }, [options.sessionId, perform, state]);
  const controlMusic = useCallback((action: LiveMusicAction, volume?: number) =>
    perform('music', () => liveRepository.controlLiveMusic({
      sessionId: options.sessionId,
      action,
      volume,
    }), false), [options.sessionId, perform]);

  return useMemo(() => ({
    state, loading, busyAction, error, refresh, enable, takeControl, resume,
    setScene, controlMusic,
  }), [
    busyAction, controlMusic, enable, error, loading, refresh, resume,
    setScene, state, takeControl,
  ]);
};
