import { useEffect, useRef } from 'react';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';

type ChatVideoViewerProps = {
  url: string;
  visible: boolean;
  styles: any;
  style?: object;
  onPlaybackError?: () => void;
};

/** Fullscreen/in-place chat video renderer with playback wake-lock ownership. */
export const ChatVideoViewer = ({
  url,
  visible,
  styles,
  style,
  onPlaybackError,
}: ChatVideoViewerProps) => {
  const reportedError = useRef(false);
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.keepScreenOnWhilePlaying = false;
  });
  const { isPlaying } = useEvent(player as any, 'playingChange', {
    isPlaying: visible && player.playing,
  });
  const { status } = useEvent(player as any, 'statusChange', { status: player.status });

  useScopedScreenAwake({
    enabled: visible && isPlaying && status === 'readyToPlay',
    reason: 'video_playback',
    instanceId: `chat-video-viewer:${url}`,
  });

  useEffect(() => {
    try {
      if (visible) player.play();
      else player.pause();
    } catch {}
  }, [player, visible]);

  useEffect(() => {
    if (status !== 'error') {
      reportedError.current = false;
      return;
    }
    if (reportedError.current) return;
    reportedError.current = true;
    onPlaybackError?.();
  }, [onPlaybackError, status]);

  return (
    <VideoView
      player={player}
      style={[styles.videoViewer, style]}
      contentFit="contain"
      nativeControls
    />
  );
};
