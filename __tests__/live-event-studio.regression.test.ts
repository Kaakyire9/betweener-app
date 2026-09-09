import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260826100000_live_event_studio.sql', 'utf8');
const lifecycleMigration = readFileSync('supabase/migrations/20260906170000_live_creation_studio_lifecycle.sql', 'utf8');
const completionMigration = readFileSync('supabase/migrations/20260909110000_live_lifecycle_completion_and_recap.sql', 'utf8');
const indexMigration = readFileSync('supabase/migrations/20260906171000_live_creation_studio_indexes_concurrently.sql', 'utf8');
const validationMigration = readFileSync('supabase/migrations/20260906172000_live_creation_studio_validate_constraints.sql', 'utf8');
const scheduleScreen = readFileSync('app/live/schedule.tsx', 'utf8');
const creationSteps = readFileSync('features/live/creation/LiveCreationSteps.tsx', 'utf8');
const managementSheet = readFileSync('features/live/components/LiveEventManagementSheet.tsx', 'utf8');
const studioScreen = readFileSync('app/live/index.tsx', 'utf8');
const eventScreen = readFileSync('app/live/event/[sessionId].tsx', 'utf8');
const backstageScreen = readFileSync('app/live/backstage/[sessionId].tsx', 'utf8');
const liveRoomScreen = readFileSync('app/live/[sessionId].tsx', 'utf8');
const repository = readFileSync('features/live/application/live-repository.ts', 'utf8');
const invitationOptions = readFileSync('features/live/components/LiveInvitationOptionsSheet.tsx', 'utf8');
const teaserTrimmer = readFileSync('features/live/creation/live-teaser-trimmer.ts', 'utf8');

test('the database prevents a scheduled Live from starting early', () => {
  assert.match(migration, /create or replace function public\.enforce_live_session_start_time/i);
  assert.match(migration, /live_session_not_due/i);
  assert.match(migration, /before update of status on public\.live_sessions/i);
});

test('event promotional media is owner controlled and server bound', () => {
  assert.match(migration, /live-event-media/i);
  assert.match(migration, /rpc_update_live_event_media/i);
  assert.match(migration, /created_by_user_id <> auth\.uid\(\)/i);
  assert.match(migration, /storage\.objects/i);
  assert.match(migration, /live_event_poster_type_invalid/i);
  assert.match(migration, /live_event_teaser_type_invalid/i);
  assert.match(migration, /live_event_teaser_duration_required/i);
});

test('event creation enters preparation and Studio exposes lifecycle sections', () => {
  assert.match(scheduleScreen, /pathname: '\/live\/event\/\[sessionId\]'/);
  assert.match(studioScreen, /Live now/);
  assert.match(studioScreen, /Upcoming Live/);
  assert.match(studioScreen, /Past Live/);
  assert.match(studioScreen, /useFocusEffect/);
  assert.match(studioScreen, /refresh\(\{ attemptRecovery: false \}\)/);
});

test('Creation Studio is guided, recoverable, and idempotently published', () => {
  assert.match(creationSteps, /Moment/);
  assert.match(creationSteps, /Story/);
  assert.match(creationSteps, /Room/);
  assert.match(creationSteps, /Review/);
  assert.match(scheduleScreen, /loadLiveCreationDraft/);
  assert.match(scheduleScreen, /saveLiveCreationDraft/);
  assert.match(scheduleScreen, /scheduleStudio/);
  assert.match(lifecycleMigration, /creation_request_id uuid/);
  assert.match(indexMigration, /drop index concurrently if exists[\s\S]*live_sessions_creator_request_unique_idx/i);
  assert.match(indexMigration, /create unique index concurrently live_sessions_creator_request_unique_idx/i);
  assert.match(lifecycleMigration, /pg_advisory_xact_lock/);
});

test('Creation Studio keeps the host note visible above the software keyboard', () => {
  assert.match(scheduleScreen, /KeyboardAvoidingView/);
  assert.match(scheduleScreen, /automaticallyAdjustKeyboardInsets/);
  assert.match(scheduleScreen, /formScrollRef\.current\?\.scrollToEnd/);
  assert.match(creationSteps, /onFocus=\{onHostNoteFocus\}/);
});

test('long Live previews open a precise native editor capped at 20 seconds', () => {
  assert.match(scheduleScreen, /allowsEditing: false/);
  assert.match(scheduleScreen, /await trimLiveTeaser\(asset\)/);
  assert.match(teaserTrimmer, /maxDuration: LIVE_EVENT_TEASER_MAX_DURATION_MS/);
  assert.match(teaserTrimmer, /enablePreciseTrimming: true/);
  assert.match(teaserTrimmer, /fileSize: info\.exists/);
});

