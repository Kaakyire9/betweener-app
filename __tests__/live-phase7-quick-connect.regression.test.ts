import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LiveQuickConnectSnapshot } from '../features/live/application/live-models.ts';
import {
  formatQuickConnectTime,
  normalizeQuickConnectErrorCode,
  quickConnectAvailabilityCopy,
  quickConnectIsWaitingForHost,
  quickConnectOutcomeCopy,
  quickConnectQueueCopy,
  quickConnectQueueNeedsRejoin,
  quickConnectRemainingSeconds,
} from '../features/live/domain/live-quick-connect.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260825130000_live_phase7_quick_connect.sql', import.meta.url),
  'utf8',
);
const admissionHardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260827110000_harden_live_quick_connect_admission.sql', import.meta.url),
  'utf8',
);
const queueHardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260827123000_harden_live_quick_connect_queue_progress.sql', import.meta.url),
  'utf8',
);
const edgeFunction = readFileSync(
  new URL('../supabase/functions/live-quick-connect-token/index.ts', import.meta.url),
  'utf8',
);
const controller = readFileSync(
  new URL('../features/live/hooks/use-live-quick-connect.ts', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/live/quick-connect/[sessionId].tsx', import.meta.url),
  'utf8',
);

const pairedSnapshot: LiveQuickConnectSnapshot = {
  sessionId: 'session-1',
  state: 'paired',
  connectionState: 'connected',
  serverNow: '2026-08-25T12:00:00.000Z',
  queueStatus: 'paired',
  waitingCount: 0,
  eligiblePeerCount: 0,
  pairing: {
    id: 'pair-1',
    chemistryFirstEnabled: true,
    state: 'active',
    startsAt: '2026-08-25T12:00:00.000Z',
    endsAt: '2026-08-25T12:03:00.000Z',
    reconnectDeadline: null,
    myDecision: null,
    sharedOutcome: null,
    safetyReviewed: false,
    otherPerson: {
      userId: 'user-2',
      profileId: 'profile-2',
      fullName: 'Kojo',
      avatarUrl: null,
      age: 31,
      city: 'Kumasi',
      lookingFor: 'A meaningful relationship',
      values: ['Family'],
    },
    providerCallType: 'betweener_live',
    providerCallId: 'quick_pair_1',
    odoConversationSpark: null,
  },
};

test('Quick Connect timer is derived from authoritative server time', () => {
  assert.equal(quickConnectRemainingSeconds(pairedSnapshot), 180);
  assert.equal(quickConnectRemainingSeconds(pairedSnapshot, 1_500), 179);
  assert.equal(quickConnectRemainingSeconds(pairedSnapshot, 181_000), 0);
  assert.equal(formatQuickConnectTime(180), '3:00');
  assert.equal(formatQuickConnectTime(9), '0:09');
});

test('Quick Connect reveals only shared outcomes after both private decisions', () => {
  assert.equal(
    quickConnectOutcomeCopy('mutual_continue'),
    'You both chose to keep the conversation going.',
  );
  assert.equal(quickConnectOutcomeCopy('friendship'), 'You both chose friendship.');
  assert.equal(quickConnectOutcomeCopy(null), 'This round has closed with care.');
  assert.match(migration, /primary key\(pairing_id,user_id\)/i);
  assert.match(migration, /live_quick_decision_already_submitted/i);
  assert.match(migration, /if v_count=2/i);
  assert.match(migration, /'my_decision',v_my_decision,'shared_outcome',v_pairing\.shared_outcome/i);
  assert.doesNotMatch(migration, /'other_decision'/i);
});

test('Pairing is serialized, eligibility-aware and repeat-safe', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('quick:'\|\|p_session_id::text,0\)\)/i);
  assert.match(migration, /live_quick_unordered_pair_once_idx/i);
  assert.match(migration, /age_preference_confirmed_at/i);
  assert.match(migration, /from public\.blocks blocked/i);
  assert.match(migration, /from public\.live_private_sparks s/i);
  assert.match(migration, /state in \('waiting','disconnected'\)/i);
  assert.match(migration, /select \* into v_a[\s\S]+exit when v_a\.user_id is null/i);
  assert.match(migration, /select \* into v_b[\s\S]+exit when v_b\.user_id is null/i);
  assert.match(
    migration,
    /update public\.live_quick_connect_participants set state='paired',current_pairing_id=v_pairing_id[\s\S]+user_id in\(v_a\.user_id,v_b\.user_id\)/i,
  );
});

