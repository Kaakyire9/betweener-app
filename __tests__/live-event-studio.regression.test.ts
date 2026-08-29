import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260826100000_live_event_studio.sql', 'utf8');
const scheduleScreen = readFileSync('app/live/schedule.tsx', 'utf8');
const studioScreen = readFileSync('app/live/index.tsx', 'utf8');
const eventScreen = readFileSync('app/live/event/[sessionId].tsx', 'utf8');
const backstageScreen = readFileSync('app/live/backstage/[sessionId].tsx', 'utf8');

test('the database prevents a scheduled Live from starting early', () => {
  assert.match(migration, /create or replace function public\.enforce_live_session_start_time/i);
  assert.match(migration, /live_session_not_due/i);
  assert.match(migration, /before update of status on public\.live_sessions/i);
});

test('event promotional media is owner controlled and server bound', () => {
  assert.match(migration, /live-event-media/i);
  assert.match(migration, /rpc_update_live_event_media/i);
  assert.match(migration, /created_by_user_id <> auth\.uid\(\)/i);
  assert.match(migration, /storage\.objects/i);
  assert.match(migration, /live_event_poster_type_invalid/i);
  assert.match(migration, /live_event_teaser_type_invalid/i);
  assert.match(migration, /live_event_teaser_duration_required/i);
});

test('event creation returns to the Studio and Studio exposes lifecycle sections', () => {
  assert.match(scheduleScreen, /router\.replace\('\/live'\)/);
  assert.match(studioScreen, /Live now/);
  assert.match(studioScreen, /Upcoming Live/);
  assert.match(studioScreen, /Past Live/);
  assert.match(studioScreen, /useFocusEffect/);
  assert.match(studioScreen, /refresh\(\{ attemptRecovery: false \}\)/);
});

test('the event catalogue is lifecycle ordered without polling', () => {
  assert.match(migration, /s\.status not in \('live','ending','ended','cancelled'\)[\s\S]*?end asc/i);
  assert.doesNotMatch(studioScreen, /setInterval|setTimeout/);
});

test('event details support reservations, countdown and outcome metrics', () => {
  assert.match(eventScreen, /Save my place/);
  assert.match(eventScreen, /places saved/);
  assert.match(eventScreen, /matches made/);
  assert.match(eventScreen, /formatLiveCountdown/);
});

test('backstage mirrors the server start-time guard before enabling the host CTA', () => {
  assert.match(backstageScreen, /stageIsDue/);
  assert.match(backstageScreen, /Available in/);
  assert.match(backstageScreen, /live_session_not_due/);
});
