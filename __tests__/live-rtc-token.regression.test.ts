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
  assert.match(source, /rpc_get_live_rtc_admission/);
  assert.match(source, /generateCallToken/);
  assert.match(source, /call_cids:\s*\[callCid\]/);
  assert.match(source, /PUBLIC_TOKEN_TTL_SECONDS\s*=\s*10\s*\*\s*60/);
  assert.match(source, /rpc_bump_live_rtc_token_rate_limit/);
  assert.match(source, /Cache-Control['"]:\s*['"]no-store/);
  assert.match(rateLimitMigration, /auth\.uid\(\)::text/);
  assert.match(rateLimitMigration, /revoke all on function public\.rpc_bump_live_rtc_token_rate_limit/);
  assert.match(rateLimitMigration, /grant execute[\s\S]*to authenticated/);
});

test('Live RTC endpoint rejects private spark and controls publisher permissions server-side', () => {
  assert.match(source, /participant_state === 'private_spark'/);
  assert.match(source, /updateUserPermissions/);
  assert.match(source, /capabilities\.includes\('live\.publish'\)/);
  assert.match(source, /revoke_permissions/);
  const issuedLog = source.match(/safeLog\('issued',\s*\{([\s\S]*?)\}\);/)?.[1] ?? '';
  assert.doesNotMatch(issuedLog, /\b(?:token|streamSecret|streamApiKey)\b/i);
  assert.doesNotMatch(source, /safeLog\([^\n]*(?:streamSecret|streamApiKey)/i);
  assert.doesNotMatch(source, /service_role/i);
});

test('an audience member can never become the provider call creator', () => {
  assert.match(source, /id:\s*'betweener-live-system'/);
  assert.doesNotMatch(source, /created_by_id:\s*userId/);
});
