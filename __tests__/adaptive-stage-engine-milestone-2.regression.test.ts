import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ADAPTIVE_STAGE_M2_FLAG_NAMES,
  ADAPTIVE_STAGE_M2_SAFE_DEFAULTS,
  AdaptiveStageM2LayoutError,
  EDITORIAL_INTENTS_V2,
  EDITORIAL_PEOPLE_LAYOUT_BOOK_V2,
  EDITORIAL_PEOPLE_LAYOUT_STRATEGIES_V2,
  ON_AIR_PROGRAMME_ROLES_V2,
  isNormalizedRect,
  resolveEditorialPeopleLayoutV2,
  resolveEditorialPeopleStrategyLayoutV2,
  type AdaptiveStageM2Flags,
  type ProgramSourceAssignments,
  type ProgramSourceSlot,
} from '../packages/live-program-domain/src/index.ts';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const HUMAN_SLOTS: readonly ProgramSourceSlot[] = [
  'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
];
const ENABLED_FLAGS: AdaptiveStageM2Flags = {
  ...ADAPTIVE_STAGE_M2_SAFE_DEFAULTS,
  enabled: true,
};

const assignmentsFor = (occupancy: number): ProgramSourceAssignments => Object.fromEntries(
  HUMAN_SLOTS.slice(0, occupancy).map((slot, index) => [slot, `fixture.${slot}.${index}`]),
);

const area = (region: { width: number; height: number }) => region.width * region.height;
const overlapArea = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) => Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  * Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));

test('Milestone 2 editorial vocabulary and every requested people strategy are canonical', () => {
  assert.equal(new Set(EDITORIAL_INTENTS_V2).size, EDITORIAL_INTENTS_V2.length);
  assert.equal(new Set(ON_AIR_PROGRAMME_ROLES_V2).size, ON_AIR_PROGRAMME_ROLES_V2.length);
  assert.deepEqual(
    EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.map((entry) => entry.strategy),
    [...EDITORIAL_PEOPLE_LAYOUT_STRATEGIES_V2],
  );
  [1, 2, 3, 4, 5, 6].forEach((occupancy) => {
    assert.ok(EDITORIAL_PEOPLE_LAYOUT_BOOK_V2.some((entry) => entry.occupancy === occupancy));
  });
});

test('authored balanced portrait and landscape layouts cover occupancy 1-6 without holes', () => {
  for (const occupancy of [1, 2, 3, 4, 5, 6] as const) {
    for (const canvas of ['portrait_9_16', 'landscape_16_9'] as const) {
      const layout = resolveEditorialPeopleLayoutV2({
        flags: ENABLED_FLAGS,
        intent: 'balanced_conversation',
        canvas,
        assignments: assignmentsFor(occupancy),
        maximumPublishers: occupancy > 4 ? 6 : 4,
        largePanelEnabled: occupancy > 4,
      });
      assert.equal(layout.regions.length, occupancy, `${canvas}:${occupancy}`);
      assert.equal(new Set(layout.regions.map((region) => region.slot)).size, occupancy);
      layout.regions.forEach((region) => assert.equal(isNormalizedRect(region), true));
      assert.ok(Math.abs(layout.regions.reduce((total, region) => total + area(region), 0) - 1) < 1e-9);
      layout.regions.forEach((region, index) => layout.regions.slice(index + 1).forEach((other) => {
        assert.equal(overlapArea(region, other), 0);
      }));
    }
  }
});

