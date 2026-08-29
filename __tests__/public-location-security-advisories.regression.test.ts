import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260820203000_harden_public_location_views.sql',
    import.meta.url,
  ),
  'utf8',
);

const verification = readFileSync(
  new URL(
    '../supabase/verification/public_location_security_advisories_check.sql',
    import.meta.url,
  ),
  'utf8',
);

const preflight = readFileSync(
  new URL(
    '../supabase/verification/public_location_security_advisories_preflight.sql',
    import.meta.url,
  ),
  'utf8',
);

const postgisEvidence = readFileSync(
  new URL(
    '../supabase/verification/postgis_spatial_ref_sys_advisory_evidence.sql',
    import.meta.url,
  ),
  'utf8',
);

test('managed PostGIS objects are not mutated by the customer migration', () => {
  assert.match(migration, /spatial_ref_sys advisory cannot be changed by a customer migration/i);
  assert.doesNotMatch(migration, /alter table public\.spatial_ref_sys/i);
  assert.doesNotMatch(migration, /revoke[\s\S]+public\.spatial_ref_sys/i);
  assert.doesNotMatch(migration, /alter extension postgis/i);
  assert.doesNotMatch(migration, /drop extension postgis/i);
});

test('location projections use caller privileges without changing their definitions', () => {
  assert.match(migration, /alter view public\.profile_location_features set \(security_invoker = true\)/i);
  assert.match(migration, /alter view public\.circle_location_features set \(security_invoker = true\)/i);
  assert.doesNotMatch(migration, /drop view/i);
  assert.doesNotMatch(migration, /create(?: or replace)? view/i);
});

test('API roles retain reads but cannot mutate either location projection', () => {
  assert.match(
    migration,
    /revoke all privileges on table public\.profile_location_features[\s\S]+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select on table public\.profile_location_features[\s\S]+to anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select on table public\.circle_location_features[\s\S]+to anon, authenticated, service_role/i,
  );
});

test('migration fails atomically if any required protection is missing', () => {
  assert.match(migration, /profile_location_features_security_invoker_missing/i);
  assert.match(migration, /circle_location_features_security_invoker_missing/i);
  assert.match(migration, /public_location_view_base_relation_rls_missing/i);
  assert.match(migration, /public_location_view_invoker_dependency_privilege_missing/i);
  assert.match(migration, /public_location_surface_write_privilege_present/i);
});

test('verification query covers both actionable Security Advisor findings', () => {
  assert.match(verification, /profile_location_security_invoker/i);
  assert.match(verification, /circle_location_security_invoker/i);
  assert.match(verification, /base_relations_rls_enabled/i);
  assert.match(verification, /invoker_dependencies_readable/i);
  assert.match(verification, /client_write_privileges_removed/i);
});

test('preflight proves the migration can preserve current API reads', () => {
  assert.match(preflight, /postgres_supports_security_invoker/i);
  assert.match(preflight, /base_relations_rls_enabled/i);
  assert.match(preflight, /invoker_dependencies_readable/i);
  assert.match(preflight, /normalize_location_key\(text\)/i);
});

test('PostGIS advisory evidence is diagnostic-only', () => {
  assert.match(postgisEvidence, /managed_by_postgis/i);
  assert.match(postgisEvidence, /customer_migration_is_not_owner/i);
  assert.doesNotMatch(postgisEvidence, /alter table/i);
  assert.doesNotMatch(postgisEvidence, /drop extension/i);
});
