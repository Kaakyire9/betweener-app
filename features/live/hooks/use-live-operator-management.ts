import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  LiveStudioOperatorManagementSnapshot,
  LiveStudioSessionOperatorRole,
} from '../application/live-models.ts';
import { liveRepository } from '../application/live-repository.ts';

export type LiveOperatorManagementController = {
  snapshot: LiveStudioOperatorManagementSnapshot | null;
  loading: boolean;
  busyUserId: string | null;
  assigning: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  assign: (input: {
    email: string;
    operatorRole: LiveStudioSessionOperatorRole;
    expiresAt?: string | null;
    note?: string | null;
  }) => Promise<boolean>;
  revoke: (userId: string) => Promise<boolean>;
};

export const useLiveOperatorManagement = (options: {
  sessionId: string;
  enabled: boolean;
}): LiveOperatorManagementController => {
  const [snapshot, setSnapshot] = useState<LiveStudioOperatorManagementSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await liveRepository.getStudioOperatorManagement(options.sessionId);
      if (requestId === requestIdRef.current) setSnapshot(next);
    } catch (nextError) {
      if (requestId === requestIdRef.current) {
        setError(nextError instanceof Error
          ? nextError.message
          : 'live_studio_operator_management_failed');
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [options.enabled, options.sessionId]);

  useEffect(() => {
    if (!options.enabled || !options.sessionId) {
      setSnapshot(null);
      setError(null);
      return;
    }
    void refresh();
  }, [options.enabled, options.sessionId, refresh]);

  return useMemo(() => ({
    snapshot,
    loading,
    busyUserId,
    assigning,
    error,
    clearError: () => setError(null),
    refresh,
    assign: async (input: {
      email: string;
      operatorRole: LiveStudioSessionOperatorRole;
      expiresAt?: string | null;
      note?: string | null;
    }) => {
      if (assigning || busyUserId) return false;
      setAssigning(true);
      setError(null);
      try {
        setSnapshot(await liveRepository.assignStudioOperator({
          sessionId: options.sessionId,
          ...input,
        }));
        return true;
      } catch (nextError) {
        setError(nextError instanceof Error
          ? nextError.message
          : 'live_studio_operator_assignment_failed');
        return false;
      } finally {
        setAssigning(false);
      }
    },
    revoke: async (userId: string) => {
      if (assigning || busyUserId) return false;
      setBusyUserId(userId);
      setError(null);
      try {
        setSnapshot(await liveRepository.revokeStudioOperator(options.sessionId, userId));
        return true;
      } catch (nextError) {
        setError(nextError instanceof Error
          ? nextError.message
          : 'live_studio_operator_revocation_failed');
        return false;
      } finally {
        setBusyUserId(null);
      }
    },
  }), [assigning, busyUserId, error, options.sessionId, refresh, snapshot]);
};
