import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260831100000_circle_contextual_discovery_engine.sql', 'utf8');
const homePicksMigration = readFileSync('supabase/migrations/20260831113000_circle_home_picks.sql', 'utf8');
const pickRotationMigration = readFileSync('supabase/migrations/20260831233000_circle_home_pick_rotation.sql', 'utf8');
const circleScreen = readFileSync('app/circles/[id].tsx', 'utf8');
const circlesHome = readFileSync('app/(tabs)/explore.tsx', 'utf8');
const profileScreen = readFileSync('app/profile-view.tsx', 'utf8');
const profileActions = readFileSync('components/profile/ProfileViewActions.tsx', 'utf8');
const entrySheet = readFileSync('features/circles/components/CircleEntryContextSheet.tsx', 'utf8');
const homeCards = readFileSync('components/circles/CirclesHomeCards.tsx', 'utf8');
const constellation = readFileSync('components/circles/CirclePicksConstellation.tsx', 'utf8');
const liveGateway = readFileSync('features/live/components/CirclesLiveGateway.tsx', 'utf8');
const premiumTabBar = readFileSync('components/navigation/PremiumBottomTabBar.tsx', 'utf8');

test('Circle entry context is private, optional, and distinct from dating consent', () => {
  assert.match(migration, /create table if not exists public\.circle_member_context/i);
  assert.match(migration, /circle_member_context_select_own/i);
  assert.match(migration, /p_skip boolean default false/i);
  assert.match(entrySheet, /Joining this Circle never opts you in/);
  assert.match(entrySheet, /Skip for now/);
  assert.match(circleScreen, /CircleEntryContextSheet/);
});

test('romantic eligibility is centralized and enforced on every romantic write path', () => {
  assert.match(migration, /create or replace function public\.is_romantically_eligible/i);
  assert.match(migration, /enforce_intent_romantic_eligibility/);
  assert.match(migration, /enforce_signal_romantic_eligibility/);
  assert.match(migration, /enforce_swipe_romantic_eligibility/);
  assert.match(migration, /dating_not_eligible/);
  assert.match(migration, /age_preference_confirmed_at/);
  assert.match(migration, /public\.blocks/);
});

test('Circle discovery ranking is server-owned, normalized, contextual, and exposure-aware', () => {
  assert.match(migration, /global fit 70%, Circle affinity 30%/i);
  assert.match(migration, /nullif\(aw_intent\+aw_values/);
  assert.match(migration, /context_priorities/);
  assert.match(migration, /candidate_impression/);
  assert.match(migration, /interval '14 days'/);
  assert.doesNotMatch(migration, /returns table \([^)]*global_score/i);
});

test('community profiles remove romantic CTAs while Discover carries authorized context', () => {
  assert.match(circleScreen, /source: 'circle_people'[\s\S]*context: 'circle-community'/);
  assert.match(circleScreen, /source: 'circle_discover'[\s\S]*context: 'circle-discover'/);
  assert.match(profileScreen, /allowRomanticActions/);
  assert.match(profileActions, /allowRomanticActions \? \(/);
  assert.match(profileActions, /accessibilityLabel="Pass profile"/);
  assert.doesNotMatch(profileActions, /accessibilityLabel="Send Intent request"/);
  assert.match(profileScreen, />Request<\/Text>/);
  assert.match(profileScreen, /onActionComplete=\{handleBack\}/);
  assert.match(profileScreen, /circleId: contextCircleId/);
  assert.match(profileScreen, /source: 'circles', circle_id: contextCircleId/);
  assert.match(circlesHome, /source: 'circles_home'[\s\S]*context: 'circle-discover'[\s\S]*contextCircleId: item\.circleId/);
});

test('Circles home keeps Gatherings as its only priority module and restores private Picks', () => {
  assert.match(circlesHome, />What matters now</);
  assert.match(circlesHome, /hasGatheringPriority/);
  assert.match(circlesHome, /shouldFeatureLiveGathering/);
  assert.match(circlesHome, /\['online', 'virtual', 'livestream', 'live'\]/);
  assert.match(homeCards, /return 'In person'/);
  assert.match(circlesHome, />Relationship Gist</);
  assert.match(circlesHome, /<RelationshipGistCard/);
  assert.match(circlesHome, />Global guidance</);
  assert.match(circlesHome, /rpc_get_circle_home_picks/);
  assert.match(circlesHome, />Circle Picks</);
  assert.match(circlesHome, /<CirclePicksConstellation/);
  assert.ok(
    circlesHome.indexOf('>Circle Picks<') < circlesHome.indexOf('>Relationship Gist<'),
    'Circle Picks should precede Relationship Gist on My Circles',
  );
  assert.match(homeCards, /styles\.pickPortrait/);
  assert.match(constellation, /\(windowWidth - 60\) \/ 2/);
  assert.match(constellation, /remainingPickCount/);
  assert.match(constellation, /pickRailSingle/);
  assert.match(homeCards, /pickPortraitCopyCompact/);
  assert.match(homeCards, /compact \? pick\.circleName : `From \$\{pick\.circleName\}`/);
  assert.match(homeCards, /Meet \{firstName\}/);
  assert.match(constellation, /reduceMotion/);
  assert.match(constellation, /Your shared worlds are opening new introductions/);
  assert.match(premiumTabBar, /PREMIUM_TAB_DOCK_CONTENT_RESERVE/);
  assert.match(circlesHome, /paddingBottom: Math\.max\(136, insets\.bottom \+ PREMIUM_TAB_DOCK_CONTENT_RESERVE\)/);
  assert.doesNotMatch(circlesHome, />Today in your Circles</);
  assert.doesNotMatch(circlesHome, /onPress=\{\(\) => setHomeMode\('find'\)\}[\s\S]{0,160}Discover more Circles/);
  assert.doesNotMatch(liveGateway, /styles\.arrow/);
  assert.match(liveGateway, /featuredLive \? 'ENTER'/);
});

test('discovery telemetry stores no raw score or private preference payload', () => {
  assert.match(migration, /circle_discovery_events/);
  assert.match(migration, /jsonb_strip_nulls\(jsonb_build_object/);
  assert.doesNotMatch(migration, /'score', coalesce\(p_metadata/);
  assert.match(migration, /revoke all on table public\.circle_discovery_events from public, anon, authenticated/i);
});

test('Circle Picks aggregate opted-in shared Circles without exposing scores', () => {
  assert.match(homePicksMigration, /rpc_get_circle_home_picks/);
  assert.match(homePicksMigration, /viewer_preference\.opted_in/);
  assert.match(homePicksMigration, /candidate_preference\.opted_in/);
  assert.match(homePicksMigration, /is_romantically_eligible/);
  assert.match(homePicksMigration, /partition by shared\.candidate_id/);
  assert.match(homePicksMigration, /interval '14 days'/);
  assert.doesNotMatch(homePicksMigration, /returns table \([^)]*score/i);
  assert.match(pickRotationMigration, /max\(event_row\.created_at\) as last_impression_at/i);
  assert.match(pickRotationMigration, /interval '12 hours'/i);
  assert.match(pickRotationMigration, /last_impression_at asc nulls first/i);
  assert.match(circlesHome, /picks\.slice\(0, 2\)/);
});
