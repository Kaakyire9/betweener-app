import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const board = readFileSync('components/circles/CirclePulseBoard.tsx', 'utf8');
const constellation = readFileSync('components/circles/CirclePulseWelcomeConstellation.tsx', 'utf8');
const portraitCard = readFileSync('components/circles/CircleMemberPortraitCard.tsx', 'utf8');
const portraitDirectory = readFileSync('components/circles/CircleMembersPortraitDirectory.tsx', 'utf8');
const welcomeStateHook = readFileSync('lib/circles/pulse/use-circle-pulse-welcome-state.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260905150000_circle_pulse_welcome_exposure_state.sql', 'utf8');

test('Circle Pulse is a stable vertical journal without nested carousel controls', () => {
  assert.match(board, /RIGHT NOW/);
  assert.doesNotMatch(board, /The clearest next step|PRIORITY/);
  assert.match(board, /CirclePulseWelcomeConstellation/);
  assert.match(board, /groups\.map/);
  assert.doesNotMatch(board, /AUTO_ADVANCE_MS|setInterval|Next Circle spotlight|Previous Circle spotlight/);
  assert.doesNotMatch(constellation, /Next new member|Previous new member/);
});

test('Love Seat keeps one dominant introduction action and hides management behind overflow', () => {
  assert.match(board, /Meet.*loveSeatName/);
  assert.match(board, /Send Signal/);
  assert.match(board, /dots-horizontal/);
  assert.doesNotMatch(board, />End feature<|>Leave Love Seat</);
});

test('Welcome Constellation exposes all recent members in a non-nested gallery', () => {
  assert.match(constellation, /Meet all/);
  assert.match(constellation, /FlatList/);
  assert.match(constellation, /New arrivals/);
  assert.match(constellation, /Welcome.*firstName/);
  assert.match(constellation, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(welcomeStateHook, /'impression'/);
  assert.match(welcomeStateHook, /profileIds\.slice\(0, 5\)/);
  assert.match(constellation, /CircleMemberPortraitCard/);
  assert.match(constellation, /numColumns=\{2\}/);
  assert.match(constellation, /galleryCell.*48\.35%/s);
  assert.match(constellation, /mediaPresentation="portrait-guarded"/);
  assert.match(portraitCard, /isPortraitHeroMediaSuitable/);
  assert.match(portraitCard, /MEDIA_PENDING_STYLE/);
  assert.match(board, /welcomeProfileLocationsById/);
  assert.doesNotMatch(constellation, /View profile<\/Text>/);
});

test('Circle members use a portrait-first conversation directory', () => {
  assert.match(portraitCard, /CONVERSATION LEAD/);
  assert.match(portraitDirectory, /selectDailyPortraitLead/);
  assert.match(portraitDirectory, /Open their answer/);
  assert.match(portraitCard, /contentFit="cover"/);
  assert.match(portraitCard, /conversationSpark/);
});

test('constellation motion is restrained and avatars settle after entrance', () => {
  assert.match(constellation, /outputRange: \['-10deg', '-6deg'\]/);
  assert.match(constellation, /outputRange: \['16deg', '20deg'\]/);
  assert.match(constellation, /outputRange: \[0\.94, 1\]/);
  assert.doesNotMatch(constellation, /352deg|-342deg/);
});

test('welcome exposure state is private, membership-scoped and Supabase-owned', () => {
  assert.match(migration, /create table if not exists public\.circle_pulse_welcome_views/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.circle_pulse_welcome_views from public, anon, authenticated/i);
  assert.match(migration, /profile\.user_id = auth\.uid\(\)/i);
  assert.match(migration, /public\.is_circle_member\(p_circle_id, auth\.uid\(\)\)/i);
  assert.match(migration, /welcome_member\.expires_at > v_now/i);
  assert.match(migration, /member\.is_visible is not false/i);
  assert.match(migration, /on conflict \(circle_id, viewer_profile_id, welcome_profile_id\)/i);
});

test('Live remains the server-backed priority hero and reuses authoritative quorum', () => {
  assert.match(board, /liveGatheringsById/);
  assert.match(board, /Upcoming Circle Live/);
  assert.match(board, /selectedLiveGathering\.quorumStatus/);
  assert.match(board, /selectedLiveGathering\.attendanceCount/);
  assert.match(board, /selectedLiveGathering\.viewerRsvpStatus === 'going'/);
});
