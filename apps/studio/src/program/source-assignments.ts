import {
  visualSlotsForScene,
  type ProgramPreviewState,
  type ProgramScene,
  type ProgramSource,
  type ProgramSourceSlot,
} from '@betweener/live-program-domain';

export const sourceFitsSlot = (slot: ProgramSourceSlot, source: ProgramSource): boolean => {
  switch (slot) {
    case 'primary': return source.type === 'screen_share';
    case 'host': return source.type === 'host_camera';
    case 'guest_1':
    case 'guest_2':
    case 'guest_3': return source.type === 'participant_camera';
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

const isUsable = (source: ProgramSource): boolean =>
  ['ready', 'live'].includes(source.readiness) && source.health !== 'lost';

const VISUAL_SLOTS: readonly ProgramSourceSlot[] = [
  'primary', 'host', 'guest_1', 'guest_2', 'guest_3', 'pair', 'pool', 'pulse', 'odo', 'pip',
];

const sourcePriority = (
  scene: ProgramScene,
  slot: ProgramSourceSlot,
  source: ProgramSource,
): number => {
  if (slot !== 'odo') return 0;
  if (scene === 'branded_intermission') return source.type === 'branded_visual' ? 0 : 1;
  return source.type === 'odo_stage' ? 0 : 1;
};

export const assignmentsForScene = (
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
    const isPanelSlot = ['host', 'guest_1', 'guest_2', 'guest_3'].includes(slot);
    const existing = sources.find((source) => source.key === next[slot]);
    const existingIsDistinct = existing && !usedKeys.has(existing.key)
      && (!isPanelSlot || !existing.ownerUserId || !usedOwners.has(existing.ownerUserId));
    const selected = existing && sourceFitsSlot(slot, existing) && isUsable(existing)
      && existingIsDistinct
      ? existing
      : [...sources]
        .sort((left, right) => sourcePriority(scene, slot, left) - sourcePriority(scene, slot, right))
        .find((source) => sourceFitsSlot(slot, source) && isUsable(source)
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
  return next;
};
