import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const token = readFileSync('supabase/functions/live-studio-media-token/index.ts', 'utf8');
const tokenDeno = readFileSync('supabase/functions/live-studio-media-token/deno.json', 'utf8');
const controls = readFileSync('apps/studio/src/media/StudioMediaControls.tsx', 'utf8');
const dj = readFileSync('apps/studio/src/media/StudioDjSource.tsx', 'utf8');
const stage = readFileSync('features/live/components/StreamLiveStage.tsx', 'utf8');
const programStage = readFileSync('features/live/components/LiveAuthoritativeProgramStage.tsx', 'utf8');
const workspace = readFileSync('apps/studio/src/workspace/StudioWorkspace.tsx', 'utf8');

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

test('screen sharing is explicit and screen audio defaults off with honest capability copy', () => {
  assert.match(controls, /useState\(false\)/i);
  assert.match(controls, /capabilities\.screenShareAudio/i);
  assert.match(controls, /distributed-audio mode/i);
  assert.match(controls, /screenShare\.enable\(\)/i);
  assert.match(controls, /screen_share_ended_by_browser/i);
});

test('DJ input uses an isolated provider and stays silent until assigned to Program', () => {
  assert.match(dj, /new StreamVideoClient/i);
  assert.match(dj, /registerVirtualDevice/i);
  assert.match(dj, /echoCancellation: false/i);
  assert.match(dj, /muted \|\| !inProgram \? 0 : volume/i);
  assert.match(dj, /audio_atmosphere === key/i);
  assert.match(dj, /dj_input_disconnected/i);
});

test('Studio has separate Preview and Program with an explicit TAKE path', () => {
  assert.match(workspace, /PREVIEW/i);
  assert.match(workspace, /Local to this tab/i);
  assert.match(workspace, /PROGRAM/i);
  assert.match(workspace, /Audience output/i);
  assert.match(workspace, /buildStudioTakeCommand/i);
  assert.match(workspace, /stalePreview/i);
});

test('Studio transport identities never become public stage seats or room headcount', () => {
  assert.match(stage, /!participant\.userId\.startsWith\('studio-'\)/i);
  assert.match(programStage, /trackType === 'screenShareTrack'/i);
  assert.match(programStage, /isStudioPresentationScene/i);
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
