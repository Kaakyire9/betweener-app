import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isActiveLiveParticipantState,
  isFreshLiveParticipantArrival,
  liveParticipantArrivalKey,
} from '../features/live/application/live-participant-arrivals.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260813173000_live_capacity_presence_and_room_pulse.sql', import.meta.url),
  'utf8',
);
const ioHardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260820153000_live_io_and_realtime_hardening.sql', import.meta.url),
  'utf8',
);
const participantArrivalMigration = readFileSync(
  new URL('../supabase/migrations/20260824183000_live_participant_arrival_realtime.sql', import.meta.url),
  'utf8',
);
const participantArrivalStateMigration = readFileSync(
  new URL('../supabase/migrations/20260824210000_live_arrival_notice_state_confirmation.sql', import.meta.url),
  'utf8',
);
const tokenFunction = readFileSync(
  new URL('../supabase/functions/live-rtc-token/index.ts', import.meta.url),
  'utf8',
);
const controller = readFileSync(
  new URL('../features/live/hooks/use-live-session-controller.ts', import.meta.url),
  'utf8',
);
const conversation = readFileSync(
  new URL('../features/live/components/LiveConversationPanel.tsx', import.meta.url),
  'utf8',
);
const liveScreen = readFileSync(
  new URL('../app/live/[sessionId].tsx', import.meta.url),
  'utf8',
);

test('Live rooms enforce the 100-member product limit at database and provider boundaries', () => {
  assert.match(migration, /maximum_participants between minimum_participants and 100/i);
  assert.match(migration, /from public\.live_sessions[\s\S]+for update/i);
  assert.match(migration, /if v_other_occupants >= v_session\.maximum_participants/i);
  assert.match(migration, /live_room_capacity_reached/i);
  assert.match(tokenFunction, /admission\.maximum_participants > 100/);
  assert.match(tokenFunction, /settings_override:[\s\S]+max_participants: admission\.maximum_participants/i);
});

test('Presence heartbeat preserves short reconnects and releases abandoned room reservations', () => {
  assert.match(ioHardeningMigration, /create unlogged table if not exists public\.live_presence_leases/i);
  assert.match(ioHardeningMigration, /expires_at[^\n]+interval '90 seconds'/i);
  assert.match(ioHardeningMigration, /Normal[\s\S]+heartbeats never update the Realtime-published participant row/i);
  assert.match(ioHardeningMigration, /interval '2 minutes'/i);
  assert.match(ioHardeningMigration, /participant_presence_expired/i);
  assert.match(ioHardeningMigration, /'live-maintenance','\* \* \* \* \*'/i);
  assert.match(controller, /setInterval\(beat, LIVE_HEARTBEAT_INTERVAL_MS\)/);
  assert.match(controller, /AppState\.currentState === 'active'/);
});

test('Realtime invalidations are coalesced and polling is health-aware', () => {
  assert.match(ioHardeningMigration, /rpc_get_live_room_pulse/i);
  assert.match(ioHardeningMigration, /alter publication supabase_realtime drop table public\.live_reactions/i);
  assert.match(controller, /event === 'pulse' \? schedulePulseRefresh\(\) : scheduleStructuralRefresh\(\)/);
  assert.match(controller, /shouldRefreshLiveSnapshot/);
  assert.doesNotMatch(controller, /setInterval\([^)]*20_000/);
});

test('Room Pulse arrivals use a bounded scoped projection that survives participant rejoins', () => {
  assert.match(participantArrivalMigration, /create table if not exists public\.live_participant_arrival_updates/i);
  assert.match(participantArrivalMigration, /primary key \(session_id, profile_id\)/i);
  assert.match(participantArrivalMigration, /force row level security/i);
  assert.match(participantArrivalMigration, /public\.can_view_live_session\(session_id, auth\.uid\(\)\)/i);
  assert.match(participantArrivalMigration, /old\.state in \('audience', 'stage_requested', 'backstage', 'on_stage'\)/i);
  assert.match(participantArrivalMigration, /version = current_update\.version \+ 1/i);
  assert.match(participantArrivalMigration, /add table public\.live_participant_arrival_updates/i);
  assert.doesNotMatch(participantArrivalMigration, /insert into public\.live_participant_arrival_updates[^;]+\)\s*select/i);
});

