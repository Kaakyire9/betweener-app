import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Match } from '@/types/match';

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
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const confetti = useRef(Array.from({ length: 18 }).map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]).start();

      // simple confetti burst: animate each piece downward with random offsets/delays
      confetti.forEach((cv, idx) => {
        const delay = 60 + Math.round(Math.random() * 220) + idx * 10;
        Animated.timing(cv, {
          toValue: 1,
          duration: 900 + Math.round(Math.random() * 400),
          delay,
          useNativeDriver: true,
        }).start();
      });
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.85, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      // reset confetti values for next time
      confetti.forEach((cv) => cv.setValue(0));
    }
  }, [visible]);

  if (!visible || !match) return null;

  return (
    <View style={styles.overlay} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]} />

      {/* confetti layer */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {confetti.map((cv, i) => {
          const startX = Math.round(Math.random() * 100);
          const translateY = cv.interpolate({ inputRange: [0, 1], outputRange: [-40, 420 + Math.round(Math.random() * 140)] });
          const translateX = cv.interpolate({ inputRange: [0, 1], outputRange: [startX, startX + (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 200)] });
          const rotate = cv.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(Math.random() > 0.5 ? 1 : -1) * 720}deg`] });
          const size = 6 + Math.round(Math.random() * 10);
          const colors = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#60a5fa', '#7c3aed'];
          const color = colors[i % colors.length];

          return (
            <Animated.View
              key={`cf-${i}`}
              style={[
                styles.confetti,
                {
                  width: size,
                  height: size,
                  backgroundColor: color,
                  transform: [{ translateY }, { translateX }, { rotate }],
                  left: `${Math.round(Math.random() * 100)}%`,
                  top: -20,
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }] as any}>
          <Image source={{ uri: match.avatar_url }} style={styles.avatar} />
          <Text style={styles.title}>It's a Match!</Text>
          <Text style={styles.subtitle}>{`${match.name}, ${match.age}`}</Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.primaryButton]}
              onPress={() => {
                onSendMessage?.(match);
                onClose?.();
              }}
            >
              <Text style={styles.primaryText}>Send Message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() => {
                onKeepDiscovering?.();
                onClose?.();
              }}
            >
              <Text style={styles.ghostText}>Keep Discovering</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    width: '86%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 20,
  },
  avatar: { width: 120, height: 120, borderRadius: 64, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a', marginTop: 6 },
  subtitle: { fontSize: 16, color: '#4b5563', marginBottom: 18 },
  actionsRow: { flexDirection: 'row', width: '100%', justifyContent: 'center', gap: 12 },
  primaryButton: { backgroundColor: '#0ea5a0', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, marginRight: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
  ghostButton: { borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  ghostText: { color: '#374151', fontWeight: '700' },
  confetti: {
    position: 'absolute',
    borderRadius: 2,
    opacity: 0.95,
  },
});
