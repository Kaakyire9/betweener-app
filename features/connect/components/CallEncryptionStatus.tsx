import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import type { VoiceViewState } from '../voice/voice-types';
export function CallEncryptionStatus({ encryption }: { encryption: VoiceViewState['encryption'] }) {
  if (!encryption?.required) return null;
  return <View accessibilityLabel="Call encryption status" style={styles.root}>
    <Ionicons name={encryption.sdkConfirmed ? 'lock-closed-outline' : 'shield-outline'} size={14} color={Colors.dark.secondary} />
    <Text style={styles.label}>{encryption.sdkConfirmed ? 'End-to-end encrypted' : 'Securing your call…'}</Text>
  </View>;
}
const styles = StyleSheet.create({ root: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  label: { color: Colors.dark.secondary, fontSize: 12, fontFamily: 'Manrope_500Medium' } });
