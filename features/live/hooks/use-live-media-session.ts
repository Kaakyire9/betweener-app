import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { logger } from '@/lib/telemetry/logger';
import {
  recoveryJoinOptions,
  shouldRecoverLiveMediaTransport,
} from '../media/live-media-recovery.ts';
import { requestLiveMediaAdmission } from '../media/request-live-media-admission.ts';
import {
  StreamLiveMediaProvider,
  type StreamLiveMediaBindings,
} from '../media/stream-live-media-provider.ts';
import type { LiveMediaJoinMode } from '../media/live-media-provider.ts';

export type LiveMediaControllerState =
  | 'idle'
  | 'preparing'
  | 'joined'
  | 'reconnecting'
  | 'failed';

export type LiveMediaAuthorityState = 'idle' | 'syncing' | 'ready' | 'failed';

export const useLiveMediaSession = (sessionId: string) => {
  const providerRef = useRef<StreamLiveMediaProvider | null>(null);
  const [bindings, setBindings] = useState<StreamLiveMediaBindings | null>(null);
  const [state, setState] = useState<LiveMediaControllerState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioState] = useState(false);
  const [videoEnabled, setVideoState] = useState(false);
  const [publishAuthorized, setPublishAuthorized] = useState(false);
  const [authorityState, setAuthorityState] = useState<LiveMediaAuthorityState>('idle');
  const publishAuthorizedRef = useRef(false);
  const desiredAudioEnabledRef = useRef(false);
  const desiredVideoEnabledRef = useRef(false);
  const shouldMaintainConnectionRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const recoveryPromiseRef = useRef<Promise<void> | null>(null);
  const joinInFlightRef = useRef(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoverConnectionRef = useRef<(reason: string) => void>(() => undefined);
  const mountedRef = useRef(true);
  const joinAttemptRef = useRef(0);

  if (!providerRef.current) providerRef.current = new StreamLiveMediaProvider();

  const join = useCallback(async (options: {
    mode: LiveMediaJoinMode;
    audioEnabled: boolean;
    videoEnabled: boolean;
  }) => {
    const provider = providerRef.current;
    if (!provider) return;
    const attempt = ++joinAttemptRef.current;
    shouldMaintainConnectionRef.current = true;
    desiredAudioEnabledRef.current = options.audioEnabled;
    desiredVideoEnabledRef.current = options.videoEnabled;
    setState('preparing');
    setError(null);
    joinInFlightRef.current = true;
    try {
      const admission = await requestLiveMediaAdmission({ sessionId });
      const admissionCanPublish = admission.capabilities.includes('live.publish');
      const renew = () => requestLiveMediaAdmission({ sessionId });
      await provider.initialize(admission, renew);
      if (!mountedRef.current || attempt !== joinAttemptRef.current) return;
      const result = await provider.joinSession(options);
      if (!mountedRef.current || attempt !== joinAttemptRef.current) return;
      setBindings(provider.getPresentationBindings());
      setAudioState(result.audioEnabled);
      setVideoState(result.videoEnabled);
      publishAuthorizedRef.current = admissionCanPublish;
      setPublishAuthorized(admissionCanPublish);
      setAuthorityState('ready');
      setState('joined');
      if (result.deviceIssues.length > 0) {
        const issue = result.deviceIssues[0];
        setError(`live_${issue.device}_needs_attention`);
        logger.warn('[live-media] joined-with-device-attention', {
          sessionId,
          device: issue.device,
          code: issue.code,
        });

        // The private Vision Camera preview may still be releasing its native
        // capture session on route handoff. Retry publication without leaving
        // the already-connected room.
        if (options.videoEnabled && !result.videoEnabled) {
          for (const delayMs of [450, 1_100]) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (!mountedRef.current || attempt !== joinAttemptRef.current) return;
            try {
              await provider.setVideoEnabled(true);
              setVideoState(true);
              setError(null);
              break;
            } catch (retryError) {
              logger.warn('[live-media] camera-handoff-retry-failed', {
                sessionId,
                delayMs,
                code: retryError instanceof Error ? retryError.message : 'unknown',
              });
            }
          }
        }
      }
    } catch (nextError) {
      if (!mountedRef.current || attempt !== joinAttemptRef.current) return;
      setBindings(null);
      publishAuthorizedRef.current = false;
      setPublishAuthorized(false);
      setAuthorityState('failed');
      setError(nextError instanceof Error ? nextError.message : 'live_media_join_failed');
      setState('failed');
      logger.error('[live-media] room-join-failed', nextError, {
        sessionId,
        mode: options.mode,
      });
    } finally {
      joinInFlightRef.current = false;
    }
  }, [sessionId]);

  const recoverConnection = useCallback((reason: string) => {
    if (
      recoveryPromiseRef.current
      || joinInFlightRef.current
      || !mountedRef.current
      || !shouldMaintainConnectionRef.current
      || appStateRef.current !== 'active'
    ) return;
    const provider = providerRef.current;
    if (!provider) return;

    const recovery = (async () => {
      const attempt = ++joinAttemptRef.current;
      setState('reconnecting');
      setError(null);
      setAuthorityState('syncing');
      logger.warn('[live-media] transport-recovery-started', { sessionId, reason });
      try {
        const admission = await requestLiveMediaAdmission({ sessionId });
        const renew = () => requestLiveMediaAdmission({ sessionId });
        const options = recoveryJoinOptions(admission, {
          audioEnabled: desiredAudioEnabledRef.current,
          videoEnabled: desiredVideoEnabledRef.current,
        });
        await provider.resetConnection();
        if (!mountedRef.current || attempt !== joinAttemptRef.current) return;
        setBindings(null);
        await provider.initialize(admission, renew);
        const result = await provider.joinSession(options);
        if (!mountedRef.current || attempt !== joinAttemptRef.current) return;

        const canPublish = admission.capabilities.includes('live.publish');
        setBindings(provider.getPresentationBindings());
        setAudioState(result.audioEnabled);
        setVideoState(result.videoEnabled);
        publishAuthorizedRef.current = canPublish;
        setPublishAuthorized(canPublish);
        setAuthorityState('ready');
        setState('joined');
        setError(result.deviceIssues.length > 0
          ? `live_${result.deviceIssues[0].device}_needs_attention`
          : null);
        logger.info('[live-media] transport-recovery-succeeded', {
          sessionId,
          reason,
          mode: options.mode,
        });
      } catch (nextError) {
        if (!mountedRef.current || attempt !== joinAttemptRef.current) return;
        setBindings(null);
        publishAuthorizedRef.current = false;
        setPublishAuthorized(false);
        setAuthorityState('failed');
        setState('failed');
        setError('live_media_rejoin_failed');
        logger.error('[live-media] transport-recovery-failed', nextError, {
          sessionId,
          reason,
        });
      }
    })();
    recoveryPromiseRef.current = recovery.finally(() => {
      recoveryPromiseRef.current = null;
    });
  }, [sessionId]);

  recoverConnectionRef.current = recoverConnection;

  const leave = useCallback(async () => {
    shouldMaintainConnectionRef.current = false;
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
    joinAttemptRef.current += 1;
    await providerRef.current?.leaveSession().catch(() => undefined);
    setAudioState(false);
    setVideoState(false);
    publishAuthorizedRef.current = false;
    setPublishAuthorized(false);
    setAuthorityState('idle');
    setState('idle');
  }, []);

  const reconcileAuthority = useCallback(async (expectedCanPublish: boolean) => {
    const provider = providerRef.current;
    if (!provider || provider.state !== 'joined') return false;
    if (publishAuthorizedRef.current === expectedCanPublish) {
      setAuthorityState('ready');
      return true;
    }

    const attempt = ++joinAttemptRef.current;
    setAuthorityState('syncing');
    setError(null);
    try {
      let admission = await requestLiveMediaAdmission({ sessionId });
      for (const delayMs of [250, 750]) {
        if (admission.capabilities.includes('live.publish') === expectedCanPublish) break;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (!mountedRef.current || attempt !== joinAttemptRef.current) return false;
        admission = await requestLiveMediaAdmission({ sessionId });
      }
      const actualCanPublish = admission.capabilities.includes('live.publish');
      if (actualCanPublish !== expectedCanPublish) {
        throw new Error('live_publish_authority_sync_pending');
      }

      await provider.reconcileAdmission(admission);
      if (!expectedCanPublish) {
        await provider.revokePublishPermission();
        setAudioState(false);
        setVideoState(false);
        desiredAudioEnabledRef.current = false;
        desiredVideoEnabledRef.current = false;
      }
      if (!mountedRef.current || attempt !== joinAttemptRef.current) return false;
      publishAuthorizedRef.current = expectedCanPublish;
      setPublishAuthorized(expectedCanPublish);
      setAuthorityState('ready');
      return true;
    } catch (nextError) {
      if (!mountedRef.current || attempt !== joinAttemptRef.current) return false;
      setAuthorityState('failed');
      setError('live_publish_authority_sync_failed');
      logger.warn('[live-media] authority-reconciliation-failed', {
        sessionId,
        expectedCanPublish,
        code: nextError instanceof Error ? nextError.message : 'unknown',
      });
      return false;
    }
  }, [sessionId]);

  const setAudioEnabled = useCallback(async (enabled: boolean) => {
    desiredAudioEnabledRef.current = enabled;
    try {
      await providerRef.current?.setAudioEnabled(enabled);
      setAudioState(enabled);
      setError(null);
    } catch (nextError) {
      setError('live_microphone_needs_attention');
      logger.warn('[live-media] microphone-toggle-failed', {
        sessionId,
        code: nextError instanceof Error ? nextError.message : 'unknown',
      });
    }
  }, [sessionId]);

  const setVideoEnabled = useCallback(async (enabled: boolean) => {
    desiredVideoEnabledRef.current = enabled;
    try {
      await providerRef.current?.setVideoEnabled(enabled);
      setVideoState(enabled);
      setError(null);
    } catch (nextError) {
      setError('live_camera_needs_attention');
      logger.warn('[live-media] camera-toggle-failed', {
        sessionId,
        code: nextError instanceof Error ? nextError.message : 'unknown',
      });
    }
  }, [sessionId]);

  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return undefined;
    return provider.subscribeTransportState((transportState) => {
      if (
        !mountedRef.current
        || !shouldMaintainConnectionRef.current
        || joinInFlightRef.current
      ) return;
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;

      if (transportState === 'connected') {
        setState((current) => current === 'reconnecting' ? 'joined' : current);
        return;
      }
      if (transportState === 'reconnecting') {
        setState('reconnecting');
        if (appStateRef.current === 'active') {
          recoveryTimerRef.current = setTimeout(() => {
            recoverConnectionRef.current('transport_reconnect_timeout');
          }, 4_500);
        }
        return;
      }
      if (shouldRecoverLiveMediaTransport(
        transportState,
        shouldMaintainConnectionRef.current,
      )) {
        recoverConnectionRef.current('transport_failed');
      }
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (
        nextState === 'active'
        && shouldMaintainConnectionRef.current
        && !joinInFlightRef.current
        && providerRef.current?.getTransportState() !== 'connected'
      ) {
        recoverConnectionRef.current('app_foreground_transport_check');
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      shouldMaintainConnectionRef.current = false;
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
      joinAttemptRef.current += 1;
      const provider = providerRef.current;
      providerRef.current = null;
      void provider?.dispose();
    };
  }, []);

  return {
    bindings,
    state,
    error,
    audioEnabled,
    videoEnabled,
    publishAuthorized,
    authorityState,
    connectionQuality: providerRef.current?.getConnectionQuality() ?? 'unknown',
    join,
    leave,
    reconcileAuthority,
    setAudioEnabled,
    setVideoEnabled,
  };
};
