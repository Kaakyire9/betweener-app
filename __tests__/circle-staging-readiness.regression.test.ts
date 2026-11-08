import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  collectCircleQueryFailures,
  createCircleQueryFailureError,
  getCircleProfileBindingError,
} from '../lib/circles/circle-load-health.ts';

const migration = readFileSync(
  'supabase/migrations/20261007223000_circle_staging_readiness_hardening.sql',
  'utf8',
);
const gistMigration = readFileSync(
  'supabase/migrations/20261008090000_relationship_gist_staging_fixtures.sql',
  'utf8',
);

test('Circle storage buckets are reproducible without changing existing production settings', () => {
  assert.match(migration, /'circle-images'[\s\S]*false,[\s\S]*null,[\s\S]*null/);
  assert.match(migration, /'circle-pulse-media'[\s\S]*52428800/);
  assert.match(migration, /'video\/quicktime'/);
  assert.match(migration, /on conflict \(id\) do nothing/i);
});

test('synthetic Circle fixtures are guarded by server-owned staging identity', () => {
  assert.match(migration, /private\.push_application_config/);
  assert.match(migration, /config\.app_environment = 'staging'/);
  assert.match(migration, /config\.application_id = 'com\.aduboffour\.betweener\.staging'/);
  assert.match(migration, /if not v_is_staging then[\s\S]*return;/i);
  assert.match(migration, /Staging Circle Lab/);
  assert.match(migration, /circle_invitations/);
  assert.match(migration, /circle_pulse_comments/);
});

test('Relationship Gist fixtures are global, published, and staging-only', () => {
  assert.match(gistMigration, /private\.push_application_config/);
  assert.match(gistMigration, /config\.app_environment = 'staging'/);
  assert.match(gistMigration, /config\.application_id = 'com\.aduboffour\.betweener\.staging'/);
  assert.match(gistMigration, /if not v_is_staging then[\s\S]*return;/i);
  assert.match(gistMigration, /insert into public\.relationship_gists/);
  assert.match(gistMigration, /'general'/);
  assert.match(gistMigration, /'culture'/);
  assert.match(gistMigration, /'safety'/);
  assert.match(gistMigration, /'communication'/);
  assert.match(gistMigration, /circle_id[\s\S]*null/);
  assert.match(gistMigration, /status[\s\S]*'published'/);
});

test('supplemental Circle query failures remain observable', () => {
  const failures = collectCircleQueryFailures([
    { key: 'prompts', label: 'Circle prompts', error: { message: 'denied' } },
    { key: 'gatherings', label: 'Gatherings', error: null },
  ]);

  assert.deepEqual(failures, [{ key: 'prompts', label: 'Circle prompts', message: 'denied' }]);
  assert.equal(createCircleQueryFailureError(failures).message, 'Could not load Circle prompts.');
});

test('missing or failed profile binding is explicit', () => {
  assert.equal(
    getCircleProfileBindingError(null, { message: 'network' }),
    'We could not connect Circles to this account. Please retry.',
  );
  assert.equal(
    getCircleProfileBindingError(null, null),
    'Finish setting up your profile before opening Circles.',
  );
  assert.equal(getCircleProfileBindingError('profile-id', null), null);
});
