import React, { useEffect, useReducer } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import type { VideoPresentation } from '../video/video-types';

function CameraOff({ local, pending = false }: { local: boolean; pending?: boolean }) {
  return <View style={styles.placeholder}><Ionicons name="videocam-off-outline" size={local ? 24 : 44} color={Colors.dark.secondary} />
    <Text style={styles.hint}>{local ? pending ? 'Preparing your preview…' : 'You · camera off' : 'Waiting for their camera'}</Text></View>;
}
/** Surfaces render only the exact authenticated owner's participants. SDK handles track subscription. */
export function VideoCallStage({ source, localCameraOn }: { source: VideoPresentation | null; localCameraOn: boolean }) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => source?.subscribe(refresh), [source]);
  const participants = source?.participants() ?? [];
  const remote = participants.find(p => !p.local), local = participants.find(p => p.local);
  return <View style={styles.stage}>
    <View accessibilityLabel="Other participant video" style={styles.remote}>
      {remote?.cameraOn && source ? source.render(remote.sessionId, false) : <CameraOff local={false} />}
    </View>
    <View accessibilityLabel={localCameraOn ? 'Your camera preview' : 'Your camera is off'} style={styles.local}>
      {localCameraOn && local?.cameraOn && source ? source.render(local.sessionId, true) : <CameraOff local pending={localCameraOn} />}
    </View>
  </View>;
}
export class VideoSurfaceBoundary extends React.Component<React.PropsWithChildren<{ onFailure(): void }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <View style={styles.stage}><Text style={styles.hint}>Video view unavailable. Use the audio controls below.</Text></View> : this.props.children; }
}
const styles = StyleSheet.create({ stage: { flex: 1, minHeight: 270, width: '100%', borderRadius: 28, backgroundColor: '#091B1C',
  overflow: 'hidden', borderWidth: 1, borderColor: Colors.dark.outline }, remote: { flex: 1, minHeight: 270 },
  local: { position: 'absolute', right: 14, bottom: 14, width: 104, height: 145, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.dark.secondary, backgroundColor: Colors.dark.backgroundSubtle },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12 },
  hint: { color: Colors.dark.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', padding: 8 } });
