import assert from 'node:assert/strict';
import test from 'node:test';
import { moderatePublicProfileText } from '../lib/profile-guard/index.ts';
import { needsSemanticReview } from '../supabase/functions/_shared/profile-guard-policy.ts';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260901140000_profile_contact_solicitation_guard.sql', import.meta.url),
  'utf8',
);
const onboardingPermissionMigration = readFileSync(
  new URL('../supabase/migrations/20260905080000_fix_profile_guard_onboarding_helper_permissions.sql', import.meta.url),
  'utf8',
);
const serviceWriteIdentityMigration = readFileSync(
  new URL('../supabase/migrations/20260905092000_fix_profile_guard_service_write_identity.sql', import.meta.url),
  'utf8',
);
const completionWriteIdentityMigration = readFileSync(
  new URL('../supabase/migrations/20260905093000_fix_profile_guard_completion_write_identity.sql', import.meta.url),
  'utf8',
);
const legacyOnboardingCompatibilityMigration = readFileSync(
  new URL('../supabase/migrations/20260905100000_legacy_onboarding_guard_compatibility.sql', import.meta.url),
  'utf8',
);
const legacyProfileEditCompatibilityMigration = readFileSync(
  new URL('../supabase/migrations/20260905233000_restore_guarded_legacy_profile_edits.sql', import.meta.url),
  'utf8',
);
const privilegeFixMigration = readFileSync(
  new URL('../supabase/migrations/20260902090000_fix_profile_guard_privilege_chain.sql', import.meta.url),
  'utf8',
);
const remediationMigration = readFileSync(
  new URL('../supabase/migrations/20260902103000_fix_profile_guard_legacy_remediation.sql', import.meta.url),
  'utf8',
);
const hardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260903100000_profile_guard_p0_hardening.sql', import.meta.url),
  'utf8',
);
const adminWorkflowMigration = readFileSync(
  new URL('../supabase/migrations/20260903113000_profile_guard_admin_review_workflow.sql', import.meta.url),
  'utf8',
);
const edgeFunction = readFileSync(
  new URL('../supabase/functions/_shared/profile-guard-handler.ts', import.meta.url),
  'utf8',
);

for (const text of ['+44 7123 456789', '+1 (239) 219-2426', '239.219.2426', 'two three nine two one nine two four two six', 'name@example.com', 'name [at] example [dot] com', 'https://example.com', 'www.example.com', 'example.co.uk', 'WhatsApp me', "I don't reply here, message me elsewhere.", 'exclusive private content', 'cashapp me', 'guaranteed crypto returns']) {
  test(`blocks prohibited public text: ${text}`, () => assert.equal(moderatePublicProfileText(text).allowed, false));
}

test('restricts explicit paid-platform redirection with external contact details', () => {
  const result = moderatePublicProfileText(
    "See my exclusive on my onlyfan$. I'm online on Signal +1 239 219 2426",
  );
  assert.equal(result.decision, 'RESTRICT_PROFILE');
  assert.ok(result.categories.includes('PHONE_CONTACT'));
  assert.ok(result.categories.includes('EXTERNAL_MESSAGING'));
  assert.ok(result.categories.includes('PAID_CONTENT_PROMOTION'));
});

test('recognizes standalone external-messaging presence and paid-platform promotion', () => {
  assert.equal(moderatePublicProfileText("I'm online on Signal").allowed, false);
  assert.equal(moderatePublicProfileText('See my exclusive on my onlyfan$').allowed, false);
});

test('allows a non-promotional professional reference to a creator platform', () => {
  assert.equal(moderatePublicProfileText('I build software for OnlyFans creators.').allowed, true);
});

test('unrelated professional fields cannot suppress semantic profile review', () => {
  assert.equal(
    needsSemanticReview(
      'Software Engineer I sell private memberships photos away from this app. Ask me how to subscribe.',
    ),
    true,
  );
});

for (const text of ['＋４４ ７１２３ ４５６７８９', '٢٣٩ ٢١٩ ٢٤٢٦', '2️⃣3️⃣9️⃣ 2️⃣1️⃣9️⃣ 2️⃣4️⃣2️⃣6️⃣', '2\u200b39 219 2426', 'two3nine two1nine 24two6', 'W h a t s A p p me', 's.i.g.n.a.l me', 'find me on the paper plane app', "Come see what I can't show here 😉", 'Ask me where I post my private stuff.', "I don't really use this app. Find me elsewhere.", 'Subscribers get access to everything.', 'I sell private membership photos away from this app. Ask me how to subscribe.', 'Unlock my private gallery; ask how to join.', 'See my O n l y F a n s page.']) {
  test(`blocks adversarial or euphemistic solicitation: ${text}`, () => assert.equal(moderatePublicProfileText(text).allowed, false));
}

