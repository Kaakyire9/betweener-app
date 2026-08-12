import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260812190000_betweener_live_phase2_public_beta.sql', import.meta.url),
  'utf8',
);
const liveControl = readFileSync(
  new URL('../supabase/functions/live-control/index.ts', import.meta.url),
  'utf8',
);
const backstageScreen = readFileSync(
  new URL('../app/live/backstage/[sessionId].tsx', import.meta.url),
  'utf8',
);
const backstagePreview = readFileSync(
  new URL('../features/live/components/StreamLiveBackstagePreview.tsx', import.meta.url),
  'utf8',
);

test('Phase 2 enables RLS and reserves durable conversation writes for RPCs', () => {
  ['live_comments', 'live_reactions', 'live_reports'].forEach((table) => {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  });
  assert.match(migration, /revoke all on public\.live_comments,public\.live_reactions,public\.live_reports,public\.live_provider_control_jobs from public,anon,authenticated/i);
  assert.doesNotMatch(migration, /create policy[^;]+live_comments[^;]+for insert/i);
});

test('public-beta stage promotion is server-authoritative and capped at four publishers', () => {
  const promotion = migration.match(/create or replace function public\.rpc_set_live_stage_participant[\s\S]+?\nend;\n\$\$;/i)?.[0] ?? '';
  assert.match(promotion, /for update/i);
  assert.match(promotion, /least\(v_session\.maximum_publishers,4\)/i);
  assert.match(promotion, /live\.manage_stage/i);
  assert.match(promotion, /live\.publish','grant/i);
  assert.match(promotion, /live\.publish','revoke/i);
});

test('comments, reactions, reports and moderation are retry-idempotent', () => {
  assert.match(migration, /unique\(session_id, user_id, client_comment_id\)/i);
  assert.match(migration, /unique\(session_id, user_id, client_event_id\)/i);
  assert.match(migration, /unique\(session_id, reporter_user_id, client_report_id\)/i);
  assert.match(migration, /live_moderation_actions_client_id_unique/i);
  assert.match(migration, /if v_comment\.id is not null then return v_comment/i);
  assert.match(migration, /if v_reaction\.id is not null then return v_reaction/i);
});

test('user-generated public-beta activity is rate limited in the authority layer', () => {
  assert.match(migration, /live_comment_rate_limited/i);
  assert.match(migration, /live_reaction_rate_limited/i);
  assert.match(migration, /interval '30 seconds'/i);
  assert.match(migration, /interval '10 seconds'/i);
});

test('banned and removed participants cannot self-resurrect', () => {
  assert.doesNotMatch(migration, /old\.state = 'banned' and new\.state/i);
  assert.doesNotMatch(migration, /old\.state = 'removed' and new\.state in \([^)]*audience/i);
  assert.match(migration, /state in \('removed','banned'\).*live_join_forbidden/is);
});

test('Live product authority stays in Supabase and direct table mutations remain revoked', () => {
  assert.match(migration, /security definer[\s\S]+set row_security = off/i);
  assert.match(migration, /grant execute on function[\s\S]+rpc_moderate_live_participant/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on public\.live_/i);
});

test('moderation synchronizes provider controls only after authoritative RPC approval', () => {
  const authorityIndex = liveControl.indexOf("rpc('rpc_moderate_live_participant'");
  const providerIndex = liveControl.indexOf('stream.video.call');
  assert.ok(authorityIndex >= 0);
  assert.ok(providerIndex > authorityIndex);
  assert.match(liveControl, /kickUser\(\{ user_id: targetUserId, block: action === 'suspend' \}\)/);
  assert.match(liveControl, /live_provider_control_jobs/);
});

test('scheduled public beta is limited to eligible hosts and safe defaults', () => {
  const scheduling = migration.match(/create or replace function public\.rpc_schedule_live_session[\s\S]+?\nend;\n\$\$;/i)?.[0] ?? '';
  assert.match(scheduling, /rpc_can_schedule_live_session/i);
  assert.match(scheduling, /interval '10 minutes'/i);
  assert.match(scheduling, /maximum_publishers=4/i);
  assert.match(scheduling, /recording_enabled=false/i);
});

test('host lifecycle reserves the first stage seat and reaches on-stage atomically', () => {
  const hostSync = migration.match(/create or replace function public\.sync_live_host_participant_state[\s\S]+?\nend;\n\$\$;/i)?.[0] ?? '';
  assert.match(hostSync, /new\.status = 'backstage'/i);
  assert.match(hostSync, /state='backstage',stage_slot=1/i);
  assert.match(hostSync, /new\.status = 'live'/i);
  assert.match(hostSync, /state='on_stage',stage_slot=1/i);
});

test('private backstage previews devices locally and only joins after stage authority changes', () => {
  assert.match(backstageScreen, /preparePreview/);
  assert.doesNotMatch(backstageScreen, /media\.join\(/);
  assert.match(backstagePreview, /This component never joins the public RTC call/);
  assert.doesNotMatch(backstagePreview, /\.join\(/);
});
