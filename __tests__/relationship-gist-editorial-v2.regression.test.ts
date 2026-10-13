import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  formatRelationshipGistSchedule,
  getRelationshipGistEditorialActions,
  type RelationshipGistEditorialRevision,
} from '../features/relationship-gists/editorial/relationship-gist-editorial-v2.ts';
import {
  buildExplicitRelationshipGistPerspectives,
  buildExplicitRelationshipGistSelectionOrder,
} from '../features/relationship-gists/domain/relationship-gist.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const revision = (
  status: RelationshipGistEditorialRevision['status'],
  overrides: Partial<RelationshipGistEditorialRevision> = {},
): RelationshipGistEditorialRevision => ({
  edition_id: 'edition',
  legacy_gist_id: 'gist',
  revision_id: 'revision',
  revision_number: 1,
  status,
  title: 'Title',
  short_body: null,
  body: 'Body',
  perspective: 'general',
  perspectives: ['general'],
  requires_safety_review: false,
  quality_approved_at: null,
  safety_approved_at: null,
  scheduled_for: null,
  published_at: null,
  authored_by_user_id: 'author',
  lock_version: 1,
  targeting_enforced: false,
  updated_at: new Date(0).toISOString(),
  ...overrides,
});

const permissions = {
  canDraft: true,
  canQualityApprove: true,
  canSafetyReview: true,
  canPublish: true,
  canArchive: true,
};

test('editorial UI actions follow the explicit lifecycle without a publish shortcut', () => {
  assert.deepEqual(getRelationshipGistEditorialActions(revision('draft'), permissions), ['submit', 'archive']);
  assert.deepEqual(
    getRelationshipGistEditorialActions(revision('in_review', { requires_safety_review: true }), permissions),
    ['quality_approve', 'safety_approve', 'archive'],
  );
  assert.deepEqual(getRelationshipGistEditorialActions(revision('approved'), permissions), ['schedule', 'publish', 'archive']);
  assert.deepEqual(getRelationshipGistEditorialActions(revision('scheduled'), permissions), ['cancel_schedule', 'publish']);
  assert.deepEqual(getRelationshipGistEditorialActions(revision('published'), permissions), ['unpublish']);
});

test('explicit perspectives are normalized, stable, and independent of profile religion', () => {
  assert.deepEqual(
    buildExplicitRelationshipGistPerspectives(['Muslim', 'GENERAL', 'unknown', 'muslim']),
    ['general', 'muslim'],
  );
  assert.deepEqual(
    buildExplicitRelationshipGistSelectionOrder('communication', ['christian', 'general']),
    ['communication', 'general', 'christian'],
  );
  const explore = read('app/(tabs)/explore.tsx');
  assert.match(explore, /RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED\s*\?\s*buildExplicitRelationshipGistPerspectives/);
  assert.match(explore, /\? buildExplicitRelationshipGistSelectionOrder/);
  assert.match(explore, /gistPerspective/);
});

test('scheduling displays the server timestamp in both canonical UTC and device-local form', () => {
  const formatted = formatRelationshipGistSchedule('2026-10-11T12:30:00+01:00');
  assert.equal(formatted?.iso, '2026-10-11T11:30:00.000Z');
  assert.equal(typeof formatted?.local, 'string');
  assert.equal(formatRelationshipGistSchedule('not-a-date'), null);
});

test('migration is additive, audited, immutable, targeted-off, and preserves installed-client RPCs', () => {
  const migration = read('supabase/migrations/20261010130000_relationship_gist_editorial_v2.sql');
  assert.doesNotMatch(migration, /drop\s+table/i);
  assert.match(migration, /relationship_gist_editorial_audit_events/);
  assert.match(migration, /relationship_gist_variant_immutable/);
  assert.match(migration, /audience_rules\s*=\s*'\{\}'::jsonb/);
  assert.match(migration, /gist_self_approval_forbidden/);
  assert.match(migration, /gist_separation_of_duties_required/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /create or replace function public\.rpc_get_global_relationship_gists\(\)/);
  assert.match(migration, /create or replace function public\.rpc_upsert_relationship_gist_editorial\(/);
  assert.match(migration, /gist_v2_review_required/);
});

test('feature flag keeps the V2 workspace isolated from legacy administration', () => {
  const flag = read('features/relationship-gists/config/relationship-gist-editorial-v2-flags.ts');
  const screen = read('app/admin-editorial.tsx');
  assert.match(flag, /EXPO_PUBLIC_RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED/);
  assert.match(flag, /=== 'true'/);
  assert.match(screen, /RelationshipGistEditorialV2Workspace/);
  assert.match(screen, /LegacyAdminEditorialScreen/);
});

test('perspective composer handles a closed or new-edition composer without dereferencing null', () => {
  const workspace = read('features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace.tsx');
  assert.match(workspace, /const composerPerspectives = composerRevision\s*\?/);
  assert.match(workspace, /:\s*\[\];/);
  assert.doesNotMatch(workspace, /composerRevision\?\.perspectives[\s\S]*composerRevision\.requires_safety_review/);
});

test('Saved Library is account scoped and keeps legacy Gist identity for resume', () => {
  const repository = read('features/relationship-gists/data/relationship-gist-saved-repository.ts');
  const screen = read('app/saved-gists.tsx');
  assert.match(repository, /ownerUserId/);
  assert.match(repository, /perspective \?\? 'all'/);
  assert.match(repository, /rpc_get_my_saved_relationship_gists/);
  assert.match(screen, /openGistId: gist\.gist_id/);
  assert.match(screen, /unavailable_reason/);
});

test('unrelated Circles and Live entry points remain present after the surgical reader integration', () => {
  const explore = read('app/(tabs)/explore.tsx');
  assert.match(explore, /useLiveSessions/);
  assert.match(explore, /CirclesLiveGateway/);
  assert.match(explore, /Saved library/);
});
