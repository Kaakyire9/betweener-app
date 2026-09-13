import {
  isStudioPresentationScene,
  LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT,
  type ProgramSource,
  type ProgramState,
} from '@betweener/live-program-domain';
import {
  hasAudio,
  hasVideo,
  type Call,
  type StreamVideoClient,
  type StreamVideoParticipant,
} from '@stream-io/video-client';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import type { LiveParticipant } from '../application/live-models.ts';
import type { OdoCopilotScene } from '../odo/copilot/odo-copilot-contracts.ts';
import type { StreamLiveMediaBindings } from '../media/stream-live-media-provider.ts';
import type { StreamVideoSdkModule } from '../media/load-stream-video-sdk.ts';
import type { LiveStageAtmosphere } from '../stage/live-stage-atmosphere.ts';
import { useStableLiveSpeakerFocus } from '../stage/live-speaker-focus.ts';
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
  liveStageTilePlacementForViewport,
  selectLivePictureInPictureCandidate,
  type LiveStageTilePlacement,
} from '../stage/live-stage-layout.ts';
import { resolveLivePictureInPictureProgramSource } from '../stage/live-picture-in-picture.ts';
import { LiveStageParticipantTile } from './LiveStageParticipantTile.tsx';
import { LiveAuthoritativeProgramStage } from './LiveAuthoritativeProgramStage.tsx';
import { LiveStageAtmosphereBackdrop } from './LiveStageAtmosphere.tsx';
import { LiveStageRequestTile, type LiveStageRequestSeat } from './LiveStageRequestTile.tsx';
import { LiveStageSeamLayer } from './LiveStageSeamLayer.tsx';
import { LivePrivateStageSeam } from './LivePrivateStageSeam.tsx';
import { LiveConcealedMediaStage } from './LiveConcealedMediaStage.tsx';
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
  program?: ProgramState | null;
  programSources?: readonly ProgramSource[];
  atmosphere?: LiveStageAtmosphere | null;
  allowAtmosphereFraming?: boolean;
  visualsConcealed?: boolean;
};

