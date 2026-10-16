import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261015140000_live_operator_grade_studio_phase_b.sql', 'utf8',
);
const monitorMigration = readFileSync(
  'supabase/migrations/20261016120609_live_studio_read_only_program_monitor.sql', 'utf8',
);
const publicationMigration = readFileSync(
  'supabase/migrations/20261016165616_live_broadcast_authority_and_step_up.sql', 'utf8',
);
const api = readFileSync('apps/studio/src/api/studio-api.ts', 'utf8');
const workspace = readFileSync('apps/studio/src/workspace/StudioWorkspace.tsx', 'utf8');
const stepUp = readFileSync('apps/studio/src/security/use-operator-step-up.tsx', 'utf8');
const mfaGate = readFileSync('apps/studio/src/security/StudioMfaGate.tsx', 'utf8');
const studioApp = readFileSync('apps/studio/src/App.tsx', 'utf8');
const studioAuth = readFileSync('apps/studio/src/auth/use-studio-auth.ts', 'utf8');
const studioSignIn = readFileSync('apps/studio/src/auth/StudioSignIn.tsx', 'utf8');
const preflight = readFileSync('apps/studio/src/operations/StudioPreflightPanel.tsx', 'utf8');
const moderatorWorkspace = readFileSync('apps/studio/src/workspace/ModeratorWorkspace.tsx', 'utf8');
const runOfShow = readFileSync('apps/studio/src/operations/RunOfShowPanel.tsx', 'utf8');
const studioStyles = readFileSync('apps/studio/src/styles.css', 'utf8');
const edge = readFileSync('supabase/functions/live-studio-media-token/index.ts', 'utf8');
const playwright = readFileSync('apps/studio/playwright.config.ts', 'utf8');
const backstage = readFileSync('app/live/backstage/[sessionId].tsx', 'utf8');
const liveRoom = readFileSync('app/live/[sessionId].tsx', 'utf8');
const sessionCard = readFileSync('features/live/components/LiveSessionCard.tsx', 'utf8');
const mobileStepUp = readFileSync('features/live/security/live-step-up.ts', 'utf8');
const pushWorker = readFileSync('supabase/functions/push-notifications/index.ts', 'utf8');

test('TAKE, media publication, Start Live and End Live use AAL2 RPCs', () => {
  for (const name of [
    'rpc_studio_take_live_program_v2', 'rpc_get_live_studio_media_admission_v2',
  ]) assert.match(migration, new RegExp(`create or replace function public\\.${name}`, 'i'));
  for (const name of ['rpc_start_live_session_v2', 'rpc_end_live_session_v2']) {
    assert.match(publicationMigration, new RegExp(`create or replace function public\\.${name}`, 'i'));
  }
  assert.match(migration, /auth\.jwt\(\) ->> 'aal'[\s\S]*= 'aal2'/i);
  assert.match(migration, /revoke execute on function public\.rpc_studio_take_live_program_v1[\s\S]*from authenticated/i);
  assert.match(migration, /live_sessions_studio_step_up_transition_v1/i);
  assert.match(migration, /new\.status in \('live','ended'\)/i);
  assert.match(api, /rpc_studio_take_live_program_v2/i);
  assert.match(api, /rpc_start_live_session_v2/i);
  assert.match(api, /rpc_end_live_session_v2/i);
  assert.match(publicationMigration, /broadcast_authority in \('mobile_host', 'studio_producer'\)/i);
  assert.match(publicationMigration, /raise exception 'live_step_up_required'/i);
  assert.match(publicationMigration, /revoke execute on function public\.rpc_transition_live_session[\s\S]*from authenticated/i);
  assert.match(edge, /rpc_get_live_studio_media_admission_v2/i);
  assert.match(stepUp, /challengeAndVerify/i);
  assert.match(workspace, /runWithStepUp/i);
});

