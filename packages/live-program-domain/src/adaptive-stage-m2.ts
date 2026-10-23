import {
  LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT,
  LIVE_STANDARD_STAGE_PUBLISHER_LIMIT,
  type ProgramRegion,
  type ProgramSourceAssignments,
  type ProgramSourceSlot,
  type ProgramTargetCanvas,
} from './contracts.ts';

export const ADAPTIVE_STAGE_M2_FLAG_NAMES = {
  enabled: 'adaptive_stage_m2_enabled',
  stageIntelligence: 'adaptive_stage_m2_stage_intelligence_enabled',
  focusEngine: 'adaptive_stage_m2_focus_engine_enabled',
  morph: 'adaptive_stage_m2_morph_enabled',
  screenLayouts: 'adaptive_stage_m2_screen_layouts_enabled',
  quickConnectChoreography: 'adaptive_stage_m2_quick_connect_choreography_enabled',
} as const;

export type AdaptiveStageM2Flags = {
  enabled: boolean;
  stageIntelligence: boolean;
  focusEngine: boolean;
  morph: boolean;
  screenLayouts: boolean;
  quickConnectChoreography: boolean;
};

export const ADAPTIVE_STAGE_M2_SAFE_DEFAULTS: AdaptiveStageM2Flags = Object.freeze({
  enabled: false,
  stageIntelligence: false,
  focusEngine: false,
  morph: false,
  screenLayouts: false,
  quickConnectChoreography: false,
});

export const EDITORIAL_INTENTS_V2 = [
  'solo_focus',
  'balanced_conversation',
  'host_led_discussion',
  'speaker_focus',
  'panel_discussion',
  'match_introduction',
  'pair_focus',
  'pair_forming',
  'active_pair',
  'host_plus_pool',
  'pool_focus',
  'pool_rebuilding',
  'screen_presentation',
  'screen_plus_speaker',
  'screen_plus_pair',
  'screen_plus_panel',
  'screen_discussion',
  'screen_plus_pool',
  'audience_pulse',
  'odo_stage',
  'safe_intermission',
  'music_intermission',
  'closing',
] as const;
export type EditorialIntentV2 = (typeof EDITORIAL_INTENTS_V2)[number];

export const ON_AIR_PROGRAMME_ROLES_V2 = [
  'primary_host',
  'co_host',
  'guest',
  'current_pair_a',
  'current_pair_b',
  'presenter',
  'dj',
  'active_speaker',
  'screen_presenter',
] as const;
export type OnAirProgrammeRoleV2 = (typeof ON_AIR_PROGRAMME_ROLES_V2)[number];

export const EDITORIAL_PEOPLE_LAYOUT_STRATEGIES_V2 = [
  'solo_cinematic',
  'solo_host',
  'solo_presentation_support',
  'balanced_duo',
  'host_guest_interview',
  'speaker_focus_duo',
  'match_pair',
  'balanced_trio',
  'host_hero_plus_2',
  'speaker_focus_trio',
  'pair_plus_host',
  'classic_2x2',
  'host_hero_plus_3',
  'speaker_hero_plus_3',
  'balanced_panel_4',
  'host_hero_plus_4',
  'balanced_five',
  'speaker_plus_4',
  'editorial_five',
  'balanced_six',
  'host_led_six',
  'speaker_focus_six',
  'event_panel_six',
] as const;
export type EditorialPeopleLayoutStrategyV2 =
  (typeof EDITORIAL_PEOPLE_LAYOUT_STRATEGIES_V2)[number];

export type EditorialPeopleCanvasV2 = Extract<
  ProgramTargetCanvas,
  'portrait_9_16' | 'landscape_16_9'
>;

type GeometryFamily = 'balanced' | 'hero';
type AuthoredRect = readonly [x: number, y: number, width: number, height: number];

export type EditorialLayoutBookEntryV2 = {
  strategy: EditorialPeopleLayoutStrategyV2;
  occupancy: 1 | 2 | 3 | 4 | 5 | 6;
  geometryFamily: GeometryFamily;
  primaryRole: 'none' | 'host' | 'speaker' | 'pair' | 'presenter';
};

const authored = (
  strategy: EditorialPeopleLayoutStrategyV2,
  occupancy: EditorialLayoutBookEntryV2['occupancy'],
  geometryFamily: GeometryFamily,
  primaryRole: EditorialLayoutBookEntryV2['primaryRole'],
): EditorialLayoutBookEntryV2 => ({ strategy, occupancy, geometryFamily, primaryRole });

