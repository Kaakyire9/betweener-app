import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import type { VoiceViewState, VoiceRoute } from '../voice/voice-types';
import { VoiceCallControls } from './VoiceCallControls';
import { VoiceSafetyPanel, type VoiceSafetyActions } from './VoiceSafetyPanel';
import type { ConnectFeatureFlags } from '../config/connect-feature-flags';
import { voiceCompletionMessage } from '../voice/call-presentation';
import { AudioConnectionStatus } from './AudioConnectionStatus';
import { ConversationPrompts } from './ConversationPrompts';
import { CallContinuityControls } from './CallContinuityControls';
import { CallPrivacyNotice } from './CallPrivacyNotice';
import { CallEncryptionStatus } from './CallEncryptionStatus';
import { AudioCallCanvas } from './AudioCallCanvas';
import { AudioCallBrand, AudioCallIdentity, audioCallStatus } from './AudioCallIdentity';
import { AudioCallPortrait } from './AudioCallPortrait';
import { useCallVisualActivity } from '../hooks/use-call-visual-activity';

export interface VoiceScreenProps {
  onBackgroundAudio?(): void; onMinimize?(): void;
  onDataSavingVideo?(): void;
  visible?: boolean;
  canDismiss?: boolean;
  safetyActions?: VoiceSafetyActions; flags?: ConnectFeatureFlags;
  state: VoiceViewState; onAccept(): void; onDecline(): void; onHangup(): void; onMute(): void;
  onRoute(route: VoiceRoute): void; onDone(): void; onOpenSettings(): void;
}
export function voiceDuration(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60); return `${minutes.toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}
export function VoiceCallScreen(props: VoiceScreenProps) {
  const { state } = props;
  const activity = useCallVisualActivity(state.foreground, props.visible !== false && !state.minimized);
  const showDuration = ['ACTIVE', 'RECONNECTING', 'ENDED'].includes(state.phase) && state.durationSeconds !== null;
  const completion = voiceCompletionMessage(state);
  const terminal = ['IDLE', 'ENDED', 'FAILED'].includes(state.phase);
  const portraitBinding = JSON.stringify([state.session?.id, state.session?.created_at, state.peer?.profileId]);
  return <AudioCallCanvas>
    <SafeAreaView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content}>
        <AudioCallBrand />
        <AudioCallIdentity name={state.peer?.name || 'Your connection'} status={audioCallStatus(state)}
          duration={showDuration ? voiceDuration(state.durationSeconds!) : undefined} />
        {!terminal && state.phase !== 'ENDING' && <CallEncryptionStatus encryption={state.encryption} />}
        <AudioCallPortrait key={`portrait:${portraitBinding}`} peer={state.peer} phase={state.phase} {...activity} />
        <View style={styles.messages}>
          {state.phase === 'ACTIVE' && <AudioConnectionStatus health={state.audioHealth} />}
          {state.phase === 'RECONNECTING' && <Text style={styles.hint}>Checking the connection. Audio may be interrupted.</Text>}
          {state.interruption && <Text style={styles.hint}>{state.interruption === 'background'
            ? 'This foreground test ended when the app left the screen. Open a new call to continue.'
            : state.interruption === 'connection_failed' ? 'The call was interrupted. This call will not restart automatically.'
              : 'Audio was interrupted. This call will not restart automatically.'}</Text>}
          {state.authorityStatus === 'unavailable' && <Text accessibilityRole="alert" style={styles.error}>Calling permission cannot currently be confirmed.</Text>}
          {completion && <Text style={styles.hint}>{completion}</Text>}
          {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
          {state.permission === 'blocked' && <Pressable accessibilityRole="button" accessibilityLabel="Open microphone settings" onPress={props.onOpenSettings} style={styles.settings}><Text style={styles.link}>Open settings</Text></Pressable>}
        </View>
        {state.phase === 'RINGING' && <CallPrivacyNotice required={state.session?.encryption_required} />}
        {state.phase === 'ACTIVE' && <ConversationPrompts />}
        <VoiceSafetyPanel key={`safety:${portraitBinding}`} state={state} actions={props.safetyActions} flags={props.flags} />
      </ScrollView>
      <View style={styles.dock}>
        <View style={styles.tray}>
          <VoiceCallControls key={`controls:${portraitBinding}`} {...props} />
          {terminal && <Pressable accessibilityRole="button" accessibilityLabel="Done with voice call" accessibilityState={{ disabled: props.canDismiss === false }}
            disabled={props.canDismiss === false} onPress={props.onDone} style={[styles.done, props.canDismiss === false && styles.disabled]}>
            <Text style={styles.link}>{props.canDismiss === false ? 'Finishing call…' : 'Done'}</Text>
          </Pressable>}
          <CallContinuityControls {...props} />
        </View>
      </View>
    </SafeAreaView>
  </AudioCallCanvas>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, content: { flexGrow: 1, width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 12,
    paddingBottom: 18, alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  dock: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 16, paddingTop: 8 },
  messages: { alignItems: 'center', gap: 9, width: '100%' }, hint: { color: '#B9CFC8', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 360 },
  error: { color: '#FFB7BD', fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 360 },
  tray: { width: '100%', padding: 18, gap: 8, borderRadius: 34, borderWidth: 1, borderColor: 'rgba(130,217,212,0.30)',
    backgroundColor: 'rgba(24,60,64,0.72)', shadowColor: '#0EC8BF', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 14 },
  settings: { padding: 12, minHeight: 48 }, link: { color: '#D1EEE4', fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  done: { minHeight: 58, minWidth: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: Colors.dark.tint, borderWidth: 1, borderColor: '#65CBC6' },
  disabled: { opacity: 0.45 },
});
