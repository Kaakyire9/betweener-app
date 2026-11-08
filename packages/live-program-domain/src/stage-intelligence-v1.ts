import {
  EDITORIAL_INTENT_BY_PEOPLE_STRATEGY_V2,
  EDITORIAL_PEOPLE_LAYOUT_BOOK_V2,
  type EditorialIntentV2,
  type EditorialPeopleLayoutStrategyV2,
  type EditorialScreenLayoutStrategyV2,
  type OnAirProgrammeRoleV2,
} from './adaptive-stage-m2.ts';
import type {
  ProgramScene,
  ProgramSource,
  ProgramSourceAssignments,
  ProgramSourceSlot,
  ProgramTargetCanvas,
} from './contracts.ts';
import { assignmentsForProgramScene } from './scenes.ts';

export const STAGE_INTELLIGENCE_V1_REASON_CODES = [
  'SOLO_HOST',
  'BALANCED_CONVERSATION',
  'HOST_PLUS_ONE',
  'HOST_PLUS_TWO',
  'HOST_PLUS_THREE',
  'HOST_PLUS_FOUR',
  'HOST_PLUS_FIVE',
  'SUSTAINED_SPEAKER',
  'SCREEN_READY',
  'SCREEN_ACTIVE',
  'PAIR_ACTIVE',
  'POOL_WAITING',
  'AUDIENCE_PULSE_READY',
  'AUDIENCE_PULSE_ACTIVE',
  'LOW_LIQUIDITY',
  'SAFETY_REQUIRED',
  'SAFETY_FALLBACK',
  'CURRENT_SCENE_STILL_STRONG',
  'SOURCE_DEGRADED',
  'PORTRAIT_DENSE_PANEL',
  'LANDSCAPE_PANEL_FIT',
  'MANUAL_LOCKED',
] as const;

export type StageIntelligenceReasonCodeV1 =
  (typeof STAGE_INTELLIGENCE_V1_REASON_CODES)[number];
export type StageIntelligenceConfidenceV1 = 'STRONG' | 'GOOD' | 'WEAK';
export type StageIntelligenceSafetyModeV1 = 'normal' | 'safe_scene_required';
export type StageIntelligencePulseLifecycleV1 =
  'unavailable' | 'ready' | 'active' | 'completed';
export type StageIntelligenceScreenLifecycleV1 =
  'absent' | 'ready' | 'active' | 'degraded' | 'reconnecting' | 'lost';
export type StageIntelligenceStrategyV1 =
  | EditorialPeopleLayoutStrategyV2
  | EditorialScreenLayoutStrategyV2
  | 'active_pair'
  | 'host_plus_pair'
  | 'host_plus_pool'
  | 'pool_focus'
  | 'audience_pulse'
  | 'odo_stage'
  | 'safe_intermission';

export type StageIntelligenceInputV1 = {
  programScene: ProgramScene;
  programIntent: EditorialIntentV2;
  programAssignments: ProgramSourceAssignments;
  previewScene: ProgramScene;
  previewIntent: EditorialIntentV2;
  canvas: ProgramTargetCanvas;
  occupancy: number;
  programmeRoles: Partial<Record<ProgramSourceSlot, OnAirProgrammeRoleV2>>;
  sources: readonly ProgramSource[];
  activePair: { active: boolean };
  quickConnect: { state: string; poolCount: number };
  audiencePulse: { lifecycle: StageIntelligencePulseLifecycleV1 };
  capacity: 4 | 6;
  largePanelEnabled: boolean;
  sustainedSpeaker: { slot: ProgramSourceSlot; durationMs: number } | null;
  lowLiquidity: boolean;
  safetyMode: StageIntelligenceSafetyModeV1;
  manualLocks: { currentScene: boolean };
  sceneDwellMs: number;
  recentSceneHistory: readonly ProgramScene[];
};

