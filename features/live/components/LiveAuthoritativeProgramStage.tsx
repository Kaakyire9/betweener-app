import {
  isStudioPresentationScene,
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
}: {
  program: ProgramState | null;
  sources: readonly ProgramSource[];
  rtcParticipants: readonly StreamVideoParticipant[];
  stageSeats: readonly StageSeat[];
  sdk: StreamVideoSdkModule;
  focusedSpeakerUserId: string | null;
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
        const regionStyle: ViewStyle = {
          left: percent(region.x),
          top: percent(region.y),
          width: percent(region.width),
          height: percent(region.height),
          zIndex: region.zIndex,
        };
        const pairSeats = source?.type === 'active_pair'
          ? stageSeats.filter((candidate) => candidate.identity?.role !== 'host').slice(0, 2)
          : [];
        return (
          <View key={region.slot} style={[styles.region, regionStyle,
            region.treatment === 'pip' && styles.pip]}>
            {participant ? (
              <LiveStageParticipantTile
                participant={participant}
                identity={seat?.identity ?? null}
                fit={trackType === 'screenShareTrack' ? 'contain' : 'cover'}
                trackType={trackType}
                editorialFocus={participant.userId === focusedSpeakerUserId}
                ParticipantViewComponent={sdk.ParticipantView}
              />
            ) : pairSeats.length ? (
              <View style={styles.pairGrid}>
                {pairSeats.map((pairSeat) => (
                  <View key={pairSeat.userId} style={styles.pairTile}>
                    <LiveStageParticipantTile
                      participant={pairSeat.candidate?.participant ?? null}
                      identity={pairSeat.identity}
                      fit="cover"
                      editorialFocus={pairSeat.userId === focusedSpeakerUserId}
                      ParticipantViewComponent={sdk.ParticipantView}
                    />
                  </View>
                ))}
              </View>
            ) : <LiveProgramVisualSource source={source} />}
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
  pip: {
    borderRadius: 18,
    padding: 2,
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
  pairGrid: { flex: 1, flexDirection: 'row', backgroundColor: '#071815' },
  pairTile: { flex: 1, minWidth: 0, overflow: 'hidden' },
});
