import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LiveChemistrySnapshot } from '../features/live/application/live-models.ts';
import {
  liveChemistryAction,
  liveChemistryContextLine,
} from '../features/live/domain/live-chemistry.ts';
import { parseLivePrivateSpark } from '../features/live/application/live-parsers.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260825120000_live_phase6_chemistry_first.sql', import.meta.url),
  'utf8',
);
const hardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260826150000_harden_chemistry_first_concealment.sql', import.meta.url),
  'utf8',
);
const projectionVisibilityMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260827090000_fix_live_chemistry_projection_visibility.sql',
    import.meta.url,
  ),
  'utf8',
);
const readIdempotencyMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260828073000_harden_live_chemistry_read_idempotency.sql',
    import.meta.url,
  ),
  'utf8',
);
const updateTriggerShapeMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260828100000_fix_live_chemistry_update_trigger_record_shape.sql',
    import.meta.url,
  ),
  'utf8',
);
const overlay = readFileSync(
  new URL('../features/live/components/LiveChemistryOverlay.tsx', import.meta.url),
  'utf8',
);
const privateSparkRoute = readFileSync(
  new URL('../app/live/private-spark/[privateSparkId].tsx', import.meta.url),
  'utf8',
);
const quickConnectRoute = readFileSync(
  new URL('../app/live/quick-connect/[sessionId].tsx', import.meta.url),
  'utf8',
);
const chemistryHook = readFileSync(
  new URL('../features/live/hooks/use-live-chemistry.ts', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../features/live/application/live-repository.ts', import.meta.url),
  'utf8',
);

const concealed = (overrides: Partial<LiveChemistrySnapshot> = {}): LiveChemistrySnapshot => ({
  id: 'chemistry-1',
  sessionId: 'session-1',
  sourceKind: 'private_spark',
  sourceId: 'spark-1',
  state: 'concealed',
  myReady: false,
  revealOfferedAt: null,
  revealedAt: null,
  version: 1,
  otherPersonContext: {
    fullName: 'Ama',
    age: 29,
    city: 'Accra',
    lookingFor: 'A meaningful relationship',
    values: ['Kindness'],
  },
  ...overrides,
});

test('Chemistry First exposes a deterministic private consent action', () => {
  assert.equal(liveChemistryAction(null), 'none');
  assert.equal(liveChemistryAction(concealed()), 'offer_reveal');
  assert.equal(
    liveChemistryAction(concealed({ revealOfferedAt: '2026-08-25T12:00:00Z' })),
    'mark_ready',
  );
  assert.equal(
    liveChemistryAction(concealed({ revealOfferedAt: '2026-08-25T12:00:00Z', myReady: true })),
    'waiting',
  );
  assert.equal(liveChemistryAction(concealed({ state: 'revealed' })), 'none');
});

test('Chemistry First context normalisation never invents profile context', () => {
  assert.equal(liveChemistryContextLine('  Accra  '), 'Accra');
  assert.equal(liveChemistryContextLine(29), '29');
  assert.equal(liveChemistryContextLine('   '), null);
  assert.equal(liveChemistryContextLine(null), null);
});

test('Private Spark preserves the authoritative Chemistry First flag', () => {
  const parsed = parseLivePrivateSpark({
    id: 'spark-1',
    chemistry_first_enabled: true,
    session_id: 'session-1',
    match_round_id: 'round-1',
    state: 'active',
    participant_a: { user_id: 'a', profile_id: 'pa' },
    participant_b: { user_id: 'b', profile_id: 'pb' },
    is_participant: true,
    can_manage: false,
    consent_expires_at: '2026-08-26T12:00:00Z',
  });
  assert.equal(parsed.chemistryFirstEnabled, true);
});

test('Chemistry First is snapshotted and profile context omits invented fallbacks', () => {
  assert.match(hardeningMigration, /add column if not exists chemistry_first_enabled boolean/i);
  assert.match(hardeningMigration, /live_private_spark_snapshot_chemistry_first/i);
  assert.match(hardeningMigration, /live_quick_pairing_snapshot_chemistry_first/i);
  assert.match(hardeningMigration, /live_private_spark_protect_chemistry_first/i);
  assert.match(hardeningMigration, /live_quick_pairing_protect_chemistry_first/i);
  assert.match(hardeningMigration, /chemistry_first_immutable/i);
  assert.match(hardeningMigration, /'chemistry_first_enabled',v_spark\.chemistry_first_enabled/i);
  assert.match(hardeningMigration, /'chemistry_first_enabled',v_pairing\.chemistry_first_enabled/i);
  assert.match(hardeningMigration, /'city', nullif\(btrim\(v_profile\.city\), ''\)/i);
  assert.doesNotMatch(hardeningMigration, /coalesce\(v_profile\.city,\s*v_profile\.location\)/i);
  assert.match(hardeningMigration, /jsonb_strip_nulls/i);
});

test('Readiness is private and the database requires a dual, offered reveal', () => {
  assert.match(migration, /primary key \(conversation_id, user_id\)/i);
  assert.match(migration, /perform pg_advisory_xact_lock\(hashtextextended\(p_conversation_id::text, 0\)\)/i);
  assert.match(migration, /live_chemistry_reveal_not_offered/i);
  assert.match(migration, /select count\(\*\)[\s\S]+live_chemistry_readiness[\s\S]+if v_ready_count = 2/i);
  assert.match(migration, /'my_ready', v_my_ready/i);
  assert.doesNotMatch(migration, /'other_ready'/i);
  assert.match(
    migration,
    /revoke all on public\.live_chemistry_conversations, public\.live_chemistry_readiness,[\s\S]+from anon, authenticated/i,
  );
});

test('Chemistry First realtime publishes content-free invalidations only', () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.live_chemistry_updates/i);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.live_chemistry_readiness/i);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.live_chemistry_events/i);
  assert.match(migration, /revoke all on function public\.live_chemistry_private_projection\(uuid\)/i);
  assert.match(repository, /status === 'SUBSCRIBED'\) onChange\(\)/i);
});