export type StageRecommendationV1 = {
  kind: 'scene' | 'hold';
  scene: ProgramScene;
  sceneIntent: EditorialIntentV2;
  strategyId: StageIntelligenceStrategyV1;
  title: string;
  rank: number;
  score: number;
  confidenceBand: StageIntelligenceConfidenceV1;
  reasonCodes: readonly StageIntelligenceReasonCodeV1[];
  shortReason: string;
  factChip: string;
  isCurrentScene: boolean;
  isSafetyFallback: boolean;
  assignments: ProgramSourceAssignments;
};

export type StageIntelligenceResultV1 = {
  recommendations: readonly StageRecommendationV1[];
  safetyFallback: StageRecommendationV1 | null;
  eligibleCandidateCount: number;
  screenLifecycle: StageIntelligenceScreenLifecycleV1;
};

export const STAGE_INTELLIGENCE_POLICY_V1 = Object.freeze({
  maximumRecommendations: 3,
  minimumEditorialScore: 60,
  strongScore: 92,
  goodScore: 72,
  switchThreshold: 12,
  minimumSceneDwellMs: 18_000,
  recentScenePenalty: 9,
  shortDwellSwitchPenalty: 14,
  degradedSourcePenalty: 16,
  currentSceneContinuity: 8,
  activeScreenBoost: 34,
  readyScreenBoost: 14,
  activePairBoost: 36,
  poolWaitingBoost: 30,
  activePulseBoost: 32,
  readyPulseBoost: 12,
  sustainedSpeakerBoost: 31,
  lowLiquidityRecoveryBoost: 28,
  safetyRequiredScore: 200,
  editorialPriority: [
    'active_pair',
    'screen_plus_host',
    'screen_plus_pair',
    'screen_plus_panel',
    'screen_discussion',
    'screen_full',
    'host_guest_interview',
    'host_hero_plus_2',
    'host_hero_plus_3',
    'host_hero_plus_4',
    'host_led_six',
    'solo_host',
    'balanced_duo',
    'balanced_trio',
    'balanced_panel_4',
    'balanced_five',
    'balanced_six',
    'host_plus_pool',
    'pool_focus',
    'audience_pulse',
    'odo_stage',
  ] as readonly StageIntelligenceStrategyV1[],
});

type Candidate = Omit<StageRecommendationV1, 'rank' | 'confidenceBand' | 'kind'>;

const HUMAN_SLOTS: readonly ProgramSourceSlot[] = [
  'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
];

const sourceIdentity = (source: ProgramSource) =>
  source.ownerUserId ?? source.providerUserId ?? source.key;

const sourceHealthState = (source: ProgramSource): StageIntelligenceScreenLifecycleV1 => {
  if (source.health === 'lost' || ['ended', 'failed'].includes(source.readiness)) return 'lost';
  if (source.readiness === 'preparing') return 'reconnecting';
  if (source.health === 'degraded') return 'degraded';
  if (source.readiness === 'live') return 'active';
  if (source.readiness === 'ready') return 'ready';
  return 'absent';
};

const sourceIsEligible = (source: ProgramSource) =>
  ['ready', 'live'].includes(source.readiness) && source.health !== 'lost';

const sourceFor = (
  assignments: ProgramSourceAssignments,
  slot: ProgramSourceSlot,
  sources: readonly ProgramSource[],
) => sources.find((source) => source.key === assignments[slot]);

const assignedSourcesAreLegal = (
  assignments: ProgramSourceAssignments,
  requiredSlots: readonly ProgramSourceSlot[],
  sources: readonly ProgramSource[],
) => {
  const assigned = requiredSlots.map((slot) => sourceFor(assignments, slot, sources));
  if (assigned.some((source) => !source || !sourceIsEligible(source))) return false;
  const keys = assigned.map((source) => source?.key);
  if (new Set(keys).size !== keys.length) return false;
  const humans = assigned.filter((source) => source
    && ['host_camera', 'participant_camera'].includes(source.type));
  return new Set(humans.map((source) => sourceIdentity(source as ProgramSource))).size
    === humans.length;
};

