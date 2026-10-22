import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
  ADAPTIVE_STAGE_MANIFEST_VERSION,
  ADAPTIVE_STAGE_V2_SAFE_DEFAULTS,
  AdaptiveStageValidationError,
  PROGRAM_SCENES,
  PROGRAM_TARGET_CANVASES,
  SCENE_MANIFEST_V2,
  adaptiveStageManifestCoverageIsComplete,
  isNormalizedRect,
  parseLayoutPlanV2,
  resolveAdaptiveStageShadowV2,
  resolveLayoutPlanV2,
  sceneManifestV2,
  sourceGraphVersionFromSources,
  type ProgramSource,
  type ProgramSourceAssignments,
  type ProgramSourceSlot,
  type ProgramState,
} from '../packages/live-program-domain/src/index.ts';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const sourceFor = (
  slot: ProgramSourceSlot,
  type: ProgramSource['type'],
  index: number,
): ProgramSource => {
  const human = slot === 'host' || slot.startsWith('guest_');
  const suffix = String(index + 1).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    key: `fixture.${slot}.${index}`,
    type,
    role: slot === 'audio_screen' ? 'screen_audio'
      : slot === 'audio_atmosphere' ? 'atmosphere_audio'
        : slot === 'audio_host' ? 'host_audio' : 'visual',
    ownerUserId: human ? `10000000-0000-4000-8000-${suffix}` : null,
    providerUserId: human || type === 'screen_share'
      ? `provider-${slot}-${index}` : null,
    hasVideo: ['host_camera', 'participant_camera', 'screen_share'].includes(type),
    hasAudio: ['host_microphone', 'screen_share_audio', 'dj_audio', 'programme_music'].includes(type),
    readiness: 'ready',
    health: 'healthy',
    muted: false,
    failureReasonCode: null,
    generation: 1,
    version: 1,
    lastSeenAt: '2026-10-22T09:00:00.000Z',
  };
};

const fixture = (scene: ProgramState['scene'], canvas: ProgramState['targetCanvas'] = 'landscape_16_9') => {
  const definition = sceneManifestV2(scene);
  const sources = definition.slots.map((rule, index) => sourceFor(rule.slot, rule.accepts[0], index));
  const sourceAssignments = Object.fromEntries(
    sources.map((source, index) => [definition.slots[index].slot, source.key]),
  ) as ProgramSourceAssignments;
  const programState: ProgramState = {
    schemaVersion: 1,
    sessionId: '20000000-0000-4000-8000-000000000001',
    scene,
    targetCanvas: canvas,
    sourceAssignments,
    transition: 'auto',
    fallbackScene: definition.fallbackChain[0] ?? 'branded_intermission',
    programVersion: 7,
    showStateVersion: 9,
    controller: {
      source: 'studio_host',
      userId: '30000000-0000-4000-8000-000000000001',
      instanceId: '40000000-0000-4000-8000-000000000001',
      generation: 2,
      leaseExpiresAt: '2026-10-22T09:30:00.000Z',
    },
    updatedAt: '2026-10-22T09:00:00.000Z',
  };
  return { sources, programState };
};

const resolveFixture = (scene: ProgramState['scene'], canvas: ProgramState['targetCanvas'] = 'landscape_16_9') => {
  const value = fixture(scene, canvas);
  return resolveLayoutPlanV2({
    manifestVersion: ADAPTIVE_STAGE_MANIFEST_VERSION,
    programState: value.programState,
    sourceGraph: value.sources,
    sourceGraphVersion: sourceGraphVersionFromSources(value.sources),
    viewport: { width: 1920, height: 1080 },
    maximumPublishers: 6,
    largePanelEnabled: true,
    generatedAt: '2026-10-22T09:00:00.000Z',
  });
};

test('Manifest V2 covers every current scene exactly once', () => {
  assert.equal(adaptiveStageManifestCoverageIsComplete(), true);
  assert.equal(SCENE_MANIFEST_V2.length, 21);
  assert.deepEqual([...SCENE_MANIFEST_V2.map((entry) => entry.id)].sort(), [...PROGRAM_SCENES].sort());
  assert.equal(new Set(SCENE_MANIFEST_V2.map((entry) => entry.id)).size, PROGRAM_SCENES.length);
  SCENE_MANIFEST_V2.forEach((entry) => {
    assert.equal(entry.schemaVersion, 2);
    assert.equal(entry.manifestVersion, ADAPTIVE_STAGE_MANIFEST_VERSION);
    assert.equal(entry.privacy.privateEngagementExcluded, true);
  });
});

