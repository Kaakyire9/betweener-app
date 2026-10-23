import { useCallback, useEffect, useRef, useState } from 'react';

import {
  studioApi,
  type StudioTeamOperatorRole,
  type StudioTeamSnapshot,
} from '../api/studio-api.ts';
import { errorMessage } from '../lib/errors.ts';

type TeamAction = 'assign_operator' | 'revoke_operator' | 'assign_host' | 'revoke_host';

export function useStudioTeam(sessionId: string) {
  const [snapshot, setSnapshot] = useState<StudioTeamSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<TeamAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const operation = studioApi.getTeam(sessionId)
      .then((value) => { setSnapshot(value); setError(null); })
      .catch((failure) => setError(errorMessage(failure, 'Studio team is unavailable.')))
      .finally(() => { inFlight.current = null; setLoading(false); });
    inFlight.current = operation;
    return operation;
  }, [sessionId]);

  useEffect(() => {
    setSnapshot(null);
    setLoading(true);
    const unsubscribe = studioApi.subscribeTeam(sessionId, () => { void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 15_000);
    void refresh();
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, [refresh, sessionId]);

  const run = useCallback(async (
    action: TeamAction,
    operation: () => Promise<StudioTeamSnapshot>,
  ) => {
    if (busy) return false;
    setBusy(action);
    setError(null);
    try {
      setSnapshot(await operation());
      return true;
    } catch (failure) {
      setError(errorMessage(failure, 'The Studio team could not be updated.'));
      return false;
    } finally {
      setBusy(null);
    }
  }, [busy]);

  return {
    snapshot,
    loading,
    busy,
    error,
    refresh,
    assignOperator: (email: string, operatorRole: StudioTeamOperatorRole) => run(
      'assign_operator',
      () => studioApi.assignOperator({ sessionId, email, operatorRole }),
    ),
    revokeOperator: (userId: string) => run(
      'revoke_operator',
      () => studioApi.revokeOperator(sessionId, userId),
    ),
    assignHost: (email: string) => run(
      'assign_host',
      () => studioApi.assignOnAirHost(sessionId, email),
    ),
    revokeHost: (userId: string) => run(
      'revoke_host',
      () => studioApi.revokeOnAirHost(sessionId, userId),
    ),
  };
}
