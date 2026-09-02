import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseLiveQuickConnectHostSnapshot } from '../features/live/application/live-parsers.ts';
import { paginateLiveQuickConnectPool } from '../features/live/domain/live-quick-connect-pool-layout.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const migration = read('../supabase/migrations/20260828160000_live_quick_connect_host_control_room.sql');
const publicPoolMigration = read('../supabase/migrations/20260828190000_live_quick_connect_public_pool.sql');
const hostPoolEnrollmentMigration = read('../supabase/migrations/20260829100000_live_quick_connect_host_pool_enrollment.sql');
const sharedLayoutMigration = read('../supabase/migrations/20260829150000_live_quick_connect_shared_stage_layout.sql');
const safetyMigration = read('../supabase/migrations/20260829170000_live_quick_connect_private_safety.sql');
const repository = read('../features/live/application/live-repository.ts');
const participantHook = read('../features/live/hooks/use-live-quick-connect.ts');
const hook = read('../features/live/hooks/use-live-quick-connect-host-control.ts');
const poolHook = read('../features/live/hooks/use-live-quick-connect-pool.ts');
const panel = read('../features/live/components/LiveQuickConnectHostPanel.tsx');
const pool = read('../features/live/components/LiveQuickConnectPool.tsx');
const constellation = read('../features/live/components/LiveQuickConnectConstellation.tsx');
const sharedStage = read('../features/live/components/LiveQuickConnectStage.tsx');
const studio = read('../features/live/components/LiveStudioModal.tsx');
const route = read('../app/live/[sessionId].tsx');

test('Quick Connect host controls are private, constrained and server authoritative', () => {
  assert.match(migration, /create table public\.live_quick_connect_controls/i);
  assert.match(migration, /state in \('closed', 'open', 'paused', 'draining', 'ended'\)/i);
  assert.match(migration, /creator_mode in \('facilitator', 'participant'\)/i);
  assert.match(migration, /round_seconds in \(120, 180, 300\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.live_quick_connect_controls from public, anon, authenticated/i,
  );
});

test('existing rotations stay compatible while new events start closed and facilitator-led', () => {
  assert.match(
    migration,
    /when session\.status in \('live', 'backstage'\) then 'open'/i,
  );
  assert.match(
    migration,
    /if new\.format = 'quick_connect'[\s\S]*?'closed'[\s\S]*?'facilitator'/i,
  );
  assert.match(
    migration,
    /when \(new\.configuration ->> 'quick_connect_round_seconds'\) in \('120', '180', '300'\)[\s\S]*?else 180/i,
  );
});

test('pairing is fail-closed and uses the host-configured round duration', () => {
  assert.match(
    migration,
    /when v_session\.status in \('ended', 'cancelled'\) then 'ended'[\s\S]*?else 'closed'/i,
  );
  assert.match(migration, /live_quick_connect_control_missing/i);
  assert.match(migration, /make_interval\(secs => v_control\.round_seconds\)/i);
  assert.match(migration, /if v_control\.state <> 'open' then[\s\S]*?return;/i);
  assert.match(migration, /for update skip locked/i);
});

test('host actions have explicit transitions and draining preserves active rounds', () => {
  assert.match(migration, /p_action not in \('open', 'close', 'pause', 'resume', 'drain', 'end'\)/i);
  assert.match(migration, /live_quick_connect_control_transition_invalid/i);
  assert.match(
    migration,
    /if v_control\.state = 'draining' and v_active_pair_count = 0 then[\s\S]*?set state = 'ended'/i,
  );
  assert.match(
    migration,
    /if p_action = 'end' then[\s\S]*?pairing\.state in \('active', 'reconnect_grace'\)/i,
  );
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('quick:' \|\| p_session_id::text, 0\)\)/i);
});

test('admission preserves reconnects but blocks new entrants while closed', () => {
  assert.match(
    migration,
    /rename to rpc_join_live_quick_connect_uncontrolled/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.rpc_join_live_quick_connect_uncontrolled\(uuid\)[\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(migration, /live_quick_connect_host_facilitator/i);
  assert.match(
    migration,
    /v_control\.state <> 'open'[\s\S]*?v_existing\.state, 'left'\) not in \('waiting', 'paired', 'disconnected'\)/i,
  );
  assert.match(migration, /live_quick_connect_not_open/i);
});

test('host snapshot exposes operational metrics without direct table access', () => {
  for (const metric of [
    'waiting_people',
    'eligible_people',
    'active_pairs',
    'reconnecting_people',
    'completed_rounds',
  ]) {
    assert.match(migration, new RegExp(`'${metric}'`, 'i'));
  }
  assert.match(migration, /v_session\.created_by_user_id <> p_requesting_user_id/i);
  assert.match(migration, /live_quick_connect_control_forbidden/i);
});

test('host snapshot parser rejects invalid state and normalizes safe values', () => {
  const snapshot = parseLiveQuickConnectHostSnapshot({
    session_id: 'session-1',
    state: 'paused',
    creator_mode: 'unexpected',
    round_seconds: 180,
    version: -2,
    server_now: '2026-08-28T12:00:00.000Z',
    can_manage: true,
    metrics: {
      waiting_people: -2,
      eligible_people: 5.9,
      active_pairs: 2,
      reconnecting_people: 1,
      completed_rounds: 9,
    },
  });

  assert.equal(snapshot.creatorMode, 'facilitator');
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.metrics.waitingPeople, 0);
  assert.equal(snapshot.metrics.eligiblePeople, 5);
  assert.throws(
    () => parseLiveQuickConnectHostSnapshot({ state: 'running', round_seconds: 180 }),
    /live_quick_connect_host_snapshot_invalid/,
  );
  assert.throws(
    () => parseLiveQuickConnectHostSnapshot({ state: 'open', round_seconds: 240 }),
    /live_quick_connect_round_duration_invalid/,
  );
});

