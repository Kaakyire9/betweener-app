// Local visual fixture only. No controller, Auth, credentials or native calling SDK.
import React, { useState } from 'react';
import { AppRegistry, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VoiceCallScreen } from '../../features/connect/components/VoiceCallScreen';
import { VoiceCallLobby } from '../../features/connect/components/VoiceCallLobby';
import { unverifiedShutdown } from '../../features/connect/media/local-shutdown';
import type { VoicePhase, VoiceViewState } from '../../features/connect/voice/voice-types';
function Preview() {
  const params = new URLSearchParams(globalThis.location.search);
  const phase = (params.get('phase') || 'ACTIVE') as VoicePhase;
  const [muted, setMuted] = useState(false);
  const [route, setRoute] = useState<'speaker' | 'earpiece'>('earpiece');
  const peer = { profileId: 'visual-fixture', name: params.get('long') ? 'Alexandria Aduboffour' : 'Dufie',
    avatar: 'https://connect-preview.invalid/a.png', photos: ['https://connect-preview.invalid/b.png', 'https://connect-preview.invalid/c.png'] };
  const state: VoiceViewState = { phase, peer, session: {
    id: '00000000-0000-4000-8000-000000000001', caller_profile_id: 'visual-caller', recipient_profile_id: 'visual-fixture',
    media: 'voice', authorization: 'matched', state: phase === 'IDLE' ? 'REQUESTED' : phase, version: 1,
    created_at: '2026-11-04T00:00:00Z', accepted_at: null, connected_at: null, ended_at: null,
    deadline: null, reason: null, duration_seconds: null, encryption_required: true,
  }, incoming: params.get('incoming') === 'true', muted, route,
    routes: ['earpiece', 'speaker'], foreground: true, error: null, busy: false, permission: 'granted',
    durationSeconds: phase === 'ACTIVE' || phase === 'ENDED' ? 37 : null, localShutdown: unverifiedShutdown(), endBlock: null,
    encryption: ['RINGING', 'IDLE'].includes(phase) ? undefined : { required: true, sdkConfirmed: phase === 'ACTIVE', identityVerified: false } };
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: innerWidth, height: innerHeight }, insets: { top: 18, bottom: 12, left: 0, right: 0 } }}><View style={{ flex: 1 }}>
    {phase === 'IDLE' ? <VoiceCallLobby peer={peer} eligible pending={false} error={null} onStart={() => {}} onClose={() => {}} />
      : <VoiceCallScreen state={state} onAccept={() => {}} onDecline={() => {}} onHangup={() => {}} onMute={() => setMuted(value => !value)}
        onRoute={value => setRoute(value === 'speaker' ? 'speaker' : 'earpiece')} onDone={() => {}} onOpenSettings={() => {}} />}
  </View></SafeAreaProvider>;
}
if (__DEV__ && Platform.OS === 'web') {
  AppRegistry.registerComponent('ConnectVisualPreview', () => Preview);
  AppRegistry.runApplication('ConnectVisualPreview', { rootTag: document.getElementById('root') });
}
