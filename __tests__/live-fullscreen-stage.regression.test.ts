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
const authoritativeProgramStage = readFileSync(
  new URL('../features/live/components/LiveAuthoritativeProgramStage.tsx', import.meta.url),
  'utf8',
);
const screenPresentationSurface = readFileSync(
  new URL('../features/live/components/LiveScreenPresentationSurface.tsx', import.meta.url),
  'utf8',
);
const screenAmbientBackdrop = readFileSync(
  new URL('../features/live/components/LiveScreenAmbientBackdrop.tsx', import.meta.url),
  'utf8',
);
const mobileProgrammePanel = readFileSync(
  new URL('../features/live/components/LiveMobileProgrammePanel.tsx', import.meta.url),
  'utf8',
);
const participantTile = readFileSync(
  new URL('../features/live/components/LiveStageParticipantTile.tsx', import.meta.url),
  'utf8',
);
const compactHeader = readFileSync(
  new URL('../features/live/components/LiveCompactHeader.tsx', import.meta.url),
  'utf8',
);
const controlDock = readFileSync(
  new URL('../features/live/components/LiveControlDock.tsx', import.meta.url),
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
  assert.match(liveScreen, /const isFullPageSoloHost = !isQuickConnectLive[\s\S]*&& !screenOnlyProgramActive/);
  assert.match(liveScreen, /const activeProgram = liveProgram\.state\?\.program \?\? null/);
  assert.match(liveScreen, /activeProgram != null[\s\S]*isStudioPresentationScene\(activeProgram\.scene\)/);
  assert.match(liveScreen, /!programUsesStructuredStage/);
  assert.match(liveScreen, /isPictureInPicture \|\| isFullPageSoloHost \? \([\s\S]*styles\.stageBackground, styles\.fullStageBackground/);
  assert.match(liveScreen, /isFullPageSoloHost[\s\S]*<View pointerEvents="none" style=\{styles\.fullPageHostStageSpace\}/);
  assert.match(liveScreen, /<View style=\{\[[\s\S]*styles\.adaptiveStage[\s\S]*renderMediaStage\(\)/);
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
  assert.match(liveScreen, /intensity=\{keyboardVisible \? 46 : roomPulseMode === 'expanded' \? 56 : 48\}/);
  assert.match(liveScreen, /colors=\{roomPulseBackdrop\.colors\}/);
  assert.match(liveScreen, /locations=\{roomPulseBackdrop\.locations\}/);
  assert.match(liveScreen, /style=\{styles\.conversationGlassBackdrop\}/);
  assert.match(liveScreen, /conversationGlass:[\s\S]+borderWidth: 0/);
  assert.match(liveScreen, /backgroundColor: 'transparent'/);
  assert.doesNotMatch(liveScreen, /conversationVideoBlend/);
  assert.match(liveScreen, /<LiveControlDock/);
  assert.match(controlDock, /publicBackground = visual\.isDark \? '#081A1791' : '#FFFDFCB8'/);
  assert.match(controlDock, /!privateMode && styles\.publicDock/);
  assert.match(liveScreen, /<LiveStudioModal/);
  assert.doesNotMatch(liveScreen, /<LiveStageDesk/);
  assert.match(liveScreen, /variant="glass"/);
  assert.match(conversationPanel, /variant\?: 'solid' \| 'glass'/);
  assert.match(conversationPanel, /variant === 'glass' && styles\.panelGlass/);
  assert.match(conversationPanel, /style=\{styles\.commentIdentityRow\}/);
  assert.match(conversationPanel, /styles\.commentBody, compact && styles\.commentBodyCompact/);
  assert.match(conversationPanel, /\(expanded \|\| inputFocused\) && styles\.listContentBottomAligned/);
  assert.match(conversationPanel, /displayMode !== 'peek'/);
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

test('stage management stays outside the public canvas in the Live Control Room', () => {
  assert.match(liveScreen, /const \[studioOpen, setStudioOpen\]/);
  assert.match(liveScreen, /openLiveStudio/);
  assert.match(liveScreen, /Control Room/);
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
  assert.match(liveScreen, /resolveLiveRoomPulseHeight\([\s\S]*viewport\.height,[\s\S]*roomPulseMode,[\s\S]*stageParticipantCount,[\s\S]*expandedRoomPulseCommentCount/);
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
  assert.match(liveScreen, /onDisplayModeChange=\{changeRoomPulseMode\}/);
  assert.match(liveScreen, /viewport\.width > viewport\.height\) setRoomPulseMode\('peek'\)/);
  assert.match(broadcastViewport, /\['peek', 'standard', 'expanded'\]/);
  assert.match(broadcastViewport, /viewportHeight < 720 \|\| viewportWidth > viewportHeight \? 'peek' : 'standard'/);
  assert.match(broadcastViewport, /mode === 'expanded'[\s\S]*stageParticipantCount >= 3/);
  assert.match(broadcastViewport, /safeHeight \* 0\.36[\s\S]*safeHeight \* 0\.38[\s\S]*safeHeight \* 0\.44/);
  assert.match(broadcastViewport, /contentHeight = 192 \+ \(visibleCommentCount \* 32\)/);
  assert.match(liveScreen, /setExpandedRoomPulseCommentCount\(controller\.commentCount\)/);
  assert.match(conversationPanel, /comments\.slice\(-2\)/);
  assert.match(conversationPanel, /displayMode === 'peek'/);
  assert.match(conversationPanel, /const nextDisplayMode: LiveRoomPulseMode/);
  assert.equal((conversationPanel.match(/style=\{styles\.expandButton\}/g) ?? []).length, 0);
  assert.match(conversationPanel, /presentation="trigger"/);
  assert.doesNotMatch(conversationPanel, /presentation="compact"/);
  assert.match(conversationPanel, /Minimize Room Pulse/);
  assert.match(conversationPanel, /Expand Room Pulse/);
  assert.match(liveScreen, /const roomPulseOverlaysStage = isFullPageSoloHost[\s\S]*roomPulseMode === 'expanded'/);
  assert.match(liveScreen, /roomPulseOverlaysStage && styles\.conversationGlassStageOverlay/);
  assert.match(liveScreen, /conversationGlassStageOverlay:\s*\{[\s\S]*position: 'absolute'/);
  assert.match(liveScreen, /roomPulseAnchorHeight = roomPulseOverlaysStage[\s\S]*standardRoomPulseHeight[\s\S]*roomPulseHeight/);
  assert.match(liveScreen, /styles\.conversationGlassAnchor[\s\S]*height: roomPulseAnchorHeight/);
  assert.match(liveScreen, /edges=\{keyboardVisible \? \['top'\] : \['top', 'bottom'\]\}/);
  assert.match(liveScreen, /conversationGlassAnchorKeyboard:[\s\S]*marginBottom: 0/);
  assert.doesNotMatch(liveScreen, /bottom: showControlDock \? 55 : 2/);
});

test('screen-only Program output follows the selected canvas and offers a focused view', () => {
  assert.match(liveScreen, /const screenOnlyProgramActive = activeProgram\?\.scene === 'screen_full'/);
  assert.doesNotMatch(liveScreen, /screenOnlyProgramActive = liveProgram\.state\?\.enabled/);
  assert.match(liveScreen, /resolveLiveScreenOnlyStageSize\(/);
  assert.match(liveScreen, /liveProgram\.state\?\.program\.targetCanvas/);
  assert.match(liveScreen, /screenShareAspectRatio/);
  assert.match(liveScreen, /onLayout=\{handleScreenStageSlotLayout\}/);
  assert.match(liveScreen, /screenStageSlotSize\.width \|\| viewport\.width/);
  assert.match(liveScreen, /\(screenStageSlotSize\.height \|\| fallbackScreenSlotHeight\) - SCREEN_STAGE_VERTICAL_GUTTER/);
  assert.match(liveScreen, /onProgramScreenAspectRatioChange=\{handleProgramScreenAspectRatioChange\}/);
  assert.match(liveScreen, /screenPresentationFocused=\{screenPresentationFocused\}/);
  assert.match(liveScreen, /onToggleScreenPresentationFocus=\{toggleScreenPresentationFocus\}/);
  assert.match(liveScreen, /screenOnlyProgramActive \? \([\s\S]*styles\.screenOnlyStageSlot/);
  assert.match(liveScreen, /<LiveScreenAmbientBackdrop dark=\{visual\.isDark\} reduceMotion=\{reduceMotion\}/);
  assert.match(liveScreen, /<View style=\{\[[\s\S]*styles\.screenOnlyStage,/);
  assert.doesNotMatch(liveScreen, /styles\.adaptiveStage,\s*styles\.screenOnlyStage,/);
  assert.match(liveScreen, /screenOnlyStageSlot:\s*\{[\s\S]*alignItems: 'center'[\s\S]*justifyContent: 'center'/);
  assert.doesNotMatch(liveScreen, /screenCanvasTopAligned|screenOnlyStageSlotTopAligned|screenOnlyAmbient/);
  assert.match(liveScreen, /screenOnlyStage:\s*\{[\s\S]*alignSelf: 'center',[\s\S]*borderRadius: 26/);
  assert.doesNotMatch(liveScreen.match(/screenOnlyStage:\s*\{[\s\S]*?\n  \},/)?.[0] ?? '', /flex:/);
  assert.match(liveScreen, /!screenOnlyProgramActive \? \([\s\S]*media\.setVideoEnabled/);
  assert.match(liveScreen, /if \(screenOnlyProgramActive && !screenOnlyProgramActiveRef\.current\)[\s\S]*changeRoomPulseMode\('peek'\)/);
  assert.match(broadcastViewport, /LIVE_SCREEN_SHARE_FALLBACK_ASPECT_RATIO = 16 \/ 9/);
  assert.match(broadcastViewport, /portrait_9_16: 9 \/ 16/);
  assert.match(broadcastViewport, /landscape_16_9: 16 \/ 9/);
  assert.match(broadcastViewport, /square_1_1: 1/);
  assert.match(broadcastViewport, /targetCanvas[\s\S]*LIVE_PROGRAM_CANVAS_ASPECT_RATIOS\[targetCanvas\]/);
  assert.match(broadcastViewport, /availableHeight \* aspectRatio/);
  assert.match(broadcastViewport, /resolveLiveScreenMediaContainment/);
  assert.match(stage, /sdk\.useTrackDimensions\(participant, 'screenShareTrack'\)/);
  assert.match(stage, /onAspectRatioChange\?\.\(aspectRatio\)/);
  assert.match(stage, /screenShareAspectRatio=\{screenShareAspectRatio\}/);
  assert.match(stage, /screenPresentationFocused=\{screenPresentationFocused\}/);
  assert.match(stage, /onToggleScreenPresentationFocus=\{onToggleScreenPresentationFocus\}/);
  assert.match(authoritativeProgramStage, /<LiveScreenPresentationSurface/);
  assert.match(authoritativeProgramStage, /fit=\{screenPresentation\?\.fit \?\? 'contain'\}/);
  assert.match(screenPresentationSurface, /fit=\{fit\}/);
  assert.doesNotMatch(screenPresentationSurface, /fit="cover"/);
  assert.doesNotMatch(screenPresentationSurface, /resolveLiveScreenMediaContainment/);
  assert.match(screenPresentationSurface, /showFooter=\{false\}/);
  assert.doesNotMatch(screenPresentationSurface, /SCREEN_CANVAS_LABELS/);
  assert.doesNotMatch(screenPresentationSurface, /sourceBadge|sourceName|sourceType/);
  assert.match(screenPresentationSurface, /SCREEN_CONTROLS_VISIBLE_MS = 3_000/);
  assert.match(screenPresentationSurface, /accessibilityLabel="Show screen controls"/);
  assert.match(screenPresentationSurface, /onPress=\{revealControls\}/);
  assert.match(screenPresentationSurface, /pointerEvents=\{controlsVisible \? 'auto' : 'none'\}/);
  assert.match(screenPresentationSurface, /focused \? Math\.max\(12, safeAreaInsets\.top \+ 8\) : 12/);
  assert.match(screenPresentationSurface, /accessibilityLabel=\{focused \? 'Exit focused screen view' : 'Focus shared screen'\}/);
  assert.match(screenPresentationSurface, /<Maximize2/);
  assert.match(screenPresentationSurface, /<Minimize2/);
  assert.match(screenAmbientBackdrop, /Animated\.loop/);
  assert.match(screenAmbientBackdrop, /duration: 7_000/);
  assert.match(screenAmbientBackdrop, /if \(reduceMotion\)/);
  assert.match(screenAmbientBackdrop, /outputRange: \[0\.08, 0\.14\]/);
  assert.match(mobileProgrammePanel, /Landscape is recommended for desktop sharing/);
  assert.match(mobileProgrammePanel, /item\.scene === 'screen_full'[\s\S]*setCanvas\('landscape_16_9'\)/);
  assert.match(participantTile, /trackType === 'screenShareTrack'/);
  assert.match(participantTile, /\? 'SCREEN'/);
  assert.match(participantTile, /!microphoneOn && !isScreenPresentation/);
  assert.match(participantTile, /showFooter \? <View pointerEvents="none" style=\{\[styles\.footer/);
});

test('Quick Connect always gives the host and pool equal stage space', () => {
  assert.match(quickConnectStage, /hostPane:\s*\{[\s\S]*?flex: 1/);
  assert.match(quickConnectStage, /poolPane:\s*\{[\s\S]*?flex: 1/);
  assert.doesNotMatch(quickConnectStage, /compactPool|poolPaneCompact/);
  assert.doesNotMatch(liveScreen, /compactPool=/);
  assert.match(liveScreen, /allowAtmosphereFraming=\{!isQuickConnectLive\}/);
  assert.match(stage, /allowAtmosphereFraming !== false/);
  assert.match(liveScreen, /roomPulseAnchorHeight/);
  assert.doesNotMatch(liveScreen, /quickConnectConversationGlass/);
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
