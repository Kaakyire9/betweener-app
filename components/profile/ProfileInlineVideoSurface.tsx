import OfflineImage from '@/components/media/OfflineImage';
import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

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
      style={StyleSheet.absoluteFillObject}
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
  const videoKey = videoUrl ? `video:${videoUrl}` : 'video:none';

  return (
    <View style={[StyleSheet.absoluteFillObject, style]}>
      {posterUri ? (
        <OfflineImage
          uri={posterUri}
          style={StyleSheet.absoluteFillObject}
          containerStyle={StyleSheet.absoluteFillObject}
          cachePolicy="memory-disk"
          contentFit="cover"
        />
      ) : null}
      {videoUrl ? <InlineVideoPlayer key={videoKey} videoUrl={videoUrl} shouldPlay={shouldPlay} muted={muted} /> : null}
    </View>
  );
}
