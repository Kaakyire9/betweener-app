import { useCallback, useEffect, useRef, useState } from 'react';
import {
  liveRepository,
  type LivePrivateSpark,
  type LivePrivateSparkExitDecision,
} from '../application/index.ts';

export const useLivePrivateSpark = (privateSparkId: string) => {
  const [spark, setSpark] = useState<LivePrivateSpark | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const refresh = useCallback(async () => {
    if (!privateSparkId) return;
    if (inFlightRef.current) return inFlightRef.current;
    const operation = liveRepository.getPrivateSpark(privateSparkId)
      .then((next) => {
        if (!mountedRef.current) return;
        setSpark(next);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!mountedRef.current) return;
        setError(nextError instanceof Error ? nextError.message : 'live_private_spark_unavailable');
      })
      .finally(() => {
        inFlightRef.current = null;
        if (mountedRef.current) setLoading(false);
      });
    inFlightRef.current = operation;
    return operation;
  }, [privateSparkId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!spark?.sessionId) return undefined;
    return liveRepository.subscribeHostedMatching(spark.sessionId, () => void refresh());
  }, [refresh, spark?.sessionId]);

  const end = useCallback(async (reason = 'left') => {
    if (!spark || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const next = await liveRepository.endPrivateSpark(spark.id, reason);
      if (mountedRef.current) setSpark(next);
      return true;
    } catch (nextError) {
      if (mountedRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_private_spark_end_failed');
      }
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, spark]);

  const submitExit = useCallback(async (decision: LivePrivateSparkExitDecision) => {
    if (!spark || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const next = await liveRepository.submitPrivateSparkExit(spark.id, decision);
      if (mountedRef.current) setSpark(next);
      return true;
    } catch (nextError) {
      if (mountedRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_private_spark_exit_failed');
      }
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, spark]);

  return { spark, loading, busy, error, refresh, end, submitExit };
};
