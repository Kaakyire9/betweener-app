import type {
  ProgramPreviewState,
  ProgramScene,
  ProgramSource,
  ProgramSourceSlot,
  ProgramTargetCanvas,
} from './contracts.ts';
import { requiredSlotsForScene, visualSlotsForScene } from './layout.ts';

export type ProgramSceneCategory = 'conversation' | 'presentation' | 'intermission' | 'advanced';

export type ProgramSceneManifestEntry = {
  scene: ProgramScene;
  label: string;
  description: string;
  category: ProgramSceneCategory;
  core: boolean;
  mobileQuick: boolean;
  supportedCanvases: readonly ProgramTargetCanvas[];
};
const ALL_CANVASES: readonly ProgramTargetCanvas[] = [
  'portrait_9_16', 'landscape_16_9', 'square_1_1',
];

const entry = (
  scene: ProgramScene,
  label: string,
  description: string,
  category: ProgramSceneCategory,
  options: { core?: boolean; mobileQuick?: boolean } = {},
): ProgramSceneManifestEntry => ({
  scene,
  label,
  description,
  category,
  core: options.core === true,
  mobileQuick: options.mobileQuick === true,
  supportedCanvases: ALL_CANVASES,
});

export const PROGRAM_SCENE_MANIFEST: readonly ProgramSceneManifestEntry[] = [
  entry('host_focus', 'Speaker focus', 'One speaker fills the programme.', 'conversation', { core: true, mobileQuick: true }),
  entry('panel_focus', 'Panel', 'Two to six people share an adaptive stage.', 'conversation', { core: true, mobileQuick: true }),
  entry('host_plus_pool', 'Host + room', 'Host above the Quick Connect pool.', 'advanced'),
  entry('pool_focus', 'Room focus', 'Quick Connect pool fills the programme.', 'advanced'),
  entry('pair_forming', 'Pair forming', 'The room sees the next connection forming.', 'advanced'),
  entry('quick_connect_active', 'Active pair', 'The current pair fills the programme.', 'conversation'),
  entry('audience_pulse', 'Audience pulse', 'Show the live room pulse.', 'advanced'),
  entry('conversation_topic', 'Conversation topic', 'Show the current Odo conversation prompt.', 'advanced'),
  entry('odo_stage', 'Odo moment', 'Bring Odo onto the programme.', 'advanced'),
  entry('music_intermission', 'Music intermission', 'A protected music break.', 'intermission'),
  entry('branded_intermission', 'Safe intermission', 'A branded safe scene with no guest video.', 'intermission', { core: true, mobileQuick: true }),
  entry('session_closing', 'Closing', 'A calm branded closing moment.', 'intermission'),
  entry('screen_full', 'Screen', 'Screen share fills the programme.', 'presentation', { core: true, mobileQuick: true }),
  entry('screen_plus_host', 'Screen + speaker', 'Screen share with a speaker picture-in-picture.', 'presentation', { core: true, mobileQuick: true }),
  entry('screen_plus_pair', 'Screen + pair', 'Screen share beside the active pair.', 'presentation'),
  entry('screen_plus_panel', 'Screen + panel', 'Screen share with up to six speakers.', 'presentation', { core: true, mobileQuick: true }),
  entry('screen_discussion', 'Screen discussion', 'Screen above a responsive speaker grid.', 'presentation'),
  entry('screen_plus_pool', 'Screen + room', 'Screen share above the Quick Connect pool.', 'advanced'),
  entry('screen_plus_audience_pulse', 'Screen + pulse', 'Screen share beside the room pulse.', 'advanced'),
  entry('screen_plus_odo', 'Screen + Odo', 'Screen share with Odo picture-in-picture.', 'advanced'),
  entry('dj_plus_pool', 'DJ + room', 'Live DJ audio over the Quick Connect pool.', 'advanced'),
];

export const programSceneManifest = (scene: ProgramScene): ProgramSceneManifestEntry => {
  const manifest = PROGRAM_SCENE_MANIFEST.find((candidate) => candidate.scene === scene);
  if (!manifest) throw new Error(`program_scene_manifest_missing:${scene}`);
  return manifest;
};
export const sourceFitsProgramSlot = (
  slot: ProgramSourceSlot,
  source: ProgramSource,
): boolean => {
  switch (slot) {
    case 'primary': return source.type === 'screen_share';
    case 'host': return source.type === 'host_camera';
    case 'guest_1':
    case 'guest_2':
    case 'guest_3':
    case 'guest_4':
    case 'guest_5': return source.type === 'participant_camera';
    case 'pair': return source.type === 'active_pair';
    case 'pool': return source.type === 'quick_connect_pool';
    case 'pulse': return source.type === 'audience_pulse';
    case 'odo': return source.type === 'odo_stage' || source.type === 'branded_visual';
    case 'audio_atmosphere': return source.type === 'dj_audio' || source.type === 'programme_music';
    case 'audio_host': return source.type === 'host_microphone';
    case 'audio_screen': return source.type === 'screen_share_audio';
    default: return false;
  }
};
export const isProgramSourceUsable = (source: ProgramSource): boolean =>
  ['ready', 'live'].includes(source.readiness) && source.health !== 'lost';