const assignmentsForPeople = (input: StageIntelligenceInputV1): ProgramSourceAssignments => {
  const sources = input.sources
    .filter((source) => sourceIsEligible(source)
      && ['host_camera', 'participant_camera'].includes(source.type))
    .sort((left, right) => {
      const leftHost = left.type === 'host_camera' ? 0 : 1;
      const rightHost = right.type === 'host_camera' ? 0 : 1;
      return leftHost - rightHost || left.key.localeCompare(right.key);
    });
  const unique = sources.filter((source, index, all) => all.findIndex((candidate) =>
    sourceIdentity(candidate) === sourceIdentity(source)) === index).slice(0, input.occupancy);
  const host = unique.find((source) => source.type === 'host_camera');
  if (!host) return {};
  const guests = unique.filter((source) => source.key !== host.key);
  return {
    host: host.key,
    ...Object.fromEntries(guests.map((source, index) => [`guest_${index + 1}`, source.key])),
  };
};

const hostReason = (occupancy: number): StageIntelligenceReasonCodeV1 => {
  if (occupancy <= 1) return 'SOLO_HOST';
  if (occupancy === 2) return 'HOST_PLUS_ONE';
  if (occupancy === 3) return 'HOST_PLUS_TWO';
  if (occupancy === 4) return 'HOST_PLUS_THREE';
  if (occupancy === 5) return 'HOST_PLUS_FOUR';
  return 'HOST_PLUS_FIVE';
};

const peopleTitle = (strategy: EditorialPeopleLayoutStrategyV2) => ({
  solo_cinematic: 'Solo focus',
  solo_host: 'Host focus',
  solo_presentation_support: 'Presenter focus',
  balanced_duo: 'Balanced duo',
  host_guest_interview: 'Host + guest',
  speaker_focus_duo: 'Speaker focus duo',
  match_pair: 'Pair focus',
  balanced_trio: 'Balanced trio',
  host_hero_plus_2: 'Host-led trio',
  speaker_focus_trio: 'Speaker focus trio',
  pair_plus_host: 'Host + pair',
  classic_2x2: 'Classic four',
  host_hero_plus_3: 'Host-led four',
  speaker_hero_plus_3: 'Speaker focus four',
  balanced_panel_4: 'Balanced four',
  host_hero_plus_4: 'Host hero + 4',
  balanced_five: 'Balanced five',
  speaker_plus_4: 'Speaker + 4',
  editorial_five: 'Editorial five',
  balanced_six: 'Balanced six',
  host_led_six: 'Host-led six',
  speaker_focus_six: 'Speaker focus six',
  event_panel_six: 'Event panel six',
})[strategy];

const peopleStrategies = (occupancy: number): readonly EditorialPeopleLayoutStrategyV2[] => {
  if (occupancy === 1) return ['solo_host', 'solo_cinematic'];
  if (occupancy === 2) return ['host_guest_interview', 'balanced_duo', 'speaker_focus_duo'];
  if (occupancy === 3) return ['host_hero_plus_2', 'balanced_trio', 'speaker_focus_trio'];
  if (occupancy === 4) return ['host_hero_plus_3', 'balanced_panel_4', 'classic_2x2', 'speaker_hero_plus_3'];
  if (occupancy === 5) return ['host_hero_plus_4', 'balanced_five', 'editorial_five', 'speaker_plus_4'];
  if (occupancy === 6) return ['host_led_six', 'balanced_six', 'event_panel_six', 'speaker_focus_six'];
  return [];
};

const confidenceFor = (score: number): StageIntelligenceConfidenceV1 =>
  score >= STAGE_INTELLIGENCE_POLICY_V1.strongScore ? 'STRONG'
    : score >= STAGE_INTELLIGENCE_POLICY_V1.goodScore ? 'GOOD' : 'WEAK';

const sceneForPeopleStrategy = (
  strategy: EditorialPeopleLayoutStrategyV2,
): ProgramScene => strategy.startsWith('solo_') ? 'host_focus' : 'panel_focus';

