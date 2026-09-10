import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import {
  liveRepository,
  type LiveAlwaysOnResponse,
  type LiveAlwaysOnSnapshot,
} from '../application/index.ts';

export const useLiveAlwaysOnQuickConnect = () => {
  const { user, authStatus, canPerformAuthenticatedWrites } = useAuth();
  const [snapshot, setSnapshot] = useState<LiveAlwaysOnSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const enabled = authStatus === 'authenticated' && canPerformAuthenticatedWrites && !!user?.id;

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    try {
      const next = await liveRepository.getAlwaysOnQuickConnect();
      if (request === requestRef.current) {
        setSnapshot(next);
        setError(null);
      }
    } catch (nextError) {
      if (request === requestRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_always_on_unavailable');
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !user?.id) {
      requestRef.current += 1;
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    const unsubscribe = liveRepository.subscribeAlwaysOnQuickConnect(user.id, refresh);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [enabled, refresh, user?.id]);

  const setAvailability = useCallback(async (durationMinutes: number) => {
    setPendingAction(durationMinutes === 0 ? 'stop' : `duration:${durationMinutes}`);
    setError(null);
    try {
      const next = await liveRepository.setAlwaysOnQuickConnectAvailability(durationMinutes);
      setSnapshot(next);
      if (durationMinutes > 0) {
        void liveRepository.wakeAlwaysOnQuickConnect().catch(() => undefined);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_availability_update_failed');
    } finally {
      setPendingAction(null);
    }
  }, []);

  const respond = useCallback(async (response: LiveAlwaysOnResponse) => {
    const opportunity = snapshot?.opportunity;
    if (!opportunity) return;
    setPendingAction(response);
    setError(null);
    try {
      const next = await liveRepository.respondToAlwaysOnQuickConnect(
        opportunity.id,
        response,
      );
      setSnapshot(next);
      if (response === 'accept') {
        void liveRepository.wakeAlwaysOnQuickConnect(opportunity.id).catch(() => undefined);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_opportunity_response_failed');
    } finally {
      setPendingAction(null);
    }
  }, [snapshot?.opportunity]);

  return {
    snapshot,
    loading,
    pendingAction,
    error,
    refresh,
    setAvailability,
    respond,
  };
};
