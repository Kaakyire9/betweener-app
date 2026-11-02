import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  type ViewStyle,
  View,
} from 'react-native';

import type { CirclePulsePalette } from '@/lib/circles/pulse/circle-pulse-theme';

type Props = {
  avatarUrl?: string | null;
  name: string;
  palette: CirclePulsePalette;
  onOpenProfile?: () => void;
};

const chairFront = require('@/assets/images/circle-pulse/love-seat/chair-front.png');
const chairThreeQuarter = require('@/assets/images/circle-pulse/love-seat/chair-three-quarter.png');
const chairDissolve = require('@/assets/images/circle-pulse/love-seat/chair-dissolve.png');
const portraitHalo = require('@/assets/images/circle-pulse/love-seat/portrait-halo.png');

const imageOpacity = (progress: Animated.Value, inputRange: number[]) => progress.interpolate({
  inputRange,
  outputRange: [0, 1, 0],
  extrapolate: 'clamp',
});

export default function CircleLoveSeatCeremony({
  avatarUrl,
  name,
  palette,
  onOpenProfile,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [assetFailed, setAssetFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled || reduceMotion || process.env.NODE_ENV === 'test') {
          progress.setValue(1);
          return;
        }

        progress.setValue(0);
        animation = Animated.timing(progress, {
          toValue: 1,
          duration: 3700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        });
        animation.start();
      })
      .catch(() => progress.setValue(1));

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [progress]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') progress.stopAnimation(() => progress.setValue(1));
    });
    return () => subscription.remove();
  }, [progress]);

  useEffect(() => {
    if (assetFailed) progress.stopAnimation(() => progress.setValue(1));
  }, [assetFailed, progress]);

  const chairTransform: Animated.WithAnimatedObject<ViewStyle> = {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 0.58, 1],
          outputRange: [7, 0, -5],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 0.58, 1],
          outputRange: [0.93, 1, 1.06],
        }),
      },
    ],
  };
  const portraitOpacity = progress.interpolate({
    inputRange: [0, 0.68, 0.88, 1],
    outputRange: [0, 0, 1, 1],
    extrapolate: 'clamp',
  });
  const portraitScale = progress.interpolate({
    inputRange: [0, 0.68, 0.9, 1],
    outputRange: [0.72, 0.72, 1.035, 1],
    extrapolate: 'clamp',
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}'s ceremonial portrait`}
      disabled={!onOpenProfile}
      onPress={onOpenProfile}
      style={[styles.stage, { borderColor: palette.purpleBorder }]}
    >
      <LinearGradient
        colors={palette.dark
          ? ['rgba(139,92,255,0.2)', 'rgba(19,168,168,0.08)', 'rgba(2,17,20,0)']
          : ['rgba(139,92,255,0.12)', 'rgba(255,255,255,0.66)', 'rgba(19,168,168,0.05)']}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[
        styles.floorGlow,
        !palette.dark && styles.floorGlowLight,
        { backgroundColor: palette.purpleSoft },
      ]} />

      <Animated.View pointerEvents="none" style={[styles.chairLayer, chairTransform, {
        opacity: progress.interpolate({ inputRange: [0, 0.2, 0.32], outputRange: [1, 1, 0], extrapolate: 'clamp' }),
      }]}>
        <Image source={chairFront} style={styles.chairImage} contentFit="contain" onError={() => setAssetFailed(true)} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.chairLayer, chairTransform, { opacity: imageOpacity(progress, [0.18, 0.32, 0.48]) }]}>
        <Image source={chairThreeQuarter} style={styles.chairImage} contentFit="contain" onError={() => setAssetFailed(true)} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.chairLayer, chairTransform, { opacity: imageOpacity(progress, [0.4, 0.58, 0.84]) }]}>
        <Image source={chairDissolve} style={styles.chairImage} contentFit="contain" onError={() => setAssetFailed(true)} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.portraitReveal, { opacity: portraitOpacity, transform: [{ scale: portraitScale }] }]}
      >
        <View style={[styles.portraitFrame, { borderColor: palette.purpleStrong, backgroundColor: palette.surfaceStrong }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.portrait} contentFit="cover" transition={180} />
          ) : (
            <MaterialCommunityIcons name="account-heart-outline" size={48} color={palette.purple} />
          )}
        </View>
        <Image source={portraitHalo} style={styles.halo} contentFit="contain" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: 176,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorGlow: {
    position: 'absolute',
    left: '19%',
    right: '19%',
    bottom: 13,
    height: 20,
    borderRadius: 999,
    opacity: 0.8,
    transform: [{ scaleX: 1.35 }],
  },
  floorGlowLight: {
    left: '27%',
    right: '27%',
    bottom: 18,
    height: 14,
    opacity: 0.5,
    transform: [{ scaleX: 1.1 }],
  },
  chairLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chairImage: {
    width: 166,
    height: 152,
  },
  portraitReveal: {
    width: 154,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitFrame: {
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  portrait: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  halo: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
