import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { VoicePeer, VoicePhase } from '../voice/voice-types';
import { voicePeerPhotos } from '../voice/peer-gallery';

interface Props { peer: VoicePeer | null; phase: VoicePhase; screenActive: boolean; motionAllowed: boolean }

/** Keyed by admitted call + peer in the parent. The carousel never touches media state. */
export function AudioCallPortrait({ peer, phase, screenActive, motionAllowed }: Props) {
  const { width, height } = useWindowDimensions();
  const diameter = Math.max(140, Math.min(width - 100, height * 0.27, 286));
  const photosKey = JSON.stringify(voicePeerPhotos(peer?.avatar, peer?.photos));
  // Content-based dependency avoids resetting autoplay on every controller tick.
  const photos: string[] = useMemo(() => JSON.parse(photosKey), [photosKey]);
  const [index, setIndex] = useState(0), [auto, setAuto] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const available = photos.filter(uri => !failed.includes(uri));
  const browsing = phase === 'ACTIVE' && screenActive && available.length > 1;
  const rotating = browsing && auto && motionAllowed;
  const primary = available[0];
  const selected = phase === 'RINGING' || phase === 'REQUESTED' || phase === 'CONNECTING' ? primary : available[index] ?? primary;
  const pulse = useRef(new Animated.Value(0)).current;
  const breathing = screenActive && motionAllowed && ['REQUESTED', 'RINGING', 'CONNECTING', 'ACTIVE'].includes(phase);
  useEffect(() => { setIndex(0); setAuto(false); setFailed([]); }, [photosKey]);
  useEffect(() => { if (!browsing || !motionAllowed) setAuto(false); }, [browsing, motionAllowed]);
  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(() => setIndex(value => (value + 1) % available.length), 8_000);
    return () => clearInterval(timer);
  }, [rotating, available.length]);
  useEffect(() => {
    if (!breathing) { pulse.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ]));
    animation.start();
    return () => { animation.stop(); pulse.setValue(0); };
  }, [breathing, pulse]);
  const move = useCallback((step: number) => {
    setAuto(false);
    if (browsing) setIndex(value => ((value < available.length ? value : 0) + step + available.length) % available.length);
  }, [available.length, browsing]);
  const gesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) => browsing && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.5,
    onPanResponderGrant: () => setAuto(false),
    onPanResponderRelease: (_, { dx }) => { if (Math.abs(dx) > 24) move(dx < 0 ? 1 : -1); },
    onPanResponderTerminationRequest: () => true,
  }), [browsing, move]);
  const current = Math.max(0, available.indexOf(selected));
  return <View style={styles.stage}>
    <View style={{ width: diameter + 40, height: diameter + 40, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" accessible={false} style={[styles.aura, {
        width: diameter + 38, height: diameter + 38, borderRadius: (diameter + 38) / 2,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.03] }) }],
      }]} />
      <LinearGradient colors={['#6CE6DF', '#3B9EAC', '#B398E3', '#DFC1FA']} start={{ x: 0, y: 0.25 }} end={{ x: 1, y: 0.8 }}
        style={[styles.halo, { width: diameter + 6, height: diameter + 6, borderRadius: (diameter + 6) / 2 }]}>
        <View testID="call-profile-gesture" {...gesture.panHandlers} onTouchStart={() => setAuto(false)} style={[styles.mask, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}>
          {selected ? <Image accessible source={{ uri: selected }} recyclingKey={`${peer?.profileId}:${selected}`} contentFit="cover" cachePolicy="memory-disk"
            transition={motionAllowed ? { duration: 350, effect: 'cross-dissolve' } : 0}
            accessibilityLabel={available.length > 1 ? `${peer?.name || 'Participant'}, photo ${current + 1} of ${available.length}` : 'Participant avatar'}
            onError={() => { setAuto(false); setFailed(value => value.includes(selected) ? value : [...value, selected]); setIndex(0); }} style={StyleSheet.absoluteFill} />
            : <Text accessibilityLabel={`${peer?.name || 'Participant'} initials`} style={styles.initial}>{peer?.name.trim().charAt(0).toUpperCase() || 'B'}</Text>}
        </View>
      </LinearGradient>
    </View>
    {available.length > 1 && phase === 'ACTIVE' && <View style={styles.navigation} accessibilityLabel="Participant profile photos">
      <Pressable accessibilityRole="button" accessibilityLabel="Previous profile photo" disabled={!browsing} onPress={() => move(-1)} style={styles.arrow}><Ionicons name="chevron-back" color="#D8EBE5" size={19} /></Pressable>
      <View style={styles.dots} pointerEvents="none" accessible={false}>{available.map((uri, i) => <View key={uri} style={[styles.dot, i === current && styles.currentDot]} />)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Next profile photo" disabled={!browsing} onPress={() => move(1)} style={styles.arrow}><Ionicons name="chevron-forward" color="#D8EBE5" size={19} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={auto ? 'Pause automatic photos' : 'Play automatic photos'} accessibilityHint="Changes the photo every eight seconds. Touching a photo pauses rotation."
        accessibilityState={{ disabled: !browsing || !motionAllowed }} disabled={!browsing || !motionAllowed} onPress={() => setAuto(value => !value)} style={[styles.auto, (!browsing || !motionAllowed) && styles.disabled]}>
        <Ionicons accessible={false} name={auto ? 'pause' : 'play'} size={11} color="#CDBAE7" /><Text style={styles.autoLabel}>{auto ? 'Pause' : 'Auto'}</Text>
      </Pressable>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  stage: { alignItems: 'center' }, aura: { position: 'absolute', borderWidth: 1, borderColor: '#7DCCC9', backgroundColor: 'rgba(42,172,171,0.06)' },
  halo: { alignItems: 'center', justifyContent: 'center', shadowColor: '#7DDFDA', shadowOffset: { width: 0, height: 0 }, shadowRadius: 14, shadowOpacity: 0.25 },
  mask: { overflow: 'hidden', backgroundColor: '#123639', alignItems: 'center', justifyContent: 'center' }, initial: { color: '#CBEEE4', fontSize: 70, fontFamily: 'Manrope_600SemiBold' },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1 }, arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 4, height: 4, borderRadius: 4, backgroundColor: '#74918F' }, currentDot: { width: 13, backgroundColor: '#AADBD4' },
  auto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 65, minHeight: 44, gap: 5 }, autoLabel: { fontSize: 12, color: '#CDBAE7' }, disabled: { opacity: 0.4 },
});
