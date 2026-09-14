import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hostMigration = readFileSync(
  'supabase/migrations/20260913190000_live_delegated_host_and_discovery.sql',
  'utf8',
);
const notificationMigration = readFileSync(
  'supabase/migrations/20260913200000_live_notification_campaigns.sql',
  'utf8',
);
const pushWorker = readFileSync('supabase/functions/push-notifications/index.ts', 'utf8');
const repository = readFileSync('features/live/application/live-repository.ts', 'utf8');
const studio = readFileSync('features/live/components/LiveStudioModal.tsx', 'utf8');
const circles = readFileSync('app/(tabs)/explore.tsx', 'utf8');
const eventRoute = readFileSync('app/live/event/[sessionId].tsx', 'utf8');

const functionBody = (source: string, name: string) => source.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? '';

test('Host handoff is audited, single-session and never grants global admin', () => {
  assert.match(hostMigration, /create table public\.live_session_host_assignments/i);
  assert.match(hostMigration, /unique index live_session_host_assignments_one_active_idx[\s\S]*where status = 'active'/i);
  assert.match(hostMigration, /revoke all on table public\.live_session_host_assignments from public, anon, authenticated/i);
  const delegate = functionBody(hostMigration, 'rpc_admin_delegate_live_host_v1');
  assert.match(delegate, /is_admin_user\(auth\.uid\(\)\)/i);
  assert.match(delegate, /status not in \('scheduled','waiting_for_quorum','confirmed','backstage'\)/i);
  assert.match(delegate, /produced_by_user_id = coalesce/i);
  assert.match(delegate, /created_by_user_id = v_target\.user_id/i);
  assert.doesNotMatch(delegate, /user_roles|admin_users|creator_eligibility/i);
});

test('delegated Host receives Studio access only while assignment is active', () => {
  const authorize = functionBody(hostMigration, 'live_studio_is_authorized_v1');
  assert.match(authorize, /live_session_has_active_delegated_host_v1/i);
  assert.match(authorize, /v_rollout_allowed := v_delegated_host/i);
  const expire = functionBody(hostMigration, 'expire_live_delegated_host_v1');
  assert.match(expire, /new\.status in \('ended','cancelled'\)/i);
  assert.match(expire, /set status = 'expired'/i);
  assert.match(expire, /created_by_user_id = new\.produced_by_user_id/i);
});

test('active Host can extend safely or opt into a manual end', () => {
  const extend = functionBody(hostMigration, 'rpc_extend_live_session_v1');
  assert.match(hostMigration, /scheduled_duration_minutes between 30 and 1440/i);
  assert.match(extend, /p_extension_minutes not between 15 and 360/i);
  assert.match(extend, /set end_policy = 'manual', runtime_end_at = null/i);
  assert.match(extend, /if v_new_duration > 1440/i);
  assert.match(studio, /LiveHostingManagementPanel controller=\{hosting\}/i);
  assert.match(eventRoute, /canManageSession = isOwner \|\| hosting\.snapshot\?\.canDelegateHosts/i);
});

test('public Live campaigns are durable, retryable and privacy bounded', () => {
  assert.match(notificationMigration, /create table public\.live_notification_campaigns/i);
  assert.match(notificationMigration, /unique\(session_id, kind, schedule_revision\)/i);
  assert.match(notificationMigration, /context_type in \('global','match_night','diaspora','special_event'\)/i);
  assert.doesNotMatch(notificationMigration, /context_type in \([^)]*circle/i);
  assert.match(notificationMigration, /live-public-notification-campaigns/i);
  assert.match(notificationMigration, /live_in_app_announcements/i);
  assert.match(pushWorker, /rpc_service_claim_live_notification_campaign_v1/i);
  assert.match(pushWorker, /live_reminders,live_started/i);
  assert.match(pushWorker, /LIVE_NOTIFICATIONS_MIN_APP_VERSION[\s\S]*1\.2\.0/i);
  assert.match(pushWorker, /isVersionAtLeast\(row\.app_version, LIVE_NOTIFICATIONS_MIN_APP_VERSION\)/i);
  assert.match(pushWorker, /index \+= 100/i);
  assert.match(pushWorker, /index \+= 5/i);
});

test('push delivery fails closed behind a header-only webhook secret', () => {
  assert.match(pushWorker, /req\.method !== 'POST'/i);
  assert.match(pushWorker, /if \(!secret\)[\s\S]*status: 503/i);
  assert.match(pushWorker, /req\.headers\.get\('x-push-secret'\)/i);
  assert.match(pushWorker, /timingSafeEqual\(providedSecret, secret\)/i);
  assert.doesNotMatch(pushWorker, /searchParams\.get\(['"](?:x-push-secret|secret)['"]\)/i);
});

test('Circles receives content-free Live discovery invalidations', () => {
  assert.match(hostMigration, /create table public\.live_discovery_updates/i);
  assert.match(hostMigration, /alter publication supabase_realtime add table public\.live_discovery_updates/i);
  assert.match(repository, /subscribeLiveDiscovery/i);
  assert.match(circles, />Live now</i);
  assert.match(circles, /liveRoomCount/i);
  assert.doesNotMatch(circles, />ON AIR</i);
});
