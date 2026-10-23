import {
  LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT,
  LIVE_STANDARD_STAGE_PUBLISHER_LIMIT,
  PROGRAM_SCENES,
  PROGRAM_SOURCE_SLOTS,
  PROGRAM_TARGET_CANVASES,
  type ProgramScene,
  type ProgramSource,
  type ProgramSourceSlot,
  type ProgramSourceType,
  type ProgramState,
  type ProgramTargetCanvas,
} from './contracts.ts';
import { resolveAssignedProgramLayout } from './layout.ts';

export const ADAPTIVE_STAGE_MANIFEST_SCHEMA_VERSION = 2 as const;
export const ADAPTIVE_STAGE_MANIFEST_VERSION = 'adaptive-stage-v2.0.0-m1' as const;
export const ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION = 'layout-plan-v2.0.0-m1' as const;

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneFamily = 'people' | 'present' | 'engage' | 'brand_safety' | 'audio_led';
export type SceneSemanticRole =
  | 'primary_host'
  | 'co_host'
  | 'guest'
  | 'screen'
  | 'pool'
  | 'pair'
  | 'pulse'
  | 'odo'
  | 'visual'
  | 'audio';

export type SceneManifestSlotV2 = {
  slot: ProgramSourceSlot;
  semanticRole: SceneSemanticRole;
  accepts: readonly ProgramSourceType[];
  required: boolean;
  cardinality: { min: number; max: number };
  distinctBy: 'none' | 'source_key' | 'owner_user_id';
};

export type SceneManifestV2 = {
  schemaVersion: 2;
  manifestVersion: string;
  id: ProgramScene;
  family: SceneFamily;
  label: string;
  exposure: {
    studio: boolean;
    mobileProducer: boolean;
    odoCanRecommend: boolean;
    odoCanTake: boolean;
    systemOnly: boolean;
  };
  slots: readonly SceneManifestSlotV2[];
  occupancy: { minHumans: number; maxHumans: number; requiresLargePanel: boolean };
  canvases: Record<ProgramTargetCanvas, {
    supported: boolean;
    strategy: string;
    contentSafeRect: NormalizedRect;
    captionSafeRect: NormalizedRect;
    minimumTile: { width: number; height: number };
  }>;
  focusPolicy: string;
  transitionPolicy: string;
  fallbackChain: readonly ProgramScene[];
  privacy: { recordable: boolean; clipsAllowed: boolean; privateEngagementExcluded: true };
};

const SAFE_RECT: NormalizedRect = { x: 0.04, y: 0.04, width: 0.92, height: 0.92 };
const CAPTION_SAFE_RECT: NormalizedRect = { x: 0.06, y: 0.06, width: 0.88, height: 0.72 };

const canvases = (strategy: string): SceneManifestV2['canvases'] => ({
  portrait_9_16: {
    supported: true,
    strategy: `${strategy}:portrait`,
    contentSafeRect: SAFE_RECT,
    captionSafeRect: CAPTION_SAFE_RECT,
    minimumTile: { width: 0.2, height: 0.16 },
  },
  landscape_16_9: {
    supported: true,
    strategy: `${strategy}:landscape`,
    contentSafeRect: SAFE_RECT,
    captionSafeRect: CAPTION_SAFE_RECT,
    minimumTile: { width: 0.16, height: 0.2 },
  },
  square_1_1: {
    supported: true,
    strategy: `${strategy}:square`,
    contentSafeRect: SAFE_RECT,
    captionSafeRect: CAPTION_SAFE_RECT,
    minimumTile: { width: 0.2, height: 0.2 },
  },
});

const slot = (
  name: ProgramSourceSlot,
  semanticRole: SceneSemanticRole,
  accepts: readonly ProgramSourceType[],
  required: boolean,
  distinctBy: SceneManifestSlotV2['distinctBy'] = 'source_key',
): SceneManifestSlotV2 => ({
  slot: name,
  semanticRole,
  accepts,
  required,
  cardinality: { min: required ? 1 : 0, max: 1 },
  distinctBy,
});

const host = (required = true) => slot('host', 'primary_host', ['host_camera'], required, 'owner_user_id');
const guest = (name: Extract<ProgramSourceSlot, `guest_${number}`>) =>
  slot(name, 'guest', ['participant_camera'], false, 'owner_user_id');
