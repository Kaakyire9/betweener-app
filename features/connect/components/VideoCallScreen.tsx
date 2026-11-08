import React, { useId, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScopedScreenAwake } from '@/hooks/use-scoped-screen-awake';
import { terminalStates } from '../domain/connect';
import type { VideoFit, VideoPresentation } from '../video/video-types';
import type { PrivateVideoPresentation } from '../video/private-camera-preview';
import { VoiceCallControls } from './VoiceCallControls';
import { CallControlButton } from './CallControlButton';
import { VoiceSafetyPanel } from './VoiceSafetyPanel';
import { ConnectStatusScreen } from './ConnectStatusScreen';
import { VideoCallStage, VideoSurfaceBoundary } from './VideoCallStage';
import { VideoCallOptions } from './VideoCallOptions';
import { voiceDuration, type VoiceScreenProps } from './VoiceCallScreen';
import { voiceCompletionMessage } from '../voice/call-presentation';
import { CallPrivacyNotice } from './CallPrivacyNotice';
import { CallEncryptionStatus } from './CallEncryptionStatus';
import { connectionQuality } from '../media/connection-quality';
import { AudioCallCanvas } from './AudioCallCanvas';
import { AudioCallBrand } from './AudioCallIdentity';
import { AudioCallPortrait } from './AudioCallPortrait';
import { VideoIncomingControls } from './VideoIncomingControls';
import { useCallVisualActivity } from '../hooks/use-call-visual-activity';

export interface VideoScreenProps extends VoiceScreenProps {
  source: VideoPresentation | null; privatePreview?: PrivateVideoPresentation | null;
  onCamera(): void; onFlipCamera(): void; onVideoError(): void; onPreviewError?(): void;
  onAnswerCameraChange?(on: boolean): void;
}
const videoStatus = (phase: VoiceScreenProps['state']['phase'], incoming: boolean) => ({
  IDLE: 'Ready when you are', REQUESTED: 'Starting video invitation…', RINGING: incoming ? 'Incoming video call' : 'Calling…',
  CONNECTING: 'Connecting…', ACTIVE: 'Connected', RECONNECTING: 'Reconnecting…', ENDING: 'Ending call…', ENDED: 'Video call ended', FAILED: 'Call could not connect',
})[phase];

