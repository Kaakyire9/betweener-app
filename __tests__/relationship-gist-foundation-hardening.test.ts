import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS,
  normalizeRelationshipGistEditorialPermissions,
} from '../features/relationship-gists/editorial/relationship-gist-editorial-permissions.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('editorial roles separate authoring, quality, safety, and publication authority', () => {
  const migration = read('supabase/migrations/20261010120000_relationship_gist_editorial_capability_hardening.sql');
  assert.match(migration, /when 'draft' then admin\.role in \('operations', 'super_admin'\)/);
  assert.match(migration, /when 'quality_approve' then admin\.role = 'super_admin'/);
  assert.match(migration, /when 'safety_review' then admin\.role in \('moderation', 'super_admin'\)/);
  assert.match(migration, /when 'publish' then admin\.role in \('operations', 'super_admin'\)/);
  assert.doesNotMatch(migration, /is_admin_user\(auth\.uid\(\)\)/);
  assert.match(migration, /from public\.internal_admins admin/);
});

test('client permission parsing fails closed and does not infer broad admin access', () => {
  assert.deepEqual(
    normalizeRelationshipGistEditorialPermissions(null),
    DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS,
  );
  assert.deepEqual(normalizeRelationshipGistEditorialPermissions([{
    can_read: true,
    can_safety_review: true,
    can_draft: false,
    can_quality_approve: false,
    can_publish: false,
    can_archive: false,
  }]), {
    canRead: true,
    canDraft: false,
    canQualityApprove: false,
    canSafetyReview: true,
    canPublish: false,
    canArchive: false,
  });
});

test('reader-state v2 is additive and retains installed-client signatures', () => {
  const migration = read('supabase/migrations/20261010121000_relationship_gist_reader_state_idempotency.sql');
  const flags = read('features/relationship-gists/config/relationship-gist-feature-flags.ts');
  assert.match(migration, /add column if not exists saved_version/);
  assert.match(migration, /relationship_gist_state_mutation_receipts/);
  assert.match(migration, /rpc_apply_relationship_gist_state_mutation_v2/);
  assert.match(migration, /p_owner_user_id is null or p_owner_user_id <> v_user_id/);
  assert.match(migration, /v_saved_outcome := 'conflict'/);
  assert.match(migration, /create or replace function public\.rpc_upsert_relationship_gist_user_state\(/);
  assert.match(migration, /uuid, boolean, double precision, timestamptz, boolean, text/);
  assert.match(flags, /EXPO_PUBLIC_RELATIONSHIP_GIST_READER_V2_ENABLED/);
  assert.match(flags, /=== 'true'/);
});

test('Circles and reader integration retain the legacy fetch fallback and unrelated product paths', () => {
  const screen = read('app/(tabs)/explore.tsx');
  const repository = read('features/relationship-gists/data/relationship-gist-repository.ts');
  const migration = read('supabase/migrations/20261010121000_relationship_gist_reader_state_idempotency.sql');
  assert.match(screen, /useLiveSessions/);
  assert.match(screen, /CirclesLiveGateway/);
  assert.match(screen, /fetchCurrentRelationshipGists/);
  assert.match(repository, /rpc_get_global_relationship_gists/);
  assert.match(repository, /from\('relationship_gists'\)/);
  assert.match(migration, /rpc_upsert_relationship_gist_user_state/);
  assert.doesNotMatch(repository, /rpc_upsert_relationship_gist_user_state/);
});