export const EDITORIAL_PEOPLE_LAYOUT_BOOK_V2: readonly EditorialLayoutBookEntryV2[] = [
  authored('solo_cinematic', 1, 'balanced', 'none'),
  authored('solo_host', 1, 'hero', 'host'),
  authored('solo_presentation_support', 1, 'hero', 'presenter'),
  authored('balanced_duo', 2, 'balanced', 'none'),
  authored('host_guest_interview', 2, 'hero', 'host'),
  authored('speaker_focus_duo', 2, 'hero', 'speaker'),
  authored('match_pair', 2, 'balanced', 'pair'),
  authored('balanced_trio', 3, 'balanced', 'none'),
  authored('host_hero_plus_2', 3, 'hero', 'host'),
  authored('speaker_focus_trio', 3, 'hero', 'speaker'),
  authored('pair_plus_host', 3, 'hero', 'pair'),
  authored('classic_2x2', 4, 'balanced', 'none'),
  authored('host_hero_plus_3', 4, 'hero', 'host'),
  authored('speaker_hero_plus_3', 4, 'hero', 'speaker'),
  authored('balanced_panel_4', 4, 'balanced', 'none'),
  authored('host_hero_plus_4', 5, 'hero', 'host'),
  authored('balanced_five', 5, 'balanced', 'none'),
  authored('speaker_plus_4', 5, 'hero', 'speaker'),
  authored('editorial_five', 5, 'hero', 'presenter'),
  authored('balanced_six', 6, 'balanced', 'none'),
  authored('host_led_six', 6, 'hero', 'host'),
  authored('speaker_focus_six', 6, 'hero', 'speaker'),
  authored('event_panel_six', 6, 'balanced', 'none'),
];

const BALANCED_PORTRAIT: Record<number, readonly AuthoredRect[]> = {
  1: [[0, 0, 1, 1]],
  2: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
  3: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]],
  4: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  5: [[0, 0, 0.5, 0.4], [0.5, 0, 0.5, 0.4], [0, 0.4, 1 / 3, 0.6], [1 / 3, 0.4, 1 / 3, 0.6], [2 / 3, 0.4, 1 / 3, 0.6]],
  6: [[0, 0, 0.5, 1 / 3], [0.5, 0, 0.5, 1 / 3], [0, 1 / 3, 0.5, 1 / 3], [0.5, 1 / 3, 0.5, 1 / 3], [0, 2 / 3, 0.5, 1 / 3], [0.5, 2 / 3, 0.5, 1 / 3]],
};

const BALANCED_LANDSCAPE: Record<number, readonly AuthoredRect[]> = {
  1: [[0, 0, 1, 1]],
  2: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
  3: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]],
  4: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  5: [[0, 0, 1 / 3, 0.5], [1 / 3, 0, 1 / 3, 0.5], [2 / 3, 0, 1 / 3, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  6: [[0, 0, 1 / 3, 0.5], [1 / 3, 0, 1 / 3, 0.5], [2 / 3, 0, 1 / 3, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]],
};

const HERO_PORTRAIT: Record<number, readonly AuthoredRect[]> = {
  1: [[0, 0, 1, 1]],
  2: [[0, 0, 1, 0.62], [0, 0.62, 1, 0.38]],
  3: [[0, 0, 1, 0.58], [0, 0.58, 0.5, 0.42], [0.5, 0.58, 0.5, 0.42]],
  4: [[0, 0, 1, 0.52], [0, 0.52, 1 / 3, 0.48], [1 / 3, 0.52, 1 / 3, 0.48], [2 / 3, 0.52, 1 / 3, 0.48]],
  5: [[0, 0, 1, 0.42], [0, 0.42, 0.5, 0.29], [0.5, 0.42, 0.5, 0.29], [0, 0.71, 0.5, 0.29], [0.5, 0.71, 0.5, 0.29]],
  6: [[0, 0, 1, 0.34], [0, 0.34, 0.5, 0.33], [0.5, 0.34, 0.5, 0.33], [0, 0.67, 1 / 3, 0.33], [1 / 3, 0.67, 1 / 3, 0.33], [2 / 3, 0.67, 1 / 3, 0.33]],
};

const HERO_LANDSCAPE: Record<number, readonly AuthoredRect[]> = {
  1: [[0, 0, 1, 1]],
  2: [[0, 0, 0.64, 1], [0.64, 0, 0.36, 1]],
  3: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]],
  4: [[0, 0, 0.55, 1], [0.55, 0, 0.45, 1 / 3], [0.55, 1 / 3, 0.45, 1 / 3], [0.55, 2 / 3, 0.45, 1 / 3]],
  5: [[0, 0, 0.5, 1], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]],
  6: [[0, 0, 0.42, 1], [0.42, 0, 0.29, 0.5], [0.71, 0, 0.29, 0.5], [0.42, 0.5, 0.58 / 3, 0.5], [0.42 + 0.58 / 3, 0.5, 0.58 / 3, 0.5], [0.42 + 1.16 / 3, 0.5, 0.58 / 3, 0.5]],
};