const sourcePriority = (
  scene: ProgramScene,
  slot: ProgramSourceSlot,
  source: ProgramSource,
): number => {
  if (slot !== 'odo') return 0;
  if (scene === 'branded_intermission') return source.type === 'branded_visual' ? 0 : 1;
  return source.type === 'odo_stage' ? 0 : 1;
};
const VISUAL_SLOTS: readonly ProgramSourceSlot[] = [
  'primary', 'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
  'pair', 'pool', 'pulse', 'odo', 'pip',
];

export const assignmentsForProgramScene = (
  scene: ProgramScene,
  sources: readonly ProgramSource[],
  current: ProgramPreviewState['sourceAssignments'],
): ProgramPreviewState['sourceAssignments'] => {
  const next = { ...current };
  const sceneSlots = visualSlotsForScene(scene);
  VISUAL_SLOTS.filter((slot) => !sceneSlots.includes(slot)).forEach((slot) => delete next[slot]);
  const usedKeys = new Set<string>();
  const usedOwners = new Set<string>();

  sceneSlots.forEach((slot) => {
    const isPanelSlot = ['host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5']
      .includes(slot);
    const existing = sources.find((source) => source.key === next[slot]);
    const existingIsDistinct = existing && !usedKeys.has(existing.key)
      && (!isPanelSlot || !existing.ownerUserId || !usedOwners.has(existing.ownerUserId));
    const selected = existing && sourceFitsProgramSlot(slot, existing)
      && isProgramSourceUsable(existing) && existingIsDistinct
      ? existing
      : [...sources]
        .sort((left, right) => sourcePriority(scene, slot, left) - sourcePriority(scene, slot, right))
        .find((source) => sourceFitsProgramSlot(slot, source) && isProgramSourceUsable(source)
          && !usedKeys.has(source.key)
          && (!isPanelSlot || !source.ownerUserId || !usedOwners.has(source.ownerUserId)));

    if (selected) {
      next[slot] = selected.key;
      usedKeys.add(selected.key);
      if (isPanelSlot && selected.ownerUserId) usedOwners.add(selected.ownerUserId);
    } else {
      delete next[slot];
    }
  });

  if (scene === 'host_focus' && !next.host) next.host = 'server.host';
  if (scene === 'pool_focus' && !next.pool) next.pool = 'server.pool';
  if (scene === 'quick_connect_active' && !next.pair) next.pair = 'server.pair';
  if (scene === 'audience_pulse' && !next.pulse) next.pulse = 'server.pulse';
  if (['odo_stage', 'conversation_topic', 'music_intermission', 'branded_intermission', 'session_closing']
    .includes(scene) && !next.odo) next.odo = scene === 'branded_intermission'
      ? 'server.brand' : 'server.odo';
  if (scene.startsWith('screen_')) {
    const screenAudio = sources.find((source) => sourceFitsProgramSlot('audio_screen', source)
      && isProgramSourceUsable(source));
    if (screenAudio) next.audio_screen = screenAudio.key;
    else delete next.audio_screen;
  } else {
    delete next.audio_screen;
  }
  return next;
};

export type ProgramSceneAvailability = {
  available: boolean;
  assignments: ProgramPreviewState['sourceAssignments'];
  missingSlots: readonly ProgramSourceSlot[];
  reason: string | null;
};

export const programSceneAvailability = (
  scene: ProgramScene,
  canvas: ProgramTargetCanvas,
  sources: readonly ProgramSource[],
  current: ProgramPreviewState['sourceAssignments'],
): ProgramSceneAvailability => {
  const manifest = programSceneManifest(scene);
  const assignments = assignmentsForProgramScene(scene, sources, current);
  if (!manifest.supportedCanvases.includes(canvas)) {
    return { available: false, assignments, missingSlots: [], reason: 'Not supported on this canvas' };
  }
  const missingSlots = requiredSlotsForScene(scene)
    .filter((slot) => !assignments[slot]);
  return {
    available: missingSlots.length === 0,
    assignments,
    missingSlots,
    reason: missingSlots.length ? `Connect ${missingSlots.join(', ').replaceAll('_', ' ')}` : null,
  };
};
