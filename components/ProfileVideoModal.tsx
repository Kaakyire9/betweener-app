import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';
import { useResponsiveMetrics } from '@/lib/responsive';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { isLocalMediaUri, isRemoteMediaUri } from '@/lib/profile/media';

type Props = {
  visible: boolean;
  videoUrl?: string;
  title?: string;
  subtitle?: string;
  reactionIcon?: string | null;
  reactionCount?: number;
  reactionsOpen?: boolean;
  onToggleReactions?: () => void;
  onSelectReaction?: (icon: string) => void;
  onClose: () => void;
};

const ModalVideoPlayer = ({
  uri,
  shouldPlay,
  muted,
}: {
  uri: string;
  shouldPlay: boolean;
  muted: boolean;
}) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
    p.keepScreenOnWhilePlaying = false;
    if (shouldPlay) {
      try { p.play(); } catch {}
    }
  });
  const { isPlaying } = useEvent(player as any, 'playingChange', { isPlaying: shouldPlay && player.playing });
  const { status } = useEvent(player as any, 'statusChange', { status: player.status });

  useScopedScreenAwake({
    enabled: shouldPlay && isPlaying && status === 'readyToPlay',
    reason: 'video_playback',
    instanceId: `profile-video:${uri}`,
  });

  useEffect(() => {
    try { player.muted = muted; } catch {}
  }, [muted, player]);

  useEffect(() => {
    if (shouldPlay) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [player, shouldPlay]);

  return (
    <VideoView
      style={styles.video}
      player={player}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
};

const REACTION_ICONS = ['heart', 'fire', 'star', 'emoticon-happy-outline'] as const;

export default function ProfileVideoModal({
  visible,
  videoUrl,
  title,
  subtitle,
  reactionIcon,
  reactionCount = 0,
  reactionsOpen = false,
  onToggleReactions,
  onSelectReaction,
  onClose,
}: Props) {
  const playableVideoUrl =
    videoUrl && (isRemoteMediaUri(videoUrl) || isLocalMediaUri(videoUrl))
      ? videoUrl
      : undefined;
  const responsive = useResponsiveMetrics();
  const screenH = responsive.height;
  const [muted, setMuted] = useState(false);
  const insets = useSafeAreaInsets();
  const dragY = useSharedValue(0);
  const isClosing = useSharedValue(0);
  const presentProgress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMuted(false);
      dragY.value = 0;
      isClosing.value = 0;
      presentProgress.value = 0;
      presentProgress.value = withTiming(1, { duration: 260 });
    }
  }, [dragY, isClosing, presentProgress, visible]);

  const closeImmediately = () => {
    onClose();
    dragY.value = 0;
    isClosing.value = 0;
    presentProgress.value = 0;
  };

  const panGesture = Gesture.Pan()
    .minDistance(8)
    .onUpdate((event) => {
      if (isClosing.value) return;
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (isClosing.value) return;
      const projectedDy = event.translationY + Math.max(event.velocityY, 0) * 0.12;
      if (projectedDy > 160 || event.translationY > 110 || event.velocityY > 750) {
        isClosing.value = 1;
        dragY.value = withTiming(screenH, { duration: 180 }, (finished) => {
          if (!finished) return;
          dragY.value = 0;
          isClosing.value = 0;
          runOnJS(closeImmediately)();
        });
        return;
      }
      dragY.value = withTiming(0, { duration: 180 });
    })
    .onFinalize(() => {
      if (!isClosing.value && dragY.value > 0) {
        dragY.value = withTiming(0, { duration: 180 });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(dragY.value, [0, screenH * 0.6], [1, 0.08]) *
      interpolate(presentProgress.value, [0, 1], [0, 1]),
  }));

  const contentStyle = useAnimatedStyle(() => {
    const enterTranslate = interpolate(presentProgress.value, [0, 1], [26, 0]);
    const enterScale = interpolate(presentProgress.value, [0, 1], [0.965, 1]);
    const enterOpacity = interpolate(presentProgress.value, [0, 1], [0.72, 1]);
    return {
      opacity: enterOpacity,
      transform: [{ translateY: dragY.value + enterTranslate }, { scale: enterScale }] as any,
    };
  });

  return (
    <Modal animationType="fade" visible={visible} transparent onRequestClose={closeImmediately}>
      <GestureHandlerRootView style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <LinearGradientSafe
            colors={['rgba(2,5,7,0.98)', 'rgba(5,10,14,0.94)', 'rgba(6,12,18,0.98)']}
            start={[0, 0]}
            end={[1, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.container, contentStyle]}>
          <View style={styles.videoWrapper}>
            {playableVideoUrl ? (
              <ModalVideoPlayer uri={playableVideoUrl} shouldPlay={visible} muted={muted} />
            ) : (
              <View style={styles.fallback}>
                <Text style={styles.fallbackEyebrow}>Intro video</Text>
                <Text style={styles.fallbackText}>Video unavailable in this environment</Text>
                <Pressable onPress={closeImmediately} style={styles.fallbackButton}>
                  <Text style={styles.fallbackButtonText}>Close</Text>
                </Pressable>
              </View>
            )}
            <LinearGradientSafe
              colors={['rgba(6,12,16,0.88)', 'rgba(6,12,16,0.24)', 'rgba(6,12,16,0.86)']}
              start={[0, 0]}
              end={[0, 1]}
              style={styles.chromeGradient}
              pointerEvents="none"
            />
            <View
              style={[
                styles.dragHandleWrap,
                {
                  top: Math.max(insets.top + 4, 14),
                },
              ]}
              pointerEvents="none"
            >
              <View style={styles.dragHandle} />
            </View>

            <View
              style={[
                styles.headerRow,
                {
                  top: Math.max(insets.top + 22, 32),
                },
              ]}
              pointerEvents="box-none"
            >
              <View style={styles.headerCopy}>
                <Text style={styles.headerEyebrow}>Intro video</Text>
                {title ? <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text> : null}
                {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
              </View>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => setMuted((prev) => !prev)}
                  style={styles.actionButton}
                  accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
                >
                  <MaterialCommunityIcons
                    name={muted ? 'volume-mute' : 'volume-high'}
                    size={22}
                    color="#fff"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={closeImmediately} style={styles.closeButton} accessibilityLabel="Close video">
                  <MaterialCommunityIcons name="close" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {onToggleReactions ? (
              <View
                style={[
                  styles.reactionDock,
                  {
                    bottom: Math.max(insets.bottom + 62, 72),
                  },
                ]}
              >
                <Pressable
                  onPress={onToggleReactions}
                  style={styles.reactionPill}
                >
                  <MaterialCommunityIcons
                    name={(reactionIcon || 'emoticon-outline') as any}
                    size={18}
                    color={reactionIcon ? '#22D3C5' : 'rgba(255,255,255,0.78)'}
                  />
                  {reactionCount > 0 ? <Text style={styles.reactionCount}>{reactionCount}</Text> : null}
                </Pressable>
                {reactionsOpen ? (
                  <View style={styles.reactionRow}>
                    {REACTION_ICONS.map((icon) => (
                      <Pressable key={icon} onPress={() => onSelectReaction?.(icon)} style={styles.reactionChoice}>
                        <MaterialCommunityIcons name={icon} size={20} color="#22D3C5" />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View
              style={[
                styles.footerHint,
                {
                  bottom: Math.max(insets.bottom + 12, 20),
                },
              ]}
              pointerEvents="none"
            >
              <View style={styles.footerPill}>
                <MaterialCommunityIcons name="gesture-swipe-down" size={14} color="rgba(255,255,255,0.78)" />
                <Text style={styles.footerHintText}>Swipe down to close</Text>
              </View>
            </View>
          </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  container: { flex: 1 },
  videoWrapper: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { width: '100%', height: '100%' },
  chromeGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
  dragHandleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 21,
  },
  dragHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  headerRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 10,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    paddingTop: 6,
    gap: 2,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    backgroundColor: 'rgba(8,12,14,0.56)',
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  closeButton: {
    backgroundColor: 'rgba(8,12,14,0.72)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  fallbackEyebrow: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fallbackText: { color: '#fff', marginBottom: 12, fontSize: 15, fontWeight: '600' },
  fallbackButton: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  fallbackButtonText: { color: '#111' },
  reactionDock: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
    gap: 10,
    zIndex: 20,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(8,12,14,0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  reactionCount: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '800',
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(8,12,14,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  reactionChoice: {
    padding: 2,
  },
  footerHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 20,
    alignItems: 'center',
    zIndex: 20,
  },
  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(8,12,14,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  footerHintText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
