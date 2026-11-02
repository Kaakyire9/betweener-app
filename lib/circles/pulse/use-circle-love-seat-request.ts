import { useCallback, useEffect, useState } from 'react';

import {
  cancelCircleLoveSeatRequest,
  fetchMyCircleLoveSeatRequest,
  requestCircleLoveSeat,
} from './circle-pulse-service';
import type { CircleLoveSeatRequest } from './circle-pulse-types';
import { useCircleLoveSeatInvalidation } from './use-circle-love-seat-invalidation';

export function useCircleLoveSeatRequest({
  circleId,
  profileId,
  enabled,
}: {
  circleId: string;
  profileId?: string | null;
  enabled: boolean;
}) {
  const [request, setRequest] = useState<CircleLoveSeatRequest | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !circleId || !profileId) {
      setRequest(null);
      return null;
    }
    const nextRequest = await fetchMyCircleLoveSeatRequest(circleId, profileId);
    setRequest(nextRequest);
    return nextRequest;
  }, [circleId, enabled, profileId]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !circleId || !profileId) {
      setRequest(null);
      return () => {
        cancelled = true;
      };
    }

    void fetchMyCircleLoveSeatRequest(circleId, profileId)
      .then((nextRequest) => {
        if (!cancelled) setRequest(nextRequest);
      })
      .catch(() => {
        if (!cancelled) setRequest(null);
      });

    return () => {
      cancelled = true;
    };
  }, [circleId, enabled, profileId]);

  useCircleLoveSeatInvalidation({
    circleId,
    enabled: enabled && !!profileId,
    reload,
  });

  const joinQueue = useCallback(async (note?: string | null) => {
    if (!circleId || !profileId || loading) return null;
    setLoading(true);
    try {
      await requestCircleLoveSeat(circleId, profileId, note);
      return await reload();
    } finally {
      setLoading(false);
    }
  }, [circleId, loading, profileId, reload]);

  const leaveQueue = useCallback(async () => {
    if (!request || !profileId || loading) return;
    setLoading(true);
    try {
      await cancelCircleLoveSeatRequest(request.id, profileId);
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [loading, profileId, request]);

  return {
    request,
    loading,
    reload,
    joinQueue,
    leaveQueue,
  };
}
