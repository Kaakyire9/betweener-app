import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  liveRepository,
  type LiveHostedMatchingSnapshot,
} from '../application/index.ts';

export const useLiveHostedMatching = (sessionId: string, enabled: boolean) => {
  const [snapshot, setSnapshot] = useState<LiveHostedMatchingSnapshot | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);
  const actionInFlightRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId || !enabled) return;
    if (inFlightRef.current) {
      refreshQueuedRef.current = true;
      return inFlightRef.current;
    }
    if (mountedRef.current) setRefreshing(true);
    const operation = (async () => {
      do {
        refreshQueuedRef.current = false;
        try {
          const next = await liveRepository.getHostedMatching(sessionId);
          if (!mountedRef.current) return;
          setSnapshot(next);
          setError(null);
        } catch (nextError: unknown) {
          if (!mountedRef.current) return;
          setError(nextError instanceof Error ? nextError.message : 'live_hosted_matching_unavailable');
        }
      } while (mountedRef.current && refreshQueuedRef.current);
    })()
      .finally(() => {
        inFlightRef.current = null;
        if (mountedRef.current) setRefreshing(false);
      });
    inFlightRef.current = operation;
    return operation;
  }, [enabled, sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setSnapshot(null);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!sessionId || !enabled) return;
    return liveRepository.subscribeHostedMatching(sessionId, () => void refresh());
  }, [enabled, refresh, sessionId]);

  const run = useCallback(async (
    key: string,
    operation: () => Promise<LiveHostedMatchingSnapshot | void>,
  ) => {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    setBusyAction(key);
    setError(null);
    try {
      const next = await operation();
      if (next) setSnapshot(next);
      else await refresh();
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_hosted_matching_action_failed');
      return false;
    } finally {
      actionInFlightRef.current = false;
      setBusyAction(null);
    }
  }, [refresh]);

  return {
    snapshot,
    busyAction,
    error,
    refreshing,
    refresh,
    setAvailability: (open: boolean) => run(
      'availability',
      () => liveRepository.setIntroductionAvailability(sessionId, open),
    ),
    proposePair: (participantAUserId: string, participantBUserId: string) => run(
      'propose',
      () => liveRepository.createMatchRound(
        sessionId,
        participantAUserId,
        participantBUserId,
        Crypto.randomUUID(),
      ),
    ),
    respond: (matchRoundId: string, accept: boolean) => run(
      `respond:${accept ? 'accept' : 'decline'}`,
      () => liveRepository.respondMatchRound(matchRoundId, accept),
    ),
    transition: (
      matchRoundId: string,
      targetState: 'public_introduction' | 'completed' | 'cancelled',
    ) => run(
      `transition:${targetState}`,
      () => liveRepository.transitionMatchRound(matchRoundId, targetState, sessionId),
    ),
    respondPrivateSpark: (privateSparkId: string, accept: boolean) => run(
      `private-spark:${accept ? 'accept' : 'decline'}`,
      async () => {
        await liveRepository.respondPrivateSpark(privateSparkId, accept);
        return liveRepository.getHostedMatching(sessionId);
      },
    ),
    endPrivateSpark: (privateSparkId: string, reason = 'left') => run(
      'private-spark:end',
      async () => {
        await liveRepository.endPrivateSpark(privateSparkId, reason);
        return liveRepository.getHostedMatching(sessionId);
      },
    ),
  };
};
