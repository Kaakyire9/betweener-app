import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { liveRepository, type LiveSessionSummary } from '../application/index.ts';

export const useLiveSessions = () => {
  const {
    authStatus,
    canPerformAuthenticatedWrites,
    isSessionRecoveryActive,
    retrySessionRecovery,
  } = useAuth();
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canSchedule, setCanSchedule] = useState(false);
  const requestIdRef = useRef(0);
  const retrySessionRecoveryRef = useRef(retrySessionRecovery);
  retrySessionRecoveryRef.current = retrySessionRecovery;
  const authUnavailable = authStatus !== 'authenticated' || !canPerformAuthenticatedWrites;

  const refresh = useCallback(async (options?: { attemptRecovery?: boolean }) => {
    const requestId = ++requestIdRef.current;
    let hasAuthenticatedSession = !authUnavailable;

    if (!hasAuthenticatedSession && options?.attemptRecovery !== false) {
      setRecovering(true);
      try {
        hasAuthenticatedSession = await retrySessionRecoveryRef.current('live_catalog_manual_retry');
      } catch {
        hasAuthenticatedSession = false;
      } finally {
        if (requestId === requestIdRef.current) setRecovering(false);
      }
    }

    if (!hasAuthenticatedSession) {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setCanSchedule(false);
      }
      return;
    }

    setRefreshing(true);
    setError(null);
    try {
      const next = await liveRepository.listSessions();
      if (requestId !== requestIdRef.current) return;
      setSessions(next);

      try {
        const schedulingAllowed = await liveRepository.canSchedule();
        if (requestId === requestIdRef.current) setCanSchedule(schedulingAllowed);
      } catch {
        if (requestId === requestIdRef.current) setCanSchedule(false);
      }
    } catch (nextError) {
      if (requestId === requestIdRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_sessions_unavailable');
        setCanSchedule(false);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [authUnavailable]);

  useEffect(() => {
    if (authUnavailable) {
      requestIdRef.current += 1;
      setLoading(false);
      setCanSchedule(false);
      return;
    }
    setLoading(true);
    void refresh({ attemptRecovery: false });
  }, [authUnavailable, refresh]);

  return {
    sessions,
    loading,
    refreshing,
    recovering: recovering || isSessionRecoveryActive,
    error,
    canSchedule,
    authUnavailable,
    authStatus,
    refresh,
  };
};
