import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const migration = read('../supabase/migrations/20260913221500_live_room_level_safety_reports.sql');
const circleIntroductionsMigration = read('../supabase/migrations/20260913224500_live_circle_introductions.sql');
const stageOverlayMigration = read('../supabase/migrations/20260913232000_live_stage_overlay_orchestration.sql');
const liveScreen = read('../app/live/[sessionId].tsx');
const liveRepository = read('../features/live/application/live-repository.ts');
const compactHeader = read('../features/live/components/LiveCompactHeader.tsx');
const preferences = read('../features/live/components/LiveAudiencePreferences.tsx');
const safetySheet = read('../features/live/components/LiveSafetyReportSheet.tsx');
const conversationPanel = read('../features/live/components/LiveConversationPanel.tsx');
const chemistryOverlay = read('../features/live/components/LiveChemistryOverlay.tsx');
const hostedMatchingPanel = read('../features/live/components/LiveHostedMatchingPanel.tsx');
const memberSummary = read('../features/live/components/LiveMemberSummaryModal.tsx');
const memberActions = read('../features/live/application/live-member-actions.ts');

test('room reports use the guarded safety RPC without impersonating a participant report', () => {
  assert.match(migration, /drop constraint if exists live_reports_target_valid/i);
  assert.match(migration, /add constraint live_reports_target_consistent/i);
  assert.match(migration, /target_comment_id is null or target_user_id is not null/i);
  assert.match(liveRepository, /async reportLive\(/);
  assert.match(liveRepository, /p_details: 'Room-level Live report'/);
  assert.match(liveRepository, /p_target_user_id: null/);
  assert.match(liveRepository, /p_target_comment_id: null/);
});

test('every eligible non-host has a persistent private Live safety entry point', () => {
  assert.match(liveScreen, /const canReportLive = !isRoomHost/);
  assert.match(liveScreen, /snapshot\?\.capabilities\.includes\('live\.report'\)/);
  assert.match(liveScreen, /onOpenSafety=\{canReportLive \? \(\) => setSafetyReportOpen\(true\)/);
  assert.match(liveScreen, /<LiveSafetyReportSheet/);
  assert.match(compactHeader, /accessibilityLabel="Report this Live"/);
  assert.match(compactHeader, /<ShieldAlert/);
  assert.match(safetySheet, /Your report is never shown in the room/);
  assert.match(safetySheet, /PRIVATE SAFETY REPORT/);
  assert.match(safetySheet, /flexDirection: 'row', flexWrap: 'wrap'/);
  assert.match(safetySheet, /reasonWide:\s*\{ flexBasis: '100%' \}/);
});

test('public Live members expose private report and app-wide block controls', () => {
  assert.match(liveRepository, /async reportParticipant\(/);
  assert.match(liveRepository, /p_details: 'Live participant report'/);
  assert.match(liveRepository, /p_target_user_id: targetUserId/);
  assert.match(memberActions, /async function blockLiveMember/);
  assert.match(memberActions, /supabase\.from\('blocks'\)\.insert/);
  assert.match(memberSummary, /accessibilityLabel=\{`Report \$\{name\}`\}/);
  assert.match(memberSummary, /accessibilityLabel=\{`Block \$\{name\}`\}/);
  assert.match(liveScreen, /controller\.reportParticipant\(safetyReportTarget\.userId, reason\)/);
  assert.match(liveScreen, /blockLiveMember\(\{/);
});

test('introduction consent is explicit once and then retires from the stage layout', () => {
  assert.match(liveScreen, /const supportsIntroductions = snapshot\?\.session\.format === 'hosted_match_night'/);
  assert.match(liveScreen, /snapshot\?\.session\.format === 'circle_live'/);
  assert.match(liveScreen, /const introductionPreferenceRequired = Boolean/);
  assert.match(liveScreen, /me\.introductionPreferenceDecidedAt == null/);
  assert.match(liveScreen, /styles\.stageTopOverlay/);
  assert.doesNotMatch(liveScreen, /<LiveCompactHeader[\s\S]{0,800}<LiveAudiencePreferences/);
  assert.match(liveScreen, /presentation="compact"/);
  assert.match(preferences, /presentation\?: 'chip' \| 'compact'/);
  assert.match(preferences, /preferenceDecided\?: boolean/);
  assert.match(preferences, /title="Open to introductions"/);
  assert.match(preferences, /This never puts you on stage/);
  assert.match(circleIntroductionsMigration, /format not in \('hosted_match_night','circle_live'\)/);
  assert.doesNotMatch(circleIntroductionsMigration, /'quick_connect'/);
  assert.match(stageOverlayMigration, /introduction_preference_decided_at timestamptz/);
  assert.match(stageOverlayMigration, /set open_to_introductions = p_open,[\s\S]*introduction_preference_decided_at = timezone/);
});

test('Live notices and introductions overlay the stage without becoming flex siblings', () => {
  assert.match(liveScreen, /style=\{\[styles\.stageTopOverlay, \{ top: stageOverlayTopInset \}\]\}/);
  assert.match(liveScreen, /presentation="overlay"/);
  assert.match(liveScreen, /style=\{\[styles\.stageBottomOverlay, \{ bottom: stageOverlayBottomInset \}\]\}/);
  assert.match(liveScreen, /conversationGlassStageOverlay/);
  assert.match(hostedMatchingPanel, /const hasPrivateRoundNotice = Boolean/);
  assert.match(hostedMatchingPanel, /!privateSparkCard && !hasPrivateRoundNotice/);
});

test('public pairing formation is replay-safe for every Live viewer', () => {
  assert.match(stageOverlayMigration, /latest_hosted_pair_formation/);
  assert.match(stageOverlayMigration, /introduction_started_at is not null/);
  assert.match(stageOverlayMigration, /interval '20 seconds'/);
  assert.match(liveScreen, /privateActivity\.snapshot\?\.latestHostedPairFormation/);
  assert.match(liveScreen, /<LivePairFormationCelebration/);
});

test('Chemistry First keeps its reveal action above device navigation chrome', () => {
  assert.match(chemistryOverlay, /useSafeAreaInsets/);
  assert.match(chemistryOverlay, /paddingBottom: Math\.max\(insets\.bottom, 28\)/);
});

test('standard Room Pulse keeps a curated, readable note preview', () => {
  assert.match(conversationPanel, /comments\.slice\(-2\)/);
  assert.match(conversationPanel, /numberOfLines=\{compact \? 2 : undefined\}/);
  assert.match(conversationPanel, /commentCompact:\s*\{ fontSize: 12, lineHeight: 17 \}/);
  assert.match(conversationPanel, /commentAvatarShellCompact:\s*\{ width: 24, height: 24/);
  assert.match(conversationPanel, /input:\s*\{[^}]*height: 42/);
});
