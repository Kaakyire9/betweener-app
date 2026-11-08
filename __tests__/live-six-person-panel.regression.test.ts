import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LIVE_PROGRAM_VIDEO_SOURCE_LIMIT,
  LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT,
  assignmentsForProgramScene,
  programSceneAvailability,
  resolveAssignedProgramLayout,
  type ProgramSource,
} from '@betweener/live-program-domain';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const source = (key: string, type: ProgramSource['type'], ownerUserId: string): ProgramSource => ({
  id: key,
  key,
  type,
  role: 'visual',
  ownerUserId,
  providerUserId: ownerUserId,
  hasVideo: true,
  hasAudio: false,
  readiness: 'live',
  health: 'healthy',
  muted: false,
  failureReasonCode: null,
  generation: 1,
  version: 1,
  lastSeenAt: '2026-10-19T12:00:00.000Z',
});

test('six-person Program assigns distinct people and adapts to portrait and landscape', () => {
  assert.equal(LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT, 6);
  assert.equal(LIVE_PROGRAM_VIDEO_SOURCE_LIMIT, 7);
  const sources = [
    source('host.camera', 'host_camera', 'host'),
    ...Array.from({ length: 5 }, (_, index) => source(
      `guest.${index + 1}`,
      'participant_camera',
      `guest-${index + 1}`,
    )),
  ];
  const assignments = assignmentsForProgramScene('panel_focus', sources, {});
  assert.equal(new Set(Object.values(assignments)).size, 6);
  assert.equal(programSceneAvailability(
    'panel_focus', 'portrait_9_16', sources, assignments,
  ).available, true);

  const portrait = resolveAssignedProgramLayout('panel_focus', 'portrait_9_16', assignments);
  assert.equal(portrait.regions.length, 6);
  assert.deepEqual(
    [...new Set(portrait.regions.map((region) => region.x))],
    [0, 0.5],
  );
  const landscape = resolveAssignedProgramLayout('panel_focus', 'landscape_16_9', assignments);
  assert.equal(landscape.regions.length, 6);
  assert.deepEqual(
    [...new Set(landscape.regions.map((region) => region.x))],
    [0, 1 / 3, 2 / 3],
  );
});

test('database rollout keeps four as default and gates six with AAL2', () => {
  const migration = read('supabase/migrations/20261019131846_live_six_person_panel_and_mobile_programme.sql');
  const structureReasonRepair = read('supabase/migrations/20261021071324_live_session_structure_stage_capacity_reason.sql');
  assert.match(migration, /large_panel_enabled boolean not null default false/i);
  assert.match(migration, /maximum_publishers between 1 and 6/i);
  assert.match(migration, /p_maximum_publishers not in \(4, 6\)/i);
  assert.match(migration, /not public\.live_studio_has_aal2_v1\(\)/i);
  assert.match(migration, /rpc_mobile_take_live_program_v1/i);
  assert.match(migration, /studio_controller_active/i);
  assert.match(migration, /'guest_4','guest_5'/i);
  assert.match(migration, /format = 'quick_connect'/i);
  assert.match(structureReasonRepair, /live_session_structure_updates_reason_valid/i);
  assert.match(structureReasonRepair, /'session_structure', 'stage_intake', 'stage_capacity'/i);
});

test('native Control Room exposes a secure responsive Program quick switcher', () => {
  const panel = read('features/live/components/LiveMobileProgrammePanel.tsx');
  const modal = read('features/live/components/LiveStudioModal.tsx');
  const hook = read('features/live/hooks/use-live-mobile-programme-control.ts');
  assert.match(panel, /QUICK SCENES/);
  assert.match(panel, /LiveStepUpSheet/);
  assert.match(panel, /Four stays the default/);
  assert.match(panel, /live_step_up_action_failed/);
  assert.match(panel, /resolveAssignedProgramLayout/);
  assert.match(modal, /programmeController/);
  assert.match(modal, /label: 'Program'/);
  assert.match(hook, /expectedProgramVersion/);
  assert.match(hook, /programSceneAvailability/);
});
