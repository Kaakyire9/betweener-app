import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseLivePoolCandidatePreview, parseLiveQuorumPoolingSnapshot } from '../features/live/application/live-parsers.ts';
import { liveQuorumCopy, liveQuorumProgress } from '../features/live/domain/live-quorum-pooling.ts';

const migration = readFileSync('supabase/migrations/20260829220000_live_phase8_quorum_session_pooling.sql', 'utf8');
const repository = readFileSync('features/live/application/live-repository.ts', 'utf8');
const component = readFileSync('features/live/components/LiveQuorumPoolingCard.tsx', 'utf8');
const eventScreen = readFileSync('app/live/event/[sessionId].tsx', 'utf8');

test('quorum is server authoritative and can account for viable pairs', () => {
  assert.match(migration, /create or replace function public\.live_quorum_snapshot_internal/i);
  assert.match(migration, /public\.live_match_pair_is_eligible\(p_session_id,v_user,candidate\)/i);
  assert.match(migration, /rpc_configure_live_quorum/i);
  assert.match(migration, /status='waiting_for_quorum'/i);
  assert.match(migration, /status='confirmed',quorum_reached_at=coalesce/i);
  assert.match(migration, /after insert or delete or update of rsvp_status,open_to_introductions,state/i);
});

test('quorum presentation uses warm truthful language', () => {
  const quorum = {
    sessionId: 'session', status: 'almost_ready' as const, attendanceCount: 3,
    minimumAttendance: 5, introductionReadyCount: 2, viablePairCount: 1,
    requiredPairCount: 2, pairabilityRequired: true, currentlyViable: false, reached: false,
    serverNow: '2026-08-29T22:00:00.000Z',
  };
  assert.equal(liveQuorumProgress(quorum), 0.6);
  assert.match(liveQuorumCopy(quorum), /2 more people/);
  assert.doesNotMatch(component, /critical mass/i);
  assert.match(component, /ALMOST READY/);
  assert.match(component, /TONIGHT IS CONFIRMED/);
});

test('event summary and quorum card share one authoritative attendance count', () => {
  const consistencyMigration = readFileSync(
    'supabase/migrations/20260830100000_fix_live_quorum_reservation_consistency.sql',
    'utf8',
  );
  assert.match(eventScreen, /quorumPooling\.snapshot\?\.quorum\.attendanceCount \?\? session\?\.reservationCount/);
  assert.match(eventScreen, /phase === 'past' \? session\.totalAttendeeCount : reservationCount/);
  assert.match(consistencyMigration, /'currently_viable',v_currently_viable/i);
  assert.match(consistencyMigration, /v_confirmed:=v_currently_viable or v_session\.status/i);

  assert.match(liveQuorumCopy({
    sessionId: 'session', status: 'confirmed', attendanceCount: 0,
    minimumAttendance: 2, introductionReadyCount: 0, viablePairCount: 0,
    requiredPairCount: 0, pairabilityRequired: false, currentlyViable: false,
    reached: true, serverNow: '2026-08-30T04:40:00.000Z',
  }), /Attendance has changed/);
});

test('cross-session pooling is isolated from the Quick Connect participant pool', () => {
  assert.match(migration, /create table public\.live_session_pools/i);
  assert.match(migration, /create table public\.live_session_pool_offers/i);
  assert.match(migration, /quick_connect_is_separate/i);
  assert.doesNotMatch(migration, /live_quick_connect_participants|live_quick_connect_pairings/i);
});

test('pool compatibility enforces consent, preferences, verification, geography, blocks and time', () => {
  assert.match(migration, /allow_pooled_live_sessions boolean not null default true/i);
  assert.match(migration, /maximum_start_delta_minutes/i);
  assert.match(migration, /minimum_verification_level/i);
  assert.match(migration, /p_geography_mode='same_country'/i);
  assert.match(migration, /from public\.blocks blocked/i);
  assert.match(migration, /age_preference_confirmed_at/i);
  assert.match(migration, /unsafe_block_relationship/i);
  assert.match(migration, /no_viable_cross_session_pair/i);
});

test('pool offers are explicit and preserve the participant origin', () => {
  assert.match(migration, /rpc_respond_live_pool_offer/i);
  assert.match(migration, /v_source_participant\.origin_context_type/i);
  assert.match(migration, /v_source_participant\.origin_context_id/i);
  assert.match(component, /Your original event context stays attached/i);
  assert.match(component, /Keep my original event/i);
  assert.match(eventScreen, /LiveQuorumPoolingCard/);
});

test('pool audit and realtime expose safe invalidations instead of private decisions', () => {
  assert.match(migration, /create table public\.live_pool_decision_audit/i);
  assert.match(migration, /live_pool_decision_audit_admin_select/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.live_quorum_updates/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.live_pool_offer_updates/i);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.live_pool_decision_audit/i);
  assert.match(repository, /subscribeQuorumPooling/);
});

test('Phase 8 projections parse without leaking exclusion details to ordinary attendees', () => {
  const snapshot = parseLiveQuorumPoolingSnapshot({
    quorum: {
      session_id: 'session', status: 'confirmed', attendance_count: 4,
      minimum_attendance: 4, introduction_ready_count: 4, viable_pair_count: 2,
      required_pair_count: 1, pairability_required: true, reached: true,
      currently_viable: true,
      server_now: '2026-08-29T22:00:00.000Z',
    },
    allow_pooled_live_sessions: true,
    offer: null,
    pool: null,
    can_manage_pooling: false,
    server_now: '2026-08-29T22:00:00.000Z',
  });
  assert.equal(snapshot.quorum.status, 'confirmed');
  assert.equal(snapshot.quorum.viablePairCount, 2);
  assert.equal(snapshot.canManagePooling, false);

  const preview = parseLivePoolCandidatePreview({
    rule: { id: 'rule', name: 'Safe rule', explanation: 'Aligned events.' },
    candidates: [{ session_id: 'candidate', title: 'Another Live', format: 'circle_live', context_type: 'circle', scheduled_start: null, eligible: false, reason_codes: ['unsafe_block_relationship'], reason_texts: ['A private safety boundary prevents this combination.'] }],
  });
  assert.equal(preview.candidates[0]?.eligible, false);
  assert.match(preview.candidates[0]?.reasonTexts[0] ?? '', /private safety boundary/i);
});
