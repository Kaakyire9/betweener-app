import {
  PROGRAM_SCENES,
  requiredSlotsForScene,
  type ProgramPreviewState,
  type ProgramScene,
  type ProgramSource,
  type ProgramSourceSlot,
  type ProgramTargetCanvas,
  type ProgramTransition,
} from '@betweener/live-program-domain';

const LABELS: Record<ProgramScene, string> = {
  host_focus: 'Host',
  host_plus_pool: 'Host + Pool',
  pool_focus: 'Pool',
  pair_forming: 'Pair Forming',
  quick_connect_active: 'Active Pair',
  audience_pulse: 'Audience Pulse',
  conversation_topic: 'Conversation Topic',
  odo_stage: 'Odo Stage',
  music_intermission: 'Music Intermission',
  branded_intermission: 'Branded Intermission',
  session_closing: 'Closing',
  screen_full: 'Screen Full',
  screen_plus_host: 'Screen + Host',
  screen_plus_pair: 'Screen + Pair',
  screen_plus_panel: 'Screen + Panel',
  screen_discussion: 'Screen Discussion',
  screen_plus_pool: 'Screen + Pool',
  screen_plus_audience_pulse: 'Screen + Pulse',
  screen_plus_odo: 'Screen + Odo',
  dj_plus_pool: 'DJ + Pool',
};

const sourceFitsSlot = (slot: ProgramSourceSlot, source: ProgramSource): boolean => {
  switch (slot) {
    case 'primary': return source.type === 'screen_share';
    case 'host': return source.type === 'host_camera';
    case 'pair': return source.type === 'active_pair';
    case 'pool': return source.type === 'quick_connect_pool';
    case 'pulse': return source.type === 'audience_pulse';
    case 'odo': return source.type === 'odo_stage' || source.type === 'branded_visual';
    case 'audio_atmosphere': return source.type === 'dj_audio' || source.type === 'programme_music';
    case 'audio_host': return source.type === 'host_microphone';
    case 'audio_screen': return source.type === 'screen_share_audio';
    default: return source.type === 'participant_camera' || source.type === 'host_camera';
  }
};

export const assignmentsForScene = (
  scene: ProgramScene,
  sources: readonly ProgramSource[],
  current: ProgramPreviewState['sourceAssignments'],
) => {
  const next = { ...current };
  requiredSlotsForScene(scene).forEach((slot) => {
    const existing = sources.find((source) => source.key === next[slot]);
    if (!existing || !sourceFitsSlot(slot, existing)) {
      next[slot] = sources.find((source) => sourceFitsSlot(slot, source)
        && ['ready', 'live'].includes(source.readiness) && source.health !== 'lost')?.key;
      if (!next[slot]) delete next[slot];
    }
  });
  if (scene === 'host_focus' && !next.host) next.host = 'server.host';
  if (scene === 'pool_focus' && !next.pool) next.pool = 'server.pool';
  if (scene === 'quick_connect_active' && !next.pair) next.pair = 'server.pair';
  if (scene === 'audience_pulse' && !next.pulse) next.pulse = 'server.pulse';
  if (['odo_stage','conversation_topic','music_intermission','branded_intermission','session_closing']
    .includes(scene) && !next.odo) next.odo = scene === 'branded_intermission'
      ? 'server.brand' : 'server.odo';
  return next;
};

export function SceneLibrary({
  preview,
  sources,
  onScene,
  onAssignment,
  onCanvas,
  onTransition,
}: {
  preview: ProgramPreviewState;
  sources: readonly ProgramSource[];
  onScene: (scene: ProgramScene) => void;
  onAssignment: (slot: ProgramSourceSlot, sourceKey: string | null) => void;
  onCanvas: (canvas: ProgramTargetCanvas) => void;
  onTransition: (transition: ProgramTransition) => void;
}) {
  const requiredSlots = requiredSlotsForScene(preview.scene);
  const audioSlots = (['audio_host', 'audio_screen', 'audio_atmosphere'] as const)
    .filter((slot) => sources.some((source) => sourceFitsSlot(slot, source)));
  const assignableSlots = [...requiredSlots, ...audioSlots.filter((slot) => !requiredSlots.includes(slot))];
  return (
    <div className="stack-md">
      <div className="scene-grid" role="list" aria-label="Program scenes">
        {PROGRAM_SCENES.map((scene) => <button key={scene} role="listitem"
          className={`scene-card ${preview.scene === scene ? 'selected' : ''}`}
          onClick={() => onScene(scene)}>
          <span className={`scene-thumbnail scene-${scene}`} aria-hidden="true"><i /><i /><i /></span>
          <strong>{LABELS[scene]}</strong>
        </button>)}
      </div>
      {assignableSlots.length ? <div className="assignment-grid">
        {assignableSlots.map((slot) => <label className="field-label" key={slot}>
          {slot.replaceAll('_', ' ')}
          <select value={preview.sourceAssignments[slot] ?? ''}
            onChange={(event) => onAssignment(slot, event.target.value || null)}>
            <option value="">Choose source</option>
            {sources.filter((source) => sourceFitsSlot(slot, source)).map((source) => (
              <option key={source.id} value={source.key} disabled={
                !['ready', 'live'].includes(source.readiness) || source.health === 'lost'
              }>{source.key} · {source.readiness}</option>
            ))}
          </select>
        </label>)}
      </div> : null}
      <div className="assignment-grid">
        <label className="field-label">Target canvas
          <select value={preview.targetCanvas}
            onChange={(event) => onCanvas(event.target.value as ProgramTargetCanvas)}>
            <option value="portrait_9_16">Mobile portrait · 9:16</option>
            <option value="landscape_16_9">Studio landscape · 16:9</option>
            <option value="square_1_1">Square · 1:1</option>
          </select>
        </label>
        <label className="field-label">Transition
          <select value={preview.transition}
            onChange={(event) => onTransition(event.target.value as ProgramTransition)}>
            <option value="auto">Auto</option>
            <option value="cut">Cut</option>
            <option value="fade">Fade</option>
          </select>
        </label>
      </div>
    </div>
  );
}