const candidate = (
  values: Omit<Candidate, 'isCurrentScene' | 'isSafetyFallback'>
    & Partial<Pick<Candidate, 'isCurrentScene' | 'isSafetyFallback'>>,
): Candidate => ({ ...values, isCurrentScene: values.isCurrentScene ?? false,
  isSafetyFallback: values.isSafetyFallback ?? false });

const scorePeopleStrategy = (
  input: StageIntelligenceInputV1,
  strategy: EditorialPeopleLayoutStrategyV2,
  scene: ProgramScene,
) => {
  let score = 58;
  const reasons: StageIntelligenceReasonCodeV1[] = [];
  const intent = EDITORIAL_INTENT_BY_PEOPLE_STRATEGY_V2[strategy];
  const assignedRoles = HUMAN_SLOTS.slice(0, input.occupancy)
    .map((slot) => input.programmeRoles[slot]);
  const hasPrimaryHost = assignedRoles.includes('primary_host');
  const equalRolePanel = assignedRoles.every((role) => !role || role === 'guest' || role === 'co_host');
  if (strategy === 'solo_host') { score += 27; reasons.push('SOLO_HOST'); }
  else if (intent === 'host_led_discussion') {
    score += hasPrimaryHost ? 26 : 12;
    reasons.push(hostReason(input.occupancy));
  }
  if (intent === 'balanced_conversation') {
    score += equalRolePanel ? 23 : 18;
    reasons.push('BALANCED_CONVERSATION');
  }
  if (intent === 'panel_discussion') {
    score += input.occupancy >= 4 && equalRolePanel ? 20 : input.occupancy >= 4 ? 15 : 4;
    reasons.push('BALANCED_CONVERSATION');
  }
  if (intent === 'speaker_focus') {
    if (!input.sustainedSpeaker || input.sustainedSpeaker.durationMs < 4_000) return null;
    score += STAGE_INTELLIGENCE_POLICY_V1.sustainedSpeakerBoost;
    reasons.push('SUSTAINED_SPEAKER');
  }
  if (input.canvas === 'portrait_9_16' && input.occupancy >= 5) {
    if (strategy.includes('balanced') || strategy === 'event_panel_six') score += 5;
    else score -= 8;
    reasons.push('PORTRAIT_DENSE_PANEL');
  }
  if (input.canvas === 'landscape_16_9' && input.occupancy >= 3) {
    score += strategy.includes('host_') ? 6 : 3;
    reasons.push('LANDSCAPE_PANEL_FIT');
  }
  const isCurrent = scene === input.programScene && intent === input.programIntent;
  if (isCurrent) score += STAGE_INTELLIGENCE_POLICY_V1.currentSceneContinuity;
  return { score, reasons, intent, isCurrent };
};

const shortPeopleReason = (intent: EditorialIntentV2, occupancy: number) => {
  if (occupancy === 1) return 'A clean, authored frame for the Host.';
  if (intent === 'speaker_focus') return 'One speaker has held the floor.';
  if (intent === 'host_led_discussion') {
    return `Best fit for one Host and ${occupancy - 1} ${occupancy === 2 ? 'guest' : 'guests'}.`;
  }
  return `Balances all ${occupancy} people on stage.`;
};

const screenLifecycle = (sources: readonly ProgramSource[]): StageIntelligenceScreenLifecycleV1 => {
  const screen = sources.find((source) => source.type === 'screen_share');
  return screen ? sourceHealthState(screen) : 'absent';
};

const addContinuityPenalties = (input: StageIntelligenceInputV1, entry: Candidate): Candidate => {
  let score = entry.score;
  if (!entry.isCurrentScene && input.sceneDwellMs < STAGE_INTELLIGENCE_POLICY_V1.minimumSceneDwellMs) {
    score -= STAGE_INTELLIGENCE_POLICY_V1.shortDwellSwitchPenalty;
  }
  if (!entry.isCurrentScene && input.recentSceneHistory.slice(-2).includes(entry.scene)) {
    score -= STAGE_INTELLIGENCE_POLICY_V1.recentScenePenalty;
  }
  return { ...entry, score };
};

