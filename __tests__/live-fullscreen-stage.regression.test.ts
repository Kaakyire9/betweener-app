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
const broadcastViewport = readFileSync(
  new URL('../features/live/stage/live-broadcast-viewport.ts', import.meta.url),
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
const quickConnectStage = readFileSync(
  new URL('../features/live/components/LiveQuickConnectStage.tsx', import.meta.url),
  'utf8',
);
const participantTile = readFileSync(
  new URL('../features/live/components/LiveStageParticipantTile.tsx', import.meta.url),
  'utf8',
);
const stageAtmosphere = readFileSync(
  new URL('../features/live/components/LiveStageAtmosphere.tsx', import.meta.url),
  'utf8',
);
const stageSeams = readFileSync(
  new URL('../features/live/components/LiveStageSeamLayer.tsx', import.meta.url),
  'utf8',
);
const privateStageSeam = readFileSync(
  new URL('../features/live/components/LivePrivateStageSeam.tsx', import.meta.url),
  'utf8',
);
const programTransition = readFileSync(
  new URL('../features/live/components/LiveProgramTransition.tsx', import.meta.url),
  'utf8',
);
const speakerFocus = readFileSync(
  new URL('../features/live/stage/live-speaker-focus.ts', import.meta.url),
  'utf8',
);
const liveVisualTokens = readFileSync(
  new URL('../features/live/components/live-visual-tokens.ts', import.meta.url),
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

test('solo Host owns the full page while structured scenes use the measured Stage canvas', () => {
  assert.match(liveScreen, /stageBackground:\s*\{\s*position: 'absolute', top: 0, right: 0, left: 0/);
  assert.match(liveScreen, /fullStageBackground:\s*\{\s*bottom: 0\s*\}/);
  assert.match(liveScreen, /const isFullPageSoloHost = !isQuickConnectLive/);
  assert.match(liveScreen, /snapshot\?\.stage\.length === 1/);
  assert.match(liveScreen, /snapshot\.stage\[0\]\?\.role === 'host'/);
  assert.match(liveScreen, /isStudioPresentationScene\(liveProgram\.state\.program\.scene\)/);
  assert.match(liveScreen, /!programUsesStructuredStage/);
  assert.match(liveScreen, /isPictureInPicture \|\| isFullPageSoloHost \? \([\s\S]*styles\.stageBackground, styles\.fullStageBackground/);
  assert.match(liveScreen, /isFullPageSoloHost[\s\S]*<View pointerEvents="none" style=\{styles\.fullPageHostStageSpace\}/);
  assert.match(liveScreen, /<View style=\{styles\.adaptiveStage\}>[\s\S]*renderMediaStage\(\)/);
  assert.match(liveScreen, /fullPageHostStageSpace:\s*\{ flex: 1, minHeight: 150/);
  assert.match(liveScreen, /adaptiveStage:\s*\{ flex: 1, minHeight: 150/);
  assert.match(liveScreen, /<LiveQuickConnectStage/);
  assert.doesNotMatch(liveScreen, /stageScrim|overlaySpacer/);
  assert.doesNotMatch(liveScreen, /style=\{\[styles\.stage, keyboardVisible/);
});

test('interactive Live chrome uses reusable glass surfaces', () => {
  assert.match(liveScreen, /<LiveCompactHeader/);
  assert.match(compactHeader, /<LiveGlassSurface[^>]+style=\{\[styles\.glass/);
  assert.match(liveScreen, /<LiveGlassSurface[\s\S]+styles\.conversationGlass/);
  assert.match(liveScreen, /<LiveControlDock/);
  assert.match(liveScreen, /<LiveStudioModal/);
  assert.doesNotMatch(liveScreen, /<LiveStageDesk/);
  assert.match(liveScreen, /variant="glass"/);
  assert.match(conversationPanel, /variant\?: 'solid' \| 'glass'/);
  assert.match(conversationPanel, /variant === 'glass' && styles\.panelGlass/);
});

test('full-screen presentation preserves deterministic one-to-four-person stage layouts', () => {
  assert.match(stage, /const isContainedStage = constrainMultiStage !== false/);
  assert.match(stage, /&& visualTileCount > 1/);
  assert.match(stage, /hasSoloStageChrome[\s\S]*<LiveStageAtmosphereBackdrop atmosphere=\{atmosphere\} overlay/);
  assert.match(stageAtmosphere, /if \(overlay\) \{[\s\S]*soloTopAura[\s\S]*soloBottomAura[\s\S]*soloEdgeFrame/);
  assert.match(stageAtmosphere, /cinematicTopScrim[\s\S]*cinematicBottomScrim/);
  assert.doesNotMatch(stageAtmosphere, /imageStyle=\{overlay/);
  assert.match(stage, /Math\.max\(1, Math\.min\(visibleRequestSeat\.seatCount, 3\)\)/);
  assert.match(stage, /participants\.length \+ visibleRequestSeats/);
  assert.match(stage, /Array\.from\(\{ length: visibleRequestSeats \}/);
  assert.match(stage, /fit="cover"/);
  assert.match(stage, /onLayout=\{handleStageLayout\}/);
  assert.match(stage, /liveStageTilePlacementForViewport/);
  assert.match(stage, /multiStageShell:\s*\{[\s\S]*top: 3[\s\S]*bottom: 3/);
  assert.doesNotMatch(stage, /dualStageShell/);
  assert.match(stage, /multiStageClip:\s*\{[\s\S]*overflow: 'hidden'[\s\S]*borderRadius: 24/);
  ['single', 'dual-left', 'dual-right', 'trio-lead-left', 'trio-top-right', 'quad-bottom-right'].forEach((placement) => {
    assert.match(stage, new RegExp(`['\"]?${placement}['\"]?`));
  });
});

test('stage management stays outside the public canvas in Live Studio', () => {
  assert.match(liveScreen, /const \[studioOpen, setStudioOpen\]/);
  assert.match(liveScreen, /openLiveStudio/);
  assert.match(liveScreen, /Live Studio/);
  assert.match(liveStudio, /presentationStyle="fullScreen"/);
  assert.match(liveStudio, /accessibilityLabel=\{microphoneEnabled \? 'Mute Host microphone' : 'Turn on Host microphone'\}/);
  assert.match(liveScreen, /microphoneControlEnabled=\{publicationReady\}/);
  assert.match(liveScreen, /onToggleMicrophone=\{\(\) => void media\.setAudioEnabled\(!media\.audioEnabled\)\}/);
  assert.match(liveStudio, /<LiveStageDesk/);
  assert.match(liveStudio, /presentation="studio"/);
  assert.match(liveStudio, /<LiveAudiencePulseCard/);
  assert.match(liveStudio, /<LiveHostedMatchingPanel/);
  assert.match(stageDesk, /STAGE DESK/);
  assert.match(stageDesk, /presentation\?: 'overlay' \| 'studio'/);
  assert.match(liveScreen, /resolveLiveRoomPulseHeight\(viewport\.height, roomPulseMode\)/);
  assert.match(compactHeader, /minHeight: 56/);
  assert.match(compactHeader, /hostAvatarUrl/);
  assert.match(compactHeader, /hostAvatarShell:[\s\S]*width: 46[\s\S]*height: 46/);
  assert.ok(
    compactHeader.indexOf('styles.hostAvatarShell') < compactHeader.indexOf('accessibilityLabel="Leave live room"'),
    'the enlarged host identity should remain clear while the exit action sits at the top-right',
  );
  assert.match(liveScreen, /snapshot\?\.stage\.find\(\(participant\) => participant\.role === 'host'\)/);
  assert.match(liveScreen, /tileFooterInset=\{stageFooterInset\}/);
  assert.match(liveScreen, /roomPulseHeight \+ safeAreaInsets\.bottom/);
});

test('Room Pulse has responsive peek, standard, and expanded snap states', () => {
  assert.match(liveScreen, /useState<LiveRoomPulseMode>/);
  assert.match(liveScreen, /initialLiveRoomPulseMode\(viewport\.width, viewport\.height\)/);
  assert.match(liveScreen, /displayMode=\{roomPulseMode\}/);
  assert.match(liveScreen, /onDisplayModeChange=\{setRoomPulseMode\}/);
  assert.match(liveScreen, /viewport\.width > viewport\.height\) setRoomPulseMode\('peek'\)/);
  assert.match(broadcastViewport, /\['peek', 'standard', 'expanded'\]/);
  assert.match(broadcastViewport, /viewportHeight < 720 \|\| viewportWidth > viewportHeight \? 'peek' : 'standard'/);
  assert.match(broadcastViewport, /mode === 'expanded'[\s\S]*safeHeight \* 0\.44/);
  assert.match(conversationPanel, /comments\.slice\(-2\)/);
  assert.match(conversationPanel, /displayMode === 'peek'/);
  assert.match(conversationPanel, /const nextDisplayMode: LiveRoomPulseMode/);
  assert.equal((conversationPanel.match(/style=\{styles\.expandButton\}/g) ?? []).length, 0);
  assert.match(conversationPanel, /presentation="trigger"/);
  assert.doesNotMatch(conversationPanel, /presentation="compact"/);
  assert.match(conversationPanel, /Minimize Room Pulse/);
  assert.match(conversationPanel, /Expand Room Pulse/);
  assert.match(liveScreen, /roomPulseMode === 'expanded'[\s\S]{0,160}conversationGlassStageOverlay/);
  assert.match(liveScreen, /conversationGlassStageOverlay:\s*\{[\s\S]*position: 'absolute'/);
});

test('Quick Connect always gives the host and pool equal stage space', () => {
  assert.match(quickConnectStage, /hostPane:\s*\{[\s\S]*?flex: 1/);
  assert.match(quickConnectStage, /poolPane:\s*\{[\s\S]*?flex: 1/);
  assert.doesNotMatch(quickConnectStage, /compactPool|poolPaneCompact/);
  assert.doesNotMatch(liveScreen, /compactPool=/);
  assert.match(liveScreen, /allowAtmosphereFraming=\{!isQuickConnectLive\}/);
  assert.match(stage, /allowAtmosphereFraming !== false/);
  assert.match(liveScreen, /quickConnectConversationGlass:\s*\{ flexShrink: 0 \}/);
  assert.doesNotMatch(liveScreen, /quickConnectConversationGlass:\s*\{[^}]*height:/);
});

test('Live surfaces inherit official light and dark brand themes', () => {
  assert.match(liveVisualTokens, /Colors\.light\.background/);
  assert.match(liveVisualTokens, /Colors\.dark\.background/);
  assert.match(liveVisualTokens, /Colors\.light\.accent/);
  assert.match(liveVisualTokens, /Colors\.dark\.accent/);
  assert.match(liveVisualTokens, /useColorScheme\(\)/);
  assert.match(liveVisualTokens, /surfaceSoft: '#18312F'/);
  assert.match(liveVisualTokens, /borderStrong: '#5BC1BB52'/);
  assert.match(liveVisualTokens, /text: Colors\.light\.backgroundSubtle/);
  assert.doesNotMatch(liveScreen, /#D7B56D/i);
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
  assert.match(stage, /useStableLiveSpeakerFocus/);
  assert.match(stage, /editorialFocus=\{userId === focusedSpeakerUserId\}/);
  assert.match(participantTile, /identityLabel/);
  assert.match(speakerFocus, /LIVE_SPEAKER_MINIMUM_HOLD_MS = 2_400/);
  assert.match(speakerFocus, /LIVE_SPEAKER_RELEASE_DELAY_MS = 1_400/);
  assert.doesNotMatch(participantTile, /key=\{[^}]*isSpeaking/);
});

test('multi-person tiles keep identity singular and surface only actionable connection health', () => {
  const cameraFallback = participantTile.match(
    /const CameraOffFallback[\s\S]*?export const LiveStageParticipantTile/,
  )?.[0] ?? '';

  assert.doesNotMatch(cameraFallback, /fallbackName|cameraOffPill|Camera off/);
  assert.match(participantTile, /cameraOn \? 'Camera on' : 'Camera off'/);
  assert.doesNotMatch(participantTile, /<CameraOff(?:\s|\/|>)/);
  assert.match(participantTile, /namePillSheen/);
  assert.match(participantTile, /mutedBadge/);
  assert.match(participantTile, /statusDivider/);
  assert.match(participantTile, /compactFallback/);
  assert.match(participantTile, /fallbackGlowCompact/);
  assert.match(
    participantTile,
    /connectionQuality === SfuModels\.ConnectionQuality\.POOR[\s\S]*<SignalLow/,
  );
  assert.doesNotMatch(participantTile, /connectionBars|signalBarActive|signalBarInactive/);
  assert.match(stage, /multiStageShell:\s*\{[\s\S]*borderWidth: 0/);
  assert.match(stage, /privateMultiStageShell:\s*\{[\s\S]*borderWidth: 1/);
});

test('public stage partitions use layout-aware luminous seams instead of nested tile borders', () => {
  assert.match(stage, /<LiveStageSeamLayer/);
  assert.match(stage, /focusedIndex=\{focusedSpeakerIndex\}/);
  assert.match(stageSeams, /tileCount === 2[\s\S]*'50%'/);
  assert.match(stageSeams, /tileCount === 3 && portraitTrio/);
  assert.match(stageSeams, /'56%'/);
  assert.match(stageSeams, /tileCount >= 4/);
  assert.match(stageSeams, /activeSeamsFor/);
  assert.match(stageSeams, /useReduceMotion/);
  assert.match(stageSeams, /junctionGem/);
});

test('authoritative Program transitions become motion-safe audience choreography', () => {
  assert.match(liveScreen, /<LiveProgramTransition program=\{liveProgram\.state\?\.program \?\? null\}/);
  assert.match(programTransition, /program\.transition === 'fade'/);
  assert.match(programTransition, /program\.transition === 'cut'/);
  assert.match(programTransition, /program\?\.programVersion/);
  assert.match(programTransition, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(programTransition, /pointerEvents="none"/);
  assert.match(programTransition, /ODO DIRECTOR/);
  assert.match(programTransition, /BETWEENER STUDIO/);
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
  assert.match(privateSparkRoute, /<BetweenerLoader/);
  assert.match(privateSparkRoute, /usePrivateSparkChrome/);
  assert.doesNotMatch(privateSparkRoute, /<LiveReaction(?:Picker|BurstLayer|SummaryChip)/);
  assert.doesNotMatch(privateSparkRoute, /PRIVATE · ENCRYPTED IN TRANSIT/);
  assert.match(privateSparkOverlays, /Media is encrypted in transit\./);
  assert.match(privateSparkChrome, /Only you two/);
  assert.match(privateSparkChrome, /End Spark/);
  assert.match(privateSparkChrome, /useLiveVisualTheme/);
  assert.match(stage, /<LivePrivateStageSeam/);
  assert.doesNotMatch(stage, /privateDivider/);
  assert.match(privateStageSeam, /LinearGradient/);
  assert.match(privateStageSeam, /D8C7F766/);
});
