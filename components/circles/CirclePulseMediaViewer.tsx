import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';
import { useCirclePulsePalette, type CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  visible: boolean;
  item: CirclePulseItem | null;
  onClose: () => void;
  onOpenComments: (item: CirclePulseItem) => void;
};

function EditorialVideo({ uri, muted }: { uri: string; muted: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    try { instance.play(); } catch {}
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return <VideoView player={player} style={styles.videoChromeMedia} contentFit="cover" nativeControls={false} pointerEvents="none" />;
}

export default function CirclePulseMediaViewer({ visible, item, onClose, onOpenComments }: Props) {
  const palette = useCirclePulsePalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const imageStyles = useMemo(() => createImageStyles(palette, insets.top), [insets.top, palette]);
  const [muted, setMuted] = useState(false);
  const dragY = useRef(new Animated.Value(0)).current;
  const mediaUrl = item?.mediaUrl || item?.imageUrl || null;
  const isVideo = item?.mediaType === 'video';

  useEffect(() => {
    if (!visible) return;
    setMuted(false);
    dragY.setValue(0);
  }, [dragY, visible]);

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
          {mediaUrl ? (
            <EditorialVideo uri={mediaUrl} muted={muted} />
          ) : (
            <View style={styles.emptyVideo}>
              <MaterialCommunityIcons name="video-off-outline" size={34} color="rgba(255,255,255,0.74)" />
            </View>
          )}
          <LinearGradient
            colors={['rgba(6,12,16,0.88)', 'rgba(6,12,16,0.2)', 'rgba(6,12,16,0.86)']}
            style={StyleSheet.absoluteFillObject}
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
        <LinearGradient colors={palette.viewerGradient} style={StyleSheet.absoluteFillObject} />
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
