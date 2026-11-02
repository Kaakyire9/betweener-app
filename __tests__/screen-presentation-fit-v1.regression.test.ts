import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  requiredCropFractionV1,
  resolveScreenPresentationPolicyV1,
} from '../packages/live-program-domain/src/index.ts';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

test('canonical aspect matrix resolves deterministic FIT and FILL geometry', () => {
  const cases = [
    [16 / 9, 'portrait_9_16', 0.68359375],
    [16 / 9, 'landscape_16_9', 0],
    [16 / 9, 'square_1_1', 0.4375],
    [4 / 3, 'portrait_9_16', 0.578125],
    [4 / 3, 'landscape_16_9', 0.25],
    [9 / 16, 'portrait_9_16', 0],
    [9 / 16, 'landscape_16_9', 0.68359375],
  ] as const;
  const targetAspect = { portrait_9_16: 9 / 16, landscape_16_9: 16 / 9, square_1_1: 1 };
  cases.forEach(([sourceAspect, canvas, crop]) => {
    assert.ok(Math.abs(requiredCropFractionV1(sourceAspect, targetAspect[canvas]) - crop) < 1e-8);
    const fit = resolveScreenPresentationPolicyV1({
      screenFitMode: 'fit', contentMode: 'media', sourceAspect, targetCanvas: canvas,
    });
    const fill = resolveScreenPresentationPolicyV1({
      screenFitMode: 'fill', contentMode: 'document', sourceAspect, targetCanvas: canvas,
    });
    assert.equal(fit.fit, 'contain');
    assert.equal(fit.matte, 'brand_static');
    assert.equal(fill.fit, 'cover');
    assert.equal(fill.matte, 'none');
  });
});

test('AUTO is conservative and only fills metadata-approved media inside the crop threshold', () => {
  for (const contentMode of ['unknown', 'document', 'presentation', 'demo'] as const) {
    assert.equal(resolveScreenPresentationPolicyV1({
      screenFitMode: 'auto', contentMode, sourceAspect: 16 / 9, targetCanvas: 'landscape_16_9',
    }).fit, 'contain');
  }
  assert.equal(resolveScreenPresentationPolicyV1({
    screenFitMode: 'auto', contentMode: 'media', sourceAspect: 16 / 9,
    targetCanvas: 'landscape_16_9',
  }).fit, 'cover');
  assert.equal(resolveScreenPresentationPolicyV1({
    screenFitMode: 'auto', contentMode: 'media', sourceAspect: 16 / 9,
    targetCanvas: 'portrait_9_16',
  }).fit, 'contain');
});

test('16:9 FIT into 16:9 occupies the complete stage with no Betweener-created bars', () => {
  const result = resolveScreenPresentationPolicyV1({
    screenFitMode: 'fit', contentMode: 'document', sourceAspect: 16 / 9,
    targetCanvas: 'landscape_16_9',
  });
  assert.equal(result.occupiedMediaAreaRatio, 1);
  assert.equal(result.requiredCropFraction, 0);
});

test('Studio, native and compositor consume the same canonical presentation resolver', () => {
  const resolver = 'resolveProgramScreenPresentationV1';
  assert.match(read('apps/studio/src/program/ProgramRenderer.tsx'), new RegExp(resolver));
  assert.match(read('features/live/components/LiveAuthoritativeProgramStage.tsx'), new RegExp(resolver));
  assert.match(read('apps/program-compositor-worker/renderer/ProgramCanvas.tsx'), new RegExp(resolver));
  assert.doesNotMatch(read('apps/program-compositor-worker/renderer/styles.css'),
    /screen[^\n]*object-fit:\s*cover[^\n]*!important/i);
});

test('fit changes remain presentation-only and do not touch RTC identity or audio bindings', () => {
  const preview = read('packages/live-program-domain/src/preview.ts');
  const nativeSurface = read('features/live/components/LiveScreenPresentationSurface.tsx');
  const compositor = read('apps/program-compositor-worker/renderer/ProgramCanvas.tsx');
  assert.match(preview, /set_screen_fit/);
  assert.match(preview,
    /case 'set_screen_fit': return \{ \.\.\.state, screenFitMode: action\.screenFitMode, dirty: true \};/);
  assert.match(nativeSurface, /participant=\{participant\}/);
  assert.match(compositor, /audioBindings/);
  assert.match(compositor, /screenShareAudioTrack/);
});

test('feature flags are default-off and Room Pulse remains outside fit implementation', () => {
  const flags = read('apps/studio/src/program/screen-presentation-fit-flags.ts');
  const migration = read('supabase/migrations/20261025190010_screen_presentation_fit_v1.sql');
  assert.match(flags, /=== 'true'/);
  assert.match(migration, /screen_fit_v1_enabled boolean not null default false/);
  assert.match(migration, /screen_fit_lab_enabled boolean not null default false/);
  assert.match(migration, /p_expected_source_graph_version/);
  assert.match(migration, /p_screen_fit_mode not in \('auto', 'fit', 'fill'\)/);
  assert.match(migration, /source\.source_type = 'screen_share'/);
  assert.match(migration, /live_studio_is_authorized_v1|rpc_studio_upsert_live_program_source_v1/);
  assert.match(migration, /revoke all on function public\.rpc_studio_take_live_program_v4/);
  for (const path of [
    'packages/live-program-domain/src/screen-presentation-fit-v1.ts',
    'apps/studio/src/program/ProgramRenderer.tsx',
    'features/live/components/LiveScreenPresentationSurface.tsx',
    'apps/program-compositor-worker/renderer/ProgramCanvas.tsx',
  ]) assert.doesNotMatch(read(path), /LiveConversationPanel|LiveControlDock|composer/i);
});
