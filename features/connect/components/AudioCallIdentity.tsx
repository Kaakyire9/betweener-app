import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { VoiceViewState } from '../voice/voice-types';

export function AudioCallBrand() {
  return <View style={styles.brand}>
    <Ionicons accessible={false} name="heart-outline" color="#80DAD7" size={29} />
    <Text style={styles.wordmark}>BETWEENER <Text style={styles.connect}>CONNECT</Text></Text>
  </View>;
}
export function AudioCallIdentity({ name, status, duration }: { name: string; status: string; duration?: string }) {
  return <View style={styles.identity}>
    <Text accessibilityRole="header" accessibilityLabel={name} numberOfLines={2} style={styles.name}>{name}</Text>
    <Text style={styles.subtitle}>A little closer, by voice</Text>
    <View style={styles.pill}>
      <Ionicons accessible={false} name={duration ? 'time-outline' : 'call-outline'} size={17} color="#D5E8E1" />
      <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
      {duration && <Text accessibilityLabel={`Connected duration ${duration}`} style={styles.duration}>{duration}</Text>}
    </View>
  </View>;
}
export const audioCallStatus = (state: VoiceViewState) => ({ IDLE: 'Ready to connect', REQUESTED: 'Starting call…',
  RINGING: state.incoming ? 'Incoming voice call' : 'Calling…', CONNECTING: 'Connecting audio…', ACTIVE: 'Connected',
  RECONNECTING: 'Reconnecting…', ENDING: 'Ending call…', ENDED: 'Call ended', FAILED: 'Call could not connect' })[state.phase];
const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: 5, paddingVertical: 5 }, wordmark: { color: '#E9EEE5', fontFamily: 'Manrope_600SemiBold', fontSize: 11, letterSpacing: 3, textAlign: 'center' },
  connect: { color: '#CBB4E9' }, identity: { alignItems: 'center', gap: 9, width: '100%' },
  name: { color: '#F7F0E4', fontSize: 45, lineHeight: 54, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', textAlign: 'center' },
  subtitle: { color: '#CEB9E9', fontSize: 16, textAlign: 'center' },
  pill: { minHeight: 36, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 9, rowGap: 4,
    paddingVertical: 7, paddingHorizontal: 17, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(190,235,224,0.13)', backgroundColor: 'rgba(177,217,207,0.08)' },
  status: { color: '#DFEAE2', fontSize: 14 }, duration: { color: '#F7F0E4', fontSize: 17, fontVariant: ['tabular-nums'] },
});