test('Chemistry projection observes state written earlier in the same RPC', () => {
  assert.match(
    projectionVisibilityMigration,
    /alter function public\.live_chemistry_private_projection\(uuid\) volatile/i,
  );
  assert.doesNotMatch(
    projectionVisibilityMigration,
    /grant\s+execute|security\s+(?:invoker|definer)|create\s+or\s+replace/i,
  );
});

test('Chemistry projection initialization is serialized and existing reads perform no writes', () => {
  assert.match(
    readIdempotencyMigration,
    /hashtextextended\('live_chemistry:private_spark:' \|\| p_private_spark_id::text, 0\)/i,
  );
  assert.match(
    readIdempotencyMigration,
    /hashtextextended\('live_chemistry:quick_connect:' \|\| p_pairing_id::text, 0\)/i,
  );
  assert.match(
    readIdempotencyMigration,
    /select conversation\.id into v_conversation_id[\s\S]+if v_conversation_id is null then[\s\S]+on conflict \(source_kind, source_id\) do nothing/i,
  );
  assert.doesNotMatch(
    readIdempotencyMigration,
    /on conflict[\s\S]{0,100}do update\s+set updated_at/i,
  );
  assert.match(readIdempotencyMigration, /if v_created then[\s\S]+event_type\)/i);
});

test('Chemistry invalidation triggers only access fields owned by their source table', () => {
  const parentTriggerFunction = updateTriggerShapeMigration.match(
    /create or replace function public\.bump_live_chemistry_conversation_update\(\)[\s\S]+?\$\$;/i,
  )?.[0];
  const childTriggerFunction = updateTriggerShapeMigration.match(
    /create or replace function public\.bump_live_chemistry_update\(\)[\s\S]+?\$\$;/i,
  )?.[0];
  assert.ok(parentTriggerFunction);
  assert.ok(childTriggerFunction);
  assert.match(
    updateTriggerShapeMigration,
    /create or replace function public\.bump_live_chemistry_conversation_update\(\)/i,
  );
  assert.match(
    updateTriggerShapeMigration,
    /values\(new\.id, new\.session_id, 1\)/i,
  );
  assert.match(
    updateTriggerShapeMigration,
    /where conversation\.id = new\.conversation_id/i,
  );
  assert.match(
    updateTriggerShapeMigration,
    /live_chemistry_conversation_bump[\s\S]+bump_live_chemistry_conversation_update\(\)/i,
  );
  assert.match(
    updateTriggerShapeMigration,
    /live_chemistry_readiness_bump[\s\S]+bump_live_chemistry_update\(\)/i,
  );
  assert.doesNotMatch(parentTriggerFunction, /new\.conversation_id/i);
  assert.doesNotMatch(childTriggerFunction, /new\.id/i);
  assert.doesNotMatch(updateTriggerShapeMigration, /tg_table_name/i);
});

test('Chemistry projection failures emit source-bound, deduplicated diagnostics', () => {
  assert.match(chemistryHook, /\[live-chemistry\] projection-failed/);
  assert.match(chemistryHook, /lastProjectionErrorRef\.current !== diagnosticKey/);
  assert.match(chemistryHook, /\[live-chemistry\] action-failed/);
  assert.match(chemistryHook, /live_chemistry_source_mismatch/);
});

test('Chemistry state is source-bound so stale rooms cannot reveal a new room', () => {
  assert.match(chemistryHook, /snapshotState\?\.sourceKey === sourceKey/);
  assert.match(chemistryHook, /sourceKeyRef\.current !== requestedSourceKey/);
  assert.match(chemistryHook, /next\.sourceKind === kind/);
  assert.match(chemistryHook, /next\.sourceId === id/);
});

test('Chemistry First is nonvisual, premium and never timer-forced', () => {
  assert.match(overlay, /Stay with the conversation before the full picture appears\./);
  assert.match(overlay, /Keep talking a little longer\./);
  assert.match(overlay, /Haptics\.notificationAsync/);
  assert.match(overlay, /duration: 700/);
  assert.match(overlay, /otherPersonContext\.(age|city|lookingFor)/);
  assert.match(overlay, /<ScrollView/);
  assert.match(overlay, /actionArea/);
  assert.match(overlay, /scrollContent: \{ flexGrow: 1/);
  assert.match(overlay, /content: \{[^}]*flex: 1/);
  assert.doesNotMatch(overlay, /setTimeout|countdown|forced reveal/i);
  assert.match(privateSparkRoute, /LiveChemistryOverlay/);
  assert.match(quickConnectRoute, /LiveChemistryOverlay/);
  assert.match(privateSparkRoute, /media\.bindings && chemistryRevealed/);
  assert.match(quickConnectRoute, /media\.bindings && chemistryRevealed/);
  assert.match(privateSparkRoute, /videoEnabled: chemistryRevealed &&/);
  assert.match(quickConnectRoute, /videoEnabled: chemistryRevealed &&/);
});