test('Transport loss gets reconnect grace and never becomes a romantic decision', () => {
  assert.match(migration, /count\(\*\)=2 and bool_and\(p\.connection_state='connected'\)/i);
  assert.match(migration, /v_now\+interval '30 seconds'/i);
  assert.match(migration, /'round_incomplete'.+'reconnect_grace_expired'/is);
  assert.doesNotMatch(migration, /disconnected[\s\S]{0,160}(continue|friendship|not_this_time)/i);
  assert.match(controller, /mediaConnectedRef/);
  assert.match(controller, /beginMediaPairing/);
  assert.match(controller, /reportMediaConnected/);
  assert.match(controller, /AppState\.currentState === 'active'/);
});

test('Quick Connect RTC admission is exact, bounded and non-recording', () => {
  assert.match(migration, /array\['live\.join','live\.publish','live\.report','live\.block'\]::text\[],2/i);
  assert.match(edgeFunction, /maximum_participants !== 2/);
  assert.match(edgeFunction, /participant_user_ids\?\.length !== 2/);
  assert.match(edgeFunction, /recording_allowed: false/);
  assert.match(edgeFunction, /max_participants: 2/);
  assert.match(edgeFunction, /rpc_bump_live_rtc_token_rate_limit/);
  assert.match(route, /LiveQuickConnectControlDock/);
  assert.match(route, /useScopedScreenAwake/);
  assert.match(route, /onPictureInPictureModeChange={setPictureInPictureActive}/);
  assert.match(route, /constrainMultiStage={false}/);
  assert.match(route, /pictureInPictureStage/);
  assert.match(route, /pictureInPictureHidden/);
  assert.doesNotMatch(route, /if \(pictureInPictureActive\) \{\s*return/);
});

test('Quick Connect realtime exposes invalidations rather than private rows', () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.live_quick_connect_updates/i);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.live_quick_connect_decisions/i);
  assert.match(migration, /revoke all on function public\.live_quick_connect_sync\(uuid\)/i);
  assert.match(migration, /revoke all on function public\.bump_live_quick_connect_update\(\)/i);
});

test('Quick Connect direct entry establishes normal Live admission safely', () => {
  assert.match(admissionHardeningMigration, /public\.can_view_live_session\(p_session_id, v_user_id\)/i);
  assert.match(admissionHardeningMigration, /v_profile := public\.live_active_profile\(v_user_id\)/i);
  assert.match(admissionHardeningMigration, /v_participant\.state in \('removed', 'banned'\)/i);
  assert.match(admissionHardeningMigration, /perform public\.rpc_join_live_session\(p_session_id\)/i);
  assert.match(admissionHardeningMigration, /perform public\.rpc_heartbeat_live_session\(p_session_id\)/i);
  assert.match(admissionHardeningMigration, /on conflict\(session_id, user_id\) do update/i);
  assert.doesNotMatch(admissionHardeningMigration, /update public\.profiles/i);
});

