import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/live/[sessionId].tsx', import.meta.url), 'utf8');
const studio = readFileSync(new URL('../features/live/components/LiveStudioModal.tsx', import.meta.url), 'utf8');
const reminder = readFileSync(new URL('../components/IntentResponseReminder.tsx', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../features/live/components/StreamLiveStage.tsx', import.meta.url), 'utf8');

test('global reminders never cover a Live or private Live surface', () => {
  assert.match(reminder, /pathname\.startsWith\('\/live'\)/);
  assert.match(reminder, /if \(shouldSuppress \|\| !visible \|\| !reminder\) return null/);
});

test('host operations are consolidated in one full-screen Live Studio', () => {
  assert.match(studio, /presentationStyle="fullScreen"/);
  ['stage', 'match', 'pulse', 'invite'].forEach((tab) => {
    assert.match(studio, new RegExp(`${tab}: \\{ label:`));
  });
  assert.match(studio, /LiveStageDesk/);
  assert.match(studio, /LiveHostedMatchingPanel/);
  assert.match(studio, /LiveAudiencePulseCard/);
  assert.match(studio, /Share\.share/);
  assert.doesNotMatch(route, /<LiveStageDesk/);
});

test('iOS PiP delegates controls to the native video-call controller', () => {
  assert.match(stage, /<RTCViewPipIOS/);
  assert.match(stage, /onPiPChange=\{onModeChange\}/);
  assert.match(stage, /Platform\.OS !== 'ios'/);
});
