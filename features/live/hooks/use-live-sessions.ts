import { useCallback, useEffect, useState } from 'react';
import { liveRepository, type LiveSessionSummary } from '../application/index.ts';

export const useLiveSessions = () => {
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canSchedule, setCanSchedule] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [next, schedulingAllowed] = await Promise.all([
        liveRepository.listSessions(),
        liveRepository.canSchedule().catch(() => false),
      ]);
      setSessions(next);
      setCanSchedule(schedulingAllowed);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_sessions_unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, canSchedule, refresh };
};
