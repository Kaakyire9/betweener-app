import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseCircleLiveSnapshot } from '../features/live/application/live-parsers.ts';

const migration = readFileSync('supabase/migrations/20260830113000_live_phase9_circle_integration.sql', 'utf8');
const circleScreen = readFileSync('app/circles/[id].tsx', 'utf8');
const scheduleScreen = readFileSync('app/live/schedule.tsx', 'utf8');
const component = readFileSync('features/live/components/CircleLiveSection.tsx', 'utf8');
const pulseBoard = readFileSync('components/circles/CirclePulseBoard.tsx', 'utf8');
const repository = readFileSync('features/live/application/live-repository.ts', 'utf8');

test('Circle Gatherings reference Live without duplicating lifecycle state', () => {
  assert.match(migration, /add column if not exists live_session_id uuid references public\.live_sessions/i);
  assert.match(migration, /gatherings_live_session_unique_idx/i);
  assert.doesNotMatch(migration, /add column if not exists live_(status|quorum_status)/i);
  assert.match(migration, /'circle_lifecycle_authority', 'live_sessions'/i);
});

test('Circle hosts schedule a circle-context session and linked Pulse Gathering atomically', () => {
  assert.match(migration, /rpc_schedule_circle_live_session/i);
  assert.match(migration, /'circle_live', 'circle', p_circle_id/i);
  assert.match(migration, /insert into public\.gatherings/i);
  assert.match(migration, /insert into public\.circle_pulse_items/i);
  assert.match(scheduleScreen, /scheduleCircle/);
  assert.match(scheduleScreen, /minimumParticipants/);
});

test('Circle Live exposes empty, quorum, confirmed, live, and recap presentation states', () => {
  assert.match(circleScreen, /\['live', 'Live'\]/);
  assert.match(component, /No Circle Live scheduled/);
  assert.match(component, /ALMOST READY/);
  assert.match(component, /TONIGHT IS CONFIRMED/);
  assert.match(component, /LIVE NOW/);
  assert.match(component, /LIVE RECAP/);
  assert.match(component, /Starts in/);
  assert.doesNotMatch(component, /declined|rejected|rejection/i);
});

test('linked Pulse Gatherings use the Live quorum instead of duplicate attendance', () => {
  assert.match(circleScreen, /liveGatheringsById/);
  assert.match(pulseBoard, /Upcoming Circle Live/);
  assert.match(pulseBoard, /places saved/);
  assert.match(pulseBoard, /Save a place/);
  assert.match(pulseBoard, /selectedLiveGathering\.viewerRsvpStatus === 'going' \? 'Open Live'/);
});

test('Circle Live invalidations contain no participant or consent content', () => {
  assert.match(migration, /create table public\.live_circle_updates/i);
  assert.match(migration, /circle_id uuid primary key[\s\S]*version bigint[\s\S]*updated_at timestamptz/i);
  assert.doesNotMatch(migration.match(/create table public\.live_circle_updates[\s\S]*?\);/i)?.[0] ?? '', /profile|participant|decision|consent/i);
  assert.match(repository, /subscribeCircleLive/);
});

test('Love Seat Live provenance requires explicit introduction consent', () => {
  assert.match(migration, /origin_live_session_id uuid references public\.live_sessions/i);
  assert.match(migration, /rpc_nominate_circle_love_seat_from_live/i);
  assert.match(migration, /lp\.open_to_introductions/i);
  assert.match(migration, /live_love_seat_consent_required/i);
  assert.doesNotMatch(migration, /like_count|popularity|ranking/i);
});

test('Circle snapshot parser preserves only audience-safe card metrics', () => {
  const snapshot = parseCircleLiveSnapshot({
    circle_id: 'circle',
    can_schedule: true,
    server_now: '2026-08-30T12:00:00.000Z',
    sessions: [{
      session_id: 'session', gathering_id: 'gathering', title: 'Sunday Circle Live',
      description: 'Warm introductions.', status: 'confirmed', scheduled_start: '2026-08-30T20:00:00.000Z',
      ended_at: null, poster_path: null, attendance_count: 4, minimum_attendance: 4,
      quorum_status: 'confirmed', matches_made_count: 0, total_attendee_count: 0,
      viewer_rsvp_status: 'going', is_host: false,
    }],
  });
  assert.equal(snapshot.canSchedule, true);
  assert.equal(snapshot.sessions[0]?.quorumStatus, 'confirmed');
  assert.equal(snapshot.sessions[0]?.attendanceCount, 4);
  assert.equal(snapshot.sessions[0]?.viewerRsvpStatus, 'going');
});