const editorialPriority = (strategy: StageIntelligenceStrategyV1) => {
  const priority = STAGE_INTELLIGENCE_POLICY_V1.editorialPriority.indexOf(strategy);
  return priority < 0 ? Number.MAX_SAFE_INTEGER : priority;
};

const stableCandidateSort = (left: Candidate, right: Candidate) =>
  right.score - left.score
  || editorialPriority(left.strategyId) - editorialPriority(right.strategyId)
  || left.strategyId.localeCompare(right.strategyId)
  || left.scene.localeCompare(right.scene);

const asRecommendation = (
  entry: Candidate,
  rank: number,
  kind: StageRecommendationV1['kind'] = 'scene',
): StageRecommendationV1 => ({
  ...entry,
  kind,
  rank,
  confidenceBand: confidenceFor(entry.score),
});

export const editorialIntentForProgramSceneV1 = (scene: ProgramScene): EditorialIntentV2 => {
  if (scene === 'host_focus') return 'solo_focus';
  if (scene === 'panel_focus') return 'balanced_conversation';
  if (scene === 'quick_connect_active') return 'active_pair';
  if (scene === 'pair_forming') return 'pair_forming';
  if (scene === 'host_plus_pool') return 'host_plus_pool';
  if (scene === 'pool_focus') return 'pool_focus';
  if (scene === 'audience_pulse') return 'audience_pulse';
  if (scene === 'odo_stage' || scene === 'conversation_topic') return 'odo_stage';
  if (scene === 'music_intermission') return 'music_intermission';
  if (scene === 'branded_intermission') return 'safe_intermission';
  if (scene === 'session_closing') return 'closing';
  if (scene === 'screen_full') return 'screen_presentation';
  if (scene === 'screen_plus_host') return 'screen_plus_speaker';
  if (scene === 'screen_plus_pair') return 'screen_plus_pair';
  if (scene === 'screen_plus_panel' || scene === 'screen_discussion') return 'screen_plus_panel';
  if (scene === 'screen_plus_pool') return 'screen_plus_pool';
  return 'screen_presentation';
};

