import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createLiveSessionLinks,
  resolveLiveLinkEnvironment,
} from '../features/live/config/live-link-environment.ts';
import { resolveStudioEnvironment } from '../apps/studio/src/lib/studio-environment-resolver.ts';

const route = readFileSync(new URL('../app/live/[sessionId].tsx', import.meta.url), 'utf8');
const studio = readFileSync(new URL('../features/live/components/LiveStudioModal.tsx', import.meta.url), 'utf8');
const reminder = readFileSync(new URL('../components/IntentResponseReminder.tsx', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../features/live/components/StreamLiveStage.tsx', import.meta.url), 'utf8');

test('global reminders never cover a Live or private Live surface', () => {
  assert.match(reminder, /pathname\.startsWith\('\/live'\)/);
  assert.match(reminder, /if \(shouldSuppress \|\| !visible \|\| !reminder\) return null/);
  assert.match(reminder, /width: '76%'/);
  assert.match(reminder, /}, 4200\)/);
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

test('Live sharing resolves isolated staging and production links', () => {
  assert.deepEqual(createLiveSessionLinks('session-1', {
    variant: 'staging',
    scheme: 'betweenerstaging',
    webOrigin: 'https://staging.getbetweener.com',
  }), {
    deepLink: 'betweenerstaging://live/session-1',
    webLink: 'https://staging.getbetweener.com/live/session-1',
  });
  assert.deepEqual(createLiveSessionLinks('session-2', {
    variant: 'production',
    scheme: 'betweenerapp',
    webOrigin: 'https://getbetweener.com',
  }), {
    deepLink: 'betweenerapp://live/session-2',
    webLink: 'https://getbetweener.com/live/session-2',
  });
  assert.throws(() => resolveLiveLinkEnvironment({ variant: 'preview' }));
});

test('Studio environment resolution is explicit and rejects cross-environment resources', () => {
  assert.equal(resolveStudioEnvironment({
    environment: 'staging',
    supabaseUrl: 'https://xsgzxadwuxuziubglvps.supabase.co',
    supabasePublicKey: 'publishable-test-key',
    publicAppOrigin: 'https://staging.getbetweener.com',
    studioOrigin: 'https://studio.staging.getbetweener.com',
  }).environment, 'staging');

  assert.throws(() => resolveStudioEnvironment({
    environment: 'staging',
    supabaseUrl: 'https://jbyblhithbqwojhwlenv.supabase.co',
    supabasePublicKey: 'publishable-test-key',
    publicAppOrigin: 'https://getbetweener.com',
    studioOrigin: 'https://getbetweener.com',
  }));
  assert.doesNotMatch(readFileSync(
    new URL('../apps/studio/src/lib/environment.ts', import.meta.url),
    'utf8',
  ), /import\.meta\.env\s*\[/u);
});

test('iOS PiP delegates controls to the native video-call controller', () => {
  assert.match(stage, /<RTCViewPipIOS/);
  assert.match(stage, /onPiPChange=\{onModeChange\}/);
  assert.match(stage, /Platform\.OS !== 'ios'/);
});
