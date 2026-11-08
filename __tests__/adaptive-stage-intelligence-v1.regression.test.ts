import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  stageIntelligenceTelemetryPayloadV1,
  stageIntelligenceV1,
  type ProgramSource,
  type ProgramSourceType,
  type StageIntelligenceInputV1,
} from '../packages/live-program-domain/src/index.ts';

const source = (
  type: ProgramSourceType,
  index = 0,
  overrides: Partial<ProgramSource> = {},
): ProgramSource => ({
  id: `${type}-${index}`,
  key: `source.${type}.${index}`,
  type,
  role: type.includes('audio') || type.includes('microphone') ? 'host_audio' : 'visual',
  ownerUserId: ['host_camera', 'participant_camera'].includes(type) ? `owner-${index}` : null,
  providerUserId: ['host_camera', 'participant_camera'].includes(type) ? `provider-${index}` : null,
  hasVideo: !type.includes('audio') && type !== 'host_microphone',
  hasAudio: type.includes('audio') || type.includes('microphone'),
  readiness: 'live',
  health: 'healthy',
  muted: false,
  failureReasonCode: null,
  generation: 1,
  version: 1,
  lastSeenAt: new Date(0).toISOString(),
  ...overrides,
});

const people = (occupancy: number) => [
  source('host_camera', 0),
  ...Array.from({ length: Math.max(0, occupancy - 1) }, (_, index) =>
    source('participant_camera', index + 1)),
];

const baseInput = (occupancy: number, overrides: Partial<StageIntelligenceInputV1> = {}) => {
  const base: StageIntelligenceInputV1 = {
    programScene: 'branded_intermission',
    programIntent: 'safe_intermission',
    programAssignments: { odo: 'source.branded_visual.0' },
    previewScene: 'branded_intermission',
    previewIntent: 'safe_intermission',
    canvas: 'landscape_16_9',
    occupancy,
    programmeRoles: {
      host: 'primary_host', guest_1: 'guest', guest_2: 'guest', guest_3: 'guest',
      guest_4: 'guest', guest_5: 'guest',
    },
    sources: [...people(occupancy), source('branded_visual')],
    activePair: { active: false },
    quickConnect: { state: 'closed', poolCount: 0 },
    audiencePulse: { lifecycle: 'unavailable' },
    capacity: occupancy > 4 ? 6 : 4,
    largePanelEnabled: occupancy > 4,
    sustainedSpeaker: null,
    lowLiquidity: false,
    safetyMode: 'normal',
    manualLocks: { currentScene: false },
    sceneDwellMs: 60_000,
    recentSceneHistory: [],
  };
  return { ...base, ...overrides };
};

const strategies = (input: StageIntelligenceInputV1) =>
  stageIntelligenceV1(input).recommendations.map((item) => item.strategyId);

test('one-person Host recommends authored solo intents and never Panel', () => {
  const result = stageIntelligenceV1(baseInput(1));
  assert.equal(result.recommendations[0]?.strategyId, 'solo_host');
  assert.ok(result.recommendations.every((item) => item.scene !== 'panel_focus'));
  assert.equal(result.safetyFallback?.strategyId, 'safe_intermission');
});

test('Host plus one Guest ranks duo intents and only promotes pair with authority', () => {
  const normal = strategies(baseInput(2));
  assert.deepEqual(normal.slice(0, 2), ['host_guest_interview', 'balanced_duo']);
  assert.ok(!normal.includes('active_pair'));
  const paired = stageIntelligenceV1(baseInput(2, {
    activePair: { active: true },
    sources: [...people(2), source('active_pair'), source('branded_visual')],
  }));
  assert.equal(paired.recommendations[0]?.strategyId, 'active_pair');
});

test('Host plus two Guests ranks Host-led and balanced trio without fake speaker focus', () => {
  const result = stageIntelligenceV1(baseInput(3));
  assert.deepEqual(result.recommendations.slice(0, 2).map((item) => item.strategyId),
    ['host_hero_plus_2', 'balanced_trio']);
  assert.ok(result.recommendations.every((item) => item.strategyId !== 'speaker_focus_trio'));
});

test('authoritative programme roles change host-led versus equal-role ranking', () => {
  const result = stageIntelligenceV1(baseInput(3, {
    programmeRoles: { host: 'co_host', guest_1: 'co_host', guest_2: 'guest' },
  }));
  assert.equal(result.recommendations[0]?.strategyId, 'balanced_trio');
  assert.ok(result.recommendations[0]?.reasonCodes.includes('BALANCED_CONVERSATION'));
});

test('sustained healthy speaker promotes speaker focus without enabling automation', () => {
  const result = stageIntelligenceV1(baseInput(3, {
    sustainedSpeaker: { slot: 'guest_1', durationMs: 7_500 },
  }));
  assert.equal(result.recommendations[0]?.strategyId, 'speaker_focus_trio');
  assert.ok(result.recommendations[0]?.reasonCodes.includes('SUSTAINED_SPEAKER'));
});

