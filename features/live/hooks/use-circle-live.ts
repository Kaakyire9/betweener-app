import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { liveRepository, type CircleLiveSnapshot } from '../application/index.ts';
import { readCircleLiveSnapshotState, writeCircleLiveSnapshot } from '@/lib/offline/circle-live-store';

export const useCircleLive = (circleId: string, enabled = true) => {
  const { authStatus, canPerformAuthenticatedWrites, user } = useAuth();
  const [snapshot, setSnapshot] = useState<CircleLiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const accountId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!enabled || !circleId || authStatus !== 'authenticated' || !canPerformAuthenticatedWrites) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    try {
      const next = await liveRepository.getCircleLiveSnapshot(circleId);
      if (request === requestRef.current) {
        setSnapshot(next);
        setError(null);
        void writeCircleLiveSnapshot(circleId, accountId, next);
      }
    } catch (nextError) {
      if (request === requestRef.current) {
        const cached = await readCircleLiveSnapshotState(circleId, accountId);
        if (cached.data) {
          setSnapshot(cached.data);
          setError('Showing saved Circle Live information.');
        } else {
          setSnapshot(null);
          setError(nextError instanceof Error ? nextError.message : 'circle_live_unavailable');
        }
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [accountId, authStatus, canPerformAuthenticatedWrites, circleId, enabled]);

  useEffect(() => {
    if (!enabled || !circleId || !accountId) {
      requestRef.current += 1;
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    requestRef.current += 1;
    setSnapshot(null);
    setError(null);
    setLoading(true);
    void refresh();
    return liveRepository.subscribeCircleLive(circleId, () => void refresh());
  }, [accountId, circleId, enabled, refresh]);

  return { snapshot, loading, error, refresh };
};
