import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { ChatMessageStyles } from "@/components/chat/message-variants/shared";

type VideoPreviewProps = {
  styles: ChatMessageStyles;
  url: string;
  resolvedUrl?: string;
};

const VideoPreview = memo(({ styles, url, resolvedUrl }: VideoPreviewProps) => {
  const player = useVideoPlayer(resolvedUrl || url, (p) => {
    p.loop = false;
    p.muted = true;
    p.keepScreenOnWhilePlaying = false;
  });

  return (
    <View style={styles.videoPreviewWrap}>
      <VideoView
        player={player}
        style={styles.messageVideo}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
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
