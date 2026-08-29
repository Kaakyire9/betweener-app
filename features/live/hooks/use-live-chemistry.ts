import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/telemetry/logger';
import {
  liveRepository,
  type LiveChemistrySnapshot,
} from '../application/index.ts';

type LiveChemistrySource = {
  kind: 'private_spark' | 'quick_connect';
  id: string;
  enabled?: boolean;
};

const chemistryErrorCode = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export const useLiveChemistry = ({ kind, id, enabled = true }: LiveChemistrySource) => {
  const [snapshotState, setSnapshotState] = useState<{
    sourceKey: string;
    value: LiveChemistrySnapshot;
  } | null>(null);
  const [loading, setLoading] = useState(enabled && Boolean(id));
  const [busy, setBusy] = useState(false);
  const [errorState, setErrorState] = useState<{
    sourceKey: string;
    message: string;
  } | null>(null);
  const mountedRef = useRef(true);
  const sourceKey = `${enabled ? 'enabled' : 'disabled'}:${kind}:${id}`;
  const sourceKeyRef = useRef(sourceKey);
  sourceKeyRef.current = sourceKey;
  const snapshot = snapshotState?.sourceKey === sourceKey ? snapshotState.value : null;
  const error = errorState?.sourceKey === sourceKey ? errorState.message : null;
  const refreshRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const refreshQueuedRef = useRef(false);
  const lastProjectionErrorRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const requestedSourceKey = `${enabled ? 'enabled' : 'disabled'}:${kind}:${id}`;
    if (!enabled || !id) {
      setSnapshotState(null);
      setLoading(false);
      return;
    }
    if (refreshRef.current?.key === requestedSourceKey) {
      refreshQueuedRef.current = true;
      return refreshRef.current.promise;
    }
    const operation = (kind === 'private_spark'
      ? liveRepository.getPrivateSparkChemistry(id)
      : liveRepository.getQuickConnectChemistry(id))
      .then((value) => {
        if (!mountedRef.current || sourceKeyRef.current !== requestedSourceKey) return;
        if (value && (value.sourceKind !== kind || value.sourceId !== id)) {
          throw new Error('live_chemistry_source_mismatch');
        }
        if (value) setSnapshotState({ sourceKey: requestedSourceKey, value });
        else setSnapshotState(null);
        setErrorState(null);
        lastProjectionErrorRef.current = null;
      })
      .catch((nextError: unknown) => {
        if (!mountedRef.current || sourceKeyRef.current !== requestedSourceKey) return;
        const code = chemistryErrorCode(nextError, 'live_chemistry_unavailable');
        const diagnosticKey = `${requestedSourceKey}:${code}`;
        if (lastProjectionErrorRef.current !== diagnosticKey) {
          lastProjectionErrorRef.current = diagnosticKey;
          logger.error('[live-chemistry] projection-failed', nextError, {
            code,
            sourceKind: kind,
            sourceId: id,
          });
        }
        setErrorState({
          sourceKey: requestedSourceKey,
          message: code,
        });
      })
      .finally(() => {
        if (refreshRef.current?.promise === operation) refreshRef.current = null;
        if (mountedRef.current && sourceKeyRef.current === requestedSourceKey) setLoading(false);
        if (sourceKeyRef.current === requestedSourceKey && refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          queueMicrotask(() => { void refresh(); });
        }
      });
    refreshRef.current = { key: requestedSourceKey, promise: operation };
    return operation;
  }, [enabled, id, kind]);

  useEffect(() => {
    setLoading(enabled && Boolean(id));
    setSnapshotState(null);
    setErrorState(null);
    setBusy(false);
    refreshQueuedRef.current = false;
    lastProjectionErrorRef.current = null;
    void refresh();
  }, [enabled, id, kind, refresh]);

  useEffect(() => {
    if (!snapshot?.id) return undefined;
    return liveRepository.subscribeChemistry(snapshot.id, () => void refresh());
  }, [refresh, snapshot?.id]);

  const run = useCallback(async (operation: 'offer' | 'ready') => {
    if (!snapshot || busy) return false;
    const actionSourceKey = sourceKey;
    setBusy(true);
    setErrorState(null);
    try {
      const next = operation === 'offer'
        ? await liveRepository.offerChemistryReveal(snapshot.id)
        : await liveRepository.markChemistryReady(snapshot.id);
      if (
        mountedRef.current
        && sourceKeyRef.current === actionSourceKey
        && next.sourceKind === kind
        && next.sourceId === id
      ) {
        setSnapshotState({ sourceKey: actionSourceKey, value: next });
      }
      return true;
    } catch (nextError) {
      const code = chemistryErrorCode(nextError, 'live_chemistry_action_failed');
      logger.error('[live-chemistry] action-failed', nextError, {
        code,
        operation,
        sourceKind: kind,
        sourceId: id,
        conversationId: snapshot.id,
      });
      if (mountedRef.current && sourceKeyRef.current === actionSourceKey) {
        setErrorState({
          sourceKey: actionSourceKey,
          message: code,
        });
      }
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, id, kind, snapshot, sourceKey]);

  return {
    snapshot,
    loading,
    busy,
    error,
    refresh,
    offerReveal: () => run('offer'),
    markReady: () => run('ready'),
  };
};