test('Room Pulse suppresses stale arrivals and permits a later rejoin version', () => {
  const now = Date.parse('2026-08-24T20:00:00.000Z');
  const fresh = {
    profileId: '11111111-1111-4111-8111-111111111111',
    version: 4,
    arrivedAt: new Date(now - 1_000).toISOString(),
  };

  assert.equal(isFreshLiveParticipantArrival(fresh, now), true);
  assert.equal(isFreshLiveParticipantArrival({
    ...fresh,
    arrivedAt: new Date(now - 16_000).toISOString(),
  }, now), false);
  assert.notEqual(
    liveParticipantArrivalKey(fresh),
    liveParticipantArrivalKey({ ...fresh, version: fresh.version + 1 }),
  );
  assert.equal(isActiveLiveParticipantState('audience'), true);
  assert.equal(isActiveLiveParticipantState('on_stage'), true);
  assert.equal(isActiveLiveParticipantState('left'), false);
  assert.equal(isActiveLiveParticipantState('removed'), false);
});

test('Room Pulse member summaries confirm current participant state before presentation', () => {
  assert.match(participantArrivalStateMigration, /'participantState',\s*v_participant\.state/i);
  assert.match(controller, /isFreshLiveParticipantArrival\(event\)/);
  assert.match(controller, /liveParticipantArrivalKey\(event\)/);
  assert.match(controller, /isActiveLiveParticipantState\(member\.participantState\)/);
  assert.doesNotMatch(controller, /arrivalEventsSeenRef\.current\.add\(event\.profileId\)/);
});

test('Public media admission waits for the authoritative participant join', () => {
  assert.match(liveScreen, /const \[participantAdmissionReady, setParticipantAdmissionReady\]/);
  assert.match(liveScreen, /void joinSession\(\)\.then\(\(joined\)/);
  assert.match(liveScreen, /if \(joined\) \{[\s\S]*setParticipantAdmissionReady\(true\)/);
  assert.match(liveScreen, /!participantAdmissionReady \|\| mediaState !== 'idle'/);
});

test('Room Pulse is paginated, idempotent, retryable and moderation-aware', () => {
  assert.match(migration, /rpc_list_live_comments/i);
  assert.match(migration, /limit greatest\(1,least\(coalesce\(p_limit,40\),80\)\)/i);
  assert.match(migration, /commentCount/i);
  assert.match(controller, /clientCommentId = Crypto\.randomUUID\(\)/);
  assert.match(controller, /commentInFlightRef/);
  assert.match(conversation, /Not sent · Retry/);
  assert.match(conversation, /Load earlier notes/);
  assert.match(conversation, /Remove comment/);
  assert.match(conversation, /Report comment/);
  assert.match(conversation, /shouldFollowRef/);
});

test('Room Pulse keeps its composer visible and renders human copy while the keyboard is open', () => {
  assert.match(conversation, /placeholder="Add something thoughtful…"/);
  assert.doesNotMatch(conversation, /placeholder="[^"]*\\u2026/);
  assert.match(conversation, /onFocus=\{revealLatestComment\}/);
  assert.match(conversation, /accessibilityLabel="Dismiss keyboard"/);
  assert.match(conversation, /onScrollBeginDrag=\{Keyboard\.dismiss\}/);
  assert.match(liveScreen, /KeyboardAvoidingView/);
  assert.match(liveScreen, /Platform\.OS === 'ios' \? 'padding' : 'height'/);
  assert.match(liveScreen, /keyboardVisible && styles\.conversationGlassKeyboard/);
  assert.match(
    liveScreen,
    /!keyboardVisible && \(canManageStudio \|\| canPublish[\s\S]*<LiveControlDock style=\{styles\.controls\}>/,
  );
});
