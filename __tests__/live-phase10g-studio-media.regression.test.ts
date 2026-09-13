import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const token = readFileSync('supabase/functions/live-studio-media-token/index.ts', 'utf8');
const disconnect = readFileSync('supabase/functions/live-studio-disconnect/index.ts', 'utf8');
const tokenDeno = readFileSync('supabase/functions/live-studio-media-token/deno.json', 'utf8');
const controls = readFileSync('apps/studio/src/media/StudioMediaControls.tsx', 'utf8');
const dj = readFileSync('apps/studio/src/media/StudioDjSource.tsx', 'utf8');
const stage = readFileSync('features/live/components/StreamLiveStage.tsx', 'utf8');
const programStage = readFileSync('features/live/components/LiveAuthoritativeProgramStage.tsx', 'utf8');
const liveScreen = readFileSync('app/live/[sessionId].tsx', 'utf8');
const workspace = readFileSync('apps/studio/src/workspace/StudioWorkspace.tsx', 'utf8');
const studioMediaContext = readFileSync('apps/studio/src/media/studio-media-context.tsx', 'utf8');
const programmeAudioMigration = readFileSync(
  'supabase/migrations/20260912180000_live_program_audio_publisher.sql',
  'utf8',
);
const programmeAudioService = readFileSync(
  'supabase/functions/live-program-audio-publisher/index.ts',
  'utf8',
);
const programmeAudioWorker = readFileSync('apps/program-audio-worker/src/worker.mjs', 'utf8');
const programmeAudioCore = readFileSync('apps/program-audio-worker/src/program-audio.mjs', 'utf8');
const musicPanel = readFileSync('features/live/components/LiveMusicLibraryPanel.tsx', 'utf8');
const musicProgramStage = readFileSync('features/live/components/LiveMusicProgramStage.tsx', 'utf8');
const odoProgramStage = readFileSync('features/live/components/OdoProgramStage.tsx', 'utf8');
const programVisualSource = readFileSync('features/live/components/LiveProgramVisualSource.tsx', 'utf8');
const programRenderer = readFileSync('apps/studio/src/program/ProgramRenderer.tsx', 'utf8');
const studioStyles = readFileSync('apps/studio/src/styles.css', 'utf8');

const allFiles = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
  const path = join(root, entry.name);
  return entry.isDirectory() ? allFiles(path) : [path];
});

