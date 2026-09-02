import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  liveRepository,
  type LivePoolCandidatePreview,
  type LiveQuorumPoolingSnapshot,
} from '../application/index.ts';

export const useLiveQuorumPooling = (sessionId: string | undefined) => {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<LiveQuorumPoolingSnapshot | null>(null);
  const [preview, setPreview] = useState<LivePoolCandidatePreview | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const requestId = ++requestIdRef.current;
    try {
      const next = await liveRepository.getQuorumPooling(sessionId);
      if (requestId !== requestIdRef.current) return;
      setSnapshot(next);
      setError(null);
      if (next.canManagePooling) {
        setPreview(await liveRepository.previewPoolCandidates(sessionId));
      } else {
        setPreview(null);
      }
    } catch (nextError) {
      if (requestId === requestIdRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'live_quorum_unavailable');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setSnapshot(null);
    setPreview(null);
    setLoading(Boolean(sessionId));
    void refresh();
  }, [refresh, sessionId]);

  useEffect(() => {
    if (!sessionId || !user?.id) return;
    return liveRepository.subscribeQuorumPooling(sessionId, user.id, () => void refresh());
  }, [refresh, sessionId, user?.id]);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await task();
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_pooling_update_failed');
    } finally {
      setSaving(false);
    }
  }, [refresh, saving]);

  const setPreference = useCallback((allowed: boolean) => run(async () => {
    await liveRepository.setPoolingPreference(allowed);
  }), [run]);

  const respondToOffer = useCallback((offerId: string, accept: boolean) => run(async () => {
    setSnapshot(await liveRepository.respondPoolOffer(offerId, accept));
  }), [run]);

  const createDefaultRule = useCallback(() => run(async () => {
    await liveRepository.createDefaultPoolRule();
  }), [run]);

  const createPool = useCallback((candidateSessionId: string, ruleId: string) => run(async () => {
    if (!sessionId) return;
    await liveRepository.createSessionPool(sessionId, candidateSessionId, ruleId);
  }), [run, sessionId]);

  return {
    snapshot,
    preview,
    loading,
    saving,
    error,
    refresh,
    setPreference,
    respondToOffer,
    createDefaultRule,
    createPool,
  };
};
