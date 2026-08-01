import { memo, useEffect, useRef } from "react";
import { useEvent } from "expo";
import { View, Text, StyleSheet } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { ChatMessageStyles } from "@/components/chat/message-variants/shared";

type VideoPreviewProps = {
  styles: ChatMessageStyles;
  url: string;
  resolvedUrl?: string;
  posterUri?: string | null;
  onError?: () => void;
};

const VideoPlaybackSurface = ({
  styles,
  url,
  resolvedUrl,
  onError,
}: Omit<VideoPreviewProps, 'posterUri'>) => {
  const player = useVideoPlayer(resolvedUrl || url, (p) => {
    p.loop = false;
    p.muted = true;
    p.keepScreenOnWhilePlaying = false;
  });
  const { status } = useEvent(player as any, 'statusChange', {
    status: player.status,
  });
  const lastReportedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const activeUrl = resolvedUrl || url;
    if (status !== 'error' || lastReportedUrlRef.current === activeUrl) return;
    lastReportedUrlRef.current = activeUrl;
    onError?.();
  }, [onError, resolvedUrl, status, url]);

  return (
    <VideoView
      player={player}
      style={styles.messageVideo}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
};

const VideoPreview = memo(({ styles, url, resolvedUrl, posterUri, onError }: VideoPreviewProps) => {
  return (
    <View style={[styles.messageVideo, styles.videoPreviewWrap]}>
      {posterUri ? (
        <ExpoImage
          source={{ uri: posterUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={80}
        />
      ) : (
        <VideoPlaybackSurface
          styles={styles}
          url={url}
          resolvedUrl={resolvedUrl}
          onError={onError}
        />
      )}
      <LinearGradient
        colors={['rgba(2, 8, 8, 0.08)', 'rgba(4, 14, 14, 0.18)', 'rgba(2, 8, 8, 0.34)']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.videoOverlay}>
        <MaterialCommunityIcons name="play-circle" size={34} color={Colors.light.background} />
        <Text style={styles.videoOverlayLabel}>Video</Text>
      </View>
    </View>
  );
});

VideoPreview.displayName = "VideoPreview";

export default VideoPreview;
