import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseLiveQuickConnectHostSnapshot,
  parseLiveQuickConnectPoolSnapshot,
} from '../features/live/application/live-parsers.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const reliabilityMigration = read('../supabase/migrations/20260829210000_live_quick_connect_reliability.sql');
const intentMigration = read('../supabase/migrations/20260829213000_live_quick_connect_intent_matching.sql');
const migration = `${reliabilityMigration}\n${intentMigration}`;
const pool = read('../features/live/components/LiveQuickConnectPool.tsx');
const hostPanel = read('../features/live/components/LiveQuickConnectHostPanel.tsx');
const repository = read('../features/live/application/live-repository.ts');

test('waiting and paired presence are bounded by a fresh server lease', () => {
  assert.match(migration, /last_seen_at\s*<\s*v_now\s*-\s*interval '45 seconds'/i);
  assert.match(migration, /last_seen_at\s*>=\s*timezone\('utc', now\(\)\)\s*-\s*interval '45 seconds'/i);
  assert.match(migration, /state\s*=\s*case when participant\.state = 'paired' then 'disconnected' else 'unavailable' end/i);
  assert.match(migration, /set state = 'reconnect_grace'/i);
});

test('technical retries are bounded and cannot bypass safety feedback', () => {
  assert.match(migration, /attempt_number smallint not null default 1/i);
  assert.match(migration, /attempt_number in \(1, 2\)/i);
  assert.match(migration, /completion_reason not in \('reconnect_grace_expired', 'media_admission_failed'\)/i);
  assert.match(migration, /safety\.status <> 'completed' or safety\.experience <> 'respectful'/i);
  assert.match(migration, /live_quick_unordered_active_pair_idx/i);
});

test('pairing derives opposite-sex eligibility and keeps intention private', () => {
  assert.match(migration, /create table public\.live_quick_connect_preferences/i);
  assert.match(intentMigration, /pa\.gender = 'MALE'::public\.gender and pb\.gender = 'FEMALE'::public\.gender/i);
  assert.match(intentMigration, /pa\.gender = 'FEMALE'::public\.gender and pb\.gender = 'MALE'::public\.gender/i);
  assert.match(migration, /revoke all on public\.live_quick_connect_preferences from public, anon, authenticated/i);
  assert.match(pool, /What are you hoping to find\?/i);
  assert.match(pool, /privately guides pairing priority/i);
  assert.match(repository, /p_connection_intent:\s*connectionIntent/i);
  assert.match(intentMigration, /p_gender_preferences text\[\][\s\S]*return public\.rpc_join_live_quick_connect\(p_session_id\)/i);
});

test('mutual interest, constrained eligibility, intention and FIFO are explicit ordering rules', () => {
  assert.match(intentMigration, /mutual_constrained_intent_fifo_v2/i);
  assert.match(migration, /live_quick_connect_interests outbound[\s\S]*live_quick_connect_interests inbound/i);
  assert.match(intentMigration, /select count\(\*\)[\s\S]*live_quick_connect_pair_is_eligible[\s\S]*\) asc,[\s\S]*live_quick_connect_intent_compatibility[\s\S]*desc,[\s\S]*participant\.waiting_since asc/i);
  assert.match(migration, /'mutualInterest', v_mutual_interest/i);
  assert.match(intentMigration, /'intentCompatibility', v_intent_compatibility/i);
});

test('host capacity is constrained, parsed and enforced in the pairing loop', () => {
  assert.match(migration, /max_concurrent_pairs in \(1, 2, 4, 8\)/i);
  assert.match(migration, /while v_active_pair_count < v_control\.max_concurrent_pairs loop/i);
  assert.match(migration, /v_active_pair_count := v_active_pair_count \+ 1/i);
  assert.match(hostPanel, /const concurrencyOptions = \[1, 2, 4, 8\] as const/i);

  const snapshot = parseLiveQuickConnectHostSnapshot({
    session_id: 'session', state: 'paused', creator_mode: 'facilitator',
    round_seconds: 180, max_concurrent_pairs: 4, version: 2,
    server_now: '2026-08-29T21:00:00Z', can_manage: true,
    metrics: {
      waiting_people: 8, eligible_people: 6, active_pairs: 3,
      available_pair_slots: 1, reconnecting_people: 0, completed_rounds: 2,
    },
  });
  assert.equal(snapshot.maxConcurrentPairs, 4);
  assert.equal(snapshot.metrics.availablePairSlots, 1);
  assert.throws(() => parseLiveQuickConnectHostSnapshot({
    session_id: 'session', state: 'paused', round_seconds: 180,
    max_concurrent_pairs: 3, server_now: '2026-08-29T21:00:00Z', metrics: {},
  }), /live_quick_connect_concurrency_invalid/);
});

test('repeated serious reports create temporary holds from distinct verified reporters', () => {
  assert.match(migration, /create table public\.live_quick_connect_safety_holds/i);
  assert.match(migration, /count\(distinct safety\.reviewer_user_id\)/i);
  assert.match(migration, /coalesce\(reporter\.verification_level, 0\) >= 1/i);
  assert.match(migration, /when v_reporters >= 3 then interval '7 days' else interval '24 hours'/i);
  assert.match(migration, /not public\.live_quick_connect_has_active_safety_hold\(p_user_a\)/i);
  assert.match(migration, /rpc_release_live_quick_connect_safety_hold/i);
  assert.match(migration, /public\.is_admin_user\(auth\.uid\(\)\)/i);
});

test('pool projection returns only the caller private intention and fresh public members', () => {
  const snapshot = parseLiveQuickConnectPoolSnapshot({
    session_id: 'session', stage_layout: 'stacked', control_state: 'closed',
    creator_mode: 'facilitator', server_now: '2026-08-29T21:00:00Z',
    is_host: false, is_opted_in: false, can_opt_in: true, my_state: 'not_joined',
    connection_intent: 'long_term', members: [], queue: null,
  });
  assert.equal(snapshot.connectionIntent, 'long_term');
  assert.match(intentMigration, /'connection_intent', v_preference\.connection_intent/i);
  assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]{0,500}'allowed_genders'/i);
});
