import {
  hasAudio,
  hasVideo,
  type Call,
  type StreamVideoClient,
  type StreamVideoParticipant,
} from '@stream-io/video-client';
import { memo, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { LiveParticipant } from '../application/live-models.ts';
import type { OdoCopilotScene } from '../odo/copilot/odo-copilot-contracts.ts';
import type { StreamLiveMediaBindings } from '../media/stream-live-media-provider.ts';
import type { StreamVideoSdkModule } from '../media/load-stream-video-sdk.ts';
import { LIVE_VISUAL } from './live-visual-tokens.ts';
import {
  clearAndroidLivePictureInPictureActions,
  setAndroidLivePictureInPictureActions,
  subscribeToAndroidLivePictureInPictureActions,
} from '../media/live-picture-in-picture-actions.ts';
import {
  composeLiveStageSeats,
  applyLiveStageScene,
  countConnectedLiveParticipants,
  liveStageTilePlacement,
  selectLivePictureInPictureCandidate,
  type LiveStageTilePlacement,
} from '../stage/live-stage-layout.ts';
import { LiveStageParticipantTile } from './LiveStageParticipantTile.tsx';
import { LiveStageRequestTile, type LiveStageRequestSeat } from './LiveStageRequestTile.tsx';
import { PrivateSparkParticipantSurface } from './PrivateSparkParticipantSurface.tsx';

export type StreamLiveStageProps = {
  bindings: StreamLiveMediaBindings;
  sdk: StreamVideoSdkModule;
  stageParticipants: readonly LiveParticipant[];
  localPublisherUserId: string | null;
  onConnectedParticipantCountChange?: (count: number) => void;
  constrainMultiStage?: boolean;
  presentation?: 'public' | 'private_spark';
  tileFooterInset?: number;
  onPictureInPictureModeChange?: (active: boolean) => void;
  requestSeat?: LiveStageRequestSeat | null;
  scene?: OdoCopilotScene | null;
};

const LivePictureInPictureBridge = memo(function LivePictureInPictureBridge({
  sdk,
  canControlMedia,
  onModeChange,
}: {
  sdk: StreamVideoSdkModule;
  canControlMedia: boolean;
  onModeChange?: (active: boolean) => void;
}) {
  sdk.useAutoEnterPiPEffect(false);
  const isInPictureInPicture = sdk.useIsInPiPMode();
  const { useCameraState, useMicrophoneState } = sdk.useCallStateHooks();
  const { camera, optimisticIsMute: isCameraMuted } = useCameraState();
  const { microphone, optimisticIsMute: isMicrophoneMuted } = useMicrophoneState();

  useEffect(() => {
    onModeChange?.(isInPictureInPicture);
  }, [isInPictureInPicture, onModeChange]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    if (!isInPictureInPicture || !canControlMedia) {
      clearAndroidLivePictureInPictureActions();
      return undefined;
    }
    setAndroidLivePictureInPictureActions({
      cameraEnabled: !isCameraMuted,
      microphoneEnabled: !isMicrophoneMuted,
    });
    return () => clearAndroidLivePictureInPictureActions();
  }, [canControlMedia, isCameraMuted, isInPictureInPicture, isMicrophoneMuted]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !canControlMedia) return undefined;
    return subscribeToAndroidLivePictureInPictureActions((action) => {
      if (action === 'toggle_camera') {
        void camera.toggle();
        return;
      }
      if (action === 'toggle_microphone') void microphone.toggle();
    });
  }, [camera, canControlMedia, microphone]);

  if (Platform.OS !== 'ios') return null;
  const RTCViewPipIOS = sdk.RTCViewPipIOS;
  return (
    <RTCViewPipIOS
      includeLocalParticipantVideo
      onPiPChange={onModeChange}
    />
  );
});

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
  sdk,
  stageParticipants,
  localPublisherUserId,
  onConnectedParticipantCountChange,
  constrainMultiStage,
  presentation,
  tileFooterInset,
  isInPictureInPicture,
  requestSeat,
  scene,
}: Pick<StreamLiveStageProps, 'sdk' | 'stageParticipants' | 'localPublisherUserId' | 'onConnectedParticipantCountChange' | 'constrainMultiStage' | 'presentation' | 'tileFooterInset' | 'requestSeat' | 'scene'> & {
  isInPictureInPicture: boolean;
}) {
  const { useParticipants } = sdk.useCallStateHooks();
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
    const seats = composeLiveStageSeats(
      candidates,
      stageParticipants,
      localPublisherUserId,
    );
    return applyLiveStageScene(seats, scene ?? null);
  }, [candidates, localPublisherUserId, scene, stageParticipants]);
  const pictureInPictureCandidate = useMemo(
    () => selectLivePictureInPictureCandidate(
      participants.flatMap((seat) => seat.candidate ? [seat.candidate] : []),
    ),
    [participants],
  );
  // Odo scenes are presentation-only. They must never hide the audience's
  // manual seat-request path or interfere with Host stage admission.
  const visibleRequestSeat = presentation === 'public' && !isInPictureInPicture
    ? requestSeat ?? null
    : null;
  const visibleRequestSeats = visibleRequestSeat
    ? Math.max(1, Math.min(visibleRequestSeat.seatCount, 3))
    : 0;

  useEffect(() => {
    onConnectedParticipantCountChange?.(connectedParticipantCount);
  }, [connectedParticipantCount, onConnectedParticipantCountChange]);
  if (!participants.length && !visibleRequestSeat) {
    return (
      <View style={styles.emptyStage}>
        <View style={styles.orbit} />
        <Text style={styles.emptyEyebrow}>STAGE IS READY</Text>
        <Text style={styles.emptyTitle}>A thoughtful room is about to begin.</Text>
      </View>
    );
  }

  if (Platform.OS === 'android' && isInPictureInPicture) {
    const pictureInPictureSeat = participants.find(
      (seat) => seat.userId === pictureInPictureCandidate?.userId,
    ) ?? participants[0];
    return (
      <View style={styles.pictureInPictureStage}>
        <LiveStageParticipantTile
          participant={pictureInPictureSeat.candidate?.participant ?? null}
          identity={pictureInPictureSeat.identity}
          fit="cover"
          ParticipantViewComponent={sdk.ParticipantView}
        />
      </View>
    );
  }

  const visualTileCount = Math.min(4, participants.length + visibleRequestSeats);
  const isContainedMultiStage = visualTileCount > 1 && constrainMultiStage !== false;
  const stageGrid = (
    <View style={[styles.grid, presentation === 'private_spark' && styles.privateGrid]}>
      {participants.map(({ candidate, identity, userId }, index) => {
        const placement = liveStageTilePlacement(visualTileCount, index);
        const displayName = candidate?.isLocalParticipant
          ? 'You'
          : identity?.fullName?.trim() || candidate?.participant.name?.trim() || 'Your connection';
        const tile = (
          <LiveStageParticipantTile
            participant={candidate?.participant ?? null}
            identity={identity}
            fit="cover"
            ParticipantViewComponent={sdk.ParticipantView}
            footerInset={tileFooterInset}
          />
        );
        return (
          <View
            key={userId}
            style={[
              styles.tile,
              presentation === 'private_spark' && styles.privateTile,
              PLACEMENT_STYLES[placement],
            ]}
          >
            {presentation === 'private_spark' ? (
              <PrivateSparkParticipantSurface
                displayName={displayName}
                state={!candidate ? 'reconnecting' : candidate.hasVideo ? 'normal' : 'camera_off'}
              >
                {tile}
              </PrivateSparkParticipantSurface>
            ) : tile}
          </View>
        );
      })}
      {visibleRequestSeat ? Array.from({ length: visibleRequestSeats }, (_, seatIndex) => (
          <View
            key={`request-seat-${seatIndex}`}
            style={[
              styles.tile,
              styles.requestTile,
              PLACEMENT_STYLES[liveStageTilePlacement(visualTileCount, participants.length + seatIndex)],
            ]}
          >
            <LiveStageRequestTile request={visibleRequestSeat} seatIndex={seatIndex} />
          </View>
        )) : null}
      {presentation === 'private_spark' && participants.length === 2
        ? <View pointerEvents="none" style={styles.privateDivider} />
        : null}
    </View>
  );

  if (!isContainedMultiStage) return stageGrid;

  return (
    <View style={[
      styles.multiStageShell,
      visualTileCount === 2 && styles.dualStageShell,
      presentation === 'private_spark' && styles.privateMultiStageShell,
      presentation === 'private_spark'
        && participants.length === 2
        && styles.privateDualStageShell,
    ]}>
      <View style={styles.multiStageClip}>
        {stageGrid}
      </View>
    </View>
  );
});

