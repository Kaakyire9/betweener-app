import { useEffect } from 'react';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';

type ChatVideoViewerProps = {
  url: string;
  visible: boolean;
  styles: any;
  style?: object;
};

/** Fullscreen/in-place chat video renderer with playback wake-lock ownership. */
export const ChatVideoViewer = ({
  url,
  visible,
  styles,
  style,
}: ChatVideoViewerProps) => {
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

  return (
    <VideoView
      player={player}
      style={[styles.videoViewer, style]}
      contentFit="contain"
      nativeControls
    />
  );
};
