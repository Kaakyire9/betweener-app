// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(path, 'utf8');

const foundationMigration = readSource(
  'supabase/migrations/20260901133000_recommendation_rotation_foundation.sql',
);
const intentClosureMigration = readSource(
  'supabase/migrations/20260901133100_intent_closure_recommendation_rotation.sql',
);
const compassMigration = readSource(
  'supabase/migrations/20260901133200_relationship_compass_recommendation_engine.sql',
);
const circleRotationMigration = readSource(
  'supabase/migrations/20260901133300_circle_recommendation_rotation.sql',
);
const migration = [
  foundationMigration,
  intentClosureMigration,
  compassMigration,
  circleRotationMigration,
].join('\n');
const intentScreen = readSource('app/(tabs)/intent.tsx');
const compassScreen = readSource('app/relationship-compass.tsx');
const circleHome = readSource('app/(tabs)/explore.tsx');
const circleDating = readSource('features/circles/hooks/use-circle-dating.ts');
const closureService = readSource('lib/intents/closure-to-clarity.ts');
const closureScreen = readSource('app/closure-to-clarity.tsx');

test('rotation state and exposure telemetry remain private behind owner-bound RPCs', () => {
  assert.match(foundationMigration, /create table if not exists public\.profile_recommendation_batches/i);
  assert.match(foundationMigration, /alter table public\.profile_recommendation_batches enable row level security/i);
  assert.match(
    foundationMigration,
    /revoke all on table public\.profile_recommendation_batches from public, anon, authenticated/i,
  );
  assert.match(foundationMigration, /profile\.user_id = auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /returns table \([^)]*(compass_score|delivery_rank)/i);
});

test('every recommendation surface has a deliberately different stability window', () => {
  assert.match(migration, /Intent Suggested: one stable UTC-day field/i);
  assert.match(migration, /Relationship Compass: one stable UTC-day field per saved Compass version/i);
  assert.match(migration, /Circle discovery: one stable UTC-day ordering/i);
  assert.match(migration, /Circle Home Picks: one stable 72-hour field/i);
  assert.match(migration, /Closure to Clarity: one stable seven-day field/i);
  assert.match(migration, /\/ 259200/);
  assert.match(migration, /\/ 604800/);
});

test('Intent Suggested preserves its mature seed model but removes reciprocal-age fallback delivery', () => {
  assert.match(intentClosureMigration, /rpc_get_suggested_moves_v2/i);
  assert.match(intentClosureMigration, /from public\.rpc_get_suggested_moves\(/i);
  assert.match(
    intentClosureMigration,
    /public\.is_romantically_eligible\(p_profile_id, base\.id, 'global', null\)/i,
  );
  assert.match(intentClosureMigration, /interval '72 hours'/i);
  assert.match(intentScreen, /rpc_get_suggested_moves_v2/);
});

test('Relationship Compass is ranked by Supabase and no longer scans Profiles on the client', () => {
  assert.match(compassMigration, /rpc_get_relationship_compass_profiles/i);
  assert.match(compassMigration, /profile_recommendation_events/i);
  assert.match(foundationMigration, /profile_recommendation_events_impression_uidx/i);
  assert.match(compassMigration, /flexibility,verified/i);
  assert.match(compassMigration, /flexibility,religion/i);
  assert.match(compassMigration, /flexibility,children/i);
  assert.match(compassMigration, /interval '21 days'/i);
  assert.match(compassScreen, /rpc_get_relationship_compass_profiles/);
  assert.match(compassScreen, /Supabase has already ranked the field/);
  assert.doesNotMatch(compassScreen, /\.from\("profiles"\)/);
  assert.doesNotMatch(compassScreen, /scorePreviewProfile/);
});

test('Circle Picks are stable for 72 hours while Circle discovery rotates ordering daily', () => {
  assert.match(circleRotationMigration, /rpc_get_circle_home_picks_v2/i);
  assert.match(circleRotationMigration, /rpc_get_circle_dating_candidates_v2/i);
  assert.match(foundationMigration, /ordering only; no hidden pool/i);
  assert.match(circleRotationMigration, /event_row\.metadata ->> 'surface' = 'circle_home_picks'/i);
  assert.match(circleHome, /rpc_get_circle_home_picks_v2/);
  assert.match(circleDating, /rpc_get_circle_dating_candidates_v2/);
  assert.match(circleDating, /p_limit: 40/);
  assert.match(circleDating, /surface: loadConnections \? 'circle_connections' : 'circle_discover'/);
});

test('Closure to Clarity keeps a coherent weekly field and records only displayed recommendations', () => {
  assert.match(intentClosureMigration, /rpc_get_closure_to_clarity_candidates_v2/i);
  assert.match(
    intentClosureMigration,
    /public\.is_romantically_eligible\(v_viewer_id, base\.id, 'global', null\)/i,
  );
  assert.match(closureService, /rpc_get_closure_to_clarity_candidates_v2/);
  assert.match(closureScreen, /rpc_log_profile_recommendation_event/);
  assert.match(closureScreen, /recommendations\.forEach/);
  assert.match(closureScreen, /'intent_sent'/);
});

test('batch lookup happens before generation so reopen and tab navigation cannot rotate a field', () => {
  const surfaces = [
    'intent_suggested',
    'relationship_compass',
    'circle_home_picks',
    'circle_discovery',
    'closure_to_clarity',
  ];
  surfaces.forEach((surface) => {
    assert.match(
      migration,
      new RegExp(`if not exists \\([\\s\\S]{0,420}batch\\.surface = '${surface}'`, 'i'),
    );
  });
});

test('service-role health reporting makes deployment and traffic observable', () => {
  assert.match(foundationMigration, /rpc_get_profile_recommendation_rotation_health/i);
  assert.match(foundationMigration, /'batches_24h'/i);
  assert.match(foundationMigration, /'candidates_batched_24h'/i);
  assert.match(foundationMigration, /'impressions_24h'/i);
  assert.match(
    foundationMigration,
    /revoke all on function public\.rpc_get_profile_recommendation_rotation_health\(\)[\s\S]*from public, anon, authenticated/i,
  );
});

test('rotation history has bounded retention and a guarded daily cleanup', () => {
  assert.match(foundationMigration, /rpc_cleanup_profile_recommendation_rotation/i);
  assert.match(foundationMigration, /interval '45 days'/i);
  assert.match(foundationMigration, /interval '14 days'/i);
  assert.match(foundationMigration, /profile-recommendation-rotation-cleanup/i);
  assert.match(foundationMigration, /'41 3 \* \* \*'/i);
  assert.match(foundationMigration, /to_regprocedure\('cron\.schedule\(text,text,text\)'\)/i);
});

test('the rollout is split into four ordered and independently atomic migrations', () => {
  const migrations = [
    foundationMigration,
    intentClosureMigration,
    compassMigration,
    circleRotationMigration,
  ];
  migrations.forEach((source) => {
    assert.match(source, /\bbegin;/i);
    assert.match(source, /notify pgrst, 'reload schema';/i);
    assert.match(source, /\bcommit;/i);
  });
  assert.match(intentClosureMigration, /Requires 20260901133000_recommendation_rotation_foundation\.sql/i);
  assert.match(compassMigration, /Requires 20260901133000_recommendation_rotation_foundation\.sql/i);
  assert.match(circleRotationMigration, /Requires 20260901133000_recommendation_rotation_foundation\.sql/i);
});
