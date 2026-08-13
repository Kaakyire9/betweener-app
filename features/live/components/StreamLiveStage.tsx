import {
  hasAudio,
  hasVideo,
  type Call,
  type StreamVideoClient,
  type StreamVideoParticipant,
} from '@stream-io/video-client';
import { StreamCall, StreamVideo, useCallStateHooks } from '@stream-io/video-react-native-sdk';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { LiveParticipant } from '../application/live-models.ts';
import type { StreamLiveMediaBindings } from '../media/stream-live-media-provider.ts';
import {
  composeLiveStageSeats,
  countConnectedLiveParticipants,
  liveStageTilePlacement,
  type LiveStageTilePlacement,
} from '../stage/live-stage-layout.ts';
import { LiveStageParticipantTile } from './LiveStageParticipantTile.tsx';

type StreamLiveStageProps = {
  bindings: StreamLiveMediaBindings;
  stageParticipants: readonly LiveParticipant[];
  localPublisherUserId: string | null;
  onConnectedParticipantCountChange?: (count: number) => void;
};

const PLACEMENT_STYLES: Record<LiveStageTilePlacement, ViewStyle> = {
  single: { left: 0, top: 0, width: '100%', height: '100%' },
  'dual-left': { left: 0, top: 0, width: '50%', height: '100%' },
  'dual-right': { right: 0, top: 0, width: '50%', height: '100%' },
  'trio-lead': { left: 0, top: 0, width: '100%', height: '56%' },
  'trio-bottom-left': { left: 0, bottom: 0, width: '50%', height: '44%' },
  'trio-bottom-right': { right: 0, bottom: 0, width: '50%', height: '44%' },
  'quad-top-left': { left: 0, top: 0, width: '50%', height: '50%' },
  'quad-top-right': { right: 0, top: 0, width: '50%', height: '50%' },
  'quad-bottom-left': { left: 0, bottom: 0, width: '50%', height: '50%' },
  'quad-bottom-right': { right: 0, bottom: 0, width: '50%', height: '50%' },
};

const StageGrid = memo(function StageGrid({
  stageParticipants,
  localPublisherUserId,
  onConnectedParticipantCountChange,
}: Pick<StreamLiveStageProps, 'stageParticipants' | 'localPublisherUserId' | 'onConnectedParticipantCountChange'>) {
  const { useParticipants } = useCallStateHooks();
  const rtcParticipants = useParticipants();
  const candidates = useMemo(() => (
    rtcParticipants.map((participant: StreamVideoParticipant) => ({
      participant,
      userId: participant.userId,
      sessionId: participant.sessionId,
      isLocalParticipant: participant.isLocalParticipant === true,
      isSpeaking: participant.isSpeaking,
      hasVideo: hasVideo(participant),
      hasAudio: hasAudio(participant),
    }))
  ), [rtcParticipants]);
  const connectedParticipantCount = useMemo(
    () => countConnectedLiveParticipants(candidates),
    [candidates],
  );
  const participants = useMemo(() => {
    return composeLiveStageSeats(
      candidates,
      stageParticipants,
      localPublisherUserId,
    );
  }, [candidates, localPublisherUserId, stageParticipants]);

  useEffect(() => {
    onConnectedParticipantCountChange?.(connectedParticipantCount);
  }, [connectedParticipantCount, onConnectedParticipantCountChange]);
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
    <View style={styles.grid}>
      {participants.map(({ candidate, identity, userId }, index) => {
        const placement = liveStageTilePlacement(participants.length, index);
        return (
          <View
            key={userId}
            style={[styles.tile, PLACEMENT_STYLES[placement]]}
          >
            <LiveStageParticipantTile
              participant={candidate?.participant ?? null}
              identity={identity}
              fit={participants.length === 1 ? 'cover' : 'contain'}
            />
          </View>
        );
      })}
    </View>
  );
});

export const StreamLiveStage = memo(function StreamLiveStage({
  bindings,
  stageParticipants,
  localPublisherUserId,
  onConnectedParticipantCountChange,
}: StreamLiveStageProps) {
  const client = bindings.client as unknown as StreamVideoClient;
  const call = bindings.call as unknown as Call;
  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StageGrid
          stageParticipants={stageParticipants}
          localPublisherUserId={localPublisherUserId}
          onConnectedParticipantCountChange={onConnectedParticipantCountChange}
        />
      </StreamCall>
    </StreamVideo>
  );
});

const styles = StyleSheet.create({
  grid: { flex: 1, backgroundColor: '#091413' },
  tile: {
    position: 'absolute',
    padding: 1,
    overflow: 'hidden',
    backgroundColor: '#12211F',
  },
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
