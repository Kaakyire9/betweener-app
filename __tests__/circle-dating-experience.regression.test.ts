import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260830160000_circle_dating_discovery.sql', 'utf8');
const circleScreen = readFileSync('app/circles/[id].tsx', 'utf8');
const circlesHome = readFileSync('app/(tabs)/explore.tsx', 'utf8');
const datingPanel = readFileSync('features/circles/components/CircleDatingPanel.tsx', 'utf8');
const datingHook = readFileSync('features/circles/hooks/use-circle-dating.ts', 'utf8');
const homeCards = readFileSync('components/circles/CirclesHomeCards.tsx', 'utf8');

test('Circle detail presents the three-destination mental model', () => {
  assert.match(circleScreen, /\['circle', 'Circle'\]/);
  assert.match(circleScreen, /\['discover', 'Discover'\]/);
  assert.match(circleScreen, /\['live', 'Live'\]/);
  assert.doesNotMatch(circleScreen, /\['connections', 'Connections'\]/);
  assert.doesNotMatch(circleScreen, /mode="connections"/);
  assert.match(circleScreen, /resolveRequestedTab/);
  assert.match(circleScreen, /value === 'connections'\) return 'discover'/);
  assert.match(circleScreen, /value === 'community'[\s\S]*value === 'members'[\s\S]*return 'circle'/);
});

test('Circle home uses editorial previews instead of permanent community tabs', () => {
  assert.match(circleScreen, /circleSection === 'home'/);
  assert.match(circleScreen, /PROMPT OF THE WEEK/);
  assert.match(circleScreen, />UPCOMING</);
  assert.match(circleScreen, />MOMENTS</);
  assert.match(circleScreen, />PEOPLE</);
  assert.doesNotMatch(circleScreen, /\['pulse', 'Pulse'\]/);
  assert.doesNotMatch(circleScreen, /styles\.communityTabs/);
});

test('Circle dating discovery requires explicit per-Circle consent', () => {
  assert.match(migration, /create table if not exists public\.circle_dating_preferences/i);
  assert.match(migration, /opted_in boolean not null default false/i);
  assert.match(migration, /preference\.opted_in[\s\S]*preference\.open_to_intents/i);
  assert.match(datingPanel, /MEET THROUGH SOMETHING YOU ALREADY SHARE/);
  assert.match(datingPanel, /Start discovering/);
  assert.match(datingPanel, /Your participation is private/);
  assert.match(datingPanel, /You can pause anytime/);
});

test('candidate discovery is Circle-scoped and server-authoritative', () => {
  assert.match(migration, /rpc_get_circle_dating_candidates/i);
  assert.match(migration, /member\.circle_id = p_circle_id/i);
  assert.match(migration, /public\.blocks/i);
  assert.match(migration, /public\.matches/i);
  assert.match(migration, /public\.intent_requests/i);
  assert.match(migration, /age_preference_confirmed_at/i);
  assert.match(datingHook, /rpc_get_circle_dating_candidates/);
});

test('Circle dating reuses intents, matches, chats and preserves match origin', () => {
  assert.match(datingPanel, />Intent</);
  assert.match(circleScreen, /onSendIntent={handleMemberConnection}/);
  assert.match(circleScreen, /onOpenChat={openMatchedMemberChat}/);
  assert.match(migration, /create table if not exists public\.match_origins/i);
  assert.match(migration, /capture_circle_match_origin/i);
  assert.doesNotMatch(migration, /create table if not exists public\.circle_(matches|chats)/i);
});

test('Circles home separates joined spaces from finding new Circles', () => {
  assert.match(circlesHome, /\['mine', 'My Circles'\]/);
  assert.match(circlesHome, /\['find', 'Find Circles'\]/);
  assert.match(circlesHome, /homeMode === 'mine' \? joinedCirclesSection/);
  assert.match(circlesHome, /homeMode === 'find' \? <View style={styles\.discoveryBanner}>/);
});

test('the main Circle card joins directly and continues active members into Circle entry', () => {
  assert.match(homeCards, /event\.stopPropagation\(\)/);
  assert.match(circlesHome, /const membershipStatus = String\(data/);
  assert.match(circlesHome, /setDiscoverCircles\(\(current\) => current\.filter/);
  assert.match(circlesHome, /setMyCircles\(\(current\) =>/);
  assert.match(circlesHome, /if \(!requiresApproval\)[\s\S]*pathname: '\/circles\/\[id\]'/);
});

test('Circle owners and stewards reach management from the overflow', () => {
  assert.match(circleScreen, /canReviewMembers \|\| canEditCircle \|\| canModerateCircle/);
  assert.match(circleScreen, /Circle settings and stewardship/);
  assert.match(circleScreen, /setActiveTab\('manage'\)/);
  assert.doesNotMatch(circleScreen, /accessibilityLabel="Manage Circle members"/);
});

test('ordinary members regain a read-only People experience', () => {
  const publicMemberRenderer = circleScreen.slice(
    circleScreen.indexOf('const renderCommunityMember'),
    circleScreen.indexOf('const renderLeader'),
  );
  assert.match(circleScreen, /circleSection === 'members'/);
  assert.match(circleScreen, /People you share this Circle with/);
  assert.match(circleScreen, /context: 'circle-community'/);
  assert.match(publicMemberRenderer, /openProfile\(member\.id\)/);
  assert.doesNotMatch(publicMemberRenderer, /handleMemberConnection|openMemberManager|Roles/);
});

test('Circle navigation fits compact widths without horizontal scrolling', () => {
  assert.match(circleScreen, /<View style={styles\.tabRow} accessibilityRole="tablist">/);
  assert.match(circleScreen, /tabButton: \{[\s\S]*flex: 1,[\s\S]*minHeight: 44/);
  assert.match(circleScreen, /accessibilityLabel="Open Circle home"|Open Circle home/);
  assert.match(circleScreen, /Discover people in this Circle/);
  assert.match(circleScreen, /Open Circle Live/);
});
