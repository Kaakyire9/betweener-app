import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';
import type { Match } from '@/types/match';

const CELEBRATION_SYMBOLS = ['\u2661', '\u2665', '\u2726', '\u2728'] as const;

export default function MatchModal({
  visible,
  match,
  onSendMessage,
  onKeepDiscovering,
  onClose,
}: {
  visible: boolean;
  match?: Match | null;
  onSendMessage?: (m?: Match) => void;
  onKeepDiscovering?: () => void;
  onClose?: () => void;
}) {
  const scale = useRef(new Animated.Value(0.94)).current;
  const safeAvatarUrl = getSafeRemoteImageUri(match?.avatar_url);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(26)).current;
  const rotate = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const celebrationFlash = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const particles = useRef(Array.from({ length: 16 }).map(() => new Animated.Value(0))).current;
  const frontBurst = useRef(Array.from({ length: 10 }).map(() => new Animated.Value(0))).current;

  const particleSeeds = useMemo(
    () =>
      Array.from({ length: 16 }).map((_, index) => ({
        startX: 6 + ((index * 15) % 84),
        driftX: (index % 2 === 0 ? 1 : -1) * (12 + (index % 4) * 7),
        fall: 130 + index * 18,
        size: 18 + (index % 3) * 5,
        symbol: CELEBRATION_SYMBOLS[index % CELEBRATION_SYMBOLS.length],
        tint:
          index % 4 === 0
            ? '#D7A6FF'
            : index % 3 === 0
              ? '#11C5C6'
              : index % 2 === 0
                ? '#E6D4B8'
                : '#F1C56D',
      })),
    [],
  );

  const frontBurstSeeds = useMemo(
    () => [
      { side: 'left', offsetX: 18, offsetY: 48, driftX: 22, driftY: -36, size: 20, symbol: '\u2728', tint: '#F1C56D' },
      { side: 'right', offsetX: 14, offsetY: 60, driftX: -24, driftY: -30, size: 22, symbol: '\u2661', tint: '#11C5C6' },
      { side: 'left', offsetX: 44, offsetY: 90, driftX: 20, driftY: -44, size: 24, symbol: '\u2665', tint: '#F1C56D' },
      { side: 'right', offsetX: 38, offsetY: 84, driftX: -18, driftY: -46, size: 20, symbol: '\u2728', tint: '#D7A6FF' },
      { side: 'left', offsetX: 28, offsetY: 126, driftX: 28, driftY: -32, size: 18, symbol: '\u2661', tint: '#11C5C6' },
      { side: 'right', offsetX: 24, offsetY: 132, driftX: -24, driftY: -28, size: 24, symbol: '\u2665', tint: '#D7A6FF' },
      { side: 'left', offsetX: 74, offsetY: 68, driftX: 22, driftY: -38, size: 18, symbol: '\u2726', tint: '#E6D4B8' },
      { side: 'right', offsetX: 70, offsetY: 106, driftX: -18, driftY: -36, size: 18, symbol: '\u2726', tint: '#F1C56D' },
      { side: 'left', offsetX: 94, offsetY: 92, driftX: 18, driftY: -34, size: 20, symbol: '\u2665', tint: '#F1C56D' },
      { side: 'right', offsetX: 94, offsetY: 76, driftX: -20, driftY: -32, size: 20, symbol: '\u2661', tint: '#11C5C6' },
    ],
    [],
  );

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          tension: 44,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 42, friction: 8, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 0, duration: 460, useNativeDriver: true }),
        Animated.timing(halo, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(celebrationFlash, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(celebrationFlash, { toValue: 0, duration: 640, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(120),
          Animated.timing(sheen, { toValue: 1, duration: 720, useNativeDriver: true }),
          Animated.timing(sheen, { toValue: 0, duration: 1, useNativeDriver: true }),
        ]),
      ]).start();

      particles.forEach((value, index) => {
        Animated.timing(value, {
          toValue: 1,
          duration: 1320 + index * 40,
          delay: 72 + index * 46,
          useNativeDriver: true,
        }).start();
      });

      frontBurst.forEach((value, index) => {
        Animated.timing(value, {
          toValue: 1,
          duration: 840 + index * 30,
          delay: 108 + index * 22,
          useNativeDriver: true,
        }).start();
      });
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.94, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 26, duration: 180, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(celebrationFlash, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(sheen, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]).start();
      particles.forEach((value) => value.setValue(0));
      frontBurst.forEach((value) => value.setValue(0));
    }
  }, [celebrationFlash, frontBurst, halo, opacity, particles, rotate, scale, sheen, translateY, visible]);

  if (!visible || !match) return null;

  const displayName = match.age ? `${match.name}, ${match.age}` : match.name;
  const contextBits = [
    Array.isArray(match.commonInterests) && match.commonInterests.length > 0
      ? `Shared spark: ${match.commonInterests.slice(0, 2).join(' · ')}`
      : null,
    match.location || match.region || null,
    match.verified ? 'Verified profile' : null,
  ].filter(Boolean) as string[];

  const contextLine =
    contextBits[0] ??
    'A thoughtful hello usually lands better while the energy is still warm.';

  return (
    <View style={styles.overlay} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable style={styles.backdropTap} onPress={onClose}>
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.72] }) },
          ]}
        />
      </Pressable>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View
          style={[
            styles.celebrationFlash,
            {
              opacity: celebrationFlash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.46] }),
              transform: [
                {
                  scale: celebrationFlash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.72, 1.16],
                  }),
                },
              ],
            },
          ]}
        />

        {particles.map((value, index) => {
          const seed = particleSeeds[index];
          const translateYParticle = value.interpolate({ inputRange: [0, 1], outputRange: [-18, seed.fall] });
          const translateXParticle = value.interpolate({ inputRange: [0, 1], outputRange: [0, seed.driftX] });
          const particleOpacity = value.interpolate({
            inputRange: [0, 0.18, 0.82, 1],
            outputRange: [0, 0.38, 0.22, 0],
          });
          const scaleParticle = value.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.7, 1.02, 0.94] });
          const rotation = value.interpolate({
            inputRange: [0, 1],
            outputRange: [`${index % 2 === 0 ? -12 : 10}deg`, `${index % 2 === 0 ? 8 : -6}deg`],
          });

          return (
            <Animated.Text
              key={`particle-${index}`}
              style={[
                styles.particle,
                {
                  left: `${seed.startX}%`,
                  fontSize: seed.size,
                  color: seed.tint,
                  opacity: particleOpacity,
                  transform: [
                    { translateY: translateYParticle },
                    { translateX: translateXParticle },
                    { scale: scaleParticle },
                    { rotate: rotation },
                  ],
                },
              ]}
            >
              {seed.symbol}
            </Animated.Text>
          );
        })}
      </View>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.cardWrap,
            {
              opacity,
              transform: [
                { translateY },
                { scale },
                {
                  rotate: rotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '-1.8deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient colors={['#F8F0E3', '#F4E6D5', '#F0E0CD']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.topGlow} />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sheen,
                {
                  opacity: sheen.interpolate({ inputRange: [0, 0.06, 1], outputRange: [0, 0.16, 0] }),
                  transform: [
                    {
                      translateX: sheen.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-320, 340],
                      }),
                    },
                    { rotate: '18deg' },
                  ],
                },
              ]}
            />

            <View style={styles.avatarStage}>
              <Animated.View
                style={[
                  styles.avatarHaloOuter,
                  {
                    opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.9] }),
                    transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1.06] }) }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.avatarHaloInner,
                  {
                    opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.6] }),
                    transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }],
                  },
                ]}
              />
              <LinearGradient colors={['rgba(17,197,198,0.22)', 'rgba(215,166,255,0.18)', 'rgba(230,212,184,0.14)']} style={styles.avatarRing}>
                {safeAvatarUrl ? (
                  <Image source={{ uri: safeAvatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{(match.name || 'B').slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
              </LinearGradient>
            </View>

            <Text style={styles.eyebrow}>BETWEENER MATCH</Text>
            <Text style={styles.title}>There&apos;s something here</Text>
            <Text style={styles.subtitle}>{displayName}</Text>

            <View style={styles.contextPill}>
              <View style={styles.contextDot} />
              <Text style={styles.contextText}>{contextLine}</Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  onSendMessage?.(match);
                  onClose?.();
                }}
                style={styles.primaryButtonShell}
              >
                <LinearGradient colors={['#11C5C6', '#0E8E92']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Send a thoughtful hello</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.secondaryButton}
                onPress={() => {
                  onKeepDiscovering?.();
                  onClose?.();
                }}
              >
                <Text style={styles.secondaryText}>Keep discovering</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={styles.frontBurstLayer} pointerEvents="none">
          {frontBurst.map((value, index) => {
            const seed = frontBurstSeeds[index];
            const translateXParticle = value.interpolate({ inputRange: [0, 1], outputRange: [0, seed.driftX] });
            const translateYParticle = value.interpolate({ inputRange: [0, 1], outputRange: [0, seed.driftY] });
            const particleOpacity = value.interpolate({
              inputRange: [0, 0.22, 0.9, 1],
              outputRange: [0, 0.96, 0.68, 0],
            });
            const scaleParticle = value.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.72, 1.1, 0.92] });
            const rotation = value.interpolate({
              inputRange: [0, 1],
              outputRange: [`${seed.side === 'left' ? -18 : 18}deg`, `${seed.side === 'left' ? 10 : -10}deg`],
            });

            return (
              <Animated.Text
                key={`front-burst-${index}`}
                style={[
                  styles.frontParticle,
                  seed.side === 'left'
                    ? { left: seed.offsetX, top: seed.offsetY }
                    : { right: seed.offsetX, top: seed.offsetY },
                  {
                    fontSize: seed.size,
                    color: seed.tint,
                    opacity: particleOpacity,
                    transform: [
                      { translateX: translateXParticle },
                      { translateY: translateYParticle },
                      { scale: scaleParticle },
                      { rotate: rotation },
                    ],
                  },
                ]}
              >
                {seed.symbol}
              </Animated.Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20000,
    elevation: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#05070D',
  },
  celebrationFlash: {
    position: 'absolute',
    top: '16%',
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 235, 221, 0.36)',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
  },
  frontBurstLayer: {
    position: 'absolute',
    width: '100%',
    maxWidth: 420,
    height: 280,
    top: '19%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(122, 96, 67, 0.16)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.34,
    shadowRadius: 34,
    elevation: 26,
  },
  sheen: {
    position: 'absolute',
    top: -40,
    left: 0,
    width: 120,
    height: 420,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  topGlow: {
    position: 'absolute',
    top: -80,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  avatarStage: {
    width: 152,
    height: 152,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  avatarHaloOuter: {
    position: 'absolute',
    width: 152,
    height: 152,
    borderRadius: 999,
    backgroundColor: 'rgba(17,197,198,0.12)',
  },
  avatarHaloInner: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 999,
    backgroundColor: 'rgba(215,166,255,0.12)',
  },
  avatarRing: {
    width: 118,
    height: 118,
    borderRadius: 999,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.54)',
    shadowColor: '#11C5C6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: '#E6D4B8',
  },
  avatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: '#123533',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 40,
    color: '#F8F0E3',
    fontWeight: '700',
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2.4,
    color: '#0E8E92',
    fontWeight: '700',
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    color: '#0E1726',
    fontFamily: 'PlayfairDisplay_700Bold',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#415164',
    fontWeight: '600',
    textAlign: 'center',
  },
  contextPill: {
    marginTop: 18,
    width: '100%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(122, 96, 67, 0.12)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  contextDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#11C5C6',
    marginTop: 6,
  },
  contextText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#455468',
    fontWeight: '500',
  },
  actions: {
    marginTop: 22,
    width: '100%',
    gap: 10,
  },
  primaryButtonShell: {
    width: '100%',
    borderRadius: 18,
    shadowColor: '#11C5C6',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryText: {
    color: '#F8FEFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(122, 96, 67, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  secondaryText: {
    color: '#2A3950',
    fontSize: 15,
    fontWeight: '700',
  },
  particle: {
    position: 'absolute',
    top: '14%',
    textShadowColor: 'rgba(5, 7, 13, 0.18)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  frontParticle: {
    position: 'absolute',
    textShadowColor: 'rgba(248, 240, 227, 0.28)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
});