test('five-person stage uses only authored five-person strategies', () => {
  const result = stageIntelligenceV1(baseInput(5));
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations.every((item) =>
    ['host_hero_plus_4', 'balanced_five', 'editorial_five'].includes(item.strategyId)));
});

test('six-person strategies require capacity and the per-Live large-panel gate', () => {
  const allowed = strategies(baseInput(6));
  assert.ok(allowed.includes('host_led_six'));
  assert.ok(allowed.includes('balanced_six'));
  const disallowed = stageIntelligenceV1(baseInput(6, {
    capacity: 4,
    largePanelEnabled: false,
  }));
  assert.equal(disallowed.recommendations.length, 0);
  assert.equal(disallowed.safetyFallback?.strategyId, 'safe_intermission');
});

test('screen family is absent without a source, moderate when ready and promoted when active', () => {
  assert.ok(strategies(baseInput(3)).every((item) => !String(item).startsWith('screen_')));
  const ready = stageIntelligenceV1(baseInput(3, {
    sources: [...people(3), source('screen_share', 0, { readiness: 'ready' }), source('branded_visual')],
  }));
  assert.equal(ready.screenLifecycle, 'ready');
  assert.notEqual(ready.recommendations[0]?.strategyId, 'screen_plus_panel');
  const active = stageIntelligenceV1(baseInput(3, {
    sources: [...people(3), source('screen_share'), source('branded_visual')],
  }));
  assert.equal(active.screenLifecycle, 'active');
  assert.ok(String(active.recommendations[0]?.strategyId).startsWith('screen_'));
});

test('degraded screen is penalized and lost screen candidates are ineligible', () => {
  const degraded = stageIntelligenceV1(baseInput(3, {
    sources: [...people(3), source('screen_share', 0, { health: 'degraded' }),
      source('branded_visual')],
  }));
  assert.equal(degraded.screenLifecycle, 'degraded');
  const screenCandidate = degraded.recommendations.find((item) =>
    String(item.strategyId).startsWith('screen_'));
  assert.ok(screenCandidate?.reasonCodes.includes('SOURCE_DEGRADED'));
  const lost = stageIntelligenceV1(baseInput(3, {
    sources: [...people(3), source('screen_share', 0, { health: 'lost' }),
      source('branded_visual')],
  }));
  assert.equal(lost.screenLifecycle, 'lost');
  assert.ok(lost.recommendations.every((item) => !String(item.strategyId).startsWith('screen_')));
});

test('Quick Connect pool, Audience Pulse and low liquidity rank only with legal sources', () => {
  const pool = stageIntelligenceV1(baseInput(1, {
    quickConnect: { state: 'open', poolCount: 4 },
    sources: [...people(1), source('quick_connect_pool'), source('branded_visual')],
  }));
  assert.ok(pool.recommendations.some((item) => item.strategyId === 'host_plus_pool'));
  const pulse = stageIntelligenceV1(baseInput(1, {
    audiencePulse: { lifecycle: 'active' },
    sources: [...people(1), source('audience_pulse'), source('branded_visual')],
  }));
  assert.equal(pulse.recommendations[0]?.strategyId, 'audience_pulse');
  const quiet = stageIntelligenceV1(baseInput(0, {
    lowLiquidity: true,
    sources: [source('odo_stage'), source('branded_visual')],
  }));
  assert.equal(quiet.recommendations[0]?.strategyId, 'odo_stage');
});

test('public safety mode makes the protected scene authoritative in recommendations', () => {
  const result = stageIntelligenceV1(baseInput(3, { safetyMode: 'safe_scene_required' }));
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0]?.strategyId, 'safe_intermission');
  assert.deepEqual(result.recommendations[0]?.reasonCodes, ['SAFETY_REQUIRED']);
});

test('HOLD CURRENT prevents nervous switching and respects a manual lock', () => {
  const assignments = {
    host: 'source.host_camera.0',
    guest_1: 'source.participant_camera.1',
    guest_2: 'source.participant_camera.2',
  };
  const stable = stageIntelligenceV1(baseInput(3, {
    programScene: 'panel_focus',
    programIntent: 'balanced_conversation',
    programAssignments: assignments,
    previewScene: 'panel_focus',
    previewIntent: 'balanced_conversation',
    sceneDwellMs: 8_000,
  }));
  assert.equal(stable.recommendations[0]?.kind, 'hold');
  assert.equal(stable.recommendations[0]?.title, 'Keep current');
  const locked = stageIntelligenceV1(baseInput(3, {
    programScene: 'panel_focus',
    programIntent: 'balanced_conversation',
    programAssignments: assignments,
    manualLocks: { currentScene: true },
  }));
  assert.equal(locked.recommendations[0]?.kind, 'hold');
  assert.ok(locked.recommendations[0]?.reasonCodes.includes('MANUAL_LOCKED'));
});

