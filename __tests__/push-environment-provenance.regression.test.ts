import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  evaluatePushTokenProvenance,
  PUSH_PROVENANCE_REASONS,
} from '../supabase/functions/_shared/push-environment-provenance.ts';

const expected = {
  appEnvironment: 'staging',
  applicationId: 'com.aduboffour.betweener.staging',
  expoProjectId: '7de6cdc4-8616-446f-99de-82764af3a7e6',
};
const validToken = {
  app_environment: expected.appEnvironment,
  application_id: expected.applicationId,
  expo_project_id: expected.expoProjectId,
  installation_id: 'cc7a9b19-6878-47cd-b542-d25642714fa3',
  provenance_status: 'verified',
  quarantined_at: null,
};
const migration = readFileSync(
  'supabase/migrations/20261006150000_push_environment_provenance_hardening.sql',
  'utf8',
);
const worker = readFileSync('supabase/functions/push-notifications/index.ts', 'utf8');
const registration = readFileSync('lib/notifications/push.ts', 'utf8');

test('only an exact verified staging application tuple is eligible', () => {
  assert.deepEqual(evaluatePushTokenProvenance(validToken, expected), {
    allowed: true,
    reason: null,
  });
  assert.equal(
    evaluatePushTokenProvenance({ ...validToken, app_environment: 'production' }, expected).reason,
    PUSH_PROVENANCE_REASONS.environmentMismatch,
  );
  assert.equal(
    evaluatePushTokenProvenance({
      ...validToken,
      application_id: 'com.aduboffour.betweener',
    }, expected).reason,
    PUSH_PROVENANCE_REASONS.applicationMismatch,
  );
  assert.equal(
    evaluatePushTokenProvenance({
      ...validToken,
      expo_project_id: 'e6380101-4170-4acc-92bd-903b3c3e4eca',
    }, expected).reason,
    PUSH_PROVENANCE_REASONS.projectMismatch,
  );
});

test('missing, unverified, and quarantined destinations fail closed', () => {
  assert.equal(
    evaluatePushTokenProvenance({}, expected).reason,
    PUSH_PROVENANCE_REASONS.missing,
  );
  assert.equal(
    evaluatePushTokenProvenance({ ...validToken, installation_id: null }, expected).reason,
    PUSH_PROVENANCE_REASONS.installationMissing,
  );
  assert.equal(
    evaluatePushTokenProvenance({ ...validToken, provenance_status: 'unverified' }, expected).reason,
    PUSH_PROVENANCE_REASONS.notVerified,
  );
  assert.equal(
    evaluatePushTokenProvenance({
      ...validToken,
      quarantined_at: '2026-10-06T07:00:00Z',
    }, expected).reason,
    PUSH_PROVENANCE_REASONS.quarantined,
  );
});

test('registration binds the Expo token to native application and installation identity', () => {
  assert.match(registration, /Application\.applicationId/);
  assert.match(registration, /SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(registration, /Crypto\.randomUUID\(\)/);
  assert.match(registration, /upsertPushTokenV2\('upsert_push_token_v2'/);
  assert.match(registration, /p_app_environment: appIdentity\.variant/);
  assert.match(registration, /p_application_id: appIdentity\.bundleIdentifier/);
  assert.match(registration, /p_expo_project_id: projectId/);
  assert.match(registration, /p_installation_id: installationId/);
  assert.match(registration, /appIdentity\.variant === 'staging'[\s\S]*upsertPushTokenV2/);
  assert.match(registration, /: await supabase\.rpc\('upsert_push_token'/);
  assert.match(registration, /xsgzxadwuxuziubglvps/);
  assert.match(registration, /jbyblhithbqwojhwlenv/);
  assert.doesNotMatch(registration, /Device\.osBuildId/);
});

test('database registration validates against a private canonical configuration', () => {
  assert.match(migration, /create table if not exists private\.push_application_config/i);
  assert.match(migration, /p_app_environment is distinct from v_config\.app_environment/i);
  assert.match(migration, /p_application_id is distinct from v_config\.application_id/i);
  assert.match(migration, /p_expo_project_id is distinct from v_config\.expo_project_id/i);
  assert.match(migration, /push_token_cross_environment_collision/i);
  assert.match(migration, /revoke all on function public\.upsert_push_token\(/i);
});

test('legacy and known cross-environment rows are quarantined instead of deleted', () => {
  assert.match(migration, /PUSH_TOKEN_SHARED_ACROSS_ENVIRONMENTS/);
  assert.match(migration, /PUSH_ENVIRONMENT_PROVENANCE_MISSING/);
  assert.match(migration, /provenance_status = 'quarantined'/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.push_tokens/i);
});

test('unicast and campaign selection both reject unproven destinations', () => {
  assert.match(worker, /select\('id,user_id,token,app_version,app_environment,application_id,expo_project_id,installation_id,provenance_status,quarantined_at'\)/);
  assert.match(worker, /select\('id,token,last_seen_at,app_version,app_environment,application_id,expo_project_id,installation_id,provenance_status,quarantined_at'\)/);
  assert.match(worker, /evaluatePushTokenProvenance\(row, pushEnvironment\)/g);
  assert.match(worker, /push_environment_provenance_denied/);
  assert.match(worker, /pushDeliveryMode !== 'enabled'/);
});

test('dry-run resolver exposes sanitized hashes and never contacts a provider', () => {
  assert.match(migration, /rpc_service_resolve_push_destinations_v1/);
  assert.match(migration, /extensions\.digest\(token\.token, 'sha256'\)/i);
  assert.match(migration, /then 'ALLOW'[\s\S]*else 'DENY'/i);
  const resolver = migration.slice(migration.indexOf('create or replace function public.rpc_service_resolve_push_destinations_v1'));
  assert.doesNotMatch(resolver, /net\.http|exp\.host|fetch\(/i);
});

test('synthetic Live sessions can opt out before campaign creation', () => {
  assert.match(
    migration,
    /configuration ->> 'notification_delivery_mode', 'enabled'\) = 'enabled'/i,
  );
});
