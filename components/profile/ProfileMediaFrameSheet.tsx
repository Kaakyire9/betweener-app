import OfflineImage from '@/components/media/OfflineImage';
import { Colors } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Theme = typeof Colors.light;

type Props = {
  visible: boolean;
  theme: Theme;
  isDark: boolean;
  sourceUri: string | null;
  slot: 'avatar' | 'hero' | null;
  onClose: () => void;
  onConfirm: (focus: { x: number; y: number }) => void;
};

const SLOT_ASPECT_RATIO = {
  avatar: 1,
  hero: 16 / 9,
} as const;

const SLOT_COPY = {
  avatar: {
    eyebrow: 'Avatar framing',
    title: 'Position the face clearly',
    body: 'Drag the image until the face lands cleanly inside the circular trust layer.',
  },
  hero: {
    eyebrow: 'Hero framing',
    title: 'Set the opening scene',
    body: 'Drag the scene so the strongest subject stays inside the wide hero crop.',
  },
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const offsetToFocus = (offset: number, overflow: number) => {
  if (overflow <= 0) return 0.5;
  return clamp(0.5 - offset / overflow, 0, 1);
};

export default function ProfileMediaFrameSheet({
  visible,
  theme,
  isDark,
  sourceUri,
  slot,
  onClose,
  onConfirm,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });

  const aspectRatio = slot ? SLOT_ASPECT_RATIO[slot] : 1;
  const frameWidth = Math.min(screenWidth - 44, slot === 'avatar' ? 312 : 332);
  const frameHeight = Math.round(frameWidth / aspectRatio);
  const frameCopy = slot ? SLOT_COPY[slot] : null;

  useEffect(() => {
    if (!visible || !sourceUri) return;
    let cancelled = false;
    setLoading(true);
    setImageSize(null);
    setOffset({ x: 0, y: 0 });
    offsetRef.current = { x: 0, y: 0 };

    Image.getSize(
      sourceUri,
      (width: number, height: number) => {
        if (cancelled) return;
        setImageSize({ width, height });
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setImageSize({ width: frameWidth, height: frameHeight });
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [frameHeight, frameWidth, sourceUri, visible]);

  const coverMetrics = useMemo(() => {
    if (!imageSize) return null;
    const scale = Math.max(frameWidth / imageSize.width, frameHeight / imageSize.height);
    const displayWidth = imageSize.width * scale;
    const displayHeight = imageSize.height * scale;
    const overflowX = Math.max(0, displayWidth - frameWidth);
    const overflowY = Math.max(0, displayHeight - frameHeight);
    return {
      displayWidth,
      displayHeight,
      overflowX,
      overflowY,
      maxOffsetX: overflowX / 2,
      maxOffsetY: overflowY / 2,
    };
  }, [frameHeight, frameWidth, imageSize]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(coverMetrics),
        onMoveShouldSetPanResponder: () => Boolean(coverMetrics),
        onPanResponderGrant: () => {
          dragStartRef.current = offsetRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          if (!coverMetrics) return;
          const nextX = clamp(
            dragStartRef.current.x + gestureState.dx,
            -coverMetrics.maxOffsetX,
            coverMetrics.maxOffsetX,
          );
          const nextY = clamp(
            dragStartRef.current.y + gestureState.dy,
            -coverMetrics.maxOffsetY,
            coverMetrics.maxOffsetY,
          );
          const nextOffset = { x: nextX, y: nextY };
          offsetRef.current = nextOffset;
          setOffset(nextOffset);
        },
      }),
    [coverMetrics],
  );

  const handleReset = () => {
    const nextOffset = { x: 0, y: 0 };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };

  const handleConfirm = () => {
    if (!coverMetrics) {
      onConfirm({ x: 0.5, y: 0.5 });
      return;
    }
    onConfirm({
      x: offsetToFocus(offsetRef.current.x, coverMetrics.overflowX),
      y: offsetToFocus(offsetRef.current.y, coverMetrics.overflowY),
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? 'rgba(7,20,26,0.96)' : 'rgba(247,244,238,0.98)',
              borderColor: theme.outline,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: theme.tint }]}>{frameCopy?.eyebrow || 'Frame media'}</Text>
              <Text style={[styles.title, { color: theme.text }]}>{frameCopy?.title || 'Adjust framing'}</Text>
              <Text style={[styles.body, { color: theme.textMuted }]}>{frameCopy?.body || 'Drag to position the crop.'}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            >
              <MaterialCommunityIcons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.stageShell, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}>
            <View
              style={[
                styles.stage,
                {
                  width: frameWidth,
                  height: frameHeight,
                  borderRadius: slot === 'avatar' ? 28 : 24,
                },
              ]}
              {...panResponder.panHandlers}
            >
              {loading || !coverMetrics || !sourceUri ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator size="large" color={theme.tint} />
                  <Text style={[styles.loadingText, { color: theme.textMuted }]}>Preparing frame…</Text>
                </View>
              ) : (
                <>
                  <OfflineImage
                    uri={sourceUri}
                    style={{
                      width: coverMetrics.displayWidth,
                      height: coverMetrics.displayHeight,
                      transform: [{ translateX: offset.x }, { translateY: offset.y }],
                    }}
                    contentFit="cover"
                  />
                  <View pointerEvents="none" style={styles.gridOverlay}>
                    <View style={styles.gridColumn} />
                    <View style={styles.gridColumn} />
                    <View style={styles.gridColumn} />
                  </View>
                  <View pointerEvents="none" style={styles.gridOverlayHorizontal}>
                    <View style={styles.gridRow} />
                    <View style={styles.gridRow} />
                    <View style={styles.gridRow} />
                  </View>
                  {slot === 'avatar' ? <View pointerEvents="none" style={styles.avatarGuide} /> : null}
                </>
              )}
            </View>
          </View>

          <View style={[styles.tipCard, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}>
            <MaterialCommunityIcons name="gesture-swipe" size={16} color={theme.tint} />
            <Text style={[styles.tipText, { color: theme.textMuted }]}>
              Drag the image until the subject sits where you want it. We save the final crop, not just the preview.
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleReset}
              style={[styles.secondaryButton, { borderColor: theme.outline, backgroundColor: theme.backgroundSubtle }]}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirm} style={[styles.primaryButton, { backgroundColor: theme.tint }]}>
              <Text style={styles.primaryButtonText}>Use framing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,10,14,0.6)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: 'Manrope_700Bold',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  body: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageShell: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 28,
    padding: 12,
  },
  stage: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09131A',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12.5,
    fontFamily: 'Manrope_500Medium',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: '33.33%',
  },
  gridColumn: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  gridOverlayHorizontal: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingVertical: '33.33%',
  },
  gridRow: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  avatarGuide: {
    position: 'absolute',
    width: '72%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'transparent',
  },
  tipCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_500Medium',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  primaryButton: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#07141A',
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
});
