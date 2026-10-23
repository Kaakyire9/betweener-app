import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeCountryCodeList,
  resolveLegacyCircleAudience,
} from '../lib/circles/circle-audience.ts';

const audienceMigration = readFileSync('supabase/migrations/20261014151000_circle_audience_access_foundation.sql', 'utf8');
const joinMigration = readFileSync('supabase/migrations/20261014151500_circle_membership_policy_compatibility.sql', 'utf8');
const livePreviewMigration = readFileSync('supabase/migrations/20261014152000_circle_live_discovery_previews.sql', 'utf8');
const notificationMigration = readFileSync('supabase/migrations/20261014153000_circle_member_notification_campaigns.sql', 'utf8');
const executeHardeningMigration = readFileSync('supabase/migrations/20261014150000_circle_notification_execute_hardening.sql', 'utf8');
const memberPreviewMigration = readFileSync('supabase/migrations/20261014160000_circle_discovery_member_previews.sql', 'utf8');
const reachEnforcementMigration = readFileSync('supabase/migrations/20261014170000_circle_reach_discovery_enforcement.sql', 'utf8');
const multiSegmentReachMigration = readFileSync('supabase/migrations/20261014180000_circle_multi_segment_reach.sql', 'utf8');
const circleComposer = readFileSync('features/studio/circles/CircleComposer.tsx', 'utf8');
const circleLocationPickers = readFileSync('features/studio/circles/CircleAudienceLocationPickers.tsx', 'utf8');
const circleLiveHook = readFileSync('features/live/hooks/use-circle-live.ts', 'utf8');
const pulseStore = readFileSync('lib/offline/circle-pulse-store.ts', 'utf8');
const circlesHome = readFileSync('app/(tabs)/explore.tsx', 'utf8');

test('Circle reach and access remain independent with legacy compatibility', () => {
  assert.deepEqual(resolveLegacyCircleAudience({
    visibility_scope: 'diaspora',
    visibility: 'private',
  }), {
    reachScope: 'diaspora',
    reachScopes: ['diaspora'],
    accessPolicy: 'invite_only',
  });
  assert.deepEqual(normalizeCountryCodeList('gh, GB gh invalid'), ['GH', 'GB']);
  assert.match(audienceMigration, /reach_scope in \('local', 'country', 'diaspora', 'global'\)/i);
  assert.match(audienceMigration, /access_policy in \('open', 'approval_required', 'invite_only'\)/i);
  assert.match(audienceMigration, /rpc_create_circle_request_v2/i);
  assert.match(audienceMigration, /rpc_update_circle_request_v2/i);
});

test('location targets discovery by default and only strict Circles enforce eligibility', () => {
  assert.match(joinMigration, /membership_eligibility_policy[\s\S]*'target_only'/i);
  assert.match(joinMigration, /coalesce\(v_circle\.membership_eligibility_policy, 'recommend_only'\)/i);
  assert.match(joinMigration, /create or replace function public\.rpc_join_circle\(p_circle_id uuid, p_profile_id uuid\)/i);
});

test('discoverable Circle Live exposes a safe preview but not room participation data', () => {
  assert.match(livePreviewMigration, /rpc_list_discoverable_circle_live_previews/i);
  assert.match(livePreviewMigration, /live_discovery_policy = 'discoverable_join_required'/i);
  assert.match(livePreviewMigration, /access_policy <> 'invite_only'/i);
  assert.doesNotMatch(livePreviewMigration, /stream_token|call_token|participant_token/i);
});

test('Circle notifications use internal producers and durable recipient state', () => {
  assert.match(executeHardeningMigration, /revoke all on function public\.enqueue_circle_pulse_push/i);
  assert.match(notificationMigration, /circle_member_notification_preferences/i);
  assert.match(notificationMigration, /circle_notification_campaigns/i);
  assert.match(notificationMigration, /circle_notification_deliveries/i);
  assert.match(notificationMigration, /for update of delivery skip locked/i);
  assert.match(notificationMigration, /attempt_count < 5/i);
  assert.match(notificationMigration, /rpc_list_my_circle_notifications_v1/i);
  assert.match(notificationMigration, /v_level = 'muted'/i);
});