const panelSlots = (): readonly SceneManifestSlotV2[] => [
  host(), guest('guest_1'), guest('guest_2'), guest('guest_3'), guest('guest_4'), guest('guest_5'),
];
const screen = () => slot('primary', 'screen', ['screen_share'], true);
const pool = () => slot('pool', 'pool', ['quick_connect_pool'], true);
const pair = () => slot('pair', 'pair', ['active_pair'], true);
const pulse = () => slot('pulse', 'pulse', ['audience_pulse'], true);
const odo = () => slot('odo', 'odo', ['odo_stage', 'branded_visual'], true);
const atmosphere = () => slot('audio_atmosphere', 'audio', ['dj_audio', 'programme_music'], true);
const optionalAudioSlots = (): readonly SceneManifestSlotV2[] => [
  slot('audio_host', 'audio', ['host_microphone'], false),
  slot('audio_screen', 'audio', ['screen_share_audio'], false),
  slot('audio_atmosphere', 'audio', ['dj_audio', 'programme_music'], false),
];

type ManifestOptions = {
  family: SceneFamily;
  label: string;
  slots: readonly SceneManifestSlotV2[];
  minHumans: number;
  maxHumans: number;
  strategy: string;
  fallback?: readonly ProgramScene[];
  mobile?: boolean;
  odoTake?: boolean;
};

const manifest = (id: ProgramScene, options: ManifestOptions): SceneManifestV2 => {
  const slotsByName = new Map(optionalAudioSlots().map((entry) => [entry.slot, entry]));
  options.slots.forEach((entry) => slotsByName.set(entry.slot, entry));
  return {
    schemaVersion: ADAPTIVE_STAGE_MANIFEST_SCHEMA_VERSION,
    manifestVersion: ADAPTIVE_STAGE_MANIFEST_VERSION,
    id,
    family: options.family,
    label: options.label,
    exposure: {
      studio: true,
      mobileProducer: options.mobile === true,
      odoCanRecommend: true,
      odoCanTake: options.odoTake !== false,
      systemOnly: false,
    },
    slots: [...slotsByName.values()],
    occupancy: {
      minHumans: options.minHumans,
      maxHumans: options.maxHumans,
      requiresLargePanel: options.maxHumans > LIVE_STANDARD_STAGE_PUBLISHER_LIMIT,
    },
    canvases: canvases(options.strategy),
    focusPolicy: options.family === 'people' ? 'assigned_people' : 'assigned_source',
    transitionPolicy: 'preserve_program_transition',
    fallbackChain: options.fallback ?? ['branded_intermission'],
    privacy: { recordable: true, clipsAllowed: true, privateEngagementExcluded: true },
  };
};