const HUMAN_SLOTS: readonly ProgramSourceSlot[] = [
  'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
];

export type ResolveEditorialPeopleLayoutV2Input = {
  flags: AdaptiveStageM2Flags;
  intent: Extract<EditorialIntentV2,
    'solo_focus' | 'balanced_conversation' | 'host_led_discussion'
    | 'speaker_focus' | 'panel_discussion' | 'match_introduction' | 'pair_focus'>;
  canvas: EditorialPeopleCanvasV2;
  assignments: ProgramSourceAssignments;
  programmeRoles?: Partial<Record<ProgramSourceSlot, OnAirProgrammeRoleV2>>;
  focusSlot?: ProgramSourceSlot | null;
  maximumPublishers: 4 | 6;
  largePanelEnabled: boolean;
};

export type EditorialPeopleLayoutV2 = {
  intent: ResolveEditorialPeopleLayoutV2Input['intent'];
  strategy: EditorialPeopleLayoutStrategyV2;
  canvas: EditorialPeopleCanvasV2;
  occupancy: 1 | 2 | 3 | 4 | 5 | 6;
  regions: readonly ProgramRegion[];
};

export type AdaptiveStageM2LayoutErrorCode =
  | 'ADAPTIVE_STAGE_M2_DISABLED'
  | 'EDITORIAL_OCCUPANCY_INVALID'
  | 'EDITORIAL_CAPACITY_EXCEEDED'
  | 'EDITORIAL_LARGE_PANEL_REQUIRED';

export class AdaptiveStageM2LayoutError extends Error {
  readonly code: AdaptiveStageM2LayoutErrorCode;

  constructor(code: AdaptiveStageM2LayoutErrorCode) {
    super(code);
    this.code = code;
    this.name = 'AdaptiveStageM2LayoutError';
  }
}

const strategyEntry = (strategy: EditorialPeopleLayoutStrategyV2): EditorialLayoutBookEntryV2 => {
  const entry = EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.find((candidate) => candidate.strategy === strategy);
  if (!entry) throw new Error(`editorial_layout_strategy_missing:${strategy}`);
  return entry;
};

const strategyFor = (
  intent: ResolveEditorialPeopleLayoutV2Input['intent'],
  occupancy: EditorialPeopleLayoutV2['occupancy'],
  assignedSlots: readonly ProgramSourceSlot[],
  roles: Partial<Record<ProgramSourceSlot, OnAirProgrammeRoleV2>>,
): EditorialPeopleLayoutStrategyV2 => {
  if (occupancy === 1) {
    const onlyRole = roles[assignedSlots[0]];
    if (onlyRole === 'presenter' || onlyRole === 'screen_presenter') {
      return 'solo_presentation_support';
    }
    return intent === 'host_led_discussion' ? 'solo_host' : 'solo_cinematic';
  }
  if (occupancy === 2) {
    if (intent === 'host_led_discussion') return 'host_guest_interview';
    if (intent === 'speaker_focus') return 'speaker_focus_duo';
    if (intent === 'match_introduction' || intent === 'pair_focus') return 'match_pair';
    return 'balanced_duo';
  }
  if (occupancy === 3) {
    if (intent === 'host_led_discussion') return 'host_hero_plus_2';
    if (intent === 'speaker_focus') return 'speaker_focus_trio';
    if (intent === 'match_introduction' || intent === 'pair_focus') return 'pair_plus_host';
    return 'balanced_trio';
  }
  if (occupancy === 4) {
    if (intent === 'host_led_discussion') return 'host_hero_plus_3';
    if (intent === 'speaker_focus') return 'speaker_hero_plus_3';
    return intent === 'panel_discussion' ? 'classic_2x2' : 'balanced_panel_4';
  }
  if (occupancy === 5) {
    if (intent === 'host_led_discussion') return 'host_hero_plus_4';
    if (intent === 'speaker_focus') return 'speaker_plus_4';
    return intent === 'panel_discussion' ? 'editorial_five' : 'balanced_five';
  }
  if (intent === 'host_led_discussion') return 'host_led_six';
  if (intent === 'speaker_focus') return 'speaker_focus_six';
  return intent === 'panel_discussion' ? 'event_panel_six' : 'balanced_six';
};