export const stageIntelligenceV1 = (
  input: StageIntelligenceInputV1,
): StageIntelligenceResultV1 => {
  const candidates: Candidate[] = [];
  const screenState = screenLifecycle(input.sources);
  const peopleAssignments = assignmentsForPeople(input);
  const safeAssignments = assignmentsForProgramScene(
    'branded_intermission', input.sources, input.programAssignments,
  );
  const safeSourceAvailable = assignedSourcesAreLegal(safeAssignments, ['odo'], input.sources);

  if (input.safetyMode === 'safe_scene_required' && safeSourceAvailable) {
    const safe = candidate({
      scene: 'branded_intermission', sceneIntent: 'safe_intermission', strategyId: 'safe_intermission',
      title: 'Safe intermission', score: STAGE_INTELLIGENCE_POLICY_V1.safetyRequiredScore,
      reasonCodes: ['SAFETY_REQUIRED'], shortReason: 'Public safety mode requires a protected scene.',
      factChip: 'Safety required', assignments: safeAssignments,
      isCurrentScene: input.programScene === 'branded_intermission', isSafetyFallback: false,
    });
    return {
      recommendations: [asRecommendation(safe, 1)],
      safetyFallback: null,
      eligibleCandidateCount: 1,
      screenLifecycle: screenState,
    };
  }

  const validOccupancy = Number.isInteger(input.occupancy)
    && input.occupancy >= 1 && input.occupancy <= 6
    && input.occupancy <= input.capacity
    && (input.occupancy <= 4 || (input.capacity === 6 && input.largePanelEnabled));
  const authoredPeopleCanvas = input.canvas !== 'square_1_1';
  const peopleSlots = HUMAN_SLOTS.slice(0, input.occupancy);
  if (validOccupancy && authoredPeopleCanvas
    && assignedSourcesAreLegal(peopleAssignments, peopleSlots, input.sources)) {
    for (const strategy of peopleStrategies(input.occupancy)) {
      const entry = EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.find((item) => item.strategy === strategy);
      if (!entry || entry.occupancy !== input.occupancy) continue;
      const scene = sceneForPeopleStrategy(strategy);
      const scored = scorePeopleStrategy(input, strategy, scene);
      if (!scored) continue;
      const degraded = peopleSlots.some((slot) => sourceFor(peopleAssignments, slot, input.sources)?.health === 'degraded');
      const reasons = [...scored.reasons];
      let score = scored.score;
      if (degraded) {
        score -= STAGE_INTELLIGENCE_POLICY_V1.degradedSourcePenalty;
        reasons.push('SOURCE_DEGRADED');
      }
      candidates.push(candidate({
        scene, sceneIntent: scored.intent, strategyId: strategy, title: peopleTitle(strategy),
        score, reasonCodes: reasons, shortReason: shortPeopleReason(scored.intent, input.occupancy),
        factChip: `${input.occupancy} on stage`, isCurrentScene: scored.isCurrent,
        assignments: peopleAssignments,
      }));
    }
  }

  const addScreen = (
    scene: ProgramScene,
    intent: EditorialIntentV2,
    strategyId: EditorialScreenLayoutStrategyV2,
    title: string,
    minimumPeople: number,
  ) => {
    if (!['ready', 'active', 'degraded'].includes(screenState)
      || input.canvas === 'square_1_1' || input.occupancy < minimumPeople) return;
    const assignments = assignmentsForProgramScene(scene, input.sources, peopleAssignments);
    const required: ProgramSourceSlot[] = scene === 'screen_full' ? ['primary']
      : scene === 'screen_plus_host' ? ['primary', 'host']
        : scene === 'screen_plus_pair' ? ['primary', 'pair'] : ['primary', 'host'];
    if (!assignedSourcesAreLegal(assignments, required, input.sources)) return;
    let score = 61 + (screenState === 'active'
      ? STAGE_INTELLIGENCE_POLICY_V1.activeScreenBoost
      : STAGE_INTELLIGENCE_POLICY_V1.readyScreenBoost);
    const reasons: StageIntelligenceReasonCodeV1[] = [
      screenState === 'active' ? 'SCREEN_ACTIVE' : 'SCREEN_READY',
    ];
    if (screenState === 'degraded') {
      score -= STAGE_INTELLIGENCE_POLICY_V1.degradedSourcePenalty;
      reasons.push('SOURCE_DEGRADED');
    }
    if (strategyId === 'screen_plus_host' && input.occupancy > 0) score += 8;
    if ((strategyId === 'screen_plus_panel' || strategyId === 'screen_discussion')
      && input.occupancy >= 3) score += 9;
    if (input.canvas === 'portrait_9_16' && input.occupancy >= 5
      && strategyId !== 'screen_full') {
      score -= 10;
      reasons.push('PORTRAIT_DENSE_PANEL');
    }
    candidates.push(candidate({
      scene, sceneIntent: intent, strategyId, title, score, reasonCodes: reasons,
      shortReason: screenState === 'active'
        ? `${title} fits the active Screen Share.` : `${title} is ready when presentation begins.`,
      factChip: screenState === 'active' ? 'Screen active' : 'Screen ready',
      isCurrentScene: scene === input.programScene && intent === input.programIntent,
      assignments,
    }));
  };
  addScreen('screen_full', 'screen_presentation', 'screen_full', 'Screen full', 0);
  addScreen('screen_plus_host', 'screen_plus_speaker', 'screen_plus_host', 'Screen + speaker', 1);
  addScreen('screen_plus_panel', 'screen_plus_panel', 'screen_plus_panel', 'Screen + panel', 2);
  addScreen('screen_discussion', 'screen_plus_panel', 'screen_discussion', 'Screen discussion', 2);

  if (input.activePair.active) {
    const assignments = assignmentsForProgramScene(
      'quick_connect_active', input.sources, input.programAssignments,
    );
    if (assignedSourcesAreLegal(assignments, ['pair'], input.sources)) {
      candidates.push(candidate({
        scene: 'quick_connect_active', sceneIntent: 'active_pair', strategyId: 'active_pair',
        title: 'Pair focus', score: 66 + STAGE_INTELLIGENCE_POLICY_V1.activePairBoost,
        reasonCodes: ['PAIR_ACTIVE'], shortReason: 'A public Quick Connect pair is active.',
        factChip: 'Pair active', isCurrentScene: input.programScene === 'quick_connect_active',
        assignments,
      }));
      if (['ready', 'active', 'degraded'].includes(screenState)) {
        addScreen('screen_plus_pair', 'screen_plus_pair', 'screen_plus_pair', 'Screen + pair', 0);
      }
    }
  }

  if (input.quickConnect.state !== 'closed' && input.quickConnect.poolCount > 0) {
    for (const [scene, title] of [
      ['host_plus_pool', 'Host + room'], ['pool_focus', 'Room focus'],
    ] as const) {
      const assignments = assignmentsForProgramScene(scene, input.sources, peopleAssignments);
      const required: ProgramSourceSlot[] = scene === 'host_plus_pool' ? ['host', 'pool'] : ['pool'];
      if (!assignedSourcesAreLegal(assignments, required, input.sources)) continue;
      candidates.push(candidate({
        scene, sceneIntent: scene, strategyId: scene, title,
        score: 58 + STAGE_INTELLIGENCE_POLICY_V1.poolWaitingBoost
          + (input.lowLiquidity ? 8 : 0),
        reasonCodes: input.lowLiquidity ? ['POOL_WAITING', 'LOW_LIQUIDITY'] : ['POOL_WAITING'],
        shortReason: `${input.quickConnect.poolCount} waiting in the public Quick Connect pool.`,
        factChip: `${input.quickConnect.poolCount} waiting`,
        isCurrentScene: scene === input.programScene, assignments,
      }));
    }
  }

  if (['ready', 'active'].includes(input.audiencePulse.lifecycle)) {
    const assignments = assignmentsForProgramScene(
      'audience_pulse', input.sources, input.programAssignments,
    );
    if (assignedSourcesAreLegal(assignments, ['pulse'], input.sources)) {
      const active = input.audiencePulse.lifecycle === 'active';
      candidates.push(candidate({
        scene: 'audience_pulse', sceneIntent: 'audience_pulse', strategyId: 'audience_pulse',
        title: 'Audience pulse',
        score: 60 + (active ? STAGE_INTELLIGENCE_POLICY_V1.activePulseBoost
          : STAGE_INTELLIGENCE_POLICY_V1.readyPulseBoost),
        reasonCodes: [active ? 'AUDIENCE_PULSE_ACTIVE' : 'AUDIENCE_PULSE_READY'],
        shortReason: active ? 'The public Audience Pulse is active.' : 'Audience Pulse is ready to open.',
        factChip: active ? 'Pulse active' : 'Pulse ready',
        isCurrentScene: input.programScene === 'audience_pulse', assignments,
      }));
    }
  }

  if (input.lowLiquidity) {
    const assignments = assignmentsForProgramScene('odo_stage', input.sources, input.programAssignments);
    if (assignedSourcesAreLegal(assignments, ['odo'], input.sources)) {
      candidates.push(candidate({
        scene: 'odo_stage', sceneIntent: 'odo_stage', strategyId: 'odo_stage',
        title: 'Odo moment', score: 61 + STAGE_INTELLIGENCE_POLICY_V1.lowLiquidityRecoveryBoost,
        reasonCodes: ['LOW_LIQUIDITY'],
        shortReason: 'A guided room moment can support the quiet stage.', factChip: 'Room is quiet',
        isCurrentScene: input.programScene === 'odo_stage', assignments,
      }));
    }
  }

  const eligible = candidates.map((entry) => addContinuityPenalties(input, entry))
    .filter((entry) => entry.score >= STAGE_INTELLIGENCE_POLICY_V1.minimumEditorialScore)
    .sort(stableCandidateSort);
  const current = eligible.find((entry) => entry.isCurrentScene);
  const best = eligible[0];
  const shouldHold = Boolean(current && best && (
    input.manualLocks.currentScene
    || best.score - current.score < STAGE_INTELLIGENCE_POLICY_V1.switchThreshold
    || input.sceneDwellMs < STAGE_INTELLIGENCE_POLICY_V1.minimumSceneDwellMs
  ));
  let ranked = eligible;
  if (shouldHold && current) {
    const reasons: StageIntelligenceReasonCodeV1[] = [
      'CURRENT_SCENE_STILL_STRONG',
      ...(input.manualLocks.currentScene ? ['MANUAL_LOCKED' as const] : []),
    ];
    const hold = candidate({
      ...current,
      title: 'Keep current',
      score: Math.max(current.score, best?.score ?? current.score),
      reasonCodes: reasons,
      shortReason: `${current.title} remains a strong fit.`,
      factChip: input.manualLocks.currentScene ? 'Locked' : 'On air',
      isCurrentScene: true,
    });
    ranked = [hold, ...eligible.filter((entry) => entry !== current)];
  }

  const recommendations = ranked.slice(0, STAGE_INTELLIGENCE_POLICY_V1.maximumRecommendations)
    .map((entry, index) => asRecommendation(entry, index + 1,
      shouldHold && index === 0 ? 'hold' : 'scene'));
  const safetyFallback = safeSourceAvailable ? asRecommendation(candidate({
    scene: 'branded_intermission', sceneIntent: 'safe_intermission', strategyId: 'safe_intermission',
    title: 'Branded intermission', score: STAGE_INTELLIGENCE_POLICY_V1.minimumEditorialScore,
    reasonCodes: ['SAFETY_FALLBACK'], shortReason: 'A protected fallback with no guest video.',
    factChip: 'Safe fallback', isCurrentScene: input.programScene === 'branded_intermission',
    isSafetyFallback: true, assignments: safeAssignments,
  }), recommendations.length + 1) : null;

  return {
    recommendations,
    safetyFallback,
    eligibleCandidateCount: eligible.length,
    screenLifecycle: screenState,
  };
};

