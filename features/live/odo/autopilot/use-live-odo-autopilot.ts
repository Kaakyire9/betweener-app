import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { liveRepository } from '../../application/live-repository.ts';
import type { OdoGuardedAutopilotState } from './odo-autopilot-contracts.ts';

export type LiveOdoAutopilotController = {
  state: OdoGuardedAutopilotState | null;
  loading: boolean;
  busyAction: 'enable' | 'takeover' | 'resume' | null;
  error: string | null;
  refresh: () => Promise<void>;
  enable: () => Promise<void>;
  takeControl: () => Promise<void>;
  resume: () => Promise<void>;
};

const friendlyError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'odo_guarded_unavailable';
  if (message.includes('internal_rollout') || message.includes('allowlist')) {
    return 'Guarded Autopilot is currently limited to internal Hosts.';
  }
  if (message.includes('policy_clearance')) {
    return 'Odo is paused by Safety and cannot resume until that pause is cleared.';
  }
  if (message.includes('disabled') || message.includes('unavailable')) {
    return 'Guarded Autopilot is not available for this room.';
  }
  return 'Odo could not update its Autopilot state. Try again.';
};

export const useLiveOdoAutopilot = (options: {
  enabled: boolean;
  sessionId: string;
}): LiveOdoAutopilotController => {
  const [state, setState] = useState<OdoGuardedAutopilotState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<LiveOdoAutopilotController['busyAction']>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const workerRunning = useRef(false);
  const workerQueued = useRef(false);
  const signalledCue = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    setLoading(true);
    try {
      const next = await liveRepository.getOdoGuardedAutopilot(options.sessionId);
      if (mounted.current) {
        setState(next);
        setError(null);
      }
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [options.enabled, options.sessionId]);

  const wake = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    if (workerRunning.current) {
      workerQueued.current = true;
      return;
    }
    workerRunning.current = true;
    try {
      do {
        workerQueued.current = false;
        await liveRepository.wakeOdoGuardedAutopilot(options.sessionId);
      } while (workerQueued.current);
      await refresh();
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
    } finally {
      workerRunning.current = false;
    }
  }, [options.enabled, options.sessionId, refresh]);

  useEffect(() => {
    setState(null);
    setError(null);
    signalledCue.current = null;
    if (!options.enabled || !options.sessionId) return undefined;
    const unsubscribe = liveRepository.subscribeOdoGuardedAutopilot(
      options.sessionId,
      () => {
        void refresh();
        void wake();
      },
    );
    void refresh().then(() => wake());
    return unsubscribe;
  }, [options.enabled, options.sessionId, refresh, wake]);

  useEffect(() => {
    const cueAt = state?.nextTimeCueAt;
    if (!options.enabled || state?.autopilotState !== 'active' || !cueAt
      || signalledCue.current === cueAt) return undefined;
    const delay = Math.max(0, Date.parse(cueAt) - Date.now());
    const timer = setTimeout(() => {
      if (signalledCue.current === cueAt) return;
      signalledCue.current = cueAt;
      void liveRepository.signalOdoGuardedClock(options.sessionId)
        .then(() => wake())
        .catch((caught) => {
          if (mounted.current) setError(friendlyError(caught));
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [options.enabled, options.sessionId, state?.autopilotState, state?.nextTimeCueAt, wake]);

  const perform = useCallback(async (
    action: NonNullable<LiveOdoAutopilotController['busyAction']>,
    operation: () => Promise<void>,
  ) => {
    setBusyAction(action);
    setError(null);
    try {
      await operation();
      await refresh();
      if (action !== 'takeover') await wake();
    } catch (caught) {
      if (mounted.current) setError(friendlyError(caught));
    } finally {
      if (mounted.current) setBusyAction(null);
    }
  }, [refresh, wake]);

  const enable = useCallback(() => perform('enable', () =>
    liveRepository.enableOdoGuardedAutopilot(options.sessionId, {
      narration: true,
      scenes: true,
      conversationSparks: true,
      audiencePulse: false,
      intermissions: true,
    })), [options.sessionId, perform]);
  const takeControl = useCallback(() => perform('takeover', () =>
    liveRepository.takeOverOdo(options.sessionId)), [options.sessionId, perform]);
  const resume = useCallback(() => perform('resume', () =>
    liveRepository.resumeOdoGuardedAutopilot(options.sessionId)), [options.sessionId, perform]);

  return useMemo(() => ({
    state, loading, busyAction, error, refresh, enable, takeControl, resume,
  }), [busyAction, enable, error, loading, refresh, resume, state, takeControl]);
};
