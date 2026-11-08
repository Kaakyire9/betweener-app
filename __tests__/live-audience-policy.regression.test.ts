import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261015120000_live_audience_policy_foundation.sql',
  'utf8',
);
const repository = readFileSync('features/live/application/live-repository.ts', 'utf8');
const creationDraft = readFileSync('features/live/creation/live-creation-draft.ts', 'utf8');
const reachStep = readFileSync('features/live/creation/LiveAudienceReachStep.tsx', 'utf8');
const productionAssociation = readFileSync('hostinger-files/apple-app-site-association', 'utf8');
const publicAssociation = readFileSync('public/.well-known/apple-app-site-association', 'utf8');
const stagingAssociation = readFileSync(
  'staging-hosting-files/.well-known/apple-app-site-association',
  'utf8',
);
const productionFallback = readFileSync('hostinger-files/live/index.html', 'utf8');
const stagingFallback = readFileSync('staging-hosting-files/live/index.html', 'utf8');
const typeGenerator = readFileSync('scripts/supabase_gen_types.py', 'utf8');

test('Live audience policies are additive, normalized and server authoritative', () => {
  assert.match(migration, /create table if not exists public\.live_session_audience_policies/i);
  assert.match(migration, /policy_mode in \('explicit', 'inherit_circle', 'legacy_public'\)/i);
  assert.match(migration, /reach_scopes <@ array\['global','country','local','diaspora','circle_members','invite_only'\]/i);
  assert.match(migration, /alter table public\.live_session_audience_policies enable row level security/i);
  assert.match(migration, /revoke all on table public\.live_session_audience_policies from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /drop table|drop column/i);
});

test('Circle Live inherits Reach and discovery fails closed through the policy matcher', () => {
  assert.match(migration, /when new\.circle_id is not null then 'inherit_circle'/i);
  assert.match(migration, /live_circle_reach_matches_user_v1/i);
  assert.match(migration, /viewer\.current_country_code <> ''/i);
  assert.match(migration, /viewer\.origin_country_code <> ''/i);
  assert.match(migration, /'diaspora' = any\(circle\.resolved_reaches\)/i);
  assert.match(migration, /live_audience_policy_matches_user_v1\(session\.id, auth\.uid\(\), 'discovery'\)/i);
  assert.match(migration, /return public\.is_circle_member\(v_session\.circle_id, p_user_id\)/i);
});

test('new Studio scheduling writes policy while legacy RPC contracts remain available', () => {
  assert.match(migration, /rpc_schedule_live_studio_session_v2/i);
  assert.match(migration, /v_session := public\.rpc_schedule_live_studio_session_v1/i);
  assert.match(repository, /rpc_schedule_live_studio_session_v2/);
  assert.match(repository, /p_audience_scopes: input\.circleId \? \[\] : input\.audienceScopes/);
  assert.doesNotMatch(repository, /rpc_schedule_live_studio_session_v1', \{/);
});

test('Studio exposes explicit Reach while preserving Circle and edit authority', () => {
  assert.match(creationDraft, /'moment', 'story', 'audience', 'room', 'review'/);
  assert.match(creationDraft, /getLiveAudiencePolicyError\(draft\)/);
  assert.match(reachStep, /Circle Live cannot define a separate audience/);
  assert.match(reachStep, /Existing Reach preserved/);
  assert.match(reachStep, /LIVE_AUDIENCE_REACH_OPTIONS\.map/);
});

test('Live web links have production and staging association plus safe app fallbacks', () => {
  for (const association of [productionAssociation, publicAssociation, stagingAssociation]) {
    assert.match(association, /"\/live\/\*"/);
  }
  assert.match(productionFallback, /betweenerapp/);
  assert.match(productionFallback, /betweenerstaging/);
  assert.match(stagingFallback, /betweenerstaging:\/\/live\//);
  assert.match(productionFallback, /Sign in or join its Circle when required/);
});

test('remote type generation requires a positively selected project', () => {
  assert.match(typeGenerator, /Refusing implicit remote type generation/);
  assert.doesNotMatch(typeGenerator, /PROJECT_ID_FALLBACK/);
  assert.doesNotMatch(typeGenerator, /jbyblhithbqwojhwlenv/);
});
