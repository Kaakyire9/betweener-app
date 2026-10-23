import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('AI studio is disabled by default on both client and server', () => {
  const clientFlag = read('features/relationship-gists/config/relationship-gist-ai-flags.ts');
  const worker = read('supabase/functions/relationship-gist-ai-draft/index.ts');
  assert.match(clientFlag, /=== 'true'/);
  assert.match(worker, /RELATIONSHIP_GIST_AI_STUDIO_ENABLED[^\n]+!== 'true'/);
});

test('Gist drafting reuses safety and secret-key infrastructure without Live Odo coupling', () => {
  const worker = read('supabase/functions/relationship-gist-ai-draft/index.ts');
  assert.match(worker, /content-safety\.ts/);
  assert.match(worker, /supabase-admin-key\.ts/);
  assert.doesNotMatch(worker, /_shared\/odo|live[_-]/i);
});

test('AI worker can request, claim, fail, or complete a draft but has no publication RPC', () => {
  const worker = read('supabase/functions/relationship-gist-ai-draft/index.ts');
  assert.match(worker, /rpc_request_relationship_gist_ai_generation/);
  assert.match(worker, /rpc_service_claim_relationship_gist_ai_job/);
  assert.match(worker, /rpc_service_complete_relationship_gist_ai_job/);
  assert.match(worker, /maxAttempts:\s*1/);
  assert.doesNotMatch(worker, /rpc_transition_relationship_gist_revision|rpc_publish_relationship_gist/);
});

test('database completion creates draft-only content and gates review', () => {
  const migration = read('supabase/migrations/20261010140000_relationship_gist_ai_editorial_studio.sql');
  assert.match(migration, /p_output ->> 'perspective' <> v_topic\.requested_perspective/);
  assert.match(migration, /p_output -> 'safety' -> 'specialist_reviews'/);
  assert.match(migration, /'draft', v_profile, v_job\.requested_by_user_id/);
  assert.match(migration, /gist_ai_claims_verification_required/);
  assert.match(migration, /gist_ai_source_review_required/);
  assert.match(migration, /gist_ai_specialist_review_required/);
});

test('source review UI explicitly warns editors that AI suggestions are unverified', () => {
  const studio = read('features/relationship-gists/ai/RelationshipGistAIStudio.tsx');
  assert.match(studio, /unverified/i);
  assert.match(studio, /verify/i);
  assert.match(studio, /reject/i);
});

test('owner workflow distinguishes the editorial brief from generated copy', () => {
  const studio = read('features/relationship-gists/ai/RelationshipGistAIStudio.tsx');
  assert.match(studio, /EDITORIAL BRIEF · INSTRUCTIONS FOR AI/);
  assert.match(studio, /This is your prompt—not AI-generated copy/);
  assert.match(studio, /Generate AI draft/);
  assert.doesNotMatch(studio, /Awaiting approval from a different quality reviewer/);
});

test('owner review keeps AI draft-only and requires explicit manual gates', () => {
  const migration = read('supabase/migrations/20261013100000_relationship_gist_ai_owner_review.sql');
  const studio = read('features/relationship-gists/ai/RelationshipGistAIStudio.tsx');
  assert.match(migration, /admin\.role = 'super_admin'/);
  assert.match(migration, /gist_ai_claims_verification_required/);
  assert.match(migration, /verification_status = 'unverified'/);
  assert.match(migration, /gist_ai_specialist_review_required/);
  assert.match(migration, /gist_ai_image_review_required/);
  assert.match(migration, /owner_review_published/);
  assert.match(migration, /revoke all on function public\.rpc_publish_relationship_gist_ai_owner_review\(uuid,text\)[\s\S]*service_role/);
  assert.doesNotMatch(migration, /set verification_status = 'verified'/);
  assert.match(studio, /YOUR PUBLISHING CHECKLIST/);
  assert.match(studio, /Review complete — publish/);
});

test('legacy reader and Circles entry points remain in place', () => {
  const explore = read('app/(tabs)/explore.tsx');
  const migration = read('supabase/migrations/20261010140000_relationship_gist_ai_editorial_studio.sql');
  const editorialV2 = read('supabase/migrations/20261010130000_relationship_gist_editorial_v2.sql');
  assert.match(explore, /Relationship Gist/i);
  assert.match(editorialV2, /rpc_get_global_relationship_gists/);
  assert.doesNotMatch(migration, /drop\s+(table|function).*relationship_gist/i);
});

test('AI imagery is private, budget capped, human reviewed, and cannot publish', () => {
  const migration = read('supabase/migrations/20261012180000_relationship_gist_ai_editorial_images.sql');
  const worker = read('supabase/functions/relationship-gist-ai-image/index.ts');
  assert.match(migration, /daily_image_job_budget integer not null default 3/);
  assert.match(migration, /'relationship-gist-covers', false/);
  assert.match(migration, /config\.expo_project_id = '7f38a835-2da7-419b-a20b-e1a12e021547'/);
  assert.match(migration, /'staging', true, true, 'openai', 'gpt-6-luna'/);
  assert.match(migration, /gist_ai_image_self_approval_forbidden/);
  assert.match(migration, /image\.status = 'approved'/);
  assert.match(worker, /RELATIONSHIP_GIST_AI_IMAGE_ENABLED/);
  assert.match(worker, /estimatedCostMicrousd/);
  assert.doesNotMatch(worker, /rpc_transition_relationship_gist_revision|rpc_publish_relationship_gist/);
});

test('reader cover uses immutable identity and the account-scoped offline image store', () => {
  const cover = read('features/relationship-gists/components/RelationshipGistCover.tsx');
  const repository = read('features/relationship-gists/media/relationship-gist-cover-repository.ts');
  assert.match(repository, /rpc_get_relationship_gist_cover/);
  assert.match(repository, /createSignedUrl/);
  assert.match(cover, /resolveOfflineImageUri/);
  assert.match(cover, /cover\.id.*cover\.sha256/);
});
