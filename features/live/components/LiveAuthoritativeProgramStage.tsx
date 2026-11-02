import {
  isStudioPresentationScene,
  resolveProgramScreenPresentationV1,
  resolveAssignedProgramLayout,
  type ProgramSource,
  type ProgramState,
} from '@betweener/live-program-domain';
import type { StreamVideoParticipant, VideoTrackType } from '@stream-io/video-client';
import { memo } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';

import type { LiveParticipant } from '../application/live-models.ts';
import type { StreamVideoSdkModule } from '../media/load-stream-video-sdk.ts';
import type { LiveStageSeat } from '../stage/live-stage-layout.ts';
import { LiveProgramVisualSource } from './LiveProgramVisualSource.tsx';
import { LiveScreenPresentationSurface } from './LiveScreenPresentationSurface.tsx';
import { LiveStageParticipantTile } from './LiveStageParticipantTile.tsx';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type StageSeat = LiveStageSeat<StreamVideoParticipant, LiveParticipant>;

const percent = (value: number): DimensionValue => `${value * 100}%`;

export const LiveAuthoritativeProgramStage = memo(function LiveAuthoritativeProgramStage({
  program,
  sources,
  rtcParticipants,
  stageSeats,
  sdk,
  focusedSpeakerUserId,
  screenShareAspectRatio,
  screenPresentationFocused = false,
  onToggleScreenPresentationFocus,
}: {
  program: ProgramState | null;
  sources: readonly ProgramSource[];
  rtcParticipants: readonly StreamVideoParticipant[];
  stageSeats: readonly StageSeat[];
  sdk: StreamVideoSdkModule;
  focusedSpeakerUserId: string | null;
  screenShareAspectRatio?: number | null;
  screenPresentationFocused?: boolean;
  onToggleScreenPresentationFocus?: () => void;
}) {
  if (!program || !isStudioPresentationScene(program.scene)) return null;
  const layout = resolveAssignedProgramLayout(
    program.scene, program.targetCanvas, program.sourceAssignments,
  );
  const sourcesByKey = new Map(sources.map((source) => [source.key, source]));
  const participantsByUserId = new Map(rtcParticipants.map((participant) => [participant.userId, participant]));

  return (
    <View accessibilityLabel={`Betweener Program. ${program.scene.replaceAll('_', ' ')}.`}
      style={styles.root}>
      {layout.regions.filter((region) => region.treatment !== 'audio').map((region) => {
        const sourceKey = program.sourceAssignments[region.slot];
        const source = sourceKey ? sourcesByKey.get(sourceKey) : undefined;
        const participant = source?.providerUserId
          ? participantsByUserId.get(source.providerUserId)
          : undefined;
        const seat = participant
          ? stageSeats.find((candidate) => candidate.userId === participant.userId)
          : undefined;
        const trackType: VideoTrackType = source?.type === 'screen_share'
          ? 'screenShareTrack' : 'videoTrack';
        const isScreenPresentation = trackType === 'screenShareTrack';
        const fitV1Enabled = process.env.EXPO_PUBLIC_SCREEN_FIT_V1_ENABLED === 'true';
        const screenPresentation = isScreenPresentation && fitV1Enabled
          ? resolveProgramScreenPresentationV1(
            program.screenFitMode ?? 'auto',
            program.targetCanvas,
            source ? {
              ...source,
              sourceAspectRatio: source.sourceAspectRatio ?? screenShareAspectRatio ?? null,
            } : undefined,
          )
          : null;
        const regionStyle: ViewStyle = {
          left: percent(region.x),
          top: percent(region.y),
          width: percent(region.width),
          height: percent(region.height),
          zIndex: region.zIndex,
        };
        const participantTile = participant && isScreenPresentation ? (
          <LiveScreenPresentationSurface
            participant={participant}
            identity={seat?.identity ?? null}
            sdk={sdk}
            targetCanvas={program.targetCanvas}
            sourceAspectRatio={screenShareAspectRatio}
            fit={screenPresentation?.fit ?? 'contain'}
            matte={screenPresentation?.matte ?? 'brand_static'}
            editorialFocus={participant.userId === focusedSpeakerUserId}
            focused={screenPresentationFocused}
            onToggleFocus={onToggleScreenPresentationFocus}
          />
        ) : participant ? (
          <LiveStageParticipantTile
            participant={participant}
            identity={seat?.identity ?? null}
            fit="cover"
            trackType={trackType}
            editorialFocus={participant.userId === focusedSpeakerUserId}
            ParticipantViewComponent={sdk.ParticipantView}
          />
        ) : <LiveProgramVisualSource source={source} />;
        return (
          <View key={region.slot} style={[styles.region, regionStyle,
            region.treatment === 'pip' && styles.pip,
            isScreenPresentation && styles.screenRegion]}>
            {participantTile}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  region: { position: 'absolute', padding: 1, overflow: 'hidden', backgroundColor: '#071815B8' },
  screenRegion: { padding: 0, backgroundColor: '#06110F' },
  pip: {
    borderRadius: 18,
    padding: 2,
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
});
