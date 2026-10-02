import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRef, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PinchGestureHandler } from 'react-native-gesture-handler';

import type { ChatScreenStyles } from '@/components/chat/styles/chat-screen.styles';
import { Colors } from '@/constants/theme';

type ChatImageViewerProps = {
  visible: boolean;
  uri: string | null;
  loading: boolean;
  hasError: boolean;
  currentIndex: number;
  itemCount: number;
  caption?: string | null;
  topInset: number;
  bottomInset: number;
  scale: ReturnType<typeof Animated.multiply>;
  styles: ChatScreenStyles;
  onPinchGesture: ComponentProps<typeof PinchGestureHandler>['onGestureEvent'];
  onPinchStateChange: ComponentProps<typeof PinchGestureHandler>['onHandlerStateChange'];
  onClose: () => void;
  onMove: (direction: -1 | 1) => void;
  onRetry: () => void;
  onManage?: () => void;
  onLoadStart: () => void;
  onLoad: () => void;
  onError: () => void;
};

export function ChatImageViewer({
  visible,
  uri,
  loading,
  hasError,
  currentIndex,
  itemCount,
  caption,
  topInset,
  bottomInset,
  scale,
  styles,
  onPinchGesture,
  onPinchStateChange,
  onClose,
  onMove,
  onRetry,
  onManage,
  onLoadStart,
  onLoad,
  onError,
}: ChatImageViewerProps) {
  const swipeStartXRef = useRef<number | null>(null);
  const captionBottom = Math.max(bottomInset + 18, 26);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.imageViewerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {uri ? (
          <PinchGestureHandler
            onGestureEvent={onPinchGesture}
            onHandlerStateChange={onPinchStateChange}
          >
            <Animated.View
              style={[styles.imageViewerImage, { transform: [{ scale }] }]}
              onTouchStart={(event) => {
                swipeStartXRef.current = itemCount > 1 ? event.nativeEvent.pageX : null;
              }}
              onTouchEnd={(event) => {
                const startX = swipeStartXRef.current;
                swipeStartXRef.current = null;
                if (startX === null) return;
                const delta = event.nativeEvent.pageX - startX;
                if (Math.abs(delta) < 56) return;
                onMove(delta < 0 ? 1 : -1);
              }}
            >
              <ExpoImage
                source={{ uri }}
                style={StyleSheet.absoluteFill}
                cachePolicy="disk"
                contentFit="contain"
                transition={120}
                onLoadStart={onLoadStart}
                onLoad={onLoad}
                onError={onError}
              />
            </Animated.View>
          </PinchGestureHandler>
        ) : null}

        {itemCount > 1 ? (
          <>
            <View
              pointerEvents="none"
              style={[styles.imageViewerCounter, { top: Math.max(topInset + 17, 25) }]}
            >
              <Text style={styles.imageViewerCounterText}>{currentIndex + 1} / {itemCount}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.imageViewerPrevious,
                currentIndex === 0 && styles.imageViewerNavigationDisabled,
              ]}
              onPress={() => onMove(-1)}
              disabled={currentIndex === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous photo"
            >
              <MaterialCommunityIcons name="chevron-left" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.imageViewerNext,
                currentIndex >= itemCount - 1 && styles.imageViewerNavigationDisabled,
              ]}
              onPress={() => onMove(1)}
              disabled={currentIndex >= itemCount - 1}
              accessibilityRole="button"
              accessibilityLabel="Next photo"
            >
              <MaterialCommunityIcons name="chevron-right" size={30} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        ) : null}

        {loading ? (
          <View pointerEvents="none" style={styles.imageViewerStatus}>
            <ActivityIndicator size="small" color={Colors.light.background} />
            <Text style={styles.imageViewerStatusText}>Opening photo…</Text>
          </View>
        ) : null}
        {hasError ? (
          <TouchableOpacity style={styles.imageViewerRetry} onPress={onRetry}>
            <MaterialCommunityIcons name="refresh" size={20} color={Colors.light.background} />
            <Text style={styles.imageViewerRetryText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
        {onManage ? (
          <TouchableOpacity
            style={[
              styles.imageViewerRetry,
              {
                bottom: captionBottom + (caption ? 76 : 0),
                top: undefined,
              },
            ]}
            onPress={onManage}
            accessibilityRole="button"
            accessibilityLabel="Manage album item"
          >
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={Colors.light.background} />
            <Text style={styles.imageViewerRetryText}>Manage</Text>
          </TouchableOpacity>
        ) : null}
        {caption ? (
          <View pointerEvents="none" style={[styles.imageViewerCaption, { bottom: captionBottom }]}>
            <Text style={styles.imageViewerCaptionText}>{caption}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.imageViewerClose, { top: Math.max(topInset + 10, 18), right: 16 }]}
          onPress={onClose}
        >
          <MaterialCommunityIcons name="close" size={20} color={Colors.light.background} />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
