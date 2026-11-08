import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  liveRepository,
  type LivePrivateActivitySnapshot,
} from '../application/index.ts';

export const useLivePrivateActivity = (sessionId: string, enabled: boolean) => {
  const [snapshot, setSnapshot] = useState<LivePrivateActivitySnapshot | null>(null);
  const sourceKey = `${enabled ? 'on' : 'off'}:${sessionId}`;
  const sourceKeyRef = useRef(sourceKey);
  const inFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const refreshQueuedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionId) return;
    const requestedKey = sourceKey;
    if (inFlightRef.current?.key === requestedKey) {
      refreshQueuedRef.current.add(requestedKey);
      return inFlightRef.current.promise;
    }
    const operation = (async () => {
      do {
        refreshQueuedRef.current.delete(requestedKey);
        try {
          const next = await liveRepository.getPrivateActivity(sessionId);
          if (
            mountedRef.current
            && sourceKeyRef.current === requestedKey
            && next.sessionId === sessionId
          ) setSnapshot(next);
        } catch {
          // Aggregate presence is decorative and must never interrupt the room.
        }
      } while (
        mountedRef.current
        && sourceKeyRef.current === requestedKey
        && refreshQueuedRef.current.has(requestedKey)
      );
    })().finally(() => {
      if (inFlightRef.current?.key === requestedKey) inFlightRef.current = null;
      refreshQueuedRef.current.delete(requestedKey);
    });
    inFlightRef.current = { key: requestedKey, promise: operation };
    return operation;
  }, [enabled, sessionId, sourceKey]);

  useEffect(() => {
    sourceKeyRef.current = sourceKey;
    mountedRef.current = true;
    if (!enabled) {
      setSnapshot(null);
      return () => { mountedRef.current = false; };
    }
    void refresh();
    const unsubscribe = liveRepository.subscribePrivateActivity(sessionId, () => void refresh());
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
      foreground.remove();
    };
  }, [enabled, refresh, sessionId, sourceKey]);

  return { snapshot, refresh };
};
