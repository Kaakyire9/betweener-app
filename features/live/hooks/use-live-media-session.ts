import { useCallback, useEffect, useRef, useState } from 'react';
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

export const useLiveMediaSession = (sessionId: string) => {
  const providerRef = useRef<StreamLiveMediaProvider | null>(null);
  const [bindings, setBindings] = useState<StreamLiveMediaBindings | null>(null);
  const [state, setState] = useState<LiveMediaControllerState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioState] = useState(false);
  const [videoEnabled, setVideoState] = useState(false);

  if (!providerRef.current) providerRef.current = new StreamLiveMediaProvider();

  const join = useCallback(async (options: {
    mode: LiveMediaJoinMode;
    audioEnabled: boolean;
    videoEnabled: boolean;
  }) => {
    const provider = providerRef.current;
    if (!provider) return;
    setState('preparing');
    setError(null);
    try {
      const admission = await requestLiveMediaAdmission({ sessionId });
      const renew = () => requestLiveMediaAdmission({ sessionId });
      await provider.initialize(admission, renew);
      setBindings(provider.getPresentationBindings());
      await provider.joinSession(options);
      setAudioState(options.audioEnabled);
      setVideoState(options.videoEnabled);
      setState('joined');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'live_media_join_failed');
      setState('failed');
    }
  }, [sessionId]);

  const leave = useCallback(async () => {
    await providerRef.current?.leaveSession().catch(() => undefined);
    setAudioState(false);
    setVideoState(false);
    setState('idle');
  }, []);

  const setAudioEnabled = useCallback(async (enabled: boolean) => {
    await providerRef.current?.setAudioEnabled(enabled);
    setAudioState(enabled);
  }, []);

  const setVideoEnabled = useCallback(async (enabled: boolean) => {
    await providerRef.current?.setVideoEnabled(enabled);
    setVideoState(enabled);
  }, []);

  useEffect(() => () => {
    const provider = providerRef.current;
    providerRef.current = null;
    void provider?.dispose();
  }, []);

  return {
    bindings,
    state,
    error,
    audioEnabled,
    videoEnabled,
    connectionQuality: providerRef.current?.getConnectionQuality() ?? 'unknown',
    join,
    leave,
    setAudioEnabled,
    setVideoEnabled,
  };
};

