import { useEffect } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const GLOBAL_GLOBE = require('../../assets/images/onboarding/global-globe.png');

export function AnimatedGlobalLocation({ size = 240, selected = false }: { size?: number; selected?: boolean }) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const orbit = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(withTiming(1, { duration: 5600, easing: Easing.inOut(Easing.cubic) }), -1, true);
    orbit.value = withRepeat(withTiming(1, { duration: 18_000, easing: Easing.linear }), -1, false);
  }, [breathe, orbit, reduceMotion]);

  const imageStyle = useAnimatedStyle(() => ({
    opacity: 0.92 + breathe.value * 0.08,
    transform: [
      { translateY: reduceMotion ? 0 : -2 * breathe.value },
      { scale: selected ? 1.015 : 0.99 + breathe.value * 0.01 },
    ] as ViewStyle['transform'],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? 0.14 : 0.1 + breathe.value * 0.12 }));
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 360}deg` }] as ViewStyle['transform'],
  }));

  return (
    <View pointerEvents="none" style={[styles.root, { width: size, height: size }]}>
      <Animated.View style={[styles.halo, { width: size * 0.65, height: size * 0.65, borderRadius: size }, haloStyle]} />
      <Animated.View style={[styles.orbit, { width: size * 0.84, height: size * 0.42, borderRadius: size, left: size * 0.08, top: size * 0.27 }, orbitStyle]}>
        <View style={styles.goldNode} />
        <View style={styles.tealNode} />
      </Animated.View>
      <Animated.View style={[{ width: size, height: size }, imageStyle]}>
        <Image source={GLOBAL_GLOBE} resizeMode="contain" style={{ width: size, height: size }} />
      </Animated.View>
      <View style={[styles.connectionNode, styles.connectionNodeLeft]} />
      <View style={[styles.connectionNode, styles.connectionNodeRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: '#13A8A8', shadowColor: '#13A8A8', shadowOpacity: 0.32, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
  orbit: { position: 'absolute', zIndex: 2, borderWidth: 1, borderColor: 'rgba(244,235,221,0.22)' },
  goldNode: { position: 'absolute', width: 7, height: 7, borderRadius: 4, top: -4, left: '48%', backgroundColor: '#E7C36A' },
  tealNode: { position: 'absolute', width: 5, height: 5, borderRadius: 3, right: 12, bottom: 3, backgroundColor: '#6BD3D0' },
  connectionNode: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#8B5CFF', shadowColor: '#8B5CFF', shadowOpacity: 0.55, shadowRadius: 9 },
  connectionNodeLeft: { left: '13%', top: '48%' },
  connectionNodeRight: { right: '12%', top: '34%' },
});
