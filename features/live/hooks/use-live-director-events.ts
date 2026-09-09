import { useEffect, useState } from 'react';

import { liveRepository } from '../application/live-repository.ts';
import type {
  LiveDirectorEvent,
  OdoDirectorSnapshot,
} from '../odo/domain/odo-contracts.ts';

type LiveDirectorEventsState = {
  events: readonly LiveDirectorEvent[];
  error: string | null;
  snapshot: OdoDirectorSnapshot | null;
};

export const useLiveDirectorEvents = (
  sessionId: string,
  enabled: boolean,
): LiveDirectorEventsState => {
  const [state, setState] = useState<LiveDirectorEventsState>({
    events: [],
    error: null,
    snapshot: null,
  });

  useEffect(() => {
    setState({ events: [], error: null, snapshot: null });
    if (!enabled || !sessionId) return undefined;

    let active = true;
    let cursor = 0;
    let fetching = false;
    let refreshQueued = false;
    const seen = new Set<string>();

    const refresh = async (): Promise<void> => {
      if (fetching) {
        refreshQueued = true;
        return;
      }
      fetching = true;
      try {
        do {
          refreshQueued = false;
          const read = await liveRepository.getLiveDirectorEvents(sessionId, cursor);
          if (!active) return;
          const { events } = read;
          setState((current) => ({
            ...current,
            error: null,
            snapshot: read.snapshot,
          }));
          if (events.length > 0) {
            cursor = Math.max(cursor, ...events.map((event) => event.sequenceNumber));
            const unseen = events.filter((event) => {
              if (seen.has(event.eventId)) return false;
              seen.add(event.eventId);
              return true;
            });
            if (unseen.length > 0) {
              setState((current) => ({
                error: null,
                events: [...current.events, ...unseen].slice(-50),
                snapshot: read.snapshot,
              }));
            }
            if (events.length === 100) refreshQueued = true;
          }
        } while (refreshQueued && active);
      } catch (error) {
        if (active) {
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : 'live_director_refresh_failed',
          }));
        }
      } finally {
        fetching = false;
      }
    };

    const unsubscribe = liveRepository.subscribeLiveDirector(sessionId, () => void refresh());
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled, sessionId]);

  return state;
};
