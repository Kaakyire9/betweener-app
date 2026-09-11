import {
  PROGRAM_SCENES,
  visualSlotsForScene,
  type ProgramPreviewState,
  type ProgramScene,
  type ProgramSource,
  type ProgramSourceSlot,
  type ProgramTargetCanvas,
  type ProgramTransition,
} from '@betweener/live-program-domain';

import { sourceFitsSlot } from './source-assignments.ts';

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

export { assignmentsForScene } from './source-assignments.ts';

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
  const visualSlots = visualSlotsForScene(preview.scene);
  const audioSlots = (['audio_host', 'audio_screen', 'audio_atmosphere'] as const)
    .filter((slot) => sources.some((source) => sourceFitsSlot(slot, source)));
  const assignableSlots = [...visualSlots, ...audioSlots.filter((slot) => !visualSlots.includes(slot))];
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