test('all current scene/canvas plans use bounded normalized geometry', () => {
  PROGRAM_SCENES.forEach((scene) => PROGRAM_TARGET_CANVASES.forEach((canvas) => {
    const plan = resolveFixture(scene, canvas);
    assert.equal(plan.resolverVersion, ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION);
    plan.regions.forEach((region) => assert.equal(isNormalizedRect(region.rect), true));
    assert.ok(parseLayoutPlanV2(plan));
  }));
});

test('resolver hash is deterministic and ignores source-array and clock ordering', () => {
  const value = fixture('screen_plus_panel');
  const input = {
    manifestVersion: ADAPTIVE_STAGE_MANIFEST_VERSION,
    programState: value.programState,
    sourceGraph: value.sources,
    sourceGraphVersion: sourceGraphVersionFromSources(value.sources),
    viewport: { width: 1920, height: 1080 },
    maximumPublishers: 6 as const,
    largePanelEnabled: true,
  };
  const first = resolveLayoutPlanV2({ ...input, generatedAt: '2026-10-22T09:00:00.000Z' });
  const second = resolveLayoutPlanV2({
    ...input,
    sourceGraph: [...value.sources].reverse(),
    generatedAt: '2026-10-22T09:01:00.000Z',
  });
  assert.equal(first.planHash, second.planHash);
  assert.equal(sourceGraphVersionFromSources(value.sources), sourceGraphVersionFromSources([...value.sources].reverse()));
});

test('resolver rejects duplicate people, wrong source type, capacity bypass and stale contracts', () => {
  const panel = fixture('panel_focus');
  const humanSources = panel.sources.filter((source) => Boolean(source.ownerUserId));
  const duplicated = panel.sources.map((source) => source.key === humanSources[1]?.key
    ? { ...source, ownerUserId: humanSources[0]?.ownerUserId ?? null }
    : source);
  const base = {
    manifestVersion: ADAPTIVE_STAGE_MANIFEST_VERSION,
    programState: panel.programState,
    sourceGraph: duplicated,
    sourceGraphVersion: 11,
    viewport: { width: 1080, height: 1920 },
    maximumPublishers: 6 as const,
    largePanelEnabled: true,
  };
  assert.throws(() => resolveLayoutPlanV2(base), (error) =>
    error instanceof AdaptiveStageValidationError && error.code === 'HUMAN_DUPLICATED');
  assert.throws(() => resolveLayoutPlanV2({ ...base, sourceGraph: panel.sources, maximumPublishers: 4 }),
    (error) => error instanceof AdaptiveStageValidationError && error.code === 'CAPACITY_EXCEEDED');
  assert.throws(() => resolveLayoutPlanV2({ ...base, sourceGraph: panel.sources, manifestVersion: 'obsolete' }),
    (error) => error instanceof AdaptiveStageValidationError && error.code === 'MANIFEST_OUTDATED');
  assert.throws(() => resolveLayoutPlanV2({
    ...base,
    sourceGraph: panel.sources,
    expectedSourceGraphVersion: 10,
  }), (error) => error instanceof AdaptiveStageValidationError && error.code === 'SOURCE_GRAPH_STALE');

  const host = fixture('host_focus');
  assert.throws(() => resolveLayoutPlanV2({
    ...base,
    programState: host.programState,
    sourceGraph: [{ ...host.sources[0], type: 'screen_share' }],
  }), (error) => error instanceof AdaptiveStageValidationError && error.code === 'SOURCE_TYPE_INVALID');
});

test('shadow plan emits semantic parity without taking renderer authority', () => {
  const value = fixture('screen_plus_host');
  const shadow = resolveAdaptiveStageShadowV2({
    programState: value.programState,
    sourceGraph: value.sources,
    viewport: { width: 390, height: 844 },
    maximumPublishers: 4,
    largePanelEnabled: false,
  });
  assert.ok(shadow.plan);
  assert.equal(shadow.comparison?.semanticMatch, true);
  assert.deepEqual(shadow.events.map((event) => event.name), [
    'adaptive_stage_v2_shadow_plan_generated',
    'adaptive_stage_v2_shadow_match',
  ]);
  assert.deepEqual(ADAPTIVE_STAGE_V2_SAFE_DEFAULTS, {
    shadow: false,
    diagnostics: false,
    studioRender: false,
    nativeRender: false,
    compositorRender: false,
  });
});

test('shadow comparison matches V1 identities for every current scene and canvas', () => {
  PROGRAM_SCENES.forEach((scene) => PROGRAM_TARGET_CANVASES.forEach((canvas) => {
    const value = fixture(scene, canvas);
    const result = resolveAdaptiveStageShadowV2({
      programState: value.programState,
      sourceGraph: value.sources,
      viewport: { width: 1080, height: 1920 },
      maximumPublishers: 6,
      largePanelEnabled: true,
    });
    assert.equal(result.comparison?.semanticMatch, true, `${scene}:${canvas}`);
  }));
});

