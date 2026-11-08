import type { ProgramTargetCanvas } from '@betweener/live-program-domain';
import type { StreamVideoParticipant } from '@stream-io/video-client';
import { LinearGradient } from 'expo-linear-gradient';
import { Maximize2, Minimize2 } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StreamVideoSdkModule } from '../media/load-stream-video-sdk.ts';
import {
  LiveStageParticipantTile,
  type LiveStageParticipantIdentity,
} from './LiveStageParticipantTile.tsx';

const SCREEN_CONTROLS_VISIBLE_MS = 3_000;

export const LiveScreenPresentationSurface = memo(function LiveScreenPresentationSurface({
  participant,
  identity,
  sdk,
  targetCanvas,
  fit,
  matte,
  editorialFocus,
  focused,
  onToggleFocus,
}: {
  participant: StreamVideoParticipant;
  identity: LiveStageParticipantIdentity | null;
  sdk: StreamVideoSdkModule;
  targetCanvas: ProgramTargetCanvas;
  sourceAspectRatio?: number | null;
  fit: 'contain' | 'cover';
  matte: 'brand_static' | 'none';
  editorialFocus?: boolean;
  focused: boolean;
  onToggleFocus?: () => void;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(0)).current;
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealControls = useCallback(() => {
    if (!onToggleFocus) return;
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    setControlsVisible(true);
    hideControlsTimer.current = setTimeout(() => {
      hideControlsTimer.current = null;
      setControlsVisible(false);
    }, SCREEN_CONTROLS_VISIBLE_MS);
  }, [onToggleFocus]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [revealControls, targetCanvas]);

  useEffect(() => {
    const animation = Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [controlsOpacity, controlsVisible]);

  const toggleFocus = useCallback(() => {
    onToggleFocus?.();
    revealControls();
  }, [onToggleFocus, revealControls]);

  return (
    <View style={styles.root}>
      {matte === 'brand_static' ? <LinearGradient
        colors={['#071815', '#16463F', '#1D5047', '#071815']}
        locations={[0, 0.3, 0.68, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ambient}
      /> : null}
      {matte === 'brand_static' ? <View pointerEvents="none" style={styles.ambientGlow} /> : null}
      <View style={styles.mediaFrame}>
        <LiveStageParticipantTile
          participant={participant}
          identity={identity}
            fit={fit}
          trackType="screenShareTrack"
          editorialFocus={editorialFocus}
          ParticipantViewComponent={sdk.ParticipantView}
          showFooter={false}
          stageOverlay={(
            <Pressable
              accessibilityHint="Reveals the focused screen-view control"
              accessibilityLabel="Show screen controls"
              accessibilityRole="button"
              onPress={revealControls}
              style={styles.overlay}
            >
              {onToggleFocus ? (
                <Animated.View
                  pointerEvents={controlsVisible ? 'auto' : 'none'}
                  style={[styles.focusControl, { opacity: controlsOpacity }]}
                >
                  <Pressable
                  accessibilityLabel={focused ? 'Exit focused screen view' : 'Focus shared screen'}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={toggleFocus}
                  style={({ pressed }) => [
                    styles.focusButton,
                    { top: focused ? Math.max(12, safeAreaInsets.top + 8) : 12 },
                    pressed && styles.focusButtonPressed,
                  ]}
                  >
                    {focused
                      ? <Minimize2 color="#F6FFFC" size={18} strokeWidth={2.2} />
                      : <Maximize2 color="#F6FFFC" size={18} strokeWidth={2.2} />}
                  </Pressable>
                </Animated.View>
              ) : null}
            </Pressable>
          )}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: '#071815',
  },
  ambient: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  ambientGlow: {
    position: 'absolute',
    top: '10%',
    right: '7%',
    bottom: '10%',
    left: '7%',
    borderRadius: 999,
    backgroundColor: '#55D8C526',
  },
  mediaFrame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: '#020706',
    borderWidth: 1,
    borderColor: '#7DE0CF66',
    shadowColor: '#000000',
    shadowOpacity: 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
  },
  focusControl: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  focusButton: {
    position: 'absolute',
    right: 12,
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06110FEB',
    borderWidth: 1,
    borderColor: '#5BC1BB8A',
    elevation: 11,
  },
  focusButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