test('canvas policy deterministically changes dense-panel ranking', () => {
  const portrait = stageIntelligenceV1(baseInput(5, { canvas: 'portrait_9_16' }));
  const landscape = stageIntelligenceV1(baseInput(5, { canvas: 'landscape_16_9' }));
  assert.equal(portrait.recommendations[0]?.strategyId, 'balanced_five');
  assert.equal(landscape.recommendations[0]?.strategyId, 'host_hero_plus_4');
});

test('recent scene history applies deterministic anti-thrashing penalty', () => {
  const clean = stageIntelligenceV1(baseInput(3));
  const recent = stageIntelligenceV1(baseInput(3, { recentSceneHistory: ['panel_focus'] }));
  assert.ok((recent.recommendations[0]?.score ?? 0) < (clean.recommendations[0]?.score ?? 0));
});

test('telemetry payload is aggregate, bounded and identity-free', () => {
  const recommendation = stageIntelligenceV1(baseInput(3)).recommendations[0];
  const payload = stageIntelligenceTelemetryPayloadV1({
    recommendation,
    occupancy: 19,
    canvas: 'portrait_9_16',
    programVersion: 4,
    sourceGraphVersion: 9,
    timeToActionMs: 1240,
  });
  assert.equal(payload.occupancy_bucket, 6);
  assert.equal(payload.time_to_action_ms, 1240);
  assert.ok(!JSON.stringify(payload).includes('owner-'));
  assert.deepEqual(Object.keys(payload).sort(), [
    'canvas', 'confidence_band', 'occupancy_bucket', 'program_version', 'rank',
    'reason_codes', 'scene_id', 'source_graph_version', 'strategy_id', 'time_to_action_ms',
  ]);
});

test('Stage Intelligence contract cannot consume private engagement data', () => {
  const implementation = readFileSync(
    `${process.cwd()}/packages/live-program-domain/src/stage-intelligence-v1.ts`, 'utf8',
  );
  for (const forbidden of [
    'privateMessages', 'matchingScore', 'attractivenessScore', 'privateSpark',
    'privateOutcomes', 'contactDetails',
  ]) assert.doesNotMatch(implementation, new RegExp(forbidden, 'i'));
});

test('engine is pure advisory code with no Program or controller mutation path', () => {
  const implementation = readFileSync(
    `${process.cwd()}/packages/live-program-domain/src/stage-intelligence-v1.ts`, 'utf8',
  );
  assert.doesNotMatch(implementation, /takeProgram|buildStudioTakeCommand|supabase|fetch\(/);
});

test('Studio V1 is double-gated, separates recommendations from all scenes and never takes Program', () => {
  const flags = readFileSync(
    `${process.cwd()}/apps/studio/src/program/adaptive-stage-m2-preview-flags.ts`, 'utf8',
  );
  const sceneLibrary = readFileSync(
    `${process.cwd()}/apps/studio/src/program/SceneLibrary.tsx`, 'utf8',
  );
  const recommendations = readFileSync(
    `${process.cwd()}/apps/studio/src/program/StageIntelligenceRecommendations.tsx`, 'utf8',
  );
  assert.match(flags, /VITE_ADAPTIVE_STAGE_M2_ENABLED/);
  assert.match(flags, /VITE_ADAPTIVE_STAGE_M2_STAGE_INTELLIGENCE_ENABLED/);
  assert.match(flags, /master && adaptiveStageM2PreviewFlags\.stageIntelligence/);
  assert.match(sceneLibrary, /Recommended now/);
  assert.match(sceneLibrary, /All scenes/);
  assert.doesNotMatch(recommendations, /takeProgram|buildStudioTakeCommand|CUT/);
});

test('telemetry migration preserves authorization and allowlists only bounded event names', () => {
  const migration = readFileSync(
    `${process.cwd()}/supabase/migrations/20261023192724_adaptive_stage_intelligence_v1_telemetry.sql`,
    'utf8',
  );
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /p_event_name like 'stage_%'[\s\S]*live_studio_is_authorized_v1/);
  assert.match(migration, /live_studio_is_authorized_v1\(p_session_id, auth\.uid\(\), 'view'\)/);
  assert.match(migration, /stage_recommendations_generated/);
  assert.match(migration, /stage_recommendation_accepted/);
  assert.match(migration, /octet_length\(p_safe_details::text\) > 4096/);
  assert.match(migration, /revoke all[\s\S]*from public, anon/i);
  assert.doesNotMatch(migration, /private_spark|matching_score|private_message/i);
});
