import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('manual Gist covers use the existing private revision-scoped media model', () => {
  const migration = read('supabase/migrations/20261014100000_relationship_gist_manual_editorial_images.sql');
  assert.match(migration, /source in \('ai', 'manual'\)/);
  assert.match(migration, /source = 'manual' and generation_job_id is null/);
  assert.match(migration, /bucket_id = 'relationship-gist-covers'/);
  assert.match(migration, /revision\.status in \('draft', 'in_review'\)/);
  assert.doesNotMatch(migration, /drop\s+(table|function)/i);
});

test('manual cover finalization is server-authorized, ownership-bound, and audited', () => {
  const migration = read('supabase/migrations/20261014100000_relationship_gist_manual_editorial_images.sql');
  assert.match(migration, /has_relationship_gist_editorial_capability\('draft', v_actor\)/);
  assert.match(migration, /has_relationship_gist_editorial_capability\('quality_approve', v_actor\)/);
  assert.match(migration, /object\.owner_id::text = v_actor::text/);
  assert.match(migration, /metadata->>'mimetype'.*image\/webp/s);
  assert.match(migration, /p_sha256.*\^\[a-f0-9\]\{64\}\$/s);
  assert.match(migration, /set status = 'superseded'/);
  assert.match(migration, /'manual_cover_approved'/);
  assert.doesNotMatch(migration, /rpc_transition_relationship_gist_revision|rpc_publish_relationship_gist/);
});

test('manual cover picker requires accessible alt text and supports replacement', () => {
  const field = read('features/relationship-gists/editorial/RelationshipGistManualCoverField.tsx');
  const workspace = read('features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace.tsx');
  const uploader = read('features/relationship-gists/editorial/relationship-gist-manual-cover.ts');
  assert.match(field, /aspect: \[3, 2\]/);
  assert.match(field, /Describe the image for screen readers/);
  assert.match(workspace, /permissions\.canDraft && permissions\.canQualityApprove/);
  assert.match(workspace, /Add or replace cover/);
  assert.match(uploader, /SaveFormat\.WEBP/);
  assert.match(uploader, /Crypto\.digest\(Crypto\.CryptoDigestAlgorithm\.SHA256/);
  assert.match(uploader, /rpc_finalize_relationship_gist_manual_cover/);
  assert.match(uploader, /manual_cover_cleanup_failed/);
});