export type StageIntelligenceTelemetryEventV1 =
  | 'stage_recommendations_generated'
  | 'stage_recommendation_previewed'
  | 'stage_recommendation_accepted'
  | 'stage_recommendation_ignored'
  | 'stage_manual_scene_selected'
  | 'stage_hold_current_recommended';

export const stageIntelligenceTelemetryPayloadV1 = (input: {
  recommendation?: StageRecommendationV1;
  scene?: ProgramScene;
  occupancy: number;
  canvas: ProgramTargetCanvas;
  programVersion: number;
  sourceGraphVersion: number;
  timeToActionMs?: number;
}) => ({
  scene_id: input.recommendation?.scene ?? input.scene ?? null,
  strategy_id: input.recommendation?.strategyId ?? null,
  rank: input.recommendation?.rank ?? null,
  reason_codes: input.recommendation?.reasonCodes ?? [],
  occupancy_bucket: Math.max(0, Math.min(6, Math.trunc(input.occupancy))),
  canvas: input.canvas,
  program_version: input.programVersion,
  source_graph_version: input.sourceGraphVersion,
  confidence_band: input.recommendation?.confidenceBand ?? null,
  time_to_action_ms: input.timeToActionMs === undefined
    ? null : Math.max(0, Math.trunc(input.timeToActionMs)),
});
