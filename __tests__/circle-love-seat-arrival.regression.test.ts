import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const circleScreen = read('app/circles/[id].tsx');
const pulseHook = read('lib/circles/pulse/use-circle-pulse.ts');
const realtimeTopic = read('lib/realtime/realtime-channel-topic.ts');
const arrivalHook = read('lib/circles/pulse/use-circle-love-seat-arrival.ts');
const arrivalPrompt = read('components/circles/CircleLoveSeatArrivalPrompt.tsx');
const requestCard = read('components/circles/CircleLoveSeatRequestCard.tsx');
const pulseBoard = read('components/circles/CirclePulseBoard.tsx');
const invalidationHook = read('lib/circles/pulse/use-circle-love-seat-invalidation.ts');

test('Circle Pulse creates a fresh Realtime topic before registering callbacks', () => {
  assert.match(pulseHook, /createEphemeralRealtimeTopic\(`circle-pulse-items:\$\{circleId\}`\)/);
  assert.match(realtimeTopic, /Date\.now\(\)\.toString\(36\)/);
  assert.match(realtimeTopic, /ephemeralTopicSequence/);
  assert.match(pulseHook, /\.on\([\s\S]*\.subscribe\(\)/);
  assert.match(pulseHook, /void supabase\.removeChannel\(channel\)/);
});

test('private Love Seat requests use the original ceremonial chair asset', () => {
  assert.match(requestCard, /chair-front\.png/);
  assert.match(requestCard, /source=\{chairFront\}/);
  assert.doesNotMatch(requestCard, /name=\{queued \? 'shield-check-outline' : 'seat-outline'\}/);
});

test('active Love Seats receive a one-time viewer-scoped arrival prompt', () => {
  assert.match(arrivalHook, /circle-love-seat-arrival:v1/);
  assert.match(arrivalHook, /viewerProfileId.*circleId.*loveSeatId/s);
  assert.match(arrivalHook, /AsyncStorage\.getItem\(storageKey\)/);
  assert.match(arrivalHook, /AsyncStorage\.setItem\(storageKey/);
  assert.match(arrivalHook, /rpc_acknowledge_circle_love_seat_arrival_v1|acknowledgeCircleLoveSeatArrival/);
  assert.match(arrivalPrompt, /CircleLoveSeatCeremony/);
  assert.doesNotMatch(pulseBoard, /CircleLoveSeatCeremony/);
  assert.match(pulseBoard, /CircleLoveSeatPortrait/);
  assert.match(arrivalPrompt, /See the Love Seat/);
  assert.match(circleScreen, /activeLoveSeatItem/);
  assert.match(circleScreen, /featuredProfileId !== currentProfileId/);
  assert.match(circleScreen, /setCircleSection\('pulse'\)/);
});

test('Love Seat updates are content-free invalidations followed by authorized refetches', () => {
  assert.match(invalidationHook, /table: 'circle_love_seat_updates'/);
  assert.match(invalidationHook, /reloadRef\.current\(\)/);
  assert.doesNotMatch(invalidationHook, /payload\.(new|old)/);
});

test('private requests preserve an optional bounded host note', () => {
  assert.match(requestCard, /maxLength=\{500\}/);
  assert.match(requestCard, /visible only to Circle hosts/);
  assert.match(requestCard, /await onJoinQueue\(note\)/);
});
