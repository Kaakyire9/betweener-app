// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(path, 'utf8');

const broadcastMigration = readSource(
  'supabase/migrations/20260926110000_user_scoped_chat_broadcast.sql',
);
const suggestedMigration = readSource(
  'supabase/migrations/20260926112000_cache_intent_suggested_moves.sql',
);
const performanceIndexesMigration = readSource(
  'supabase/migrations/20260926111000_recommendation_intent_query_indexes.sql',
);
const capacityMigration = readSource(
  'supabase/migrations/20260926113000_database_capacity_monitoring.sql',
);
const broadcastClient = readSource('lib/realtime/user-chat-broadcast.ts');
const threadRealtime = readSource('lib/chat/sync/chat-realtime-service.ts');
const chatListRealtime = readSource('lib/chat/hooks/use-chat-list-sync.ts');
const inAppToasts = readSource('components/InAppToasts.tsx');

test('chat Broadcast authorization is private and scoped to the authenticated user', () => {
  assert.match(broadcastMigration, /on realtime\.messages[\s\S]*for select[\s\S]*to authenticated/i);
  assert.match(broadcastMigration, /realtime\.messages\.extension = 'broadcast'/i);
  assert.match(
    broadcastMigration,
    /realtime\.topic\(\) = 'user:' \|\| \(select auth\.uid\(\)\)::text \|\| ':chat'/i,
  );
  assert.match(broadcastClient, /config: \{ private: true \}/);
});

test('messages and system messages fan out through one shared user channel', () => {
  assert.match(broadcastMigration, /after insert or update or delete on public\.messages/i);
  assert.match(broadcastMigration, /after insert or update or delete on public\.system_messages/i);
  assert.match(broadcastMigration, /select distinct candidate\.user_id/i);
  assert.match(broadcastClient, /const entries = new Map<string, Entry>\(\)/);
  assert.match(threadRealtime, /subscribeUserChatBroadcast/);
  assert.match(chatListRealtime, /subscribeUserChatBroadcast/);
  assert.match(inAppToasts, /subscribeUserChatBroadcast/);
  assert.doesNotMatch(threadRealtime, /messages:thread:inbox/);
  assert.doesNotMatch(threadRealtime, /messages:thread:sent/);
  assert.doesNotMatch(inAppToasts, /inapp_system_messages/);
});

test('the suggested-moves scorer is only executed while seeding a daily batch', () => {
  const scorerCalls = suggestedMigration.match(/public\.rpc_get_suggested_moves\(/gi) ?? [];
  assert.equal(scorerCalls.length, 1);
  assert.match(suggestedMigration, /'candidate', to_jsonb\(ranked\)/i);
  assert.match(suggestedMigration, /batch\.metadata \? 'candidate'/i);
});

test('high-call recommendation and Intent reads have purpose-built online indexes', () => {
  assert.match(performanceIndexesMigration, /create index concurrently/i);
  assert.match(performanceIndexesMigration, /vibes_events_viewer_learning_window_idx/i);
  assert.match(performanceIndexesMigration, /vibes_v5_3_recommendations_resume_idx/i);
  assert.match(performanceIndexesMigration, /intent_requests_actor_created_idx/i);
  assert.match(performanceIndexesMigration, /intent_requests_recipient_created_idx/i);
  assert.doesNotMatch(performanceIndexesMigration, /\bbegin;/i);
});

test('capacity monitoring records bounded samples and transitions at 70, 80, and 90 percent', () => {
  assert.match(capacityMigration, /when v_percent >= 90 then 'critical'/i);
  assert.match(capacityMigration, /when v_percent >= 80 then 'high'/i);
  assert.match(capacityMigration, /when v_percent >= 70 then 'warning'/i);
  assert.match(capacityMigration, /if v_level is distinct from v_previous_level/i);
  assert.match(capacityMigration, /interval '30 days'/i);
  assert.match(capacityMigration, /interval '180 days'/i);
  assert.match(capacityMigration, /'database-capacity-monitor-v1', '\* \* \* \* \*'/i);
});

test('all database hardening migrations remain independently atomic', () => {
  [broadcastMigration, suggestedMigration, capacityMigration].forEach((source) => {
    assert.match(source, /\bbegin;/i);
    assert.match(source, /\bcommit;/i);
  });
});
