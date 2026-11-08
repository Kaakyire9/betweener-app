// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const migration = read('supabase/migrations/20261027150235_circle_love_seat_private_request_queue.sql');

test('Love Seat requests stay private and require member consent before activation', () => {
  assert.match(migration, /status = 'requested'/);
  assert.match(migration, /set status = 'pending_user_approval'/);
  assert.match(migration, /p_accept boolean/);
  assert.match(migration, /when coalesce\(p_accept, false\) then 'active'/);
});

test('Love Seat requests use bounded durations and expiration windows', () => {
  assert.match(migration, /duration_hours in \(12, 24, 48\)/);
  assert.match(migration, /v_now \+ interval '7 days'/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /make_interval\(hours => duration_hours\)/);
});

test('Love Seat queue reads are restricted to authenticated members and authorized hosts', () => {
  assert.match(migration, /rpc_list_circle_love_seat_requests_for_host/);
  assert.match(migration, /public.can_manage_circle_pulse\(p_circle_id, auth.uid\(\)\)/);
  assert.match(migration, /revoke all on function public.cleanup_stale_circle_love_seats\(uuid\) from authenticated/);
  assert.match(migration, /grant execute on function public.cleanup_stale_circle_love_seats\(uuid\) to service_role/);
});
