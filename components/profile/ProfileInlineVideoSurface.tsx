import OfflineImage from '@/components/media/OfflineImage';
import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { isLocalMediaUri, isRemoteMediaUri } from '@/lib/profile/media';

type Props = {
  videoUrl?: string | null;
  posterUri?: string | null;
  shouldPlay?: boolean;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
};

function InlineVideoPlayer({
  videoUrl,
  shouldPlay,
  muted,
}: {
  videoUrl: string;
  shouldPlay: boolean;
  muted: boolean;
}) {
  const player = useVideoPlayer(videoUrl || null, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    instance.keepScreenOnWhilePlaying = false;
    if (videoUrl && shouldPlay) {
      try {
        instance.play();
      } catch {}
    }
  });

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {}
  }, [muted, player]);

  useEffect(() => {
    if (!videoUrl) {
      try {
        player.pause();
      } catch {}
      return;
    }

    if (shouldPlay) {
      try {
        player.play();
      } catch {}
    } else {
      try {
        player.pause();
      } catch {}
    }
  }, [player, shouldPlay, videoUrl]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

export default function ProfileInlineVideoSurface({
  videoUrl,
  posterUri,
  shouldPlay = true,
  muted = true,
  style,
}: Props) {
  const playableVideoUrl =
    videoUrl && (isRemoteMediaUri(videoUrl) || isLocalMediaUri(videoUrl))
      ? videoUrl
      : null;
  const videoKey = playableVideoUrl ? `video:${playableVideoUrl}` : 'video:none';

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      {posterUri ? (
        <OfflineImage
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          containerStyle={StyleSheet.absoluteFill}
          cachePolicy="memory-disk"
          contentFit="cover"
        />
      ) : null}
      {playableVideoUrl ? (
        <InlineVideoPlayer
          key={videoKey}
          videoUrl={playableVideoUrl}
          shouldPlay={shouldPlay}
          muted={muted}
        />
      ) : null}
    </View>
  );
}
