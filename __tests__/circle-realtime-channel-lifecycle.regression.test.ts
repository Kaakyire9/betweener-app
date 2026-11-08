import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createEphemeralRealtimeTopic } from '../lib/realtime/realtime-channel-topic.ts';

const read = (path: string) => readFileSync(path, 'utf8');

const circleScreen = read('app/circles/[id].tsx');
const invitationCount = read('lib/circles/use-circle-invitation-count.ts');
const invitationInbox = read('components/circles/CircleInvitationInbox.tsx');
const pulse = read('lib/circles/pulse/use-circle-pulse.ts');
const pulseComments = read('lib/circles/pulse/use-circle-pulse-comments.ts');

test('ephemeral Realtime topics are unique while preserving their diagnostic prefix', () => {
  const first = createEphemeralRealtimeTopic('circle-moments:circle-1');
  const second = createEphemeralRealtimeTopic('circle-moments:circle-1');

  assert.match(first, /^circle-moments:circle-1:/);
  assert.match(second, /^circle-moments:circle-1:/);
  assert.notEqual(first, second);
});

test('Circle Postgres Changes subscriptions never reuse a mounted topic', () => {
  assert.match(circleScreen, /createEphemeralRealtimeTopic\(`circle-moments:\$\{circleId\}`\)/);
  assert.match(invitationCount, /createEphemeralRealtimeTopic\(`circle-invitations:\$\{profileId\}`\)/);
  assert.match(invitationInbox, /createEphemeralRealtimeTopic\(`circle-invitations:inbox:\$\{profileId\}`\)/);
  assert.match(pulse, /createEphemeralRealtimeTopic\(`circle-pulse-items:\$\{circleId\}`\)/);
  assert.match(pulseComments, /createEphemeralRealtimeTopic\(`circle-pulse-comments:\$\{itemId\}/);
});

test('shared Circle Broadcast and Presence topics remain stable across clients', () => {
  assert.match(pulseComments, /channel\(`circle-pulse-comment-events:\$\{itemId\}`\)/);
  const liveDiscussion = read('lib/circles/pulse/use-circle-pulse-live-discussion.ts');
  assert.match(liveDiscussion, /channel\(`circle-pulse-discussion:\$\{itemId\}`/);
  assert.doesNotMatch(liveDiscussion, /createEphemeralRealtimeTopic/);
});
