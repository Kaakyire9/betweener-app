import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20260813154500_live_host_stage_invariant.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('live rooms enforce the host as canonical public stage slot one', () => {
  assert.match(sql, /new\.status in \('live','ending'\)/);
  assert.match(sql, /set state='on_stage',stage_slot=1/);
  assert.match(sql, /p\.user_id=v_session\.created_by_user_id/);
  assert.match(sql, /p\.role='host'/);
});

test('live snapshots use a resilient profile media fallback for stage identity', () => {
  assert.match(sql, /p_profile\.avatar_url/);
  assert.match(sql, /p_profile\.hero_image_url/);
  assert.match(sql, /unnest\(coalesce\(p_profile\.photos/);
  assert.match(sql, /'avatar_url',public\.live_profile_avatar\(pr\)/);
});

test('legacy slot-one conflicts are repaired before host promotion', () => {
  assert.match(sql, /generate_series\(2,4\)/);
  assert.match(sql, /set stage_slot=v_replacement_slot/);
  assert.match(sql, /set state='audience',stage_slot=null/);
});
