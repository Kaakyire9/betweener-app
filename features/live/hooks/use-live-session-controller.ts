import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import { liveRepository, type LiveComment, type LiveReactionKind, type LiveSessionSnapshot } from '../application/index.ts';

export type LiveSessionControllerState = 'loading' | 'ready' | 'offline' | 'reconnecting' | 'error';

export const useLiveSessionController = (sessionId: string) => {
  const [snapshot, setSnapshot] = useState<LiveSessionSnapshot | null>(null);
  const [state, setState] = useState<LiveSessionControllerState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [olderComments, setOlderComments] = useState<readonly LiveComment[]>([]);
  const [loadingEarlierComments, setLoadingEarlierComments] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);
  const actionInFlightRef = useRef<string | null>(null);
  const commentInFlightRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    if (refreshInFlightRef.current) {
      // A realtime event arriving while an older snapshot is in flight must
      // not be lost. Queue one trailing canonical read after it settles.
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }
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
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          queueMicrotask(() => void refresh());
        }
      }
    })();
    refreshInFlightRef.current = operation;
    return operation;
  }, [sessionId]);

  useEffect(() => {
    setOlderComments([]);
    setLoadingEarlierComments(false);
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

  useEffect(() => {
    const participantState = snapshot?.me?.state;
    const sessionStatus = snapshot?.session.status;
    if (
      !sessionId
      || !participantState
      || !sessionStatus
      || !['backstage','live','ending'].includes(sessionStatus)
      || !['backstage','audience','stage_requested','on_stage','temporarily_disconnected'].includes(participantState)
    ) return;

    const beat = () => {
      if (AppState.currentState === 'active') {
        void liveRepository.heartbeat(sessionId).catch(() => undefined);
      }
    };
    beat();
    const interval = setInterval(beat, 15_000);
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') beat();
    });
    return () => {
      clearInterval(interval);
      foreground.remove();
    };
  }, [sessionId, snapshot?.me?.state, snapshot?.session.status]);

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

  const comments = useMemo(() => {
    const merged = new Map<string, LiveComment>();
    olderComments.forEach((comment) => merged.set(comment.id, comment));
    snapshot?.comments.forEach((comment) => merged.set(comment.id, comment));
    return [...merged.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [olderComments, snapshot?.comments]);

  const createComment = useCallback(async (body: string, clientCommentId = Crypto.randomUUID()) => {
    if (commentInFlightRef.current.has(clientCommentId)) return false;
    commentInFlightRef.current.add(clientCommentId);
    setError(null);
    try {
      await liveRepository.createComment(sessionId, clientCommentId, body);
      await refresh();
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_comment_failed');
      return false;
    } finally {
      commentInFlightRef.current.delete(clientCommentId);
    }
  }, [refresh, sessionId]);

  const loadEarlierComments = useCallback(async () => {
    if (!snapshot || loadingEarlierComments || comments.length >= snapshot.commentCount) return;
    setLoadingEarlierComments(true);
    try {
      const earlier = await liveRepository.listComments(sessionId, comments[0]?.createdAt ?? null);
      setOlderComments((current) => {
        const merged = new Map(current.map((comment) => [comment.id, comment]));
        earlier.forEach((comment) => merged.set(comment.id, comment));
        return [...merged.values()];
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_comments_unavailable');
    } finally {
      setLoadingEarlierComments(false);
    }
  }, [comments, loadingEarlierComments, sessionId, snapshot]);

  return {
    snapshot,
    state,
    error,
    busyAction,
    comments,
    commentCount: snapshot?.commentCount ?? 0,
    loadingEarlierComments,
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
    createComment,
    loadEarlierComments,
    moderateComment: (commentId: string) =>
      runAction(`moderate-comment:${commentId}`, async () => {
        await liveRepository.moderateComment(commentId);
        setOlderComments((current) => current.filter((comment) => comment.id !== commentId));
      }),
    reportComment: (comment: LiveComment) =>
      runAction(`report-comment:${comment.id}`, () => liveRepository.reportComment(sessionId, comment)),
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