test('resolver remains bounded under repeated snapshot generation', () => {
  const started = performance.now();
  for (let index = 0; index < 1_000; index += 1) resolveFixture('screen_plus_panel');
  assert.ok(performance.now() - started < 2_000);
});

test('server mirror covers all scenes and closes every malicious assignment class', () => {
  const migration = read('supabase/migrations/20261022103952_adaptive_stage_engine_2_milestone_1.sql');
  const subjectSafety = read('supabase/migrations/20261022104646_adaptive_stage_subject_safe_publisher_validation.sql');
  PROGRAM_SCENES.forEach((scene) => assert.match(migration, new RegExp(`'${scene.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)));
  [
    'manifest_outdated', 'program_canvas_unsupported', 'source_graph_stale',
    'program_source_not_found', 'program_source_not_ready', 'program_source_type_invalid',
    'program_source_duplicated', 'program_source_identity_missing', 'program_human_duplicated',
    'program_human_not_admitted', 'program_capacity_exceeded',
    'program_large_panel_unavailable', 'program_active_pair_not_authoritative',
    'program_quick_connect_capacity_exceeded',
  ].forEach((reason) => assert.match(migration, new RegExp(reason)));
  assert.match(migration, /for share/);
  assert.match(migration, /set search_path = public, private, pg_catalog/);
  assert.match(migration, /revoke all on function public\.rpc_studio_take_live_program_v3/);
  assert.match(subjectSafety, /private\.live_program_subject_is_studio_publisher_v1/);
  assert.doesNotMatch(subjectSafety, /live_studio_is_authorized_v1\(/);
});

test('arbitrary RTC fallbacks are absent and compositor parsing is shared/deep', () => {
  const studio = read('apps/studio/src/program/ProgramRenderer.tsx');
  const compositor = read('apps/program-compositor-worker/renderer/ProgramCanvas.tsx');
  const native = read('features/live/components/StreamLiveStage.tsx');
  const contracts = read('apps/program-compositor-worker/renderer/contracts.ts');
  [studio, compositor].forEach((source) => {
    assert.doesNotMatch(source, /roomParticipants\[0\]/);
    assert.doesNotMatch(source, /roomParticipants\.slice\(0/);
  });
  assert.doesNotMatch(native, /\?\? participants\[0\]/);
  assert.match(contracts, /parseProgramState/);
  assert.match(contracts, /parseProgramSources/);
});

test('mobile miniature converts normalized geometry and Program stays outside Room Pulse/footer', () => {
  const mobilePanel = read('features/live/components/LiveMobileProgrammePanel.tsx');
  assert.match(mobilePanel, /left: `\$\{region\.x \* 100\}%`/);
  assert.match(mobilePanel, /height: `\$\{region\.height \* 100\}%`/);
  const room = read('app/live/[sessionId].tsx');
  assert.match(room, /<StreamLiveStage/);
  assert.match(room, /<LiveConversationPanel/);
  assert.match(room, /<LiveControlDock/);
  assert.doesNotMatch(read('features/live/components/LiveAuthoritativeProgramStage.tsx'), /LiveConversationPanel|LiveControlDock/);
});

test('release provenance and central shadow telemetry cover all three renderers', () => {
  const studioMain = read('apps/studio/src/main.tsx');
  const studioWorkspace = read('apps/studio/src/workspace/StudioWorkspace.tsx');
  const nativeStage = read('features/live/components/StreamLiveStage.tsx');
  const compositor = read('apps/program-compositor-worker/renderer/CompositorApp.tsx');
  const worker = read('apps/program-compositor-worker/src/worker.mjs');
  const orchestrator = read('supabase/functions/live-broadcast-orchestrator/index.ts');
  const migration = read('supabase/migrations/20261022134658_adaptive_stage_release_telemetry.sql');

  assert.match(studioMain, /studioReleaseProvenance/);
  assert.match(studioWorkspace, /recordAdaptiveStageDiagnostic/);
  assert.match(nativeStage, /adaptiveStageNativeReleaseProvenance/);
  assert.match(nativeStage, /recordAdaptiveStageDiagnostic/);
  assert.match(compositor, /reportDiagnostic/);
  assert.match(worker, /sourceRevision/);
  assert.match(worker, /diagnostic/);
  assert.match(orchestrator, /rpc_service_record_adaptive_stage_v2_diagnostic_v1/);
  assert.match(migration, /runtime\.lease_generation = p_lease_generation/);
  assert.match(migration, /flags\.shadow_enabled and flags\.diagnostics_enabled/);
});
