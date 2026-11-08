import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EDITORIAL_PEOPLE_LAYOUT_BOOK_V2,
  EDITORIAL_SCREEN_LAYOUT_STRATEGIES_V2,
  type ProgramSource,
} from '../packages/live-program-domain/src/index.ts';
import {
  M2PreviewModelError,
  M2_EDITORIAL_MOMENT_STRATEGIES,
  buildM2MomentPreviewModel,
  buildM2PeoplePreviewModel,
  buildM2ScreenPreviewModel,
} from '../apps/studio/src/program/adaptive-stage-m2-preview-model.ts';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

test('all 23 canonical strategies render from the shared LayoutPlan on both canvases', () => {
  assert.equal(EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.length, 23);
  for (const entry of EDITORIAL_PEOPLE_LAYOUT_BOOK_V2) {
    for (const canvas of ['portrait_9_16', 'landscape_16_9'] as const) {
      const model = buildM2PeoplePreviewModel({
        strategy: entry.strategy,
        canvas,
        mode: 'fixture',
      });
      assert.equal(model.strategy, entry.strategy);
      assert.equal(model.regions.length, entry.occupancy);
      assert.equal(Object.keys(model.sourcesBySlot).length, entry.occupancy);
      assert.equal(new Set(Object.values(model.sourcesBySlot).map((source) => source?.ownerUserId)).size,
        entry.occupancy);
    }
  }
});

test('five and six-person Preview models contain exactly five and six unique people', () => {
  const five = buildM2PeoplePreviewModel({
    strategy: 'editorial_five', canvas: 'portrait_9_16', mode: 'fixture',
  });
  const six = buildM2PeoplePreviewModel({
    strategy: 'event_panel_six', canvas: 'landscape_16_9', mode: 'fixture',
  });
  assert.equal(five.regions.length, 5);
  assert.equal(five.regions.some((region) => region.slot === 'guest_5'), false);
  assert.equal(six.regions.length, 6);
  assert.equal(six.largePanelPreview, true);
});

test('screen source remains outside the human occupancy and uses full/contain presentation', () => {
  for (const strategy of EDITORIAL_SCREEN_LAYOUT_STRATEGIES_V2) {
    const model = buildM2ScreenPreviewModel({
      strategy,
      canvas: 'portrait_9_16',
      peopleCount: 6,
    });
    assert.equal(model.regions[0]?.slot, 'primary');
    assert.equal(model.sourcesBySlot.primary?.role, 'screen');
    assert.equal(model.sourcesBySlot.primary?.presentationFit, 'contain');
    assert.equal(model.occupancy, strategy === 'screen_full' ? 0
      : strategy === 'screen_plus_host' ? 1
        : strategy === 'screen_plus_pair' ? 2 : 6);
  }
});

test('Quick Connect, Audience Pulse and Odo remain non-authoritative visual fixtures', () => {
  for (const strategy of M2_EDITORIAL_MOMENT_STRATEGIES) {
    const model = buildM2MomentPreviewModel({ strategy, canvas: 'portrait_9_16' });
    assert.equal(model.fixture, true);
    assert.ok(model.regions.length > 0);
  }
  assert.equal(buildM2MomentPreviewModel({ strategy: 'odo_stage', canvas: 'portrait_9_16' })
    .sourcesBySlot.odo?.role, 'odo');
  assert.equal(buildM2MomentPreviewModel({ strategy: 'pair_forming', canvas: 'portrait_9_16' })
    .sourcesBySlot.pool?.ownerUserId, 'fixture-pool');
});

test('camera-off, reconnect and degraded states preserve the same owner binding', () => {
  const states = ['camera_off', 'reconnecting', 'degraded'] as const;
  for (const mediaState of states) {
    const model = buildM2PeoplePreviewModel({
      strategy: 'host_guest_interview', canvas: 'portrait_9_16', mode: 'fixture', mediaState,
    });
    assert.equal(model.sourcesBySlot.host?.ownerUserId, 'fixture-owner-1');
    assert.equal(model.sourcesBySlot.host?.mediaState, mediaState);
  }
});

test('authoritative Preview binds exact source keys and rejects missing or duplicate owners', () => {
  const source = (key: string, owner: string): ProgramSource => ({
    id: key, key, type: key.includes('host') ? 'host_camera' : 'participant_camera', role: 'visual',
    ownerUserId: owner, providerUserId: `provider-${owner}`, hasVideo: true, hasAudio: true,
    readiness: 'live', health: 'healthy', muted: false, failureReasonCode: null,
    generation: 1, version: 1, lastSeenAt: new Date(0).toISOString(),
  });
  const sources = [source('source.host', 'owner-host'), source('source.guest', 'owner-guest')];
  const model = buildM2PeoplePreviewModel({
    strategy: 'host_guest_interview', canvas: 'landscape_16_9', mode: 'authoritative',
    assignments: { host: 'source.host', guest_1: 'source.guest' }, sources,
  });
  assert.equal(model.sourcesBySlot.host?.providerUserId, 'provider-owner-host');
  assert.equal(model.sourcesBySlot.guest_1?.providerUserId, 'provider-owner-guest');
  assert.throws(() => buildM2PeoplePreviewModel({
    strategy: 'host_guest_interview', canvas: 'landscape_16_9', mode: 'authoritative',
    assignments: { host: 'source.host' }, sources,
  }), (error) => error instanceof M2PreviewModelError && error.code === 'MISSING_SOURCE');
  assert.throws(() => buildM2PeoplePreviewModel({
    strategy: 'host_guest_interview', canvas: 'landscape_16_9', mode: 'authoritative',
    assignments: { host: 'source.host', guest_1: 'source.duplicate' },
    sources: [source('source.host', 'owner-host'), source('source.duplicate', 'owner-host')],
  }), (error) => error instanceof M2PreviewModelError && error.code === 'DUPLICATE_OWNER_IDENTITY');
});

test('M2 Studio Preview is double-gated and cannot submit Program commands', () => {
  const flags = read('apps/studio/src/program/adaptive-stage-m2-preview-flags.ts');
  const preview = read('apps/studio/src/program/AdaptiveStageM2Preview.tsx');
  const workspace = read('apps/studio/src/workspace/StudioWorkspace.tsx');
  assert.match(flags, /master.*VITE_ADAPTIVE_STAGE_M2_ENABLED/s);
  assert.match(flags, /studioPreview.*VITE_ADAPTIVE_STAGE_M2_STUDIO_PREVIEW_ENABLED/s);
  assert.match(flags, /master && adaptiveStageM2PreviewFlags\.studioPreview/);
  assert.doesNotMatch(preview, /takeProgram|buildStudioTakeCommand|studioApi\./);
  assert.match(workspace, /disabled=\{m2ReviewActive \|\| !lease\.ownsControl/);
  assert.match(workspace, /M2 Program authority is not enabled/);
});

test('M2.1 does not change native, compositor or Room Pulse code paths', () => {
  const changedSurface = [
    'apps/studio/src/program/AdaptiveStageM2Preview.tsx',
    'apps/studio/src/program/adaptive-stage-m2-preview-model.ts',
  ].map(read).join('\n');
  assert.doesNotMatch(changedSurface, /RoomPulse|program-compositor|react-native/);
});
