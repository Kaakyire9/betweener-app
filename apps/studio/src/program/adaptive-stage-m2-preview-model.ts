import {
  ADAPTIVE_STAGE_M2_SAFE_DEFAULTS,
  EDITORIAL_INTENT_BY_PEOPLE_STRATEGY_V2,
  EDITORIAL_PEOPLE_LAYOUT_BOOK_V2,
  resolveEditorialPeopleStrategyLayoutV2,
  resolveEditorialScreenLayoutV2,
  resolveAssignedProgramLayout,
  type EditorialPeopleCanvasV2,
  type EditorialPeopleLayoutStrategyV2,
  type EditorialScreenLayoutStrategyV2,
  type OnAirProgrammeRoleV2,
  type ProgramRegion,
  type ProgramScene,
  type ProgramSource,
  type ProgramSourceAssignments,
  type ProgramSourceSlot,
} from '@betweener/live-program-domain';

export const M2_PREVIEW_MEDIA_STATES = [
  'ready', 'camera_off', 'reconnecting', 'degraded',
] as const;
export type M2PreviewMediaState = (typeof M2_PREVIEW_MEDIA_STATES)[number];
export type M2PreviewSourceMode = 'fixture' | 'authoritative';

export type M2PreviewRole = OnAirProgrammeRoleV2 | 'screen' | 'pool' | 'pair' | 'pulse' | 'odo' | 'music';

export type M2PreviewSource = {
  sourceKey: string;
  ownerUserId: string;
  providerUserId: string | null;
  displayName: string;
  role: M2PreviewRole;
  mediaState: M2PreviewMediaState;
  muted: boolean;
  fixture: boolean;
  presentationFit: 'cover' | 'contain';
};

export type M2PeoplePreviewModel = {
  kind: 'people';
  strategy: EditorialPeopleLayoutStrategyV2;
  intent: string;
  canvas: EditorialPeopleCanvasV2;
  occupancy: number;
  regions: readonly ProgramRegion[];
  sourcesBySlot: Readonly<Partial<Record<ProgramSourceSlot, M2PreviewSource>>>;
  fixture: boolean;
  largePanelPreview: boolean;
};

export type M2ScreenPreviewModel = {
  kind: 'screen';
  strategy: EditorialScreenLayoutStrategyV2;
  intent: string;
  canvas: EditorialPeopleCanvasV2;
  occupancy: number;
  regions: readonly ProgramRegion[];
  sourcesBySlot: Readonly<Partial<Record<ProgramSourceSlot, M2PreviewSource>>>;
  fixture: true;
  largePanelPreview: boolean;
};

export const M2_EDITORIAL_MOMENT_STRATEGIES = [
  'host_plus_pool',
  'pool_focus',
  'pair_forming',
  'active_pair',
  'audience_pulse',
  'odo_stage',
  'music_intermission',
  'closing',
] as const;
export type M2EditorialMomentStrategy = (typeof M2_EDITORIAL_MOMENT_STRATEGIES)[number];

export type M2MomentPreviewModel = {
  kind: 'moment';
  strategy: M2EditorialMomentStrategy;
  intent: string;
  canvas: EditorialPeopleCanvasV2;
  occupancy: number;
  regions: readonly ProgramRegion[];
  sourcesBySlot: Readonly<Partial<Record<ProgramSourceSlot, M2PreviewSource>>>;
  fixture: true;
  largePanelPreview: false;
};

export type M2PreviewModel = M2PeoplePreviewModel | M2ScreenPreviewModel | M2MomentPreviewModel;

export class M2PreviewModelError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
    this.name = 'M2PreviewModelError';
  }
}

const HUMAN_SLOTS: readonly ProgramSourceSlot[] = [
  'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
];
const FIXTURE_NAMES = ['Amara', 'Kojo', 'Nia', 'Malik', 'Sena', 'Zuri'] as const;

export const m2PreviewFlags = Object.freeze({
  ...ADAPTIVE_STAGE_M2_SAFE_DEFAULTS,
  enabled: true,
  studioPreview: true,
});

export const fixtureAssignmentsForOccupancy = (occupancy: number): ProgramSourceAssignments =>
  Object.fromEntries(HUMAN_SLOTS.slice(0, occupancy).map((slot, index) => [
    slot,
    `fixture.person.${index + 1}`,
  ]));

const roleForSlot = (slot: ProgramSourceSlot): OnAirProgrammeRoleV2 =>
  slot === 'host' ? 'primary_host' : slot === 'guest_1' ? 'active_speaker' : 'guest';

