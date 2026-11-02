import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { videoPreparationStatus, type VideoPreparationState } from '../domain/video-preparation';
import type { VoiceViewState } from '../voice/voice-types';
import { VoiceSafetyPanel, type VoiceSafetyActions } from './VoiceSafetyPanel';
import type { ConnectFeatureFlags } from '../config/connect-feature-flags';

export function VideoCallPreparation({ state, preview, voiceState, safetyActions, flags, onClose, onEndCall }: {
  state: VideoPreparationState; preview?: React.ReactNode; voiceState?: VoiceViewState;
  safetyActions?: VoiceSafetyActions; flags?: ConnectFeatureFlags; onClose(): void; onEndCall?(): void;
}) {
  const model = videoPreparationStatus(state);
  return <SafeAreaView style={styles.root}><View style={styles.content}>
    <Text style={styles.brand}>BETWEENER CONNECT</Text><Text accessibilityRole="header" style={styles.title}>Meet face to face</Text>
    <View accessibilityLabel={model.previewAllowed && preview ? 'Approved camera preview' : 'Camera off'} style={styles.canvas}>
      {model.previewAllowed && preview ? preview : <><Ionicons name="videocam-off-outline" size={44} color={Colors.dark.secondary} /><Text style={styles.text}>Camera off</Text></>}
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{model.message}</Text><Text style={styles.text}>Video calling is not available yet. Voice permission never turns on your camera.</Text>
    <View style={styles.controls}>{['Turn camera on', 'Switch camera', state.microphoneMuted ? 'Unmute microphone' : 'Mute microphone'].map(label =>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: true }} disabled key={label} style={styles.disabled}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
    {voiceState && <VoiceSafetyPanel state={voiceState} actions={safetyActions} flags={flags} />}
    {voiceState && onEndCall && <Pressable accessibilityRole="button" accessibilityLabel="End call" onPress={onEndCall} style={styles.back}><Text style={[styles.text, { color: Colors.dark.danger }]}>End call</Text></Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel="Close video preparation" onPress={onClose} style={styles.back}><Text style={styles.text}>Back</Text></Pressable>
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.dark.background }, content: { flex: 1, padding: 26, gap: 20, alignItems: 'center' }, brand: { color: Colors.dark.secondary, letterSpacing: 2, fontSize: 12 },
  title: { color: Colors.dark.text, fontSize: 29, fontFamily: 'Manrope_600SemiBold' }, canvas: { flex: 1, minHeight: 180, width: '100%', maxWidth: 420, borderRadius: 28, backgroundColor: Colors.dark.backgroundSubtle, borderWidth: 1, borderColor: Colors.dark.accent, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', gap: 18 },
  text: { color: Colors.dark.textMuted, lineHeight: 21, textAlign: 'center' }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }, disabled: { minHeight: 48, padding: 10, justifyContent: 'center', opacity: 0.45 }, back: { minHeight: 48, padding: 12, justifyContent: 'center' } });
