import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

type Props = {
  visible: boolean;
  videoUrl?: string;
  onClose: () => void;
};

const ModalVideoPlayer = ({ uri, shouldPlay }: { uri: string; shouldPlay: boolean }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    if (shouldPlay) {
      try { p.play(); } catch {}
    }
  });

  useEffect(() => {
    if (shouldPlay) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [player, shouldPlay]);

  return <VideoView style={styles.video} player={player} contentFit="cover" nativeControls={false} />;
};

export default function ProfileVideoModal({ visible, videoUrl, onClose }: Props) {
  const screenH = Dimensions.get('window').height;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      // autoplay handled by `shouldPlay` on Video
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      Animated.timing(translateY, { toValue: screenH, duration: 180, useNativeDriver: true }).start();
    }
  }, [visible, opacity, translateY, screenH]);

  const closeWithAnimation = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: screenH, duration: 180, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          pan.setValue({ x: 0, y: gesture.dy });
          translateY.setValue(gesture.dy);
          const frac = Math.min(1, gesture.dy / (screenH * 0.6));
          opacity.setValue(1 - frac * 0.9);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 140 || gesture.vy > 1) {
          closeWithAnimation();
        } else {
          Animated.parallel([
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  return (
    <Modal animationType="fade" visible={visible} transparent onRequestClose={closeWithAnimation}>
      <BlurViewSafe intensity={80} tint="dark" style={styles.backdrop} />

      <Animated.View style={[styles.container, { transform: [{ translateY }] , opacity}]}> 
        <Animated.View
          style={[styles.videoWrapper, { transform: [{ translateY: pan.y }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.headerRow} pointerEvents="box-none">
            <TouchableOpacity onPress={closeWithAnimation} style={styles.closeButton} accessibilityLabel="Close video">
              <MaterialCommunityIcons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {videoUrl ? (
            <ModalVideoPlayer uri={videoUrl} shouldPlay={visible} />
          ) : (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>Video unavailable in this environment</Text>
              <Pressable onPress={closeWithAnimation} style={styles.fallbackButton}>
                <Text style={styles.fallbackButtonText}>Close</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  videoWrapper: {
    width: '100%',
    height: '82%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { width: '100%', height: '100%' },
  headerRow: { position: 'absolute', left: 12, right: 12, top: 12, zIndex: 20, alignItems: 'flex-end' },
  closeButton: { backgroundColor: 'rgba(0,0,0,0.32)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  fallbackText: { color: '#fff', marginBottom: 12 },
  fallbackButton: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  fallbackButtonText: { color: '#111' },
});
