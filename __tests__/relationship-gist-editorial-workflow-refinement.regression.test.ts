import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('manual owner publishing is explicit, audited, and unavailable to AI drafts', () => {
  const migration = read('supabase/migrations/20261014120000_relationship_gist_owner_publishing_and_ai_revisions.sql');
  const repository = read('features/relationship-gists/editorial/relationship-gist-editorial-repository.ts');
  const workspace = read('features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace.tsx');

  assert.match(migration, /rpc_publish_relationship_gist_owner_review/);
  assert.match(migration, /v_revision\.authored_by_user_id is distinct from v_actor/);
  assert.match(migration, /relationship_gist_ai_draft_metadata[\s\S]*gist_ai_owner_review_required/);
  assert.match(migration, /owner_review_published/);
  assert.match(repository, /I reviewed this Gist and accept publishing responsibility\./);
  assert.match(workspace, /Review & publish/);
});

test('studio separates active work, published Gists, and collapsed history', () => {
  const workspace = read('features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace.tsx');
  const aiStudio = read('features/relationship-gists/ai/RelationshipGistAIStudio.tsx');

  assert.match(workspace, /activeManualRevisions/);
  assert.match(workspace, /Published Gists/);
  assert.match(workspace, /History \(\{historicalRevisions\.length\}\)/);
  assert.match(aiStudio, /activeReviews/);
  assert.match(aiStudio, /AI activity/);
  assert.match(aiStudio, /activityExpanded \?/);
  assert.doesNotMatch(aiStudio, />Generation jobs</);
});

test('AI rewrites create immutable revisions while the published revision stays live', () => {
  const migration = read('supabase/migrations/20261014120000_relationship_gist_owner_publishing_and_ai_revisions.sql');
  const worker = read('supabase/functions/relationship-gist-ai-draft/index.ts');
  const contracts = read('supabase/functions/_shared/relationship-gist-ai/contracts.ts');
  const workspace = read('features/relationship-gists/editorial/RelationshipGistEditorialV2Workspace.tsx');

  assert.match(migration, /rpc_create_relationship_gist_ai_revision_topic/);
  assert.match(migration, /source_revision_id uuid/);
  assert.match(migration, /v_revision_number, 'draft'/);
  assert.match(migration, /set current_revision_id = v_revision\.id[\s\S]*lock_version = lock_version \+ 1/);
  assert.match(migration, /published revision[\s\S]*remains live until the owner publishes its replacement/i);
  assert.match(worker, /sourceRevision: claim\.source_revision_id/);
  assert.match(contracts, /existing_published_gist/);
  assert.match(workspace, /Revise with AI/);
  assert.match(workspace, /stays published until you approve its replacement/);
});

test('server queries return actionable AI work and retain operational summaries', () => {
  const migration = read('supabase/migrations/20261014120000_relationship_gist_owner_publishing_and_ai_revisions.sql');

  assert.match(migration, /revision\.status in \('draft', 'in_review', 'approved'\)/);
  assert.match(migration, /topic\.status in \('draft', 'approved'\)/);
  assert.match(migration, /'job_summary'/);
  assert.match(migration, /limit 20/);
  assert.match(migration, /'today_estimated_cost_microusd'/);
});

test('AI rewrite persistence uses fresh provenance and resolves terminal briefs', () => {
  const migration = read('supabase/migrations/20261014133000_relationship_gist_ai_revision_persistence_recovery.sql');

  assert.match(migration, /auth\.role\(\) = 'service_role'/);
  assert.match(migration, /job\.status = 'processing'/);
  assert.match(migration, /topic\.source_revision_id = new\.source_revision_id/);
  assert.match(migration, /set status = 'cancelled'/);
  assert.match(migration, /topic\.status <> 'cancelled'/);
  assert.doesNotMatch(migration, /delete from public\.relationship_gist_ai_/);
});
