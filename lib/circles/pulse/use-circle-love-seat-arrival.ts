import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@/lib/telemetry/logger';
import {
  acknowledgeCircleLoveSeatArrival,
  getCircleLoveSeatArrivalAcknowledged,
} from './circle-pulse-service';

const STORAGE_PREFIX = 'circle-love-seat-arrival:v1';

export const buildCircleLoveSeatArrivalKey = (
  circleId: string,
  loveSeatId: string,
  viewerProfileId: string,
) => `${STORAGE_PREFIX}:${viewerProfileId}:${circleId}:${loveSeatId}`;

type Options = {
  circleId: string;
  loveSeatId?: string | null;
  viewerProfileId?: string | null;
  enabled: boolean;
};

export function useCircleLoveSeatArrival({
  circleId,
  loveSeatId,
  viewerProfileId,
  enabled,
}: Options) {
  const [visible, setVisible] = useState(false);
  const presentedKeyRef = useRef<string | null>(null);
  const storageKey = useMemo(
    () => circleId && loveSeatId && viewerProfileId
      ? buildCircleLoveSeatArrivalKey(circleId, loveSeatId, viewerProfileId)
      : null,
    [circleId, loveSeatId, viewerProfileId],
  );

  useEffect(() => {
    let cancelled = false;
    setVisible(false);

    if (!enabled || !storageKey || presentedKeyRef.current === storageKey) {
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(storageKey)
      .then(async (seenAt) => {
        if (cancelled) return;
        if (seenAt) {
          void acknowledgeCircleLoveSeatArrival(circleId, loveSeatId!, viewerProfileId!).catch(() => undefined);
          return;
        }
        try {
          const acknowledged = await getCircleLoveSeatArrivalAcknowledged(circleId, loveSeatId!, viewerProfileId!);
          if (cancelled || acknowledged) {
            if (acknowledged) void AsyncStorage.setItem(storageKey, new Date().toISOString()).catch(() => undefined);
            return;
          }
        } catch (error) {
          logger.warn('[circles] love_seat_arrival_server_read_failed', {
            circleId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        if (cancelled) return;
        presentedKeyRef.current = storageKey;
        setVisible(true);
      })
      .catch((error) => {
        if (cancelled) return;
        presentedKeyRef.current = storageKey;
        setVisible(true);
        logger.warn('[circles] love_seat_arrival_read_failed', {
          circleId,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [circleId, enabled, storageKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (!storageKey) return;
    void AsyncStorage.setItem(storageKey, new Date().toISOString()).catch((error) => {
      logger.warn('[circles] love_seat_arrival_write_failed', {
        circleId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    if (loveSeatId && viewerProfileId) {
      void acknowledgeCircleLoveSeatArrival(circleId, loveSeatId, viewerProfileId).catch((error) => {
        logger.warn('[circles] love_seat_arrival_server_write_failed', {
          circleId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }, [circleId, loveSeatId, storageKey, viewerProfileId]);

  return { visible, dismiss };
}