export const SCENE_MANIFEST_V2: readonly SceneManifestV2[] = [
  manifest('host_focus', { family: 'people', label: 'Speaker focus', slots: [host()], minHumans: 1, maxHumans: 1, strategy: 'host_focus', fallback: ['branded_intermission'], mobile: true }),
  manifest('panel_focus', { family: 'people', label: 'Panel', slots: panelSlots(), minHumans: 1, maxHumans: 6, strategy: 'adaptive_panel', fallback: ['host_focus', 'branded_intermission'], mobile: true }),
  manifest('host_plus_pool', { family: 'people', label: 'Host + room', slots: [host(), pool()], minHumans: 1, maxHumans: 4, strategy: 'host_pool' }),
  manifest('pool_focus', { family: 'people', label: 'Room focus', slots: [pool()], minHumans: 0, maxHumans: 4, strategy: 'pool', fallback: ['branded_intermission'] }),
  manifest('pair_forming', { family: 'people', label: 'Pair forming', slots: [pool()], minHumans: 0, maxHumans: 2, strategy: 'pair_forming' }),
  manifest('quick_connect_active', { family: 'people', label: 'Active pair', slots: [pair()], minHumans: 2, maxHumans: 2, strategy: 'active_pair' }),
  manifest('audience_pulse', { family: 'engage', label: 'Audience pulse', slots: [pulse()], minHumans: 0, maxHumans: 0, strategy: 'generated_full' }),
  manifest('conversation_topic', { family: 'engage', label: 'Conversation topic', slots: [odo()], minHumans: 0, maxHumans: 0, strategy: 'generated_full' }),
  manifest('odo_stage', { family: 'engage', label: 'Odo moment', slots: [odo()], minHumans: 0, maxHumans: 0, strategy: 'generated_full' }),
  manifest('music_intermission', { family: 'audio_led', label: 'Music intermission', slots: [odo()], minHumans: 0, maxHumans: 0, strategy: 'generated_full' }),
  manifest('branded_intermission', { family: 'brand_safety', label: 'Safe intermission', slots: [odo()], minHumans: 0, maxHumans: 0, strategy: 'generated_full', fallback: [] , mobile: true }),
  manifest('session_closing', { family: 'brand_safety', label: 'Closing', slots: [odo()], minHumans: 0, maxHumans: 0, strategy: 'generated_full' }),
  manifest('screen_full', { family: 'present', label: 'Screen', slots: [screen()], minHumans: 0, maxHumans: 0, strategy: 'screen_full', fallback: ['host_focus', 'branded_intermission'], mobile: true }),
  manifest('screen_plus_host', { family: 'present', label: 'Screen + speaker', slots: [screen(), host()], minHumans: 1, maxHumans: 1, strategy: 'screen_pip', fallback: ['host_focus', 'branded_intermission'], mobile: true }),
  manifest('screen_plus_pair', { family: 'present', label: 'Screen + pair', slots: [screen(), pair()], minHumans: 2, maxHumans: 2, strategy: 'screen_pair', fallback: ['host_focus', 'branded_intermission'] }),
  manifest('screen_plus_panel', { family: 'present', label: 'Screen + panel', slots: [screen(), ...panelSlots()], minHumans: 1, maxHumans: 6, strategy: 'screen_panel', fallback: ['host_focus', 'branded_intermission'], mobile: true }),
  manifest('screen_discussion', { family: 'present', label: 'Screen discussion', slots: [screen(), ...panelSlots()], minHumans: 1, maxHumans: 6, strategy: 'screen_discussion', fallback: ['host_focus', 'branded_intermission'] }),
  manifest('screen_plus_pool', { family: 'present', label: 'Screen + room', slots: [screen(), pool()], minHumans: 0, maxHumans: 4, strategy: 'screen_pool', fallback: ['host_focus', 'branded_intermission'] }),
  manifest('screen_plus_audience_pulse', { family: 'present', label: 'Screen + pulse', slots: [screen(), pulse()], minHumans: 0, maxHumans: 0, strategy: 'screen_generated', fallback: ['host_focus', 'branded_intermission'] }),
  manifest('screen_plus_odo', { family: 'present', label: 'Screen + Odo', slots: [screen(), odo()], minHumans: 0, maxHumans: 0, strategy: 'screen_pip', fallback: ['host_focus', 'branded_intermission'] }),
  manifest('dj_plus_pool', { family: 'audio_led', label: 'DJ + room', slots: [host(false), pool(), atmosphere()], minHumans: 0, maxHumans: 4, strategy: 'dj_pool', fallback: ['pool_focus', 'branded_intermission'] }),
];

export const sceneManifestV2 = (scene: ProgramScene): SceneManifestV2 => {
  const result = SCENE_MANIFEST_V2.find((entry) => entry.id === scene);
  if (!result) throw new Error(`adaptive_stage_manifest_scene_missing:${scene}`);
  return result;
};

export type LayoutPlanRegionV2 = {
  id: string;
  slot: ProgramSourceSlot;
  sourceKey: string;
  ownerUserId: string | null;
  track: 'camera' | 'screen' | 'generated' | 'none';
  rect: NormalizedRect;
  zIndex: number;
  fit: 'contain' | 'cover' | 'smart_crop';
  focalPoint: { x: number; y: number } | null;
  labelSafeRect: NormalizedRect | null;
  captionExclusionRect: NormalizedRect | null;
  transitionKey: string;
  health: 'healthy' | 'degraded' | 'lost';
  fallbackReason: string | null;
};

