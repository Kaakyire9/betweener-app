import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const liveScreen = readFileSync(
  new URL('../app/live/[sessionId].tsx', import.meta.url),
  'utf8',
);
const conversationPanel = readFileSync(
  new URL('../features/live/components/LiveConversationPanel.tsx', import.meta.url),
  'utf8',
);
const memberSummary = readFileSync(
  new URL('../features/live/components/LiveMemberSummaryModal.tsx', import.meta.url),
  'utf8',
);
const sessionController = readFileSync(
  new URL('../features/live/hooks/use-live-session-controller.ts', import.meta.url),
  'utf8',
);
const stage = readFileSync(
  new URL('../features/live/components/StreamLiveStage.tsx', import.meta.url),
  'utf8',
);
const compactHeader = readFileSync(
  new URL('../features/live/components/LiveCompactHeader.tsx', import.meta.url),
  'utf8',
);
const stageDesk = readFileSync(
  new URL('../features/live/components/LiveStageDesk.tsx', import.meta.url),
  'utf8',
);
const liveStudio = readFileSync(
  new URL('../features/live/components/LiveStudioModal.tsx', import.meta.url),
  'utf8',
);
const participantTile = readFileSync(
  new URL('../features/live/components/LiveStageParticipantTile.tsx', import.meta.url),
  'utf8',
);
const privateSparkRoute = readFileSync(
  new URL('../app/live/private-spark/[privateSparkId].tsx', import.meta.url),
  'utf8',
);
const privateSparkChrome = readFileSync(
  new URL('../features/live/components/LivePrivateSparkChrome.tsx', import.meta.url),
  'utf8',
);
const privateSparkOverlays = readFileSync(
  new URL('../features/live/components/LivePrivateSparkOverlays.tsx', import.meta.url),
  'utf8',
);

