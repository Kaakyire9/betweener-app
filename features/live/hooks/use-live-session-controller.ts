import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import {
  LIVE_FALLBACK_CHECK_INTERVAL_MS,
  LIVE_HEARTBEAT_INTERVAL_MS,
  LIVE_REALTIME_COALESCE_MS,
  isActiveLiveParticipantState,
  isFreshLiveParticipantArrival,
  liveParticipantArrivalKey,
  liveRepository,
  shouldRefreshLiveSnapshot,
  type LiveComment,
  type LiveJoinNotice,
  type LiveAudiencePulseSnapshot,
  type LiveReactionKind,
  type LiveSessionRealtimeStatus,
  type LiveSessionSnapshot,
  type LiveParticipantArrivalEvent,
} from '../application/index.ts';

export type LiveSessionControllerState = 'loading' | 'ready' | 'offline' | 'reconnecting' | 'error';

const EMPTY_AUDIENCE_PULSE: LiveAudiencePulseSnapshot = {
  canManage: false,
  templates: [],
  activePoll: null,
  recentPoll: null,
};

export const useLiveSessionController = (sessionId: string, currentUserId: string | null = null) => {
  const [snapshot, setSnapshot] = useState<LiveSessionSnapshot | null>(null);
  const [state, setState] = useState<LiveSessionControllerState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [olderComments, setOlderComments] = useState<readonly LiveComment[]>([]);
  const [audiencePulse, setAudiencePulse] = useState<LiveAudiencePulseSnapshot>(EMPTY_AUDIENCE_PULSE);
  const [loadingEarlierComments, setLoadingEarlierComments] = useState(false);
  const [joinNotice, setJoinNotice] = useState<LiveJoinNotice | null>(null);
  const mountedRef = useRef(true);
  const activeSessionIdRef = useRef(sessionId);
  activeSessionIdRef.current = sessionId;
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);
  const pulseInFlightRef = useRef<Promise<void> | null>(null);
  const pulseQueuedRef = useRef(false);
  const structuralRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeHealthyRef = useRef(false);
  const lastFullRefreshAtRef = useRef(0);
  const actionInFlightRef = useRef<string | null>(null);
  const commentInFlightRef = useRef(new Set<string>());
  const joinNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrivalEventsSeenRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }
    const operation = (async () => {
      try {
        const next = await liveRepository.getSnapshot(sessionId);
        if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return;
        lastFullRefreshAtRef.current = Date.now();
        setSnapshot(next);
        setState('ready');
        setError(null);
      } catch (nextError) {
        if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return;
        const reachable = isNetworkConnectionAvailable(await fetchNetInfo().catch(() => null));
        if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return;
        setState(reachable ? 'error' : 'offline');
        setError(nextError instanceof Error ? nextError.message : 'live_session_unavailable');
      } finally {
        if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return;
        refreshInFlightRef.current = null;
        if (
          refreshQueuedRef.current
          && mountedRef.current
          && activeSessionIdRef.current === sessionId
        ) {
          refreshQueuedRef.current = false;
          queueMicrotask(() => void refresh());
        }
      }
    })();
    refreshInFlightRef.current = operation;
    return operation;
  }, [sessionId]);

  const refreshRoomPulse = useCallback(async () => {
    if (!sessionId) return;
    if (pulseInFlightRef.current) {
      pulseQueuedRef.current = true;
      return pulseInFlightRef.current;
    }
    const operation = (async () => {
      try {
        const pulse = await liveRepository.getRoomPulse(sessionId);
        if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return;
        setSnapshot((current) => current ? {
          ...current,
          comments: pulse.comments,
          commentCount: pulse.commentCount,
        } : current);
        setAudiencePulse(pulse.audiencePulse);
      } finally {
        if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return;
        pulseInFlightRef.current = null;
        if (
          pulseQueuedRef.current
          && mountedRef.current
          && activeSessionIdRef.current === sessionId
        ) {
          pulseQueuedRef.current = false;
          queueMicrotask(() => void refreshRoomPulse());
        }
      }
    })();
    pulseInFlightRef.current = operation;
    return operation;
  }, [sessionId]);

  const scheduleStructuralRefresh = useCallback(() => {
    if (structuralRefreshTimerRef.current) return;
    structuralRefreshTimerRef.current = setTimeout(() => {
      structuralRefreshTimerRef.current = null;
      void refresh();
    }, LIVE_REALTIME_COALESCE_MS);
  }, [refresh]);

  const schedulePulseRefresh = useCallback(() => {
    if (pulseRefreshTimerRef.current) return;
    pulseRefreshTimerRef.current = setTimeout(() => {
      pulseRefreshTimerRef.current = null;
      void refreshRoomPulse().catch(() => undefined);
    }, LIVE_REALTIME_COALESCE_MS);
  }, [refreshRoomPulse]);

  useEffect(() => {
    mountedRef.current = true;
    setOlderComments([]);
    setAudiencePulse(EMPTY_AUDIENCE_PULSE);
    setLoadingEarlierComments(false);
    setJoinNotice(null);
    arrivalEventsSeenRef.current.clear();
    realtimeHealthyRef.current = false;
    lastFullRefreshAtRef.current = 0;
    refreshInFlightRef.current = null;
    refreshQueuedRef.current = false;
    pulseInFlightRef.current = null;
    pulseQueuedRef.current = false;
    return () => {
      mountedRef.current = false;
      if (structuralRefreshTimerRef.current) clearTimeout(structuralRefreshTimerRef.current);
      if (pulseRefreshTimerRef.current) clearTimeout(pulseRefreshTimerRef.current);
      structuralRefreshTimerRef.current = null;
      pulseRefreshTimerRef.current = null;
      if (joinNoticeTimerRef.current) clearTimeout(joinNoticeTimerRef.current);
      joinNoticeTimerRef.current = null;
    };
  }, [sessionId]);

  const announceParticipantJoin = useCallback(async (event: LiveParticipantArrivalEvent) => {
    if (!isFreshLiveParticipantArrival(event)) return;
    const eventKey = liveParticipantArrivalKey(event);
    if (arrivalEventsSeenRef.current.has(eventKey)) return;
    arrivalEventsSeenRef.current.add(eventKey);
    try {
      const member = await liveRepository.getMemberSummary(sessionId, event.profileId);
      if (
        !mountedRef.current
        || activeSessionIdRef.current !== sessionId
        || member.userId === currentUserId
        || !isActiveLiveParticipantState(member.participantState)
      ) return;
      setJoinNotice(member);
      if (joinNoticeTimerRef.current) clearTimeout(joinNoticeTimerRef.current);
      joinNoticeTimerRef.current = setTimeout(() => {
        if (mountedRef.current && activeSessionIdRef.current === sessionId) setJoinNotice(null);
      }, 3600);
    } catch {
      // The room remains healthy if an ephemeral identity lookup races a leave.
    }
  }, [currentUserId, sessionId]);

  useEffect(() => {
    void Promise.all([
      refresh(),
      refreshRoomPulse().catch(() => undefined),
    ]);
    return liveRepository.subscribe(
      sessionId,
      (event) => event === 'pulse' ? schedulePulseRefresh() : scheduleStructuralRefresh(),
      (status: LiveSessionRealtimeStatus) => {
        realtimeHealthyRef.current = status === 'SUBSCRIBED';
      },
      (event) => void announceParticipantJoin(event),
    );
  }, [announceParticipantJoin, refresh, refreshRoomPulse, schedulePulseRefresh, scheduleStructuralRefresh, sessionId]);

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
    const fallback = setInterval(() => {
      if (
        AppState.currentState === 'active'
        && shouldRefreshLiveSnapshot({
          realtimeHealthy: realtimeHealthyRef.current,
          lastFullRefreshAt: lastFullRefreshAtRef.current,
          now: Date.now(),
        })
      ) {
        void refresh();
      }
    }, LIVE_FALLBACK_CHECK_INTERVAL_MS);
    return () => {
      foreground.remove();
      clearInterval(fallback);
    };
  }, [refresh]);

  useEffect(() => {
    const participantState = snapshot?.me?.state;
    const sessionStatus = snapshot?.session.status;
    if (
      !sessionId
      || !participantState
      || !sessionStatus
      || !['backstage', 'live', 'ending'].includes(sessionStatus)
      || !['backstage', 'audience', 'stage_requested', 'on_stage', 'temporarily_disconnected'].includes(participantState)
    ) return;

    const beat = () => {
      if (AppState.currentState === 'active') {
        void liveRepository.heartbeat(sessionId).catch(() => undefined);
      }
    };
    beat();
    const interval = setInterval(beat, LIVE_HEARTBEAT_INTERVAL_MS);
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') beat();
    });
    return () => {
      clearInterval(interval);
      foreground.remove();
    };
  }, [sessionId, snapshot?.me?.state, snapshot?.session.status]);

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<void>,
    options: { refreshAfter?: boolean } = {},
  ) => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = key;
    if (mountedRef.current) {
      setBusyAction(key);
      setError(null);
    }
    try {
      await action();
      if (options.refreshAfter !== false) await refresh();
      return true;
    } catch (nextError) {
      if (mountedRef.current && activeSessionIdRef.current === sessionId) {
        setError(nextError instanceof Error ? nextError.message : 'live_action_failed');
      }
      return false;
    } finally {
      actionInFlightRef.current = null;
      if (mountedRef.current && activeSessionIdRef.current === sessionId) setBusyAction(null);
    }
  }, [refresh, sessionId]);

  const leaveStage = useCallback(async () => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = 'leave-stage';
    if (mountedRef.current) {
      setBusyAction('leave-stage');
      setError(null);
    }
    try {
      await liveRepository.leaveStage(sessionId);
      // The server transition is authoritative. A slow snapshot refresh must not
      // turn a successful demotion into a user-facing failure.
      if (mountedRef.current && activeSessionIdRef.current === sessionId) {
        setSnapshot((current) => current?.me
          ? { ...current, me: { ...current.me, state: 'audience' } }
          : current);
      }
      void refresh().catch(() => undefined);
      return true;
    } catch (nextError) {
      if (mountedRef.current && activeSessionIdRef.current === sessionId) {
        setError(nextError instanceof Error ? nextError.message : 'live_stage_departure_failed');
      }
      return false;
    } finally {
      actionInFlightRef.current = null;
      if (mountedRef.current && activeSessionIdRef.current === sessionId) setBusyAction(null);
    }
  }, [refresh, sessionId]);

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
      const comment = await liveRepository.createComment(sessionId, clientCommentId, body);
      if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return false;
      setSnapshot((current) => {
        if (!current) return current;
        const exists = current.comments.some((item) => item.id === comment.id);
        return {
          ...current,
          comments: exists ? current.comments : [...current.comments, comment],
          commentCount: exists ? current.commentCount : current.commentCount + 1,
        };
      });
      return true;
    } catch (nextError) {
      if (mountedRef.current && activeSessionIdRef.current === sessionId) {
        setError(nextError instanceof Error ? nextError.message : 'live_comment_failed');
      }
      return false;
    } finally {
      commentInFlightRef.current.delete(clientCommentId);
    }
  }, [sessionId]);

  const loadEarlierComments = useCallback(async () => {
    if (!snapshot || loadingEarlierComments || comments.length >= snapshot.commentCount) return;
    setLoadingEarlierComments(true);
    try {
      const earlier = await liveRepository.listComments(sessionId, comments[0]?.createdAt ?? null);
      if (!mountedRef.current || activeSessionIdRef.current !== sessionId) return;
      setOlderComments((current) => {
        const merged = new Map(current.map((comment) => [comment.id, comment]));
        earlier.forEach((comment) => merged.set(comment.id, comment));
        return [...merged.values()];
      });
    } catch (nextError) {
      if (mountedRef.current && activeSessionIdRef.current === sessionId) {
        setError(nextError instanceof Error ? nextError.message : 'live_comments_unavailable');
      }
    } finally {
      if (mountedRef.current && activeSessionIdRef.current === sessionId) {
        setLoadingEarlierComments(false);
      }
    }
  }, [comments, loadingEarlierComments, sessionId, snapshot]);

  return {
    snapshot,
    state,
    error,
    busyAction,
    comments,
    commentCount: snapshot?.commentCount ?? 0,
    audiencePulse,
    joinNotice,
    loadingEarlierComments,
    refresh,
    rsvp: (attending: boolean, openToIntroductions = false) =>
      runAction('rsvp', () => liveRepository.rsvp(sessionId, attending, openToIntroductions)),
    join,
    leave: () => runAction('leave', () => liveRepository.leave(sessionId)),
    leaveStage,
    requestSeat: () => runAction('request-seat', () => liveRepository.requestSeat(sessionId)),
    setStageRequestsOpen: (open: boolean) =>
      runAction('stage-intake', () => liveRepository.setStageRequestsOpen(sessionId, open)),
    setStageRequestCapacity: (capacity: number) =>
      runAction('stage-intake', () => liveRepository.setStageRequestCapacity(sessionId, capacity)),
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
        setSnapshot((current) => {
          if (!current) return current;
          const existed = current.comments.some((comment) => comment.id === commentId);
          return {
            ...current,
            comments: current.comments.filter((comment) => comment.id !== commentId),
            commentCount: existed ? Math.max(0, current.commentCount - 1) : current.commentCount,
          };
        });
      }, { refreshAfter: false }),
    reportComment: (comment: LiveComment) =>
      runAction(
        `report-comment:${comment.id}`,
        () => liveRepository.reportComment(sessionId, comment),
        { refreshAfter: false },
      ),
    createReaction: (reaction: LiveReactionKind) =>
      runAction(
        `reaction:${reaction}`,
        () => liveRepository.createReaction(sessionId, reaction),
        { refreshAfter: false },
      ),
    openAudiencePoll: (templateKey: string, durationSeconds = 90) =>
      runAction(`audience-poll:open:${templateKey}`, async () => {
        await liveRepository.openAudiencePoll(sessionId, templateKey, durationSeconds);
        await refreshRoomPulse();
      }, { refreshAfter: false }),
    voteAudiencePoll: (pollId: string, optionId: string) =>
      runAction(`audience-poll:vote:${pollId}`, async () => {
        await liveRepository.voteAudiencePoll(pollId, optionId);
        await refreshRoomPulse();
      }, { refreshAfter: false }),
    closeAudiencePoll: (pollId: string) =>
      runAction(`audience-poll:close:${pollId}`, async () => {
        await liveRepository.closeAudiencePoll(pollId);
        await refreshRoomPulse();
      }, { refreshAfter: false }),
    transitionSession: (targetStatus: string) => {
      if (!snapshot) return Promise.resolve();
      return runAction(`transition:${targetStatus}`, () =>
        liveRepository.transitionSession(sessionId, snapshot.session.version, targetStatus));
    },
    prepareAndStartSession: () => runAction(
      'start-session',
      () => liveRepository.prepareAndStartSession(sessionId),
    ),
    moderateParticipant: (
      userId: string,
      action: 'mute' | 'unmute' | 'remove' | 'suspend',
    ) => runAction(`moderate:${userId}:${action}`, () =>
      liveRepository.moderateParticipant(sessionId, userId, action)),
  };
};