export type LayoutPlanV2 = {
  schemaVersion: 2;
  manifestVersion: string;
  resolverVersion: string;
  sessionId: string;
  programVersion: number;
  sourceGraphVersion: number;
  scene: ProgramScene;
  family: SceneFamily;
  canvas: ProgramTargetCanvas;
  viewport: { width: number; height: number };
  regions: readonly LayoutPlanRegionV2[];
  audio: readonly {
    sourceKey: string;
    role: 'speech' | 'screen' | 'music' | 'atmosphere';
    gain: number;
    duckable: boolean;
  }[];
  subscriptions: readonly {
    ownerUserId: string;
    track: 'camera' | 'screen';
    desiredQuality: 'off' | 'low' | 'medium' | 'high';
  }[];
  fallback: { active: boolean; fromScene: ProgramScene | null; reason: string | null };
  planHash: string;
  generatedAt: string;
};

export type AdaptiveStageValidationCode =
  | 'MANIFEST_OUTDATED'
  | 'SCENE_UNKNOWN'
  | 'CANVAS_UNSUPPORTED'
  | 'SOURCE_GRAPH_STALE'
  | 'SOURCE_MISSING'
  | 'SOURCE_NOT_READY'
  | 'SOURCE_SLOT_INVALID'
  | 'SOURCE_TYPE_INVALID'
  | 'SOURCE_DUPLICATED'
  | 'SOURCE_IDENTITY_MISSING'
  | 'HUMAN_DUPLICATED'
  | 'CAPACITY_EXCEEDED'
  | 'LARGE_PANEL_REQUIRED'
  | 'REQUIRED_SOURCE_MISSING';

export class AdaptiveStageValidationError extends Error {
  readonly code: AdaptiveStageValidationCode;

  constructor(code: AdaptiveStageValidationCode, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.name = 'AdaptiveStageValidationError';
  }
}

export type ResolveLayoutPlanV2Input = {
  manifestVersion: string;
  programState: ProgramState;
  sourceGraph: readonly ProgramSource[];
  sourceGraphVersion: number;
  expectedSourceGraphVersion?: number;
  viewport: { width: number; height: number };
  maximumPublishers: 4 | 6;
  largePanelEnabled: boolean;
  generatedAt?: string;
};

const humanSlots = new Set<ProgramSourceSlot>([
  'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
]);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

export const sourceGraphVersionFromSources = (sources: readonly ProgramSource[]): number => {
  const semantic = [...sources]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((source) => [source.key, source.generation, source.version]);
  return Number.parseInt(fnv1a32(stableStringify(semantic)).slice(0, 7), 16);
};

const sourceTrack = (source: ProgramSource): LayoutPlanRegionV2['track'] => {
  if (source.type === 'screen_share') return 'screen';
  if (source.type === 'host_camera' || source.type === 'participant_camera') return 'camera';
  if (source.hasVideo || ['active_pair', 'quick_connect_pool', 'odo_stage', 'audience_pulse', 'branded_visual'].includes(source.type)) return 'generated';
  return 'none';
};

const sourceHealth = (source: ProgramSource): LayoutPlanRegionV2['health'] => {
  if (source.health === 'lost' || ['ended', 'failed'].includes(source.readiness)) return 'lost';
  if (source.health === 'degraded' || !['ready', 'live'].includes(source.readiness)) return 'degraded';
  return 'healthy';
};

const audioRole = (slotName: ProgramSourceSlot, sourceType: ProgramSourceType) => {
  if (slotName === 'audio_screen') return 'screen' as const;
  if (sourceType === 'programme_music') return 'music' as const;
  if (slotName === 'audio_atmosphere') return 'atmosphere' as const;
  return 'speech' as const;
};

