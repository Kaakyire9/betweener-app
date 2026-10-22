import {
  resolveAssignedProgramLayout,
  type ProgramSource,
  type ProgramSourceSlot,
} from '@betweener/live-program-domain';
import {
  Audio,
  ParticipantView,
  useCallStateHooks,
  type StreamVideoParticipant,
} from '@stream-io/video-react-sdk';

import type { CompositorSnapshot } from './contracts.ts';

const visualCopy = (source: ProgramSource | undefined, title: string) => {
  switch (source?.type) {
    case 'quick_connect_pool': return ['QUICK CONNECT', 'The room is gathering.'];
    case 'active_pair': return ['ACTIVE PAIR', 'A thoughtful conversation is underway.'];
    case 'audience_pulse': return ['ROOM PULSE', 'The room is shaping the moment.'];
    case 'odo_stage': return ['ODO · LIVE', 'Thoughtful direction, in motion.'];
    case 'branded_visual': return ['BETWEENER LIVE', title];
    default: return ['BETWEENER LIVE', title];
  }
};

const participantForSource = (
  source: ProgramSource | undefined,
  participants: readonly StreamVideoParticipant[],
) => {
  if (source && (!['ready', 'live'].includes(source.readiness) || source.health === 'lost')) {
    return undefined;
  }
  return participants.find((participant) => participant.userId === source?.providerUserId);
};

const participantsForSlot = (
  _slot: ProgramSourceSlot,
  source: ProgramSource | undefined,
  participants: readonly StreamVideoParticipant[],
) => {
  const direct = participantForSource(source, participants);
  if (direct) return [direct];
  return [];
};

export function ProgramCanvas({ snapshot }: { snapshot: CompositorSnapshot }) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const sourcesByKey = new Map(snapshot.sources.map((source) => [source.key, source]));
  const layout = resolveAssignedProgramLayout(
    snapshot.program.scene,
    snapshot.program.targetCanvas,
    snapshot.program.sourceAssignments,
  );
  const regions = layout.regions.filter((region) => region.treatment !== 'audio').map((region) => {
    const sourceKey = snapshot.program.sourceAssignments[region.slot];
    const source = sourceKey ? sourcesByKey.get(sourceKey) : undefined;
    const selected = participantsForSlot(region.slot, source, participants);
    const [eyebrow, title] = visualCopy(source, snapshot.session.title);
    return (
      <div className={`program-region treatment-${region.treatment}`} key={region.slot} style={{
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
        zIndex: region.zIndex,
      }}>
        {selected.length > 0 ? (
          <div className={`participant-grid participants-${selected.length}`}>
            {selected.map((participant) => (
              <ParticipantView
                key={`${participant.sessionId}:${source?.type ?? 'video'}`}
                participant={participant}
                trackType={source?.type === 'screen_share' ? 'screenShareTrack' : 'videoTrack'}
                ParticipantViewUI={null}
                muteAudio
              />
            ))}
          </div>
        ) : (
          <div className="program-visual">
            <span className="program-orbit" />
            <p>{eyebrow}</p>
            <strong>{title}</strong>
            <small>{source?.readiness === 'preparing' ? 'Preparing source' : 'Programme standby'}</small>
          </div>
        )}
      </div>
    );
  });

  const audioBindings = new Map<string, {
    participant: StreamVideoParticipant;
    trackType: 'audioTrack' | 'screenShareAudioTrack';
  }>();
  (['audio_host', 'audio_screen', 'audio_atmosphere'] as const).forEach((slot) => {
    const sourceKey = snapshot.program.sourceAssignments[slot];
    const source = sourceKey ? sourcesByKey.get(sourceKey) : undefined;
    if (!source || !source.hasAudio || source.muted || source.health === 'lost'
      || !['ready', 'live'].includes(source.readiness)) return;
    const participant = participants.find((candidate) => candidate.userId === source.providerUserId);
    if (!participant || participant.isLocalParticipant) return;
    const trackType = source.type === 'screen_share_audio'
      ? 'screenShareAudioTrack' as const
      : 'audioTrack' as const;
    audioBindings.set(`${participant.sessionId}:${trackType}`, { participant, trackType });
  });

  return (
    <main className={`program-output canvas-${snapshot.program.targetCanvas}`}>
      {regions}
      {[...audioBindings.values()].map(({ participant, trackType }) => (
        <Audio key={`${participant.sessionId}:${trackType}`} participant={participant}
          trackType={trackType} />
      ))}
      <div className="program-safe-area" aria-hidden="true" />
      <div className={`program-transition transition-${snapshot.program.transition}`}
        key={`${snapshot.program.programVersion}:${snapshot.program.scene}`} />
    </main>
  );
}