test('Studio media token is call-scoped and permission-minimal', () => {
  assert.match(tokenDeno, /npm:@stream-io\/node-sdk@0\.7\.63/i);
  assert.match(tokenDeno, /npm:@supabase\/supabase-js@2\.110\.7/i);
  assert.match(token, /generateCallToken\(\{[\s\S]*call_cids: \[callCid\]/i);
  assert.match(token, /grant_permissions: grants/i);
  assert.match(token, /revoke_permissions:/i);
  assert.match(token, /providerUserId\.startsWith\('studio-'\)/i);
  assert.doesNotMatch(token, /SUPABASE_SERVICE_ROLE_KEY[\s\S]*return json/i);
  assert.doesNotMatch(token, /VIDEO_API_SECRET[^\n]*json\(/i);
});

test('Host disconnect revokes Studio publishing and evicts browser transports', () => {
  const authority = disconnect.indexOf("rpc_host_disconnect_live_studio_v1");
  const revoke = disconnect.indexOf('updateUserPermissions');
  const kick = disconnect.indexOf('kickUser');
  assert.ok(authority >= 0 && revoke > authority && kick > revoke);
  assert.match(disconnect, /revoke_permissions: \['send-audio', 'send-video', 'screenshare'\]/i);
  assert.match(disconnect, /providerSyncPending/i);
  assert.match(disconnect, /Re-run the idempotent cleanup after provider eviction/i);
  assert.match(studioMediaContext, /call\.on\('call\.kicked_user'/i);
  assert.match(studioMediaContext, /Studio media was disconnected by the Live host/i);
  assert.match(dj, /DJ input was disconnected by the Live host/i);
});

test('screen sharing is explicit and admitted screen audio stays healthy with honest browser feedback', () => {
  assert.match(controls, /setIncludeScreenAudio\(true\)/i);
  assert.match(controls, /capabilities\.screenShareAudio/i);
  assert.match(controls, /distributed-audio mode/i);
  assert.match(controls, /screenShare\.enable\(\)/i);
  assert.match(controls, /if \(screenAudioOn\)[\s\S]*screen_share_audio/i);
  assert.match(controls, /browser did not provide laptop audio/i);
  assert.match(controls, /Share tab audio/i);
  assert.match(controls, /Screen audio is published/i);
  assert.match(controls, /useAudioMeter\([\s\S]*screenShare\.state\.mediaStream/i);
  assert.match(controls, /screen_share_ended_by_browser/i);
  assert.match(controls, /stoppingScreenRef/i);
  assert.match(controls, /visibilitychange/i);
  assert.match(controls, /Promise\.allSettled/i);
});

test('DJ input uses an isolated provider and stays silent until assigned to Program', () => {
  assert.match(dj, /new StreamVideoClient/i);
  assert.match(dj, /registerVirtualDevice/i);
  assert.match(dj, /echoCancellation: false/i);
  assert.match(dj, /muted \|\| !inProgram \? 0 : volume/i);
  assert.match(dj, /audio_atmosphere === key/i);
  assert.match(dj, /dj_input_disconnected/i);
  assert.match(dj, /not the uploaded Programme Music catalogue/i);
  assert.match(dj, /Refresh audio inputs/i);
});

test('Studio has separate Preview and Program with an explicit TAKE path', () => {
  assert.match(workspace, /PREVIEW/i);
  assert.match(workspace, /Local to this tab/i);
  assert.match(workspace, /PROGRAM/i);
  assert.match(workspace, /Audience output/i);
  assert.match(workspace, /buildStudioTakeCommand/i);
  assert.match(workspace, /stalePreview/i);
});

test('Studio monitors preview the same cut, auto, and fade choreography without remounting video', () => {
  assert.match(programRenderer, /transitionCue\(state, label\)/);
  assert.match(programRenderer, /program-transition-\$\{state\.transition\}/);
  assert.match(programRenderer, /key=\{`\$\{version\}:\$\{state\.scene\}:\$\{state\.transition\}`\}/);
  assert.match(studioStyles, /\.program-transition-cut/);
  assert.match(studioStyles, /\.program-transition-fade/);
  assert.match(studioStyles, /@keyframes program-transition-auto/);
  assert.doesNotMatch(programRenderer, /ParticipantView[\s\S]{0,180}programVersion/);
});

test('Studio transport identities never become public stage seats or room headcount', () => {
  assert.match(stage, /!participant\.userId\.startsWith\('studio-'\)/i);
  assert.match(programStage, /trackType === 'screenShareTrack'/i);
  assert.match(programStage, /isStudioPresentationScene/i);
});

test('Programme Music has one fenced and invisible Stream publisher per Live', () => {
  assert.match(programmeAudioMigration, /session_id uuid primary key/i);
  assert.match(programmeAudioMigration, /pg_advisory_xact_lock/i);
  assert.match(programmeAudioMigration, /program_audio_lease_lost/i);
  assert.match(programmeAudioMigration, /system:programme_audio/i);
  assert.match(programmeAudioMigration, /central_program_audio_required/i);
  assert.match(programmeAudioMigration, /license_status <> 'approved'/i);
  assert.match(programmeAudioMigration, /rpc_service_complete_live_program_audio_v1/i);
  assert.match(programmeAudioMigration, /program_audio_repeat_all_advanced/i);
  assert.match(programmeAudioService, /x-program-audio-worker-token/i);
  assert.match(programmeAudioService, /constantTimeEqual/i);
  assert.match(programmeAudioService, /generateUserToken/i);
  assert.match(programmeAudioService, /ingress\?\.rtmp\?\.address/i);
  assert.match(programmeAudioService, /grant_permissions: \['send-audio'\]/i);
});

test('Programme Audio worker publishes audio only and changes Duck gain without restarting', () => {
  assert.match(programmeAudioCore, /'-vn'/i);
  assert.doesNotMatch(programmeAudioCore, /libx264/i);
  assert.match(programmeAudioService, /revoke_permissions: \['send-video', 'screenshare'\]/i);
  assert.match(programmeAudioCore, /volume@programme=/i);
  assert.match(programmeAudioCore, /azmq=/i);
  assert.match(programmeAudioWorker, /gain-control\.py/i);
  assert.match(programmeAudioWorker, /sameTransport/i);
  assert.match(programmeAudioWorker, /await this\.setGain\(state, claim\.volume\)/i);
  assert.match(programmeAudioWorker, /maximumSessions/i);
  assert.match(liveScreen, /allowMusicPlayback: false/i);
});

test('Host can present a visual-only Now Playing stage without creating another music engine', () => {
  assert.match(musicPanel, /Show music on stage/i);
  assert.match(musicPanel, /Return people to stage/i);
  assert.match(musicPanel, /setMusicStageVisible/i);
  assert.match(odoProgramStage, /<LiveMusicProgramStage music=\{program\.music\}/i);
  assert.match(musicProgramStage, /Betweener Music/i);
  assert.match(musicProgramStage, /HOST MIC READY FOR INTRODUCTIONS/i);
  assert.match(musicProgramStage, /backgroundColor: '#031915'/i);
  assert.match(musicProgramStage, /top: 0[\s\S]*bottom: 0/i);
  assert.match(musicProgramStage, /zIndex: 4/i);
  assert.match(musicProgramStage, /pointerEvents="none"/i);
  assert.match(musicProgramStage, /AccessibilityInfo\.isReduceMotionEnabled/i);
  assert.doesNotMatch(musicProgramStage, /ExpoLiveMusicEngine|AudioPlayer|createAudioPlayer/i);
});

test('mobile Program is confined to Stage and never replaces Live chrome', () => {
  assert.match(programStage, /root:\s*\{[\s\S]*top: 0[\s\S]*bottom: 0/i);
  assert.match(programStage, /program\.scene, program\.targetCanvas, program\.sourceAssignments/i);
  assert.doesNotMatch(programStage, /root:\s*\{[\s\S]*zIndex: 5/i);
  assert.match(liveScreen, /safe:\s*\{ position: 'relative', zIndex: 10, flex: 1 \}/i);
  assert.match(liveScreen, /adaptiveStage:\s*\{ flex: 1, minHeight: 150/i);
  assert.match(liveScreen, /<LiveCompactHeader/i);
  assert.match(liveScreen, /<LiveConversationPanel/i);
  assert.match(liveScreen, /<LiveControlDock/i);
});

test('mobile Program renders server-owned pool, pair, Pulse, and Odo sources intentionally', () => {
  assert.match(programStage, /<LiveProgramVisualSource source=\{source\}/);
  assert.match(programStage, /source\?\.type === 'active_pair'/);
  assert.match(programStage, /styles\.pairGrid/);
  assert.match(programVisualSource, /quick_connect_pool/);
  assert.match(programVisualSource, /audience_pulse/);
  assert.match(programVisualSource, /odo_stage/);
});

test('Studio browser bundle cannot import Private Spark implementation', () => {
  const source = allFiles('apps/studio/src')
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1] ?? match[2])
    .join('\n');
  assert.doesNotMatch(importSpecifiers, /private[-_/]spark|compatibility[_-]edge|decision[_-]graph/i);
});
