// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
const migration = read('supabase/migrations/20261030162943_love_seat_signature_experience_v1.sql');
const performanceMigration = read('supabase/migrations/20261030163332_love_seat_signature_experience_v1_performance_hardening.sql');

test('Love Seat invalidation is content-free and publication-scoped', () => {
  assert.match(migration, /create table if not exists public\.circle_love_seat_updates/);
  assert.match(migration, /grant select on public\.circle_love_seat_updates to authenticated/);
  assert.match(migration, /alter publication supabase_realtime add table public\.circle_love_seat_updates/);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.circle_love_seats/);
});

test('ceremony acknowledgements are RPC-only, viewer-owned, and idempotent', () => {
  assert.match(migration, /circle_love_seat_arrival_acknowledgements/);
  assert.match(migration, /p\.user_id = auth\.uid\(\)/);
  assert.match(migration, /on conflict \(love_seat_id, viewer_profile_id\) do nothing/);
  assert.match(migration, /revoke all on public\.circle_love_seat_arrival_acknowledgements from public, anon, authenticated/);
});

test('duration, notifications, cleanup, and legacy grants are bounded', () => {
  assert.match(migration, /p_duration_hours not in \(12, 24, 48\)/);
  assert.match(migration, /'payload_version', 1/);
  assert.match(migration, /'event_id', v_event_id/);
  assert.match(migration, /circle-love-seat-cleanup-v1/);
  assert.match(migration, /revoke all on function public\.rpc_nominate_circle_love_seat\(uuid, uuid, uuid, text, text\) from public, anon/);
});

test('arrival acknowledgement and invalidation reads are indexed for scale', () => {
  assert.match(performanceMigration, /circle_love_seat_arrival_ack_viewer_idx/);
  assert.match(performanceMigration, /\(select auth\.uid\(\)\)/);
});