test('Quick Connect failures are sanitized and actionable', () => {
  assert.equal(
    normalizeQuickConnectErrorCode(new Error('live_quick_connect_not_started')),
    'live_quick_connect_not_started',
  );
  assert.equal(
    normalizeQuickConnectErrorCode(new Error('sensitive database detail')),
    'live_quick_connect_unavailable',
  );
  assert.equal(
    quickConnectAvailabilityCopy('live_room_capacity_reached'),
    'This Live room is full. Try the next hosted round.',
  );
  assert.equal(
    quickConnectAvailabilityCopy('live_quick_connect_not_open'),
    'The host is preparing the next Quick Connect rotation.',
  );
  assert.equal(quickConnectIsWaitingForHost('live_quick_connect_not_open'), true);
  assert.equal(quickConnectIsWaitingForHost('live_quick_connect_unavailable'), false);
  assert.match(controller, /const retryJoin = useCallback/);
  assert.match(route, /waitingForHost[\s\S]*?'Check rotation'/i);
});

test('disconnected queue presence is recovered without treating RTC grace as queue loss', () => {
  assert.equal(quickConnectQueueNeedsRejoin(null), true);
  assert.equal(quickConnectQueueNeedsRejoin({
    ...pairedSnapshot,
    state: 'waiting',
    connectionState: 'disconnected',
    pairing: null,
  }), true);
  assert.equal(quickConnectQueueNeedsRejoin({
    ...pairedSnapshot,
    connectionState: 'disconnected',
  }), false);
  assert.equal(quickConnectQueueNeedsRejoin(pairedSnapshot), false);
  assert.match(controller, /quickConnectQueueNeedsRejoin\(snapshotRef\.current\)/);
  assert.match(controller, /live_quick_connect_participant_required/);
  assert.match(route, /queueNeedsRejoin[\s\S]*?controller\.retryJoin\(\)/);
  assert.match(route, /'Check rotation'/);
});

test('Quick Connect queue progress is truthful without exposing private eligibility reasons', () => {
  assert.match(queueHardeningMigration, /spark\.active_expires_at > timezone\('utc', now\(\)\)/i);
  assert.match(queueHardeningMigration, /'queue_status', v_queue_status/i);
  assert.match(queueHardeningMigration, /'waiting_count', v_waiting_count/i);
  assert.match(queueHardeningMigration, /'eligible_peer_count', v_eligible_peer_count/i);
  assert.match(queueHardeningMigration, /'current_private_conversation'/i);
  assert.match(queueHardeningMigration, /'rotation_complete'/i);
  assert.doesNotMatch(queueHardeningMigration, /'rejection_reason'/i);

  assert.deepEqual(
    quickConnectQueueCopy({
      ...pairedSnapshot,
      state: 'waiting',
      pairing: null,
      queueStatus: 'waiting_for_partner',
      waitingCount: 1,
    }),
    {
      title: 'Your place is held.',
      body: 'You are first in line. We will begin when another available person joins.',
    },
  );
  assert.match(
    quickConnectQueueCopy({
      ...pairedSnapshot,
      state: 'waiting',
      pairing: null,
      queueStatus: 'waiting_for_eligible_partner',
      waitingCount: 3,
    }).body,
    /Preferences and safety rules stay private/,
  );
  assert.match(
    quickConnectQueueCopy({
      ...pairedSnapshot,
      state: 'waiting',
      pairing: null,
      queueStatus: 'current_private_conversation',
    }).title,
    /current Spark/i,
  );
  assert.deepEqual(
    quickConnectQueueCopy(null, 'live_quick_connect_not_open'),
    {
      title: 'The next rotation is being prepared.',
      body: 'Stay in the Live. You will enter automatically when the host opens Quick Connect.',
    },
  );
});

test('host-gated guests wait without polling and auto-enter after realtime opens', () => {
  assert.match(controller, /quickConnectIsWaitingForHost\(errorRef\.current\)/i);
  assert.match(
    controller,
    /if \(quickConnectIsWaitingForHost\(errorRef\.current\)\) return;/i,
  );
  assert.match(
    controller,
    /quickConnectIsWaitingForHost\(errorRef\.current\)[\s\S]*?void retryJoin\(\)/i,
  );
  assert.match(
    route,
    /controller\.error && !waitingForHost[\s\S]*?quickConnectAvailabilityCopy/i,
  );
});
