import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'supabase/functions/live-rtc-token/index.ts'),
  'utf8',
);
const config = fs.readFileSync(
  path.join(root, 'supabase/functions/live-rtc-token/config.toml'),
  'utf8',
);
const deno = JSON.parse(fs.readFileSync(
  path.join(root, 'supabase/functions/live-rtc-token/deno.json'),
  'utf8',
)) as { imports?: Record<string, string> };
const rateLimitMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260812113000_live_rtc_token_rate_limit.sql'),
  'utf8',
);

test('Live RTC token function requires platform JWT verification and pins dependencies', () => {
  assert.match(config, /verify_jwt\s*=\s*true/);
  assert.equal(
    deno.imports?.['@stream-io/node-sdk'],
    'npm:@stream-io/node-sdk@0.7.63',
  );
  assert.equal(
    deno.imports?.['@supabase/supabase-js'],
    'npm:@supabase/supabase-js@2.110.7',
  );
});

test('Live RTC tokens are call-scoped, short-lived, rate-limited and no-store', () => {
  assert.match(source, /rpc_get_live_rtc_admission_v2/);
  assert.match(source, /generateCallToken/);
  assert.match(source, /call_cids:\s*\[callCid\]/);
  assert.match(source, /PUBLIC_TOKEN_TTL_SECONDS\s*=\s*10\s*\*\s*60/);
  assert.match(source, /rpc_bump_live_rtc_token_rate_limit/);
  assert.match(source, /Cache-Control['"]:\s*['"]no-store/);
  assert.match(rateLimitMigration, /auth\.uid\(\)::text/);
  assert.match(rateLimitMigration, /revoke all on function public\.rpc_bump_live_rtc_token_rate_limit/);
  assert.match(rateLimitMigration, /grant execute[\s\S]*to authenticated/);
});

test('Live RTC calls mirror the database participant ceiling at Stream', () => {
  assert.match(source, /maximum_participants:\s*number/);
  assert.match(source, /admission\.maximum_participants > 100/);
  assert.match(source, /settings_override:[\s\S]+max_participants: admission\.maximum_participants/);
});

test('Live RTC endpoint rejects private spark and controls publisher permissions server-side', () => {
  assert.match(source, /participant_state === 'private_spark'/);
  assert.match(source, /\['backstage', 'live', 'ending'\]\.includes\(admission\.session_status\)/);
  assert.match(source, /Array\.isArray\(admission\.capabilities\)/);
  assert.match(source, /updateUserPermissions/);
  assert.match(source, /capabilities\.includes\('live\.publish'\)/);
  assert.match(source, /revoke_permissions/);
  const issuedLog = source.match(/safeLog\('issued',\s*\{([\s\S]*?)\}\);/)?.[1] ?? '';
  assert.doesNotMatch(issuedLog, /\b(?:token|streamSecret|streamApiKey)\b/i);
  assert.doesNotMatch(source, /safeLog\([^\n]*(?:streamSecret|streamApiKey)/i);
  assert.doesNotMatch(source, /service_role/i);
});

test('Live RTC admission exposes only safe actionable denial codes', () => {
  assert.match(source, /const SAFE_ADMISSION_ERRORS = new Set/);
  assert.match(source, /live_admission_account_ineligible/);
  assert.match(source, /live_admission_session_unavailable/);
  assert.match(source, /live_admission_forbidden/);
  assert.match(source, /const denialCode = admissionErrorCode\(error\)/);
  assert.match(source, /return json\(\{ error: denialCode \}, 403\)/);
});

test('an audience member can never become the provider call creator', () => {
  assert.match(source, /id:\s*'betweener-live-system'/);
  assert.match(source, /id:\s*userId,\s*\n\s*role:\s*'user'/);
  assert.ok(source.indexOf('id: userId') < source.indexOf('call.getOrCreate'));
  assert.match(source, /created_by_id:\s*'betweener-live-system'/);
  assert.match(source, /members:\s*\[\{ user_id:\s*userId, role:\s*'call_member' \}\]/);
  assert.match(source, /update_members:\s*\[\{ user_id:\s*userId, role:\s*'call_member' \}\]/);
  assert.doesNotMatch(source, /created_by_id:\s*userId/);
});

test('a missing provider call type is diagnosed without leaking provider details', () => {
  assert.match(source, /providerStep === 'call_get_or_create'/);
  assert.match(source, /Number\(code\) === 16/);
  assert.match(source, /live_provider_call_type_missing/);
});