export const resolveLayoutPlanV2 = (input: ResolveLayoutPlanV2Input): LayoutPlanV2 => {
  if (input.manifestVersion !== ADAPTIVE_STAGE_MANIFEST_VERSION) {
    throw new AdaptiveStageValidationError('MANIFEST_OUTDATED');
  }
  if (input.expectedSourceGraphVersion !== undefined
    && input.expectedSourceGraphVersion !== input.sourceGraphVersion) {
    throw new AdaptiveStageValidationError('SOURCE_GRAPH_STALE');
  }
  const scene = input.programState.scene;
  const definition = sceneManifestV2(scene);
  if (!definition.canvases[input.programState.targetCanvas]?.supported) {
    throw new AdaptiveStageValidationError('CANVAS_UNSUPPORTED', input.programState.targetCanvas);
  }
  const sourcesByKey = new Map(input.sourceGraph.map((source) => [source.key, source]));
  const usedSourceKeys = new Set<string>();
  const usedOwners = new Set<string>();
  let humanCount = 0;

  const allowedSlots = new Set(definition.slots.map((entry) => entry.slot));
  for (const assignedSlot of Object.keys(input.programState.sourceAssignments) as ProgramSourceSlot[]) {
    if (!allowedSlots.has(assignedSlot)) {
      throw new AdaptiveStageValidationError('SOURCE_SLOT_INVALID', assignedSlot);
    }
  }

  for (const rule of definition.slots) {
    const sourceKey = input.programState.sourceAssignments[rule.slot];
    if (!sourceKey) {
      if (rule.required) throw new AdaptiveStageValidationError('REQUIRED_SOURCE_MISSING', rule.slot);
      continue;
    }
    const source = sourcesByKey.get(sourceKey);
    if (!source) throw new AdaptiveStageValidationError('SOURCE_MISSING', rule.slot);
    if (!['ready', 'live'].includes(source.readiness) || source.health === 'lost') {
      throw new AdaptiveStageValidationError('SOURCE_NOT_READY', rule.slot);
    }
    if (!rule.accepts.includes(source.type)) {
      throw new AdaptiveStageValidationError('SOURCE_TYPE_INVALID', rule.slot);
    }
    if (rule.distinctBy !== 'none' && usedSourceKeys.has(source.key)) {
      throw new AdaptiveStageValidationError('SOURCE_DUPLICATED', rule.slot);
    }
    usedSourceKeys.add(source.key);
    if (humanSlots.has(rule.slot)) {
      const authoritativeIdentity = source.ownerUserId ?? source.providerUserId;
      if (!authoritativeIdentity || !source.providerUserId) {
        throw new AdaptiveStageValidationError('SOURCE_IDENTITY_MISSING', rule.slot);
      }
      if (usedOwners.has(authoritativeIdentity)) {
        throw new AdaptiveStageValidationError('HUMAN_DUPLICATED', rule.slot);
      }
      usedOwners.add(authoritativeIdentity);
      humanCount += 1;
    }
  }

  if (humanCount > input.maximumPublishers || humanCount > LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT) {
    throw new AdaptiveStageValidationError('CAPACITY_EXCEEDED');
  }
  if (humanCount > LIVE_STANDARD_STAGE_PUBLISHER_LIMIT
    && (input.maximumPublishers !== LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT || !input.largePanelEnabled)) {
    throw new AdaptiveStageValidationError('LARGE_PANEL_REQUIRED');
  }

  const layout = resolveAssignedProgramLayout(
    scene,
    input.programState.targetCanvas,
    input.programState.sourceAssignments,
  );
  const regions = layout.regions
    .filter((region) => region.treatment !== 'audio')
    .flatMap((region): LayoutPlanRegionV2[] => {
      const sourceKey = input.programState.sourceAssignments[region.slot];
      const source = sourceKey ? sourcesByKey.get(sourceKey) : undefined;
      if (!sourceKey || !source) return [];
      return [{
        id: `${scene}:${region.slot}`,
        slot: region.slot,
        sourceKey,
        ownerUserId: source.ownerUserId ?? source.providerUserId,
        track: sourceTrack(source),
        rect: { x: region.x, y: region.y, width: region.width, height: region.height },
        zIndex: region.zIndex,
        fit: source.type === 'screen_share' ? 'contain' : 'cover',
        focalPoint: null,
        labelSafeRect: definition.canvases[input.programState.targetCanvas].contentSafeRect,
        captionExclusionRect: definition.canvases[input.programState.targetCanvas].captionSafeRect,
        transitionKey: `${input.programState.programVersion}:${region.slot}:${sourceKey}`,
        health: sourceHealth(source),
        fallbackReason: null,
      }];
    });
  const audio = (['audio_host', 'audio_screen', 'audio_atmosphere'] as const)
    .flatMap((slotName) => {
      const sourceKey = input.programState.sourceAssignments[slotName];
      const source = sourceKey ? sourcesByKey.get(sourceKey) : undefined;
      if (!sourceKey || !source || !source.hasAudio || source.muted) return [];
      return [{
        sourceKey,
        role: audioRole(slotName, source.type),
        gain: 1,
        duckable: slotName === 'audio_atmosphere',
      }];
    });
  const subscriptions = regions
    .filter((region) => region.ownerUserId && (region.track === 'camera' || region.track === 'screen'))
    .map((region) => ({
      ownerUserId: region.ownerUserId as string,
      track: region.track as 'camera' | 'screen',
      desiredQuality: 'high' as const,
    }))
    .filter((subscription, index, all) => all.findIndex((candidate) =>
      candidate.ownerUserId === subscription.ownerUserId && candidate.track === subscription.track) === index);

  const semanticPlan = {
    schemaVersion: ADAPTIVE_STAGE_MANIFEST_SCHEMA_VERSION,
    manifestVersion: ADAPTIVE_STAGE_MANIFEST_VERSION,
    resolverVersion: ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
    sessionId: input.programState.sessionId,
    programVersion: input.programState.programVersion,
    sourceGraphVersion: input.sourceGraphVersion,
    scene,
    family: definition.family,
    canvas: input.programState.targetCanvas,
    viewport: input.viewport,
    regions,
    audio,
    subscriptions,
    fallback: { active: false, fromScene: null, reason: null },
  } satisfies Omit<LayoutPlanV2, 'planHash' | 'generatedAt'>;
  return {
    ...semanticPlan,
    planHash: fnv1a32(stableStringify(semanticPlan)),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
};

export type AdaptiveStageShadowDivergence =
  | 'none'
  | 'scene'
  | 'source_identity'
  | 'source_assignment'
  | 'region_count'
  | 'capacity'
  | 'plan_generation_error';

export type AdaptiveStageShadowComparison = {
  semanticMatch: boolean;
  divergenceType: AdaptiveStageShadowDivergence;
  v1SourceKeys: readonly string[];
  v2SourceKeys: readonly string[];
  v1RegionCount: number;
  v2RegionCount: number;
};

export const compareLayoutPlanV2WithV1 = (
  program: ProgramState,
  plan: LayoutPlanV2,
): AdaptiveStageShadowComparison => {
  const v1 = resolveAssignedProgramLayout(program.scene, program.targetCanvas, program.sourceAssignments);
  const v1SourceKeys = v1.regions
    .filter((region) => region.treatment !== 'audio')
    .map((region) => program.sourceAssignments[region.slot])
    .filter((value): value is string => Boolean(value));
  const v2SourceKeys = plan.regions.map((region) => region.sourceKey);
  const sameSources = stableStringify([...v1SourceKeys].sort()) === stableStringify([...v2SourceKeys].sort());
  const sameScene = program.scene === plan.scene;
  const sameRegions = v1SourceKeys.length === plan.regions.length;
  return {
    semanticMatch: sameScene && sameSources && sameRegions,
    divergenceType: !sameScene ? 'scene' : !sameSources ? 'source_assignment'
      : !sameRegions ? 'region_count' : 'none',
    v1SourceKeys,
    v2SourceKeys,
    v1RegionCount: v1.regions.filter((region) => region.treatment !== 'audio').length,
    v2RegionCount: plan.regions.length,
  };
};

export type AdaptiveStageTelemetryEventName =
  | 'adaptive_stage_v2_shadow_plan_generated'
  | 'adaptive_stage_v2_shadow_match'
  | 'adaptive_stage_v2_shadow_divergence'
  | 'adaptive_stage_v2_invalid_assignment_rejected'
  | 'adaptive_stage_v2_manifest_mismatch'
  | 'adaptive_stage_v2_source_identity_missing'
  | 'adaptive_stage_v2_arbitrary_fallback_prevented'
  | 'adaptive_stage_v2_plan_generation_error';

export type AdaptiveStageTelemetryEvent = {
  name: AdaptiveStageTelemetryEventName;
  details: Record<string, string | number | boolean | null>;
};

export type AdaptiveStageShadowResult = {
  plan: LayoutPlanV2 | null;
  comparison: AdaptiveStageShadowComparison | null;
  events: readonly AdaptiveStageTelemetryEvent[];
};

export const resolveAdaptiveStageShadowV2 = (input: Omit<ResolveLayoutPlanV2Input,
  'manifestVersion' | 'sourceGraphVersion'> & { sourceGraphVersion?: number }): AdaptiveStageShadowResult => {
  const sourceGraphVersion = input.sourceGraphVersion
    ?? sourceGraphVersionFromSources(input.sourceGraph);
  const baseDetails = {
    session_id: input.programState.sessionId,
    program_version: input.programState.programVersion,
    manifest_version: ADAPTIVE_STAGE_MANIFEST_VERSION,
    resolver_version: ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
    scene: input.programState.scene,
    canvas: input.programState.targetCanvas,
    capacity: input.maximumPublishers,
    source_graph_version: sourceGraphVersion,
  };
  try {
    const plan = resolveLayoutPlanV2({
      ...input,
      manifestVersion: ADAPTIVE_STAGE_MANIFEST_VERSION,
      sourceGraphVersion,
    });
    const comparison = compareLayoutPlanV2WithV1(input.programState, plan);
    return {
      plan,
      comparison,
      events: [{
        name: 'adaptive_stage_v2_shadow_plan_generated',
        details: { ...baseDetails, plan_hash: plan.planHash, region_count: plan.regions.length },
      }, {
        name: comparison.semanticMatch
          ? 'adaptive_stage_v2_shadow_match'
          : 'adaptive_stage_v2_shadow_divergence',
        details: {
          ...baseDetails,
          plan_hash: plan.planHash,
          semantic_match: comparison.semanticMatch,
          divergence_type: comparison.divergenceType,
          v1_region_count: comparison.v1RegionCount,
          v2_region_count: comparison.v2RegionCount,
        },
      }],
    };
  } catch (error) {
    const code = error instanceof AdaptiveStageValidationError ? error.code : 'PLAN_GENERATION_ERROR';
    const name: AdaptiveStageTelemetryEventName = code === 'MANIFEST_OUTDATED'
      ? 'adaptive_stage_v2_manifest_mismatch'
      : code === 'SOURCE_IDENTITY_MISSING'
        ? 'adaptive_stage_v2_source_identity_missing'
        : 'adaptive_stage_v2_plan_generation_error';
    return {
      plan: null,
      comparison: null,
      events: [{ name, details: { ...baseDetails, reason_code: code } }],
    };
  }
};

export const ADAPTIVE_STAGE_V2_FLAG_NAMES = {
  shadow: 'adaptive_stage_v2_shadow_enabled',
  diagnostics: 'adaptive_stage_v2_diagnostics_enabled',
  studioRender: 'adaptive_stage_v2_studio_render_enabled',
  nativeRender: 'adaptive_stage_v2_native_render_enabled',
  compositorRender: 'adaptive_stage_v2_compositor_render_enabled',
} as const;

export type AdaptiveStageV2Flags = {
  shadow: boolean;
  diagnostics: boolean;
  studioRender: boolean;
  nativeRender: boolean;
  compositorRender: boolean;
};

export const ADAPTIVE_STAGE_V2_SAFE_DEFAULTS: AdaptiveStageV2Flags = {
  shadow: false,
  diagnostics: false,
  studioRender: false,
  nativeRender: false,
  compositorRender: false,
};

export const isNormalizedRect = (value: NormalizedRect): boolean =>
  [value.x, value.y, value.width, value.height].every((item) => Number.isFinite(item) && item >= 0 && item <= 1)
  && value.x + value.width <= 1 + Number.EPSILON
  && value.y + value.height <= 1 + Number.EPSILON;

export const adaptiveStageManifestCoverageIsComplete = (): boolean =>
  SCENE_MANIFEST_V2.length === PROGRAM_SCENES.length
  && PROGRAM_SCENES.every((scene) => SCENE_MANIFEST_V2.some((entry) => entry.id === scene))
  && SCENE_MANIFEST_V2.every((entry) =>
    PROGRAM_TARGET_CANVASES.every((canvas) => Boolean(entry.canvases[canvas]))
    && entry.slots.every((entrySlot) => PROGRAM_SOURCE_SLOTS.includes(entrySlot.slot)));