export const StreamLiveStage = memo(function StreamLiveStage({
  bindings,
  sdk,
  stageParticipants,
  localPublisherUserId,
  onConnectedParticipantCountChange,
  constrainMultiStage,
  presentation = 'public',
  tileFooterInset,
  onPictureInPictureModeChange,
  requestSeat,
  scene,
}: StreamLiveStageProps) {
  const client = bindings.client as unknown as StreamVideoClient;
  const call = bindings.call as unknown as Call;
  const { StreamCall, StreamVideo } = sdk;
  const isInPictureInPicture = sdk.useIsInPiPMode();
  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <LivePictureInPictureBridge
          sdk={sdk}
          canControlMedia={Boolean(localPublisherUserId)}
          onModeChange={onPictureInPictureModeChange}
        />
        <StageGrid
          sdk={sdk}
          stageParticipants={stageParticipants}
          localPublisherUserId={localPublisherUserId}
          onConnectedParticipantCountChange={onConnectedParticipantCountChange}
          constrainMultiStage={constrainMultiStage}
          presentation={presentation}
          tileFooterInset={tileFooterInset}
          isInPictureInPicture={isInPictureInPicture}
          requestSeat={requestSeat}
          scene={scene}
        />
      </StreamCall>
    </StreamVideo>
  );
});

