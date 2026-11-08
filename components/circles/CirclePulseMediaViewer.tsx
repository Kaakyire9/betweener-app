import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import { recordCircleMediaAggregateEvent, resolveCirclePulseMediaPlaybackUrl } from '@/lib/circles/pulse/circle-pulse-service';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  visible: boolean;
  item: CirclePulseItem | null;
  onClose: () => void;
  onOpenComments: (item: CirclePulseItem) => void;
};

const formatMediaTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

function EditorialVideo({
  uri,
  muted,
  instanceId,
  caption,
  onPlayStart,
  onComplete,
}: {
  uri: string;
  muted: boolean;
  instanceId: string;
  caption?: string | null;
  onPlayStart?: () => void;
  onComplete?: () => void;
}) {
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = muted;
    instance.keepScreenOnWhilePlaying = false;
    instance.timeUpdateEventInterval = 0.25;
    try { instance.pause(); } catch {}
  });
  const { isPlaying } = useEvent(player as any, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player as any, 'statusChange', { status: player.status });
  useEventListener(player as any, 'timeUpdate', (event: any) => {
    setCurrentTime(Number(event.currentTime) || 0);
  });
  useEventListener(player as any, 'playToEnd', () => onComplete?.());
  const duration = Number(player.duration) || 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  useScopedScreenAwake({
    enabled: isPlaying && status === 'readyToPlay',
    reason: 'video_playback',
    instanceId,
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  const togglePlayback = () => {
    try {
      if (player.playing) player.pause();
      else {
        player.play();
        onPlayStart?.();
      }
    } catch {}
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={styles.videoChromeMedia} contentFit="contain" nativeControls={false} pointerEvents="none" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause Circle video' : 'Play Circle video'}
        style={styles.videoTapTarget}
        onPress={togglePlayback}
      >
        {!isPlaying ? (
          <View style={styles.videoPlayButton}>
            <MaterialCommunityIcons name="play" size={34} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>
      {captionsVisible && caption ? (
        <View style={styles.captionPill} accessibilityLiveRegion="polite">
          <Text style={styles.captionText}>{caption}</Text>
        </View>
      ) : null}
      <View style={styles.videoPlaybackControls}>
        <TouchableOpacity accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'} onPress={togglePlayback}>
          <MaterialCommunityIcons name={isPlaying ? 'pause' : 'play'} size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.videoProgressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(currentTime) }}>
          <View style={[styles.videoProgressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.videoTime}>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</Text>
        {caption ? (
          <TouchableOpacity accessibilityLabel={captionsVisible ? 'Hide captions' : 'Show captions'} onPress={() => setCaptionsVisible((current) => !current)}>
            <MaterialCommunityIcons name={captionsVisible ? 'closed-caption' : 'closed-caption-outline'} size={23} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function CirclePulseMediaViewer({ visible, item, onClose, onOpenComments }: Props) {
  const palette = useCirclePulsePalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const imageStyles = useMemo(() => createImageStyles(palette, insets.top), [insets.top, palette]);
  const [muted, setMuted] = useState(true);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const dragY = useRef(new Animated.Value(0)).current;
  const mediaUrl = item?.mediaUrl || item?.imageUrl || null;
  const isVideo = item?.mediaType === 'video';

  useEffect(() => {
    if (!visible) return;
    setMuted(true);
    dragY.setValue(0);
  }, [dragY, visible]);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !item || item.mediaType !== 'video') {
      setResolvedVideoUrl(null);
      setVideoLoading(false);
      return () => { cancelled = true; };
    }
    setResolvedVideoUrl(null);
    setVideoLoading(true);
    void resolveCirclePulseMediaPlaybackUrl(item)
      .then((url) => {
        if (!cancelled) setResolvedVideoUrl(url);
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => { cancelled = true; };
  }, [item, visible]);

  const closeVideo = useCallback(() => {
    dragY.setValue(0);
    onClose();
  }, [dragY, onClose]);

  const handleVideoGesture = useMemo(
    () => Animated.event([{ nativeEvent: { translationY: dragY } }], { useNativeDriver: true }),
    [dragY],
  );
  const handleVideoGestureStateChange = useCallback((event: any) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    const distance = Math.max(0, Number(event.nativeEvent.translationY) || 0);
    const velocity = Math.max(0, Number(event.nativeEvent.velocityY) || 0);
    if (distance > 110 || velocity > 750) {
      Animated.timing(dragY, {
        toValue: windowHeight,
        duration: 180,
        useNativeDriver: true,
      }).start(closeVideo);
      return;
    }
    Animated.spring(dragY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [closeVideo, dragY, windowHeight]);

  if (isVideo) {
    return (
      <Modal visible={visible && !!item} transparent animationType="fade" onRequestClose={closeVideo}>
        <GestureHandlerRootView style={styles.videoChrome}>
          <PanGestureHandler
            activeOffsetY={8}
            failOffsetX={[-48, 48]}
            onGestureEvent={handleVideoGesture}
            onHandlerStateChange={handleVideoGestureStateChange}
          >
            <Animated.View accessibilityLabel="Dismiss Circle video" style={[styles.videoChrome, { transform: [{ translateY: dragY }] }]}>
          {resolvedVideoUrl ? (
            <EditorialVideo
              uri={resolvedVideoUrl}
              muted={muted}
              caption={item?.body || item?.subtitle}
              onPlayStart={() => item && void recordCircleMediaAggregateEvent(item.id, 'play_start')}
              onComplete={() => item && void recordCircleMediaAggregateEvent(item.id, 'complete')}
              instanceId={`circle-pulse-media:${item?.id ?? resolvedVideoUrl}`}
            />
          ) : (
            <View style={styles.emptyVideo}>
              {item?.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              {videoLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <MaterialCommunityIcons name="video-off-outline" size={34} color="rgba(255,255,255,0.74)" />
              )}
            </View>
          )}
          <LinearGradient
            colors={['rgba(6,12,16,0.88)', 'rgba(6,12,16,0.2)', 'rgba(6,12,16,0.86)']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.videoDragHandleWrap, { top: Math.max(insets.top + 4, 14) }]} pointerEvents="none">
            <View style={styles.videoDragHandle} />
          </View>
          <View style={[styles.videoHeader, { top: Math.max(insets.top + 22, 32) }]}>
            <View style={styles.videoHeaderCopy}>
              <Text style={styles.videoEyebrow}>Circle video</Text>
              <Text style={styles.videoTitle} numberOfLines={1}>{item?.title || 'Circle spotlight'}</Text>
              {item?.subtitle ? <Text style={styles.videoSubtitle} numberOfLines={1}>{item.subtitle}</Text> : null}
            </View>
            <View style={styles.videoHeaderActions}>
              <TouchableOpacity
                accessibilityLabel={muted ? 'Unmute Circle video' : 'Mute Circle video'}
                style={styles.videoIconButton}
                onPress={() => setMuted((current) => !current)}
              >
                <MaterialCommunityIcons name={muted ? 'volume-mute' : 'volume-high'} size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="Close Circle media" style={styles.videoCloseButton} onPress={closeVideo}>
                <MaterialCommunityIcons name="close" size={26} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.videoFooter, { bottom: Math.max(insets.bottom + 14, 20) }]}>
            {item ? (
              <TouchableOpacity
                style={styles.videoDiscussButton}
                onPress={() => {
                  closeVideo();
                  void recordCircleMediaAggregateEvent(item.id, 'discussion_open');
                  onOpenComments(item);
                }}
              >
                <MaterialCommunityIcons name="message-outline" size={16} color="#FFFFFF" />
                <Text style={styles.videoDiscussText}>{item.commentCount > 0 ? `${item.commentCount} comments` : 'Start discussion'}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.videoHintPill}>
              <MaterialCommunityIcons name="gesture-swipe-down" size={14} color="rgba(255,255,255,0.78)" />
              <Text style={styles.videoHintText}>Swipe down to close</Text>
            </View>
          </View>
            </Animated.View>
          </PanGestureHandler>
        </GestureHandlerRootView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible && !!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={imageStyles.backdrop}>
        <LinearGradient colors={palette.viewerGradient} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={imageStyles.safeArea}>
          <View style={imageStyles.header}>
            <Pressable accessibilityLabel="Close Circle media" style={imageStyles.iconButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={21} color={palette.text} />
            </Pressable>
            <View style={imageStyles.headerCopy}>
              <Text style={imageStyles.eyebrow}>Circle Media</Text>
              <Text style={imageStyles.headerTitle} numberOfLines={1}>{item?.title || 'Circle spotlight'}</Text>
            </View>
            <View style={imageStyles.iconButton}>
              <MaterialCommunityIcons name="image-outline" size={20} color={palette.teal} />
            </View>
          </View>

          <View style={imageStyles.mediaShell}>
            {mediaUrl ? (
              <Image source={{ uri: mediaUrl }} style={imageStyles.media} contentFit="contain" transition={160} />
            ) : (
              <View style={imageStyles.emptyMedia}>
                <MaterialCommunityIcons name="image-off-outline" size={34} color={palette.textMuted} />
              </View>
            )}
          </View>

          <View style={imageStyles.copy}>
            {item?.subtitle ? <Text style={imageStyles.subtitle}>{item.subtitle}</Text> : null}
            {item?.body ? <Text style={imageStyles.body}>{item.body}</Text> : null}
          </View>

          {item ? (
            <TouchableOpacity
              style={imageStyles.discussButton}
              onPress={() => {
                onClose();
                void recordCircleMediaAggregateEvent(item.id, 'discussion_open');
                onOpenComments(item);
              }}
            >
              <MaterialCommunityIcons name="message-outline" size={17} color={palette.tealInk} />
              <Text style={imageStyles.discussText}>{item.commentCount > 0 ? `${item.commentCount} comments` : 'Start discussion'}</Text>
            </TouchableOpacity>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const createImageStyles = (palette: CirclePulsePalette, topInset: number) => StyleSheet.create({
  backdrop: { flex: 1 },
  safeArea: { flex: 1, gap: 16, paddingHorizontal: 16, paddingTop: Math.max(topInset, 18) + 8, paddingBottom: 16 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: palette.teal, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  headerTitle: { color: palette.text, fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.surfaceMuted },
  mediaShell: { flex: 1, overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: palette.tealBorder, backgroundColor: palette.surfaceMuted },
  media: { width: '100%', height: '100%' },
  emptyMedia: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: 6 },
  subtitle: { color: palette.teal, fontSize: 12, fontWeight: '800' },
  body: { color: palette.textSoft, fontSize: 13, lineHeight: 19 },
  discussButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 22, backgroundColor: palette.teal },
  discussText: { color: palette.tealInk, fontSize: 12, fontWeight: '900' },
});

const styles = StyleSheet.create({
  videoChrome: { flex: 1, backgroundColor: '#000000' },
  videoChromeMedia: { width: '100%', height: '100%' },
  videoTapTarget: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  videoPlayButton: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,12,14,0.68)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
  captionPill: { position: 'absolute', left: 24, right: 24, bottom: 112, alignItems: 'center' },
  captionText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.78)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, fontSize: 14, lineHeight: 20, textAlign: 'center', overflow: 'hidden' },
  videoPlaybackControls: { position: 'absolute', left: 18, right: 18, bottom: 72, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(8,12,14,0.68)' },
  videoProgressTrack: { flex: 1, height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.26)' },
  videoProgressFill: { height: '100%', borderRadius: 2, backgroundColor: '#19C6C0' },
  videoTime: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  emptyVideo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  videoDragHandleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 21 },
  videoDragHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.38)' },
  videoHeader: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, zIndex: 20 },
  videoHeaderCopy: { flex: 1, gap: 2, paddingTop: 6 },
  videoEyebrow: { color: 'rgba(255,255,255,0.74)', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  videoTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  videoSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600' },
  videoHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  videoIconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(8,12,14,0.56)' },
  videoCloseButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(8,12,14,0.72)' },
  videoFooter: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 10, zIndex: 20 },
  videoDiscussButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(8,12,14,0.62)' },
  videoDiscussText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  videoHintPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(8,12,14,0.48)' },
  videoHintText: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700' },
});
