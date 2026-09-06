import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@/lib/telemetry/logger';
import {
  fetchCirclePulseWelcomeViewStates,
  recordCirclePulseWelcomeEvent,
} from './circle-pulse-service';
import type { CirclePulseWelcomeEventType } from './circle-pulse-types';

type Options = {
  circleId: string;
  viewerProfileId?: string | null;
  profileIds: string[];
  enabled: boolean;
};

export function useCirclePulseWelcomeState({
  circleId,
  viewerProfileId,
  profileIds,
  enabled,
}: Options) {
  const [seenProfileIds, setSeenProfileIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const recordedImpressionKeyRef = useRef<string | null>(null);
  const profileKey = useMemo(() => [...profileIds].sort().join(':'), [profileIds]);

  useEffect(() => {
    let cancelled = false;
    recordedImpressionKeyRef.current = null;
    if (!enabled || !circleId || !viewerProfileId) {
      setSeenProfileIds(new Set());
      setLoaded(false);
      return () => {
        cancelled = true;
      };
    }

    setLoaded(false);
    void fetchCirclePulseWelcomeViewStates(circleId, viewerProfileId)
      .then((states) => {
        if (cancelled) return;
        setSeenProfileIds(new Set(states.filter((state) => !!state.firstSeenAt).map((state) => state.profileId)));
      })
      .catch((error) => {
        if (cancelled) return;
        logger.warn('[circles] pulse_welcome_state_load_failed', {
          circleId,
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [circleId, enabled, profileKey, viewerProfileId]);

  const recordEvent = useCallback(async (
    targetProfileIds: string[],
    eventType: CirclePulseWelcomeEventType,
  ) => {
    if (!enabled || !circleId || !viewerProfileId || targetProfileIds.length === 0) return;
    try {
      await recordCirclePulseWelcomeEvent(circleId, viewerProfileId, targetProfileIds, eventType);
      if (eventType !== 'impression') {
        setSeenProfileIds((current) => new Set([...current, ...targetProfileIds]));
      }
    } catch (error) {
      logger.warn('[circles] pulse_welcome_event_failed', {
        circleId,
        eventType,
        targetCount: targetProfileIds.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [circleId, enabled, viewerProfileId]);

  useEffect(() => {
    if (!loaded || !enabled || profileIds.length === 0) return;
    const visibleProfileIds = profileIds.slice(0, 5);
    const impressionKey = `${circleId}:${viewerProfileId}:${visibleProfileIds.join(':')}`;
    if (recordedImpressionKeyRef.current === impressionKey) return;
    recordedImpressionKeyRef.current = impressionKey;
    void recordEvent(visibleProfileIds, 'impression');
  }, [circleId, enabled, loaded, profileKey, profileIds, recordEvent, viewerProfileId]);

  return { seenProfileIds, recordEvent };
}