export function VideoCallScreen(props: VideoScreenProps) {
  const { state } = props, screenId = useId();
  const [optionsOpen, setOptionsOpen] = useState(false), [fit, setFit] = useState<VideoFit>('cover');
  const activity = useCallVisualActivity(state.foreground, props.visible !== false && !state.minimized);
  useScopedScreenAwake({
    enabled: props.flags?.videoCalling === true && state.session?.media === 'video' && state.foreground
      && props.visible !== false && !terminalStates.includes(state.session.state) && state.session.state !== 'ENDING'
      && ['REQUESTED', 'RINGING', 'CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(state.phase),
    reason: 'video_call', instanceId: `connect-video-${screenId}`,
  });
  if (props.flags?.videoCalling !== true) return <ConnectStatusScreen title="Video calling is not available yet" message="Your camera stays off." onClose={props.onDone} />;
  const active = state.phase === 'ACTIVE', video = state.video;
  const incoming = state.incoming && state.phase === 'RINGING';
  const conversation = ['CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(state.phase);
  const terminal = ['IDLE', 'ENDED', 'FAILED'].includes(state.phase);
  const finishing = terminal || state.phase === 'ENDING';
  const surface = active && state.foreground && props.visible !== false;
  const privateSurface = !state.incoming && ['REQUESTED', 'RINGING'].includes(state.phase) && activity.screenActive && !!props.privatePreview;
  const cameraBusy = video?.camera === 'starting' || video?.camera === 'stopping';
  const enabled = video?.camera === 'on' || video?.camera === 'starting';
  const status = videoStatus(state.phase, state.incoming), completion = voiceCompletionMessage(state);
  const binding = JSON.stringify([state.session?.id, state.session?.created_at, state.peer?.profileId]);
  const showDuration = ['ACTIVE', 'RECONNECTING', 'ENDED', 'FAILED'].includes(state.phase) && state.durationSeconds !== null;
  const duration = showDuration ? voiceDuration(state.durationSeconds!) : null;
  const notices = <>
    {active && ['poor', 'fair'].includes(connectionQuality(state.audioHealth)) && <Pressable accessibilityRole="button" accessibilityLabel="Turn camera off for a weak connection"
      disabled={video?.camera !== 'on'} onPress={props.onCamera} style={styles.notice}><Text style={styles.caption}>Connection is weak. Turn your camera off to help keep audio clear.</Text></Pressable>}
    {(!!video?.error || !!state.error || cameraBusy) && <View style={styles.notice}>
      {!!video?.error && <Text accessibilityRole="alert" style={styles.error}>{video.error}</Text>}
      {!!state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
      {cameraBusy && <Text accessibilityLiveRegion="polite" style={styles.caption}>{video.camera === 'stopping' ? 'Stopping camera. You can end the call while this finishes.' : 'Preparing camera. You can cancel or end the call.'}</Text>}
    </View>}
    {state.phase === 'RECONNECTING' && <Text style={styles.caption}>Checking the connection. Your camera-off choice is preserved.</Text>}
    {video?.permission === 'blocked' && <Pressable accessibilityRole="button" accessibilityLabel="Open camera settings" style={styles.linkButton} onPress={props.onOpenSettings}><Text style={styles.link}>Open camera settings</Text></Pressable>}
    {state.permission === 'blocked' && <Pressable accessibilityRole="button" accessibilityLabel="Open microphone settings" style={styles.linkButton} onPress={props.onOpenSettings}><Text style={styles.link}>Open microphone settings</Text></Pressable>}
  </>;
  return <AudioCallCanvas><SafeAreaView testID="connect-video-screen" style={styles.fill}>
    {conversation ? <View style={styles.compactHeading}>
      <Text style={styles.brand}>BETWEENER CONNECT</Text>
      <Text accessibilityRole="header" numberOfLines={2} style={styles.liveName}>{state.peer?.name || 'Your connection'}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.caption}>{status}{duration ? ` · ${duration}` : ''}</Text>
      <CallEncryptionStatus encryption={state.encryption} />
    </View> : null}
    <View style={styles.main}>
      {surface ? <>
        <View style={styles.liveNotices}>{notices}</View>
        <LinearGradient colors={['#67D5CE', '#256A75', '#B198D4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.frame}>
          <View style={styles.videoMask}><VideoSurfaceBoundary key={binding} onFailure={props.onVideoError}>
            <VideoCallStage source={props.source} localCameraOn={video?.camera === 'on'} fit={fit} peer={state.peer}
              topInset={12} bottomInset={12} canFlip={state.foreground && video?.camera === 'on'} onFlip={props.onFlipCamera} />
          </VideoSurfaceBoundary></View>
        </LinearGradient>
      </> : <ScrollView style={styles.fill} contentContainerStyle={styles.waiting}>
        {!conversation && <>
          <AudioCallBrand />
          <Text accessibilityRole="header" numberOfLines={2} style={styles.name}>{state.peer?.name || 'Your connection'}</Text>
          <View style={styles.statusPill}><Ionicons accessible={false} name="videocam-outline" color="#D4EAE0" size={17} /><Text accessibilityLiveRegion="polite" style={styles.caption}>{status}</Text></View>
          {duration && <Text accessibilityLabel={`Connected duration ${duration}`} style={styles.duration}>{duration}</Text>}
        </>}
        {privateSurface ? <View style={styles.privateFrame}>
          <VideoSurfaceBoundary key={`preview:${binding}`} onFailure={props.onPreviewError ?? props.onVideoError}>
            {props.privatePreview!.render()}
          </VideoSurfaceBoundary>
          <View style={styles.privateLabel}><Text style={styles.privateText}>Only you can see this preview</Text></View>
        </View> : <AudioCallPortrait key={`portrait:${binding}`} peer={state.peer} phase={state.phase === 'ACTIVE' ? 'IDLE' : state.phase} {...activity} />}
        {video?.preview === 'starting' && !finishing && <Text accessibilityLiveRegion="polite" style={styles.caption}>Preparing your private preview…</Text>}
        {!finishing && !incoming && !privateSurface && !conversation && <Text style={styles.caption}>{video?.cameraWanted ? 'Your camera will start when the call connects.' : 'Your camera is off.'}</Text>}
        {completion && <Text style={styles.caption}>{completion}</Text>}
        {state.phase === 'RINGING' && <CallPrivacyNotice required={state.session?.encryption_required} />}
        {notices}
        {finishing && <VoiceSafetyPanel key={`safety:${binding}`} state={state} actions={props.safetyActions} flags={props.flags} />}
      </ScrollView>}
    </View>
    <View style={styles.dock}>
      {active && <Text accessibilityLiveRegion="polite" style={styles.micStatus}>{state.muted ? 'Your microphone is off' : video?.camera === 'on' ? '' : 'Camera off · You’re connected by audio'}</Text>}
      <View style={styles.tray}>
        {incoming ? <VideoIncomingControls cameraOn={video?.cameraWanted === true} busy={state.busy || !state.foreground}
          onCameraChange={props.onAnswerCameraChange} onAnswer={props.onAccept} onDecline={props.onDecline} /> : <VoiceCallControls key={binding} {...props} compact={conversation}
          leadingControls={!finishing && <>
            {conversation && <CallControlButton compact label="Call options" icon="ellipsis-horizontal" onPress={() => setOptionsOpen(true)} />}
            <CallControlButton compact={conversation} lounge={!conversation} label={conversation ? enabled ? 'Turn camera off' : 'Turn camera on' : video?.cameraWanted ? 'Turn camera off' : 'Turn camera on'}
              displayLabel="Camera" icon={(conversation ? enabled : video?.cameraWanted) ? 'videocam' : 'videocam-off-outline'} selected={conversation ? enabled : video?.cameraWanted === true}
              disabled={!state.foreground || state.busy || video?.camera === 'stopping' || video?.renderFailed === true || (conversation && !active)} onPress={props.onCamera} />
          </>} />}
        {terminal && <Pressable accessibilityRole="button" accessibilityLabel="Done with video call" accessibilityState={{ disabled: props.canDismiss === false }}
          disabled={props.canDismiss === false} style={[styles.done, props.canDismiss === false && styles.disabled]} onPress={props.onDone}>
          <Text style={styles.doneLabel}>{props.canDismiss === false ? 'Finishing call…' : 'Done'}</Text>
        </Pressable>}
        {!conversation && !finishing && <Pressable accessibilityRole="button" accessibilityLabel="Call options" onPress={() => setOptionsOpen(true)} style={styles.linkButton}><Text style={styles.link}>Call options</Text></Pressable>}
      </View>
    </View>
    {!finishing && <VideoCallOptions {...props} visible={optionsOpen && props.visible !== false} onClose={() => setOptionsOpen(false)} fit={fit} onFit={() => setFit(value => value === 'cover' ? 'contain' : 'cover')} />}
  </SafeAreaView></AudioCallCanvas>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, main: { flex: 1, minHeight: 0 }, compactHeading: { alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 10, paddingHorizontal: 24 },
  brand: { color: '#B0CFC9', fontSize: 9, letterSpacing: 2.5, fontFamily: 'Manrope_600SemiBold' }, liveName: { color: '#F7F0E4', fontSize: 23, textAlign: 'center', fontFamily: 'Manrope_600SemiBold' },
  waiting: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-evenly', gap: 14, width: '100%', maxWidth: 540, alignSelf: 'center' },
  name: { color: '#F7F0E4', fontSize: 43, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }, statusPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(169,225,214,0.16)', backgroundColor: 'rgba(173,215,201,0.07)' },
  duration: { color: '#CDB9E4', fontSize: 20, fontVariant: ['tabular-nums'] }, caption: { color: '#D4E4DD', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  frame: { flex: 1, minHeight: 0, marginHorizontal: 14, borderRadius: 30, padding: 1.5 }, videoMask: { flex: 1, borderRadius: 28, overflow: 'hidden' },
  liveNotices: { paddingHorizontal: 16, gap: 4 }, notice: { borderRadius: 16, padding: 10, backgroundColor: 'rgba(9,32,34,0.95)', gap: 6, maxWidth: 430 },
  error: { color: '#FFB9C0', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  privateFrame: { width: '100%', height: 300, maxHeight: 420, borderRadius: 28, borderWidth: 1, borderColor: '#75BDBB', overflow: 'hidden', backgroundColor: '#10282B' },
  privateLabel: { position: 'absolute', bottom: 10, left: 10, right: 10, borderRadius: 16, padding: 8, backgroundColor: 'rgba(0,20,24,0.78)' }, privateText: { color: '#E0EBE3', fontSize: 12, textAlign: 'center' },
  dock: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, width: '100%', maxWidth: 540, alignSelf: 'center' },
  tray: { padding: 10, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(130,217,212,0.30)', backgroundColor: 'rgba(24,60,64,0.86)', gap: 4 },
  micStatus: { color: '#D9EAE2', fontSize: 12, textAlign: 'center', minHeight: 16, marginBottom: 5 },
  done: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: '#008B8B' }, doneLabel: { color: '#E4F3EB', fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, link: { color: '#A3DED3', fontSize: 12 }, disabled: { opacity: 0.4 },
});
