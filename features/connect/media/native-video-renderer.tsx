import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { RTCView, type MediaStream } from '@stream-io/react-native-webrtc';
import { DebounceType, VisibilityState, hasVideo, useCall, type ParticipantViewProps } from '@stream-io/video-react-native-sdk';

type Props = React.ComponentProps<NonNullable<ParticipantViewProps['VideoRenderer']>> & { current(): boolean };
/** Call-owned native surface, without SDK screenshot, push, auto-resume or PiP providers. */
export function NativeVideoRenderer({ participant, trackType = 'videoTrack', objectFit = 'contain', mirror, videoZOrder = 0, isVisible = true, current }: Props) {
  const call = useCall();
  const [dimension, setDimension] = useState<{ width: number; height: number }>();
  const { sessionId, isLocalParticipant } = participant;
  const visible = current() && isVisible && call?.state.callingState === 'joined' && trackType === 'videoTrack' && hasVideo(participant);
  useEffect(() => {
    if (!current() || !call || isLocalParticipant || !visible || !dimension) return;
    call.state.updateParticipant(sessionId, current => ({ ...current,
      viewportVisibilityState: { ...current.viewportVisibilityState, videoTrack: VisibilityState.VISIBLE } }));
    call.state.updateParticipantTracks('videoTrack', { [sessionId]: { dimension } });
    call.trackSubscriptionManager.apply(DebounceType.IMMEDIATE);
    return () => {
      call.state.updateParticipant(sessionId, current => ({ ...current,
        viewportVisibilityState: { ...current.viewportVisibilityState, videoTrack: VisibilityState.INVISIBLE } }));
      call.state.updateParticipantTracks('videoTrack', { [sessionId]: { dimension: undefined } });
      if (current() && call.state.callingState === 'joined') call.trackSubscriptionManager.apply(DebounceType.IMMEDIATE);
    };
  }, [call, current, dimension, isLocalParticipant, sessionId, visible]);
  const stream = participant.videoStream as unknown as MediaStream | undefined;
  return <View testID="connect-native-video-surface" style={styles.fill} onLayout={event => {
    if (!current()) return;
    const width = Math.round(event.nativeEvent.layout.width), height = Math.round(event.nativeEvent.layout.height);
    if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) {
      setDimension(current => current?.width === width && current.height === height ? current : { width, height });
    }
  }}>
    {visible && stream && stream.getVideoTracks().some(track => track.readyState === 'live')
      ? <RTCView style={styles.fill} streamURL={stream.toURL()} objectFit={objectFit} mirror={mirror} zOrder={videoZOrder} /> : null}
  </View>;
}
const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' } });