test('P0 hardening closes field, prompt, concurrency, throttling, and visibility gaps', () => {
  for (const field of [
    'username', 'tribe', 'roots', 'personality_type', 'love_language',
    'living_situation', 'pets', 'languages_spoken', 'relationship_compass',
  ]) {
    assert.match(hardeningMigration, new RegExp(`new\\.${field}|'${field}'`, 'i'));
  }
  assert.match(hardeningMigration, /update of prompt_title, answer, hint_text, guess_options/i);
  assert.match(hardeningMigration, /rpc_service_consume_profile_guard_rate_limit/i);
  assert.match(hardeningMigration, /rpc_service_update_profile_with_guard_v2/i);
  assert.match(hardeningMigration, /PROFILE_WRITE_CONFLICT/i);
  assert.match(hardeningMigration, /p\.profile_moderation_state = 'CLEAR'/i);
  assert.match(edgeFunction, /rpc_service_consume_profile_guard_rate_limit/i);
  assert.match(edgeFunction, /buildPublicProfileText/i);
  assert.doesNotMatch(edgeFunction, /\.slice\(0,\s*2_000\)/i);
});

test('admin review workflow captures evidence and exposes only guarded admin operations', () => {
  assert.match(edgeFunction, /p_evidence_snapshot:\s*evidenceSnapshot/i);
  assert.match(adminWorkflowMigration, /add column if not exists evidence_snapshot jsonb/i);
  assert.match(adminWorkflowMigration, /rpc_admin_get_profile_guard_review_queue/i);
  assert.match(adminWorkflowMigration, /rpc_admin_resolve_profile_guard_review/i);
  assert.match(adminWorkflowMigration, /notify_internal_admin_queue_item/i);
  assert.match(adminWorkflowMigration, /other_open_review/i);
  assert.match(adminWorkflowMigration, /REVIEW_ALREADY_RESOLVED/i);
  assert.match(adminWorkflowMigration, /revoke all on function public\.rpc_admin_get_profile_guard_review_queue[\s\S]*from public, anon/i);
  assert.match(adminWorkflowMigration, /grant execute on function public\.rpc_admin_get_profile_guard_review_queue[\s\S]*to authenticated/i);
});

for (const text of ["I'm a content creator who makes travel videos.", "I'm a content creator.", 'I make subscription software for creators.', 'I work in investment banking.', 'I work in marketing.', 'I have two dogs and three children.', 'I have 3 children.', "I've visited 12 countries.", 'My favourite band is U2.', 'My perfect date is dinner at 7.', 'I moved here in 2024.', 'I have 2 dogs and 1 cat.', 'My job involves social media marketing.', 'I love Instagram photography.', 'Signal is an interesting messaging app.', 'My favourite messaging app design is Signal.', 'I want someone between 30 and 40.']) {
  test(`allows normal profile text: ${text}`, () => assert.equal(moderatePublicProfileText(text).allowed, true));
}

test('Edge identity is verified by Supabase Auth and never selected from payload identifiers', () => {
  assert.match(edgeFunction, /authClient\.auth\.getUser\(bearerMatch\[1\]\)/);
  assert.match(edgeFunction, /hasForbiddenTargetIdentifier/);
  assert.match(edgeFunction, /p_user_id:\s*authData\.user\.id/);
  assert.doesNotMatch(edgeFunction, /p_user_id:\s*(?:body|updateRecord)/);
});

