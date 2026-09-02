import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const migration = read('../supabase/migrations/20260829170000_live_quick_connect_private_safety.sql');
const route = read('../app/live/quick-connect/[sessionId].tsx');
const check = read('../features/live/components/LiveQuickConnectSafetyCheck.tsx');
const dock = read('../features/live/components/LiveQuickConnectControlDock.tsx');
const repository = read('../features/live/application/live-repository.ts');

test('every terminal private round opens one private safety check per participant', () => {
  assert.match(migration, /create table public\.live_quick_connect_safety_checks/i);
  assert.match(migration, /unique\(pairing_id, reviewer_user_id\)/i);
  assert.match(migration, /after update of state on public\.live_quick_connect_pairings/i);
  assert.match(migration, /new\.state not in \('completed', 'round_incomplete', 'cancelled'\)/i);
  assert.match(migration, /set state = 'safety_check'/i);
  assert.match(migration, /status = 'pending'/i);
});

test('safety answers are private and exposed only through a server-authoritative RPC', () => {
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on public\.live_quick_connect_safety_checks from public, anon, authenticated/i);
  assert.match(migration, /rpc_submit_live_quick_connect_safety_check/i);
  assert.match(migration, /reviewer_user_id = v_user_id/i);
  assert.doesNotMatch(migration, /grant select on public\.live_quick_connect_safety_checks to authenticated/i);
  assert.match(repository, /submitQuickConnectSafetyCheck[\s\S]*?rpc_submit_live_quick_connect_safety_check/i);
});

test('safety reports and blocks are pairing-scoped, idempotent and moderation-ready', () => {
  assert.match(migration, /insert into public\.blocks\(blocker_id, blocked_id\)/i);
  assert.match(migration, /on conflict\(blocker_id, blocked_id\) do nothing/i);
  assert.match(migration, /insert into public\.live_reports/i);
  assert.match(migration, /on conflict\(session_id, reporter_user_id, client_report_id\)/i);
  assert.match(migration, /rpc_list_live_quick_connect_safety_reports/i);
  assert.match(migration, /live\.view_safety_console/i);
});

test('an in-call safety report terminates transport and still protects the other participant', () => {
  assert.match(migration, /if v_pairing\.state in \('active', 'reconnect_grace'\)/i);
  assert.match(migration, /p_experience <> 'safety_concern'/i);
  assert.match(migration, /set state = 'round_incomplete'/i);
  assert.match(dock, /End and report this Quick Connect/i);
  assert.match(route, /onReport=\{\(\) =>/i);
});

test('the post-round safety check is mandatory before returning to Live', () => {
  assert.match(route, /safetyRequired = completed && !pairing\.safetyReviewed/i);
  assert.match(route, /BackHandler\.addEventListener\('hardwareBackPress'/i);
  assert.match(route, /gestureEnabled: false/i);
  assert.match(route, /mandatory=\{safetyRequired\}/i);
  assert.match(route, /onSafetyComplete=\{returnToLive\}/i);
  assert.match(check, /Your answer is private/i);
  assert.match(check, /Respectful/i);
  assert.match(check, /Uncomfortable/i);
  assert.match(check, /Report a safety concern/i);
  assert.doesNotMatch(check, /star|rating|score/i);
});
