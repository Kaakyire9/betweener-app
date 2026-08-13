import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canTransitionLiveMatchRound,
  transitionLiveMatchRound,
} from '../features/live/domain/live-match-round-machine.ts';
import { parseLiveHostedMatchingSnapshot } from '../features/live/application/live-parsers.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260813203000_live_phase3_hosted_matching.sql', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../features/live/application/live-repository.ts', import.meta.url),
  'utf8',
);
const route = readFileSync(new URL('../app/live/[sessionId].tsx', import.meta.url), 'utf8');
const modal = readFileSync(
  new URL('../features/live/components/LiveHostedMatchingModal.tsx', import.meta.url),
  'utf8',
);
const publicIntroduction = readFileSync(
  new URL('../features/live/components/LivePublicIntroductionCard.tsx', import.meta.url),
  'utf8',
);

test('Phase 3 persists one active, idempotent and non-repeating proposal per session', () => {
  assert.match(migration, /live_match_round_client_id_unique unique \(session_id, created_by_user_id, client_proposal_id\)/i);
  assert.match(migration, /create unique index live_match_round_one_active_per_session/i);
  assert.match(migration, /create unique index live_match_round_pair_once_per_session/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('live-match:'/i);
});

test('double consent is private and can only resolve from two immutable participant responses', () => {
  assert.match(migration, /live_match_response_one_per_user unique \(match_round_id, user_id\)/i);
  assert.match(migration, /live_match_response_participant_guard/i);
  assert.match(migration, /v_decision text := case when p_accept then 'accepted' else 'declined' end/i);
  assert.match(migration, /if v_existing <> v_decision then/i);
  assert.match(migration, /if v_accepted=2 then v_next := 'both_accepted'/i);
  assert.doesNotMatch(migration, /create policy[^;]+live_match_round_responses[^;]+for select/is);
});

test('pair eligibility enforces mutual age, blocking, active profiles and introduction opt-in', () => {
  const functionBody = migration.match(/create or replace function public\.live_match_pair_is_eligible[\s\S]+?\n\$\$;/i)?.[0] ?? '';
  assert.match(functionBody, /a\.open_to_introductions/i);
  assert.match(functionBody, /b\.open_to_introductions/i);
  assert.match(functionBody, /pa\.min_age_interest/i);
  assert.match(functionBody, /pb\.max_age_interest/i);
  assert.match(functionBody, /from public\.blocks blocked/i);
  assert.match(functionBody, /pa\.profile_completed and pb\.profile_completed/i);
});

test('public introduction requires both consent and a complete two-seat capacity reservation', () => {
  const transition = migration.match(/create or replace function public\.rpc_transition_live_match_round[\s\S]+?\n\$\$;/i)?.[0] ?? '';
  assert.match(transition, /v_round\.state <> 'both_accepted'/i);
  assert.match(transition, /v_other_publishers \+ 2 > v_session\.maximum_publishers/i);
  assert.match(transition, /rpc_set_live_stage_participant\(v_round\.session_id,v_round\.participant_a_user_id,true\)/i);
  assert.match(transition, /rpc_set_live_stage_participant\(v_round\.session_id,v_round\.participant_b_user_id,true\)/i);
});

test('hosted matching realtime carries invalidation only, never consent payloads', () => {
  assert.match(migration, /create table public\.live_match_round_updates/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.live_match_round_updates/i);
  assert.match(repository, /table: 'live_match_round_updates'/i);
  const mainSubscription = repository.match(/subscribe\(sessionId[\s\S]+?subscribeHostedMatching/i)?.[0] ?? '';
  assert.doesNotMatch(mainSubscription, /live_match_rounds/i);
});

test('host Match Desk is a dedicated full-screen private console', () => {
  assert.match(route, /LiveHostedMatchingModal/i);
  assert.match(route, /Open private Match Desk/i);
  assert.match(modal, /presentationStyle="fullScreen"/i);
  assert.match(modal, /PRIVATE HOST CONSOLE/i);
});

test('double consent resolves into a restrained public introduction and Conversation Spark', () => {
  assert.match(route, /LivePublicIntroductionCard/i);
  assert.match(publicIntroduction, /THOUGHTFUL INTRODUCTION/i);
  assert.match(publicIntroduction, /conversationSpark\.question/i);
  assert.doesNotMatch(publicIntroduction, /myResponse/i);
});

test('match round domain rejects regressions and terminal-state resurrection', () => {
  assert.equal(canTransitionLiveMatchRound('awaiting_consent', 'both_accepted'), true);
  assert.equal(canTransitionLiveMatchRound('both_accepted', 'public_introduction'), true);
  assert.equal(canTransitionLiveMatchRound('completed', 'public_introduction'), false);
  assert.equal(canTransitionLiveMatchRound('declined', 'awaiting_consent'), false);
  assert.throws(
    () => transitionLiveMatchRound('cancelled', 'public_introduction'),
    /invalid_live_match_round_transition/,
  );
});

test('client parser keeps host pairing history but does not require raw peer consent', () => {
  const parsed = parseLiveHostedMatchingSnapshot({
    canManage: true,
    candidates: [{
      user_id: 'user-a',
      profile_id: 'profile-a',
      paired_with_user_ids: ['user-b'],
    }],
    activeRound: null,
  });
  assert.deepEqual(parsed.candidates[0].pairedWithUserIds, ['user-b']);
  assert.equal(parsed.activeRound, null);
});