test('Live Studio and repository expose one host-control path', () => {
  assert.match(repository, /rpc_get_live_quick_connect_host_control/i);
  assert.match(repository, /rpc_configure_live_quick_connect/i);
  assert.match(repository, /rpc_control_live_quick_connect/i);
  assert.match(hook, /subscribeQuickConnect\(sessionId, \(\) => void refresh\(\)\)/i);
  assert.match(hook, /actionInFlightRef\.current/i);
  assert.match(studio, /rotation: \{ label: 'Rotation'/i);
  assert.match(studio, /LiveQuickConnectHostPanel/i);
  assert.match(panel, />\{seconds \/ 60\} min</i);
  assert.match(panel, /roundOptions = \[120, 180, 300\] as const/i);
  assert.doesNotMatch(panel, /Join rotations/i);
  assert.match(panel, /Host & safety facilitator/i);
  assert.match(panel, /Open rotation/i);
  assert.match(panel, /Close entry/i);
});

test('Quick Connect is public-first and only a canonical pairing opens a private round', () => {
  assert.match(route, /useLiveQuickConnectPool\([\s\S]*?isQuickConnectLive && participantAdmissionReady/i);
  assert.doesNotMatch(route, /isQuickConnectParticipantExperience/i);
  assert.match(route, /onOptIn=\{\(connectionIntent\) => void quickConnectPool\.optIn\(connectionIntent\)\}/i);
  assert.match(route, /quickConnectPairingId = quickConnectPool\.snapshot\?\.queue\?\.pairing\?\.id/i);
  assert.match(
    route,
    /if \(!isQuickConnectLive \|\| !quickConnectPairingId\) return;[\s\S]*?pathname: '\/live\/quick-connect\/\[sessionId\]'/i,
  );
  assert.match(route, /Promise\.all\([\s\S]*?setTimeout\(resolve, 900\)/i);
  assert.match(route, /<LiveQuickConnectPool/i);
  assert.match(route, /quickConnectProps=\{isQuickConnectLive && isRoomHost/i);
});

test('public pool enrolment is explicit, private and server-authoritative', () => {
  assert.match(publicPoolMigration, /create table if not exists public\.live_quick_connect_interests/i);
  assert.match(publicPoolMigration, /alter table public\.live_quick_connect_interests enable row level security/i);
  assert.match(
    publicPoolMigration,
    /revoke all on table public\.live_quick_connect_interests from public, anon, authenticated/i,
  );
  assert.match(publicPoolMigration, /create or replace function public\.rpc_get_live_quick_connect_pool/i);
  assert.match(publicPoolMigration, /create or replace function public\.rpc_signal_live_quick_connect_interest/i);
  assert.match(publicPoolMigration, /live_quick_connect_pool_membership_required/i);
  assert.match(publicPoolMigration, /live_quick_connect_pair_is_eligible/i);
  assert.match(publicPoolMigration, /least\(v_user_id, v_target_user_id\)/i);
  assert.match(publicPoolMigration, /greatest\(v_user_id, v_target_user_id\)/i);
});

test('pool enrolment is explicit for guests while hosts remain facilitators', () => {
  assert.match(poolHook, /const optIn = useCallback/i);
  assert.doesNotMatch(poolHook, /useEffect\([\s\S]{0,300}?joinQuickConnect/i);
  assert.match(poolHook, /subscribeQuickConnect\(sessionId/i);
  assert.match(hostPoolEnrollmentMigration, /Hosting a Quick Connect Live and consenting to join its matchmaking pool are[\s\S]*?independent roles/i);
  assert.match(hostPoolEnrollmentMigration, /return public\.rpc_join_live_quick_connect_uncontrolled\(p_session_id\)/i);
  assert.match(hostPoolEnrollmentMigration, /'is_host', v_session\.created_by_user_id = v_user_id/i);
  assert.match(hostPoolEnrollmentMigration, /'is_opted_in', coalesce\(v_me\.state in \('waiting', 'paired', 'disconnected'\), false\)/i);
  assert.match(safetyMigration, /live_quick_connect_host_facilitator_required/i);
  assert.match(safetyMigration, /check \(creator_mode = 'facilitator'\)/i);
  assert.match(safetyMigration, /p_creator_mode is distinct from 'facilitator'/i);
  assert.match(pool, /Facilitating this rotation/i);
  assert.doesNotMatch(pool, /Join your guests, if you choose/i);
  assert.match(pool, /canSignal=\{snapshot\.isOptedIn\}/i);
});

test('pool constellation displays four readable members and paginates deterministically', () => {
  const members = Array.from({ length: 10 }, (_, index) => ({ id: index }));
  const firstPage = paginateLiveQuickConnectPool(members, 0);
  const secondPage = paginateLiveQuickConnectPool(members, 1);

  assert.equal(firstPage.members.length, 4);
  assert.equal(firstPage.remainingCount, 6);
  assert.equal(firstPage.hasNext, true);
  assert.deepEqual(secondPage.members.map((member) => member.id), [4, 5, 6, 7]);
  assert.equal(secondPage.hasPrevious, true);
  assert.match(pool, /Leave pool/i);
  assert.match(pool, /AccessibilityInfo\.isReduceMotionEnabled/i);
  assert.match(constellation, /QUICK_CONNECT_POOL_STARS\.map/i);
  assert.match(constellation, /Easing\.inOut\(Easing\.sin\)/i);
  assert.match(constellation, /exitKind === 'pair'/i);
  assert.match(constellation, /pairing\.interpolate/i);
  assert.match(pool, /pageMotion/i);
});

test('Quick Connect supports equal stacked and side-by-side host and pool stages', () => {
  const sharedStageIndex = route.indexOf('<LiveQuickConnectStage');
  const poolPanel = route.indexOf('<LiveQuickConnectPool');

  assert.ok(sharedStageIndex >= 0);
  assert.ok(poolPanel > sharedStageIndex);
  assert.match(route, /hostSurface=\{renderMediaStage\(\)\}/i);
  assert.match(route, /poolSurface=\{\(/i);
  assert.match(route, /layout=\{quickConnectLayout\}/i);
  assert.match(route, /quickConnectPool\.snapshot\?\.stageLayout \?\? 'stacked'/i);
  assert.match(route, /onLayoutChange=\{\(layout\) => void quickConnectPool\.setStageLayout\(layout\)\}/i);
  assert.match(route, /isQuickConnectLive && !keyboardVisible/i);
  assert.match(sharedStage, /hostPane:\s*\{[\s\S]*?flex:\s*1/i);
  assert.match(sharedStage, /poolPane:\s*\{[\s\S]*?flex:\s*1/i);
  assert.match(sharedStage, /sideBySide \? styles\.horizontal : styles\.vertical/i);
});

test('the host stage layout is server-owned, realtime and compact in the narrow pane', () => {
  assert.match(sharedLayoutMigration, /add column if not exists stage_layout text not null default 'stacked'/i);
  assert.match(sharedLayoutMigration, /check \(stage_layout in \('stacked', 'side-by-side'\)\)/i);
  assert.match(sharedLayoutMigration, /v_session\.created_by_user_id <> v_user_id/i);
  assert.match(sharedLayoutMigration, /'stage_layout', coalesce\(v_control\.stage_layout, 'stacked'\)/i);
  assert.match(sharedLayoutMigration, /rpc_set_live_quick_connect_stage_layout/i);
  assert.match(repository, /setQuickConnectStageLayout[\s\S]*?rpc_set_live_quick_connect_stage_layout/i);
  assert.match(poolHook, /setStageLayout[\s\S]*?setQuickConnectStageLayout/i);
  assert.match(pool, /layout === 'side-by-side' \? 'QUICK CONNECT' : 'QUICK CONNECT POOL'/i);
  assert.match(pool, /layout === 'stacked' \? <View style=\{styles\.optInCopy\}>/i);
  assert.doesNotMatch(pool, />Manage</i);
});

test('background pool synchronization stays silent and keeps layout controls stable', () => {
  assert.match(poolHook, /const showInitialLoading = !hasSnapshotRef\.current/i);
  assert.match(poolHook, /if \(mountedRef\.current && showInitialLoading\) setInitialLoading\(true\)/i);
  assert.match(poolHook, /if \(!hasSnapshotRef\.current\) \{[\s\S]*?setError/i);
  assert.match(poolHook, /const HEARTBEAT_INTERVAL_MS = 15_000/i);
  assert.match(pool, /style=\{styles\.progressSlot\}/i);
  assert.match(pool, /progressSlot:\s*\{ width: 16, height: 16/i);
  assert.doesNotMatch(pool, /refreshing \|\| busyAction/i);
  assert.match(route, /initialLoading=\{quickConnectPool\.initialLoading\}/i);
  assert.doesNotMatch(route, /refreshing=\{quickConnectPool\.refreshing\}/i);
});

test('opening a host-controlled rotation wakes waiting guests without a polling loop', () => {
  assert.match(
    repository,
    /subscribeQuickConnect[\s\S]*?status === 'SUBSCRIBED'\) onChange\(\)/i,
  );
  assert.match(
    participantHook,
    /quickConnectIsWaitingForHost\(errorRef\.current\)[\s\S]*?void retryJoin\(\)/i,
  );
  assert.match(
    participantHook,
    /if \(quickConnectIsWaitingForHost\(errorRef\.current\)\) return;/i,
  );
});
