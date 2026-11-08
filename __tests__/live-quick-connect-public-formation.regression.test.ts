import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseLiveQuickConnectPoolSnapshot } from '../features/live/application/live-parsers.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260914090000_live_quick_connect_public_formations.sql');
const health = read('../supabase/verification/live_quick_connect_public_formations_health.sql');
const pool = read('../features/live/components/LiveQuickConnectPool.tsx');
const constellation = read('../features/live/components/LiveQuickConnectConstellation.tsx');
const celebration = read('../features/live/components/LivePairFormationCelebration.tsx');
const liveRoute = read('../app/live/[sessionId].tsx');

test('successful Quick Connect pairings receive serialized public ceremony slots', () => {
  assert.match(migration, /public_formation_starts_at timestamptz/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /v_latest_start \+ interval '3\.9 seconds'/i);
  assert.match(migration, /before insert on public\.live_quick_connect_pairings/i);
  assert.match(migration, /'public_formations', v_public_formations/i);
  assert.match(migration, /order by pairing\.public_formation_starts_at, pairing\.id/i);
});

test('the public projection contains successful identities without private matching decisions', () => {
  const pairingIdentity = migration.indexOf("'pairing_id', pairing.id");
  const projectionStart = migration.lastIndexOf('select coalesce', pairingIdentity);
  const projectionEnd = migration.indexOf("return jsonb_build_object(", projectionStart);
  const projection = migration.slice(projectionStart, projectionEnd);

  assert.ok(pairingIdentity >= 0);
  assert.ok(projectionStart >= 0);
  assert.match(projection, /participant_a[\s\S]*full_name[\s\S]*avatar_url/i);
  assert.match(projection, /participant_b[\s\S]*full_name[\s\S]*avatar_url/i);
  assert.doesNotMatch(projection, /interest|decision|connection_intent|shared_outcome/i);
  assert.match(health, /anonymous_execute_denied[\s\S]*as healthy/i);
});

test('pool snapshots parse the server-timed formation queue', () => {
  const snapshot = parseLiveQuickConnectPoolSnapshot({
    session_id: 'session',
    stage_layout: 'stacked',
    control_state: 'open',
    creator_mode: 'facilitator',
    server_now: '2026-09-14T09:00:00.000Z',
    is_host: false,
    is_opted_in: true,
    can_opt_in: true,
    my_state: 'waiting',
    members: [],
    public_formations: [{
      pairing_id: 'pairing',
      starts_at: '2026-09-14T09:00:03.900Z',
      participant_a: {
        user_id: 'a', profile_id: 'profile-a', full_name: 'Ama Mensah', avatar_url: 'a.jpg',
      },
      participant_b: {
        user_id: 'b', profile_id: 'profile-b', full_name: 'Kojo Owusu', avatar_url: 'b.jpg',
      },
    }],
    queue: null,
  });

  assert.equal(snapshot.publicFormations.length, 1);
  assert.equal(snapshot.publicFormations[0]?.pairingId, 'pairing');
  assert.equal(snapshot.publicFormations[0]?.participantA.fullName, 'Ama Mensah');
  assert.equal(snapshot.publicFormations[0]?.participantA.profileId, 'profile-a');
  assert.equal(snapshot.publicFormations[0]?.participantB.userId, 'b');
});

test('every pool client presents the same formation while haptics stay personal', () => {
  assert.match(pool, /activePublicFormation/i);
  assert.match(pool, /publicPairingPeople/i);
  assert.match(pool, /pairingHaptic = currentUserId != null && pairingUserIds\.includes\(currentUserId\)/i);
  assert.match(pool, /found a Private Spark/i);
  assert.match(constellation, /eyebrow="ODO · PRIVATE SPARK"/i);
  assert.match(constellation, /pairingInitialProgress/i);
  assert.match(celebration, /initialProgress/i);
  assert.match(celebration, /compact \? 2 : 1/i);
});

test('matched clients wait for their assigned public ceremony before private handoff', () => {
  assert.match(liveRoute, /quickConnectPairingFormationStartsAt/i);
  assert.match(liveRoute, /formationWaitMs/i);
  assert.match(liveRoute, /formationWaitMs \+ LIVE_PRIVATE_SPARK_MOTION\.handoffHoldMs/i);
  assert.match(liveRoute, /then\(\(\) => media\.leave/i);
});
