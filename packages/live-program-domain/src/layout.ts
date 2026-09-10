import type {
  ProgramLayout,
  ProgramRegion,
  ProgramScene,
  ProgramSourceSlot,
  ProgramTargetCanvas,
} from './contracts.ts';

const region = (
  slot: ProgramSourceSlot,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex = 1,
  treatment: ProgramRegion['treatment'] = 'panel',
): ProgramRegion => ({ slot, x, y, width, height, zIndex, treatment });

const CONVERSATION_LAYOUTS: Partial<Record<ProgramScene, readonly ProgramRegion[]>> = {
  host_focus: [region('host', 0, 0, 1, 1, 1, 'full')],
  host_plus_pool: [
    region('host', 0, 0, 1, 0.5),
    region('pool', 0, 0.5, 1, 0.5),
  ],
  pool_focus: [region('pool', 0, 0, 1, 1, 1, 'full')],
  pair_forming: [region('pool', 0, 0, 1, 1, 1, 'full')],
  quick_connect_active: [region('pair', 0, 0, 1, 1, 1, 'full')],
  audience_pulse: [region('pulse', 0, 0, 1, 1, 1, 'full')],
  conversation_topic: [region('odo', 0, 0, 1, 1, 1, 'full')],
  odo_stage: [region('odo', 0, 0, 1, 1, 1, 'full')],
  music_intermission: [region('odo', 0, 0, 1, 1, 1, 'full')],
  branded_intermission: [region('odo', 0, 0, 1, 1, 1, 'full')],
  session_closing: [region('odo', 0, 0, 1, 1, 1, 'full')],
};

const PRESENTATION_LAYOUTS: Partial<Record<ProgramScene, readonly ProgramRegion[]>> = {
  screen_full: [region('primary', 0, 0, 1, 1, 1, 'full')],
  screen_plus_host: [
    region('primary', 0, 0, 1, 1, 1, 'full'),
    region('host', 0.7, 0.7, 0.27, 0.27, 2, 'pip'),
  ],
  screen_plus_pair: [
    region('primary', 0, 0, 0.72, 1, 1, 'full'),
    region('pair', 0.72, 0, 0.28, 1, 2, 'strip'),
  ],
  screen_plus_panel: [
    region('primary', 0, 0, 0.7, 1, 1, 'full'),
    region('host', 0.7, 0, 0.3, 0.25),
    region('guest_1', 0.7, 0.25, 0.3, 0.25),
    region('guest_2', 0.7, 0.5, 0.3, 0.25),
    region('guest_3', 0.7, 0.75, 0.3, 0.25),
  ],
  screen_discussion: [
    region('primary', 0, 0, 1, 0.62, 1, 'full'),
    region('host', 0, 0.62, 0.25, 0.38),
    region('guest_1', 0.25, 0.62, 0.25, 0.38),
    region('guest_2', 0.5, 0.62, 0.25, 0.38),
    region('guest_3', 0.75, 0.62, 0.25, 0.38),
  ],
  screen_plus_pool: [
    region('primary', 0, 0, 1, 0.68, 1, 'full'),
    region('pool', 0, 0.68, 1, 0.32, 2, 'strip'),
  ],
  screen_plus_audience_pulse: [
    region('primary', 0, 0, 0.72, 1, 1, 'full'),
    region('pulse', 0.72, 0, 0.28, 1, 2, 'strip'),
  ],
  screen_plus_odo: [
    region('primary', 0, 0, 1, 1, 1, 'full'),
    region('odo', 0.68, 0.7, 0.29, 0.27, 2, 'pip'),
  ],
  dj_plus_pool: [
    region('host', 0, 0, 1, 0.62, 1, 'full'),
    region('pool', 0, 0.62, 1, 0.38, 2, 'strip'),
    region('audio_atmosphere', 0, 0, 0, 0, 0, 'audio'),
  ],
};

export const isStudioPresentationScene = (scene: ProgramScene): boolean =>
  Object.prototype.hasOwnProperty.call(PRESENTATION_LAYOUTS, scene);

const portraitPresentation = (regions: readonly ProgramRegion[]): readonly ProgramRegion[] =>
  regions.map((item) => {
    if (item.treatment === 'audio') return item;
    if (item.slot === 'primary' && item.width >= 0.7) {
      return { ...item, x: 0, y: 0, width: 1, height: item.height > 0.7 ? 0.72 : 0.62 };
    }
    if (item.treatment === 'pip') {
      return { ...item, x: 0.58, y: 0.68, width: 0.38, height: 0.28 };
    }
    if (item.x >= 0.68) {
      const order = item.slot === 'host' ? 0 : item.slot === 'guest_1' ? 1
        : item.slot === 'guest_2' ? 2 : 3;
      return { ...item, x: order * 0.25, y: 0.72, width: 0.25, height: 0.28 };
    }
    return item;
  });

export const resolveProgramLayout = (
  scene: ProgramScene,
  canvas: ProgramTargetCanvas,
): ProgramLayout => {
  const base = CONVERSATION_LAYOUTS[scene] ?? PRESENTATION_LAYOUTS[scene] ?? [];
  const regions = canvas === 'portrait_9_16' && PRESENTATION_LAYOUTS[scene]
    ? portraitPresentation(base)
    : base;
  return { scene, canvas, regions };
};

export const requiredSlotsForScene = (scene: ProgramScene): readonly ProgramSourceSlot[] => {
  switch (scene) {
    case 'screen_full': return ['primary'];
    case 'screen_plus_host': return ['primary', 'host'];
    case 'screen_plus_pair': return ['primary', 'pair'];
    case 'screen_plus_panel': return ['primary', 'host'];
    case 'screen_discussion': return ['primary', 'host'];
    case 'screen_plus_pool': return ['primary', 'pool'];
    case 'screen_plus_audience_pulse': return ['primary', 'pulse'];
    case 'screen_plus_odo': return ['primary', 'odo'];
    case 'dj_plus_pool': return ['audio_atmosphere', 'pool'];
    default: return [];
  }
};

export const chooseFallbackScene = (
  failedScene: ProgramScene,
  hasHealthyHostCamera: boolean,
): ProgramScene => {
  if (failedScene.startsWith('screen_')) {
    return hasHealthyHostCamera ? 'host_focus' : 'branded_intermission';
  }
  if (failedScene === 'dj_plus_pool') return 'pool_focus';
  return hasHealthyHostCamera ? 'host_focus' : 'branded_intermission';
};
