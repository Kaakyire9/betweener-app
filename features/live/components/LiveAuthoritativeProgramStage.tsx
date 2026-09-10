import {
  isStudioPresentationScene,
  resolveProgramLayout,
  type ProgramSource,
  type ProgramState,
} from '@betweener/live-program-domain';
import type { StreamVideoParticipant, VideoTrackType } from '@stream-io/video-client';
import { memo } from 'react';
import { StyleSheet, Text, View, type DimensionValue, type ViewStyle } from 'react-native';

import type { LiveParticipant } from '../application/live-models.ts';
import type { StreamVideoSdkModule } from '../media/load-stream-video-sdk.ts';
import type { LiveStageSeat } from '../stage/live-stage-layout.ts';
import { LiveStageParticipantTile } from './LiveStageParticipantTile.tsx';
import { LIVE_VISUAL } from './live-visual-tokens.ts';

type StageSeat = LiveStageSeat<StreamVideoParticipant, LiveParticipant>;

const percent = (value: number): DimensionValue => `${value * 100}%`;

const copyForSource = (source: ProgramSource | undefined): [string, string] => {
  switch (source?.type) {
    case 'active_pair': return ['QUICK CONNECT', 'A thoughtful conversation is underway.'];
    case 'quick_connect_pool': return ['QUICK CONNECT', 'The pool is gathering.'];
    case 'audience_pulse': return ['ROOM PULSE', 'The room is shaping the moment.'];
    case 'odo_stage': return ['ODO · LIVE', 'Thoughtful direction, in motion.'];
    case 'programme_music': return ['PROGRAMME MUSIC', 'A little room to breathe.'];
    default: return ['BETWEENER LIVE', 'Making room for connection.'];
  }
};

export const LiveAuthoritativeProgramStage = memo(function LiveAuthoritativeProgramStage({
  program,
  sources,
  rtcParticipants,
  stageSeats,
  sdk,
}: {
  program: ProgramState | null;
  sources: readonly ProgramSource[];
  rtcParticipants: readonly StreamVideoParticipant[];
  stageSeats: readonly StageSeat[];
  sdk: StreamVideoSdkModule;
}) {
  if (!program || !isStudioPresentationScene(program.scene)) return null;
  const layout = resolveProgramLayout(program.scene, 'portrait_9_16');
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
        const [eyebrow, title] = copyForSource(source);
        return (
          <View key={region.slot} style={[styles.region, regionStyle,
            region.treatment === 'pip' && styles.pip]}>
            {participant ? (
              <LiveStageParticipantTile
                participant={participant}
                identity={seat?.identity ?? null}
                fit={trackType === 'screenShareTrack' ? 'contain' : 'cover'}
                trackType={trackType}
                ParticipantViewComponent={sdk.ParticipantView}
              />
            ) : (
              <View style={styles.visual}>
                <View style={styles.orbit} />
                <Text style={styles.eyebrow}>{eyebrow}</Text>
                <Text style={styles.title}>{title}</Text>
                {source?.health === 'degraded' ? (
                  <Text style={styles.status}>Source recovering</Text>
                ) : null}
              </View>
            )}
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
    zIndex: 5,
    overflow: 'hidden',
    backgroundColor: '#071815',
  },
  region: { position: 'absolute', padding: 1, overflow: 'hidden', backgroundColor: '#071815' },
  pip: {
    borderRadius: 18,
    padding: 2,
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
  visual: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 18,
    backgroundColor: '#0A201C',
  },
  orbit: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1,
    borderColor: LIVE_VISUAL.color.borderStrong,
  },
  eyebrow: {
    color: LIVE_VISUAL.color.teal,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: 'Manrope_800ExtraBold',
  },
  title: {
    maxWidth: 250,
    marginTop: 9,
    color: '#F7F0E6',
    fontSize: 23,
    lineHeight: 29,
    textAlign: 'center',
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  status: { marginTop: 9, color: '#AFC1BA', fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
});