const LivePictureInPictureBridge = memo(function LivePictureInPictureBridge({
  sdk,
  callCid,
  canControlMedia,
  visualsConcealed,
  onModeChange,
}: {
  sdk: StreamVideoSdkModule;
  callCid: string;
  canControlMedia: boolean;
  visualsConcealed: boolean;
  onModeChange?: (active: boolean) => void;
}) {
  sdk.useAutoEnterPiPEffect(visualsConcealed);
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
      clearAndroidLivePictureInPictureActions(callCid);
      return undefined;
    }
    setAndroidLivePictureInPictureActions(callCid, {
      cameraEnabled: !isCameraMuted,
      microphoneEnabled: !isMicrophoneMuted,
    });
    return undefined;
  }, [callCid, canControlMedia, isCameraMuted, isInPictureInPicture, isMicrophoneMuted]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    return () => clearAndroidLivePictureInPictureActions(callCid);
  }, [callCid]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !canControlMedia || !isInPictureInPicture) {
      return undefined;
    }
    return subscribeToAndroidLivePictureInPictureActions((action) => {
      if (action === 'toggle_camera') {
        void camera.toggle();
        return;
      }
      if (action === 'toggle_microphone') void microphone.toggle();
    });
  }, [camera, canControlMedia, isInPictureInPicture, microphone]);

  if (Platform.OS !== 'ios' || visualsConcealed) return null;
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
  'trio-lead-left': { left: 0, top: 0, width: '56%', height: '100%' },
  'trio-top-right': { right: 0, top: 0, width: '44%', height: '50%' },
  'trio-bottom-right-portrait': { right: 0, bottom: 0, width: '44%', height: '50%' },
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
  program,
  programSources,
  atmosphere,
  allowAtmosphereFraming,
  visualsConcealed,
  stageWidth,
  stageHeight,
}: Pick<StreamLiveStageProps, 'sdk' | 'stageParticipants' | 'localPublisherUserId' | 'onConnectedParticipantCountChange' | 'constrainMultiStage' | 'presentation' | 'tileFooterInset' | 'requestSeat' | 'scene' | 'program' | 'programSources' | 'atmosphere' | 'allowAtmosphereFraming' | 'visualsConcealed'> & {
  isInPictureInPicture: boolean;
  stageWidth: number;
  stageHeight: number;
}) {
  const { useParticipants } = sdk.useCallStateHooks();
  const rtcParticipants = useParticipants();
  const publicRtcParticipants = useMemo(
    () => rtcParticipants.filter((participant: StreamVideoParticipant) => (
      !participant.userId.startsWith('studio-')
    )),
    [rtcParticipants],
  );
  const candidates = useMemo(() => (
    publicRtcParticipants.map((participant: StreamVideoParticipant) => ({
      participant,
      userId: participant.userId,
      sessionId: participant.sessionId,
      isLocalParticipant: participant.isLocalParticipant === true,
      isSpeaking: participant.isSpeaking,
      hasVideo: hasVideo(participant),
      hasAudio: hasAudio(participant),
    }))
  ), [publicRtcParticipants]);
  const connectedParticipantCount = useMemo(
    () => countConnectedLiveParticipants(candidates),
    [candidates],
  );
  const focusedSpeakerUserId = useStableLiveSpeakerFocus(candidates.map((candidate) => ({
    userId: candidate.userId,
    hasAudio: candidate.hasAudio,
    isSpeaking: candidate.isSpeaking,
  })));
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
      { preferRemote: presentation === 'private_spark' },
    ),
    [participants, presentation],
  );
  const pictureInPictureProgramSource = useMemo(
    () => resolveLivePictureInPictureProgramSource(program ?? null, programSources ?? []),
    [program, programSources],
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
  if (visualsConcealed) {
    return <LiveConcealedMediaStage compact={isInPictureInPicture} />;
  }
  const hasAuthoritativePresentation = Boolean(
    program && isStudioPresentationScene(program.scene),
  );
  if (!participants.length && !visibleRequestSeat && !hasAuthoritativePresentation) {
    return (
      <View style={styles.emptyStage}>
        <View style={styles.orbit} />
        <Text style={styles.emptyEyebrow}>STAGE IS READY</Text>
        <Text style={styles.emptyTitle}>A thoughtful room is about to begin.</Text>
      </View>
    );
  }

  if (Platform.OS === 'android' && isInPictureInPicture && (
    participants.length || pictureInPictureProgramSource
  )) {
    const programParticipant = pictureInPictureProgramSource
      ? rtcParticipants.find((participant: StreamVideoParticipant) => (
          participant.userId === pictureInPictureProgramSource.providerUserId
        ))
      : undefined;
    const pictureInPictureSeat = participants.find(
      (seat) => seat.userId === (programParticipant?.userId ?? pictureInPictureCandidate?.userId),
    ) ?? participants[0];
    const selectedParticipant = programParticipant
      ?? pictureInPictureSeat?.candidate?.participant
      ?? null;
    const usesProgramSource = Boolean(programParticipant && pictureInPictureProgramSource);
    return (
      <View style={styles.pictureInPictureStage}>
        <LiveStageParticipantTile
          participant={selectedParticipant}
          identity={pictureInPictureSeat?.identity ?? null}
          fit={usesProgramSource ? pictureInPictureProgramSource?.fit ?? 'cover' : 'cover'}
          trackType={usesProgramSource
            ? pictureInPictureProgramSource?.trackType ?? 'videoTrack'
            : 'videoTrack'}
          editorialFocus={selectedParticipant?.userId === focusedSpeakerUserId}
          ParticipantViewComponent={sdk.ParticipantView}
        />
      </View>
    );
  }

  if (hasAuthoritativePresentation) {
    return (
      <LiveAuthoritativeProgramStage
        program={program ?? null}
        sources={programSources ?? []}
        rtcParticipants={rtcParticipants}
        stageSeats={participants}
        sdk={sdk}
        focusedSpeakerUserId={focusedSpeakerUserId}
      />
    );
  }

  const visualTileCount = Math.min(
    LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT,
    participants.length + visibleRequestSeats,
  );
  const hasSoloStageChrome = presentation === 'public'
    && allowAtmosphereFraming !== false
    && visualTileCount === 1;
  const isContainedStage = constrainMultiStage !== false
    && visualTileCount > 1;
  const focusedSpeakerIndex = participants.findIndex(
    (seat) => seat.userId === focusedSpeakerUserId,
  );
  const stageGrid = (
    <View style={[styles.grid, presentation === 'private_spark' && styles.privateGrid]}>
      {participants.map(({ candidate, identity, userId }, index) => {
        const placement = liveStageTilePlacementForViewport(
          visualTileCount,
          index,
          stageWidth,
          stageHeight,
        );
        const displayName = candidate?.isLocalParticipant
          ? 'You'
          : identity?.fullName?.trim() || candidate?.participant.name?.trim() || 'Your connection';
        const tile = (
          <LiveStageParticipantTile
            participant={candidate?.participant ?? null}
            identity={identity}
            fit="cover"
            editorialFocus={userId === focusedSpeakerUserId}
            compactFallback={placement !== 'single'
              && placement !== 'trio-lead'
              && placement !== 'trio-lead-left'}
            stageOverlay={hasSoloStageChrome && index === 0
              ? <LiveStageAtmosphereBackdrop atmosphere={atmosphere} overlay />
              : null}
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
              PLACEMENT_STYLES[liveStageTilePlacementForViewport(
                visualTileCount,
                participants.length + seatIndex,
                stageWidth,
                stageHeight,
              )],
            ]}
          >
            <LiveStageRequestTile request={visibleRequestSeat} seatIndex={seatIndex} />
          </View>
        )) : null}
      {presentation === 'public' ? (
        <LiveStageSeamLayer
          focusedIndex={focusedSpeakerIndex}
          stageHeight={stageHeight}
          stageWidth={stageWidth}
          tileCount={visualTileCount}
        />
      ) : null}
      {presentation === 'private_spark' && participants.length === 2
        ? <LivePrivateStageSeam />
        : null}
    </View>
  );

  if (!isContainedStage) return stageGrid;

  return (
    <View style={[
      styles.multiStageShell,
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
  program,
  programSources,
  atmosphere,
  allowAtmosphereFraming,
  visualsConcealed = false,
}: StreamLiveStageProps) {
  const client = bindings.client as unknown as StreamVideoClient;
  const call = bindings.call as unknown as Call;
  const { StreamCall, StreamVideo } = sdk;
  const isInPictureInPicture = sdk.useIsInPiPMode();
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const handleStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setStageSize((current) => (
      Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
        ? current
        : { width, height }
    ));
  }, []);
  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <LivePictureInPictureBridge
          sdk={sdk}
          callCid={call.cid}
          canControlMedia={Boolean(localPublisherUserId) && !visualsConcealed}
          visualsConcealed={visualsConcealed}
          onModeChange={onPictureInPictureModeChange}
        />
        <View onLayout={handleStageLayout} style={styles.stageCanvas}>
          {presentation === 'public' && !isInPictureInPicture
            ? <LiveStageAtmosphereBackdrop atmosphere={atmosphere} /> : null}
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
            program={program}
            programSources={programSources}
            atmosphere={atmosphere}
            allowAtmosphereFraming={allowAtmosphereFraming}
            visualsConcealed={visualsConcealed}
            stageWidth={stageSize.width}
            stageHeight={stageSize.height}
          />
        </View>
      </StreamCall>
    </StreamVideo>
  );
});

const styles = StyleSheet.create({
  stageCanvas: { flex: 1, overflow: 'hidden', backgroundColor: '#071815' },
  grid: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  pictureInPictureStage: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#06110FCC',
  },
  // The parent owns the measured Stage boundary. Multi-person layouts fill it
  // consistently so participant changes never introduce vertical jumps.
  multiStageShell: {
    position: 'absolute',
    top: 3,
    right: 3,
    bottom: 3,
    left: 3,
    borderRadius: 25,
    padding: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  privateMultiStageShell: {
    top: '18%',
    right: 14,
    bottom: '20%',
    left: 14,
    padding: 2,
    backgroundColor: '#07110F',
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 6,
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
    backgroundColor: 'transparent',
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
