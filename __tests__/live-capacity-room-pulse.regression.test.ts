import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260813173000_live_capacity_presence_and_room_pulse.sql', import.meta.url),
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
  assert.match(migration, /rpc_heartbeat_live_session/i);
  assert.match(migration, /last_seen_at=timezone\('utc',now\(\)\)/i);
  assert.match(migration, /interval '45 seconds'/i);
  assert.match(migration, /interval '2 minutes'/i);
  assert.match(migration, /participant_presence_expired/i);
  assert.match(migration, /live-presence-cleanup/i);
  assert.match(controller, /setInterval\(beat, 15_000\)/);
  assert.match(controller, /AppState\.currentState === 'active'/);
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
  assert.match(liveScreen, /keyboardVisible && styles\.stageKeyboard/);
  assert.match(liveScreen, /!keyboardVisible \? <View style=\{styles\.controls\}>/);
});
