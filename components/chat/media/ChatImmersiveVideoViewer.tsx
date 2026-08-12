import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatVideoViewer } from './ChatVideoViewer';

type ChatImmersiveVideoViewerProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  currentIndex?: number;
  itemCount?: number;
  caption?: string | null;
  onPrevious?: () => void;
  onNext?: () => void;
  onRetry?: () => void;
};

export const ChatImmersiveVideoViewer = ({
  visible,
  uri,
  onClose,
  currentIndex = 0,
  itemCount = 1,
  caption,
  onPrevious,
  onNext,
  onRetry,
}: ChatImmersiveVideoViewerProps) => {
  const insets = useSafeAreaInsets();
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  const beginSwipe = useCallback((pageX: number) => {
    swipeStartX.current = itemCount > 1 ? pageX : null;
  }, [itemCount]);
  const finishSwipe = useCallback((pageX: number) => {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (startX === null) return;
    const delta = pageX - startX;
    if (Math.abs(delta) < 56) return;
    if (delta < 0 && currentIndex < itemCount - 1) onNext?.();
    if (delta > 0 && currentIndex > 0) onPrevious?.();
  }, [currentIndex, itemCount, onNext, onPrevious]);
  useEffect(() => setPlaybackFailed(false), [uri]);
  return (
    <Modal
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      visible={visible}
      onRequestClose={onClose}
    >
      <View
        style={styles.container}
        onTouchStart={(event) => beginSwipe(event.nativeEvent.pageX)}
        onTouchEnd={(event) => finishSwipe(event.nativeEvent.pageX)}
      >
        {uri ? (
          <ChatVideoViewer
            url={uri}
            visible={visible}
            styles={styles}
            style={StyleSheet.absoluteFill}
            onPlaybackError={() => setPlaybackFailed(true)}
          />
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.76)', 'transparent', 'rgba(0,0,0,0.48)']}
          locations={[0, 0.28, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.header, { top: Math.max(insets.top + 10, 18) }]}>
          <View>
            <Text style={styles.eyebrow}>Shared video</Text>
            <Text style={styles.title}>Video</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close video"
            hitSlop={10}
            onPress={onClose}
            style={styles.closeButton}
          >
            <MaterialCommunityIcons name="close" size={25} color="#FFFFFF" />
          </Pressable>
        </View>
        {itemCount > 1 ? (
          <>
            <View pointerEvents="none" style={[styles.counter, { top: Math.max(insets.top + 24, 32) }]}>
              <Text style={styles.counterText}>{currentIndex + 1} / {itemCount}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous album item"
              disabled={currentIndex === 0}
              onPress={onPrevious}
              style={[styles.previous, currentIndex === 0 && styles.navigationDisabled]}
            >
              <MaterialCommunityIcons name="chevron-left" size={32} color="#FFFFFF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next album item"
              disabled={currentIndex >= itemCount - 1}
              onPress={onNext}
              style={[styles.next, currentIndex >= itemCount - 1 && styles.navigationDisabled]}
            >
              <MaterialCommunityIcons name="chevron-right" size={32} color="#FFFFFF" />
            </Pressable>
          </>
        ) : null}
        {caption ? (
          <View style={[styles.caption, { bottom: Math.max(insets.bottom + 18, 26) }]}>
            <Text style={styles.captionText}>{caption}</Text>
          </View>
        ) : null}
        {playbackFailed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry video"
            onPress={() => {
              setPlaybackFailed(false);
              onRetry?.();
            }}
            style={styles.retry}
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  videoViewer: { width: '100%', height: '100%' },
  header: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 2 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,9,13,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(5,9,13,0.68)',
  },
  counterText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  previous: {
    position: 'absolute', left: 14, top: '48%', width: 44, height: 44,
    borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(5,9,13,0.58)',
  },
  next: {
    position: 'absolute', right: 14, top: '48%', width: 44, height: 44,
    borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(5,9,13,0.58)',
  },
  navigationDisabled: { opacity: 0.28 },
  caption: {
    position: 'absolute', left: 24, right: 24, paddingHorizontal: 16,
    paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(5,9,13,0.72)',
  },
  captionText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  retry: {
    position: 'absolute', alignSelf: 'center', top: '46%', flexDirection: 'row',
    alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 999, backgroundColor: 'rgba(5,9,13,0.82)',
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
