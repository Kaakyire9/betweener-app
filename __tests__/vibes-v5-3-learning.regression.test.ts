// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

const migration = readSource('supabase/migrations/20260901120000_vibes_v5_3_freshness_outcome_learning.sql');
const requestIdHotfix = readSource('supabase/migrations/20260901123000_fix_vibes_v5_3_request_id_ambiguity.sql');
const resumableDeckMigration = readSource('supabase/migrations/20260901124500_vibes_v5_3_resumable_decks.sql');
const recommendations = readSource('hooks/useAIRecommendations.ts');
const feed = readSource('hooks/useVibesFeed.ts');
const vibesScreen = readSource('app/(tabs)/_vibes.tsx');
const telemetryQueue = readSource('lib/vibes/telemetry-queue.ts');
const rootLayout = readSource('app/_layout.tsx');
const videoModal = readSource('components/ProfileVideoModal.tsx');

test('V5.3 keeps recommendation and exposure state private behind owner-bound RPCs', () => {
  assert.match(migration, /alter table public\.vibes_v5_3_requests enable row level security/i);
  assert.match(migration, /revoke all on table public\.vibes_v5_3_recommendations from public, anon, authenticated/i);
  assert.match(migration, /viewer\.user_id = auth\.uid\(\)/i);
  assert.match(migration, /null::double precision as latitude/i);
});

test('V5.3 request upsert cannot confuse the returned id with the request table id', () => {
  assert.match(migration, /#variable_conflict use_column/i);
  assert.match(migration, /on conflict on constraint vibes_v5_3_requests_pkey do update/i);
  assert.match(requestIdHotfix, /create or replace function public\.get_vibes_recommendations_v5_3/i);
  assert.match(requestIdHotfix, /on conflict on constraint vibes_v5_3_requests_pkey do update/i);
  assert.doesNotMatch(requestIdHotfix, /on conflict \(id\) do update/i);
  assert.match(requestIdHotfix, /notify pgrst, 'reload schema'/i);
});

test('V5.3 resumes a neutral card per segment without surrendering server authority', () => {
  assert.match(resumableDeckMigration, /interval '30 minutes'/i);
  assert.match(resumableDeckMigration, /recommendation\.segment = v_segment/i);
  assert.match(resumableDeckMigration, /recommendation\.viewer_profile_id = p_user_id/i);
  assert.match(resumableDeckMigration, /recommendation\.outcome is null[\s\S]*'profile_open'[\s\S]*'intro_complete'/i);
  assert.match(resumableDeckMigration, /if greatest\(coalesce\(p_refresh_ordinal, 0\), 0\) = 0/i);
  assert.match(resumableDeckMigration, /from public\.get_vibes_recommendations_v5\(/i);
  assert.match(resumableDeckMigration, /case when interleaved\.id = v_resume_target_id then 0 else 1 end/i);
  assert.match(resumableDeckMigration, /'resumed', coalesce\(selected\.id = v_resume_target_id, false\)/i);
  assert.doesNotMatch(
    resumableDeckMigration,
    /recommendation\.outcome in \([^)]*'pass'[^)]*\)/i,
  );
});

test('V5.3 delivers unseen profiles first with graduated cooldowns and session deduplication', () => {
  assert.match(migration, /shown_in_session/i);
  assert.match(migration, /interval '14 days'/i);
  assert.match(migration, /interval '72 hours'/i);
  assert.match(migration, /interval '24 hours'/i);
  assert.match(migration, /when exposure\.last_shown_at is null then 'unseen'/i);
  assert.match(migration, /marked\.shown_in_session[\s\S]*marked\.freshness_tier/i);
});

test('exploration is controlled and interleaved instead of random deck shuffling', () => {
  assert.match(migration, /v_exploration_count := greatest\(1, ceil\(v_limit \* 0\.12\)/i);
  assert.match(migration, /lane_ranked\.lane_rank \* 7/i);
  assert.match(migration, /freshness_outcome_hybrid_3/i);
});

test('same-profile opens teach taste without directly forcing that person upward', () => {
  assert.match(migration, /Neutralise V3's exact-pair re-engagement loop/i);
  assert.match(migration, /least\(coalesce\(pair\.opens, 0\), 3\) \* 2\.8/i);
  assert.match(migration, /refresh_vibes_v5_3_contextual_taste/i);
});

test('authoritative outcomes include accepted intents, matches, and two-way conversation', () => {
  assert.match(migration, /request\.status in \('accepted', 'matched'\)/i);
  assert.match(migration, /match_row\.status::text = 'ACCEPTED'/i);
  assert.match(migration, /pair\.sent_count >= 2/i);
  assert.match(migration, /pair\.received_count >= 2/i);
  assert.match(migration, /vibes_v5_3_refresh_from_messages/i);
});

test('telemetry is durable, idempotent, and restores actual end-of-card dwell', () => {
  assert.match(telemetryQueue, /offline:vibes-telemetry:v1/);
  assert.match(telemetryQueue, /MAX_ATTEMPTS = 8/);
  assert.match(telemetryQueue, /rpc_log_vibes_event_v5_3/);
  assert.match(migration, /client_event_id uuid primary key/i);
  assert.match(migration, /Upgrade the initial card_seen row with the actual end-of-exposure dwell/i);
  assert.match(rootLayout, /VibesTelemetryQueueHydrator/);
});

test('the initial deck waits for the settled live rank instead of flashing two caches', () => {
  assert.doesNotMatch(recommendations, /Cached-first: hydrate/);
  assert.match(recommendations, /Do not paint this[\s\S]*cache before the live ranked result/i);
  assert.match(feed, /if \(!liveFetchEnabled \|\| lastError \|\| watchdogError\) return cachedMatches/);
  assert.match(feed, /A server-ranked deck must remain stable after first paint/);
  assert.match(feed, /if \(opts\.preserveOrder\) \{[\s\S]*return out;/);
  assert.match(recommendations, /get_vibes_recommendations_v5_3/);
  assert.match(recommendations, /const unitForFormat = resolvedDistanceUnitRef\.current/);
  assert.doesNotMatch(recommendations, /getStoredDistanceUnit/);
});

test('card lifecycle records exposure open, close, action outcome, and intro completion', () => {
  assert.match(vibesScreen, /enqueueVibesExposureOpen/);
  assert.match(vibesScreen, /closeActiveVibesExposure/);
  assert.match(vibesScreen, /action === 'dislike' \? 'pass'/);
  assert.match(vibesScreen, /eventType: 'intro_completed'|recordVibesEvent\(videoModalProfileId, 'intro_completed'/);
  assert.match(videoModal, /useEventListener\(player as any, 'playToEnd'/);
});

test('service-role health reporting exposes queue and repetition signals', () => {
  assert.match(migration, /rpc_get_vibes_v5_3_health/i);
  assert.match(migration, /queue_oldest_requested_at/i);
  assert.match(migration, /avg_unique_profiles_per_session_24h/i);
  assert.match(migration, /positive_action_rate_24h/i);
  assert.match(migration, /two_way_conversations_7d/i);
  assert.match(migration, /reports_24h/i);
  assert.match(migration, /same_day_repeat_rate/i);
  assert.match(migration, /revoke all on function public\.rpc_get_vibes_v5_3_health\(\) from public, anon, authenticated/i);
});
