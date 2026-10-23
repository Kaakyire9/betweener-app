import {
  PROGRAM_SCENE_MANIFEST,
  programSceneAvailability,
  resolveAssignedProgramLayout,
  visualSlotsForScene,
  type ProgramPreviewState,
  type ProgramScene,
  type ProgramSceneCategory,
  type ProgramSceneManifestEntry,
  type ProgramSource,
  type ProgramSourceSlot,
  type ProgramTargetCanvas,
  type ProgramTransition,
} from '@betweener/live-program-domain';

import { isProgramSourceUsable, sourceFitsSlot } from './source-assignments.ts';

export { assignmentsForScene } from './source-assignments.ts';

const CATEGORY_LABELS: Record<ProgramSceneCategory | 'recommended', string> = {
  recommended: 'Recommended now',
  conversation: 'Conversation',
  presentation: 'Presentation',
  intermission: 'Intermission & safety',
  advanced: 'Advanced',
};

function SceneThumbnail({ entry, preview, sources }: {
  entry: ProgramSceneManifestEntry;
  preview: ProgramPreviewState;
  sources: readonly ProgramSource[];
}) {
  const availability = programSceneAvailability(
    entry.scene, preview.targetCanvas, sources, preview.sourceAssignments,
  );
  const layout = resolveAssignedProgramLayout(
    entry.scene, preview.targetCanvas, availability.assignments,
  );
  return (
    <span className={`scene-thumbnail canvas-${preview.targetCanvas}`} aria-hidden="true">
      {layout.regions.filter((region) => region.treatment !== 'audio').map((region) => (
        <i key={region.slot} className={`thumbnail-region treatment-${region.treatment}`} style={{
          left: `${region.x * 100}%`, top: `${region.y * 100}%`,
          width: `${region.width * 100}%`, height: `${region.height * 100}%`,
        }} />
      ))}
    </span>
  );
}

function SceneGroup({ title, entries, preview, sources, onScene }: {
  title: string;
  entries: readonly ProgramSceneManifestEntry[];
  preview: ProgramPreviewState;
  sources: readonly ProgramSource[];
  onScene: (scene: ProgramScene) => void;
}) {
  if (!entries.length) return null;
  return (
    <section className="scene-group">
      <div className="scene-group-heading"><strong>{title}</strong><span>{entries.length}</span></div>
      <div className="scene-grid" role="list" aria-label={`${title} program scenes`}>
        {entries.map((entry) => {
          const availability = programSceneAvailability(
            entry.scene, preview.targetCanvas, sources, preview.sourceAssignments,
          );
          return <button key={entry.scene} role="listitem"
            className={`scene-card ${preview.scene === entry.scene ? 'selected' : ''}`}
            disabled={!availability.available}
            title={availability.reason ?? entry.description}
            onClick={() => onScene(entry.scene)}>
            <SceneThumbnail entry={entry} preview={preview} sources={sources} />
            <strong>{entry.label}</strong>
            <small>{availability.reason ?? entry.description}</small>
          </button>;
        })}
      </div>
    </section>
  );
}

export function SceneLibrary({ preview, sources, onScene, onAssignment, onCanvas, onTransition }: {
  preview: ProgramPreviewState;
  sources: readonly ProgramSource[];
  onScene: (scene: ProgramScene) => void;
  onAssignment: (slot: ProgramSourceSlot, sourceKey: string | null) => void;
  onCanvas: (canvas: ProgramTargetCanvas) => void;
  onTransition: (transition: ProgramTransition) => void;
}) {
  const visualSlots = visualSlotsForScene(preview.scene);
  const audioSlots = (['audio_host', 'audio_screen', 'audio_atmosphere'] as const)
    .filter((slot) => sources.some((source) => sourceFitsSlot(slot, source)
      && isProgramSourceUsable(source)));
  const assignableSlots = [...visualSlots, ...audioSlots.filter((slot) => !visualSlots.includes(slot))];
  const recommended = PROGRAM_SCENE_MANIFEST.filter((entry) => entry.core);
  const categoryEntries = (category: ProgramSceneCategory) => PROGRAM_SCENE_MANIFEST
    .filter((entry) => entry.category === category && !entry.core);
  return (
    <div className="stack-md">
      <SceneGroup title={CATEGORY_LABELS.recommended} entries={recommended}
        preview={preview} sources={sources} onScene={onScene} />
      {(['conversation', 'presentation', 'intermission'] as const).map((category) => (
        <SceneGroup key={category} title={CATEGORY_LABELS[category]}
          entries={categoryEntries(category)} preview={preview} sources={sources} onScene={onScene} />
      ))}
      <details className="scene-advanced">
        <summary>Advanced programme moments</summary>
        <SceneGroup title={CATEGORY_LABELS.advanced} entries={categoryEntries('advanced')}
          preview={preview} sources={sources} onScene={onScene} />
      </details>
      {assignableSlots.length ? <div className="assignment-grid">
        {assignableSlots.map((slot) => <label className="field-label" key={slot}>
          {slot.replaceAll('_', ' ')}
          <select value={preview.sourceAssignments[slot] ?? ''}
            onChange={(event) => onAssignment(slot, event.target.value || null)}>
            <option value="">Choose source</option>
            {sources.filter((source) => sourceFitsSlot(slot, source)
              && isProgramSourceUsable(source)).map((source) => (
              <option key={source.id} value={source.key}>{source.key} · {source.readiness}</option>
            ))}
          </select>
        </label>)}</div> : null}
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
            <option value="auto">Auto</option><option value="cut">Cut</option><option value="fade">Fade</option>
          </select>
        </label>
      </div>
    </div>
  );
}
