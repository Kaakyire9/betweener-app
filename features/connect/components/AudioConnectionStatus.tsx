import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import type { AudioHealth } from '../media/audio-health';
import { connectionQuality } from '../media/connection-quality';

export function AudioConnectionStatus({ health }: { health?: AudioHealth }) {
  const reception = health?.reception;
  const text = reception === 'receiving' ? 'Receiving audio packets'
    : reception === 'stale' ? 'Audio statistics are not current'
      : reception === 'awaiting' ? 'Waiting for audio packets' : 'Checking audio delivery';
  return <View accessibilityLabel="Call connection established" style={styles.root}>
    <Text style={styles.title}>Call connected</Text>
    <Text style={styles.detail}>{text}</Text>
    {connectionQuality(health) !== 'unknown' && <Text style={styles.detail}>{connectionQuality(health) === 'good' ? 'Connection stable' : 'Connection is weak'}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 5, backgroundColor: Colors.dark.backgroundSubtle, padding: 12, borderRadius: 18 },
  title: { color: Colors.dark.secondary, fontSize: 13 }, detail: { color: Colors.dark.textMuted, fontSize: 12 },
});
