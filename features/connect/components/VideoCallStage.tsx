import React, { useEffect, useReducer, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors } from '@/constants/theme';
import type { VideoFit, VideoPresentation } from '../video/video-types';
import { FloatingVideoPreview } from './FloatingVideoPreview';
import type { VoicePeer } from '../voice/voice-types';
import { voicePeerPhotos } from '../voice/peer-gallery';

function CameraOff({ local, pending = false, peer }: { local: boolean; pending?: boolean; peer?: VoicePeer | null }) {
  const avatar = voicePeerPhotos(peer?.avatar, peer?.photos)[0];
  return <View style={styles.placeholder}><Ionicons name="videocam-off-outline" size={local ? 24 : 44} color={Colors.dark.secondary} />
    {!local && avatar && <Image accessible source={{ uri: avatar }} contentFit="cover" accessibilityLabel="Profile photo · camera off" style={styles.portrait} />}
    {!local && <Text style={styles.hint}>Camera off</Text>}
    <Text style={styles.hint}>{local ? pending ? 'Preparing your preview…' : 'You · camera off' : 'Waiting for their camera'}</Text></View>;
}
/** Surfaces render only the exact authenticated owner's participants. SDK handles track subscription. */
export function VideoCallStage({ source, localCameraOn, peer, fit = 'cover', topInset = 130, bottomInset = 144, canFlip = false, onFlip = () => {} }: {
  peer?: VoicePeer | null;
  source: VideoPresentation | null; localCameraOn: boolean; fit?: VideoFit; topInset?: number; bottomInset?: number; canFlip?: boolean; onFlip?(): void;
}) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => source?.subscribe(refresh), [source]);
  const participants = source?.participants() ?? [];
  const remote = participants.find(p => !p.local), local = participants.find(p => p.local);
  return <View testID="connect-video-canvas" style={styles.stage} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setSize(current => current.width === width && current.height === height ? current : { width, height });
  }}>
    <View accessibilityLabel="Other participant video" style={styles.remote}>
      {remote?.cameraOn && source ? source.render(remote.sessionId, false, { fit }) : <CameraOff local={false} peer={peer} />}
    </View>
    <FloatingVideoPreview {...size} topInset={topInset} bottomInset={bottomInset} canFlip={canFlip} onFlip={onFlip} cameraOn={localCameraOn}>
      {localCameraOn && local?.cameraOn && source ? source.render(local.sessionId, true, { fit: 'cover' }) : <CameraOff local pending={localCameraOn} />}
    </FloatingVideoPreview>
  </View>;
}
export class VideoSurfaceBoundary extends React.Component<React.PropsWithChildren<{ onFailure(): void }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <View style={styles.stage}><Text style={styles.hint}>Video view unavailable. Use the audio controls below.</Text></View> : this.props.children; }
}
const styles = StyleSheet.create({ stage: { flex: 1, width: '100%', height: '100%', backgroundColor: '#091B1C', overflow: 'hidden' }, remote: { flex: 1 },
  portrait: { width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: '#86BCBE' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12 },
  hint: { color: Colors.dark.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', padding: 8 } });
