import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/telemetry/logger';
import { fetchCirclePulseItems } from './circle-pulse-service';
import type { CirclePulseItem } from './circle-pulse-types';
import { useCirclePulseRefresh } from './use-circle-pulse-refresh';

export function useCirclePulse({ circleId, enabled }: { circleId: string; enabled: boolean }) {
  const [items, setItems] = useState<CirclePulseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!circleId || !enabled) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setItems(await fetchCirclePulseItems(circleId));
    } catch (loadError) {
      logger.warn('[circles] pulse_load_failed', {
        circleId,
        message: loadError instanceof Error ? loadError.message : String(loadError),
      });
      setError('Circle Pulse could not refresh.');
    } finally {
      setLoading(false);
    }
  }, [circleId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useCirclePulseRefresh({
    enabled: enabled && !!circleId,
    reload,
  });

  return { items, loading, error, reload };
}