test('every authored strategy resolves independently on portrait and landscape canvases', () => {
  const resolved = new Set<string>();
  const intents = [
    'solo_focus', 'balanced_conversation', 'host_led_discussion', 'speaker_focus',
    'panel_discussion', 'match_introduction', 'pair_focus',
  ] as const;
  for (const occupancy of [1, 2, 3, 4, 5, 6] as const) {
    for (const intent of intents) {
      for (const canvas of ['portrait_9_16', 'landscape_16_9'] as const) {
        const layout = resolveEditorialPeopleLayoutV2({
          flags: ENABLED_FLAGS,
          intent,
          canvas,
          assignments: assignmentsFor(occupancy),
          programmeRoles: { host: 'primary_host', guest_1: 'active_speaker' },
          focusSlot: occupancy > 1 ? 'guest_1' : 'host',
          maximumPublishers: occupancy > 4 ? 6 : 4,
          largePanelEnabled: occupancy > 4,
        });
        resolved.add(layout.strategy);
        assert.equal(layout.regions.length, occupancy);
        layout.regions.forEach((region) => assert.equal(isNormalizedRect(region), true));
        assert.ok(Math.abs(layout.regions.reduce((total, region) => total + area(region), 0) - 1) < 1e-9);
      }
    }
  }
  resolved.add(resolveEditorialPeopleLayoutV2({
    flags: ENABLED_FLAGS,
    intent: 'solo_focus',
    canvas: 'portrait_9_16',
    assignments: assignmentsFor(1),
    programmeRoles: { host: 'presenter' },
    maximumPublishers: 4,
    largePanelEnabled: false,
  }).strategy);
  assert.deepEqual(resolved, new Set(EDITORIAL_PEOPLE_LAYOUT_STRATEGIES_V2));
});

test('every authored strategy can be selected directly for internal visual review', () => {
  for (const entry of EDITORIAL_PEOPLE_LAYOUT_BOOK_V2) {
    for (const canvas of ['portrait_9_16', 'landscape_16_9'] as const) {
      const layout = resolveEditorialPeopleStrategyLayoutV2({
        flags: ENABLED_FLAGS,
        strategy: entry.strategy,
        canvas,
        assignments: assignmentsFor(entry.occupancy),
        programmeRoles: { host: 'primary_host', guest_1: 'active_speaker' },
        focusSlot: 'guest_1',
        maximumPublishers: entry.occupancy > 4 ? 6 : 4,
        largePanelEnabled: entry.occupancy > 4,
      });
      assert.equal(layout.strategy, entry.strategy);
      assert.equal(layout.regions.length, entry.occupancy);
      layout.regions.forEach((region) => assert.equal(isNormalizedRect(region), true));
    }
  }
});

test('portrait and landscape are authored separately rather than stretched from one grid', () => {
  for (const occupancy of [2, 3, 4, 5, 6] as const) {
    const common = {
      flags: ENABLED_FLAGS,
      intent: 'host_led_discussion' as const,
      assignments: assignmentsFor(occupancy),
      programmeRoles: { host: 'primary_host' as const },
      maximumPublishers: (occupancy > 4 ? 6 : 4) as 4 | 6,
      largePanelEnabled: occupancy > 4,
    };
    const portrait = resolveEditorialPeopleLayoutV2({ ...common, canvas: 'portrait_9_16' });
    const landscape = resolveEditorialPeopleLayoutV2({ ...common, canvas: 'landscape_16_9' });
    assert.notDeepEqual(
      portrait.regions.map((region) => [region.x, region.y, region.width, region.height]),
      landscape.regions.map((region) => [region.x, region.y, region.width, region.height]),
    );
  }
});

test('host-led layouts keep the authoritative Host in the hero region', () => {
  for (const occupancy of [2, 3, 4, 5, 6] as const) {
    const layout = resolveEditorialPeopleLayoutV2({
      flags: ENABLED_FLAGS,
      intent: 'host_led_discussion',
      canvas: 'portrait_9_16',
      assignments: assignmentsFor(occupancy),
      programmeRoles: { host: 'primary_host' },
      maximumPublishers: occupancy > 4 ? 6 : 4,
      largePanelEnabled: occupancy > 4,
    });
    const host = layout.regions.find((region) => region.slot === 'host');
    assert.ok(host);
    assert.equal(area(host), Math.max(...layout.regions.map(area)));
    assert.equal(host.zIndex, 2);
  }
});

