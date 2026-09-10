import { useCallback, useEffect, useState } from 'react';
import type { StudioSessionSummary } from '@betweener/live-program-domain';

import { studioApi } from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';

export const useStudioSessions = () => {
  const [sessions, setSessions] = useState<StudioSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSessions(await studioApi.listSessions());
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure, 'Studio sessions are unavailable.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { sessions, loading, error, refresh };
};
