import type {
  ProgramLayout,
  ProgramRegion,
  ProgramScene,
  ProgramSourceAssignments,
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
  panel_focus: [
    region('host', 0, 0, 1 / 3, 0.5),
    region('guest_1', 1 / 3, 0, 1 / 3, 0.5),
    region('guest_2', 2 / 3, 0, 1 / 3, 0.5),
    region('guest_3', 0, 0.5, 1 / 3, 0.5),
    region('guest_4', 1 / 3, 0.5, 1 / 3, 0.5),
    region('guest_5', 2 / 3, 0.5, 1 / 3, 0.5),
  ],
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
    region('host', 0.7, 0, 0.3, 1 / 6),
    region('guest_1', 0.7, 1 / 6, 0.3, 1 / 6),
    region('guest_2', 0.7, 2 / 6, 0.3, 1 / 6),
    region('guest_3', 0.7, 3 / 6, 0.3, 1 / 6),
    region('guest_4', 0.7, 4 / 6, 0.3, 1 / 6),
    region('guest_5', 0.7, 5 / 6, 0.3, 1 / 6),
  ],
  screen_discussion: [
    region('primary', 0, 0, 1, 0.62, 1, 'full'),
    region('host', 0, 0.62, 1 / 6, 0.38),
    region('guest_1', 1 / 6, 0.62, 1 / 6, 0.38),
    region('guest_2', 2 / 6, 0.62, 1 / 6, 0.38),
    region('guest_3', 3 / 6, 0.62, 1 / 6, 0.38),
    region('guest_4', 4 / 6, 0.62, 1 / 6, 0.38),
    region('guest_5', 5 / 6, 0.62, 1 / 6, 0.38),
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

const portraitPresentation = (
  scene: ProgramScene,
  regions: readonly ProgramRegion[],
): readonly ProgramRegion[] => {
  const screenDominantSplit = 0.68;
  const screenDiscussionSplit = 0.44;

  return regions.map((item) => {
    if (item.treatment === 'audio') return item;

    if (item.slot === 'primary') {
      if (scene === 'screen_full' || scene === 'screen_plus_host' || scene === 'screen_plus_odo') {
        return { ...item, x: 0, y: 0, width: 1, height: 1 };
      }
      if (scene === 'screen_discussion') {
        return { ...item, x: 0, y: 0, width: 1, height: screenDiscussionSplit };
      }
      return { ...item, x: 0, y: 0, width: 1, height: screenDominantSplit };
    }

    if (item.treatment === 'pip') {
      return { ...item, x: 0.58, y: 0.68, width: 0.38, height: 0.28 };
    }

    if (scene === 'screen_plus_pair'
      || scene === 'screen_plus_pool'
      || scene === 'screen_plus_audience_pulse') {
      return {
        ...item,
        x: 0,
        y: screenDominantSplit,
        width: 1,
        height: 1 - screenDominantSplit,
      };
    }

    if (scene === 'screen_plus_panel' || scene === 'screen_discussion') {
      const panelOrder = ['host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5']
        .indexOf(item.slot);
      const order = Math.max(panelOrder, 0);
      const y = scene === 'screen_discussion' ? screenDiscussionSplit : screenDominantSplit;
      return { ...item, x: order / 6, y, width: 1 / 6, height: 1 - y };
    }

    return item;
  });
};

export const resolveProgramLayout = (
  scene: ProgramScene,
  canvas: ProgramTargetCanvas,
): ProgramLayout => {
  const base = CONVERSATION_LAYOUTS[scene] ?? PRESENTATION_LAYOUTS[scene] ?? [];
  const regions = canvas === 'portrait_9_16' && PRESENTATION_LAYOUTS[scene]
    ? portraitPresentation(scene, base)
    : base;
  return { scene, canvas, regions };
};

const PANEL_SLOTS: readonly ProgramSourceSlot[] = [
  'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
];

export const visualSlotsForScene = (scene: ProgramScene): readonly ProgramSourceSlot[] => {
  const regions = CONVERSATION_LAYOUTS[scene] ?? PRESENTATION_LAYOUTS[scene] ?? [];
  return [...new Set(regions
    .filter((item) => item.treatment !== 'audio')
    .map((item) => item.slot))];
};

/**
 * Removes unused optional panel positions and lets the people who are actually
 * assigned share the available stage space. Required positions stay visible so
 * Preview can still explain an incomplete scene.
 */
export const resolveAssignedProgramLayout = (
  scene: ProgramScene,
  canvas: ProgramTargetCanvas,
  assignments: ProgramSourceAssignments,
): ProgramLayout => {
  const layout = resolveProgramLayout(scene, canvas);
  if (scene !== 'panel_focus' && scene !== 'screen_discussion' && scene !== 'screen_plus_panel') {
    return layout;
  }

  const required = new Set(requiredSlotsForScene(scene));
  const participants = layout.regions.filter((item) => PANEL_SLOTS.includes(item.slot)
    && (required.has(item.slot) || Boolean(assignments[item.slot])));
  if (scene === 'panel_focus') {
    const columns = canvas === 'portrait_9_16' ? 2 : participants.length <= 4 ? 2 : 3;
    const rows = Math.max(1, Math.ceil(participants.length / columns));
    return {
      ...layout,
      regions: participants.map((item, index) => ({
        ...item,
        x: (index % columns) / columns,
        y: Math.floor(index / columns) / rows,
        width: 1 / columns,
        height: 1 / rows,
      })),
    };
  }
  const largePanel = participants.length > 4;
  const participantStart = canvas === 'portrait_9_16'
    ? scene === 'screen_discussion' ? 0.44 : largePanel ? 0.5 : 0.68
    : scene === 'screen_discussion' || largePanel ? 0.62 : 0;
  const retained = layout.regions
    .filter((item) => !PANEL_SLOTS.includes(item.slot))
    .map((item) => scene === 'screen_discussion' && item.slot === 'primary'
      ? { ...item, height: participantStart }
      : item);

  const participantRegions = participants.map((item, index) => {
    if (scene === 'screen_discussion' || canvas === 'portrait_9_16' || largePanel) {
      const y = participantStart;
      const columns = participants.length > 4 ? 3
        : canvas === 'portrait_9_16' && participants.length >= 4 ? 2
        : participants.length;
      const rows = Math.max(1, Math.ceil(participants.length / columns));
      return {
        ...item,
        x: (index % columns) / columns,
        y: y + Math.floor(index / columns) * ((1 - y) / rows),
        width: 1 / columns,
        height: (1 - y) / rows,
      };
    }
    return {
      ...item,
      x: 0.7,
      y: index / participants.length,
      width: 0.3,
      height: 1 / participants.length,
    };
  });

  return { ...layout, regions: [...retained, ...participantRegions] };
};

export const requiredSlotsForScene = (scene: ProgramScene): readonly ProgramSourceSlot[] => {
  switch (scene) {
    case 'host_focus': return ['host'];
    case 'panel_focus': return ['host'];
    case 'host_plus_pool': return ['host', 'pool'];
    case 'pool_focus':
    case 'pair_forming': return ['pool'];
    case 'quick_connect_active': return ['pair'];
    case 'audience_pulse': return ['pulse'];
    case 'conversation_topic':
    case 'odo_stage':
    case 'music_intermission':
    case 'branded_intermission':
    case 'session_closing': return ['odo'];
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
