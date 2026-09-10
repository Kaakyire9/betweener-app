import {
  resolveProgramLayout,
  type ProgramPreviewState,
  type ProgramSource,
  type ProgramState,
} from '@betweener/live-program-domain';
import {
  ParticipantView,
  useCallStateHooks,
  type StreamVideoParticipant,
} from '@stream-io/video-react-sdk';

import { useStudioMedia } from '../media/studio-media-context.tsx';

type RenderState = Pick<ProgramState, 'scene' | 'targetCanvas' | 'sourceAssignments'>
  | Pick<ProgramPreviewState, 'scene' | 'targetCanvas' | 'sourceAssignments'>;

const visualCopy = (source: ProgramSource | undefined) => {
  switch (source?.type) {
    case 'quick_connect_pool': return ['QUICK CONNECT', 'The pool is gathering.'];
    case 'active_pair': return ['ACTIVE PAIR', 'A thoughtful conversation is underway.'];
    case 'audience_pulse': return ['ROOM PULSE', 'The room is shaping the moment.'];
    case 'odo_stage': return ['ODO · LIVE', 'Thoughtful direction, in motion.'];
    case 'branded_visual': return ['BETWEENER LIVE', 'Making room for connection.'];
    default: return ['SOURCE', source?.key ?? 'Not assigned'];
  }
};

function ConnectedProgramRenderer({
  state,
  sources,
  label,
}: {
  state: RenderState;
  sources: readonly ProgramSource[];
  label: string;
}) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const layout = resolveProgramLayout(state.scene, state.targetCanvas);
  const byKey = new Map(sources.map((source) => [source.key, source]));
  const studioParticipants = participants.filter((participant) => participant.userId.startsWith('studio-'));
  const roomParticipants = participants.filter((participant) => !participant.userId.startsWith('studio-'));

  const participantFor = (source: ProgramSource | undefined) =>
    participants.find((participant) => participant.userId === source?.providerUserId)
      ?? (source?.type === 'host_camera' ? roomParticipants[0] : undefined);

  const renderParticipant = (
    participant: StreamVideoParticipant,
    source: ProgramSource | undefined,
  ) => (
    <ParticipantView
      key={`${participant.sessionId}:${source?.type ?? 'video'}`}
      participant={participant}
      trackType={source?.type === 'screen_share' ? 'screenShareTrack' : 'videoTrack'}
      ParticipantViewUI={null}
      muteAudio
    />
  );

  return (
    <div className={`program-canvas canvas-${state.targetCanvas}`} aria-label={label}>
      {layout.regions.filter((region) => region.treatment !== 'audio').map((region) => {
        const key = state.sourceAssignments[region.slot];
        const source = key ? byKey.get(key) : undefined;
        const participant = participantFor(source);
        const pool = source?.type === 'quick_connect_pool' || source?.type === 'active_pair'
          ? roomParticipants.slice(0, source.type === 'active_pair' ? 2 : 4)
          : [];
        const [eyebrow, title] = visualCopy(source);
        return (
          <div className={`program-region treatment-${region.treatment}`} key={region.slot}
            style={{
              left: `${region.x * 100}%`, top: `${region.y * 100}%`,
              width: `${region.width * 100}%`, height: `${region.height * 100}%`,
              zIndex: region.zIndex,
            }}>
            {participant ? renderParticipant(participant, source) : pool.length ? (
              <div className={`participant-grid participants-${pool.length}`}>
                {pool.map((member) => renderParticipant(member, source))}
              </div>
            ) : (
              <div className="programme-visual">
                <span className="programme-orbit" />
                <p className="eyebrow">{eyebrow}</p>
                <strong>{title}</strong>
                <small>{source ? `${source.readiness} · ${source.health}` : 'Choose a source in Preview'}</small>
              </div>
            )}
          </div>
        );
      })}
      <div className="canvas-safe-area" aria-hidden="true" />
      <div className="canvas-badge">{state.targetCanvas.replaceAll('_', ' · ')}</div>
      {studioParticipants.length === 0 ? <div className="monitor-note">Media monitor not connected</div> : null}
    </div>
  );
}

export function ProgramRenderer({
  state,
  sources,
  label,
}: {
  state: RenderState;
  sources: readonly ProgramSource[];
  label: string;
}) {
  const { binding } = useStudioMedia();
  if (binding) return <ConnectedProgramRenderer state={state} sources={sources} label={label} />;
  const layout = resolveProgramLayout(state.scene, state.targetCanvas);
  const byKey = new Map(sources.map((source) => [source.key, source]));
  return (
    <div className={`program-canvas canvas-${state.targetCanvas}`} aria-label={label}>
      {layout.regions.filter((region) => region.treatment !== 'audio').map((region) => {
        const source = byKey.get(state.sourceAssignments[region.slot] ?? '');
        const [eyebrow, title] = visualCopy(source);
        return <div className="program-region" key={region.slot} style={{
          left: `${region.x * 100}%`, top: `${region.y * 100}%`,
          width: `${region.width * 100}%`, height: `${region.height * 100}%`,
          zIndex: region.zIndex,
        }}><div className="programme-visual"><span className="programme-orbit" />
          <p className="eyebrow">{eyebrow}</p><strong>{title}</strong>
          <small>{source ? `${source.readiness} · ${source.health}` : 'Choose a source in Preview'}</small>
        </div></div>;
      })}
      <div className="canvas-safe-area" aria-hidden="true" />
      <div className="monitor-note">Connect media for a live monitor</div>
    </div>
  );
}
