import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import type { VideoPresentation } from '../video/video-types';
import { VoiceCallControls } from './VoiceCallControls';
import { VoiceSafetyPanel } from './VoiceSafetyPanel';
import { AudioConnectionStatus } from './AudioConnectionStatus';
import { ConnectStatusScreen } from './ConnectStatusScreen';
import { VideoCallStage, VideoSurfaceBoundary } from './VideoCallStage';
import { voiceDuration, type VoiceScreenProps } from './VoiceCallScreen';
import { voiceCompletionMessage } from '../voice/call-presentation';

export interface VideoScreenProps extends VoiceScreenProps {
  source: VideoPresentation | null; onCamera(): void; onFlipCamera(): void; onVideoError(): void;
}
export function VideoCallScreen(props: VideoScreenProps) {
  const { state } = props;
  if (props.flags?.videoCalling !== true) return <ConnectStatusScreen title="Video calling is not available yet" message="Your camera stays off." onClose={props.onDone} />;
  const active = state.phase === 'ACTIVE', video = state.video;
  const cameraBusy = video?.camera === 'starting' || video?.camera === 'stopping';
  const enabled = video?.camera === 'on' || video?.camera === 'starting';
  const label = enabled ? 'Turn camera off' : 'Turn camera on';
  const status = { IDLE: 'Ready when you are', REQUESTED: 'Starting video invitation…', RINGING: state.incoming ? 'Incoming video call' : 'Calling…',
    CONNECTING: 'Connecting audio first…', ACTIVE: 'Connected', RECONNECTING: 'Checking your connection…', ENDING: 'Ending call…', ENDED: 'Call ended', FAILED: 'Call could not connect' }[state.phase];
  const completion = voiceCompletionMessage(state);
  return <LinearGradient colors={[Colors.dark.background, '#102B2D', '#1E2034']} style={styles.fill}><SafeAreaView style={styles.fill}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>BETWEENER CONNECT · VIDEO</Text>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.name}>{state.peer?.name || 'Your connection'}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.caption}>{status}</Text>
        {active && state.durationSeconds !== null && <Text style={styles.duration}>{voiceDuration(state.durationSeconds)}</Text>}
      </View>
      {active && state.foreground ? <VideoSurfaceBoundary key={state.session?.id} onFailure={props.onVideoError}>
        <VideoCallStage source={props.source} localCameraOn={video?.camera === 'on'} />
      </VideoSurfaceBoundary> : <View style={styles.waiting}><Ionicons name="videocam-off-outline" color={Colors.dark.secondary} size={44} />
        <Text style={styles.caption}>{state.incoming && state.phase === 'RINGING' ? 'Answer with your camera off. Turn it on when you’re ready.' : 'Your camera stays off until you turn it on.'}</Text></View>}
      {active && <AudioConnectionStatus health={state.audioHealth} />}
      {!!video?.error && <Text accessibilityRole="alert" style={styles.error}>{video.error}</Text>}
      {video?.permission === 'blocked' && <Pressable accessibilityRole="button" accessibilityLabel="Open camera settings" style={styles.done} onPress={props.onOpenSettings}><Text style={styles.link}>Open camera settings</Text></Pressable>}
      {!!state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
      {cameraBusy && <Text accessibilityLiveRegion="polite" style={styles.caption}>{video.camera === 'stopping' ? 'Stopping camera. You can end the call while this finishes.' : 'Preparing camera. You can cancel or end the call.'}</Text>}
      {active && <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !state.foreground || video?.camera === 'stopping' || video?.renderFailed === true, selected: enabled }}
          disabled={!state.foreground || video?.camera === 'stopping' || video?.renderFailed === true} onPress={props.onCamera} style={[styles.control, enabled && styles.selected]}>
          <Ionicons name={enabled ? 'videocam' : 'videocam-off-outline'} color={Colors.dark.text} size={24} /><Text style={styles.controlLabel}>{enabled ? 'Camera on' : 'Camera off'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" accessibilityState={{ disabled: !state.foreground || video?.camera !== 'on' }}
          disabled={!state.foreground || video?.camera !== 'on'} onPress={props.onFlipCamera} style={[styles.control, video?.camera !== 'on' && styles.disabled]}>
          <Ionicons name="camera-reverse-outline" color={Colors.dark.text} size={24} /><Text style={styles.controlLabel}>Switch</Text>
        </Pressable>
      </View>}
      <VoiceCallControls {...props} />
      {state.phase === 'RECONNECTING' && <Text style={styles.caption}>Media may be interrupted. Camera access never restarts from a navigation event.</Text>}
      {completion && <Text style={styles.caption}>{completion}</Text>}
      {state.permission === 'blocked' && <Pressable accessibilityRole="button" accessibilityLabel="Open microphone settings" style={styles.done} onPress={props.onOpenSettings}><Text style={styles.link}>Open settings</Text></Pressable>}
      <VoiceSafetyPanel state={state} actions={props.safetyActions} flags={props.flags} />
      {['IDLE', 'ENDED', 'FAILED'].includes(state.phase) && <Pressable accessibilityRole="button" accessibilityLabel="Done with video call" disabled={props.canDismiss === false}
        accessibilityState={{ disabled: props.canDismiss === false }} style={styles.done} onPress={props.onDone}><Text style={styles.link}>{props.canDismiss === false ? 'Finishing call…' : 'Done'}</Text></Pressable>}
    </ScrollView>
  </SafeAreaView></LinearGradient>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, content: { flexGrow: 1, padding: 20, gap: 16, alignItems: 'center' },
  brand: { color: Colors.dark.secondary, letterSpacing: 2, fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  heading: { alignItems: 'center', gap: 8 }, name: { fontFamily: 'Manrope_600SemiBold', fontSize: 27, color: Colors.dark.text, textAlign: 'center' },
  caption: { color: Colors.dark.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' }, duration: { color: Colors.dark.secondary, fontSize: 18, fontVariant: ['tabular-nums'] },
  waiting: { flex: 1, minHeight: 220, justifyContent: 'center', alignItems: 'center', gap: 20, maxWidth: 340 },
  row: { flexDirection: 'row', gap: 16 }, control: { minWidth: 100, minHeight: 74, padding: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSubtle, borderWidth: 1, borderColor: Colors.dark.outline, gap: 6 },
  controlLabel: { color: Colors.dark.text, fontSize: 12 }, selected: { borderColor: Colors.dark.secondary, backgroundColor: Colors.dark.tint }, disabled: { opacity: 0.4 },
  error: { color: Colors.dark.danger, fontSize: 14, lineHeight: 21, textAlign: 'center' }, done: { padding: 14, minHeight: 48 }, link: { color: Colors.dark.secondary } });