test('operators can enrol and verify TOTP before entering Studio', () => {
  assert.match(studioApp, /StudioMfaGate/i);
  assert.match(studioApp, /onGoogleSignIn=\{auth\.signInWithGoogle\}/i);
  assert.match(studioAuth, /signInWithOAuth\(\{[\s\S]*provider: 'google'/i);
  assert.match(studioAuth, /redirectTo: studioEnvironment\.studioOrigin/i);
  assert.match(studioAuth, /prompt: 'select_account'/i);
  assert.match(studioAuth, /signInWithOtp\(\{[\s\S]*shouldCreateUser: false/i);
  assert.match(studioAuth, /emailRedirectTo: studioEnvironment\.studioOrigin/i);
  assert.match(studioSignIn, /Continue with Google/i);
  assert.match(studioSignIn, /Email me a secure sign-in link/i);
  assert.match(mfaGate, /mfa\.listFactors/i);
  assert.match(mfaGate, /mfa\.enroll\(\{[\s\S]*factorType: 'totp'/i);
  assert.match(mfaGate, /mfa\.challengeAndVerify/i);
  assert.match(mfaGate, /currentLevel !== 'aal2'/i);
  assert.match(mfaGate, /mfa\.unenroll/i);
  assert.doesNotMatch(mfaGate, /console\.(log|debug|info)/i);
});

test('mobile Host publication uses explicit authority, idempotency and per-session AAL2', () => {
  assert.match(publicationMigration, /create table public\.live_publication_commands/i);
  assert.match(publicationMigration, /primary key \(session_id, command_id\)/i);
  assert.match(publicationMigration, /rpc_open_live_backstage_v1/i);
  assert.match(publicationMigration, /rpc_start_live_session_v2/i);
  assert.match(publicationMigration, /v_session\.scheduled_start \+ interval '30 minutes'/i);
  assert.match(publicationMigration, /live_studio_controls_publication/i);
  assert.match(backstage, /broadcastAuthority === 'studio_producer'/i);
  assert.match(backstage, /LiveStepUpSheet/i);
  assert.match(liveRoom, /actionLabel="End Live"/i);
  assert.match(mobileStepUp, /getAuthenticatorAssuranceLevel/i);
  assert.match(mobileStepUp, /mfa\.challenge/i);
  assert.match(mobileStepUp, /mfa\.verify/i);
});

test('overdue cards reconcile and Live notifications target hosts or saved attendees only', () => {
  assert.match(sessionCard, /Host is preparing/i);
  assert.match(sessionCard, /Delayed/i);
  assert.match(sessionCard, /Didn.t start/i);
  assert.match(publicationMigration, /cancellation_reason = 'host_no_show'/i);
  assert.match(publicationMigration, /live_notification_campaign_recipients/i);
  assert.match(publicationMigration, /participant\.rsvp_status in \('going', 'waitlisted'\)/i);
  assert.match(publicationMigration, /recipient_user_id = auth\.uid\(\)/i);
  assert.match(pushWorker, /rpc_service_list_live_campaign_tokens_v1/i);
  assert.match(pushWorker, /campaign\.kind === 'live_now'[\s\S]*live_started/i);
});

test('producer and moderator authority is explicit and private operator data is RLS sealed', () => {
  assert.match(migration, /operator_role in \('viewer','producer','moderator','supervisor'\)/i);
  assert.match(migration, /live_studio_access_operator_boundary_valid/i);
  for (const table of [
    'live_studio_run_cues', 'live_studio_private_messages',
    'live_studio_operator_presence', 'live_studio_operational_events',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /revoke all on table public\.live_studio_run_cues[\s\S]*authenticated/i);
});

test('operator workflow includes preflight, cues, private comms, safe scene and takeover', () => {
  assert.match(preflight, /getUserMedia\(\{ video: true, audio: true \}\)/i);
  assert.match(preflight, /downlink >= 3/i);
  assert.match(workspace, /RunOfShowPanel/i);
  assert.match(workspace, /PrivateOperationsChannel/i);
  assert.match(workspace, /OperatorSafetyPanel/i);
  assert.match(migration, /current_scene = 'branded_intermission'/i);
  assert.match(migration, /rpc_studio_operator_heartbeat_v1/i);
  assert.match(workspace, /onTakeover=\{\(\) => void takeControl\(\)\}/i);
});

test('moderators receive a read-only broadcast and safety workspace', () => {
  assert.match(workspace, /isModeratorWorkspace = snapshot\.access\.canModerate[\s\S]*!snapshot\.access\.canControl[\s\S]*!snapshot\.access\.canPublish/i);
  assert.match(workspace, /isModeratorWorkspace \? <ModeratorWorkspace/i);
  assert.match(moderatorWorkspace, /Read-only audience output/i);
  assert.match(moderatorWorkspace, /OperatorSafetyPanel/i);
  assert.match(moderatorWorkspace, /RunOfShowPanel[\s\S]*canEdit=\{false\}/i);
  assert.match(moderatorWorkspace, /PrivateOperationsChannel/i);
  assert.match(moderatorWorkspace, /data-testid="moderation-overview"/i);
  assert.match(moderatorWorkspace, /No programme source is on air yet\. Waiting for the producer\./i);
  assert.match(runOfShow, /No programme cues have been added yet\./i);
  assert.doesNotMatch(moderatorWorkspace, /StudioMediaControls|StudioDjSource|StudioPreflightPanel|SceneLibrary|takeProgram/i);
  assert.match(workspace, /sourceKind=\{isModeratorWorkspace \? 'program_monitor' : 'studio_host'\}/i);
  assert.match(monitorMigration, /live_studio_is_authorized_v1\([\s\S]*'moderate'/i);
  assert.match(monitorMigration, /'canSendAudio', false[\s\S]*'canSendVideo', false[\s\S]*'canScreenShare', false/i);
  assert.match(edge, /'program_monitor'/i);
});

test('broadcast hierarchy distinguishes preview, programme and on-air state', () => {
  assert.match(workspace, /isOnAir \? 'ON AIR' : 'PROGRAM'/i);
  assert.match(studioStyles, /\.preview-monitor[\s\S]*--preview/i);
  assert.match(studioStyles, /\.program-monitor\.is-on-air[\s\S]*--on-air/i);
  assert.match(studioStyles, /\.on-air-tally/i);
});

test('telemetry, mocked media E2E and opt-in staging canary are wired', () => {
  assert.match(migration, /live_studio_operational_events/i);
  assert.match(migration, /requires_acknowledgement/i);
  assert.match(playwright, /mocked-media/i);
  assert.match(playwright, /staging-canary/i);
  const canary = readFileSync('apps/studio/e2e/staging-canary.spec.ts', 'utf8');
  assert.match(canary, /STUDIO_CANARY_ALLOW_MEDIA/i);
  assert.match(canary, /test\.skip/i);
});
