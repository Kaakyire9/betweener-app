import { useCallback, useEffect, useState } from 'react';

import { studioApi, type StudioOperatorConsole } from '../api/studio-api.ts';

export function useOperatorConsole(
  sessionId: string,
  controllerInstanceId: string,
  ownsControl: boolean,
) {
  const [consoleState, setConsoleState] = useState<StudioOperatorConsole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConsoleState(await studioApi.getOperatorConsole(sessionId));
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Operator console unavailable.');
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const heartbeat = () => studioApi.heartbeatOperator(
      sessionId,
      controllerInstanceId,
      document.visibilityState === 'hidden' ? 'standby' : ownsControl ? 'primary' : 'ready',
    ).catch(() => undefined);
    void heartbeat();
    const interval = window.setInterval(() => { void heartbeat(); }, 10_000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', heartbeat);
    };
  }, [controllerInstanceId, ownsControl, sessionId]);

  return { consoleState, error, refresh };
}