test('service bridge and management RPC privileges are closed', () => {
  assert.match(migration, /revoke all on function public\.rpc_service_update_profile_with_guard\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.rpc_service_update_profile_with_guard\(uuid, jsonb\)[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.rpc_update_profile_with_guard\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /set search_path = public, pg_catalog, auth/i);
  assert.match(privilegeFixMigration, /revoke all on function public\.rpc_backfill_profile_contact_guard\([\s\S]*from public, anon, authenticated/i);
  assert.match(privilegeFixMigration, /grant execute on function public\.rpc_backfill_profile_contact_guard\([\s\S]*to service_role/i);
  assert.match(privilegeFixMigration, /revoke all on function public\.can_authenticated_user_view_profile\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(privilegeFixMigration, /grant execute on function public\.can_authenticated_user_view_profile\(uuid\)[\s\S]*to authenticated, service_role/i);
});

test('legacy remediation preserves visibility and exposes only a service-role action', () => {
  assert.match(remediationMigration, /'prior_discoverable', row_profile\.discoverable_in_vibes/i);
  assert.match(remediationMigration, /create or replace function public\.rpc_enforce_profile_contact_guard/i);
  assert.match(remediationMigration, /revoke all on function public\.rpc_enforce_profile_contact_guard\(uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(remediationMigration, /grant execute on function public\.rpc_enforce_profile_contact_guard\(uuid\)[\s\S]*to service_role/i);
  assert.match(remediationMigration, /profile_guard_restore_legacy_discoverability/i);
});

test('structured location fields and canonical public visibility are enforced', () => {
  assert.match(migration, /profile_guard_structured_text_is_valid\([\s\S]*'city'[\s\S]*'region'[\s\S]*'last_ghana_visit'/i);
  assert.match(migration, /profile_guard_location_is_derived/i);
  assert.match(migration, /create or replace function public\.can_profile_surface_publicly/i);
  for (const state of ['ACTION_REQUIRED', 'RESTRICTED', 'REVIEW_REQUIRED', 'SUSPENDED']) {
    assert.match(migration, new RegExp(state));
  }
  assert.match(migration, /public\.can_profile_surface_publicly\(p_target_profile_id\)/i);
  assert.match(migration, /public\.can_profile_surface_publicly\(pa\.id\)/i);
  assert.match(migration, /public\.can_profile_surface_publicly\(profile\.id\)/i);
});

test('onboarding can execute only the narrow structured validation helpers', () => {
  assert.match(onboardingPermissionMigration, /alter function public\.profile_guard_structured_text_is_valid\(text, text\)[\s\S]*security definer/i);
  assert.match(onboardingPermissionMigration, /grant execute on function public\.profile_guard_structured_text_is_valid\(text, text\)[\s\S]*to authenticated/i);
  assert.match(onboardingPermissionMigration, /grant execute on function public\.profile_guard_location_is_derived\(text, text, text, text\)[\s\S]*to authenticated/i);
  assert.match(onboardingPermissionMigration, /revoke all on function public\.profile_guard_assess\(text\)[\s\S]*authenticated/i);
});

test('guarded onboarding writes trust the verified service JWT rather than function ownership', () => {
  assert.match(serviceWriteIdentityMigration, /auth\.role\(\) = 'service_role'/i);
  assert.match(serviceWriteIdentityMigration, /session_user = 'postgres' and current_user = 'postgres'/i);
  assert.match(serviceWriteIdentityMigration, /create or replace function public\.profile_guard_prompt_write\(\)[\s\S]*auth\.role\(\) = 'service_role'/i);
  assert.doesNotMatch(serviceWriteIdentityMigration, /current_user in \('postgres', 'service_role'\)/i);
});

test('onboarding completion fields use the verified service identity boundary', () => {
  assert.match(completionWriteIdentityMigration, /create or replace function public\.profile_guard_protect_system_fields\(\)/i);
  assert.match(completionWriteIdentityMigration, /auth\.role\(\) = 'service_role'/i);
  assert.match(completionWriteIdentityMigration, /app\.profile_guard_write/i);
  assert.match(completionWriteIdentityMigration, /app\.server_managed_update/i);
  assert.doesNotMatch(completionWriteIdentityMigration, /current_user in \('postgres', 'service_role'\)/i);
});

test('legacy production onboarding and safe edits retain deterministic enforcement', () => {
  assert.match(legacyOnboardingCompatibilityMigration, /not coalesce\(old\.profile_completed, false\)[\s\S]*coalesce\(new\.profile_completed, false\)/i);
  assert.match(legacyOnboardingCompatibilityMigration, /new\.user_id = auth\.uid\(\)/i);
  assert.match(legacyOnboardingCompatibilityMigration, /profile_guard_assess\(concat_ws/i);
  assert.match(legacyOnboardingCompatibilityMigration, /PROFILE_CONTENT_NOT_ALLOWED/i);
  assert.match(legacyOnboardingCompatibilityMigration, /PROFILE_GUARD_REQUIRED/i);
  assert.match(legacyProfileEditCompatibilityMigration, /v_legacy_profile_edit/i);
  assert.match(legacyProfileEditCompatibilityMigration, /profile_guard_assess\(v_proposed_text\)/i);
  assert.match(legacyProfileEditCompatibilityMigration, /PROFILE_CONTENT_NOT_ALLOWED/i);
  assert.match(legacyProfileEditCompatibilityMigration, /new\.profile_moderation_state is not distinct from old\.profile_moderation_state/i);
});
