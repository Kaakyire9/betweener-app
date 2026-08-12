import type { Call, StreamVideoClient } from '@stream-io/video-client';
import type { MediaStream } from '@stream-io/react-native-webrtc';
import { RTCView } from '@stream-io/react-native-webrtc';
import {
  StreamCall,
  StreamVideo,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StreamLiveMediaBindings } from '../media/stream-live-media-provider.ts';

type StreamLiveBackstagePreviewProps = {
  bindings: StreamLiveMediaBindings;
};

const LocalPreview = memo(function LocalPreview() {
  const { useCameraState } = useCallStateHooks();
  const { isMute, mediaStream } = useCameraState();
  const stream = mediaStream as unknown as MediaStream | undefined;

  return (
    <View style={styles.canvas}>
      {!isMute && stream ? (
        <RTCView
          mirror
          objectFit="cover"
          streamURL={stream.toURL()}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.cameraOff} />
      )}
      <View pointerEvents="none" style={styles.vignette} />
    </View>
  );
});

/** Device-local preview. This component never joins the public RTC call. */
export const StreamLiveBackstagePreview = memo(function StreamLiveBackstagePreview({
  bindings,
}: StreamLiveBackstagePreviewProps) {
  return (
    <StreamVideo client={bindings.client as unknown as StreamVideoClient}>
      <StreamCall call={bindings.call as unknown as Call}>
        <LocalPreview />
      </StreamCall>
    </StreamVideo>
  );
});

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#071210' },
  cameraOff: { flex: 1, backgroundColor: '#10201D' },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#03100D20',
    borderWidth: 1,
    borderColor: '#D7B56D18',
  },
});
