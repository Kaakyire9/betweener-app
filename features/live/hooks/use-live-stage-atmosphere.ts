import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { liveRepository } from '../application/live-repository.ts';
import type {
  LiveStageAtmosphere,
  LiveStageAtmospherePreset,
} from '../stage/live-stage-atmosphere.ts';

export type LiveStageAtmosphereController = {
  state: LiveStageAtmosphere | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setPreset: (preset: LiveStageAtmospherePreset) => Promise<void>;
};

const friendlyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('poster_required')) return 'Add a Live poster before using it on stage.';
  if (message.includes('version_conflict')) return 'The stage changed. Refresh and try again.';
  if (message.includes('host_required')) return 'Only the Host can change the stage atmosphere.';
  return 'The stage atmosphere could not be updated. Try again.';
};

export const useLiveStageAtmosphere = ({
  enabled,
  sessionId,
}: {
  enabled: boolean;
  sessionId: string;
}): LiveStageAtmosphereController => {
  const [state, setState] = useState<LiveStageAtmosphere | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionId) return;
    if (refreshRef.current) return refreshRef.current;
    setLoading(true);
    const operation = liveRepository.getLiveStageAtmosphere(sessionId)
      .then((next) => {
        if (mountedRef.current) { setState(next); setError(null); }
      })
      .catch((caught: unknown) => {
        if (mountedRef.current) setError(friendlyError(caught));
      })
      .finally(() => {
        refreshRef.current = null;
        if (mountedRef.current) setLoading(false);
      });
    refreshRef.current = operation;
    return operation;
  }, [enabled, sessionId]);

  useEffect(() => {
    setState(null);
    setError(null);
    if (!enabled || !sessionId) return undefined;
    const unsubscribe = liveRepository.subscribeLiveStageAtmosphere(sessionId, () => {
      void refresh();
    });
    void refresh();
    return unsubscribe;
  }, [enabled, refresh, sessionId]);

  const setPreset = useCallback(async (preset: LiveStageAtmospherePreset) => {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await liveRepository.setLiveStageAtmosphere({
        sessionId,
        preset,
        expectedVersion: state.version,
      });
      if (mountedRef.current) setState(next);
    } catch (caught) {
      if (mountedRef.current) setError(friendlyError(caught));
      if (caught instanceof Error && caught.message.includes('version_conflict')) {
        await refresh();
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, refresh, sessionId, state]);

  return useMemo(() => ({ state, loading, busy, error, refresh, setPreset }), [
    busy, error, loading, refresh, setPreset, state,
  ]);
};
