import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260916120000_atomic_profile_onboarding_v2.sql');
const evidenceFix = read('../supabase/migrations/20260917120000_fix_atomic_onboarding_v2_evidence.sql');
const handler = read('../supabase/functions/_shared/profile-guard-handler.ts');
const entry = read('../supabase/functions/profile-onboarding-submit-v2/index.ts');
const flow = read('../components/onboarding/PremiumOnboardingFlow.tsx');
const completionClient = read('../lib/onboarding/premium-onboarding.complete.ts');
const draftStore = read('../lib/onboarding/premium-onboarding.draft.ts');

test('v2 endpoint is additive and selects the v2 contract explicitly', () => {
  assert.match(entry, /onboardingContractVersion:\s*2/);
  assert.match(entry, /requireOnboarding:\s*true/);
  assert.match(handler, /rpc_service_complete_profile_onboarding_v2/);
  assert.match(handler, /rpc_service_complete_profile_onboarding_with_guard_v1/);
  assert.match(handler, /profile_onboarding_completion_receipts_v2/);
  assert.match(handler, /already_completed:\s*true/);
});

test('v2 transaction atomically commits interests and profile completion', () => {
  assert.match(migration, /where user_id = p_user_id\s+for update/i);
  assert.match(migration, /rpc_service_update_profile_with_guard_v3/i);
  assert.match(migration, /delete from public\.profile_interests/i);
  assert.match(migration, /insert into public\.profile_interests/i);
  assert.match(migration, /profile_completed = true/i);
  assert.match(migration, /profile_onboarding_completion_receipts_v2/i);
  assert.match(migration, /profile_media_reference_is_approved/i);
  assert.match(migration, /raise exception using[\s\S]*ONBOARDING_REQUIREMENTS_NOT_MET/i);
});

test('v2 transaction validates catalogue, requirements, and service boundary', () => {
  assert.match(migration, /ONBOARDING_INTEREST_CATALOG_MISMATCH/i);
  assert.match(migration, /ONBOARDING_REQUIREMENTS_NOT_MET/i);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.match(migration, /revoke all on function public\.rpc_service_complete_profile_onboarding_v2[\s\S]*authenticated/i);
});

test('v2 completion keeps guard evidence within the strict v3 contract', () => {
  assert.match(handler, /p_evidence_snapshot:\s*evidenceSnapshot/);
  assert.doesNotMatch(
    handler,
    /p_evidence_snapshot:\s*\{[\s\S]{0,250}completion_request_id:\s*completionRequestId/,
  );
  assert.match(evidenceFix, /jsonb_build_object\([\s\S]*'profile_updates'/i);
  assert.match(evidenceFix, /p_evidence_snapshot->'profile_updates'/i);
});

test('mobile requires committed acknowledgement and no longer writes interests separately', () => {
  assert.match(flow, /completePremiumOnboardingV2/);
  assert.match(flow, /if \(!completion\.committed\)/);
  assert.doesNotMatch(flow, /from\("profile_interests"\)/);
  assert.match(completionClient, /data\?\.committed !== true/);
});

test('draft recovery stores a stable completion request and clears only after commit', () => {
  assert.match(draftStore, /completionRequestId/);
  assert.match(draftStore, /DRAFT_TTL_MS/);
  assert.match(flow, /loadPremiumOnboardingDraft/);
  assert.match(flow, /clearPremiumOnboardingDraft/);
});
