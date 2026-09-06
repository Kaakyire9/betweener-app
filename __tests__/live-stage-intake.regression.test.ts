import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundationMigration = readFileSync(
  new URL('../supabase/migrations/20260821203000_live_stage_request_intake.sql', import.meta.url),
  'utf8',
);
const realtimeMigration = readFileSync(
  new URL('../supabase/migrations/20260824110000_live_session_structure_realtime.sql', import.meta.url),
  'utf8',
);
const capacityMigration = readFileSync(
  new URL('../supabase/migrations/20260824123000_live_stage_request_capacity.sql', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../features/live/application/live-repository.ts', import.meta.url),
  'utf8',
);
const parser = readFileSync(
  new URL('../features/live/application/live-parsers.ts', import.meta.url),
  'utf8',
);
const controller = readFileSync(
  new URL('../features/live/hooks/use-live-session-controller.ts', import.meta.url),
  'utf8',
);
const stageDesk = readFileSync(
  new URL('../features/live/components/LiveStageDesk.tsx', import.meta.url),
  'utf8',
);
const requestTile = readFileSync(
  new URL('../features/live/components/LiveStageRequestTile.tsx', import.meta.url),
  'utf8',
);
const liveScreen = readFileSync(
  new URL('../app/live/[sessionId].tsx', import.meta.url),
  'utf8',
);
const stage = readFileSync(
  new URL('../features/live/components/StreamLiveStage.tsx', import.meta.url),
  'utf8',
);
const preferences = readFileSync(
  new URL('../features/live/components/LiveAudiencePreferences.tsx', import.meta.url),
  'utf8',
);
const roomEventNotice = readFileSync(
  new URL('../features/live/components/LiveRoomEventNotice.tsx', import.meta.url),
  'utf8',
);
const audiencePulseCard = readFileSync(
  new URL('../features/live/components/LiveAudiencePulseCard.tsx', import.meta.url),
  'utf8',
);
const stageDepartureMigration = readFileSync(
  new URL('../supabase/migrations/20260824170000_live_participant_self_stage_departure.sql', import.meta.url),
  'utf8',
);
const hardenedStageDepartureMigration = readFileSync(
  new URL('../supabase/migrations/20260825090000_harden_live_participant_self_stage_departure.sql', import.meta.url),
  'utf8',
);

test('legacy stage intake remains closed by default and capability controlled', () => {
  assert.match(foundationMigration, /stage_requests_open boolean not null default false/i);
  assert.match(foundationMigration, /has_live_capability\(p_session_id, 'live\.manage_stage'\)/i);
  assert.match(foundationMigration, /where id = p_session_id\s+for update/i);
  assert.match(foundationMigration, /version = version \+ 1/i);
});

test('stage request capacity is persisted, constrained and backward compatible', () => {
  assert.match(capacityMigration, /stage_request_capacity smallint not null default 0/i);
  assert.match(
    capacityMigration,
    /stage_request_capacity between 0 and least\(3, greatest\(maximum_publishers - 1, 0\)\)/i,
  );
  assert.match(capacityMigration, /rpc_set_live_stage_request_capacity/i);
  assert.match(capacityMigration, /has_live_capability\(p_session_id, 'live\.manage_stage'\)/i);
  assert.match(capacityMigration, /stage_requests_open = p_capacity > 0/i);
  assert.match(capacityMigration, /rpc_set_live_stage_request_capacity\(p_session_id, v_capacity\)/i);
  assert.match(capacityMigration, /previousCapacity/i);
  assert.match(capacityMigration, /version = version \+ 1/i);
  assert.match(capacityMigration, /live_stage_capacity_below_occupied/i);
});

test('request creation is idempotent and respects authoritative reserved capacity', () => {
  const existingLookup = capacityMigration.indexOf("and status = 'pending'");
  const closedGuard = capacityMigration.indexOf('if v_session.stage_request_capacity <= 0');
  assert.ok(existingLookup >= 0);
  assert.ok(closedGuard > existingLookup);
  assert.match(capacityMigration, /count\(distinct participant\.user_id\)/i);
  assert.match(capacityMigration, /participant\.state in \('backstage', 'on_stage'\)/i);
  assert.match(capacityMigration, /raise exception 'live_stage_capacity_full'/i);
  assert.match(capacityMigration, /'intakeMode', 'host_capacity'/i);
});

test('approval is serialized and cannot overbook a capacity-limited stage', () => {
  assert.match(
    capacityMigration,
    /create or replace function public\.rpc_resolve_live_seat_request/i,
  );
  assert.match(capacityMigration, /where id = v_request\.session_id\s+for update/i);
  assert.match(capacityMigration, /if v_request\.status <> 'pending' then\s+return v_participant/i);
  assert.match(capacityMigration, /v_reserved_guest_seats >= v_session\.stage_request_capacity/i);
  assert.match(capacityMigration, /raise exception 'live_stage_capacity_full'/i);
});

test('capacity authority is parsed and wired through repository and controller', () => {
  assert.match(parser, /value\.stage_request_capacity/);
  assert.match(parser, /value\.stage_requests_open === true \? maximumGuestSeats : 0/);
  assert.match(parser, /stageRequestsOpen: stageRequestCapacity > 0/);
  assert.match(repository, /rpc_set_live_stage_request_capacity/);
  assert.match(repository, /table: 'live_session_structure_updates'/);
  assert.doesNotMatch(repository, /table: 'live_sessions'/);
  assert.match(controller, /setStageRequestCapacity/);
});

test('host chooses zero to three guest seats and the stage renders each available seat', () => {
  assert.match(stageDesk, /STAGE REQUESTS/);
  assert.match(stageDesk, /capacityOptions\.map/);
  assert.match(stageDesk, /Open \$\{capacity\} guest/);
  assert.match(stageDesk, /You still approve every seat/);
  assert.match(stageDesk, /capacity < occupiedGuestSeats/);
  assert.match(stage, /Array\.from\(\{ length: visibleRequestSeats \}/);
  assert.match(stage, /LiveStageRequestTile/);
  assert.match(requestTile, /seatIndex/);
  assert.match(liveScreen, /stageRequestCapacity/);
  assert.match(liveScreen, /availableGuestSeats/);
});

test('seat request is touchable and failure is visible rather than silent', () => {
  assert.match(liveScreen, /const saved = await \(hasRequestedSeat \? controller\.withdrawSeat\(\) : controller\.requestSeat\(\)\)/);
  assert.match(liveScreen, /Seat request unavailable/);
  assert.match(liveScreen, /styles\.overlaySpacer/);
  assert.match(
    liveScreen,
    /isQuickConnectLive && !keyboardVisible[\s\S]*?<LiveQuickConnectStage/,
  );
  assert.match(requestTile, /onPress=\{request\.onPress\}/);
  assert.match(requestTile, /Stage request sent/);
});

test('guest introduction consent stays separate from stage consent', () => {
  assert.match(liveScreen, /<LiveAudiencePreferences/);
  assert.match(liveScreen, /showAvailabilityControl=\{false\}/);
  assert.match(preferences, /Stage requests are always a separate choice/);
  assert.match(preferences, /Audience only/);
});

test('capacity changes use the RLS-scoped content-free realtime projection', () => {
  assert.match(realtimeMigration, /create table if not exists public\.live_session_structure_updates/);
  assert.match(realtimeMigration, /force row level security/);
  assert.match(realtimeMigration, /can_view_live_session\(session_id, auth\.uid\(\)\)/);
  assert.match(capacityMigration, /new\.stage_request_capacity is distinct from old\.stage_request_capacity/);
  assert.match(capacityMigration, /after update of status, stage_requests_open, stage_request_capacity, version/i);
  assert.match(realtimeMigration, /add table public\.live_session_structure_updates/);
  assert.match(realtimeMigration, /drop table public\.live_sessions/);
});

test('host receives a realtime stage-request notice without consuming the durable request', () => {
  assert.match(liveScreen, /snapshot\.seatRequests\.filter\(\(request\) => request\.status === 'pending'\)/);
  assert.match(liveScreen, /kind: 'stage_request'/);
  assert.match(liveScreen, /openLiveStudio\(\)/);
  assert.match(roomEventNotice, /onDismiss: \(\) => void/);
  assert.doesNotMatch(roomEventNotice, /resolveSeat|withdrawSeat|delete/);
});

test('audience pulse is announced and opens its response sheet directly', () => {
  assert.match(liveScreen, /kind: 'audience_pulse'/);
  assert.match(liveScreen, /setAudiencePulseOpenRequest\(\(request\) => request \+ 1\)/);
  assert.match(liveScreen, /audiencePulseOpenRequest=\{audiencePulseOpenRequest\}/);
  assert.match(audiencePulseCard, /openRequest > 0 && activePollId/);
});

test('room exit and stage departure remain explicit, confirmed and distinct', () => {
  assert.match(liveScreen, /const confirmLeaveLive = useCallback/);
  assert.match(liveScreen, /Leave this Live\?/);
  assert.match(liveScreen, /await Promise\.allSettled\(\[/);
  assert.match(liveScreen, /shouldPersistLeave \? controller\.leave\(\) : Promise\.resolve\(\)/);
  assert.match(liveScreen, /returnToLiveOrigin\(\)/);
  assert.match(liveScreen, /onLeave=\{isRoomHost \? \(\) => void close\(\) : confirmLeaveLive\}/);
  assert.match(liveScreen, /accessibilityLabel="Leave stage"/);
  assert.match(liveScreen, /Leave the stage\?/);
  assert.match(liveScreen, /await controller\.leaveStage\(\)/);
  assert.match(liveScreen, /You will stay in this Live and continue as a member of the audience/);
});

test('self stage departure is server-authoritative, idempotent and revokes publication', () => {
  assert.match(stageDepartureMigration, /create or replace function public\.rpc_leave_live_stage/);
  assert.match(stageDepartureMigration, /where s\.id = p_session_id\s+for update/);
  assert.match(stageDepartureMigration, /if v_participant\.state = 'audience' then\s+return v_participant/);
  assert.match(stageDepartureMigration, /set state = 'audience'/);
  assert.match(stageDepartureMigration, /stage_slot = null/);
  assert.match(stageDepartureMigration, /'live\.publish', 'revoke'/);
  assert.match(stageDepartureMigration, /'participant_demoted'/);
  assert.match(stageDepartureMigration, /grant execute on function public\.rpc_leave_live_stage\(uuid\) to authenticated, service_role/);
});

test('self stage departure survives publisher and presence reconciliation races', () => {
  assert.match(hardenedStageDepartureMigration, /reconnect_state in \('on_stage', 'backstage'\)/i);
  assert.match(hardenedStageDepartureMigration, /or v_participant\.stage_slot is not null/i);
  assert.match(hardenedStageDepartureMigration, /reconnect_state = null/i);
  assert.match(hardenedStageDepartureMigration, /v_participant\.state in \('left', 'removed', 'banned'\)/i);
  assert.match(hardenedStageDepartureMigration, /created_at = timezone\('utc'::text, now\(\)\)/i);
  assert.doesNotMatch(hardenedStageDepartureMigration, /live_session_capability_assignments[\s\S]*updated_at =/i);
});
