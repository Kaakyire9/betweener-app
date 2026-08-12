import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import { liveRepository, type LiveReactionKind, type LiveSessionSnapshot } from '../application/index.ts';

export type LiveSessionControllerState = 'loading' | 'ready' | 'offline' | 'reconnecting' | 'error';

export const useLiveSessionController = (sessionId: string) => {
  const [snapshot, setSnapshot] = useState<LiveSessionSnapshot | null>(null);
  const [state, setState] = useState<LiveSessionControllerState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const actionInFlightRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const operation = (async () => {
      try {
        const next = await liveRepository.getSnapshot(sessionId);
        setSnapshot(next);
        setState('ready');
        setError(null);
      } catch (nextError) {
        const reachable = isNetworkConnectionAvailable(await fetchNetInfo().catch(() => null));
        setState(reachable ? 'error' : 'offline');
        setError(nextError instanceof Error ? nextError.message : 'live_session_unavailable');
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = operation;
    return operation;
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    return liveRepository.subscribe(sessionId, () => void refresh());
  }, [refresh, sessionId]);

  useEffect(() => addNetInfoListener((network) => {
    if (!isNetworkConnectionAvailable(network)) {
      setState((current) => current === 'loading' ? current : 'offline');
      return;
    }
    if (state === 'offline') {
      setState('reconnecting');
      void refresh();
    }
  }), [refresh, state]);

  useEffect(() => {
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 20_000);
    return () => {
      foreground.remove();
      clearInterval(poll);
    };
  }, [refresh]);

  const runAction = useCallback(async (key: string, action: () => Promise<void>) => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = key;
    setBusyAction(key);
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_action_failed');
      return false;
    } finally {
      actionInFlightRef.current = null;
      setBusyAction(null);
    }
  }, [refresh]);

  const join = useCallback(
    () => runAction('join', () => liveRepository.join(sessionId)),
    [runAction, sessionId],
  );

  return {
    snapshot,
    state,
    error,
    busyAction,
    refresh,
    rsvp: (attending: boolean, openToIntroductions = false) =>
      runAction('rsvp', () => liveRepository.rsvp(sessionId, attending, openToIntroductions)),
    join,
    leave: () => runAction('leave', () => liveRepository.leave(sessionId)),
    requestSeat: () => runAction('request-seat', () => liveRepository.requestSeat(sessionId)),
    withdrawSeat: () => runAction('withdraw-seat', () => liveRepository.withdrawSeatRequest(sessionId)),
    resolveSeat: (requestId: string, approve: boolean) =>
      runAction(`seat:${requestId}`, () => liveRepository.resolveSeat(requestId, approve)),
    setOnStage: (userId: string, onStage: boolean) =>
      runAction(`stage:${userId}`, () => liveRepository.setStageParticipant(sessionId, userId, onStage)),
    createComment: (body: string) =>
      runAction('comment', () => liveRepository.createComment(sessionId, body)),
    createReaction: (reaction: LiveReactionKind) =>
      runAction(`reaction:${reaction}`, () => liveRepository.createReaction(sessionId, reaction)),
    transitionSession: (targetStatus: string) => {
      if (!snapshot) return Promise.resolve();
      return runAction(`transition:${targetStatus}`, () =>
        liveRepository.transitionSession(sessionId, snapshot.session.version, targetStatus));
    },
    moderateParticipant: (
      userId: string,
      action: 'mute' | 'unmute' | 'remove' | 'suspend',
    ) => runAction(`moderate:${userId}:${action}`, () =>
      liveRepository.moderateParticipant(sessionId, userId, action)),
  };
};
