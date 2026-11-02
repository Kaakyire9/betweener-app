import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { liveRepository, type CircleLiveSnapshot } from '../application/index.ts';
import { readCircleLiveSnapshotState, writeCircleLiveSnapshot } from '@/lib/offline/circle-live-store';
import { LIVE_PRODUCT_ENABLED } from '../config/live-product-release';

export const useCircleLive = (circleId: string, enabled = true) => {
  const { authStatus, canPerformAuthenticatedWrites, user } = useAuth();
  const [snapshot, setSnapshot] = useState<CircleLiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const accountId = user?.id ?? null;
  const liveEnabled = LIVE_PRODUCT_ENABLED && enabled;

  const refresh = useCallback(async () => {
    if (!liveEnabled || !circleId || authStatus !== 'authenticated' || !canPerformAuthenticatedWrites) {
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
        if (request !== requestRef.current) return;
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
  }, [accountId, authStatus, canPerformAuthenticatedWrites, circleId, liveEnabled]);

  useEffect(() => {
    if (!liveEnabled || !circleId || !accountId) {
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
    const unsubscribe = liveRepository.subscribeCircleLive(circleId, () => void refresh());
    return () => {
      requestRef.current += 1;
      unsubscribe();
    };
  }, [accountId, circleId, liveEnabled, refresh]);

  return { snapshot, loading, error, refresh };
};