test('speaker focus promotes only the explicitly focused admitted source', () => {
  const layout = resolveEditorialPeopleLayoutV2({
    flags: ENABLED_FLAGS,
    intent: 'speaker_focus',
    canvas: 'landscape_16_9',
    assignments: assignmentsFor(5),
    programmeRoles: { host: 'primary_host', guest_3: 'active_speaker' },
    focusSlot: 'guest_3',
    maximumPublishers: 6,
    largePanelEnabled: true,
  });
  const focused = layout.regions.find((region) => region.slot === 'guest_3');
  assert.ok(focused);
  assert.equal(layout.strategy, 'speaker_plus_4');
  assert.equal(area(focused), Math.max(...layout.regions.map(area)));
  assert.deepEqual(
    new Set(layout.regions.map((region) => region.slot)),
    new Set(['host', 'guest_1', 'guest_2', 'guest_3', 'guest_4']),
  );
});

test('five-person compositions never allocate an unexplained sixth region', () => {
  const intents = [
    'host_led_discussion', 'balanced_conversation', 'speaker_focus', 'panel_discussion',
  ] as const;
  intents.forEach((intent) => {
    const layout = resolveEditorialPeopleLayoutV2({
      flags: ENABLED_FLAGS,
      intent,
      canvas: 'portrait_9_16',
      assignments: assignmentsFor(5),
      maximumPublishers: 6,
      largePanelEnabled: true,
    });
    assert.equal(layout.regions.length, 5);
    assert.equal(layout.regions.some((region) => region.slot === 'guest_5'), false);
  });
});

test('six-person layouts remain explicitly gated per Live', () => {
  const input = {
    flags: ENABLED_FLAGS,
    intent: 'panel_discussion' as const,
    canvas: 'landscape_16_9' as const,
    assignments: assignmentsFor(6),
    maximumPublishers: 6 as const,
    largePanelEnabled: false,
  };
  assert.throws(
    () => resolveEditorialPeopleLayoutV2(input),
    (error) => error instanceof AdaptiveStageM2LayoutError
      && error.code === 'EDITORIAL_LARGE_PANEL_REQUIRED',
  );
  assert.equal(resolveEditorialPeopleLayoutV2({ ...input, largePanelEnabled: true }).regions.length, 6);
});

test('M2 layout execution and every expansion capability fail closed by default', () => {
  assert.deepEqual(ADAPTIVE_STAGE_M2_SAFE_DEFAULTS, {
    enabled: false,
    studioPreview: false,
    stageIntelligence: false,
    focusEngine: false,
    morph: false,
    screenLayouts: false,
    quickConnectChoreography: false,
  });
  assert.throws(
    () => resolveEditorialPeopleLayoutV2({
      flags: ADAPTIVE_STAGE_M2_SAFE_DEFAULTS,
      intent: 'solo_focus',
      canvas: 'portrait_9_16',
      assignments: assignmentsFor(1),
      maximumPublishers: 4,
      largePanelEnabled: false,
    }),
    (error) => error instanceof AdaptiveStageM2LayoutError
      && error.code === 'ADAPTIVE_STAGE_M2_DISABLED',
  );
  assert.deepEqual(Object.values(ADAPTIVE_STAGE_M2_FLAG_NAMES), [
    'adaptive_stage_m2_enabled',
    'adaptive_stage_m2_studio_preview_enabled',
    'adaptive_stage_m2_stage_intelligence_enabled',
    'adaptive_stage_m2_focus_engine_enabled',
    'adaptive_stage_m2_morph_enabled',
    'adaptive_stage_m2_screen_layouts_enabled',
    'adaptive_stage_m2_quick_connect_choreography_enabled',
  ]);
});

test('database gates are private, default-off and do not enable any renderer', () => {
  const migration = [
    read('supabase/migrations/20261023164001_adaptive_stage_engine_2_milestone_2_flags.sql'),
    read('supabase/migrations/20261023170552_adaptive_stage_m2_studio_preview_gate.sql'),
  ].join('\n');
  Object.values(ADAPTIVE_STAGE_M2_FLAG_NAMES).forEach((flag) => {
    assert.match(migration, new RegExp(`${flag} boolean not null default false`));
  });
  assert.match(migration, /revoke all on table private\.adaptive_stage_v2_flags from public, anon, authenticated/i);
  assert.match(migration, /adaptive_stage_m2_subflags_require_master check/i);
  assert.doesNotMatch(migration, /studio_render_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration, /native_render_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration, /compositor_render_enabled\s*=\s*true/i);
});
