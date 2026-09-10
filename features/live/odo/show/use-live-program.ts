import { useCallback, useEffect, useRef, useState } from 'react';

import { liveRepository } from '../../application/live-repository.ts';
import { ExpoLiveMusicEngine } from './expo-live-music-engine.ts';
import type { LiveMusicEngine } from './live-music-engine.ts';
import type { LiveProgramSnapshotV2 } from './odo-show-contracts.ts';

export const useLiveProgram = (options: {
  enabled: boolean;
  sessionId: string;
  allowMusicPlayback: boolean;
  engineFactory?: () => LiveMusicEngine;
}): { state: LiveProgramSnapshotV2 | null; error: string | null; refresh: () => Promise<void> } => {
  const [state, setState] = useState<LiveProgramSnapshotV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshRef = useRef<Promise<void> | null>(null);
  const engineRef = useRef<LiveMusicEngine | null>(null);
  const loadedTrackRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    if (refreshRef.current) return refreshRef.current;
    const operation = liveRepository.getLiveProgram(options.sessionId)
      .then((next) => {
        if (mountedRef.current) { setState(next); setError(null); }
      })
      .catch(() => {
        if (mountedRef.current) setError('live_program_unavailable');
      })
      .finally(() => { refreshRef.current = null; });
    refreshRef.current = operation;
    return operation;
  }, [options.enabled, options.sessionId]);

  useEffect(() => {
    setState(null);
    setError(null);
    if (!options.enabled || !options.sessionId) return undefined;
    const unsubscribe = liveRepository.subscribeOdoShow(options.sessionId, () => {
      void refresh();
    });
    void refresh();
    return unsubscribe;
  }, [options.enabled, options.sessionId, refresh]);

  useEffect(() => {
    if (!options.allowMusicPlayback || !options.enabled) {
      const engine = engineRef.current;
      engineRef.current = null;
      loadedTrackRef.current = null;
      if (engine) void engine.dispose();
      return;
    }
    const music = state?.music;
    if (!music || !music.enabled || !music.playbackAvailable || !music.trackId
      || !['playing', 'ducked', 'fading'].includes(music.status)) {
      if (engineRef.current) void engineRef.current.pause();
      if (!music || music.status === 'stopped' || !music.trackId) {
        const engine = engineRef.current;
        engineRef.current = null;
        loadedTrackRef.current = null;
        if (engine) void engine.dispose();
      }
      return;
    }
    let cancelled = false;
    const synchronize = async () => {
      const engine = engineRef.current
        ?? (options.engineFactory ? options.engineFactory() : new ExpoLiveMusicEngine());
      engineRef.current = engine;
      if (loadedTrackRef.current !== music.trackId) {
        const grant = await liveRepository.getLiveMusicPlayback(options.sessionId);
        if (cancelled || grant.trackId !== music.trackId) return;
        const elapsed = Math.max(0,
          (Date.now() - Date.parse(grant.programStartedAt)) / 1000);
        await engine.load({
          uri: grant.uri,
          offsetSeconds: Math.max(grant.playbackOffsetSeconds, elapsed),
          volume: music.volume,
        });
        loadedTrackRef.current = grant.trackId;
      } else {
        await engine.setVolume(music.volume);
      }
      if (!cancelled) await engine.play();
    };
    void synchronize().catch(() => {
      if (mountedRef.current) setError('live_music_playback_unavailable');
    });
    return () => { cancelled = true; };
  }, [
    options.allowMusicPlayback, options.enabled, options.engineFactory,
    options.sessionId, state?.music,
  ]);

  useEffect(() => () => {
    const engine = engineRef.current;
    engineRef.current = null;
    loadedTrackRef.current = null;
    if (engine) void engine.dispose();
  }, []);

  return { state, error, refresh };
};
