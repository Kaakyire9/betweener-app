import type { Call, StreamVideoClient, StreamVideoParticipant } from '@stream-io/video-client';
import {
  ParticipantView,
  StreamCall,
  StreamVideo,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StreamLiveMediaBindings } from '../media/stream-live-media-provider.ts';

type StreamLiveStageProps = {
  bindings: StreamLiveMediaBindings;
};

const StageGrid = memo(function StageGrid() {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants().slice(0, 4);

  if (!participants.length) {
    return (
      <View style={styles.emptyStage}>
        <View style={styles.orbit} />
        <Text style={styles.emptyEyebrow}>STAGE IS READY</Text>
        <Text style={styles.emptyTitle}>A thoughtful room is about to begin.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.grid, participants.length === 1 && styles.singleGrid]}>
      {participants.map((participant: StreamVideoParticipant, index: number) => (
        <View
          key={participant.sessionId}
          style={[
            styles.tile,
            participants.length === 1 && styles.singleTile,
            participants.length === 3 && index === 0 && styles.leadTile,
          ]}
        >
          <ParticipantView
            participant={participant}
            objectFit="cover"
            style={styles.participant}
          />
        </View>
      ))}
    </View>
  );
});

export const StreamLiveStage = memo(function StreamLiveStage({ bindings }: StreamLiveStageProps) {
  const client = bindings.client as unknown as StreamVideoClient;
  const call = bindings.call as unknown as Call;
  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StageGrid />
      </StreamCall>
    </StreamVideo>
  );
});

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    backgroundColor: '#091413',
  },
  singleGrid: { flexWrap: 'nowrap' },
  tile: {
    width: '49.7%',
    minHeight: '49.7%',
    overflow: 'hidden',
    backgroundColor: '#152423',
  },
  singleTile: { width: '100%', height: '100%' },
  leadTile: { width: '100%', minHeight: '55%' },
  participant: { flex: 1 },
  emptyStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    backgroundColor: '#091413',
  },
  orbit: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: '#D7B56D88',
    backgroundColor: '#0D6D6826',
    marginBottom: 24,
  },
  emptyEyebrow: {
    color: '#D7B56D',
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: 'Manrope_700Bold',
  },
  emptyTitle: {
    color: '#F7F0E6',
    fontSize: 24,
    lineHeight: 31,
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold',
    marginTop: 10,
  },
});