test('Studio deployment preserves the production 1.1.1 catalogue contract', () => {
  assert.doesNotMatch(
    lifecycleMigration,
    /drop function if exists public\.rpc_list_live_studio_sessions\(integer,\s*timestamptz\)/i,
  );
  assert.match(lifecycleMigration, /rpc_list_live_studio_sessions_v2/);
  assert.match(repository, /invoke\('rpc_list_live_studio_sessions_v2'/);
  assert.match(indexMigration, /create index concurrently live_sessions_owner_archive_idx/i);
  assert.doesNotMatch(indexMigration, /\bbegin\s*;/i);
  assert.match(lifecycleMigration, /live_sessions_scheduled_duration_valid[\s\S]*not valid/i);
  assert.match(
    lifecycleMigration,
    /live_participants_rsvp_status_valid[\s\S]*?not valid;[\s\S]*?commit;[\s\S]*?begin;[\s\S]*?create or replace function/i,
  );
  assert.match(validationMigration, /validate constraint live_sessions_scheduled_duration_valid/i);
  assert.match(validationMigration, /validate constraint live_participants_rsvp_status_valid/i);
});

test('published Lives can be edited, rescheduled, cancelled, copied, and archived', () => {
  assert.match(managementSheet, /Edit details/);
  assert.match(managementSheet, /Reschedule/);
  assert.match(managementSheet, /Create a copy/);
  assert.match(managementSheet, /Cancel Live/);
  assert.match(managementSheet, /Archive from Studio/);
  assert.match(lifecycleMigration, /rpc_update_live_studio_session_v1/);
  assert.match(lifecycleMigration, /needs_reconfirmation/);
  assert.match(lifecycleMigration, /private\.send_push_webhook/);
  assert.match(lifecycleMigration, /live_rescheduled/);
  assert.match(lifecycleMigration, /live_cancelled/);
  assert.match(lifecycleMigration, /rpc_cancel_live_studio_session_v1/);
  assert.match(lifecycleMigration, /rpc_archive_live_studio_session_v1/);
  assert.doesNotMatch(lifecycleMigration, /delete from public\.live_sessions/i);
});

test('the event catalogue is lifecycle ordered without polling', () => {
  assert.match(migration, /s\.status not in \('live','ending','ended','cancelled'\)[\s\S]*?end asc/i);
  assert.doesNotMatch(studioScreen, /setInterval|setTimeout/);
});

test('event details support reservations, countdown and outcome metrics', () => {
  assert.match(eventScreen, /Save my place/);
  assert.match(eventScreen, /places saved/);
  assert.match(eventScreen, /introductions/);
  assert.match(eventScreen, /formatLiveCountdown/);
});

test('ending a Live is atomic and routes the room into its final report', () => {
  assert.match(completionMigration, /rpc_end_live_session_v1/i);
  assert.match(completionMigration, /'ending'[\s\S]*'ended'/i);
  assert.match(completionMigration, /for update/i);
  assert.match(
    completionMigration,
    /update public\.live_sessions[\s\S]*status = 'ended'[\s\S]*where status = 'ending'/i,
  );
  assert.match(liveRoomScreen, /controller\.endSession\(\)/);
  assert.match(liveRoomScreen, /openSessionRecap/);
  assert.doesNotMatch(liveRoomScreen, /transitionSession\('ending'\)/);
  assert.match(eventScreen, /LiveSessionRecapCard/);
});

test('Past Live remains visible to attendees with a privacy-safe personal recap', () => {
  assert.match(completionMigration, /rpc_get_live_session_recap_v1/i);
  assert.match(completionMigration, /participant\.user_id = auth\.uid\(\)/i);
  assert.match(completionMigration, /'my_room_pulse_notes'/i);
  assert.match(completionMigration, /'my_private_sparks'/i);
  assert.match(completionMigration, /'my_quick_connect_rounds'/i);
  assert.match(completionMigration, /session\.status in \('ended','cancelled'\)[\s\S]*live_participants/i);
  assert.doesNotMatch(completionMigration, /live_match_round_responses/i);
  assert.doesNotMatch(completionMigration, /live_private_spark_responses/i);
});

test('event back navigation returns to its explicit origin on button and hardware back', () => {
  assert.match(eventScreen, /router\.dismissTo\(getLiveExitDestination\(liveReturnParams\)\)/);
  assert.match(eventScreen, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(eventScreen, /returnsToCircle \? 'Back to Circle' : 'Back to Live Studio'/);
});

test('backstage mirrors the server start-time guard before enabling the host CTA', () => {
  assert.match(backstageScreen, /stageIsDue/);
  assert.match(backstageScreen, /Available in/);
  assert.match(backstageScreen, /live_session_not_due/);
});

test('host preparation starts through valid lifecycle states and retries version races', () => {
  assert.match(backstageScreen, /controller\.prepareAndStartSession\(\)/);
  assert.match(repository, /getLiveSessionStartTarget/);
  assert.match(repository, /live_session_version_conflict/);
  assert.doesNotMatch(backstageScreen, /transitionSession\('live'\)/);
});

test('scheduled invitations distinguish host preparation and expose real overflow actions', () => {
  assert.match(liveRoomScreen, /HOST PREPARATION/);
  assert.match(liveRoomScreen, /Open private backstage/);
  assert.match(liveRoomScreen, /isRoomHost \? 'Live options' : 'Invitation options'/);
  assert.match(invitationOptions, /View event details/);
  assert.match(invitationOptions, /Share invitation/);
  assert.match(invitationOptions, /Edit invitation/);
  assert.match(invitationOptions, /Reschedule/);
});
