import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260812103000_betweener_live_phase1_foundation.sql', import.meta.url),
  'utf8',
);

test('Live foundation enables RLS for every client-adjacent table', () => {
  [
    'live_creator_eligibility', 'live_sessions', 'live_participants', 'live_participant_roles', 'live_session_capability_assignments',
    'live_seat_requests', 'live_session_events', 'live_moderation_actions',
    'live_provider_webhook_events',
  ].forEach((table) => assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i')));
});

test('provider webhook receipts and RTC call identities are database-idempotent', () => {
  assert.match(migration, /unique \(provider, provider_event_id\)/i);
  assert.match(migration, /unique \(provider, provider_call_id\)/i);
});

test('stage positions are unique without limiting off-stage participants', () => {
  assert.match(migration, /create unique index live_participants_session_stage_slot_unique\s+on public\.live_participants\(session_id, stage_slot\)\s+where stage_slot is not null/i);
  assert.doesNotMatch(migration, /unique nulls not distinct \(session_id, stage_slot\)/i);
});

test('critical Live mutations are RPC-owned and security hardened', () => {
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_catalog/i);
  assert.match(migration, /revoke all on function[\s\S]*public\.rpc_get_live_rtc_admission\(uuid\)[\s\S]*from public, anon/i);
  assert.doesNotMatch(migration, /create policy[^;]+live_sessions[^;]+for (insert|update|delete)/i);
  assert.match(migration, /revoke all on public\.live_creator_eligibility[\s\S]+from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant select on[^;]*public\.live_sessions/i);
});

test('RTC admission is verified, participant-bound and rejects terminal states', () => {
  const admission = migration.match(/create or replace function public\.rpc_get_live_rtc_admission[\s\S]+?\nend;\n\$\$;/i)?.[0] ?? '';
  assert.match(admission, /verification_level/);
  assert.match(admission, /live\.has_live_capability|has_live_capability/);
  assert.match(admission, /state not in \('confirmed','backstage','audience','stage_requested','on_stage','temporarily_disconnected'\)/);
  assert.doesNotMatch(admission, /'private_spark'/);
  assert.doesNotMatch(admission, /private_room|private_spark_token/i);
});

test('creator eligibility is backend-owned and context scoped', () => {
  assert.match(migration, /create table public\.live_creator_eligibility/i);
  assert.match(migration, /allowed_context_types/);
  assert.match(migration, /create or replace function public\.can_create_live_context/i);
  assert.doesNotMatch(migration, /create policy[^;]+live_creator_eligibility[^;]+for (insert|update|delete)/i);
});

test('database capabilities keep matchmaker and moderator authority separate', () => {
  const matchmaker = migration.match(/when 'matchmaker' then array\[([^\]]+)\]/i)?.[1] ?? '';
  const moderator = migration.match(/when 'moderator' then array\[([^\]]+)\]/i)?.[1] ?? '';
  assert.match(matchmaker, /live\.suggest_match/);
  assert.doesNotMatch(matchmaker, /live\.mute_public_participant|live\.suspend_participant/);
  assert.match(moderator, /live\.mute_public_participant/);
  assert.doesNotMatch(moderator, /live\.suggest_match/);
  assert.doesNotMatch(matchmaker, /live\.terminate_private_spark/);
  assert.match(moderator, /live\.terminate_private_spark/);
});

test('terminal session and participant states cannot resurrect', () => {
  assert.match(migration, /old\.status = 'live' and new\.status = 'ending'/i);
  assert.match(migration, /old\.status = 'ending' and new\.status = 'ended'/i);
  assert.doesNotMatch(migration, /old\.status = 'ended' and new\.status/i);
  assert.doesNotMatch(migration, /old\.state = 'banned' and new\.state/i);
});