const fixtureSourceFor = (
  slot: ProgramSourceSlot,
  index: number,
  mediaState: M2PreviewMediaState,
): M2PreviewSource => ({
  sourceKey: `fixture.person.${index + 1}`,
  ownerUserId: `fixture-owner-${index + 1}`,
  providerUserId: null,
  displayName: FIXTURE_NAMES[index] ?? `Guest ${index}`,
  role: roleForSlot(slot),
  mediaState: index === 0 ? mediaState : 'ready',
  muted: index > 1 && index % 2 === 0,
  fixture: true,
  presentationFit: 'cover',
});

const authoritativeSourcesBySlot = (
  occupancy: number,
  assignments: ProgramSourceAssignments,
  sources: readonly ProgramSource[],
): Readonly<Partial<Record<ProgramSourceSlot, M2PreviewSource>>> => {
  const byKey = new Map(sources.map((source) => [source.key, source]));
  const result: Partial<Record<ProgramSourceSlot, M2PreviewSource>> = {};
  const seenOwners = new Set<string>();
  for (const [index, slot] of HUMAN_SLOTS.slice(0, occupancy).entries()) {
    const sourceKey = assignments[slot];
    if (!sourceKey) throw new M2PreviewModelError('MISSING_SOURCE', slot);
    const source = byKey.get(sourceKey);
    if (!source) throw new M2PreviewModelError('MISSING_SOURCE', sourceKey);
    const ownerUserId = source.ownerUserId ?? source.providerUserId;
    if (!ownerUserId || !source.providerUserId) {
      throw new M2PreviewModelError('INVALID_OWNER_IDENTITY', sourceKey);
    }
    if (seenOwners.has(ownerUserId)) {
      throw new M2PreviewModelError('DUPLICATE_OWNER_IDENTITY', ownerUserId);
    }
    seenOwners.add(ownerUserId);
    result[slot] = {
      sourceKey,
      ownerUserId,
      providerUserId: source.providerUserId,
      displayName: slot === 'host' ? 'Host' : `Guest ${index}`,
      role: roleForSlot(slot),
      mediaState: source.health === 'degraded' ? 'degraded'
        : source.health === 'lost' || source.readiness === 'preparing' ? 'reconnecting'
          : source.hasVideo ? 'ready' : 'camera_off',
      muted: source.muted,
      fixture: false,
      presentationFit: source.type === 'screen_share' ? 'contain' : 'cover',
    };
  }
  return result;
};

export const buildM2PeoplePreviewModel = (input: {
  strategy: EditorialPeopleLayoutStrategyV2;
  canvas: EditorialPeopleCanvasV2;
  mode: M2PreviewSourceMode;
  mediaState?: M2PreviewMediaState;
  assignments?: ProgramSourceAssignments;
  sources?: readonly ProgramSource[];
}): M2PeoplePreviewModel => {
  const entry = EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.find((candidate) => candidate.strategy === input.strategy);
  if (!entry) throw new M2PreviewModelError('UNKNOWN_STRATEGY', input.strategy);
  const fixture = input.mode === 'fixture';
  const assignments = fixture
    ? fixtureAssignmentsForOccupancy(entry.occupancy)
    : input.assignments ?? {};
  const sourcesBySlot = fixture
    ? Object.fromEntries(HUMAN_SLOTS.slice(0, entry.occupancy).map((slot, index) => [
      slot,
      fixtureSourceFor(slot, index, input.mediaState ?? 'ready'),
    ]))
    : authoritativeSourcesBySlot(entry.occupancy, assignments, input.sources ?? []);
  const layout = resolveEditorialPeopleStrategyLayoutV2({
    flags: m2PreviewFlags,
    strategy: input.strategy,
    canvas: input.canvas,
    assignments,
    programmeRoles: Object.fromEntries(Object.entries(sourcesBySlot).map(([slot, source]) => [
      slot,
      source?.role === 'screen' ? 'guest' : source?.role,
    ])),
    focusSlot: input.strategy.includes('speaker') ? 'guest_1' : null,
    maximumPublishers: entry.occupancy > 4 ? 6 : 4,
    largePanelEnabled: entry.occupancy > 4,
  });
  return {
    kind: 'people',
    strategy: layout.strategy,
    intent: EDITORIAL_INTENT_BY_PEOPLE_STRATEGY_V2[layout.strategy],
    canvas: layout.canvas,
    occupancy: layout.occupancy,
    regions: layout.regions,
    sourcesBySlot,
    fixture,
    largePanelPreview: layout.occupancy > 4,
  };
};

