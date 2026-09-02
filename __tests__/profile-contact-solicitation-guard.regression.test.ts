import assert from 'node:assert/strict';
import test from 'node:test';
import { moderatePublicProfileText } from '../lib/profile-guard/index.ts';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260901140000_profile_contact_solicitation_guard.sql', import.meta.url),
  'utf8',
);
const privilegeFixMigration = readFileSync(
  new URL('../supabase/migrations/20260902090000_fix_profile_guard_privilege_chain.sql', import.meta.url),
  'utf8',
);
const edgeFunction = readFileSync(
  new URL('../supabase/functions/profile-guard-update/index.ts', import.meta.url),
  'utf8',
);

for (const text of ['+44 7123 456789', '+1 (239) 219-2426', '239.219.2426', 'two three nine two one nine two four two six', 'name@example.com', 'name [at] example [dot] com', 'https://example.com', 'www.example.com', 'example.co.uk', 'WhatsApp me', "I don't reply here, message me elsewhere.", 'exclusive private content', 'cashapp me', 'guaranteed crypto returns']) {
  test(`blocks prohibited public text: ${text}`, () => assert.equal(moderatePublicProfileText(text).allowed, false));
}

for (const text of ['＋４４ ７１２３ ４５６７８９', '٢٣٩ ٢١٩ ٢٤٢٦', '2️⃣3️⃣9️⃣ 2️⃣1️⃣9️⃣ 2️⃣4️⃣2️⃣6️⃣', '2\u200b39 219 2426', 'two3nine two1nine 24two6', 'W h a t s A p p me', 's.i.g.n.a.l me', 'find me on the paper plane app', "Come see what I can't show here 😉", 'Ask me where I post my private stuff.', "I don't really use this app. Find me elsewhere.", 'Subscribers get access to everything.']) {
  test(`blocks adversarial or euphemistic solicitation: ${text}`, () => assert.equal(moderatePublicProfileText(text).allowed, false));
}

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
