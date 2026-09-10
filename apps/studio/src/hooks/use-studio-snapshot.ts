import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioOperationalSnapshot } from '@betweener/live-program-domain';

import { studioApi } from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';

export const useStudioSnapshot = (sessionId: string) => {
  const [snapshot, setSnapshot] = useState<StudioOperationalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const operation = studioApi.getSnapshot(sessionId)
      .then((value) => { setSnapshot(value); setError(null); })
      .catch((failure) => setError(errorMessage(failure, 'Programme state is unavailable.')))
      .finally(() => { inFlight.current = null; setLoading(false); });
    inFlight.current = operation;
    return operation;
  }, [sessionId]);

  useEffect(() => {
    setSnapshot(null);
    setLoading(true);
    const unsubscribe = studioApi.subscribe(sessionId, () => { void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 15_000);
    void refresh();
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, [refresh, sessionId]);

  return { snapshot, setSnapshot, error, loading, refresh };
};