export const buildM2ScreenPreviewModel = (input: {
  strategy: EditorialScreenLayoutStrategyV2;
  canvas: EditorialPeopleCanvasV2;
  peopleCount?: number;
}): M2ScreenPreviewModel => {
  const peopleCount = input.strategy === 'screen_full' ? 0
    : input.strategy === 'screen_plus_host' ? 1
      : input.strategy === 'screen_plus_pair' ? 2
        : Math.max(1, Math.min(input.peopleCount ?? 4, 6));
  const layout = resolveEditorialScreenLayoutV2({
    flags: m2PreviewFlags,
    strategy: input.strategy,
    canvas: input.canvas,
    peopleCount,
  });
  const sourcesBySlot: Partial<Record<ProgramSourceSlot, M2PreviewSource>> = {
    primary: {
      sourceKey: 'fixture.screen.presentation',
      ownerUserId: 'fixture-presenter',
      providerUserId: null,
      displayName: 'Presentation',
      role: 'screen',
      mediaState: 'ready',
      muted: true,
      fixture: true,
      presentationFit: 'contain',
    },
  };
  layout.regions.filter((region) => region.slot !== 'primary').forEach((region, index) => {
    sourcesBySlot[region.slot] = fixtureSourceFor(region.slot, index, 'ready');
  });
  return {
    kind: 'screen',
    strategy: layout.strategy,
    intent: layout.strategy.replaceAll('_', ' '),
    canvas: layout.canvas,
    occupancy: peopleCount,
    regions: layout.regions,
    sourcesBySlot,
    fixture: true,
    largePanelPreview: peopleCount > 4,
  };
};

const MOMENT_SCENES: Readonly<Record<M2EditorialMomentStrategy, ProgramScene>> = {
  host_plus_pool: 'host_plus_pool',
  pool_focus: 'pool_focus',
  pair_forming: 'pair_forming',
  active_pair: 'quick_connect_active',
  audience_pulse: 'audience_pulse',
  odo_stage: 'odo_stage',
  music_intermission: 'music_intermission',
  closing: 'session_closing',
};

const specialSource = (
  sourceKey: string,
  displayName: string,
  role: M2PreviewRole,
): M2PreviewSource => ({
  sourceKey,
  ownerUserId: `fixture-${role}`,
  providerUserId: null,
  displayName,
  role,
  mediaState: 'ready',
  muted: true,
  fixture: true,
  presentationFit: role === 'screen' || role === 'odo' || role === 'music' ? 'contain' : 'cover',
});

export const buildM2MomentPreviewModel = (input: {
  strategy: M2EditorialMomentStrategy;
  canvas: EditorialPeopleCanvasV2;
}): M2MomentPreviewModel => {
  const scene = MOMENT_SCENES[input.strategy];
  const host = fixtureSourceFor('host', 0, 'ready');
  const sourcesBySlot: Partial<Record<ProgramSourceSlot, M2PreviewSource>> = {};
  if (input.strategy === 'host_plus_pool') {
    sourcesBySlot.host = host;
    sourcesBySlot.pool = specialSource('fixture.pool', 'Quick Connect Pool', 'pool');
  } else if (input.strategy === 'pool_focus' || input.strategy === 'pair_forming') {
    sourcesBySlot.pool = specialSource('fixture.pool', 'Quick Connect Pool', 'pool');
  } else if (input.strategy === 'active_pair') {
    sourcesBySlot.pair = specialSource('fixture.pair', 'Active Pair', 'pair');
  } else if (input.strategy === 'audience_pulse') {
    sourcesBySlot.pulse = specialSource('fixture.pulse', 'Audience Pulse', 'pulse');
  } else {
    const role = input.strategy === 'music_intermission' ? 'music' : 'odo';
    sourcesBySlot.odo = specialSource(`fixture.${role}`, input.strategy === 'closing'
      ? 'Closing Moment' : input.strategy === 'music_intermission' ? 'Music Intermission' : 'Odo', role);
  }
  const assignments = Object.fromEntries(Object.entries(sourcesBySlot)
    .map(([slot, source]) => [slot, source?.sourceKey]));
  return {
    kind: 'moment',
    strategy: input.strategy,
    intent: input.strategy.replaceAll('_', ' '),
    canvas: input.canvas,
    occupancy: input.strategy === 'host_plus_pool' ? 1 : input.strategy === 'active_pair' ? 2 : 0,
    regions: resolveAssignedProgramLayout(scene, input.canvas, assignments).regions,
    sourcesBySlot,
    fixture: true,
    largePanelPreview: false,
  };
};
