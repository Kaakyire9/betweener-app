import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LIVE_FULL_SNAPSHOT_STALE_MS,
  shouldRefreshLiveSnapshot,
} from '../features/live/application/live-refresh-policy.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20260820153000_live_io_and_realtime_hardening.sql', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../features/live/application/live-repository.ts', import.meta.url),
  'utf8',
);
const circleDetail = readFileSync(
  new URL('../app/circles/[id].tsx', import.meta.url),
  'utf8',
);

test('Live presence leases are private, indexed, disposable and independent of Realtime', () => {
  assert.match(migration, /create unlogged table if not exists public\.live_presence_leases/i);
  assert.match(migration, /primary key \(session_id, user_id\)/i);
  assert.match(migration, /live_presence_leases_expiry_idx/i);
  assert.match(migration, /revoke all on table public\.live_presence_leases from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.live_presence_leases/i);
  assert.match(migration, /fillfactor=80/i);
  assert.match(migration, /current_lease\.heartbeat_at <= excluded\.heartbeat_at-interval '20 seconds'/i);
  assert.match(migration, /pg_postmaster_start_time\(\)[\s\S]+interval '2 minutes'/i);
  assert.match(migration, /'status','restart_grace'/i);
});

test('Live maintenance is serialized, failure-isolated and consolidated into one cron job', () => {
  assert.match(migration, /pg_try_advisory_xact_lock/i);
  assert.match(migration, /live_maintenance_failures/i);
  assert.match(migration, /exception when others/i);
  assert.match(migration, /where jobname in \([\s\S]+live-presence-cleanup[\s\S]+live-private-spark-cleanup/i);
  assert.match(migration, /'live-maintenance','\* \* \* \* \*'/i);
});

test('Healthy Realtime avoids fallback reads until the bounded consistency window expires', () => {
  const now = 10_000_000;
  assert.equal(shouldRefreshLiveSnapshot({
    realtimeHealthy: true,
    lastFullRefreshAt: now - LIVE_FULL_SNAPSHOT_STALE_MS + 1,
    now,
  }), false);
  assert.equal(shouldRefreshLiveSnapshot({
    realtimeHealthy: true,
    lastFullRefreshAt: now - LIVE_FULL_SNAPSHOT_STALE_MS,
    now,
  }), true);
  assert.equal(shouldRefreshLiveSnapshot({
    realtimeHealthy: false,
    lastFullRefreshAt: now,
    now,
  }), true);
});

test('Repository subscribes only to client-consumed invalidations', () => {
  assert.match(repository, /table: 'live_participants'/);
  assert.match(repository, /table: 'live_seat_requests'/);
  assert.match(repository, /table: 'live_session_structure_updates'/);
  assert.match(repository, /table: 'live_comments'/);
  assert.doesNotMatch(repository, /table: 'live_reactions'/);
  assert.doesNotMatch(repository, /table: 'live_sessions'/);
});

test('Live structure reconciles immediately after Realtime attaches or reconnects', () => {
  const subscription = repository.match(
    /subscribe\(\s*sessionId[\s\S]+?subscribeHostedMatching/i,
  )?.[0] ?? '';
  assert.match(subscription, /liveStatus === 'SUBSCRIBED'\) onEvent\('structure'\)/i);
});

test('Room pulse reads use a visible-comment feed index', () => {
  assert.match(migration, /live_comments_visible_session_feed_idx/i);
  assert.match(migration, /where status='visible'/i);
});

test('Circle member presence uses one bounded batch read instead of per-member Realtime subscriptions', () => {
  assert.match(circleDetail, /fetchUsersPresence\(circlePresenceUserIds\)/);
  assert.match(circleDetail, /setInterval\(\(\) => void refreshPresence\(\), 60_000\)/);
  assert.doesNotMatch(circleDetail, /circlePresenceUserIds\.forEach\([\s\S]{0,500}table: 'user_presence'/);
});

test('Circle moments use one bounded Realtime filter instead of one subscription per member', () => {
  assert.match(circleDetail, /filter: `user_id=in\.\(\$\{scopedMemberIds\.join\(','\)\}\)`/);
  assert.doesNotMatch(circleDetail, /scopedMemberIds\.forEach\([\s\S]{0,500}table: 'moments'/);
});
