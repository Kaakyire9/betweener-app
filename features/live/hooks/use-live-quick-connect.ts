import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  liveRepository,
  type LiveQuickConnectDecision,
  type LiveQuickConnectSafetyExperience,
  type LiveQuickConnectSafetyReason,
  type LiveQuickConnectSnapshot,
} from '../application/index.ts';
import {
  normalizeQuickConnectErrorCode,
  quickConnectIsWaitingForHost,
  quickConnectQueueNeedsRejoin,
} from '../domain/live-quick-connect.ts';

const HEARTBEAT_MS = 10_000;

export const useLiveQuickConnect = (sessionId: string) => {
  const [snapshot, setSnapshot] = useState<LiveQuickConnectSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const snapshotRef = useRef<LiveQuickConnectSnapshot | null>(null);
  const errorRef = useRef<string | null>(null);
  const mediaConnectedRef = useRef(false);
  const mediaPairingIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const applySnapshot = useCallback((next: LiveQuickConnectSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const applyError = useCallback((next: string | null) => {
    errorRef.current = next;
    if (mountedRef.current) setError(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId || inFlightRef.current) return inFlightRef.current ?? undefined;
    const operation = liveRepository.getQuickConnect(sessionId)
      .then((next) => {
        if (!mountedRef.current) return;
        applySnapshot(next);
        applyError(null);
      })
      .catch((nextError: unknown) => {
        if (!mountedRef.current) return;
        const code = normalizeQuickConnectErrorCode(nextError);
        console.warn('[live-quick-connect] refresh-failed', { code, sessionId });
        applyError(code);
      })
      .finally(() => {
        inFlightRef.current = null;
        if (mountedRef.current) setLoading(false);
      });
    inFlightRef.current = operation;
    return operation;
  }, [applyError, applySnapshot, sessionId]);

  const retryJoin = useCallback(async () => {
    if (!sessionId || inFlightRef.current) return inFlightRef.current ?? undefined;
    if (mountedRef.current) setLoading(true);
    const operation = liveRepository.rejoinQuickConnect(sessionId)
      .then((next) => {
        if (!mountedRef.current) return;
        applySnapshot(next);
        applyError(null);
      })
      .catch((nextError: unknown) => {
        if (!mountedRef.current) return;
        const code = normalizeQuickConnectErrorCode(nextError);
        console.warn('[live-quick-connect] join-failed', { code, sessionId });
        applyError(code);
      })
      .finally(() => {
        inFlightRef.current = null;
        if (mountedRef.current) setLoading(false);
      });
    inFlightRef.current = operation;
    return operation;
  }, [applyError, applySnapshot, sessionId]);

  const heartbeat = useCallback(async (connected: boolean) => {
    if (!sessionId) return;
    try {
      const next = await liveRepository.heartbeatQuickConnect(sessionId, connected);
      applySnapshot(next);
    } catch (nextError) {
      // A missed heartbeat is recoverable; the authoritative grace window is server-owned.
      const code = normalizeQuickConnectErrorCode(nextError);
      if (
        code === 'live_quick_connect_participant_required'
        && AppState.currentState === 'active'
        && !snapshotRef.current?.pairing
      ) {
        await retryJoin();
      }
    }
  }, [applySnapshot, retryJoin, sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    void retryJoin();
    return liveRepository.subscribeQuickConnect(sessionId, () => {
      if (
        !snapshotRef.current
        || quickConnectIsWaitingForHost(errorRef.current)
        || errorRef.current === 'live_quick_connect_participant_required'
      ) {
        void retryJoin();
        return;
      }
      void refresh();
    });
  }, [refresh, retryJoin, sessionId]);

  const isPresenceConnected = useCallback(() => {
    if (AppState.currentState !== 'active') return false;
    return snapshotRef.current?.pairing ? mediaConnectedRef.current : true;
  }, []);

  useEffect(() => {
    if (!sessionId) return undefined;
    const restoreQueuePresence = () => {
      // A closed host-controlled rotation wakes via realtime. Avoid a polling
      // loop while the host is preparing or has intentionally paused entry.
      if (quickConnectIsWaitingForHost(errorRef.current)) return;
      if (
        AppState.currentState === 'active'
        && quickConnectQueueNeedsRejoin(snapshotRef.current)
      ) {
        void retryJoin();
        return;
      }
      void heartbeat(isPresenceConnected());
    };
    const timer = setInterval(restoreQueuePresence, HEARTBEAT_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && quickConnectQueueNeedsRejoin(snapshotRef.current)) {
        void retryJoin();
        return;
      }
      const connected = state === 'active'
        && (!snapshotRef.current?.pairing || mediaConnectedRef.current);
      void heartbeat(connected);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      void liveRepository.heartbeatQuickConnect(sessionId, false).catch(() => undefined);
    };
  }, [heartbeat, isPresenceConnected, retryJoin, sessionId]);

  const reportMediaConnected = useCallback((connected: boolean) => {
    const wasConnected = mediaConnectedRef.current;
    mediaConnectedRef.current = connected;
    // Ignore the initial pre-join false state. Once transport has connected,
    // every subsequent edge is authoritative and should reach the server now.
    if (!connected && !wasConnected) return;
    void heartbeat(connected && AppState.currentState === 'active');
  }, [heartbeat]);

  const beginMediaPairing = useCallback((pairingId: string) => {
    if (mediaPairingIdRef.current === pairingId) return;
    mediaPairingIdRef.current = pairingId;
    // A new pair must prove its own RTC transport. Do not carry the previous
    // round's connected state forward, and do not start grace before join.
    mediaConnectedRef.current = false;
  }, []);

  const decide = useCallback(async (decision: LiveQuickConnectDecision) => {
    if (!snapshot?.pairing || busy) return false;
    setBusy(true);
    applyError(null);
    try {
      const next = await liveRepository.decideQuickConnect(snapshot.pairing.id, decision);
      applySnapshot(next);
      return true;
    } catch (nextError) {
      if (mountedRef.current) {
        const code = normalizeQuickConnectErrorCode(nextError);
        console.warn('[live-quick-connect] decision-failed', { code, sessionId });
        applyError(code);
      }
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [applyError, applySnapshot, busy, sessionId, snapshot?.pairing]);

  const leave = useCallback(async () => {
    if (!sessionId) return;
    await liveRepository.leaveQuickConnect(sessionId);
    if (mountedRef.current) await refresh();
  }, [refresh, sessionId]);

  const submitSafetyCheck = useCallback(async (
    pairingId: string,
    experience: LiveQuickConnectSafetyExperience,
    reason: LiveQuickConnectSafetyReason | null,
    block: boolean,
  ) => {
    if (busy) return false;
    setBusy(true);
    applyError(null);
    try {
      await liveRepository.submitQuickConnectSafetyCheck(pairingId, experience, reason, block);
      return true;
    } catch (nextError) {
      if (mountedRef.current) {
        const code = normalizeQuickConnectErrorCode(nextError);
        console.warn('[live-quick-connect] safety-check-failed', { code, sessionId });
        applyError(code);
      }
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [applyError, busy, sessionId]);

  return {
    snapshot,
    loading,
    busy,
    error,
    refresh,
    retryJoin,
    decide,
    leave,
    submitSafetyCheck,
    beginMediaPairing,
    reportMediaConnected,
  };
};
