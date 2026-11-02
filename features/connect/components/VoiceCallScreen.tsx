import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';
import type { VoiceViewState, VoiceRoute } from '../voice/voice-types';
import { VoiceCallControls } from './VoiceCallControls';
import { VoiceSafetyPanel, type VoiceSafetyActions } from './VoiceSafetyPanel';
import type { ConnectFeatureFlags } from '../config/connect-feature-flags';
import { voiceCompletionMessage } from '../voice/call-presentation';
import { AudioConnectionStatus } from './AudioConnectionStatus';
import { ConversationPrompts } from './ConversationPrompts';

export interface VoiceScreenProps {
  canDismiss?: boolean;
  safetyActions?: VoiceSafetyActions; flags?: ConnectFeatureFlags;
  state: VoiceViewState; onAccept(): void; onDecline(): void; onHangup(): void; onMute(): void;
  onRoute(route: VoiceRoute): void; onDone(): void; onOpenSettings(): void;
}
const colors = Colors.dark;
const status = (state: VoiceViewState) => ({ IDLE: 'Ready to connect', REQUESTED: 'Starting call…',
  RINGING: state.incoming ? 'Incoming voice call' : 'Calling…', CONNECTING: 'Connecting audio…', ACTIVE: 'Connected',
  RECONNECTING: 'Reconnecting…', ENDING: 'Ending call…', ENDED: 'Call ended', FAILED: 'Call could not connect' })[state.phase];
export function voiceDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60); return `${minutes.toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}
export function VoiceCallScreen(props: VoiceScreenProps) {
  const { state } = props; const avatar = getSafeRemoteImageUri(state.peer?.avatar);
  const showDuration = ['ACTIVE', 'RECONNECTING', 'ENDED'].includes(state.phase) && state.durationSeconds !== null;
  const completion = voiceCompletionMessage(state);
  return <LinearGradient colors={[colors.background, '#102B2D', colors.background]} style={styles.fill}>
    <SafeAreaView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>BETWEENER CONNECT</Text>
        <Text style={styles.private}>A little closer, by voice</Text>
        <View style={styles.identity}>
          <View style={styles.halo}>
            {avatar ? <Image source={{ uri: avatar }} contentFit="cover" style={styles.avatar} accessibilityLabel="Participant avatar" />
              : <View style={[styles.avatar, styles.placeholder]}><Text style={styles.initial}>{state.peer?.name.trim().charAt(0).toUpperCase() || 'B'}</Text></View>}
          </View>
          <Text accessibilityRole="header" style={styles.name}>{state.peer?.name || 'Your connection'}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.status}>{status(state)}</Text>
          {state.phase === 'ACTIVE' && <AudioConnectionStatus health={state.audioHealth} />}
          {state.phase === 'RECONNECTING' && <Text style={styles.hint}>Checking the connection. Audio may be interrupted.</Text>}
          {state.interruption && <Text style={styles.hint}>{state.interruption === 'background'
            ? 'This foreground test ended when the app left the screen. Open a new call to continue.'
            : state.interruption === 'connection_failed' ? 'The connection was interrupted. Start a new call when your network is stable.'
              : 'Audio was interrupted. This call will not restart automatically.'}</Text>}
          {state.authorityStatus === 'unavailable' && <Text accessibilityRole="alert" style={styles.error}>Calling permission cannot currently be confirmed.</Text>}
          {completion && <Text style={styles.hint}>{completion}</Text>}
          {showDuration && <Text accessibilityLabel={`Connected duration ${voiceDuration(state.durationSeconds!)}`} style={styles.duration}>{voiceDuration(state.durationSeconds!)}</Text>}
          {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
          {state.permission === 'blocked' && <Pressable accessibilityRole="button" accessibilityLabel="Open microphone settings" onPress={props.onOpenSettings} style={styles.settings}><Text style={styles.link}>Open settings</Text></Pressable>}
        </View>
        <VoiceCallControls {...props} />
        {state.phase === 'ACTIVE' && <ConversationPrompts />}
        <VoiceSafetyPanel state={state} actions={props.safetyActions} flags={props.flags} />
        {['IDLE', 'ENDED', 'FAILED'].includes(state.phase) && <Pressable accessibilityRole="button" accessibilityLabel="Done with voice call" accessibilityState={{ disabled: props.canDismiss === false }} disabled={props.canDismiss === false} onPress={props.onDone} style={styles.done}><Text style={styles.link}>{props.canDismiss === false ? 'Finishing call…' : 'Done'}</Text></Pressable>}
      </ScrollView>
    </SafeAreaView>
  </LinearGradient>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, content: { flexGrow: 1, padding: 28, alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 36 },
  brand: { color: colors.secondary, fontSize: 12, letterSpacing: 2.4, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  private: { color: colors.textMuted, fontSize: 13 }, identity: { flex: 1, minHeight: 310, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 16, width: '100%' },
  halo: { padding: 14, borderRadius: 100, borderWidth: 1, borderColor: colors.accent, backgroundColor: 'rgba(155,124,200,0.06)' },
  avatar: { width: 126, height: 126, borderRadius: 63 }, placeholder: { backgroundColor: colors.backgroundSubtle, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.secondary, fontSize: 48, fontFamily: 'Manrope_600SemiBold' },
  name: { color: colors.text, fontSize: 30, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  status: { color: colors.textMuted, fontSize: 16 }, duration: { color: colors.secondary, fontSize: 22, fontVariant: ['tabular-nums'] },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 330 },
  settings: { padding: 12, minHeight: 48 }, link: { color: colors.secondary, fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  done: { minHeight: 48, minWidth: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.backgroundSubtle },
});