test('public Live stage owns the full viewport behind safe-area chrome', () => {
  assert.match(liveScreen, /stageBackground:\s*\{\s*position: 'absolute', top: 0, right: 0, left: 0/);
  assert.match(liveScreen, /fullStageBackground:\s*\{\s*bottom: 0\s*\}/);
  assert.match(
    liveScreen,
    /!isQuickConnectLive \|\| isPictureInPicture[\s\S]*?styles\.stageBackground, styles\.fullStageBackground/,
  );
  assert.match(liveScreen, /<LiveQuickConnectStage/);
  assert.match(liveScreen, /<LinearGradient[\s\S]+style=\{styles\.stageScrim\}/);
  assert.doesNotMatch(liveScreen, /style=\{\[styles\.stage, keyboardVisible/);
});

test('interactive Live chrome uses reusable glass surfaces', () => {
  assert.match(liveScreen, /<LiveCompactHeader/);
  assert.match(compactHeader, /<LiveGlassSurface[^>]+style=\{styles\.glass\}/);
  assert.match(liveScreen, /<LiveGlassSurface[\s\S]+styles\.conversationGlass/);
  assert.match(liveScreen, /<LiveControlDock/);
  assert.match(liveScreen, /<LiveStudioModal/);
  assert.doesNotMatch(liveScreen, /<LiveStageDesk/);
  assert.match(liveScreen, /variant="glass"/);
  assert.match(conversationPanel, /variant\?: 'solid' \| 'glass'/);
  assert.match(conversationPanel, /variant === 'glass' && styles\.panelGlass/);
});

test('full-screen presentation preserves deterministic one-to-four-person stage layouts', () => {
  assert.match(stage, /visualTileCount > 1 && constrainMultiStage !== false/);
  assert.match(stage, /Math\.max\(1, Math\.min\(visibleRequestSeat\.seatCount, 3\)\)/);
  assert.match(stage, /participants\.length \+ visibleRequestSeats/);
  assert.match(stage, /Array\.from\(\{ length: visibleRequestSeats \}/);
  assert.match(stage, /fit="cover"/);
  assert.match(stage, /multiStageShell:\s*\{[\s\S]*top: '13%'[\s\S]*bottom: '34%'/);
  assert.match(stage, /dualStageShell:\s*\{[\s\S]*top: '18%'[\s\S]*bottom: '38%'/);
  assert.match(stage, /multiStageClip:\s*\{[\s\S]*overflow: 'hidden'[\s\S]*borderRadius: 24/);
  ['single', 'dual-left', 'dual-right', 'trio-lead', 'quad-bottom-right'].forEach((placement) => {
    assert.match(stage, new RegExp(`['\"]?${placement}['\"]?`));
  });
});

test('stage management stays outside the public canvas in Live Studio', () => {
  assert.match(liveScreen, /const \[studioOpen, setStudioOpen\]/);
  assert.match(liveScreen, /openLiveStudio/);
  assert.match(liveScreen, /Live Studio/);
  assert.match(liveStudio, /presentationStyle="fullScreen"/);
  assert.match(liveStudio, /<LiveStageDesk/);
  assert.match(liveStudio, /presentation="studio"/);
  assert.match(liveStudio, /<LiveAudiencePulseCard/);
  assert.match(liveStudio, /<LiveHostedMatchingPanel/);
  assert.match(stageDesk, /STAGE DESK/);
  assert.match(stageDesk, /presentation\?: 'overlay' \| 'studio'/);
  assert.match(liveScreen, /height: '27%'/);
  assert.match(compactHeader, /minHeight: 56/);
  assert.match(compactHeader, /hostAvatarUrl/);
  assert.match(compactHeader, /hostAvatarShell:[\s\S]*width: 46[\s\S]*height: 46/);
  assert.ok(
    compactHeader.indexOf('styles.hostAvatarShell') < compactHeader.indexOf('accessibilityLabel="Leave live room"'),
    'the enlarged host identity should remain clear while the exit action sits at the top-right',
  );
  assert.match(liveScreen, /snapshot\?\.stage\.find\(\(participant\) => participant\.role === 'host'\)/);
});

test('Room Pulse is calm by default and expands only on request', () => {
  assert.match(liveScreen, /roomPulseExpanded/);
  assert.match(liveScreen, /expanded=\{roomPulseExpanded\}/);
  assert.match(liveScreen, /onExpandedChange=\{setRoomPulseExpanded\}/);
  assert.match(conversationPanel, /comments\.slice\(-3\)/);
  assert.match(conversationPanel, /presentation="trigger"/);
  assert.doesNotMatch(conversationPanel, /presentation="compact"/);
  assert.match(conversationPanel, /accessibilityLabel=\{expanded \? 'Collapse Room Pulse' : 'Expand Room Pulse'\}/);
});

test('Room Pulse briefly announces arrivals and member avatars open private actions', () => {
  assert.match(sessionController, /\(event\) => void announceParticipantJoin\(event\)/);
  assert.match(sessionController, /isFreshLiveParticipantArrival\(event\)/);
  assert.match(sessionController, /isActiveLiveParticipantState\(member\.participantState\)/);
  assert.match(sessionController, /setTimeout\(\(\) => \{/);
  assert.match(sessionController, /\}, 3600\)/);
  assert.match(conversationPanel, /joinNotice\?: LiveJoinNotice \| null/);
  assert.match(conversationPanel, /onOpenMember\?: \(member: LiveMemberPreview\) => void/);
  assert.match(conversationPanel, /\{joinNotice\.fullName \|\| 'A member'\}<\/Text> joined/);
  assert.match(conversationPanel, /accessibilityLabel=\{`View \$\{comment\.fullName \|\| 'member'\}`\}/);
  assert.match(memberSummary, /Request/);
  assert.match(memberSummary, /Liked/);
  assert.match(memberSummary, /Nothing is announced to the room/);
});

test('active-speaker treatment is motion-safe and never remounts native video', () => {
  assert.match(participantTile, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(participantTile, /reduceMotionChanged/);
  assert.match(participantTile, /<Animated\.View[^>]+styles\.focusFrame/);
  assert.match(participantTile, /footerInset/);
  assert.doesNotMatch(participantTile, /key=\{[^}]*isSpeaking/);
});

test('Private Spark reuses the secure media path with adaptive luxury chrome', () => {
  assert.match(privateSparkRoute, /presentation="private_spark"/);
  assert.match(privateSparkRoute, /constrainMultiStage/);
  assert.match(stage, /privateMultiStageShell:\s*\{[\s\S]*top: '18%'[\s\S]*bottom: '20%'/);
  assert.match(stage, /privateDualStageShell:\s*\{[\s\S]*top: '27%'[\s\S]*bottom: '31%'/);
  assert.doesNotMatch(privateSparkRoute, /tileFooterInset=/);
  assert.match(privateSparkRoute, /<LivePrivateSparkHeader/);
  assert.match(privateSparkRoute, /const requestLeave = useCallback\(\(\) => \{[\s\S]*setEndSheetVisible\(true\)/);
  assert.match(privateSparkRoute, /onLeave=\{requestLeave\}/);
  assert.match(privateSparkRoute, /<LivePrivateSparkControlDock/);
  assert.match(privateSparkRoute, /<LivePrivateSparkEntryMoment/);
  assert.match(privateSparkRoute, /usePrivateSparkChrome/);
  assert.doesNotMatch(privateSparkRoute, /PRIVATE · ENCRYPTED IN TRANSIT/);
  assert.match(privateSparkOverlays, /Media is encrypted in transit\./);
  assert.match(privateSparkChrome, /Only you two/);
  assert.match(privateSparkChrome, /End Spark/);
});
