import { useCallback, useEffect, useRef, useState } from 'react';
import { liveRepository, type LiveSessionRecap } from '../application/index.ts';

export function useLiveSessionRecap(sessionId: string, enabled = true) {
  const [recap, setRecap] = useState<LiveSessionRecap | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionId) {
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await liveRepository.getSessionRecap(sessionId);
      if (requestId === requestIdRef.current) setRecap(next);
    } catch (nextError) {
      if (requestId === requestIdRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_session_recap_unavailable');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [enabled, sessionId]);

  useEffect(() => {
    setRecap(null);
    void refresh();
    return () => { requestIdRef.current += 1; };
  }, [refresh]);

  return { recap, loading, error, refresh };
}
