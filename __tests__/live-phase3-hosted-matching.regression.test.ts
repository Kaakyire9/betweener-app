import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canTransitionLiveMatchRound,
  transitionLiveMatchRound,
} from '../features/live/domain/live-match-round-machine.ts';
import { parseLiveHostedMatchingSnapshot } from '../features/live/application/live-parsers.ts';
import {
  canProposeLivePair,
  getLivePairAvailability,
  getLiveHostedMatchingErrorCopy,
  hasProposableLivePair,
} from '../features/live/domain/live-hosted-pairability.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260813203000_live_phase3_hosted_matching.sql', import.meta.url),
  'utf8',
);
const availabilityInvalidationMigration = readFileSync(
  new URL('../supabase/migrations/20260815060000_live_match_availability_invalidation.sql', import.meta.url),
  'utf8',
);
const pairabilityMigration = readFileSync(
  new URL('../supabase/migrations/20260815234500_live_hosted_match_pairability.sql', import.meta.url),
  'utf8',
);
const pairabilityAlignmentMigration = readFileSync(
  new URL('../supabase/migrations/20260816090000_live_pairability_discovery_alignment.sql', import.meta.url),
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
const navigation = readFileSync(
  new URL('../features/live/navigation/live-navigation.ts', import.meta.url),
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

test('hosted pair eligibility follows the existing discovery gender pool without guessing unknown identities', () => {
  const functionBody = pairabilityMigration.match(
    /create or replace function public\.live_match_pair_is_eligible[\s\S]+?\n\$\$;/i,
  )?.[0] ?? '';
  assert.match(functionBody, /pa\.gender::text not in \('MALE', 'FEMALE'\)/i);
  assert.match(functionBody, /pb\.gender::text not in \('MALE', 'FEMALE'\)/i);
  assert.match(functionBody, /pa\.gender <> pb\.gender/i);
});

test('host snapshot exposes opaque reciprocal pairability without private rejection reasons', () => {
  const functionBody = pairabilityMigration.match(
    /create or replace function public\.live_hosted_matching_snapshot[\s\S]+?\n\$\$;/i,
  )?.[0] ?? '';
  assert.match(functionBody, /'pairable_with_user_ids'/i);
  assert.match(functionBody, /live_match_pair_is_eligible/i);
  assert.doesNotMatch(functionBody, /'pairability_reason'|'rejection_reason'/i);
});

test('Live pairability only hard-gates explicitly confirmed age preferences', () => {
  assert.match(pairabilityAlignmentMigration, /pa\.age_preference_confirmed_at is null/i);
  assert.match(pairabilityAlignmentMigration, /pb\.age_preference_confirmed_at is null/i);
  assert.match(pairabilityAlignmentMigration, /pb\.age >= pa\.min_age_interest/i);
  assert.match(pairabilityAlignmentMigration, /pa\.age <= pb\.max_age_interest/i);
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

test('introduction availability invalidates every host snapshot without exposing candidate data', () => {
  assert.match(availabilityInvalidationMigration, /after insert on public\.live_participants/i);
  assert.match(availabilityInvalidationMigration, /after update of open_to_introductions on public\.live_participants/i);
  assert.match(availabilityInvalidationMigration, /execute function public\.bump_live_match_round_update\(\)/i);
  assert.doesNotMatch(availabilityInvalidationMigration, /full_name|profile_id|decision/i);
  assert.match(route, /const openLiveStudio = useCallback/i);
  assert.match(route, /hostedMatching\.refresh\(\)/i);
  assert.match(route, /onPress=\{openLiveStudio\}/i);
});

test('host Match Desk is a dedicated full-screen private console', () => {
  assert.match(route, /LiveStudioModal/i);
  assert.match(route, /Live Studio/i);
  assert.match(modal, /presentationStyle="fullScreen"/i);
  assert.match(modal, /PRIVATE HOST CONSOLE/i);
  assert.match(modal, /initialWindowMetrics/i);
  assert.match(modal, /paddingTop: topInset/i);
});

test('Live exits are deterministic and never depend on missing navigation history', () => {
  assert.match(route, /getLiveExitDestination/i);
  assert.doesNotMatch(route, /router\.back\(\)/i);
  assert.match(navigation, /LiveExitDestination = '\/live'/i);
  assert.match(navigation, /LiveExitDestination => '\/live'/i);
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
  assert.equal(parsed.candidates[0].pairableWithUserIds, null);
  assert.equal(parsed.activeRound, null);
});

test('Match Desk prevents incompatible and repeated pairs before proposal', () => {
  const candidateA = {
    userId: 'user-a',
    pairedWithUserIds: [] as string[],
    pairableWithUserIds: ['user-b'] as string[] | null,
  };
  const candidateB = {
    userId: 'user-b',
    pairedWithUserIds: [] as string[],
    pairableWithUserIds: ['user-a'] as string[] | null,
  };
  const candidateC = {
    userId: 'user-c',
    pairedWithUserIds: [] as string[],
    pairableWithUserIds: [] as string[] | null,
  };

  assert.equal(canProposeLivePair(candidateA, candidateB), true);
  assert.equal(getLivePairAvailability(candidateA, candidateB), 'available');
  assert.equal(canProposeLivePair(candidateA, candidateC), false);
  assert.equal(hasProposableLivePair([candidateA, candidateB, candidateC]), true);
  assert.equal(canProposeLivePair(
    { ...candidateA, pairedWithUserIds: ['user-b'] },
    candidateB,
  ), false);
  assert.equal(getLivePairAvailability(
    { ...candidateA, pairedWithUserIds: ['user-b'] },
    candidateB,
  ), 'already_introduced');
  assert.equal(getLivePairAvailability(candidateA, candidateC), 'not_available');
});

test('Match Desk keeps rolling deployments safe and maps pair rejection without leaking why', () => {
  const legacyA = { userId: 'user-a', pairedWithUserIds: [], pairableWithUserIds: null };
  const legacyB = { userId: 'user-b', pairedWithUserIds: [], pairableWithUserIds: null };
  assert.equal(canProposeLivePair(legacyA, legacyB), true);
  assert.equal(
    getLiveHostedMatchingErrorCopy('live_match_pair_ineligible'),
    'This pairing is not available. Choose another two members.',
  );
});