test('private offline Circle data is account scoped', () => {
  assert.doesNotMatch(pulseStore, /buildLegacyCirclePulseSnapshotStoreKey/);
  assert.match(pulseStore, /if \(!viewerProfileId\)/);
  assert.match(circleLiveHook, /readCircleLiveSnapshotState\(circleId, accountId\)/);
  assert.match(circleLiveHook, /setSnapshot\(null\)/);
});

test('Circle discovery portraits use a bounded privacy-safe server projection', () => {
  assert.match(memberPreviewMigration, /rpc_list_circle_member_previews_v1/i);
  assert.match(memberPreviewMigration, /member\.is_visible is not false/i);
  assert.match(memberPreviewMigration, /profile\.account_state = 'active'/i);
  assert.match(memberPreviewMigration, /public\.blocks blocked/i);
  assert.match(memberPreviewMigration, /access_policy, 'open'\) <> 'invite_only'/i);
  assert.match(memberPreviewMigration, /visibility, 'public'\) <> 'private'/i);
  assert.match(memberPreviewMigration, /partition by candidate\.circle_id/i);
  assert.match(memberPreviewMigration, /where candidate\.avatar_url is not null/i);
  assert.match(memberPreviewMigration, /least\(greatest\(coalesce\(p_per_circle_limit, 3\), 1\), 3\)/i);
  assert.match(memberPreviewMigration, /profile\.avatar_url[\s\S]*profile\.hero_image_url[\s\S]*profile\.photos/i);
  assert.match(circlesHome, /rpc_list_circle_member_previews_v1/);
  assert.match(circlesHome, /profiles\(id,full_name,avatar_url,hero_image_url,photos\)/);
});

test('Circle member counts self-heal for every membership write path', () => {
  assert.match(memberPreviewMigration, /create or replace function public\.sync_circle_member_count_v1\(\)/i);
  assert.match(memberPreviewMigration, /after insert or delete on public\.circle_members/i);
  assert.match(memberPreviewMigration, /after update of circle_id, status on public\.circle_members/i);
  assert.match(memberPreviewMigration, /member\.status = 'active'/i);
  assert.match(memberPreviewMigration, /pg_advisory_xact_lock/i);
  assert.match(memberPreviewMigration, /revoke all on function public\.sync_circle_member_count_v1\(\)[\s\S]*authenticated, service_role/i);
});

test('Circle reach is a fail-closed server-owned discovery boundary', () => {
  assert.match(reachEnforcementMigration, /current_country_code/i);
  assert.match(reachEnforcementMigration, /origin_country_code/i);
  assert.match(reachEnforcementMigration, /candidate\.resolved_reach = 'global'/i);
  assert.match(reachEnforcementMigration, /candidate\.resolved_reach = 'country' and candidate\.same_country/i);
  assert.match(reachEnforcementMigration, /candidate\.resolved_reach = 'local' and candidate\.same_country and candidate\.same_city/i);
  assert.match(reachEnforcementMigration, /candidate\.resolved_reach = 'diaspora' and candidate\.diaspora_match/i);
  assert.match(reachEnforcementMigration, /access_policy, 'open'\) <> 'invite_only'/i);
  assert.doesNotMatch(reachEnforcementMigration, /viewer\.current_country_code = ''\s+or/i);
});

test('Circle multi-segment reach is additive and keeps legacy contracts', () => {
  assert.match(multiSegmentReachMigration, /add column if not exists reach_scopes text\[\]/i);
  assert.match(multiSegmentReachMigration, /rpc_create_circle_request_v3/i);
  assert.match(multiSegmentReachMigration, /rpc_update_circle_request_v3/i);
  assert.match(multiSegmentReachMigration, /'diaspora' = any\(candidate\.resolved_reaches\)/i);
  assert.match(multiSegmentReachMigration, /get_ranked_circles_for_profile\(uuid, text, integer\)/i);
  assert.doesNotMatch(multiSegmentReachMigration, /drop column/i);
});

test('Circle creation uses canonical country and locality pickers', () => {
  assert.match(circleComposer, /CircleCountryPickerModal/);
  assert.match(circleComposer, /CircleCityPickerModal/);
  assert.doesNotMatch(circleComposer, /accessibilityLabel="Country code"/);
  assert.doesNotMatch(circleComposer, /Diaspora origin country codes/);
  assert.match(circleLocationPickers, /getPrioritizedCountries/);
  assert.match(circleLocationPickers, /searchGlobalLocalities/);
  assert.match(circleLocationPickers, /countryCode/);
});