const styles = StyleSheet.create({
  grid: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#091413',
  },
  pictureInPictureStage: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#06110F',
  },
  // A solo host remains cinematic and edge-to-edge. Multi-person rooms sit in
  // one centered, rounded stage window so portrait cameras keep intentional
  // framing instead of looking like a full-screen technical grid.
  multiStageShell: {
    position: 'absolute',
    top: '13%',
    right: 12,
    bottom: '34%',
    left: 12,
    borderRadius: 28,
    padding: 2,
    backgroundColor: '#07110F',
    borderWidth: 1,
    borderColor: '#E5CC8A42',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 12,
  },
  privateMultiStageShell: {
    top: '18%',
    right: 14,
    bottom: '20%',
    left: 14,
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
  dualStageShell: {
    top: '18%',
    bottom: '38%',
  },
  privateDualStageShell: {
    top: '27%',
    bottom: '31%',
  },
  multiStageClip: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#06110F',
  },
  privateGrid: { backgroundColor: '#06110F' },
  privateTile: { borderColor: '#12332C99' },
  privateDivider: {
    position: 'absolute',
    top: '8%',
    bottom: '8%',
    left: '50%',
    width: 1,
    backgroundColor: '#3A746A66',
    shadowColor: '#806CA8',
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  tile: {
    position: 'absolute',
    padding: 1,
    overflow: 'hidden',
    backgroundColor: '#12211F',
  },
  requestTile: { padding: 0 },
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
    borderColor: LIVE_VISUAL.color.teal,
    backgroundColor: '#0D6D6826',
    marginBottom: 24,
  },
  emptyEyebrow: {
    color: LIVE_VISUAL.color.teal,
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