const primarySlotFor = (
  entry: EditorialLayoutBookEntryV2,
  slots: readonly ProgramSourceSlot[],
  roles: Partial<Record<ProgramSourceSlot, OnAirProgrammeRoleV2>>,
  focusSlot: ProgramSourceSlot | null | undefined,
): ProgramSourceSlot | null => {
  if (entry.primaryRole === 'none') return null;
  if (entry.primaryRole === 'speaker' && focusSlot && slots.includes(focusSlot)) return focusSlot;
  const acceptedRoles: readonly OnAirProgrammeRoleV2[] = entry.primaryRole === 'host'
    ? ['primary_host']
    : entry.primaryRole === 'speaker'
      ? ['active_speaker', 'primary_host']
      : entry.primaryRole === 'pair'
        ? ['current_pair_a', 'current_pair_b']
        : ['presenter', 'screen_presenter', 'primary_host'];
  return slots.find((slot) => acceptedRoles.includes(roles[slot] ?? 'guest'))
    ?? (entry.primaryRole === 'host' && slots.includes('host') ? 'host' : slots[0] ?? null);
};

const geometryFor = (
  entry: EditorialLayoutBookEntryV2,
  canvas: EditorialPeopleCanvasV2,
): readonly AuthoredRect[] => {
  if (entry.geometryFamily === 'hero') {
    return canvas === 'portrait_9_16'
      ? HERO_PORTRAIT[entry.occupancy]
      : HERO_LANDSCAPE[entry.occupancy];
  }
  return canvas === 'portrait_9_16'
    ? BALANCED_PORTRAIT[entry.occupancy]
    : BALANCED_LANDSCAPE[entry.occupancy];
};

export const resolveEditorialPeopleLayoutV2 = (
  input: ResolveEditorialPeopleLayoutV2Input,
): EditorialPeopleLayoutV2 => {
  if (!input.flags.enabled) throw new AdaptiveStageM2LayoutError('ADAPTIVE_STAGE_M2_DISABLED');
  const assignedSlots = HUMAN_SLOTS.filter((slot) => Boolean(input.assignments[slot]));
  if (assignedSlots.length < 1 || assignedSlots.length > LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT) {
    throw new AdaptiveStageM2LayoutError('EDITORIAL_OCCUPANCY_INVALID');
  }
  if (assignedSlots.length > input.maximumPublishers) {
    throw new AdaptiveStageM2LayoutError('EDITORIAL_CAPACITY_EXCEEDED');
  }
  if (assignedSlots.length > LIVE_STANDARD_STAGE_PUBLISHER_LIMIT
    && (input.maximumPublishers !== LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT || !input.largePanelEnabled)) {
    throw new AdaptiveStageM2LayoutError('EDITORIAL_LARGE_PANEL_REQUIRED');
  }
  const occupancy = assignedSlots.length as EditorialPeopleLayoutV2['occupancy'];
  const roles = input.programmeRoles ?? {};
  const strategy = strategyFor(input.intent, occupancy, assignedSlots, roles);
  const entry = strategyEntry(strategy);
  const primarySlot = primarySlotFor(
    entry,
    assignedSlots,
    roles,
    input.focusSlot,
  );
  const orderedSlots = primarySlot
    ? [primarySlot, ...assignedSlots.filter((slot) => slot !== primarySlot)]
    : assignedSlots;
  const geometry = geometryFor(entry, input.canvas);
  return {
    intent: input.intent,
    strategy,
    canvas: input.canvas,
    occupancy,
    regions: geometry.map(([x, y, width, height], index): ProgramRegion => ({
      slot: orderedSlots[index],
      x,
      y,
      width,
      height,
      zIndex: index === 0 && entry.geometryFamily === 'hero' ? 2 : 1,
      treatment: index === 0 && entry.geometryFamily === 'hero' ? 'full' : 'panel',
    })),
  };
};
