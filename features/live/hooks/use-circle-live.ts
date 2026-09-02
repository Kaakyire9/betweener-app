import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { liveRepository, type CircleLiveSnapshot } from '../application/index.ts';

export const useCircleLive = (circleId: string, enabled = true) => {
  const { authStatus, canPerformAuthenticatedWrites } = useAuth();
  const [snapshot, setSnapshot] = useState<CircleLiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !circleId || authStatus !== 'authenticated' || !canPerformAuthenticatedWrites) {
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    try {
      const next = await liveRepository.getCircleLiveSnapshot(circleId);
      if (request === requestRef.current) {
        setSnapshot(next);
        setError(null);
      }
    } catch (nextError) {
      if (request === requestRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'circle_live_unavailable');
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [authStatus, canPerformAuthenticatedWrites, circleId, enabled]);

  useEffect(() => {
    if (!enabled || !circleId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    return liveRepository.subscribeCircleLive(circleId, () => void refresh());
  }, [circleId, enabled, refresh]);

  return { snapshot, loading, error, refresh };
};
